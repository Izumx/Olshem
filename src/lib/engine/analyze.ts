import type {
  Analysis,
  Cube,
  Dataset,
  Decision,
  Diagnosis,
  Edge,
  Level,
  Settings,
  TextbookResult,
  TopicResult,
  TopicSlope,
  Validation,
} from './types';
import { DEFAULT_PLAN, DEFAULT_SETTINGS } from './types';
import { invert, mean, pearson, sd, sum, tCrit, variance } from './stats';
import { buildCube } from './cube';
import { compareTextbooks } from './textbooks';
import { buildModel, buildPlan, estimateSlopes } from './hours';

const MIN_TOPICS_WITHOUT_BASELINE = 6;

/**
 * Finds which earlier topic a later one leans on. Both scores are compared
 * after removing what the student's other topics already predict, so general
 * ability does not read as a dependency.
 */
export function findDependencies(cube: Cube, threshold: number): Edge[] {
  const T = cube.topics.length;
  const edges: Edge[] = [];
  const candidates = new Map<number, Edge[]>();
  // With few topics and no entry score, general ability cannot be separated out.
  if (!cube.hasBaseline && T < MIN_TOPICS_WITHOUT_BASELINE) return edges;

  const stats = cube.students.map((s) => {
    let total = 0;
    let count = 0;
    for (let t = 0; t < T; t++) {
      if (!Number.isNaN(s[t])) {
        total += s[t];
        count++;
      }
    }
    return { total, count };
  });

  /** What is left of y after removing everything the control variables predict. */
  const residual = (y: number[], controls: number[][]) => {
    const k = controls.length ? controls[0].length : 0;
    const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const xty = new Array<number>(k).fill(0);
    controls.forEach((row, i) => {
      for (let a = 0; a < k; a++) {
        xty[a] += row[a] * y[i];
        for (let b = 0; b < k; b++) xtx[a][b] += row[a] * row[b];
      }
    });
    const inv = invert(xtx);
    if (!inv) return y.map((v) => v - mean(y));
    const beta = inv.map((r) => r.reduce((s, v, j) => s + v * xty[j], 0));
    return y.map((v, i) => v - controls[i].reduce((s, c, j) => s + c * beta[j], 0));
  };

  for (let b = 1; b < T; b++) {
    for (let a = 0; a < b; a++) {
      const A: number[] = [];
      const B: number[] = [];
      const Z: number[][] = [];
      let masteredYes = 0;
      let totalYes = 0;
      let masteredNo = 0;
      let totalNo = 0;
      cube.students.forEach((s, i) => {
        const x = s[a];
        const y = s[b];
        if (Number.isNaN(x) || Number.isNaN(y) || stats[i].count < 3) return;
        A.push(x);
        B.push(y);
        const others = (stats[i].total - x - y) / (stats[i].count - 2);
        const entry = cube.studentBaselines[i];
        Z.push(cube.hasBaseline ? [1, others, Number.isNaN(entry) ? others : entry] : [1, others]);
        if (x >= threshold) {
          totalYes++;
          if (y >= threshold) masteredYes++;
        } else {
          totalNo++;
          if (y >= threshold) masteredNo++;
        }
      });
      if (A.length < 30 || totalYes < 10 || totalNo < 10) continue;
      const ra = residual(A, Z);
      const rb = residual(B, Z);
      const r = pearson(ra, rb);
      if (r < 0.15) continue;
      const list = candidates.get(b) ?? [];
      list.push({
        from: cube.topics[a].id,
        to: cube.topics[b].id,
        r,
        rho: Math.min(0.9, (r * sd(rb)) / (sd(ra) || 1)),
        masteredIf: masteredYes / totalYes,
        masteredIfNot: masteredNo / totalNo,
      });
      candidates.set(b, list);
    }
  }

  for (const list of candidates.values()) {
    list.sort((x, y) => y.r - x.r);
    edges.push(list[0]);
    if (list[1] && list[1].r >= 0.6 * list[0].r) edges.push(list[1]);
  }
  return edges;
}

function levelOf(rate: number): Level {
  if (rate < 0.35) return 'critical';
  if (rate < 0.55) return 'hard';
  if (rate < 0.8) return 'ok';
  return 'easy';
}

function pooledStudentSd(cube: Cube): number {
  const values: number[] = [];
  for (const s of cube.students) {
    const present = [...s].filter((v) => !Number.isNaN(v));
    if (present.length) values.push(mean(present));
  }
  return sd(values);
}

