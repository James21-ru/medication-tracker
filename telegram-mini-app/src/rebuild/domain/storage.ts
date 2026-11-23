import { emptyData, normalizeLifeCareData, preferRicherLifeCareData, type LifeCareData } from './models';

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
  return data.version === 2 && Array.isArray(data.cabinets) && Array.isArray(data.medications) && Array.isArray(data.packages) && Array.isArray(data.schedules) && Array.isArray(data.doseRecords);
}

function migrate(value: unknown): LifeCareData | null {
  if (isLifeCareData(value)) return normalizeLifeCareData(value);
  if (!value || typeof value !== 'object') return null;
  const data = value as { version?: unknown; cabinets?: unknown; medications?: unknown; packages?: unknown };
  if (data.version !== 1 || !Array.isArray(data.cabinets) || !Array.isArray(data.medications) || !Array.isArray(data.packages)) return null;
  return { version: 2, cabinets: data.cabinets as LifeCareData['cabinets'], medications: data.medications as LifeCareData['medications'], packages: data.packages as LifeCareData['packages'], schedules: [], doseRecords: [] };
}

export async function loadData(): Promise<LifeCareData> {
  let fallback = emptyData();
  try {
    const raw = localStorage.getItem(fallbackKey);
    fallback = migrate(raw ? JSON.parse(raw) : null) ?? emptyData();
  } catch { /* Safari/Telegram may temporarily deny Web Storage. */ }
  try {
    const saved = await fromIndexedDb();
    return preferRicherLifeCareData(fallback, migrate(saved) ?? emptyData());
  } catch {
    return fallback;
  }
}

export async function saveData(data: LifeCareData) {
  // Keep a second local copy even when IndexedDB is healthy. Telegram iOS may
  // clear one storage partition while retaining the other between launches.
  try { localStorage.setItem(fallbackKey, JSON.stringify(data)); } catch { /* ignored */ }
  try { await toIndexedDb(data); } catch { /* the fallback above is enough */ }
}
