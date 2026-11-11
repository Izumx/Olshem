import type { Dataset } from '../engine/types';

/**
 * Keeps the uploaded dataset in this browser's IndexedDB, so a page reload
 * during a demo does not fall back to the sample data. Nothing leaves the
 * device. Bump VERSION whenever the Dataset shape changes.
 */
const DB_NAME = 'olshem';
const STORE = 'datasets';
const KEY = 'uploaded';
const VERSION = 1;

interface Stored {
  version: number;
  savedAt: number;
  dataset: Dataset;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = action(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** Accepts only a record written by this version of the app. */
export function readStored(value: unknown): Dataset | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<Stored>;
  const d = s.dataset;
  if (s.version !== VERSION || !d || d.source !== 'upload') return null;
  if (!Array.isArray(d.rows) || !d.rows.length || !Array.isArray(d.topics) || !d.title) return null;
  return d;
}

export async function loadDataset(): Promise<Dataset | null> {
  try {
    return readStored(await run('readonly', (s) => s.get(KEY)));
  } catch {
    // Private mode or blocked storage: the app still works, just without memory.
    return null;
  }
}

export async function saveDataset(dataset: Dataset | null): Promise<void> {
  try {
    if (dataset) {
      const record: Stored = { version: VERSION, savedAt: Date.now(), dataset };
      await run('readwrite', (s) => s.put(record, KEY));
    } else {
      await run('readwrite', (s) => s.delete(KEY));
    }
  } catch {
    // Same as above: losing persistence must never break the analysis.
  }
}
