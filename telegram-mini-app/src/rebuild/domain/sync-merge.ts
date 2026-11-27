import type { LifeCareData } from './models.ts';

export type MergeConflict = { collection: string; id: string; field: string; reason: string };
export const collections = ['cabinets', 'medications', 'packages', 'schedules', 'doseRecords'] as const;
export const copy = <T,>(value: T): T => structuredClone(value);
export function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => equal(item, right[index]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}

export function mergeLifeCareData(base: LifeCareData, local: LifeCareData, remote: LifeCareData): { data: LifeCareData; conflicts: MergeConflict[] } {
  const canonical = (state: LifeCareData): LifeCareData => ({ ...state, doseRecords: state.doseRecords.map((item) => ({ ...item, id: `dose:${item.slotId}` })) });
  base = canonical(base); local = canonical(local); remote = canonical(remote);
  const conflicts: MergeConflict[] = [];
  const conflict = (collection: string, id: string, field: string, reason: string) => conflicts.push({ collection, id, field, reason });
  type Row = { id: string; [key: string]: unknown };
  function mergeRows(collection: string, originals: Row[], ours: Row[], theirs: Row[]): Row[] {
    const b = new Map(originals.map((row) => [row.id, row]));
    const l = new Map(ours.map((row) => [row.id, row]));
    const r = new Map(theirs.map((row) => [row.id, row]));
    const result: Row[] = [];
    for (const id of new Set([...r.keys(), ...l.keys(), ...b.keys()])) {
      const before = b.get(id), left = l.get(id), right = r.get(id);
      if (collection === 'doseRecords' && left && right) {
        const { completedAt: leftTime, ...leftAction } = left;
        const { completedAt: rightTime, ...rightAction } = right;
        // Одинаковая отметка в приложении и боте обозначает одно действие.
        // При разных временах подтверждения используем время сервера.
        if (equal(leftAction, rightAction)) { result.push(copy(right)); continue; }
      }
      if (equal(left, right)) { if (left) result.push(copy(left)); continue; }
      if (equal(left, before)) { if (right) result.push(copy(right)); continue; }
      if (equal(right, before)) { if (left) result.push(copy(left)); continue; }
      if (!left || !right || !before) {
        conflict(collection, id, '*', !left || !right ? 'Удаление пересекается с другим изменением.' : 'Одна запись создана с разными данными.');
        if (left) result.push(copy(left));
        continue;
      }
      const merged: Row = { id };
      for (const field of new Set([...Object.keys(before), ...Object.keys(left), ...Object.keys(right)])) {
        if (equal(left[field], right[field])) merged[field] = copy(left[field]);
        else if (equal(left[field], before[field])) merged[field] = copy(right[field]);
        else if (equal(right[field], before[field])) merged[field] = copy(left[field]);
        else if (field === 'times' && [before[field], left[field], right[field]].every(Array.isArray)) {
          merged[field] = mergeRows(`${collection}.times`, before[field] as Row[], left[field] as Row[], right[field] as Row[]);
        } else {
          conflict(collection, id, field, 'Одно поле изменено на двух устройствах.');
          merged[field] = copy(left[field]);
        }
      }
      result.push(merged);
    }
    return result;
  }
  const data = { version: 2 } as LifeCareData;
  for (const collection of collections) {
    (data[collection] as unknown) = mergeRows(collection, base[collection] as unknown as Row[], local[collection] as unknown as Row[], remote[collection] as unknown as Row[]);
  }
  // Одинаковые остатки могут соответствовать двум разным приемам.
  // Нельзя объединить историю, молча учтя только одно списание.
  const actions = (state: LifeCareData) => state.doseRecords.map(({ completedAt, ...item }) => item).sort((a, b) => a.slotId.localeCompare(b.slotId));
  if (!equal(actions(local), actions(remote))) {
    for (const before of base.packages) {
      const left = local.packages.find((item) => item.id === before.id), right = remote.packages.find((item) => item.id === before.id);
      if (left && right && left.quantity !== before.quantity && right.quantity !== before.quantity) conflict('packages', before.id, 'quantity', 'Остаток изменен одновременно с обеих сторон.');
    }
  }
  const cabinetIds = new Set(data.cabinets.map((item) => item.id));
  const medicationIds = new Set(data.medications.map((item) => item.id));
  for (const medication of data.medications) if (!cabinetIds.has(medication.cabinetId)) conflict('medications', medication.id, 'cabinetId', 'Аптечка удалена на другом устройстве.');
  for (const collection of ['packages', 'schedules', 'doseRecords'] as const) {
    for (const item of data[collection]) if (!medicationIds.has(item.medicationId)) conflict(collection, item.id, 'medicationId', 'Препарат удален на другом устройстве.');
  }
  const slots = new Set<string>();
  for (const record of data.doseRecords) {
    if (slots.has(record.slotId)) conflict('doseRecords', record.id, 'slotId', 'Для одного приема есть две разные отметки.');
    slots.add(record.slotId);
  }
  return { data, conflicts };
}
