import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarEvents, addOneDay } from '@/lib/googleCalendar';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const calendarId = process.env.OOO_CALENDAR_ID;

  if (!calendarId) {
    return NextResponse.json({ days: [] });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString();

  const events = await fetchCalendarEvents(calendarId, timeMin, timeMax);
  if (!events) {
    return NextResponse.json({ days: [] });
  }

  const dayMap = new Map<string, { count: number; names: string[] }>();

  for (const event of events) {
    const name = event.summary || 'OOO';
    let startDate: string;
    let endDate: string;

    if (event.start.date) {
      startDate = event.start.date;
      endDate = event.end.date!;
    } else if (event.start.dateTime) {
      startDate = event.start.dateTime.split('T')[0];
      endDate = addOneDay(startDate);
    } else {
      continue;
    }

    let current = startDate;
    while (current < endDate) {
      const entry = dayMap.get(current) ?? { count: 0, names: [] };
      entry.count++;
      entry.names.push(name);
      dayMap.set(current, entry);
      current = addOneDay(current);
    }
  }

  const days = Array.from(dayMap.entries())
    .map(([date, { count, names }]) => ({ date, count, names }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const cacheControl = force
    ? 'no-store'
    : 'public, s-maxage=900, stale-while-revalidate=3600';

  return NextResponse.json({ days }, {
    headers: { 'Cache-Control': cacheControl },
  });
}
