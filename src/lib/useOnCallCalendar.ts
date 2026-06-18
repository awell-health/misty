'use client';

import { useState, useEffect, useCallback } from 'react';
import { OnCallCalendarData } from '@/types';

export function useOnCallCalendar() {
  const [data, setData] = useState<OnCallCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force = false) => {
    const url = force
      ? `/api/oncall-calendar?force=1&t=${Date.now()}`
      : '/api/oncall-calendar';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: OnCallCalendarData = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load on-call calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('/api/oncall-calendar/revalidate', { method: 'POST' });
      await fetchData(true);
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refreshing, error, refresh };
}
