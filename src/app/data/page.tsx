'use client';

import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import { useApp } from '@/components/AppProvider';
import { Ruled } from '@/components/Shell';
import { datasetToCsv, download, OPTIONAL, parseDelimited, REQUIRED, tableToDataset, type Field, type ImportReport } from '@/lib/data/import';
import { generateDemo } from '@/lib/demo/generate';

async function readTable(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsx } = await import('read-excel-file/browser');
    const sheets = await readXlsx(file);
    const rows = sheets[0]?.data ?? [];
    return rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))));
  }
  return parseDelimited(await file.text());
}

export default function DataPage() {
  const { t, dataset, setDataset } = useApp();
  const m = t.data;
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState(false);
  const [drag, setDrag] = useState(false);
  const [applied, setApplied] = useState(false);
  const [subject, setSubject] = useState<string | undefined>();
  const source = useRef<{ table: string[][]; name: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const apply = (table: string[][], name: string, chosen?: string) => {
    const { dataset: next, report: r } = tableToDataset(table, name, chosen);
    setReport(r);
    setApplied(Boolean(next));
    if (next) setDataset(next);
  };

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(false);
    setReport(null);
    setApplied(false);
    setSubject(undefined);
    try {
      const table = await readTable(file);
      source.current = { table, name: file.name };
      apply(table, file.name);
    } catch {
      setError(true);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void handle(e.dataTransfer.files[0]);
  };

  const fieldName = (f: Field) => m.fields[f][0];

  return (
    <>
      <Ruled>
        <h1 className="title">{m.title}</h1>
        <p className="lead">{m.lead}</p>
      </Ruled>

      <Ruled>
        <label
          className={`drop ${drag ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input
            ref={input}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx"
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
            onChange={(e) => void handle(e.target.files?.[0])}
          />
          <span>{m.drop}</span>
          <br />
          <span className="btn" style={{ marginTop: 12 }}>{m.choose}</span>
        </label>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={() => download('primer-rezultatov.csv', datasetToCsv(generateDemo()))}>{m.sample}</button>
          {dataset.source === 'upload' && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => { setDataset(null); setReport(null); setApplied(false); }}
            >
              {m.backDemo}
            </button>
          )}
        </div>
      </Ruled>

      {error && (
        <Ruled>
          <p className="warn" role="alert">{m.readError}</p>
        </Ruled>
      )}

      {report && (
        <Ruled>
          <div className="sheet">
            <h2 className="section-title">{m.reportTitle}</h2>
            <ul className="report-list" aria-live="polite">
              {report.missingRequired.length > 0 ? (
                <li className="warn">{m.missingRequired(report.missingRequired.map(fieldName).join(', '))}</li>
              ) : (
                <li>{m.kept(report.kept, report.total)}</li>
              )}
              {report.dropped.missing > 0 && <li>{m.dropped.missing(report.dropped.missing)}</li>}
              {report.dropped.badScore > 0 && <li>{m.dropped.badScore(report.dropped.badScore)}</li>}
              {report.dropped.duplicates > 0 && <li>{m.dropped.duplicates(report.dropped.duplicates)}</li>}
              {report.warnings.map((w) => <li key={w} className="warn">{m.warn[w]}</li>)}
            </ul>
            {report.subjects.length > 1 && (
              <label style={{ display: 'block', marginTop: 12 }}>
                {m.subjectPick}{' '}
                <select
                  value={subject ?? report.subjects[0]}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (source.current) apply(source.current.table, source.current.name, e.target.value);
                  }}
                >
                  {report.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
            {applied && (
              <p style={{ marginTop: 12 }}>
                <span className="ok">{m.applied}</span>{' '}
                <Link href="/" style={{ color: 'var(--pen)', fontWeight: 500 }}>{m.openResults}</Link>
              </p>
            )}
          </div>
        </Ruled>
      )}

      <Ruled>
        <h2 className="section-title">{m.columnsTitle}</h2>
        <ul className="fields">
          {[...REQUIRED, ...OPTIONAL].map((f) => (
            <li key={f}>
              <b>{m.fields[f][0]}</b>{' '}
              <span className="small">({REQUIRED.includes(f) ? m.required : m.optional}) {m.fields[f][1]}</span>
            </li>
          ))}
        </ul>
      </Ruled>
    </>
  );
}
