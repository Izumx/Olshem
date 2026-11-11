'use client';

import { useApp } from '@/components/AppProvider';
import { Ruled } from '@/components/Shell';
import { Tip } from '@/components/Tip';
import type { TextbookStat, TopicBookCell } from '@/lib/engine/types';
import { n0, n1, signed } from '@/lib/i18n';

const COLORS = ['var(--book-1)', 'var(--book-2)', 'var(--book-3)', '#7a45c2', '#8a7a12', '#b83a7e', '#3f7fa8', '#6b7280'];

export default function Textbooks() {
  const { t, analysis, book } = useApp();
  const m = t.textbooks;
  const r = analysis.textbooks;

  if (r.stats.length < 2) {
    return (
      <Ruled>
        <h1 className="title">{m.title}</h1>
        <p className="lead">{m.single}</p>
      </Ruled>
    );
  }

  const stats = [...r.stats].sort((a, b) => a.name.localeCompare(b.name));
  const colorOf = (name: string) => COLORS[stats.findIndex((s) => s.name === name) % COLORS.length];
  const lead = !r.adjusted
    ? m.leadUnadjusted
    : r.reversal
      ? m.leadReversal(book(r.rawLeader!), book(r.adjLeader!))
      : m.leadSame(book(r.adjLeader!));

  return (
    <>
      <Ruled>
        <h1 className="title">{m.title}</h1>
        <p className="lead">{lead}</p>
      </Ruled>

      {r.adjusted && (
        <Ruled note={m.slopeNote}>
          <div className="sheet">
            <h2 className="section-title">{m.slopeTitle}</h2>
            <Slope stats={stats} colorOf={colorOf} rawLabel={m.slopeRaw} adjLabel={m.slopeAdj} />
          </div>
        </Ruled>
      )}

      <Ruled note={m.pairsNote}>
        <div className="sheet">
          <h2 className="section-title">{m.pairsTitle}</h2>
          <Pairs />
        </div>
      </Ruled>

      <Ruled note={m.heatNote}>
        <div className="sheet">
          <h2 className="section-title">{m.heatTitle}</h2>
          <div className="table-wrap"><Heat stats={stats} /></div>
          <div className="legend">
            <span>{m.heatLegendLow}<span className="ramp" />{m.heatLegendHigh}</span>
          </div>
        </div>
      </Ruled>

      <Ruled>
        <div className="sheet">
          <h2 className="section-title">{m.tableTitle}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{m.col.book}</th>
                  <th className="r">{m.col.schools}</th>
                  <th className="r">{m.col.classes}</th>
                  <th className="r">{m.col.students}</th>
                  <th className="r">{m.col.entry}</th>
                  <th className="r">{m.col.raw}</th>
                  <th className="r">{m.col.adj}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 8, background: colorOf(s.name) }} />
                      {book(s.name)}
                    </td>
                    <td className="r num">{n0(s.nSchools)}</td>
                    <td className="r num">{n0(s.nClasses)}</td>
                    <td className="r num">{n0(s.nStudents)}</td>
                    <td className="r num">{s.baselineMean === null ? '' : n1(s.baselineMean)}</td>
                    <td className="r num">{n1(s.rawMean)}</td>
                    <td className="r num strong">{r.adjusted ? n1(s.adjMean) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.poorOverlap.map((b) => <p key={b} className="small" style={{ marginTop: 8 }}>{m.overlap(book(b))}</p>)}
        </div>
      </Ruled>
    </>
  );
}

