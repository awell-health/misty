import { NextRequest, NextResponse } from 'next/server';
import { getHill } from '@/lib/api/store';
import { isLinearConfigured, retireLabel, updateLabel } from '@/lib/linear/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/linear/hills/:id/labels
//   { action: 'retire', labelId }              — scope deleted in Misty
//   { action: 'move', labelId, toHillId }      — scope moved to another hill
//
// Retiring lives here rather than in the reconciler because only the caller
// knows a scope was deliberately deleted; the reconciler can't tell that from a
// label someone added by hand. Nothing ever deletes a label: retiring keeps it
// on the issues that carry it and can be undone.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isLinearConfigured()) return NextResponse.json({ ok: true });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body?.labelId !== 'string') {
    return NextResponse.json({ error: '`labelId` is required' }, { status: 400 });
  }

  try {
    if (body.action === 'retire') {
      await retireLabel(body.labelId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'move') {
      const target = typeof body.toHillId === 'string' ? await getHill(body.toHillId) : null;
      // Moving into a hill that isn't connected: leave the label where it is
      // rather than stranding it, and let the target hill's scope carry no
      // label until someone connects that hill.
      if (!target?.linear) return NextResponse.json({ ok: true, reparented: false });
      await updateLabel(body.labelId, { parentId: target.linear.labelGroupId });
      return NextResponse.json({ ok: true, reparented: true });
    }

    return NextResponse.json({ error: 'Unknown `action`' }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Linear request failed' },
      { status: 502 }
    );
  }
}
