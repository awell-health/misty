import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { updateGoal, deleteGoal, UpdateGoalInput } from '@/lib/api/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/v1/hills/:id/goals/:goalId → partial update: name, color, date, order.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; goalId: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body?.date !== undefined && typeof body.date !== 'number') {
    return NextResponse.json({ error: '`date` must be epoch milliseconds (number)' }, { status: 400 });
  }

  const input: UpdateGoalInput = {
    name: body.name,
    color: body.color,
    date: body.date,
    order: body.order,
  };

  const goal = await updateGoal(params.id, params.goalId, input);
  if (goal === null) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  return NextResponse.json({ goal });
}

// DELETE /api/v1/hills/:id/goals/:goalId
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; goalId: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const ok = await deleteGoal(params.id, params.goalId);
  if (!ok) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
