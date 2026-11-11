'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { Ruled } from '@/components/Shell';
import type { Decision } from '@/lib/engine/types';
import { n1, pct, signed } from '@/lib/i18n';

export default function Overview() {
  const { t, analysis, topicName, book } = useApp();
  const o = t.overview;
  const list = (ids: string[]) => ids.map((id) => `«${topicName(id)}»`).join(', ');

  const first = analysis.decisions[0];
  const rootDecision = analysis.decisions.find((d) => d.kind === 'root');
  let hero = o.heroPlain;
  if (first?.kind === 'textbook' && first.reversal && first.rawLeader) hero = o.heroReversal(book(first.rawLeader), book(first.best));
  else if (first?.kind === 'textbook') hero = o.heroBest(book(first.best));
  else if (rootDecision?.kind === 'root') hero = o.heroRoot(topicName(rootDecision.rootId));

  const render = (d: Decision): { note: ReactNode; title: string; body: ReactNode; href: string } => {
    switch (d.kind) {
      case 'textbook':
        return {
          note: d.reversal ? o.noteLeader : o.noteTextbook(n1(d.g)),
          title: o.textbookTitle(book(d.best), book(d.other)),
          body: (
            <>
              {o.textbookBody(book(d.best), book(d.other), n1(d.diff), n1(d.low), n1(d.high))}{' '}
              {d.reversal && d.rawLeader ? o.textbookReversal(book(d.rawLeader)) : null}
              {!d.adjusted ? o.textbookUnadjusted : null}
            </>
          ),
          href: '/textbooks',
        };
      case 'textbook_none':
        return { note: o.noteNone, title: o.textbookNoneTitle, body: d.adjusted ? o.textbookNoneBody : o.textbookUnadjusted, href: '/textbooks' };
      case 'root':
        return {
          note: o.noteRoot,
          title: o.rootTitle(topicName(d.rootId)),
          body: o.rootBody(list(d.targets), pct(d.masteredIf), pct(d.masteredIfNot)),
          href: '/topics',
        };
      case 'hours':
        return {
          note: o.noteHours,
          title: o.hoursTitle(d.moved),
          body: o.hoursBody(list(d.add), list(d.cut), signed(d.weakGain), signed(d.gain)),
          href: '/hours',
        };
      case 'no_hours':
        return { note: o.noteNoHours, title: o.noHoursTitle, body: o.noHoursBody(list(d.topicIds)), href: '/topics' };
    }
  };

  return (
    <>
      <Ruled note={o.pageTitle}>
        <h1 className="hero">{hero}</h1>
        <p className="lead">{o.heroSub}</p>
      </Ruled>

      <div style={{ height: 48 }} />

      <Ruled>
        <h2 className="section-title">{o.decisions}</h2>
      </Ruled>
      {analysis.decisions.map((d) => {
        const r = render(d);
        return (
          <Ruled key={d.kind} note={r.note}>
            <article className="decision">
              <h2>{r.title}</h2>
              <p>{r.body}</p>
              <Link className="link" href={r.href}>{o.open}</Link>
            </article>
          </Ruled>
        );
      })}
    </>
  );
}
