export type RebuildState = {
  version: 2;
  cabinets: unknown[];
  medications: unknown[];
  packages: unknown[];
  schedules: unknown[];
  doseRecords: unknown[];
};

export type Query = (statement: string, parameters: (string | number)[]) => Promise<Record<string, unknown>[]>;

export class RequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function requestErrorResponse(error: unknown) {
  return error instanceof RequestError
    ? { status: error.status, body: { error: error.code } }
    : { status: 500, body: { error: 'server_error' } };
}

export function parseExpectedRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new RequestError(400, 'invalid_expected_revision');
  }
  return value;
}

export function parseRebuildState(value: unknown): RebuildState {
  if (!value || typeof value !== 'object') throw new RequestError(400, 'invalid_state');
  const state = value as Partial<RebuildState>;
  if (state.version !== 2 || !Array.isArray(state.cabinets) || !Array.isArray(state.medications)
    || !Array.isArray(state.packages) || !Array.isArray(state.schedules) || !Array.isArray(state.doseRecords)) {
    throw new RequestError(400, 'invalid_state');
  }
  if (state.cabinets.length > 100 || state.medications.length > 1000 || state.packages.length > 3000
    || state.schedules.length > 1000 || state.doseRecords.length > 20_000) {
    throw new RequestError(400, 'state_too_large');
  }
  return normalizeLegacyDoseRecords(state as RebuildState);
}

export function doseRecordId(slotId: string): string {
  return `dose:${slotId}`;
}

export function normalizeLegacyDoseRecords(state: RebuildState): RebuildState {
  return {
    ...state,
    doseRecords: state.doseRecords.map((value) => {
      if (!value || typeof value !== 'object') return value;
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string' && record.id.trim()) return value;
      if (typeof record.slotId !== 'string' || !record.slotId.trim()) return value;
      return { ...record, id: doseRecordId(record.slotId) };
    }),
  };
}

export function decodeStoredRebuildState(value: unknown): RebuildState {
  try {
    return parseRebuildState(typeof value === 'string' ? JSON.parse(value) : value);
  } catch {
    throw new Error('Invalid stored state');
  }
}

export async function loadRebuildState(query: Query, telegramUserId: number) {
  const rows = await query(
    'select payload, revision from mobile_auth.telegram_mini_app_states where telegram_user_id = $1',
    [telegramUserId],
  );
  if (!rows[0]) return { status: 'synced' as const, has_data: false, revision: 0 };
  const state = decodeStoredRebuildState(rows[0].payload);
  return { status: 'synced' as const, has_data: true, state, revision: Number(rows[0].revision) };
}

export async function saveRebuildState(
  query: Query,
  telegramUserId: number,
  stateValue: unknown,
  expectedRevisionValue: unknown,
  timeZone: unknown,
) {
  const expectedRevision = parseExpectedRevision(expectedRevisionValue);
  const state = parseRebuildState(stateValue);
  const zone = typeof timeZone === 'string' && timeZone.length > 0 && timeZone.length <= 64 ? timeZone : 'Europe/Moscow';
  const parameters = [telegramUserId, JSON.stringify(state), zone];
  const rows = expectedRevision === 0
    ? await query(
      `insert into mobile_auth.telegram_mini_app_states (telegram_user_id, payload, time_zone)
       values ($1, $2::text::jsonb, $3)
       on conflict (telegram_user_id) do nothing
       returning revision`,
      parameters,
    )
    : await query(
      `update mobile_auth.telegram_mini_app_states
       set payload = $2::text::jsonb, time_zone = $3, revision = revision + 1, updated_at = now()
       where telegram_user_id = $1 and revision = $4
       returning revision`,
      [...parameters, expectedRevision],
    );
  if (!rows[0]) throw new RequestError(409, 'revision_conflict');
  return { status: 'synced' as const, revision: Number(rows[0].revision) };
}
