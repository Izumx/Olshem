import type { Cell, ClassInfo, Cube, Dataset } from './types';
import { mean } from './stats';

function mode(counts: Map<string, number>): string {
  let best = '';
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

interface CellAcc {
  sum: number;
  sq: number;
  n: number;
  hours: number[];
}

interface ClassAcc {
  schools: Map<string, number>;
  books: Map<string, number>;
  students: Set<string>;
  baselines: Map<string, number>;
  cells: Map<number, CellAcc>;
}

/** Rolls raw rows up into the class-by-topic table every analysis reads from. */
export function buildCube(ds: Dataset): Cube {
  const topics = [...ds.topics].sort((a, b) => a.order - b.order);
  const topicIndex = new Map(topics.map((t, i) => [t.id, i]));
  const classes = new Map<string, ClassAcc>();
  const students = new Map<string, Float32Array>();
  const studentBaseline = new Map<string, number>();

  for (const r of ds.rows) {
    const ti = topicIndex.get(r.topicId);
    if (ti === undefined) continue;
    let c = classes.get(r.classId);
    if (!c) {
      c = { schools: new Map(), books: new Map(), students: new Set(), baselines: new Map(), cells: new Map() };
      classes.set(r.classId, c);
    }
    c.schools.set(r.schoolId, (c.schools.get(r.schoolId) ?? 0) + 1);
    c.books.set(r.textbook, (c.books.get(r.textbook) ?? 0) + 1);
    c.students.add(r.studentId);
    if (r.baseline !== null) {
      c.baselines.set(r.studentId, r.baseline);
      studentBaseline.set(r.studentId, r.baseline);
    }

    let cell = c.cells.get(ti);
    if (!cell) {
      cell = { sum: 0, sq: 0, n: 0, hours: [] };
      c.cells.set(ti, cell);
    }
    cell.sum += r.score;
    cell.sq += r.score * r.score;
    cell.n += 1;
    if (r.hours !== null) cell.hours.push(r.hours);

    let s = students.get(r.studentId);
    if (!s) {
      s = new Float32Array(topics.length).fill(NaN);
      students.set(r.studentId, s);
    }
    s[ti] = r.score;
  }

  const classInfos: ClassInfo[] = [];
  const cells: (Cell | null)[][] = [];
  let hoursSeen = 0;
  let baselineSeen = 0;

  for (const [id, c] of classes) {
    const row: (Cell | null)[] = topics.map((_, ti) => {
      const a = c.cells.get(ti);
      if (!a || !a.n) return null;
      const m = a.sum / a.n;
      const hours = a.hours.length ? mean(a.hours) : null;
      if (hours !== null) hoursSeen++;
      return {
        mean: m,
        n: a.n,
        variance: a.n > 1 ? Math.max(0, (a.sq - a.n * m * m) / (a.n - 1)) : 0,
        hours,
      };
    });
    const present = row.filter((x): x is Cell => x !== null);
    if (!present.length) continue;
    const baselines = [...c.baselines.values()];
    if (baselines.length) baselineSeen++;
    classInfos.push({
      id,
      schoolId: mode(c.schools),
      textbook: mode(c.books),
      n: c.students.size,
      baseline: baselines.length ? mean(baselines) : null,
      overall: mean(present.map((x) => x.mean)),
    });
    cells.push(row);
  }

  const totalCells = cells.flat().filter(Boolean).length;
  return {
    topics,
    textbooks: [...new Set(classInfos.map((c) => c.textbook))].sort((a, b) => a.localeCompare(b)),
    classes: classInfos,
    cells,
    students: [...students.values()],
    studentBaselines: [...students.keys()].map((id) => studentBaseline.get(id) ?? NaN),
    nSchools: new Set(classInfos.map((c) => c.schoolId)).size,
    hasBaseline: classInfos.length > 0 && baselineSeen / classInfos.length >= 0.8,
    hasHours: totalCells > 0 && hoursSeen / totalCells >= 0.7,
  };
}
