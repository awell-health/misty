// Thin client for the incident.io on-call API, authenticated with
// INCIDENT_IO_API_KEY. https://docs.incident.io/api-reference

const BASE_URL = 'https://api.incident.io';

// incident.io's docs used to list a layer_id here too, but the API never
// returned it; the layer comes from the schedule's rotations instead.
export interface ScheduleEntry {
  rotation_id: string;
  start_at: string;
  end_at: string;
  user?: { id: string; email?: string; name?: string };
}

// One version of a rotation. Editing a rotation in incident.io adds a version
// with the same id and a later effective_from (null on the first version).
export interface Rotation {
  id: string;
  effective_from?: string | null;
  layers: { id: string; name?: string }[];
}

export interface OverrideRequest {
  schedule_id: string;
  rotation_id: string;
  layer_id: string;
  start_at: string;
  end_at: string;
  user: { id?: string; email?: string };
}

async function request<T>(apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`incident.io ${init?.method ?? 'GET'} ${path.split('?')[0]} → ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// The schedule's effective shifts (rotations with existing overrides already
// applied) between start and end.
export async function listFinalScheduleEntries(
  apiKey: string,
  scheduleId: string,
  start: Date,
  end: Date
): Promise<ScheduleEntry[]> {
  const entries: ScheduleEntry[] = [];
  // incident.io pages this endpoint by handing back a cursor to pass as
  // entry_window_start. Cap the pages so a bad cursor can't loop forever.
  let windowStart = start.toISOString();
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      schedule_id: scheduleId,
      entry_window_start: windowStart,
      entry_window_end: end.toISOString(),
    });
    const data = await request<{
      schedule_entries: { final?: ScheduleEntry[] };
      pagination_meta?: { after?: string };
    }>(apiKey, `/v2/schedule_entries?${params}`);
    entries.push(...(data.schedule_entries.final ?? []));
    const after = data.pagination_meta?.after;
    if (!after) break;
    windowStart = after;
  }
  return entries;
}

export interface Schedule {
  id: string;
  name: string;
  timezone: string;
  config: { rotations: (Rotation & { users?: { email?: string }[] })[] };
}

export async function listSchedules(apiKey: string): Promise<Schedule[]> {
  const schedules: Schedule[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ page_size: '100' });
    if (after) params.set('after', after);
    const data = await request<{ schedules: Schedule[]; pagination_meta?: { after?: string } }>(
      apiKey,
      `/v2/schedules?${params}`
    );
    schedules.push(...data.schedules);
    after = data.pagination_meta?.after;
    if (!after) break;
  }
  return schedules;
}

export async function createOverride(apiKey: string, override: OverrideRequest): Promise<{ id: string }> {
  const data = await request<{ override: { id: string } }>(apiKey, '/v2/schedule_overrides', {
    method: 'POST',
    body: JSON.stringify(override),
  });
  return data.override;
}
