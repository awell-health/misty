import { NextRequest, NextResponse } from 'next/server';
import { HillLinearSignal } from '@/types';
import { clearHillLinear, getHill, setHillLinear } from '@/lib/api/store';
import { getOrgSlug, isLinearConfigured, listProjectIssues, listProjects } from '@/lib/linear/client';
import { buildSignals } from '@/lib/linear/signal';
import { labelGroupName, syncHill } from '@/lib/linear/apply';
import { createLabelGroup } from '@/lib/linear/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY: Omit<HillLinearSignal, 'configured' | 'connected'> = {
  scopes: [],
  unlabeled: 0,
  fetchedAt: 0,
};

// GET /api/linear/hills/:id → the read-only signal for a hill.
//
// Linear is never allowed to break a hill: any failure here returns a
// well-formed "not connected" payload so the chart renders exactly as it does
// without the integration. Hills get projected in planning meetings.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isLinearConfigured()) {
    return NextResponse.json({ configured: false, connected: false, ...EMPTY, fetchedAt: Date.now() });
  }

  const hill = await getHill(params.id);
  if (!hill) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });
  if (!hill.linear) {
    return NextResponse.json({ configured: true, connected: false, ...EMPTY, fetchedAt: Date.now() });
  }

  try {
    const { projectId, milestoneId, orgSlug } = hill.linear;
    const issues = await listProjectIssues(projectId, milestoneId);
    const { scopes, unlabeled } = buildSignals({
      scopes: hill.scopes,
      issues,
      orgSlug,
      projectId,
      milestoneId,
    });

    const goal = hill.goals.find((g) => g.id === hill.linear!.goalId);
    const signal: HillLinearSignal = {
      configured: true,
      connected: true,
      projectName: hill.linear.projectName,
      projectUrl: hill.linear.projectUrl,
      milestoneName: hill.linear.milestoneName,
      targetDate: goal?.date,
      scopes,
      unlabeled,
      fetchedAt: Date.now(),
    };
    return NextResponse.json(signal);
  } catch (e) {
    return NextResponse.json(
      {
        configured: true,
        connected: true,
        projectName: hill.linear.projectName,
        projectUrl: hill.linear.projectUrl,
        ...EMPTY,
        fetchedAt: Date.now(),
        error: e instanceof Error ? e.message : 'Linear request failed',
      },
      { status: 502 }
    );
  }
}

// POST /api/linear/hills/:id → connect. Body: { projectId, milestoneId? }.
// Creates the hill's label group, then reconciles with adoption on, so
// connecting to a group someone already built turns its labels into scopes.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isLinearConfigured()) {
    return NextResponse.json({ error: 'LINEAR_API_KEY is not configured.' }, { status: 503 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body?.projectId !== 'string') {
    return NextResponse.json({ error: '`projectId` is required' }, { status: 400 });
  }

  const hill = await getHill(params.id);
  if (!hill) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });

  try {
    const projects = await listProjects();
    const project = projects.find((p) => p.id === body.projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const milestone = body.milestoneId
      ? project.milestones.find((m) => m.id === body.milestoneId)
      : undefined;

    const group =
      typeof body.labelGroupId === 'string'
        ? { id: body.labelGroupId }
        : await createLabelGroup(labelGroupName(hill.title));

    await setHillLinear(params.id, {
      orgSlug: await getOrgSlug(),
      projectId: project.id,
      projectName: project.name,
      projectUrl: project.url,
      milestoneId: milestone?.id,
      milestoneName: milestone?.name,
      labelGroupId: group.id,
      connectedAt: Date.now(),
    });

    const result = await syncHill(params.id, { adopt: true });
    return NextResponse.json({ connected: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Linear request failed' },
      { status: 502 }
    );
  }
}

// DELETE /api/linear/hills/:id → disconnect. Leaves the group and every label
// in Linear untouched; only Misty's side of the link is dropped.
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const hill = await getHill(params.id);
  if (!hill) return NextResponse.json({ error: 'Hill not found' }, { status: 404 });
  await clearHillLinear(params.id);
  return NextResponse.json({ connected: false });
}
