import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents } from '@/lib/googleCalendar';
import { createOverride, listFinalScheduleEntries } from '@/lib/incidentIo';
import { oooWindows, planOverrides } from '@/lib/oooOverrides';

export const runtime = 'nodejs';

// How far ahead to look for OOO time, matching the OOO timeline.
const HORIZON_DAYS = 60;

// Takes engineers on the OOO calendar off the incident.io "online engineers"
// schedule by overriding their shifts to nobody.
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
  const scheduleId = process.env.ONLINE_ENGINEERS_SCHEDULE_ID;
  const calendarId = process.env.OOO_CALENDAR_ID;
  if (!apiKey || !scheduleId || !calendarId) {
    return NextResponse.json(
      { error: 'INCIDENT_IO_API_KEY, ONLINE_ENGINEERS_SCHEDULE_ID and OOO_CALENDAR_ID must all be set.' },
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
  let entries;
  try {
    entries = await listFinalScheduleEntries(apiKey, scheduleId, now, horizon);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  const planned = planOverrides(windows, entries, now);

  // OOO people who never appear on the schedule: either not on the rotation,
  // or their calendar email doesn't match their incident.io email.
  const scheduled = new Set(entries.map((e) => e.user?.email?.toLowerCase()));
  const notOnSchedule = Array.from(new Set(windows.map((w) => w.email))).filter((e) => !scheduled.has(e));

  const created: { email: string; start_at: string; end_at: string; id: string }[] = [];
  const failed: { email: string; start_at: string; end_at: string; error: string }[] = [];
  if (apply) {
    for (const { email, ...override } of planned) {
      try {
        const { id } = await createOverride(apiKey, {
          schedule_id: scheduleId,
          ...override,
          user: { id: 'NOBODY' },
        });
        created.push({ email, start_at: override.start_at, end_at: override.end_at, id });
      } catch (e) {
        failed.push({ email, start_at: override.start_at, end_at: override.end_at, error: (e as Error).message });
      }
    }
  }

  return NextResponse.json(
    { dryRun: !apply, planned, created, failed, notOnSchedule },
    { status: failed.length > 0 ? 502 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

function bearerMatches(header: string | null, secret: string): boolean {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
