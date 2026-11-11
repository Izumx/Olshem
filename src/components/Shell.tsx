'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from './AppProvider';

const LINKS = [
  ['/', 'overview'],
  ['/topics', 'topics'],
  ['/textbooks', 'textbooks'],
  ['/hours', 'hours'],
  ['/report', 'report'],
  ['/data', 'data'],
  ['/method', 'method'],
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { t, lang, setLang, dataset, analysis } = useApp();
  const path = usePathname();

  return (
    <div className="page">
      <header className="top">
        <Link href="/" className="brand" aria-label={t.tagline}>
          {t.brand}
        </Link>
        <div className="nav-row">
          <nav className="nav">
            {LINKS.map(([href, key]) => (
              <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>
                {t.nav[key]}
              </Link>
            ))}
          </nav>
          <div className="lang" role="group" aria-label="Язык / Тіл">
            <button type="button" aria-pressed={lang === 'ru'} onClick={() => setLang('ru')}>RU</button>
            <button type="button" aria-pressed={lang === 'kk'} onClick={() => setLang('kk')}>KZ</button>
          </div>
        </div>
      </header>
      <div className="source">
        <p>
          {dataset.title[lang]}, {t.scope(analysis.nSchools, analysis.nClasses, analysis.nStudents)}.{' '}
          {dataset.source === 'demo' ? (
            <>
              {t.demoBanner} <Link href="/data">{t.demoUpload}</Link>
            </>
          ) : (
            t.uploadBanner(dataset.title[lang])
          )}
        </p>
      </div>
      <main>{children}</main>
    </div>
  );
}

/** One line of the notebook: a remark in the margin, the work to its right. */
export function Ruled({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className="ruled">
      <div className="note">{note}</div>
      <div className="work">{children}</div>
    </div>
  );
}
