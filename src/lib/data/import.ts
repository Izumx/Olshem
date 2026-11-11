import type { Dataset, Row, TopicMeta } from '../engine/types';

export type Field =
  | 'student' | 'class' | 'textbook' | 'topic' | 'score'
  | 'school' | 'baseline' | 'hours' | 'max' | 'order' | 'subject';

export const REQUIRED: Field[] = ['student', 'class', 'textbook', 'topic', 'score'];
export const OPTIONAL: Field[] = ['school', 'baseline', 'hours', 'max', 'order', 'subject'];

const SYNONYMS: Record<Field, string[]> = {
  student: ['student', 'studentid', 'ученик', 'кодученика', 'idученика', 'учащийся', 'оқушы', 'оқушыкоды'],
  class: ['class', 'classid', 'класс', 'сынып'],
  textbook: ['textbook', 'book', 'учебник', 'оқулық'],
  topic: ['topic', 'topicname', 'тема', 'тақырып'],
  score: ['score', 'result', 'балл', 'баллы', 'результат', 'процент', 'ұпай', 'нәтиже'],
  school: ['school', 'schoolid', 'школа', 'мектеп'],
  baseline: ['baseline', 'pretest', 'входнойбалл', 'входной', 'стартовыйбалл', 'бастапқыбалл', 'бастапқы'],
  hours: ['hours', 'часы', 'часов', 'сағат', 'сағаттар'],
  max: ['maxscore', 'max', 'максимум', 'максбалл', 'максимальныйбалл', 'еңжоғарыбалл'],
  order: ['topicorder', 'order', 'порядок', 'порядоктемы', 'номертемы', 'реті', 'тақырыпреті'],
  subject: ['subject', 'предмет', 'пән'],
};

const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-.,:№]/g, '');

export function mapColumns(header: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  const norm = header.map(normalize);
  for (const field of [...REQUIRED, ...OPTIONAL]) {
    const i = norm.findIndex((h) => SYNONYMS[field].includes(h));
    if (i >= 0) out[field] = i;
  }
  return out;
}

export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') >>> 0);
  const delimiter = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.trim().replace(',', '.').replace('%', '');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

export type WarningCode = 'names' | 'noBaseline' | 'noHours' | 'noSchool' | 'oneBook' | 'fewSchools';

export interface ImportReport {
  total: number;
  kept: number;
  dropped: { missing: number; badScore: number; duplicates: number };
  missingRequired: Field[];
  warnings: WarningCode[];
  subjects: string[];
}

const NAME_LIKE = /^\p{Lu}\p{Ll}+\s+\p{Lu}/u;

export function tableToDataset(
  table: string[][],
  fileName: string,
  subject?: string,
): { dataset: Dataset | null; report: ImportReport } {
  const [header = [], ...body] = table;
  const col = mapColumns(header);
  const missingRequired = REQUIRED.filter((f) => col[f] === undefined);
  const subjects = col.subject === undefined
    ? []
    : [...new Set(body.map((r) => (r[col.subject!] ?? '').trim()).filter(Boolean))];
  const report: ImportReport = {
    total: body.length,
    kept: 0,
    dropped: { missing: 0, badScore: 0, duplicates: 0 },
    missingRequired,
    warnings: [],
    subjects,
  };
  if (missingRequired.length) return { dataset: null, report };

  const chosen = subject ?? subjects[0];
  const seen = new Set<string>();
  const rows: Row[] = [];
  const topics = new Map<string, { order: number | null; first: number }>();
  let nameLike = 0;

  const get = (r: string[], f: Field) => (col[f] === undefined ? '' : (r[col[f]!] ?? '').trim());

  body.forEach((r, i) => {
    if (col.subject !== undefined && get(r, 'subject') !== chosen) return;
    const studentId = get(r, 'student');
    const classId = get(r, 'class');
    const textbook = get(r, 'textbook');
    const topic = get(r, 'topic');
    const rawScore = num(get(r, 'score'));
    if (!studentId || !classId || !textbook || !topic || rawScore === null) {
      report.dropped.missing++;
      return;
    }
    const max = num(get(r, 'max'));
    const score = max && max > 0 ? (rawScore / max) * 100 : rawScore;
    if (score < 0 || score > 100) {
      report.dropped.badScore++;
      return;
    }
    const key = `${studentId}\u0000${topic}`;
    if (seen.has(key)) {
      report.dropped.duplicates++;
      return;
    }
    seen.add(key);
    if (NAME_LIKE.test(studentId)) nameLike++;

    const order = num(get(r, 'order'));
    if (!topics.has(topic)) topics.set(topic, { order, first: i });
    const hours = num(get(r, 'hours'));
    const baselineRaw = num(get(r, 'baseline'));
    rows.push({
      studentId,
      classId,
      schoolId: get(r, 'school') || classId,
      textbook,
      topicId: topic,
      score,
      hours: hours !== null && hours > 0 ? hours : null,
      baseline: baselineRaw !== null && baselineRaw >= 0 && baselineRaw <= 100 ? baselineRaw : null,
    });
  });

  report.kept = rows.length;
  if (!rows.length) return { dataset: null, report };

  const metas: TopicMeta[] = [...topics.entries()]
    .sort((a, b) => (a[1].order ?? a[1].first) - (b[1].order ?? b[1].first))
    .map(([name], order) => ({ id: name, name: { ru: name, kk: name }, order }));

  if (nameLike / rows.length > 0.2) report.warnings.push('names');
  if (col.baseline === undefined || rows.every((r) => r.baseline === null)) report.warnings.push('noBaseline');
  if (col.hours === undefined || rows.every((r) => r.hours === null)) report.warnings.push('noHours');
  if (col.school === undefined) report.warnings.push('noSchool');
  const bySchool = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!bySchool.has(r.textbook)) bySchool.set(r.textbook, new Set());
    bySchool.get(r.textbook)!.add(r.schoolId);
  }
  if (bySchool.size < 2) report.warnings.push('oneBook');
  else if ([...bySchool.values()].some((s) => s.size < 3)) report.warnings.push('fewSchools');

  const title = chosen ? `${chosen} (${fileName})` : fileName;
  return {
    dataset: { source: 'upload', title: { ru: title, kk: title }, rows, topics: metas },
    report,
  };
}

const esc = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: (string | number | null)[][]): string {
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

export function datasetToCsv(ds: Dataset): string {
  const name = new Map(ds.topics.map((t) => [t.id, t]));
  return toCsv([
    ['ученик', 'класс', 'школа', 'учебник', 'тема', 'порядок темы', 'балл', 'часы', 'входной балл'],
    ...ds.rows.map((r) => [
      r.studentId, r.classId, r.schoolId, r.textbook,
      name.get(r.topicId)?.name.ru ?? r.topicId,
      (name.get(r.topicId)?.order ?? 0) + 1,
      r.score, r.hours, r.baseline,
    ]),
  ]);
}

export function download(fileName: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
