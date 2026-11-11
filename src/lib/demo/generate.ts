import type { Dataset, GroundTruth, Row, TopicMeta } from '../engine/types';
import { mean, rng } from '../engine/stats';

/**
 * Synthetic data with known answers. Nothing here describes real schools or
 * real textbooks: the textbook names are placeholders. Stronger schools are
 * deliberately given textbook A, so a raw ranking misleads, which is what
 * school data looks like in practice.
 */

interface TopicSpec {
  id: string;
  ru: string;
  kk: string;
  planned: number;
  base: number;
  slope: number;
  teacherSd: number;
}

const TOPICS: TopicSpec[] = [
  { id: 't01', ru: 'Квадратный корень и его свойства', kk: 'Квадрат түбір және оның қасиеттері', planned: 10, base: 74, slope: 8, teacherSd: 2 },
  { id: 't02', ru: 'Преобразование иррациональных выражений', kk: 'Иррационал өрнектерді түрлендіру', planned: 10, base: 60, slope: 13, teacherSd: 2.5 },
  { id: 't03', ru: 'Квадратные уравнения и формула корней', kk: 'Квадрат теңдеулер және түбірлер формуласы', planned: 8, base: 64, slope: 11, teacherSd: 2 },
  { id: 't04', ru: 'Теорема Виета', kk: 'Виет теоремасы', planned: 5, base: 81, slope: 2, teacherSd: 1.5 },
  { id: 't05', ru: 'Разложение квадратного трёхчлена', kk: 'Квадрат үшмүшені көбейткіштерге жіктеу', planned: 6, base: 66, slope: 9, teacherSd: 2 },
  { id: 't06', ru: 'Рациональные уравнения', kk: 'Рационал теңдеулер', planned: 8, base: 51, slope: 1, teacherSd: 10 },
  { id: 't07', ru: 'Текстовые задачи на квадратные уравнения', kk: 'Квадрат теңдеулерге келтірілетін мәтінді есептер', planned: 9, base: 43, slope: 30, teacherSd: 2.5 },
  { id: 't08', ru: 'Функция y = ax² и её график', kk: 'y = ax² функциясы және оның графигі', planned: 8, base: 72, slope: 7, teacherSd: 2 },
  { id: 't09', ru: 'График квадратичной функции', kk: 'Квадраттық функцияның графигі', planned: 10, base: 49, slope: 9, teacherSd: 2.5 },
  { id: 't10', ru: 'Квадратные неравенства', kk: 'Квадрат теңсіздіктер', planned: 10, base: 50, slope: 12, teacherSd: 2.5 },
  { id: 't11', ru: 'Метод интервалов', kk: 'Интервалдар әдісі', planned: 8, base: 62, slope: 10, teacherSd: 2 },
  { id: 't12', ru: 'Статистика и обработка данных', kk: 'Статистика және деректерді өңдеу', planned: 10, base: 83, slope: 2, teacherSd: 1.5 },
];

/** Real dependencies: how much of a topic's deviation carries into a later one. */
const SPILL: { from: string; to: string; k: number }[] = [
  { from: 't01', to: 't02', k: 0.4 },
  { from: 't03', to: 't05', k: 0.35 },
  { from: 't03', to: 't07', k: 0.3 },
  { from: 't09', to: 't10', k: 0.65 },
  { from: 't10', to: 't11', k: 0.5 },
];

export const DEMO_BOOKS = ['Учебник A', 'Учебник B', 'Учебник C'];

/** Direct textbook effect in points. */
function bookEffect(book: string, topic: string): number {
  const special: Record<string, Record<string, number>> = {
    t09: { 'Учебник A': -4, 'Учебник B': 9, 'Учебник C': -5 },
    t03: { 'Учебник A': 5, 'Учебник B': -1, 'Учебник C': -4 },
    t12: { 'Учебник A': -1, 'Учебник B': 0, 'Учебник C': 4 },
  };
  const base: Record<string, number> = { 'Учебник A': -0.5, 'Учебник B': 3, 'Учебник C': -2 };
  return special[topic]?.[book] ?? base[book];
}

