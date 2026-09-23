// Works out which incident.io overrides take OOO engineers off the "online
// engineers" schedule. Pure, so the sync route can show the plan (dry run)
// before applying it.
//
// The plan is computed against the schedule's *final* entries, which already
// include existing overrides: once someone has been overridden to nobody they
// no longer appear there, so re-running the sync never duplicates an override.

import type { CalendarEvent } from './googleCalendar';
import type { ScheduleEntry } from './incidentIo';
import { zonedMidnight } from './timezone';

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
// by mike@awellhealth.com). All-day events cover whole Denver days; timed
// events cover exactly their hours.
export function oooWindows(events: CalendarEvent[]): OOOWindow[] {
  const windows: OOOWindow[] = [];
  for (const event of events) {
    const email = event.creator?.email?.toLowerCase();
    if (!email) continue;

    let start: Date;
    let end: Date;
    if (event.start.date && event.end.date) {
      start = zonedMidnight(event.start.date);
      end = zonedMidnight(event.end.date);
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

// One override per stretch where an OOO person is still on the schedule,
// clipped to the OOO window and to the future.
export function planOverrides(
  windows: OOOWindow[],
  entries: ScheduleEntry[],
  now = new Date()
): PlannedOverride[] {
  const planned: PlannedOverride[] = [];
  for (const w of windows) {
    for (const entry of entries) {
      if (entry.user?.email?.toLowerCase() !== w.email) continue;
      const start = Math.max(w.start.getTime(), new Date(entry.start_at).getTime(), now.getTime());
      const end = Math.min(w.end.getTime(), new Date(entry.end_at).getTime());
      if (end <= start) continue;
      planned.push({
        email: w.email,
        rotation_id: entry.rotation_id,
        layer_id: entry.layer_id,
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
      });
    }
  }
  return planned.sort((a, b) => a.start_at.localeCompare(b.start_at));
}
