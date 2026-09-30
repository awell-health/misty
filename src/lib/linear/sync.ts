'use client';

// Client-side triggers for the server's reconciler. Every call is best-effort:
// a Linear write that fails must never surface as a failed edit in Misty, since
// the next reconcile picks it up anyway.

export async function syncHillLabels(hillId: string): Promise<void> {
  try {
    await fetch(`/api/linear/hills/${hillId}/sync`, { method: 'POST' });
  } catch {
    // Offline or route unavailable — the next change or page load retries.
  }
}

export async function retireScopeLabel(hillId: string, labelId: string): Promise<void> {
  try {
    await fetch(`/api/linear/hills/${hillId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retire', labelId }),
    });
  } catch {
    // Left in place; a stale label is harmless next to a lost one.
  }
}

export async function moveScopeLabel(
  fromHillId: string,
  toHillId: string,
  labelId: string
): Promise<void> {
  try {
    await fetch(`/api/linear/hills/${fromHillId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move', labelId, toHillId }),
    });
    await syncHillLabels(toHillId);
  } catch {
    // Same reasoning as above.
  }
}
