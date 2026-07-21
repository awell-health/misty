import { NextRequest, NextResponse } from 'next/server';

/**
 * Bearer-token guard for the data API.
 *
 * Set API_TOKEN in the environment (server-only — do NOT prefix with
 * NEXT_PUBLIC_). Callers must send `Authorization: Bearer <token>`.
 *
 * Returns a 401 response when the token is missing/wrong, or null when the
 * request is authorized (so callers do `const denied = requireAuth(req); if
 * (denied) return denied;`).
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'API_TOKEN is not configured on the server.' },
      { status: 503 }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Length-check first so timingSafeEqual doesn't throw on mismatched sizes.
  if (token.length !== expected.length || !safeEqual(token, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

// Constant-time comparison to avoid leaking the token via response timing.
function safeEqual(a: string, b: string): boolean {
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
