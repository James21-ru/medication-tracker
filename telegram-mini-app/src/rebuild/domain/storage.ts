import { emptyData, type LifeCareData } from './models';

const databaseName = 'lifecare-mini-app';
const storeName = 'state';
const currentKey = 'current';
const fallbackKey = 'lifecare-mini-app-v1-fallback';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function fromIndexedDb(): Promise<LifeCareData | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(currentKey);
    request.onsuccess = () => { database.close(); resolve((request.result as LifeCareData | undefined) ?? null); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

async function toIndexedDb(data: LifeCareData) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(data, currentKey);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

function isLifeCareData(value: unknown): value is LifeCareData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<LifeCareData>;
  return data.version === 1 && Array.isArray(data.cabinets) && Array.isArray(data.medications) && Array.isArray(data.packages);
}

export async function loadData(): Promise<LifeCareData> {
  try {
    const saved = await fromIndexedDb();
    return saved && isLifeCareData(saved) ? saved : emptyData();
  } catch {
    try {
      const raw = localStorage.getItem(fallbackKey);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      return isLifeCareData(saved) ? saved : emptyData();
    } catch { return emptyData(); }
  }
}

export async function saveData(data: LifeCareData) {
  try { await toIndexedDb(data); }
  catch { localStorage.setItem(fallbackKey, JSON.stringify(data)); }
}