function computeTruth(): GroundTruth {
  const raw: Record<string, Record<string, number>> = {};
  for (const book of DEMO_BOOKS) {
    raw[book] = {};
    for (const t of TOPICS) {
      let v = bookEffect(book, t.id);
      for (const s of SPILL.filter((e) => e.to === t.id)) v += s.k * raw[book][s.from];
      raw[book][t.id] = v;
    }
  }
  const textbookTopic: GroundTruth['textbookTopic'] = {};
  for (const book of DEMO_BOOKS) textbookTopic[book] = {};
  for (const t of TOPICS) {
    const avg = mean(DEMO_BOOKS.map((b) => raw[b][t.id]));
    for (const book of DEMO_BOOKS) textbookTopic[book][t.id] = raw[book][t.id] - avg;
  }
  const textbookOverall: GroundTruth['textbookOverall'] = {};
  for (const book of DEMO_BOOKS) textbookOverall[book] = mean(TOPICS.map((t) => textbookTopic[book][t.id]));
  return { textbookTopic, textbookOverall, slopes: Object.fromEntries(TOPICS.map((t) => [t.id, t.slope])) };
}

export function generateDemo(seed = 20261109): Dataset {
  const r = rng(seed);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));

  const roster: { type: 'gym' | 'city' | 'rural'; book: string }[] = [
    ...Array.from({ length: 8 }, () => ({ type: 'gym' as const, book: DEMO_BOOKS[0] })),
    ...Array.from({ length: 3 }, () => ({ type: 'city' as const, book: DEMO_BOOKS[0] })),
    ...Array.from({ length: 1 }, () => ({ type: 'gym' as const, book: DEMO_BOOKS[1] })),
    ...Array.from({ length: 6 }, () => ({ type: 'city' as const, book: DEMO_BOOKS[1] })),
    ...Array.from({ length: 4 }, () => ({ type: 'rural' as const, book: DEMO_BOOKS[1] })),
    ...Array.from({ length: 3 }, () => ({ type: 'city' as const, book: DEMO_BOOKS[2] })),
    ...Array.from({ length: 7 }, () => ({ type: 'rural' as const, book: DEMO_BOOKS[2] })),
  ];
  const typeMean = { gym: 10, city: 0, rural: -7 };

  const rows: Row[] = [];
  roster.forEach((school, si) => {
    const schoolId = `school-${String(si + 1).padStart(2, '0')}`;
    const schoolTheta = typeMean[school.type] + r.normal(0, 2.5);
    const nClasses = 2 + Math.floor(r.uniform() * 3);

    for (let c = 0; c < nClasses; c++) {
      const classId = `${schoolId}-8${String.fromCharCode(1040 + c)}`;
      const classTheta = schoolTheta + r.normal(0, 2.5);
      const teacher: Record<string, number> = {};
      const hours: Record<string, number> = {};
      for (const t of TOPICS) {
        teacher[t.id] = r.normal(0, t.teacherSd);
        hours[t.id] = Math.max(2, Math.round(t.planned * Math.exp(r.normal(0, 0.2))));
      }

      const size = 20 + Math.floor(r.uniform() * 9);
      for (let s = 0; s < size; s++) {
        const studentId = `${classId}-${String(s + 1).padStart(2, '0')}`;
        const theta = classTheta + r.normal(0, 9);
        const baseline = clamp(58 + theta + r.normal(0, 6));
        const deviation: Record<string, number> = {};

        for (const t of TOPICS) {
          let d =
            bookEffect(school.book, t.id) +
            t.slope * Math.log(hours[t.id] / t.planned) +
            teacher[t.id] +
            r.normal(0, 10);
          for (const e of SPILL.filter((x) => x.to === t.id)) d += e.k * deviation[e.from];
          deviation[t.id] = d;
          if (r.uniform() < 0.03) continue;
          rows.push({
            studentId,
            classId,
            schoolId,
            textbook: school.book,
            topicId: t.id,
            score: Math.round(clamp(t.base + theta + d) * 10) / 10,
            hours: hours[t.id],
            baseline: Math.round(baseline * 10) / 10,
          });
        }
      }
    }
  });

  const topics: TopicMeta[] = TOPICS.map((t, i) => ({ id: t.id, name: { ru: t.ru, kk: t.kk }, order: i }));
  return {
    source: 'demo',
    title: { ru: 'Алгебра, 8 класс', kk: 'Алгебра, 8-сынып' },
    rows,
    topics,
    truth: computeTruth(),
  };
}
