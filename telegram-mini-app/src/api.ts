import { telegramApp } from './telegram';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');

export type SyncPayload = {
  cabinets: Array<{ id: string; name: string }>;
  medications: Array<{ id: string; cabinet_id: string; name: string; category?: string; form: string; amount: string; unit: string; barcode?: string; note?: string; purchase_reminder?: boolean; color: string }>;
  packages: Array<{ id: string; medication_id: string; quantity_remaining: number; unit: string; expires_on: string | null }>;
  doses: Array<{ id: string; medication_id: string; scheduled_time: string; scheduled_date?: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' }>;
  schedules: Array<{ id: string; medication_id: string; scheduled_time: string; dose_quantity: number; dose_unit: string; frequency?: 'daily' | 'multiple' | 'weekdays' | 'interval' | 'as-needed'; start_date?: string; end_date?: string | null; weekdays?: number[]; interval_days?: number }>;
};

export type SyncState = { payload: SyncPayload; revision: number; updated_at: string };

export type ApiCabinet = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type ApiMedication = {
  id: string;
  cabinet_id: string;
  name: string;
  category: string | null;
  form: string;
  dosage_value: string | null;
  dosage_unit: string | null;
  barcode: string | null;
  note: string | null;
  purchase_reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiPackage = {
  id: string;
  medication_id: string;
  quantity_initial: number;
  quantity_remaining: number;
  unit: string;
  expires_on: string | null;
  created_at: string;
  updated_at: string;
};

export const hasLocalApi = Boolean(configuredBaseUrl);
export const cloudSyncAvailable = () => Boolean(configuredBaseUrl && telegramApp()?.initData);

async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 2500): Promise<T> {
  if (!configuredBaseUrl) throw new Error('Локальный API не настроен.');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${configuredBaseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(body?.detail ?? 'Не удалось сохранить данные.');
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Локальная база не ответила. Проверьте, что Docker запущен.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function syncRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const initData = telegramApp()?.initData;
  if (!initData) throw new Error('Откройте приложение из Telegram для синхронизации.');
  return request<T>(path, {
    ...options,
    headers: { 'X-Telegram-Init-Data': initData, ...options.headers },
  }, 10_000);
}

export const localApi = {
  listCabinets: () => request<ApiCabinet[]>('/cabinets'),
  createCabinet: (name: string) => request<ApiCabinet>('/cabinets', { method: 'POST', body: JSON.stringify({ name }) }),
  renameCabinet: (id: string, name: string) => request<ApiCabinet>(`/cabinets/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  listMedications: (cabinetId: string) => request<ApiMedication[]>(`/cabinets/${cabinetId}/medications`),
  createMedication: (cabinetId: string, payload: Omit<ApiMedication, 'id' | 'cabinet_id' | 'created_at' | 'updated_at'>) => request<ApiMedication>(`/cabinets/${cabinetId}/medications`, { method: 'POST', body: JSON.stringify(payload) }),
  updateMedication: (id: string, payload: Partial<Omit<ApiMedication, 'id' | 'created_at' | 'updated_at'>>) => request<ApiMedication>(`/medications/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteMedication: (id: string) => request<void>(`/medications/${id}`, { method: 'DELETE' }),
  listPackages: (medicationId: string) => request<ApiPackage[]>(`/medications/${medicationId}/packages`),
  createPackage: (medicationId: string, payload: Pick<ApiPackage, 'quantity_initial' | 'quantity_remaining' | 'unit' | 'expires_on'>) => request<ApiPackage>(`/medications/${medicationId}/packages`, { method: 'POST', body: JSON.stringify(payload) }),
};

export const syncApi = {
  getState: () => syncRequest<SyncState>('/sync/state'),
  putState: (payload: SyncPayload, expectedRevision?: number) => syncRequest<SyncState>('/sync/state', {
    method: 'PUT',
    body: JSON.stringify({ payload, expected_revision: expectedRevision }),
  }),
};
