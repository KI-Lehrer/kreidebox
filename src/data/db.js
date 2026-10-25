// Tiny IndexedDB wrapper. Only store.js imports this file.
const DB_NAME = 'nachbau';
const VERSION = 2; // 2: templates store
let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('decks')) {
        const decks = db.createObjectStore('decks', { keyPath: 'id' });
        decks.createIndex('updatedAt', 'updatedAt');
        decks.createIndex('folderId', 'folderId');
      }
      for (const name of ['nameLists', 'uploads', 'themes', 'events', 'folders', 'templates']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Die Datenbank ist in einem anderen Fenster geöffnet. Bitte andere Fenster schliessen.'));
  });
  return dbPromise;
}

function run(storeName, mode, action) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    let result;
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
  }));
}

export const get = (store, id) => run(store, 'readonly', (s) => s.get(id));
export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const del = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
