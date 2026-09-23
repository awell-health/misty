import { NextRequest, NextResponse } from 'next/server';
import { parseIcs } from '@/lib/ics';
import { shiftsFromFeed } from '@/lib/onCallFeed';

export const runtime = 'nodejs';

// The Triage Captain schedule comes from incident.io's iCal feed. The feed URL
// embeds its own access token, so it lives in the environment, not the code.
export async function GET(request: NextRequest) {
  const feedUrl = process.env.ONCALL_FEED_URL;

  if (!feedUrl) {
    return NextResponse.json({ shifts: [] });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  let text: string;
  try {
    const res = await fetch(feedUrl, { cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ shifts: [] });
    text = await res.text();
  } catch {
    return NextResponse.json({ shifts: [] });
  }

  const shifts = shiftsFromFeed(parseIcs(text));

  const cacheControl = force
    ? 'no-store'
    : 'public, s-maxage=900, stale-while-revalidate=3600';

  return NextResponse.json({ shifts }, {
    headers: { 'Cache-Control': cacheControl },
  });
}
