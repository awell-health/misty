import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { updateScope, deleteScope, UpdateScopeInput } from '@/lib/api/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/v1/hills/:id/scopes/:scopeId → partial update. Any of:
// name, description, position, color, order, hidden, goalPosition (null clears),
// completed (completedAt is set automatically).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; scopeId: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const input: UpdateScopeInput = {
    name: body.name,
    description: body.description,
    position: body.position,
    color: body.color,
    order: body.order,
    hidden: body.hidden,
    goalPosition: body.goalPosition,
    completed: body.completed,
  };

  const scope = await updateScope(params.id, params.scopeId, input);
  if (scope === null) return NextResponse.json({ error: 'Scope not found' }, { status: 404 });
  return NextResponse.json({ scope });
}

// DELETE /api/v1/hills/:id/scopes/:scopeId
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; scopeId: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const ok = await deleteScope(params.id, params.scopeId);
  if (!ok) return NextResponse.json({ error: 'Scope not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
