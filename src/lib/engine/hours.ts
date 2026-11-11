import type { Cube, Edge, Forecast, HoursModel, Plan, PlanOptions, PlanRow, TopicSlope } from './types';
import { mean, median, quantile, sum, tCrit } from './stats';

const LN_30 = Math.log(1.3);
/** Slope below which 30% more hours buys less than 1.5 points. */
const NEGLIGIBLE = 1.5 / LN_30;

/**
 * How mastery responds to hours, per topic. Classes differ in how they
 * distribute hours, and comparing each class with itself across topics removes
 * its overall strength. Noisy per-topic slopes are pulled toward the common
 * slope (partial pooling), so one odd topic does not drive a recommendation.
 */
export function estimateSlopes(cube: Cube): TopicSlope[] {
  if (!cube.hasHours) return [];
  const T = cube.topics.length;
  const C = cube.classes.length;

  const yt = new Array<number[]>(T).fill(null as never).map(() => [] as number[]);
  const xt = new Array<number[]>(T).fill(null as never).map(() => [] as number[]);
  const yc = new Array<number[]>(C).fill(null as never).map(() => [] as number[]);
  const xc = new Array<number[]>(C).fill(null as never).map(() => [] as number[]);
  const all: { c: number; t: number; x: number; y: number }[] = [];

  cube.cells.forEach((row, c) =>
    row.forEach((cell, t) => {
      if (!cell || cell.hours === null || cell.hours <= 0) return;
      const x = Math.log(cell.hours);
      yt[t].push(cell.mean);
      xt[t].push(x);
      yc[c].push(cell.mean);
      xc[c].push(x);
      all.push({ c, t, x, y: cell.mean });
    }),
  );
  const yGrand = mean(all.map((a) => a.y));
  const xGrand = mean(all.map((a) => a.x));
  const yT = yt.map(mean);
  const xT = xt.map(mean);
  const yC = yc.map(mean);
  const xC = xc.map(mean);

  const raw = cube.topics.map((topic, t) => {
    const pts = all
      .filter((a) => a.t === t)
      .map((a) => ({ x: a.x - xC[a.c] - xT[t] + xGrand, y: a.y - yC[a.c] - yT[t] + yGrand }));
    const sxx = sum(pts.map((p) => p.x * p.x));
    const sxy = sum(pts.map((p) => p.x * p.y));
    if (pts.length < 8 || sxx < 1e-6) return { id: topic.id, b: NaN, se: NaN };
    const b = sxy / sxx;
    const rss = sum(pts.map((p) => (p.y - b * p.x) ** 2));
    return { id: topic.id, b, se: Math.sqrt(rss / (pts.length - 2) / sxx) };
  });

  const usable = raw.filter((r) => Number.isFinite(r.b) && r.se > 0);
  if (usable.length < 2) return [];
  const w = usable.map((r) => 1 / r.se ** 2);
  const sw = sum(w);
  const fixed = sum(usable.map((r, i) => r.b * w[i])) / sw;
  const Q = sum(usable.map((r, i) => w[i] * (r.b - fixed) ** 2));
  const tau2 = Math.max(0, (Q - (usable.length - 1)) / (sw - sum(w.map((v) => v * v)) / sw));
  const re = usable.map((r) => 1 / (r.se ** 2 + tau2));
  const pooled = sum(usable.map((r, i) => r.b * re[i])) / sum(re);

  const crit = tCrit(Math.max(C - 2, 2));
  return raw.map((r) => {
    if (!Number.isFinite(r.b)) {
      return { topicId: r.id, raw: 0, rawSe: 0, slope: 0, se: 0, low: 0, high: 0, gainAt30: 0, responsive: false, noEffect: false };
    }
    const shrink = tau2 / (tau2 + r.se ** 2);
    const slope = pooled + shrink * (r.b - pooled);
    const se = Math.sqrt(shrink) * r.se;
    const low = slope - crit * se;
    const high = slope + crit * se;
    return {
      topicId: r.id,
      raw: r.b,
      rawSe: r.se,
      slope,
      se,
      low,
      high,
      gainAt30: Math.max(0, slope) * LN_30,
      responsive: low > 0 && slope >= NEGLIGIBLE,
      noEffect: slope < NEGLIGIBLE && high < NEGLIGIBLE * 1.5,
    };
  });
}

export function buildModel(cube: Cube, slopes: TopicSlope[], edges: Edge[], means: number[], target: number): HoursModel | null {
  if (!slopes.length) return null;
  const T = cube.topics.length;
  const current: number[] = [];
  const observedMin: number[] = [];
  const observedMax: number[] = [];
  for (let t = 0; t < T; t++) {
    const h = cube.cells.flatMap((row) => (row[t]?.hours != null ? [row[t]!.hours as number] : []));
    current.push(Math.max(1, Math.round(median(h))));
    observedMin.push(quantile(h, 0.05));
    observedMax.push(quantile(h, 0.95));
  }
  const index = new Map(cube.topics.map((t, i) => [t.id, i]));
  return {
    topicIds: cube.topics.map((t) => t.id),
    current,
    lo: current,
    hi: current,
    means,
    slopes,
    observedMin,
    observedMax,
    target,
    edges: edges.map((e) => ({ from: index.get(e.from)!, to: index.get(e.to)!, rho: e.rho })),
  };
}

function directGains(model: HoursModel, hours: number[]): number[] {
  return hours.map((h, t) => Math.max(0, model.slopes[t].slope) * Math.log(h / model.current[t]));
}

