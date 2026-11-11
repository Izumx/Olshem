'use client';

import { useEffect, useMemo, useState } from 'react';
import { THRESHOLD_MAX, THRESHOLD_MIN, useApp } from '@/components/AppProvider';
import { Ruled } from '@/components/Shell';
import { Tip } from '@/components/Tip';
import type { TopicResult } from '@/lib/engine/types';
import { n0, n1, pct, signed } from '@/lib/i18n';

const ROW = 48;
const GUTTER = 76;

export default function Topics() {
  const { t, analysis, topicName, threshold, setThreshold } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const m = t.topics;
  const topics = analysis.topics;
  const hard = topics.filter((x) => x.level === 'critical' || x.level === 'hard').length;
  const target = analysis.settings.masteryThreshold;
  const index = useMemo(() => new Map(topics.map((x, i) => [x.id, i])), [topics]);
  const open = topics.find((x) => x.id === openId) ?? null;

  const arcs = analysis.edges
    .filter((e) => e.r >= 0.25)
    .map((e) => ({ ...e, i: index.get(e.from)!, j: index.get(e.to)! }));

  return (
    <>
      <Ruled note={m.note}>
        <h1 className="title">{m.title}</h1>
        <p className="lead">{m.lead(hard, topics.length)}</p>
      </Ruled>
      <div style={{ height: 24 }} />
      <Ruled>
        <div className="sheet" style={{ padding: '12px 0' }}>
          <div className="tmap-head">
            <span>{m.colTopic}</span>
            <span className="hide">{m.colMean}</span>
            <span>{m.colMastered}</span>
            <span className="hide">{m.colCause}</span>
          </div>
          <div className="tmap">
            <svg className="arcs" width={GUTTER} height={ROW * topics.length} aria-hidden="true">
              {arcs.map((a) => {
                const y1 = a.i * ROW + ROW / 2;
                const y2 = a.j * ROW + ROW / 2;
                const reach = Math.min(GUTTER - 34, 14 + (a.j - a.i) * 12);
                const x = GUTTER - 26;
                const active = hover === a.from || hover === a.to;
                return (
                  <g key={`${a.from}-${a.to}`} opacity={hover && !active ? 0.2 : 1}>
                    <path
                      d={`M ${x} ${y1} C ${x - reach} ${y1}, ${x - reach} ${y2}, ${x - 4} ${y2}`}
                      fill="none"
                      stroke="var(--red)"
                      strokeWidth={1.2 + a.r * 3}
                      strokeLinecap="round"
                    />
                    <path d={`M ${x - 9} ${y2 - 4} L ${x - 3} ${y2} L ${x - 9} ${y2 + 4}`} fill="none" stroke="var(--red)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                );
              })}
            </svg>
            {topics.map((x, i) => (
              <button
                key={x.id}
                type="button"
                className={`trow level-${x.level}`}
                aria-expanded={openId === x.id}
                onClick={() => setOpenId(x.id)}
                onMouseEnter={() => setHover(x.id)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="ord num">{i + 1}</span>
                <span className="name">{topicName(x.id)}</span>
                <Tip className="track" text={`${n1(x.mean)} (${n1(x.low)}–${n1(x.high)})`}>
                  <span className="base" />
                  <span className="tick" style={{ left: `${target}%` }} />
                  <span className="ci" style={{ left: `${x.low}%`, width: `${x.high - x.low}%` }} />
                  <span className="dot" style={{ left: `${x.mean}%` }} />
                </Tip>
                <span className="num" style={{ fontWeight: 600 }}>{pct(x.masteredRate)}</span>
                <span className={x.diagnosis ? 'cause' : 'cause quiet'}>
                  {x.diagnosis ? t.diagnosis.label[x.diagnosis.kind] : t.level[x.level]}
                </span>
              </button>
            ))}
          </div>
          <div className="legend" style={{ padding: '0 18px' }}>
            <span><i style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--pen)' }} />{m.legendMean}</span>
            <span>
              <i style={{ width: 2, height: 14, background: 'var(--red)', opacity: 0.55 }} />
              {m.legendTargetLabel}
              <span className="step" style={{ marginLeft: 6 }}>
                <button type="button" aria-label={m.thresholdDown} disabled={threshold <= THRESHOLD_MIN} onClick={() => setThreshold(threshold - 5)}>−</button>
                <output aria-live="polite">{threshold}</output>
                <button type="button" aria-label={m.thresholdUp} disabled={threshold >= THRESHOLD_MAX} onClick={() => setThreshold(threshold + 5)}>+</button>
              </span>
            </span>
          </div>
        </div>
      </Ruled>
      {open && <Drawer topic={open} onClose={() => setOpenId(null)} topicName={topicName} />}
    </>
  );
}

function Drawer({ topic, onClose, topicName }: { topic: TopicResult; onClose: () => void; topicName: (id: string) => string }) {
  const { t, lang, analysis, book } = useApp();
  const m = t.topics;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [cause, action] = topic.diagnosis ? t.diagnosis.text(topic.diagnosis, topicName, book) : ['', ''];
  const cells = analysis.textbooks.cells.filter((c) => c.topicId === topic.id);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={topic.name[lang]}>
        <button type="button" className="btn ghost close" onClick={onClose} autoFocus>{m.close}</button>
        <h2>{topic.name[lang]}</h2>

        {topic.diagnosis ? (
          <>
            <section>
              <h3>{m.cause}: {t.diagnosis.label[topic.diagnosis.kind]}</h3>
              <p>{cause}</p>
            </section>
            <section>
              <h3>{m.action}</h3>
              <p>{action}</p>
            </section>
          </>
        ) : (
          <section><p>{m.noDiagnosis}</p></section>
        )}

        <dl className="facts">
          <div><dt>{m.stats.mean}</dt><dd className="num">{n1(topic.mean)}</dd></div>
          <div><dt>{m.stats.mastered}</dt><dd className="num">{pct(topic.masteredRate)}</dd></div>
          <div><dt>{m.stats.relative}</dt><dd className="num">{signed(topic.relative)}</dd></div>
          <div><dt>{m.stats.classes}</dt><dd className="num">{n0(topic.classMin)}–{n0(topic.classMax)}</dd></div>
          {topic.currentHours !== null && <div><dt>{m.stats.hours}</dt><dd className="num">{n0(topic.currentHours)} {t.hoursShort}</dd></div>}
        </dl>

        <section>
          <h3>{m.distribution}</h3>
          <Histogram bins={topic.histogram} target={analysis.settings.masteryThreshold} />
        </section>

        {(topic.predecessors.length > 0 || topic.successors.length > 0) && (
          <section>
            {topic.predecessors.length > 0 && <h3>{m.dependsOn}</h3>}
            {topic.predecessors.map((e) => (
              <p key={e.from}>«{topicName(e.from)}»: {m.masteredPair(pct(e.masteredIf), pct(e.masteredIfNot))}</p>
            ))}
            {topic.successors.length > 0 && <h3 style={{ marginTop: 12 }}>{m.feeds}</h3>}
            {topic.successors.map((e) => <p key={e.to}>«{topicName(e.to)}»</p>)}
          </section>
        )}

        {topic.dose.length > 0 && topic.slope && topic.currentHours !== null && (
          <section>
            <h3>{m.dose}</h3>
            <Dose topic={topic} />
            <p className="small">{m.doseNote}</p>
          </section>
        )}

        {cells.length > 0 && (
          <section>
            <h3>{m.books}</h3>
            <table>
              <tbody>
                {cells.map((c) => (
                  <tr key={c.textbook}>
                    <td style={{ paddingLeft: 0 }}>{book(c.textbook)}</td>
                    <td className={`r num ${c.significant ? 'strong' : ''}`}>{signed(c.effect)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small" style={{ marginTop: 4 }}>{m.booksNote}</p>
          </section>
        )}
      </aside>
    </>
  );
}

function Histogram({ bins, target }: { bins: number[]; target: number }) {
  const w = 460;
  const h = 96;
  const max = Math.max(...bins, 1);
  const bw = w / bins.length;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h + 18}`} width="100%" role="img">
      {bins.map((v, i) => {
        const bh = (v / max) * h;
        const below = (i + 1) * 10 <= target;
        return (
          <rect key={i} x={i * bw + 1} y={h - bh} width={bw - 2} height={bh} rx={3} fill={below ? 'var(--book-2)' : 'var(--book-1)'}>
            <title>{`${i * 10}–${(i + 1) * 10}: ${n0(v)}`}</title>
          </rect>
        );
      })}
      <line x1={0} x2={w} y1={h + 0.5} y2={h + 0.5} stroke="var(--rule)" />
      {[0, 20, 40, 60, 80, 100].map((v) => (
        <text key={v} className="axis-label" x={Math.min(w - 12, Math.max(0, (v / 100) * w))} y={h + 15} textAnchor={v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}>{v}</text>
      ))}
    </svg>
  );
}

function Dose({ topic }: { topic: TopicResult }) {
  const w = 460;
  const h = 160;
  const pad = { l: 30, b: 22, t: 8, r: 8 };
  const hs = topic.dose.map((d) => d.hours);
  const ys = topic.dose.map((d) => d.score);
  const x0 = Math.min(...hs) - 0.5;
  const x1 = Math.max(...hs) + 0.5;
  const y0 = Math.floor(Math.min(...ys) / 10) * 10;
  const y1 = Math.ceil(Math.max(...ys) / 10) * 10;
  const sx = (v: number) => pad.l + ((v - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const sy = (v: number) => h - pad.b - ((v - y0) / (y1 - y0 || 1)) * (h - pad.t - pad.b);
  const base = topic.currentHours as number;
  const curve = Array.from({ length: 24 }, (_, i) => {
    const hx = Math.max(0.5, x0 + ((x1 - x0) * i) / 23);
    return `${i ? 'L' : 'M'} ${sx(hx).toFixed(1)} ${sy(topic.mean + Math.max(0, topic.slope!.slope) * Math.log(hx / base)).toFixed(1)}`;
  }).join(' ');
  const ticks = [...new Set([Math.ceil(x0), base, Math.floor(x1)])];
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" role="img">
      {[y0, (y0 + y1) / 2, y1].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
          <text className="axis-label" x={pad.l - 6} y={sy(v) + 4} textAnchor="end">{n0(v)}</text>
        </g>
      ))}
      {ticks.map((v) => <text key={v} className="axis-label" x={sx(v)} y={h - 6} textAnchor="middle">{n0(v)}</text>)}
      {topic.dose.map((d, i) => <circle key={i} cx={sx(d.hours)} cy={sy(d.score)} r={3.5} fill="var(--book-1)" opacity={0.42} />)}
      <path d={curve} fill="none" stroke="var(--red)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
