import { describe, expect, it } from 'vitest';
import { mapColumns, parseDelimited, tableToDataset } from './import';

describe('file import', () => {
  it('reads semicolons, quotes, a BOM and CRLF', () => {
    const t = parseDelimited('﻿а;б\r\n"x;1";"он сказал ""да"""\r\n');
    expect(t).toEqual([['а', 'б'], ['x;1', 'он сказал "да"']]);
  });

  it('recognises Russian and Kazakh headers', () => {
    const c = mapColumns(['Ученик', 'Сынып', 'Оқулық', 'Тақырып', 'Балл', 'Входной балл']);
    expect(c).toMatchObject({ student: 0, class: 1, textbook: 2, topic: 3, score: 4, baseline: 5 });
  });

  it('names the missing required columns', () => {
    const { dataset, report } = tableToDataset([['ученик', 'балл'], ['a', '50']], 'f.csv');
    expect(dataset).toBeNull();
    expect(report.missingRequired).toEqual(['class', 'textbook', 'topic']);
  });

  it('drops bad rows, counts why, and rescales by max score', () => {
    const { dataset, report } = tableToDataset(
      [
        ['ученик', 'класс', 'учебник', 'тема', 'балл', 'максимум'],
        ['s1', '8А', 'K', 'T1', '15', '20'],
        ['s1', '8А', 'K', 'T1', '10', '20'],
        ['s2', '8А', 'K', 'T1', '', '20'],
        ['s3', '8А', 'K', 'T1', '30', '20'],
      ],
      'f.csv',
    );
    expect(dataset!.rows).toHaveLength(1);
    expect(dataset!.rows[0].score).toBe(75);
    expect(report.dropped).toEqual({ missing: 1, badScore: 1, duplicates: 1 });
  });

  it('warns when students are listed by full name', () => {
    const { report } = tableToDataset(
      [['ученик', 'класс', 'учебник', 'тема', 'балл'], ['Асанов Ержан', '8А', 'K', 'T1', '70']],
      'f.csv',
    );
    expect(report.warnings).toContain('names');
  });
});
