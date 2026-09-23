// Thin client for the incident.io on-call API, authenticated with
// INCIDENT_IO_API_KEY. https://docs.incident.io/api-reference

const BASE_URL = 'https://api.incident.io';

export interface ScheduleEntry {
  rotation_id: string;
  layer_id: string;
  start_at: string;
  end_at: string;
  user?: { id: string; email?: string; name?: string };
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

export async function createOverride(apiKey: string, override: OverrideRequest): Promise<{ id: string }> {
  const data = await request<{ override: { id: string } }>(apiKey, '/v2/schedule_overrides', {
    method: 'POST',
    body: JSON.stringify(override),
  });
  return data.override;
}
