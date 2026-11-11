import type { Cube, TextbookPair, TextbookResult, TextbookStat, TopicBookCell, Verdict } from './types';
import { benjaminiHochberg, clusteredOls, contrast, mean, sd, type OlsFit } from './stats';

/** Differences smaller than this many points are not worth changing a textbook for. */
export const MEANINGFUL_DIFF = 2;
const MIN_SCHOOLS = 3;

interface Design {
  X: number[][];
  y: number[];
  clusters: string[];
}

function design(cube: Cube, books: string[], baselineMean: number, y: (classIdx: number) => number | null, useBaseline: boolean): Design {
  const X: number[][] = [];
  const out: number[] = [];
  const clusters: string[] = [];
  cube.classes.forEach((c, i) => {
    const v = y(i);
    if (v === null) return;
    if (useBaseline && c.baseline === null) return;
    const row = [1];
    if (useBaseline) row.push((c.baseline as number) - baselineMean);
    for (let k = 1; k < books.length; k++) row.push(c.textbook === books[k] ? 1 : 0);
    X.push(row);
    out.push(v);
    clusters.push(c.schoolId);
  });
  return { X, y: out, clusters };
}

function bookVector(k: number, nBooks: number, offset: number): number[] {
  const c = new Array<number>(offset + nBooks).fill(0);
  c[0] = 1;
  if (k > 0) c[offset + k] = 1;
  return c.slice(0, offset + nBooks);
}

function verdictOf(diff: number, low: number, high: number, minSchools: number): Verdict {
  if (minSchools < MIN_SCHOOLS) return 'insufficient';
  if ((low > 0 || high < 0) && Math.abs(diff) >= MEANINGFUL_DIFF) return 'better';
  if (low > -MEANINGFUL_DIFF && high < MEANINGFUL_DIFF) return 'equivalent';
  return 'uncertain';
}

function rank(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const r = new Array<number>(values.length);
  order.forEach(([, i], pos) => {
    r[i] = pos + 1;
  });
  return r;
}

/**
 * Compares textbooks at equal entry level. A raw average mostly measures which
 * schools chose the book, so each class is compared after adjusting for its
 * baseline and uncertainty is counted per school.
 */
export function compareTextbooks(cube: Cube, studentSd: number): { result: TextbookResult; fit: OlsFit | null } {
  const empty: TextbookResult = {
    adjusted: false,
    stats: [],
    pairs: [],
    cells: [],
    rawLeader: null,
    adjLeader: null,
    reversal: false,
    poorOverlap: [],
  };

  const books = [...cube.textbooks].sort(
    (a, b) => cube.classes.filter((c) => c.textbook === b).length - cube.classes.filter((c) => c.textbook === a).length,
  );
  if (books.length < 2) return { result: { ...empty, adjusted: cube.hasBaseline }, fit: null };

  const useBaseline = cube.hasBaseline;
  const known = cube.classes.flatMap((c) => (c.baseline === null ? [] : [c.baseline]));
  const baselineMean = known.length ? mean(known) : 0;
  const offset = useBaseline ? 2 : 1;
  const k = offset + books.length - 1;

  const d = design(cube, books, baselineMean, (i) => cube.classes[i].overall, useBaseline);
  const fit = clusteredOls(d.X, d.y, d.clusters);
  if (!fit) return { result: { ...empty, adjusted: useBaseline }, fit: null };

  const vec = (b: number) => bookVector(b, books.length, offset - 1).concat(new Array(k).fill(0)).slice(0, k);

  const raw: number[] = [];
  const stats: TextbookStat[] = books.map((name, b) => {
    const classes = cube.classes.filter((c) => c.textbook === name);
    const est = contrast(fit, vec(b));
    const rawMean = mean(classes.map((c) => c.overall));
    raw.push(rawMean);
    const bl = classes.flatMap((c) => (c.baseline === null ? [] : [c.baseline]));
    return {
      name,
      nSchools: new Set(classes.map((c) => c.schoolId)).size,
      nClasses: classes.length,
      nStudents: classes.reduce((s, c) => s + c.n, 0),
      rawMean,
      baselineMean: bl.length ? mean(bl) : null,
      adjMean: est.value,
      adjLow: est.low,
      adjHigh: est.high,
      rawRank: 0,
      adjRank: 0,
    };
  });
  const rr = rank(raw);
  const ar = rank(stats.map((s) => s.adjMean));
  stats.forEach((s, i) => {
    s.rawRank = rr[i];
    s.adjRank = ar[i];
  });

  const pairs: TextbookPair[] = [];
  for (let a = 0; a < books.length; a++) {
    for (let b = a + 1; b < books.length; b++) {
      const c = vec(a).map((v, i) => v - vec(b)[i]);
      const est = contrast(fit, c);
      const flip = est.value < 0;
      const hedges = studentSd > 0 ? est.value / studentSd : 0;
      const minSchools = Math.min(stats[a].nSchools, stats[b].nSchools);
      pairs.push({
        a: flip ? books[b] : books[a],
        b: flip ? books[a] : books[b],
        diff: Math.abs(est.value),
        low: flip ? -est.high : est.low,
        high: flip ? -est.low : est.high,
        p: est.p,
        g: Math.abs(hedges),
        verdict: verdictOf(est.value, est.low, est.high, minSchools),
      });
    }
  }
  pairs.sort((x, y) => y.diff - x.diff);

  const cells: TopicBookCell[] = [];
  cube.topics.forEach((topic, t) => {
    const dt = design(cube, books, baselineMean, (i) => cube.cells[i][t]?.mean ?? null, useBaseline);
    const ft = clusteredOls(dt.X, dt.y, dt.clusters);
    if (!ft) return;
    books.forEach((name, b) => {
      const avg = new Array<number>(k).fill(0);
      books.forEach((_, j) => vec(j).forEach((v, i) => (avg[i] += v / books.length)));
      const est = contrast(ft, vec(b).map((v, i) => v - avg[i]));
      cells.push({
        textbook: name,
        topicId: topic.id,
        effect: est.value,
        low: est.low,
        high: est.high,
        p: est.p,
        q: 1,
        significant: false,
      });
    });
  });
  const q = benjaminiHochberg(cells.map((c) => c.p));
  cells.forEach((c, i) => {
    c.q = q[i];
    c.significant = q[i] < 0.05;
  });

  const poorOverlap: string[] = [];
  if (useBaseline) {
    const groupSd = sd(cube.classes.flatMap((c) => (c.baseline === null ? [] : [c.baseline])));
    for (const s of stats) {
      if (s.baselineMean !== null && Math.abs(s.baselineMean - baselineMean) > 1.5 * groupSd) poorOverlap.push(s.name);
    }
  }

  const rawLeader = stats.find((s) => s.rawRank === 1)?.name ?? null;
  const adjLeader = stats.find((s) => s.adjRank === 1)?.name ?? null;
  return {
    fit,
    result: {
      adjusted: useBaseline,
      stats,
      pairs,
      cells,
      rawLeader,
      adjLeader,
      reversal: useBaseline && rawLeader !== adjLeader,
      poorOverlap,
    },
  };
}
