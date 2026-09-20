/**
 * Where the working drawing lives between one visit and the next.
 *
 * A drawing that exists only in a React reducer is gone the moment the tab
 * reloads, and a crash, a stray refresh or a closed laptop then costs an
 * afternoon's drafting. So every change is written, debounced, into the
 * browser's own database, and read back when the application starts.
 *
 * This is the recovery copy, NOT the file. The file is the one the draftsman
 * saved deliberately, on their own disk; this store answers "what was I doing
 * when the tab went away". It holds the drawing as native file text, which
 * means the recovery path and the save path produce exactly the same bytes and
 * exercise the same reader.
 *
 * IndexedDB rather than localStorage for two reasons that matter here: a real
 * drawing runs to megabytes, well past the ~5 MB localStorage ceiling, and an
 * IndexedDB write is a transaction — it lands whole or not at all, so a reload
 * in the middle of a save cannot leave half a drawing behind.
 */

const DB_NAME = "aagento-cad";
const DB_VERSION = 1;
const SESSION_STORE = "session";
const HANDLE_STORE = "handles";
const CURRENT = "current";

export interface SessionRecord {
  /** The drawing as native file text — the same thing a save writes. */
  text: string;
  title: string;
  /** The file it belongs to, when it has one. */
  fileName: string | null;
  /** False when there are changes the file on disk does not have. */
  savedToFile: boolean;
  at: number;
}

export function storageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!storageAvailable()) {
      reject(new Error("This browser has no local database, so drawings cannot be kept between visits."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE);
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The local database could not be opened."));
  });
}

function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = work(tx.objectStore(store));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onabort = tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("The local database refused the write."));
        };
      })
  );
}

/** Writes the recovery copy. One transaction: it lands whole or not at all. */
export function saveSession(record: SessionRecord): Promise<void> {
  return run<IDBValidKey>(SESSION_STORE, "readwrite", (s) => s.put(record, CURRENT)).then(() => undefined);
}

export function readSession(): Promise<SessionRecord | null> {
  return run<SessionRecord | undefined>(SESSION_STORE, "readonly", (s) => s.get(CURRENT)).then((r) => r ?? null);
}

export function clearSession(): Promise<void> {
  return run<undefined>(SESSION_STORE, "readwrite", (s) => s.delete(CURRENT)).then(() => undefined);
}

/**
 * The handle of the file this drawing came from.
 *
 * A file handle survives a reload — the browser stores it — so "Save" after a
 * refresh still writes to the same file on disk instead of asking again. The
 * permission does not survive, and has to be asked for on the next click; that
 * is the browser's rule, not ours.
 */
export function putFileHandle(handle: unknown): Promise<void> {
  return run<IDBValidKey>(HANDLE_STORE, "readwrite", (s) => s.put(handle, CURRENT)).then(() => undefined);
}

export function getFileHandle<T>(): Promise<T | null> {
  return run<T | undefined>(HANDLE_STORE, "readonly", (s) => s.get(CURRENT)).then((r) => r ?? null);
}

export function clearFileHandle(): Promise<void> {
  return run<undefined>(HANDLE_STORE, "readwrite", (s) => s.delete(CURRENT)).then(() => undefined);
}
