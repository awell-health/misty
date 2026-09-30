import { NextResponse } from 'next/server';
import { isLinearConfigured, listProjects } from '@/lib/linear/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/linear/projects → projects for the connect picker.
// `configured: false` (rather than an error) lets the UI hide the feature
// cleanly on a deployment with no LINEAR_API_KEY.
export async function GET() {
  if (!isLinearConfigured()) {
    return NextResponse.json({ configured: false, projects: [] });
  }
  try {
    return NextResponse.json({ configured: true, projects: await listProjects() });
  } catch (e) {
    return NextResponse.json(
      { configured: true, projects: [], error: e instanceof Error ? e.message : 'Linear request failed' },
      { status: 502 }
    );
  }
}
