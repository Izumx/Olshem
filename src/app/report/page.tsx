'use client';

import { useApp } from '@/components/AppProvider';
import { Ruled } from '@/components/Shell';
import type { Decision } from '@/lib/engine/types';
import { n0, n1, pct, signed, signed0 } from '@/lib/i18n';

export default function Report() {
  const { t, lang, analysis, topicName, book } = useApp();
  const m = t.report;
  const o = t.overview;
  const list = (ids: string[]) => ids.map((id) => `«${topicName(id)}»`).join(', ');

  const line = (d: Decision): [string, string] => {
    switch (d.kind) {
      case 'textbook':
        return [
          o.textbookTitle(book(d.best), book(d.other)),
          `${o.textbookBody(book(d.best), book(d.other), n1(d.diff), n1(d.low), n1(d.high))}${d.reversal && d.rawLeader ? ` ${o.textbookReversal(book(d.rawLeader))}` : ''}${!d.adjusted ? ` ${o.textbookUnadjusted}` : ''}`,
        ];
      case 'textbook_none':
        return [o.textbookNoneTitle, d.adjusted ? o.textbookNoneBody : o.textbookUnadjusted];
      case 'root':
        return [o.rootTitle(topicName(d.rootId)), o.rootBody(list(d.targets), pct(d.masteredIf), pct(d.masteredIfNot))];
      case 'hours':
        return [o.hoursTitle(d.moved), o.hoursBody(list(d.add), list(d.cut), signed(d.weakGain), signed(d.gain))];
      case 'no_hours':
        return [o.noHoursTitle, o.noHoursBody(list(d.topicIds))];
    }
  };

  const hard = analysis.topics.filter((x) => x.diagnosis);
  const changed = analysis.plan?.rows.filter((r) => r.delta !== 0) ?? [];

  return (
    <>
      <Ruled>
        <div className="btn-row no-print" style={{ marginBottom: 16 }}>
          <button type="button" className="btn" onClick={() => window.print()}>{m.print}</button>
        </div>
      </Ruled>
      <Ruled>
        <article className="sheet protocol">
          <h1 className="title">{m.title}</h1>
          <dl className="meta">
            <dt>{m.subject}</dt><dd>{analysis.title[lang]}</dd>
            <dt>{m.basis}</dt><dd>{t.scope(analysis.nSchools, analysis.nClasses, analysis.nStudents)}{analysis.source === 'demo' ? `. ${t.demoBanner}` : ''}</dd>
            <dt>{m.threshold}</dt><dd>{m.thresholdValue(analysis.settings.masteryThreshold)}</dd>
          </dl>

          <h2>{m.decisions}</h2>
          <ol>
            {analysis.decisions.map((d) => {
              const [title, body] = line(d);
              return (
                <li key={d.kind}>
                  <b>{title}.</b> {body}
                </li>
              );
            })}
          </ol>

          {hard.length > 0 && (
            <>
              <h2>{m.hard}</h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 0 }}>{t.hours.col.topic}</th>
                    <th className="r">{t.topics.colMastered}</th>
                    <th>{t.topics.cause}</th>
                    <th>{t.topics.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {hard.map((x) => (
                    <tr key={x.id}>
                      <td style={{ paddingLeft: 0 }}>{x.name[lang]}</td>
                      <td className="r num">{pct(x.masteredRate)}</td>
                      <td>{t.diagnosis.label[x.diagnosis!.kind]}</td>
                      <td>{t.diagnosis.text(x.diagnosis!, topicName, book)[1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {changed.length > 0 && (
            <>
              <h2>{m.hours}</h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 0 }}>{t.hours.col.topic}</th>
                    <th className="r">{t.hours.col.now}</th>
                    <th className="r">{t.hours.col.plan}</th>
                    <th className="r">{t.hours.col.delta}</th>
                    <th>{t.hours.col.why}</th>
                  </tr>
                </thead>
                <tbody>
                  {changed.map((r) => (
                    <tr key={r.topicId}>
                      <td style={{ paddingLeft: 0 }}>{topicName(r.topicId)}</td>
                      <td className="r num">{n0(r.current)}</td>
                      <td className="r num">{n0(r.recommended)}</td>
                      <td className="r num">{signed0(r.delta)}</td>
                      <td>{t.hours.reason[r.reason]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2>{m.limits}</h2>
          <p style={{ maxWidth: '48em' }}>{m.limitsBody}</p>

          <div className="sign">
            <div>{m.sign}</div>
            <div>{m.date}</div>
            <div>{m.chair}</div>
          </div>
        </article>
      </Ruled>
    </>
  );
}
