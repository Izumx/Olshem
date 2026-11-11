'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { Ruled } from '@/components/Shell';
import { buildPlan, forecast, planBounds } from '@/lib/engine/hours';
import { DEFAULT_PLAN, type HoursModel, type Objective, type PlanOptions } from '@/lib/engine/types';
import { download, toCsv } from '@/lib/data/import';
import { n0, n1, signed, signed0 } from '@/lib/i18n';

export default function Hours() {
  const { t, analysis } = useApp();
  if (!analysis.model) {
    return (
      <Ruled>
        <h1 className="title">{t.hours.title}</h1>
        <p className="lead">{t.hours.missing}</p>
      </Ruled>
    );
  }
  return <Editor key={`${analysis.title.ru}-${analysis.nRows}`} model={analysis.model} />;
}

function Editor({ model }: { model: HoursModel }) {
  const { t, topicName } = useApp();
  const m = t.hours;
  const [options, setOptions] = useState<PlanOptions>(DEFAULT_PLAN);
  const [custom, setCustom] = useState<number[] | null>(null);

  const plan = useMemo(() => buildPlan(model, options), [model, options]);
  const { lo, hi } = useMemo(() => planBounds(model, options), [model, options]);
  const hours = custom ?? plan.recommended;
  const fc = useMemo(() => forecast(model, hours), [model, hours]);

  const budget = model.current.reduce((s, h) => s + h, 0) + options.extraHours;
  const used = hours.reduce((s, h) => s + h, 0);

  const update = (next: Partial<PlanOptions>) => {
    setOptions((o) => ({ ...o, ...next }));
    setCustom(null);
  };
  const bump = (i: number, d: number) => setCustom(hours.map((h, j) => (j === i ? h + d : h)));

  const reasonFor = (i: number) => {
    const row = plan.rows[i];
    if (hours[i] === row.recommended) return m.reason[row.reason];
    return '';
  };

  const exportCsv = () => {
    download(
      'plan-chasov.csv',
      toCsv([
        m.csvHeader,
        ...hours.map((h, i) => [
          topicName(model.topicIds[i]), model.current[i], h, h - model.current[i],
          Math.round(model.means[i] * 10) / 10, Math.round(fc.after[i] * 10) / 10, reasonFor(i),
        ]),
      ]),
    );
  };

  return (
    <>
      <Ruled>
        <h1 className="title">{m.title}</h1>
        <p className="lead">{m.lead(budget)}</p>
      </Ruled>

      <Ruled>
        <div className="sheet controls">
          <div className="field">
            {m.goal}
            <div className="seg">
              {(['gaps', 'average'] as Objective[]).map((o) => (
                <button key={o} type="button" aria-pressed={options.objective === o} onClick={() => update({ objective: o })}>
                  {o === 'gaps' ? m.goalGaps : m.goalAverage}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            {m.extra}
            <div className="step">
              <button type="button" aria-label={m.decrease} disabled={options.extraHours <= -10} onClick={() => update({ extraHours: options.extraHours - 1 })}>−</button>
              <output>{signed0(options.extraHours) || '0'}</output>
              <button type="button" aria-label={m.increase} disabled={options.extraHours >= 20} onClick={() => update({ extraHours: options.extraHours + 1 })}>+</button>
            </div>
          </div>
          <label>
            {m.maxShift}
            <select value={options.maxShift} onChange={(e) => update({ maxShift: Number(e.target.value) })}>
              {[0.15, 0.2, 0.3, 0.4].map((v) => <option key={v} value={v}>±{n0(v * 100)}%</option>)}
            </select>
          </label>
        </div>
      </Ruled>

      <Ruled note={m.note}>
        <div className="summary">
          <div>
            <div className="small">{m.forecast}</div>
            <div className="big">{n1(fc.meanBefore)} → {n1(fc.meanAfter)}</div>
            <div className="small num">{m.range(signed(fc.gainLow), signed(fc.gainHigh))}</div>
          </div>
          <div>
            <div className="small">{m.budget}</div>
            <div className="big">{n0(used)} / {n0(budget)} {t.hoursShort}</div>
            <div className="small">
              {used > budget ? <span className="warn">{m.over(used - budget)}</span>
                : used < budget ? <span className="warn">{m.under(budget - used)}</span>
                : <span className="ok">{m.fits}</span>}
            </div>
          </div>
        </div>
      </Ruled>

      <Ruled>
        <div className="sheet table-wrap">
          <table>
            <thead>
              <tr>
                <th>{m.col.topic}</th>
                <th className="r">{m.col.now}</th>
                <th style={{ textAlign: 'center' }}>{m.col.plan}</th>
                <th className="r">{m.col.delta}</th>
                <th className="r">{m.col.forecast}</th>
                <th>{m.col.why}</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h, i) => {
                const delta = h - model.current[i];
                return (
                  <tr key={model.topicIds[i]}>
                    <td style={{ minWidth: 220 }}>{topicName(model.topicIds[i])}</td>
                    <td className="r num">{n0(model.current[i])}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div className="step">
                        <button type="button" aria-label={`${m.decrease}: ${topicName(model.topicIds[i])}`} disabled={h <= lo[i]} onClick={() => bump(i, -1)}>−</button>
                        <output>{n0(h)}</output>
                        <button type="button" aria-label={`${m.increase}: ${topicName(model.topicIds[i])}`} disabled={h >= hi[i]} onClick={() => bump(i, 1)}>+</button>
                      </div>
                    </td>
                    <td className={`r num ${delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''}`}>{delta ? signed0(delta) : ''}</td>
                    <td className="r num" style={{ whiteSpace: 'nowrap' }}>{n0(model.means[i])} → <b>{n0(fc.after[i])}</b></td>
                    <td className="small" style={{ minWidth: 200 }}>{reasonFor(i)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Ruled>

      <Ruled>
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportCsv}>{m.export}</button>
          <button type="button" className="btn ghost" onClick={() => setCustom(null)}>{m.reset}</button>
          <button type="button" className="btn ghost" onClick={() => setCustom([...model.current])}>{m.current}</button>
        </div>
        <p className="small" style={{ marginTop: 12, maxWidth: '44em' }}>{m.caution}</p>
      </Ruled>
    </>
  );
}
