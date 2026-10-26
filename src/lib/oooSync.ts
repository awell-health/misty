// Takes engineers on the OOO calendar off their incident.io online schedules
// (one per engineer) by overriding their shifts to nobody. Schedules are found
// by membership, minus on-call rotas (see onlineSchedulesFor).
//
// Run by the hourly cron (/api/ooo-sync) and by the OOO calendar's refresh
// button. Re-running is safe: see planOverrides.

import { fetchCalendarEvents } from './googleCalendar';
import { createOverride, listFinalScheduleEntries, listSchedules } from './incidentIo';
import { onlineSchedulesFor, oooWindows, planOverrides, PlannedOverride, SkippedEntry } from './oooOverrides';

// How far ahead to look for OOO time, matching the OOO timeline.
const HORIZON_DAYS = 60;

type Span = { email: string; schedule_id: string; start_at: string; end_at: string };

export interface OOOSyncResult {
  dryRun: boolean;
  planned: (PlannedOverride & { schedule_id: string })[];
  skipped: (SkippedEntry & { schedule_id: string })[];
  created: (Span & { id: string })[];
  failed: (Span & { error: string })[];
  // OOO people with no shifts on any online schedule: either they have no
  // online schedule yet, or their calendar email doesn't match incident.io.
  notOnSchedule: string[];
}

// Throws when the sync can't run at all (missing config, unreadable calendar,
// incident.io errors while planning). Failures creating individual overrides
// are reported in `failed` instead.
export async function runOOOSync({ apply }: { apply: boolean }): Promise<OOOSyncResult> {
  const apiKey = process.env.INCIDENT_IO_API_KEY;
  const calendarId = process.env.OOO_CALENDAR_ID;
  if (!apiKey || !calendarId) {
    throw new Error('INCIDENT_IO_API_KEY and OOO_CALENDAR_ID must both be set.');
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const events = await fetchCalendarEvents(calendarId, now.toISOString(), horizon.toISOString());
  if (!events) throw new Error('Could not read the OOO calendar.');

  const oooEmails = new Set(oooWindows(events).map((w) => w.email));

  const planned: OOOSyncResult['planned'] = [];
  const skipped: OOOSyncResult['skipped'] = [];
  const scheduled = new Set<string | undefined>();
  // Only schedules with someone who is OOO need their shifts fetched.
  const schedules = onlineSchedulesFor(await listSchedules(apiKey), oooEmails);
  for (const { id: scheduleId, timezone, config } of schedules) {
    // An all-day OOO day means that day where the person works, which is the
    // timezone of their online schedule.
    const windows = oooWindows(events, timezone);
    const entries = await listFinalScheduleEntries(apiKey, scheduleId, now, horizon);
    entries.forEach((e) => scheduled.add(e.user?.email?.toLowerCase()));
    const plan = planOverrides(windows, entries, config.rotations, now);
    planned.push(...plan.planned.map((p) => ({ schedule_id: scheduleId, ...p })));
    skipped.push(...plan.skipped.map((p) => ({ schedule_id: scheduleId, ...p })));
  }

  const created: OOOSyncResult['created'] = [];
  const failed: OOOSyncResult['failed'] = [];
  if (apply) {
    for (const { email, ...override } of planned) {
      const span = { email, schedule_id: override.schedule_id, start_at: override.start_at, end_at: override.end_at };
      try {
        const { id } = await createOverride(apiKey, { ...override, user: { id: 'NOBODY' } });
        created.push({ ...span, id });
      } catch (e) {
        failed.push({ ...span, error: (e as Error).message });
      }
    }
  }

  return {
    dryRun: !apply,
    planned,
    skipped,
    created,
    failed,
    notOnSchedule: Array.from(oooEmails).filter((e) => !scheduled.has(e)),
  };
}
