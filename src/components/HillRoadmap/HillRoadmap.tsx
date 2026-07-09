'use client';

import { useMemo } from 'react';
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
  name: string;       // goal name
  date: number;       // goal target date (epoch ms) — for ordering
  launchIdx: number;  // column index of the launch month (within window)
  buildStartIdx: number; // first column the build phase occupies
}

export default function HillRoadmap({ hills, onOpenHill }: HillRoadmapProps) {
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
    let prevLaunchIdx = -1;
    sorted.forEach((p) => {
      const d = new Date(p.date);
      const idx = months.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth());
      if (idx !== -1) {
        rows.push({
          hillId: hill.id,
          name: p.name || 'Untitled goal',
          date: p.date,
          launchIdx: idx,
          buildStartIdx: Math.max(0, prevLaunchIdx + 1),
        });
        prevLaunchIdx = idx;
      }
    });
  });

  // Order rows across all hills by what launches first.
  rows.sort((a, b) => a.date - b.date);

  const gridTemplateColumns = `minmax(120px, 220px) repeat(${MONTH_COUNT}, 1fr)`;

  return (
    <div className="bg-bg-default border border-border-muted rounded-lg px-4 py-3 mb-6">
      <div className="grid gap-1 items-stretch" style={{ gridTemplateColumns }}>
        {/* Header row */}
        <div className="text-[11px] font-medium text-fg-muted self-end pb-1 select-none">
          Roadmap
        </div>
        {months.map((m) => (
          <div
            key={`${m.year}-${m.month}`}
            className="text-[11px] font-medium text-fg-muted text-center pb-1 select-none"
          >
            {m.label}
          </div>
        ))}

        {/* Goal rows */}
        {rows.length === 0 && (
          <div className="col-span-full text-[12px] text-fg-muted text-center py-2 select-none">
            No goals in the next {MONTH_COUNT} months.
          </div>
        )}
        {rows.map((row, r) => (
          <div key={`${row.hillId}-${r}`} className="contents">
            <button
              onClick={() => onOpenHill(row.hillId)}
              className="text-left text-[13px] text-fg-default truncate pr-2 py-1.5 bg-none border-none cursor-pointer hover:text-fg-accent"
              title={row.name}
            >
              {row.name}
            </button>
            {months.map((_, i) => {
              const kind: CellKind =
                i === row.launchIdx
                  ? 'launch'
                  : i >= row.buildStartIdx && i < row.launchIdx
                    ? 'build'
                    : 'empty';
              return (
                <div
                  key={i}
                  className="flex items-center justify-center rounded-sm text-[11px] font-medium min-h-[28px] select-none"
                  style={
                    kind === 'launch'
                      ? { backgroundColor: 'var(--bg-accent-subtle)', color: 'var(--fg-accent)' }
                      : kind === 'build'
                        ? { backgroundColor: BUILD_BG, color: 'var(--fg-success)' }
                        : undefined
                  }
                >
                  {kind === 'launch' ? 'Launch' : kind === 'build' ? 'Build' : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
