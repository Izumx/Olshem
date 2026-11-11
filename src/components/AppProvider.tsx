'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { analyze } from '@/lib/engine/analyze';
import type { Analysis, Dataset, Lang } from '@/lib/engine/types';
import { generateDemo } from '@/lib/demo/generate';
import { loadDataset, saveDataset } from '@/lib/data/persist';
import { bookLabel, messages, type Messages } from '@/lib/i18n';

interface AppState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Messages;
  dataset: Dataset;
  setDataset: (d: Dataset | null) => void;
  analysis: Analysis;
  topicName: (id: string) => string;
  book: (name: string) => string;
}

const AppContext = createContext<AppState | null>(null);
const demo = generateDemo();

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ru');
  const [uploaded, setUploaded] = useState<Dataset | null>(null);
  const [restored, setRestored] = useState(false);
  const dataset = uploaded ?? demo;

  // Bring back a file uploaded before a reload, before anything is shown,
  // so the page never flashes the sample data first.
  useEffect(() => {
    let alive = true;
    loadDataset().then((saved) => {
      if (!alive) return;
      if (saved) setUploaded(saved);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setDataset = useCallback((d: Dataset | null) => {
    setUploaded(d);
    void saveDataset(d);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('olshem-lang');
      if (saved === 'kk' || saved === 'ru') setLangState(saved);
    } catch {
      // Storage can be blocked; the default language still works.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'kk' ? 'kk' : 'ru';
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('olshem-lang', l);
    } catch {
      // Language still applies for this visit.
    }
  }, []);

  const analysis = useMemo(() => analyze(dataset), [dataset]);

  const value = useMemo<AppState>(() => {
    const names = new Map(dataset.topics.map((x) => [x.id, x.name[lang]]));
    return {
      lang,
      setLang,
      t: messages[lang],
      dataset,
      setDataset,
      analysis,
      topicName: (id) => names.get(id) ?? id,
      book: (name) => bookLabel(name, lang),
    };
  }, [lang, setLang, dataset, setDataset, analysis]);

  return <AppContext.Provider value={value}>{restored ? children : null}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
