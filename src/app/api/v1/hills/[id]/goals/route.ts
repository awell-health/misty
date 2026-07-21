import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { listGoals, createGoal, CreateGoalInput } from '@/lib/api/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/v1/hills/:id/goals → roadmap goals (timelineProjects) for a hill
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const goals = await listGoals(params.id);
  if (goals === null) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });
  return NextResponse.json({ goals });
}

// POST /api/v1/hills/:id/goals → create a goal. Body: { name?, color?, date? }.
// `date` is epoch ms; defaults to ~45 days out. Server assigns id + order.
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

  if (body?.date !== undefined && typeof body.date !== 'number') {
    return NextResponse.json({ error: '`date` must be epoch milliseconds (number)' }, { status: 400 });
  }

  const input: CreateGoalInput = {
    name: body?.name,
    color: body?.color,
    date: body?.date,
  };

  const goal = await createGoal(params.id, input);
  if (goal === null) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });
  return NextResponse.json({ goal }, { status: 201 });
}
