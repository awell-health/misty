import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, addOneDay } from '@/lib/googleCalendar';
import { OnCallShift } from '@/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const calendarId = process.env.ONCALL_CALENDAR_ID;

  if (!calendarId) {
    return NextResponse.json({ shifts: [] });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, now.getDate()).toISOString();

  const events = await fetchCalendarEvents(calendarId, timeMin, timeMax);
  if (!events) {
    return NextResponse.json({ shifts: [] });
  }

  // One person is on call at a time, so each event is a single shift segment.
  const shifts: OnCallShift[] = [];

  for (const event of events) {
    const name = event.summary || 'On call';
    let start: string;
    let end: string;

    if (event.start.date) {
      start = event.start.date;
      end = event.end.date!;
    } else if (event.start.dateTime) {
      start = event.start.dateTime.split('T')[0];
      end = event.end.dateTime ? addOneDay(event.end.dateTime.split('T')[0]) : addOneDay(start);
    } else {
      continue;
    }

    shifts.push({ name, start, end });
  }

  shifts.sort((a, b) => a.start.localeCompare(b.start));

  const cacheControl = force
    ? 'no-store'
    : 'public, s-maxage=900, stale-while-revalidate=3600';

  return NextResponse.json({ shifts }, {
    headers: { 'Cache-Control': cacheControl },
  });
}
