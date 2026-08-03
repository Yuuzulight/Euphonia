// Browser-mode storage: IndexedDB standing in for the desktop app's
// <userData>/recordings.json + audio/ + analysis/<id>-insight.json. Plain
// wrapper over the native IndexedDB API -- no new dependency for what's a
// handful of get/put/delete operations across three small object stores.

import type { Recording, GeneratedInsight } from "../types";

const DB_NAME = "euphonia-browser";
const DB_VERSION = 1;
const STORE_RECORDINGS = "recordings";
const STORE_AUDIO = "audio";
const STORE_INSIGHTS = "insights";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDINGS)) {
        db.createObjectStore(STORE_RECORDINGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_INSIGHTS)) {
        db.createObjectStore(STORE_INSIGHTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllRecordings(): Promise<Recording[]> {
  const db = await openDb();
  const all = await tx<Recording[]>(db, STORE_RECORDINGS, "readonly", (s) => s.getAll());
  return all.sort((a, b) => a.id - b.id);
}

export async function putRecording(rec: Recording): Promise<void> {
  const db = await openDb();
  await tx(db, STORE_RECORDINGS, "readwrite", (s) => s.put(rec));
}

export async function deleteRecordingRow(id: number): Promise<void> {
  const db = await openDb();
  await tx(db, STORE_RECORDINGS, "readwrite", (s) => s.delete(id));
  await tx(db, STORE_AUDIO, "readwrite", (s) => s.delete(id));
  await tx(db, STORE_INSIGHTS, "readwrite", (s) => s.delete(id));
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  await tx(db, STORE_RECORDINGS, "readwrite", (s) => s.clear());
  await tx(db, STORE_AUDIO, "readwrite", (s) => s.clear());
  await tx(db, STORE_INSIGHTS, "readwrite", (s) => s.clear());
}

export async function nextRecordingId(): Promise<number> {
  const all = await getAllRecordings();
  return (all.reduce((max, r) => Math.max(max, r.id), 0)) + 1;
}

export async function putAudioBlob(id: number, blob: Blob, mimeType: string): Promise<void> {
  const db = await openDb();
  await tx(db, STORE_AUDIO, "readwrite", (s) => s.put({ id, blob, mimeType }));
}

/** Object URLs are per-session (not persisted) -- caller owns revoking them. */
export async function getAudioObjectUrl(id: number): Promise<string | null> {
  const db = await openDb();
  const row = await tx<{ id: number; blob: Blob; mimeType: string } | undefined>(
    db, STORE_AUDIO, "readonly", (s) => s.get(id),
  );
  return row ? URL.createObjectURL(row.blob) : null;
}

export async function getInsight(id: number): Promise<GeneratedInsight | null> {
  const db = await openDb();
  const row = await tx<(GeneratedInsight & { id: number }) | undefined>(
    db, STORE_INSIGHTS, "readonly", (s) => s.get(id),
  );
  return row ?? null;
}

export async function putInsight(id: number, insight: GeneratedInsight): Promise<void> {
  const db = await openDb();
  await tx(db, STORE_INSIGHTS, "readwrite", (s) => s.put({ ...insight, id }));
}
