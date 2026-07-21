import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { listScopes, createScope, CreateScopeInput } from '@/lib/api/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/hills/:id/scopes → scopes for a hill (order-sorted array)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const scopes = await listScopes(params.id);
  if (scopes === null) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });
  return NextResponse.json({ scopes });
}

// POST /api/v1/hills/:id/scopes → create a scope. Body: { name, description?,
// position?, color?, goalPosition?, hidden? }. Server assigns id + order, and
// picks a color if none given.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body?.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: '`name` is required' }, { status: 400 });
  }

  const input: CreateScopeInput = {
    name: body.name,
    description: body.description,
    position: body.position,
    color: body.color,
    goalPosition: body.goalPosition,
    hidden: body.hidden,
  };

  const scope = await createScope(params.id, input);
  if (scope === null) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });
  return NextResponse.json({ scope }, { status: 201 });
}
