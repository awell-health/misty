// Works out which incident.io overrides take OOO engineers off their online
// schedules. Pure, so the sync route can show the plan (dry run) before
// applying it.
//
// The plan is computed against the schedule's *final* entries, which already
// include existing overrides: once someone has been overridden to nobody they
// no longer appear there, so re-running the sync never duplicates an override.

import type { CalendarEvent } from './googleCalendar';
import type { Rotation, Schedule, ScheduleEntry } from './incidentIo';
import { TEAM_TIMEZONE, zonedMidnight } from './timezone';

export interface OOOWindow {
  email: string;
  start: Date;
  end: Date;
}

export interface PlannedOverride {
  email: string;
  rotation_id: string;
  layer_id: string;
  start_at: string;
  end_at: string;
}

// People are identified by who created the OOO event (e.g. "MP OOO" created
// by mike@awellhealth.com). All-day events cover whole days in `timeZone`,
// which should be the person's own (their online schedule's); timed events
// cover exactly their hours.
export function oooWindows(events: CalendarEvent[], timeZone = TEAM_TIMEZONE): OOOWindow[] {
  const windows: OOOWindow[] = [];
  for (const event of events) {
    const email = event.creator?.email?.toLowerCase();
    if (!email) continue;

    let start: Date;
    let end: Date;
    if (event.start.date && event.end.date) {
      start = zonedMidnight(event.start.date, timeZone);
      end = zonedMidnight(event.end.date, timeZone);
    } else if (event.start.dateTime && event.end.dateTime) {
      start = new Date(event.start.dateTime);
      end = new Date(event.end.dateTime);
    } else {
      continue;
    }
    if (end > start) windows.push({ email, start, end });
  }
  return mergeWindows(windows);
}

// Overlapping OOO events for the same person (duplicates, or a day off inside
// a week off) become one window, so we never plan two overrides for one span.
function mergeWindows(windows: OOOWindow[]): OOOWindow[] {
  const sorted = [...windows].sort((a, b) =>
    a.email.localeCompare(b.email) || a.start.getTime() - b.start.getTime()
  );
  const merged: OOOWindow[] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.email === w.email && w.start <= last.end) {
      if (w.end > last.end) last.end = w.end;
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

// On-call rotas, which must never be overridden to nobody: an OOO day there
// would leave pages reaching no one. Every other schedule an OOO person is on
// is treated as their online schedule, so a new on-call rota belongs here.
export const EXCLUDED_SCHEDULE_IDS = new Set([
  '01M32GTH9ATJQ8X96K4C2BWYWG', // Triage Captain
]);

// The schedules worth checking: any non-excluded schedule with an OOO person
// in one of its rotations (any version; planOverrides works from actual shifts).
export function onlineSchedulesFor(schedules: Schedule[], oooEmails: Set<string>): Schedule[] {
  return schedules.filter(
    (s) =>
      !EXCLUDED_SCHEDULE_IDS.has(s.id) &&
      s.config.rotations.some((r) => r.users?.some((u) => oooEmails.has(u.email?.toLowerCase() ?? '')))
  );
}

export interface SkippedEntry {
  email: string;
  rotation_id: string;
  start_at: string;
  end_at: string;
  reason: string;
}

// An override has to name a layer, and schedule entries don't say which layer
// they're on. A rotation with exactly one layer answers that; one with
// concurrent layers can't, so those shifts are skipped rather than guessed
// (a wrong guess would take someone else off instead).
export function layerFor(rotationId: string, at: Date, rotations: Rotation[]): string | null {
  // The version in effect at `at`: the latest one that started on or before it.
  const version = rotations
    .filter((r) => r.id === rotationId)
    .filter((r) => !r.effective_from || new Date(r.effective_from) <= at)
    .sort((a, b) => (a.effective_from ?? '').localeCompare(b.effective_from ?? ''))
    .pop();
  return version?.layers.length === 1 ? version.layers[0].id : null;
}

// One override per stretch where an OOO person is still on the schedule,
// clipped to the OOO window and to the future.
export function planOverrides(
  windows: OOOWindow[],
  entries: ScheduleEntry[],
  rotations: Rotation[],
  now = new Date()
): { planned: PlannedOverride[]; skipped: SkippedEntry[] } {
  const planned: PlannedOverride[] = [];
  const skipped: SkippedEntry[] = [];
  for (const w of windows) {
    for (const entry of entries) {
      if (entry.user?.email?.toLowerCase() !== w.email) continue;
      const start = Math.max(w.start.getTime(), new Date(entry.start_at).getTime(), now.getTime());
      const end = Math.min(w.end.getTime(), new Date(entry.end_at).getTime());
      if (end <= start) continue;
      const span = { email: w.email, rotation_id: entry.rotation_id, start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString() };
      const layer_id = layerFor(entry.rotation_id, new Date(start), rotations);
      if (layer_id) planned.push({ ...span, layer_id });
      else skipped.push({ ...span, reason: 'rotation has concurrent layers, so the layer is unknown' });
    }
  }
  const byStart = (a: { start_at: string }, b: { start_at: string }) => a.start_at.localeCompare(b.start_at);
  return { planned: planned.sort(byStart), skipped: skipped.sort(byStart) };
}
