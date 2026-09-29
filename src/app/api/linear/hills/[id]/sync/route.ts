import { NextRequest, NextResponse } from 'next/server';
import { isLinearConfigured } from '@/lib/linear/client';
import { syncHill } from '@/lib/linear/apply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/linear/hills/:id/sync → reconcile scopes against the label group.
// Idempotent and cheap, so the client calls it after any scope change and on
// page load; a write that failed earlier is retried here.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isLinearConfigured()) {
    return NextResponse.json({ applied: 0, errors: [] });
  }
  try {
    return NextResponse.json(await syncHill(params.id));
  } catch (e) {
    return NextResponse.json(
      { applied: 0, errors: [e instanceof Error ? e.message : 'Linear request failed'] },
      { status: 502 }
    );
  }
}
