import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/googleCalendar';
import { createOverride, getScheduleRotations, listFinalScheduleEntries } from '@/lib/incidentIo';
import { oooWindows, planOverrides, PlannedOverride, SkippedEntry } from '@/lib/oooOverrides';

export const runtime = 'nodejs';

// How far ahead to look for OOO time, matching the OOO timeline.
const HORIZON_DAYS = 60;

// Takes engineers on the OOO calendar off their incident.io online schedules
// (one per engineer, listed in ONLINE_SCHEDULE_IDS) by overriding their shifts
// to nobody. Only schedules on that list are touched, so on-call rotas such as
// Triage Captain are never overridden.
//
// Runs hourly from Vercel cron (production only). Pass ?dryRun=1 to see the
// overrides it would create without creating them. Callers must send
// `Authorization: Bearer $CRON_SECRET`, which is what Vercel cron sends.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured on the server.' }, { status: 503 });
  }
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.INCIDENT_IO_API_KEY;
  const scheduleIds = (process.env.ONLINE_SCHEDULE_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  const calendarId = process.env.OOO_CALENDAR_ID;
  if (!apiKey || scheduleIds.length === 0 || !calendarId) {
    return NextResponse.json(
      { error: 'INCIDENT_IO_API_KEY, ONLINE_SCHEDULE_IDS and OOO_CALENDAR_ID must all be set.' },
      { status: 503 }
    );
  }

  const apply = new URL(request.url).searchParams.get('dryRun') !== '1';
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const events = await fetchCalendarEvents(calendarId, now.toISOString(), horizon.toISOString());
  if (!events) {
    return NextResponse.json({ error: 'Could not read the OOO calendar.' }, { status: 502 });
  }

  const windows = oooWindows(events);

  const planned: (PlannedOverride & { schedule_id: string })[] = [];
  const skipped: (SkippedEntry & { schedule_id: string })[] = [];
  const scheduled = new Set<string | undefined>();
  try {
    for (const scheduleId of scheduleIds) {
      const [entries, rotations] = await Promise.all([
        listFinalScheduleEntries(apiKey, scheduleId, now, horizon),
        getScheduleRotations(apiKey, scheduleId),
      ]);
      entries.forEach((e) => scheduled.add(e.user?.email?.toLowerCase()));
      const plan = planOverrides(windows, entries, rotations, now);
      planned.push(...plan.planned.map((p) => ({ schedule_id: scheduleId, ...p })));
      skipped.push(...plan.skipped.map((p) => ({ schedule_id: scheduleId, ...p })));
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // OOO people who never appear on any listed schedule: either they have no
  // online schedule yet, or their calendar email doesn't match incident.io.
  const notOnSchedule = Array.from(new Set(windows.map((w) => w.email))).filter((e) => !scheduled.has(e));

  const created: { email: string; schedule_id: string; start_at: string; end_at: string; id: string }[] = [];
  const failed: { email: string; schedule_id: string; start_at: string; end_at: string; error: string }[] = [];
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

  return NextResponse.json(
    { dryRun: !apply, planned, skipped, created, failed, notOnSchedule },
    { status: failed.length > 0 ? 502 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

function bearerMatches(header: string | null, secret: string): boolean {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