function analyzeTopics(cube: Cube, settings: Settings, edges: Edge[], slopes: TopicSlope[], books: TextbookResult): TopicResult[] {
  const results: TopicResult[] = cube.topics.map((topic, t) => {
    const classMeans: number[] = [];
    const relative: number[] = [];
    const noise: number[] = [];
    const dose: { hours: number; score: number }[] = [];
    const byBook = new Map<string, number[]>();
    let n = 0;
    let weighted = 0;
    const hoursSeen: number[] = [];

    const slope = slopes.find((s) => s.topicId === topic.id)?.slope ?? 0;
    const lnHours = cube.cells.flatMap((row) => (row[t]?.hours ? [Math.log(row[t]!.hours as number)] : []));
    const meanLn = lnHours.length ? mean(lnHours) : 0;

    cube.cells.forEach((row, c) => {
      const cell = row[t];
      if (!cell) return;
      classMeans.push(cell.mean);
      n += cell.n;
      weighted += cell.mean * cell.n;
      const others = row.filter((x, j) => x && j !== t) as { mean: number }[];
      const rel = cell.mean - (others.length ? mean(others.map((o) => o.mean)) : cell.mean);
      relative.push(rel);
      noise.push(cell.n > 0 ? cell.variance / cell.n : 0);
      const book = cube.classes[c].textbook;
      // Differences already explained by hours are not differences in teaching.
      const net = cell.hours ? rel - Math.max(0, slope) * (Math.log(cell.hours) - meanLn) : rel;
      byBook.set(book, [...(byBook.get(book) ?? []), net]);
      if (cell.hours !== null) {
        hoursSeen.push(cell.hours);
        dose.push({ hours: cell.hours, score: cell.mean });
      }
    });

    const scores: number[] = [];
    const histogram = new Array<number>(10).fill(0);
    let mastered = 0;
    for (const s of cube.students) {
      const v = s[t];
      if (Number.isNaN(v)) continue;
      scores.push(v);
      histogram[Math.min(9, Math.floor(v / 10))]++;
      if (v >= settings.masteryThreshold) mastered++;
    }

    const se = sd(classMeans) / Math.sqrt(classMeans.length || 1);
    const crit = tCrit(Math.max(classMeans.length - 1, 1));
    const m = n ? weighted / n : NaN;

    const withinBook = [...byBook.values()].flatMap((vals) => {
      const mv = mean(vals);
      return vals.map((v) => v - mv);
    });
    const excess = Math.max(0, variance(withinBook) - mean(noise));
    const rate = scores.length ? mastered / scores.length : 0;

    return {
      id: topic.id,
      order: topic.order,
      name: topic.name,
      n: scores.length,
      mean: m,
      low: m - crit * se,
      high: m + crit * se,
      masteredRate: rate,
      relative: mean(relative),
      spread: Math.sqrt(excess),
      classMin: Math.min(...classMeans),
      classMax: Math.max(...classMeans),
      histogram,
      level: levelOf(rate),
      diagnosis: null,
      predecessors: edges.filter((e) => e.to === topic.id).sort((a, b) => b.r - a.r),
      successors: edges.filter((e) => e.from === topic.id).sort((a, b) => b.r - a.r),
      slope: slopes.find((s) => s.topicId === topic.id) ?? null,
      currentHours: hoursSeen.length ? Math.round([...hoursSeen].sort((a, b) => a - b)[Math.floor(hoursSeen.length / 2)]) : null,
      dose,
    };
  });

  const levels = new Map(results.map((r) => [r.id, r.level]));
  const isHard = (l: Level | undefined) => l === 'critical' || l === 'hard';
  const avgAdjusted = mean(books.stats.map((s) => s.adjMean));
  const overallEffect = new Map(books.stats.map((s) => [s.name, s.adjMean - avgAdjusted]));

  for (const topic of results) {
    if (!isHard(topic.level)) continue;
    const root = topic.predecessors.find((e) => e.r >= 0.25 && isHard(levels.get(e.from)));
    const cells = books.cells.filter((c) => c.topicId === topic.id);
    const hasBookEffect = cells.some((c) => c.significant);
    let gap = 0;
    let topicSpecific = 0;
    let best = '';
    let worst = '';
    if (cells.length > 1) {
      const sorted = [...cells].sort((a, b) => b.effect - a.effect);
      best = sorted[0].textbook;
      worst = sorted[sorted.length - 1].textbook;
      gap = sorted[0].effect - sorted[sorted.length - 1].effect;
      // A book that is stronger everywhere says nothing about this topic.
      const beyondOverall = cells.map((c) => c.effect - (overallEffect.get(c.textbook) ?? 0));
      topicSpecific = Math.max(...beyondOverall) - Math.min(...beyondOverall);
    }

    let diagnosis: Diagnosis;
    if (root) {
      diagnosis = { kind: 'cascade', rootId: root.from, r: root.r, masteredIf: root.masteredIf, masteredIfNot: root.masteredIfNot };
    } else if (hasBookEffect && topicSpecific >= 6) {
      diagnosis = { kind: 'textbook', best, worst, gap };
    } else if (topic.spread >= 5) {
      diagnosis = { kind: 'teaching', spread: topic.spread, bestClass: topic.classMax, worstClass: topic.classMin };
    } else if (topic.slope?.responsive) {
      diagnosis = { kind: 'hours', gainAt30: topic.slope.gainAt30 };
    } else {
      diagnosis = { kind: 'program' };
    }
    topic.diagnosis = diagnosis;
  }
  return results;
}

