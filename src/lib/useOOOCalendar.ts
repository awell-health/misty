'use client';

import { useState, useEffect, useCallback } from 'react';
import { OOOCalendarData } from '@/types';

export function useOOOCalendar() {
  const [data, setData] = useState<OOOCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Outcome of the incident.io override sync that the last refresh ran.
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    const url = force
      ? `/api/ooo-calendar?force=1&t=${Date.now()}`
      : '/api/ooo-calendar';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: OOOCalendarData = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load OOO calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/ooo-calendar/revalidate', { method: 'POST' });
      setSyncStatus(describeSync(res.ok ? (await res.json()).sync : { error: `HTTP ${res.status}` }));
      await fetchData(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refreshing, error, refresh, syncStatus };
}

type SyncSummary = { created?: number; failed?: number; skipped?: number; error?: string } | undefined;

function describeSync(sync: SyncSummary): string {
  if (!sync) return 'incident.io sync did not run';
  if (sync.error) return `incident.io sync failed: ${sync.error}`;
  const parts = [`${sync.created ?? 0} override${sync.created === 1 ? '' : 's'} created`];
  if (sync.failed) parts.push(`${sync.failed} failed`);
  if (sync.skipped) parts.push(`${sync.skipped} skipped`);
  return `incident.io: ${parts.join(', ')}`;
}