function Slope({ stats, colorOf, rawLabel, adjLabel }: { stats: TextbookStat[]; colorOf: (n: string) => string; rawLabel: string; adjLabel: string }) {
  const { book } = useApp();
  const w = 720;
  const h = 300;
  const x1 = 210;
  const x2 = 510;
  const top = 44;
  const bottom = h - 16;
  const all = stats.flatMap((s) => [s.rawMean, s.adjMean]);
  const lo = Math.floor(Math.min(...all)) - 1;
  const hi = Math.ceil(Math.max(...all)) + 1;
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);

  const spread = (key: 'rawMean' | 'adjMean') => {
    const sorted = [...stats].sort((a, b) => y(a[key]) - y(b[key]));
    const out = new Map<string, number>();
    let last = -Infinity;
    for (const s of sorted) {
      const pos = Math.max(y(s[key]), last + 20);
      out.set(s.name, pos);
      last = pos;
    }
    return out;
  };
  const rawY = spread('rawMean');
  const adjY = spread('adjMean');

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`${rawLabel} / ${adjLabel}`}>
      <text className="axis-label" x={x1} y={18} textAnchor="middle">{rawLabel}</text>
      <text className="axis-label" x={x2} y={18} textAnchor="middle">{adjLabel}</text>
      <line x1={x1} x2={x1} y1={top - 12} y2={bottom} stroke="var(--rule)" />
      <line x1={x2} x2={x2} y1={top - 12} y2={bottom} stroke="var(--rule)" />
      {stats.map((s) => (
        <g key={s.name}>
          <line x1={x1} x2={x2} y1={y(s.rawMean)} y2={y(s.adjMean)} stroke={colorOf(s.name)} strokeWidth={s.adjRank === 1 ? 3.5 : 2} strokeLinecap="round" />
          <circle cx={x1} cy={y(s.rawMean)} r={6} fill={colorOf(s.name)} stroke="var(--sheet)" strokeWidth={2} />
          <circle cx={x2} cy={y(s.adjMean)} r={6} fill={colorOf(s.name)} stroke="var(--sheet)" strokeWidth={2} />
          <text x={x1 - 14} y={rawY.get(s.name)! + 5} textAnchor="end" fontSize={15}>
            {book(s.name)} <tspan fontWeight={650}>{n1(s.rawMean)}</tspan>
          </text>
          <text x={x2 + 14} y={adjY.get(s.name)! + 5} fontSize={15} fontWeight={s.adjRank === 1 ? 700 : 400}>
            <tspan fontWeight={650}>{n1(s.adjMean)}</tspan> {book(s.name)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Pairs() {
  const { t, analysis, book } = useApp();
  const m = t.textbooks;
  const pairs = analysis.textbooks.pairs;
  const extent = Math.max(4, ...pairs.flatMap((p) => [Math.abs(p.low), Math.abs(p.high)])) * 1.1;
  const pos = (v: number) => ((v + extent) / (2 * extent)) * 100;
  return (
    <div>
      {pairs.map((p) => (
        <div className="pair" key={`${p.a}-${p.b}`}>
          <span>{m.pairVs(book(p.a), book(p.b))}</span>
          <Tip className="ptrack" text={`${signed(p.diff)} (${n1(p.low)}…${n1(p.high)}), p = ${p.p < 0.001 ? '<0,001' : n1(p.p * 100) + '%'}`}>
            <span className="zero" style={{ left: `${pos(0)}%` }} />
            <span className="span" style={{ left: `${pos(p.low)}%`, width: `${pos(p.high) - pos(p.low)}%` }} />
            <span className="mid" style={{ left: `${pos(p.diff)}%` }} />
          </Tip>
          <span>
            <span className="num" style={{ fontWeight: 650 }}>{signed(p.diff)}</span>{' '}
            <span className={`verdict ${p.verdict}`}>{m.verdict[p.verdict]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function heatColor(v: number): { background: string; color: string } {
  const a = Math.min(1, Math.abs(v) / 10);
  const from = [241, 243, 247];
  const to = v >= 0 ? [38, 56, 191] : [196, 99, 10];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * a));
  return { background: `rgb(${c.join(',')})`, color: a > 0.55 ? '#fff' : 'var(--ink)' };
}

function Heat({ stats }: { stats: TextbookStat[] }) {
  const { analysis, book, topicName } = useApp();
  const lookup = new Map<string, TopicBookCell>(analysis.textbooks.cells.map((c) => [`${c.topicId}|${c.textbook}`, c]));
  return (
    <div className="heat" style={{ gridTemplateColumns: `minmax(220px, 1fr) repeat(${stats.length}, minmax(84px, 110px))` }}>
      <span />
      {stats.map((s) => <span key={s.name} className="h">{book(s.name)}</span>)}
      {analysis.topics.flatMap((topic) => [
        <span key={topic.id} className="t">{topicName(topic.id)}</span>,
        ...stats.map((s) => {
          const c = lookup.get(`${topic.id}|${s.name}`);
          if (!c) return <span key={`${topic.id}${s.name}`} />;
          return (
            <Tip
              key={`${topic.id}${s.name}`}
              className={`c ${c.significant ? 'sig' : ''}`}
              style={heatColor(c.effect)}
              text={`${book(s.name)}, ${topicName(topic.id)}: ${signed(c.effect)} (${n1(c.low)}…${n1(c.high)})`}
            >
              {signed(c.effect)}
            </Tip>
          );
        }),
      ])}
    </div>
  );
}
