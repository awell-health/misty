import { NextRequest, NextResponse } from 'next/server';

/**
 * Environment variables holding a valid bearer token. Each consumer gets its
 * own, so one can be revoked without rotating the token everyone else uses.
 * Adding a consumer is one line here.
 */
const TOKEN_VARS = ['API_TOKEN', 'API_TOKEN_FLYWHEEL'] as const;

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
  const accepted = TOKEN_VARS.map((name) => process.env[name]).filter(
    (value): value is string => Boolean(value)
  );
  if (accepted.length === 0) {
    return NextResponse.json(
      { error: 'API_TOKEN is not configured on the server.' },
      { status: 503 }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Not `.some()`: short-circuiting would let response timing reveal which of
  // the accepted tokens matched. Length-check first so safeEqual doesn't read
  // past the end of the shorter string.
  let authorized = false;
  for (const expected of accepted) {
    const match = token.length === expected.length && safeEqual(token, expected);
    authorized = authorized || match;
  }

  if (!authorized) {
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
