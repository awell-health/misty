'use client';

import { useMemo, useState } from 'react';
import { Hill } from '@/types';

interface HillRoadmapProps {
  hills: Hill[];
  onOpenHill: (id: string) => void;
}

const MONTH_COUNT = 6;
const BUILD_BG = 'rgba(26, 127, 55, 0.12)';

type CellKind = 'build' | 'launch' | 'empty';

interface Row {
  hillId: string;
  hillTitle: string;  // owning hill title, shown before the goal name
  name: string;       // goal name
  date: number;       // goal target date (epoch ms) — for ordering
  launchIdx: number;  // column index of the launch month (within window)
  buildStartIdx: number; // first column the build phase occupies
}

export default function HillRoadmap({ hills, onOpenHill }: HillRoadmapProps) {
  const [expanded, setExpanded] = useState(false);
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: MONTH_COUNT }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return {
        label: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        month: d.getMonth(),
      };
    });
  }, []);

  const activeHills = hills.filter((h) => !h.completed && !h.archived);

  // One row per goal whose target month falls within the window. Goals in the
  // same hill are sequenced by date: a goal's build phase starts the month after
  // the previous goal's launch, so overlapping hills read as stacked phases.
  const rows: Row[] = [];
  activeHills.forEach((hill) => {
    const sorted = [...(hill.timelineProjects ?? [])].sort((a, b) => a.date - b.date);
    let prevIdx = -1;  // launch column of the previously processed in-window goal
    let boundary = -1; // last launch column strictly earlier than the current month group
    sorted.forEach((p) => {
      const d = new Date(p.date);
      const idx = months.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth());
      if (idx === -1) return;
      // Only advance the build boundary at a strictly later month, so goals that
      // launch in the same month share the same build phase instead of the later
      // ones getting sequenced past their own launch.
      if (idx !== prevIdx) boundary = prevIdx;
      rows.push({
        hillId: hill.id,
        hillTitle: hill.title || 'Untitled hill',
        name: p.name || 'Untitled goal',
        date: p.date,
        launchIdx: idx,
        buildStartIdx: Math.max(0, boundary + 1),
      });
      prevIdx = idx;
    });
  });

  // Order rows across all hills by what launches first.
  rows.sort((a, b) => a.date - b.date);

  const gridTemplateColumns = `minmax(120px, 220px) repeat(${MONTH_COUNT}, 1fr)`;
  const collapsedGridTemplateColumns = `repeat(${MONTH_COUNT}, 1fr)`;

  const cellKind = (row: Row, i: number): CellKind =>
    i === row.launchIdx
      ? 'launch'
      : i >= row.buildStartIdx && i < row.launchIdx
        ? 'build'
        : 'empty';

  const cellStyle = (kind: CellKind) =>
    kind === 'launch'
      ? { backgroundColor: 'var(--bg-accent-subtle)', color: 'var(--fg-accent)' }
      : kind === 'build'
        ? { backgroundColor: BUILD_BG, color: 'var(--fg-success)' }
        : undefined;

  return (
    <div className="bg-bg-default border border-border-muted rounded-lg px-4 py-3 mb-6">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-2 bg-none border-none p-0 cursor-pointer text-fg-muted hover:text-fg-accent select-none w-full mb-1"
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
          className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
        </svg>
        <span className="text-[11px] font-medium">Roadmap</span>
      </button>

      {rows.length === 0 ? (
        <div className="text-[12px] text-fg-muted text-center py-2 select-none">
          No goals in the next {MONTH_COUNT} months.
        </div>
      ) : expanded ? (
        <div className="grid gap-1 items-stretch" style={{ gridTemplateColumns }}>
          {/* Header row */}
          <div className="text-[11px] font-medium text-fg-muted self-end pb-1 select-none" />
          {months.map((m) => (
            <div
              key={`${m.year}-${m.month}`}
              className="text-[11px] font-medium text-fg-muted text-center pb-1 select-none"
            >
              {m.label}
            </div>
          ))}

          {/* Goal rows */}
          {rows.map((row, r) => (
            <div key={`${row.hillId}-${r}`} className="contents">
              <button
                onClick={() => onOpenHill(row.hillId)}
                className="flex flex-col text-left pr-2 py-1.5 bg-none border-none cursor-pointer group min-w-0"
                title={`${row.hillTitle}: ${row.name}`}
              >
                <span className="text-[11px] text-fg-muted truncate group-hover:text-fg-accent">{row.hillTitle}</span>
                <span className="text-[13px] text-fg-default truncate group-hover:text-fg-accent">{row.name}</span>
              </button>
              {months.map((_, i) => {
                const kind = cellKind(row, i);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-center rounded-sm text-[11px] font-medium min-h-[28px] select-none"
                    style={cellStyle(kind)}
                  >
                    {kind === 'launch' ? 'Launch' : kind === 'build' ? 'Build' : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        /* Collapsed view — just the visual bars, no labels or text */
        <div className="grid gap-0.5" style={{ gridTemplateColumns: collapsedGridTemplateColumns }}>
          {rows.map((row, r) => (
            <div key={`${row.hillId}-${r}`} className="contents">
              {months.map((_, i) => {
                const kind = cellKind(row, i);
                return (
                  <div
                    key={i}
                    className="rounded-sm min-h-[6px]"
                    style={cellStyle(kind)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
