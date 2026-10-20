import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runOOOSync } from '@/lib/oooSync';

export const runtime = 'nodejs';

// Runs the OOO → incident.io sync (see runOOOSync) hourly from Vercel cron
// (production only). Pass ?dryRun=1 to see the overrides it would create
// without creating them. Callers must send `Authorization: Bearer
// $CRON_SECRET`, which is what Vercel cron sends.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured on the server.' }, { status: 503 });
  }
  if (!bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apply = new URL(request.url).searchParams.get('dryRun') !== '1';
  try {
    const result = await runOOOSync({ apply });
    return NextResponse.json(result, {
      status: result.failed.length > 0 ? 502 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

function bearerMatches(header: string | null, secret: string): boolean {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
