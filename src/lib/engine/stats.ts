export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);

export function variance(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
}

export const sd = (a: number[]) => Math.sqrt(variance(a));

export function median(a: number[]): number {
  return quantile(a, 0.5);
}

export function quantile(a: number[], p: number): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export function pearson(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -t + Math.log((2.5066282746310005 * ser) / x);
}

function betaCf(x: number, a: number, b: number): number {
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaCf(x, a, b)) / a
    : 1 - (front * betaCf(1 - x, b, a)) / b;
}

export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const tail = 0.5 * regIncBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

export function tTwoSidedP(t: number, df: number): number {
  return regIncBeta(df / (df + t * t), df / 2, 0.5);
}

/** Critical value for a two-sided interval with the given confidence. */
export function tCrit(df: number, confidence = 0.95): number {
  const target = 1 - (1 - confidence) / 2;
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Benjamini–Hochberg adjusted q-values, in the input order. */
export function benjaminiHochberg(p: number[]): number[] {
  const n = p.length;
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const q = new Array<number>(n);
  let best = 1;
  order.forEach(([v, i], k) => {
    best = Math.min(best, (v * n) / (n - k));
    q[i] = best;
  });
  return q;
}

export function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-10) return null;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((r) => r.slice(n));
}

export interface OlsFit {
  beta: number[];
  vcov: number[][];
  df: number;
}

/**
 * OLS with cluster-robust (CR1) covariance. Textbooks are adopted by whole
 * schools, so the school, not the student, is the independent unit.
 */
export function clusteredOls(X: number[][], y: number[], clusters: string[]): OlsFit | null {
  const n = X.length;
  if (!n) return null;
  const k = X[0].length;
  const groups = new Set(clusters);
  const G = groups.size;
  if (n <= k || G < 2) return null;

  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) xtx[a][b] += X[i][a] * X[i][b];
    }
  }
  const inv = invert(xtx);
  if (!inv) return null;
  const beta = inv.map((r) => r.reduce((s, v, j) => s + v * xty[j], 0));

  const score = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const e = y[i] - X[i].reduce((s, v, j) => s + v * beta[j], 0);
    let u = score.get(clusters[i]);
    if (!u) {
      u = new Array<number>(k).fill(0);
      score.set(clusters[i], u);
    }
    for (let a = 0; a < k; a++) u[a] += X[i][a] * e;
  }
  const meat = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (const u of score.values()) {
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) meat[a][b] += u[a] * u[b];
  }
  const c = (G / (G - 1)) * ((n - 1) / (n - k));
  const vcov = quadForm(inv, meat).map((r) => r.map((v) => v * c));
  return { beta, vcov, df: G - 1 };
}

function quadForm(a: number[][], m: number[][]): number[][] {
  const k = a.length;
  const am = a.map((row) =>
    Array.from({ length: k }, (_, j) => row.reduce((s, v, l) => s + v * m[l][j], 0)),
  );
  return am.map((row) =>
    Array.from({ length: k }, (_, j) => row.reduce((s, v, l) => s + v * a[l][j], 0)),
  );
}

export interface LinearEstimate {
  value: number;
  se: number;
  low: number;
  high: number;
  p: number;
}

/** Estimate, interval and p-value for the contrast c'β. */
export function contrast(fit: OlsFit, c: number[], confidence = 0.95): LinearEstimate {
  const value = c.reduce((s, v, i) => s + v * fit.beta[i], 0);
  let v = 0;
  for (let a = 0; a < c.length; a++) for (let b = 0; b < c.length; b++) v += c[a] * c[b] * fit.vcov[a][b];
  const se = Math.sqrt(Math.max(v, 0));
  const t = tCrit(fit.df, confidence);
  return {
    value,
    se,
    low: value - t * se,
    high: value + t * se,
    p: se > 0 ? tTwoSidedP(value / se, fit.df) : 1,
  };
}

/** Seeded generator (mulberry32) so the demo is identical on every run. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (m = 0, s = 1) => {
    const u = Math.max(uniform(), 1e-12);
    return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  return { uniform, normal };
}
