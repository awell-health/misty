import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { getHill } from '@/lib/api/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/hills/:id → one hill with nested scopes + goals
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const hill = await getHill(params.id);
  if (!hill) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });
  return NextResponse.json({ hill });
}
