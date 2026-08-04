/**
 * db.js
 * -----
 * Low-level local persistence. Defines the entire app's IndexedDB schema
 * in one place (so there's a single source of truth for what data the
 * app stores) and exposes small, generic CRUD functions that every
 * module's own data layer builds on top of, rather than each module
 * touching indexedDB directly.
 *
 * If IndexedDB is unavailable (very old browsers, some locked-down
 * embedded webviews) everything transparently falls back to a
 * LocalStorage-backed shim with the same async API, so calling code
 * never has to branch on which backend is active.
 * @module db
 */

const DB_NAME = 'hub-db';
const DB_VERSION = 1;

/** Every object store the app will ever use, defined up front so a
 *  single version-1 install creates the full schema. Later modules
 *  (Notes, QR, Clipboard, AI, Habits, ...) just use the store name
 *  that already matches their domain. */
const STORES = {
  notes: { keyPath: 'id', indexes: [['updatedAt', 'updatedAt'], ['pinned', 'pinned'], ['archived', 'archived'], ['trashed', 'trashed']] },
  clipboardItems: { keyPath: 'id', indexes: [['createdAt', 'createdAt'], ['pinned', 'pinned'], ['category', 'category']] },
  qrCodes: { keyPath: 'id', indexes: [['createdAt', 'createdAt']] },
  aiChats: { keyPath: 'id', indexes: [['updatedAt', 'updatedAt']] },
  aiMessages: { keyPath: 'id', indexes: [['chatId', 'chatId'], ['createdAt', 'createdAt']] },
  habits: { keyPath: 'id', indexes: [['createdAt', 'createdAt']] },
  bookmarks: { keyPath: 'id', indexes: [['createdAt', 'createdAt'], ['tag', 'tag']] },
  journalEntries: { keyPath: 'id', indexes: [['date', 'date']] },
  focusSessions: { keyPath: 'id', indexes: [['startedAt', 'startedAt']] },
  kv: { keyPath: 'key', indexes: [] } // generic settings / preferences store (see storage.js)
};

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;
let useFallback = false;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      useFallback = true;
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [indexName, keyPath] of def.indexes) {
          store.createIndex(indexName, keyPath, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // Corrupt DB, private-browsing restrictions, etc — degrade gracefully
      // instead of leaving the whole app unusable.
      useFallback = true;
      resolve(null);
    };
  });
  return dbPromise;
}

/* ============================================================
   LocalStorage fallback — mirrors the subset of behavior used
   below (get/getAll/put/delete/clear), namespaced per store.
   ============================================================ */
const fallbackKey = (store) => `hub-db.${store}`;

function fallbackReadAll(store) {
  try {
    return JSON.parse(localStorage.getItem(fallbackKey(store)) || '{}');
  } catch {
    return {};
  }
}
function fallbackWriteAll(store, obj) {
  localStorage.setItem(fallbackKey(store), JSON.stringify(obj));
}

/**
 * Inserts or updates a record. The record must include the store's
 * keyPath field (e.g. `id` for most stores, `key` for `kv`).
 * @param {keyof typeof STORES} store
 * @param {Object} record
 */
export async function put(store, record) {
  const db = await openDb();
  const keyPath = STORES[store].keyPath;
  if (useFallback || !db) {
    const all = fallbackReadAll(store);
    all[record[keyPath]] = record;
    fallbackWriteAll(store, all);
    return record;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetches a single record by key.
 * @param {keyof typeof STORES} store
 * @param {string} key
 */
export async function get(store, key) {
  const db = await openDb();
  if (useFallback || !db) {
    return fallbackReadAll(store)[key] ?? null;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Fetches every record in a store, optionally filtered/sorted client-side
 * (stores here are small enough — personal-scale data — that this is
 * simpler and plenty fast without needing cursor-based index queries).
 * @param {keyof typeof STORES} store
 */
export async function getAll(store) {
  const db = await openDb();
  if (useFallback || !db) {
    return Object.values(fallbackReadAll(store));
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Deletes a single record by key.
 * @param {keyof typeof STORES} store
 * @param {string} key
 */
export async function remove(store, key) {
  const db = await openDb();
  if (useFallback || !db) {
    const all = fallbackReadAll(store);
    delete all[key];
    fallbackWriteAll(store, all);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Deletes every record in a store.
 * @param {keyof typeof STORES} store
 */
export async function clear(store) {
  const db = await openDb();
  if (useFallback || !db) {
    fallbackWriteAll(store, {});
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetches all records whose `indexName` value equals `value` — falls
 * back to a client-side filter over getAll() when running the
 * LocalStorage shim (which has no real indexes).
 * @param {keyof typeof STORES} store
 * @param {string} indexName
 * @param {*} value
 */
export async function getAllByIndex(store, indexName, value) {
  const db = await openDb();
  if (useFallback || !db) {
    return (await getAll(store)).filter((r) => r[indexName] === value);
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const idx = tx.objectStore(store).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Dumps every store into one plain object — the backbone of Settings >
 * Export all data. Safe to call at any time; read-only.
 * @returns {Promise<Record<string, any[]>>}
 */
export async function exportAllData() {
  const dump = {};
  for (const store of Object.keys(STORES)) {
    dump[store] = await getAll(store);
  }
  return dump;
}

/**
 * Restores data previously produced by {@link exportAllData}. Unknown
 * store names in the payload are ignored (forward-compat if a future
 * version adds/removes stores); known stores are fully replaced.
 * @param {Record<string, any[]>} dump
 * @param {{merge?: boolean}} [opts] - merge=true keeps existing records
 *   instead of clearing the store first (default false = full replace).
 */
export async function importAllData(dump, opts = {}) {
  for (const [store, records] of Object.entries(dump || {})) {
    if (!STORES[store]) continue;
    if (!opts.merge) await clear(store);
    for (const record of records) {
      await put(store, record);
    }
  }
}

/** Exposed for diagnostics (e.g. Settings could show "Storage: IndexedDB" vs "LocalStorage fallback"). */
export function isUsingFallback() {
  return useFallback;
}

/** Ensures the DB is open — call once at boot so the first real
 *  operation isn't the one paying the connection-open cost. */
export async function initDb() {
  await openDb();
}
