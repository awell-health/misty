import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { listHills } from '@/lib/api/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/hills            → all hills (with nested scopes + goals)
// GET /api/v1/hills?name=Foo   → case-insensitive substring match on title
export async function GET(request: NextRequest) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const name = request.nextUrl.searchParams.get('name');
  let hills = await listHills();
  if (name) {
    const needle = name.toLowerCase();
    hills = hills.filter((h) => h.title.toLowerCase().includes(needle));
  }
  return NextResponse.json({ hills });
}
