import { revalidatePath } from 'next/cache';
import { runOOOSync } from '@/lib/oooSync';

export const runtime = 'nodejs';

// Refreshing the OOO calendar also runs the incident.io override sync, so a
// newly added OOO day takes effect without waiting for the hourly cron.
// The calendar refresh still succeeds if the sync can't run.
export async function POST() {
  revalidatePath('/api/ooo-calendar');

  try {
    const { created, failed, skipped } = await runOOOSync({ apply: true });
    return Response.json({
      revalidated: true,
      sync: { created: created.length, failed: failed.length, skipped: skipped.length },
    });
  } catch (e) {
    return Response.json({ revalidated: true, sync: { error: (e as Error).message } });
  }
}
