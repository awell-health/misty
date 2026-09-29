'use client';

import { useState, useEffect, useCallback } from 'react';
import { HillLinearSignal } from '@/types';
import { syncHillLabels } from '@/lib/linear/sync';

const POLL_MS = 2 * 60 * 1000;

// Read-only Linear evidence for one hill. Mirrors useOnCallCalendar: load on
// mount, refresh on demand, and never throw a failure at the caller — a hill
// with an unreachable Linear simply shows no signal row.
export function useLinearSignal(hillId: string) {
  const [signal, setSignal] = useState<HillLinearSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSignal = useCallback(async () => {
    try {
      const res = await fetch(`/api/linear/hills/${hillId}`);
      const json: HillLinearSignal & { error?: string } = await res.json();
      setSignal(json);
      setError(json.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach Linear');
    } finally {
      setLoading(false);
    }
  }, [hillId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncHillLabels(hillId);
      await fetchSignal();
    } finally {
      setRefreshing(false);
    }
  }, [hillId, fetchSignal]);

  useEffect(() => {
    setLoading(true);
    fetchSignal();
    const timer = setInterval(fetchSignal, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchSignal]);

  // Heal on load: one reconcile per hill visit catches anything a failed write
  // left behind, without a burst of requests on the hills index.
  useEffect(() => {
    syncHillLabels(hillId);
  }, [hillId]);

  return { signal, loading, refreshing, error, refresh, reload: fetchSignal };
}
