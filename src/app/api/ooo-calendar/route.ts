import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function base64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const headerB64 = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payloadB64 = base64urlEncode(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));

  const signingInput = `${headerB64}.${payloadB64}`;
  const keyData = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64urlFromBuffer(signature)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calendarId = process.env.OOO_CALENDAR_ID;

  if (!serviceAccountJson || !calendarId) {
    return NextResponse.json({ days: [] });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  try {
    const sa = JSON.parse(serviceAccountJson);
    const privateKey = (sa.private_key as string).replace(/\\n/g, '\n');
    const clientEmail = sa.client_email as string;

    const accessToken = await getAccessToken(clientEmail, privateKey);

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString();

    const eventsUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    eventsUrl.searchParams.set('timeMin', timeMin);
    eventsUrl.searchParams.set('timeMax', timeMax);
    eventsUrl.searchParams.set('singleEvents', 'true');
    eventsUrl.searchParams.set('orderBy', 'startTime');
    eventsUrl.searchParams.set('maxResults', '250');

    const eventsRes = await fetch(eventsUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!eventsRes.ok) {
      return NextResponse.json({ days: [] });
    }

    const eventsData = await eventsRes.json();
    const events = (eventsData.items || []) as Array<{
      summary?: string;
      start: { date?: string; dateTime?: string };
      end: { date?: string; dateTime?: string };
    }>;

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
  } catch {
    return NextResponse.json({ days: [] });
  }
}
