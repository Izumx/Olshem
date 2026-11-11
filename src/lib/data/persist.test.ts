import { describe, expect, it } from 'vitest';
import { readStored } from './persist';

const dataset = {
  source: 'upload',
  title: { ru: 'f.csv', kk: 'f.csv' },
  rows: [{ studentId: 's', classId: 'c', schoolId: 'c', textbook: 'K', topicId: 'T', score: 50, hours: null, baseline: null }],
  topics: [{ id: 'T', order: 0, name: { ru: 'T', kk: 'T' } }],
};

describe('restoring a saved upload', () => {
  it('accepts a record from this version', () => {
    expect(readStored({ version: 1, savedAt: 0, dataset })).toEqual(dataset);
  });

  it('ignores records from another version, demo data and junk', () => {
    expect(readStored({ version: 0, savedAt: 0, dataset })).toBeNull();
    expect(readStored({ version: 1, savedAt: 0, dataset: { ...dataset, source: 'demo' } })).toBeNull();
    expect(readStored({ version: 1, savedAt: 0, dataset: { ...dataset, rows: [] } })).toBeNull();
    expect(readStored(undefined)).toBeNull();
    expect(readStored('text')).toBeNull();
  });
});
