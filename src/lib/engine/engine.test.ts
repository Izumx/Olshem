import { describe, expect, it } from 'vitest';
import { benjaminiHochberg, clusteredOls, contrast, invert, tCrit, tTwoSidedP } from './stats';
import { analyze } from './analyze';
import { buildPlan, forecast } from './hours';
import { generateDemo } from '../demo/generate';
import { DEFAULT_PLAN, type Dataset } from './types';

describe('statistics primitives', () => {
  it('matches published t critical values', () => {
    expect(tCrit(10)).toBeCloseTo(2.228, 2);
    expect(tCrit(30)).toBeCloseTo(2.042, 2);
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 2);
  });

  it('inverts a matrix and refuses a singular one', () => {
    const inv = invert([[2, 0], [0, 4]])!;
    expect(inv[0][0]).toBeCloseTo(0.5);
    expect(inv[1][1]).toBeCloseTo(0.25);
    expect(invert([[1, 2], [2, 4]])).toBeNull();
  });

  it('computes Benjamini–Hochberg q-values', () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.2]);
    expect(q[0]).toBeCloseTo(0.04);
    expect(q[2]).toBeCloseTo(0.0533, 3);
    expect(q[1]).toBeCloseTo(0.0533, 3);
    expect(q[3]).toBeCloseTo(0.2);
  });

  it('recovers OLS coefficients', () => {
    const X = Array.from({ length: 20 }, (_, i) => [1, i]);
    const y = X.map(([, x]) => 3 + 2 * x);
    const fit = clusteredOls(X, y, X.map((_, i) => `g${i % 5}`))!;
    expect(fit.beta[0]).toBeCloseTo(3);
    expect(fit.beta[1]).toBeCloseTo(2);
    expect(contrast(fit, [0, 1]).value).toBeCloseTo(2);
  });
});

describe('demo: does the engine find the known answers?', () => {
  const ds = generateDemo();
  const a = analyze(ds);

  it('sees through the school-selection trap in textbook ranking', () => {
    expect(a.textbooks.rawLeader).toBe('Учебник A');
    expect(a.textbooks.adjLeader).toBe('Учебник B');
    expect(a.textbooks.reversal).toBe(true);
  });

  it('recovers per-topic textbook effects and hours slopes', () => {
    expect(a.validation!.bookTopicR).toBeGreaterThan(0.85);
    expect(a.validation!.bookOverallError).toBeLessThan(1.5);
    expect(a.validation!.slopeR).toBeGreaterThan(0.8);
  });

  it('keeps the 95% intervals honest across many simulated years', () => {
    const coverage = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => analyze(generateDemo(s * 977)).validation!.coverage);
    const average = coverage.reduce((x, y) => x + y, 0) / coverage.length;
    expect(average).toBeGreaterThan(0.88);
  });

  it('compares the true leader with the misleading one', () => {
    const d = a.decisions.find((x) => x.kind === 'textbook');
    expect(d).toMatchObject({ best: 'Учебник B', other: 'Учебник A', reversal: true });
  });

  it('never takes hours from a weak topic', () => {
    for (const r of a.plan!.rows) if (r.before < 60) expect(r.delta).toBeGreaterThanOrEqual(0);
  });

  it('finds the real dependencies and not unrelated ones', () => {
    const has = (from: string, to: string) => a.edges.some((e) => e.from === from && e.to === to);
    expect(has('t09', 't10')).toBe(true);
    expect(has('t10', 't11')).toBe(true);
    expect(has('t01', 't12')).toBe(false);
  });

  it('assigns the planted diagnoses', () => {
    const d = (id: string) => a.topics.find((t) => t.id === id)!.diagnosis?.kind;
    expect(d('t10')).toBe('cascade');
    expect(d('t09')).toBe('textbook');
    expect(d('t06')).toBe('teaching');
    expect(d('t07')).toBe('hours');
  });

  it('keeps the plan inside the budget and moves hours the right way', () => {
    const plan = a.plan!;
    const before = plan.rows.reduce((s, r) => s + r.current, 0);
    expect(plan.total).toBe(before);
    const t07 = plan.rows.find((r) => r.topicId === 't07')!;
    const t12 = plan.rows.find((r) => r.topicId === 't12')!;
    expect(t07.delta).toBeGreaterThan(0);
    expect(t12.delta).toBeLessThan(0);
    expect(plan.forecast.gain).toBeGreaterThan(0);
  });

  it('does not sacrifice a weak topic by cutting what it depends on', () => {
    const rows = a.plan!.rows;
    for (const e of a.edges) {
      const to = rows.find((r) => r.topicId === e.to)!;
      const from = rows.find((r) => r.topicId === e.from)!;
      if (to.before < 60 && e.r >= 0.25) expect(from.delta).toBeGreaterThanOrEqual(0);
    }
  });

  it('never predicts a change when hours are unchanged', () => {
    expect(forecast(a.model!, a.model!.current).gain).toBeCloseTo(0);
  });

  it('spends extra hours and absorbs cuts', () => {
    const base = a.model!.current.reduce((s, h) => s + h, 0);
    expect(buildPlan(a.model!, { ...DEFAULT_PLAN, extraHours: 4 }).total).toBe(base + 4);
    expect(buildPlan(a.model!, { ...DEFAULT_PLAN, extraHours: -4 }).total).toBe(base - 4);
  });
});

describe('incomplete data', () => {
  const full = generateDemo();

  it('works without hours and says so', () => {
    const ds: Dataset = { ...full, truth: undefined, rows: full.rows.map((r) => ({ ...r, hours: null })) };
    const a = analyze(ds);
    expect(a.hasHours).toBe(false);
    expect(a.plan).toBeNull();
    expect(a.topics.length).toBe(12);
  });

  it('works without baseline and reports the comparison as unadjusted', () => {
    const ds: Dataset = { ...full, truth: undefined, rows: full.rows.map((r) => ({ ...r, baseline: null })) };
    const a = analyze(ds);
    expect(a.hasBaseline).toBe(false);
    expect(a.textbooks.adjusted).toBe(false);
    expect(a.textbooks.reversal).toBe(false);
  });

  describe('short course with no real links between topics', () => {
    const rows: Dataset['rows'] = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let s = 0; s < 400; s++) {
      const ability = rnd() * 30 - 15;
      ['a', 'b', 'c'].forEach((topicId, i) =>
        rows.push({
          studentId: `s${s}`, classId: `c${s % 16}`, schoolId: `sc${s % 8}`, textbook: s % 2 ? 'P' : 'Q',
          topicId, score: 60 + ability - i * 8 + rnd() * 20 - 10, hours: null, baseline: 60 + ability,
        }),
      );
    }
    const topics = ['a', 'b', 'c'].map((id, order) => ({ id, order, name: { ru: id, kk: id } }));
    const ds: Dataset = { source: 'upload', title: { ru: 'x', kk: 'x' }, rows, topics };

    it('invents no dependency when ability can be controlled', () => {
      expect(analyze(ds).edges.filter((e) => e.r >= 0.25)).toEqual([]);
    });

    it('refuses to look for dependencies when it cannot control ability', () => {
      const noEntry = { ...ds, rows: rows.map((r) => ({ ...r, baseline: null })) };
      expect(analyze(noEntry).edges).toEqual([]);
    });
  });

  it('survives a single textbook', () => {
    const ds: Dataset = { ...full, truth: undefined, rows: full.rows.map((r) => ({ ...r, textbook: 'X' })) };
    const a = analyze(ds);
    expect(a.textbooks.stats.length).toBe(0);
    expect(a.decisions.some((d) => d.kind === 'textbook')).toBe(false);
  });
});
