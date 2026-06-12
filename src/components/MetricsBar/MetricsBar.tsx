'use client';

import { useState, useRef, useEffect } from 'react';
import { Metric, MetricType } from '@/types';

interface MetricsBarProps {
  metrics: Metric[];
  onUpdateMetric: (id: string, updates: Partial<Pick<Metric, 'type' | 'value' | 'sinceDate' | 'name'>>) => void;
}

function daysSince(dateStr: string): number {
  if (!dateStr) return 0;
  const then = new Date(dateStr + 'T00:00:00').getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

type EditState = { id: string; field: 'value' | 'name'; type: MetricType };

export default function MetricsBar({ metrics, onUpdateMetric }: MetricsBarProps) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = (m: Metric, field: 'value' | 'name') => {
    if (field === 'name') setDraft(m.name);
    else setDraft(m.type === 'since' ? m.sinceDate : m.value);
    setEditing({ id: m.id, field, type: m.type });
  };

  const commit = () => {
    if (!editing) return;
    if (editing.field === 'name') {
      onUpdateMetric(editing.id, { name: draft.trim() });
    } else if (editing.type === 'since') {
      onUpdateMetric(editing.id, { sinceDate: draft });
    } else {
      onUpdateMetric(editing.id, { value: draft });
    }
    setEditing(null);
  };

  const cancel = () => setEditing(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') cancel();
  };

  const switchType = (m: Metric, type: MetricType) => {
    onUpdateMetric(m.id, { type });
    setDraft(type === 'since' ? m.sinceDate : m.value);
    setEditing((e) => (e ? { ...e, type } : e));
  };

  return (
    <div className="bg-bg-default border border-border-muted rounded-lg mb-6 grid grid-cols-3 max-sm:grid-cols-1">
      {metrics.map((m, i) => {
        const isEditingValue = editing?.id === m.id && editing.field === 'value';
        const isEditingName = editing?.id === m.id && editing.field === 'name';
        const displayValue = m.type === 'since' ? String(daysSince(m.sinceDate)) : (m.value || '—');

        return (
          <div
            key={m.id}
            className={`flex flex-col items-center text-center px-5 py-5 ${i > 0 ? 'border-l border-border-muted max-sm:border-l-0 max-sm:border-t' : ''}`}
          >
            {/* Big value */}
            {isEditingValue ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <input
                  ref={inputRef}
                  type={editing.type === 'since' ? 'date' : 'text'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={handleKeyDown}
                  className="w-full max-w-[180px] text-center text-2xl font-bold text-fg-default bg-bg-muted border border-fg-accent rounded-md px-2 py-1 outline-none"
                />
                <div className="flex bg-bg-muted rounded-md p-0.5 border border-border-muted">
                  {(['raw', 'since'] as MetricType[]).map((t) => (
                    <button
                      key={t}
                      // onMouseDown so it fires before the input's onBlur commits/closes
                      onMouseDown={(e) => { e.preventDefault(); switchType(m, t); }}
                      className={`px-2.5 py-0.5 text-[11px] font-medium rounded-sm border-none cursor-pointer transition-colors ${editing.type === t ? 'bg-bg-default text-fg-accent shadow-sm' : 'bg-transparent text-fg-muted hover:text-fg-default'}`}
                    >
                      {t === 'raw' ? 'Value' : 'Since'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                onDoubleClick={() => startEdit(m, 'value')}
                title="Double-click to edit"
                className="text-[40px] leading-none font-bold text-fg-default cursor-text select-none tracking-tight"
              >
                {displayValue}
              </div>
            )}

            {/* Metric name */}
            {isEditingName ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                className="mt-3 w-full max-w-[180px] text-center text-xs font-medium uppercase tracking-wide text-fg-default bg-bg-muted border border-fg-accent rounded-md px-2 py-1 outline-none"
              />
            ) : (
              <div
                onDoubleClick={() => startEdit(m, 'name')}
                title="Double-click to edit"
                className="mt-3 text-xs font-medium uppercase tracking-wide text-fg-muted cursor-text select-none"
              >
                {m.type === 'since' && (m.name || '').length > 0 ? `days since ${m.name}` : (m.name || 'Untitled metric')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