function buildDecisions(topics: TopicResult[], books: TextbookResult, plan: Analysis['plan']): Decision[] {
  const out: Decision[] = [];

  const headToHead = books.reversal
    ? books.pairs.find((p) => p.verdict === 'better' && p.a === books.adjLeader && p.b === books.rawLeader)
    : undefined;
  const top =
    headToHead ??
    books.pairs.find((p) => p.verdict === 'better' && p.a === books.adjLeader) ??
    books.pairs.find((p) => p.verdict === 'better');
  if (top) {
    out.push({
      kind: 'textbook',
      best: top.a,
      other: top.b,
      diff: top.diff,
      low: top.low,
      high: top.high,
      g: top.g,
      reversal: books.reversal,
      rawLeader: books.rawLeader,
      adjusted: books.adjusted,
    });
  } else if (books.stats.length > 1) {
    out.push({ kind: 'textbook_none', adjusted: books.adjusted });
  }

  const rootGroups = new Map<string, TopicResult[]>();
  for (const t of topics) {
    if (t.diagnosis?.kind === 'cascade') {
      rootGroups.set(t.diagnosis.rootId, [...(rootGroups.get(t.diagnosis.rootId) ?? []), t]);
    }
  }
  const roots = [...rootGroups.entries()].sort((a, b) => b[1].length - a[1].length);
  if (roots[0]) {
    const [rootId, targets] = roots[0];
    const d = targets[0].diagnosis as Extract<Diagnosis, { kind: 'cascade' }>;
    out.push({ kind: 'root', rootId, targets: targets.map((t) => t.id), masteredIf: d.masteredIf, masteredIfNot: d.masteredIfNot });
  }

  if (plan) {
    const add = plan.rows.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta);
    const cut = plan.rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
    if (add.length) {
      out.push({
        kind: 'hours',
        add: add.slice(0, 3).map((r) => r.topicId),
        cut: cut.slice(0, 3).map((r) => r.topicId),
        moved: sum(add.map((r) => r.delta)),
        gain: plan.forecast.gain,
        low: plan.forecast.gainLow,
        high: plan.forecast.gainHigh,
        weakGain: plan.forecast.weakGain,
      });
    }
  }

  const noHours = topics.filter((t) => (t.level === 'critical' || t.level === 'hard') && t.slope?.noEffect);
  if (noHours.length) out.push({ kind: 'no_hours', topicIds: noHours.map((t) => t.id) });

  return out;
}

function validate(ds: Dataset, books: TextbookResult, slopes: TopicSlope[]): Validation | null {
  const truth = ds.truth;
  if (!truth) return null;
  const est: number[] = [];
  const real: number[] = [];
  let covered = 0;
  for (const c of books.cells) {
    const v = truth.textbookTopic[c.textbook]?.[c.topicId];
    if (v === undefined) continue;
    est.push(c.effect);
    real.push(v);
    if (v >= c.low && v <= c.high) covered++;
  }
  const avgAdj = mean(books.stats.map((s) => s.adjMean));
  const overallErrors = books.stats.map((s) => Math.abs(s.adjMean - avgAdj - truth.textbookOverall[s.name]));
  return {
    bookTopicR: pearson(est, real),
    bookOverallError: mean(overallErrors),
    slopeR: pearson(slopes.map((s) => s.slope), slopes.map((s) => truth.slopes[s.topicId])),
    coverage: est.length ? covered / est.length : 0,
  };
}

export function analyze(ds: Dataset, settings: Settings = DEFAULT_SETTINGS): Analysis {
  const cube = buildCube(ds);
  const { result: textbooks } = compareTextbooks(cube, pooledStudentSd(cube));
  const edges = findDependencies(cube, settings.masteryThreshold);
  const slopes = estimateSlopes(cube);
  const topics = analyzeTopics(cube, settings, edges, slopes, textbooks);
  const model = buildModel(cube, slopes, edges, topics.map((t) => t.mean), settings.masteryThreshold);
  const plan = model ? buildPlan(model, DEFAULT_PLAN) : null;
  const totalN = sum(topics.map((t) => t.n));

  return {
    title: ds.title,
    source: ds.source,
    settings,
    nRows: ds.rows.length,
    nStudents: cube.students.length,
    nClasses: cube.classes.length,
    nSchools: cube.nSchools,
    hasBaseline: cube.hasBaseline,
    hasHours: cube.hasHours,
    overallMean: totalN ? sum(topics.map((t) => t.mean * t.n)) / totalN : NaN,
    textbooks,
    topics,
    edges,
    model,
    plan,
    decisions: buildDecisions(topics, textbooks, plan),
    validation: validate(ds, textbooks, slopes),
  };
}
