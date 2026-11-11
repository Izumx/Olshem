'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { Ruled } from '@/components/Shell';
import { analyze } from '@/lib/engine/analyze';
import { generateDemo } from '@/lib/demo/generate';
import { n1, pct } from '@/lib/i18n';
import { mean } from '@/lib/engine/stats';

interface Check {
  books: number;
  slopes: number;
  error: number;
  coverage: number;
}

export default function Method() {
  const { t } = useApp();
  const m = t.method;
  const [check, setCheck] = useState<Check | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const runs = Array.from({ length: 10 }, (_, i) => analyze(generateDemo((i + 1) * 977)).validation!);
      setCheck({
        books: mean(runs.map((r) => r.bookTopicR)),
        slopes: mean(runs.map((r) => r.slopeR)),
        error: mean(runs.map((r) => r.bookOverallError)),
        coverage: mean(runs.map((r) => r.coverage)),
      });
    }, 50);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <Ruled>
        <h1 className="title">{m.title}</h1>
      </Ruled>
      <Ruled>
        <div className="method-list">
          {m.blocks.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
      </Ruled>
      <Ruled>
        <div className="sheet">
          <h2 className="section-title">{m.checkTitle}</h2>
          <p style={{ maxWidth: '44em', marginBottom: 12 }}>{m.checkLead}</p>
          <dl className="facts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div><dt>{m.check.books}</dt><dd className="num">{check ? check.books.toFixed(2).replace('.', ',') : '…'}</dd></div>
            <div><dt>{m.check.slopes}</dt><dd className="num">{check ? check.slopes.toFixed(2).replace('.', ',') : '…'}</dd></div>
            <div><dt>{m.check.error}</dt><dd className="num">{check ? n1(check.error) : '…'}</dd></div>
            <div><dt>{m.check.coverage}</dt><dd className="num">{check ? pct(check.coverage) : '…'}</dd></div>
          </dl>
        </div>
      </Ruled>
      <Ruled>
        <h2 className="section-title">{m.limitsTitle}</h2>
        <ul className="limits">
          {m.limits.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </Ruled>
    </>
  );
}