/** Predicted mastery for any distribution of hours, including effects passed down to later topics. */
export function forecast(model: HoursModel, hours: number[]): Forecast {
  const direct = directGains(model, hours);
  const total = [...direct];
  for (const e of [...model.edges].sort((a, b) => a.from - b.from)) {
    total[e.to] += e.rho * total[e.from];
  }
  const after = model.means.map((m, t) => Math.min(100, Math.max(0, m + total[t])));
  const meanBefore = mean(model.means);
  const meanAfter = mean(after);
  const variance =
    sum(hours.map((h, t) => (model.slopes[t].se * Math.log(h / model.current[t])) ** 2)) / hours.length ** 2;
  const se = Math.sqrt(variance);
  const crit = 1.96;
  const gain = meanAfter - meanBefore;
  const weak = model.means.flatMap((m, t) => (m < model.target ? [after[t] - m] : []));
  return {
    after,
    direct,
    meanBefore,
    meanAfter,
    gain,
    gainLow: gain - crit * se,
    gainHigh: gain + crit * se,
    weakGain: weak.length ? mean(weak) : 0,
  };
}

/**
 * Weak topics and the topics they build on never lose hours. A plan that
 * "pays" for one weak topic by weakening another is not one a methodist can sign.
 */
function bounds(model: HoursModel, options: PlanOptions) {
  const isProtected = (t: number) =>
    model.means[t] < model.target ||
    model.edges.some((e) => e.from === t && model.means[e.to] < model.target);
  const lo = model.current.map((h, t) =>
    isProtected(t)
      ? h
      : Math.max(1, Math.max(Math.ceil(h * (1 - options.maxShift)), Math.floor(Math.min(h, model.observedMin[t])))),
  );
  const hi = model.current.map((h, t) =>
    Math.max(h, Math.min(Math.floor(h * (1 + options.maxShift)), Math.ceil(Math.max(h, model.observedMax[t])))),
  );
  return { lo, hi };
}

/**
 * Moves whole hours from where the next hour buys least to where it buys most.
 * The objective is concave, so this greedy exchange reaches the optimum. Hours
 * stay inside the range real classes have used: no extrapolation.
 */
export function buildPlan(model: HoursModel, options: PlanOptions): Plan {
  const { lo, hi } = bounds(model, options);
  const target = model.target;
  const T = model.current.length;

  const cascade = new Array<number>(T).fill(0);
  for (const e of model.edges) cascade[e.from] += e.rho;

  const weight = model.means.map((m) =>
    options.objective === 'gaps' ? 1 + 3 * Math.max(0, target - m) / target : 1,
  );
  // An hour also counts through every later topic that depends on this one.
  const downstream = [...weight];
  for (let t = T - 1; t >= 0; t--) {
    for (const e of model.edges) if (e.from === t) downstream[t] += e.rho * downstream[e.to];
  }
  const value = (t: number) => downstream[t] * Math.max(0, model.slopes[t].slope);
  const room = (t: number, h: number) => (model.means[t] + Math.max(0, model.slopes[t].slope) * Math.log(h / model.current[t]) < 97 ? 1 : 0);
  const gainOf = (t: number, h: number) => (h >= hi[t] ? -Infinity : value(t) * Math.log((h + 1) / h) * room(t, h + 1));
  const lossOf = (t: number, h: number) => (h <= lo[t] ? Infinity : value(t) * Math.log(h / (h - 1)));

  const hours = [...model.current];
  let extra = options.extraHours;

  while (extra > 0) {
    let best = -1;
    let bestGain = 0;
    for (let t = 0; t < T; t++) {
      const g = gainOf(t, hours[t]);
      if (g > bestGain) {
        bestGain = g;
        best = t;
      }
    }
    if (best < 0) break;
    hours[best]++;
    extra--;
  }

  while (extra < 0) {
    let best = -1;
    let bestLoss = Infinity;
    for (let t = 0; t < T; t++) {
      const l = lossOf(t, hours[t]);
      if (l < bestLoss) {
        bestLoss = l;
        best = t;
      }
    }
    if (best < 0) break;
    hours[best]--;
    extra++;
  }

  for (let guard = 0; guard < 500; guard++) {
    let to = -1;
    let from = -1;
    let bestGain = 0;
    let bestLoss = Infinity;
    for (let t = 0; t < T; t++) {
      const g = gainOf(t, hours[t]);
      if (g > bestGain) {
        bestGain = g;
        to = t;
      }
      const l = lossOf(t, hours[t]);
      if (l < bestLoss) {
        bestLoss = l;
        from = t;
      }
    }
    if (to < 0 || from < 0 || to === from || bestGain <= bestLoss + 1e-3) break;
    hours[to]++;
    hours[from]--;
  }

  const fc = forecast(model, hours);
  const rows: PlanRow[] = hours.map((h, t) => {
    const delta = h - model.current[t];
    const s = model.slopes[t];
    const margin = 1.96 * s.se * Math.abs(Math.log(h / model.current[t]));
    let reason: PlanRow['reason'] = 'keep';
    if (delta > 0) reason = cascade[t] > 0.15 ? 'add_root' : 'add_responsive';
    else if (delta < 0) reason = model.means[t] >= target + 15 ? 'cut_strong' : 'cut_saturated';
    else if (s.noEffect && model.means[t] < target) reason = 'keep_no_effect';
    return {
      topicId: model.topicIds[t],
      current: model.current[t],
      recommended: h,
      delta,
      before: model.means[t],
      after: fc.after[t],
      low: fc.after[t] - margin,
      high: fc.after[t] + margin,
      reason,
    };
  });

  return { options, total: sum(hours), rows, recommended: hours, forecast: fc };
}

export function planBounds(model: HoursModel, options: PlanOptions) {
  return bounds(model, options);
}
