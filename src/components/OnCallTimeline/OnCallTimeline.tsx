'use client';

import { useState, useMemo, useCallback } from 'react';
import { useOnCallCalendar } from '@/lib/useOnCallCalendar';

const ONCALL_COLOR = '#8250df';

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={spinning ? { animation: 'oncall-spin 0.8s linear infinite' } : undefined}
    >
      <path d="M10.5 2v3H7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.5 10V7h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.81 4.5A4.5 4.5 0 0 1 9.68 3.32M9.19 7.5A4.5 4.5 0 0 1 2.32 8.68" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const TRACK_HEIGHT = 76;
const BASELINE_TOP = 38;

export default function OnCallTimeline() {
  const { data, loading, refreshing, refresh } = useOnCallCalendar();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { monthMarkers, weekTicks, timelineStart, timelineTotalMs } = useMemo(() => {
    const now = new Date();
    const start = now.getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 2, now.getDate()).getTime();
    const totalMs = end - start;

    const months = Array.from({ length: 2 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      return {
        label: d.toLocaleString('default', { month: 'short' }),
        position: (d.getTime() - start) / totalMs,
      };
    });

    const midMonths: number[] = [];
    for (let i = 0; i < 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 15);
      const pos = (d.getTime() - start) / totalMs;
      if (pos > 0 && pos < 1) midMonths.push(pos);
    }

    return { monthMarkers: months, weekTicks: midMonths, timelineStart: start, timelineTotalMs: totalMs };
  }, []);

  const dateToPosition = useCallback((dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00').getTime();
    return (d - timelineStart) / timelineTotalMs;
  }, [timelineStart, timelineTotalMs]);

  const formatDate = useCallback((dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' }),
  []);

  // Each shift becomes a segment on the line; the dot sits at the segment's
  // midpoint. end is exclusive, so the last covered day is end - 1.
  const visibleShifts = (data?.shifts ?? [])
    .map((shift, i) => {
      const startPos = Math.max(0, dateToPosition(shift.start));
      const endPos = Math.min(1, dateToPosition(shift.end));
      const lastDay = new Date(shift.end + 'T00:00:00');
      lastDay.setDate(lastDay.getDate() - 1);
      const lastDayStr = lastDay.toISOString().split('T')[0];
      return { ...shift, i, startPos, endPos, midPos: (startPos + endPos) / 2, lastDayStr };
    })
    .filter((s) => s.endPos > 0 && s.startPos < 1 && s.endPos > s.startPos);

  return (
    <>
      <style>{`@keyframes oncall-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div className="bg-bg-default border border-border-muted rounded-lg px-4 py-3 mb-6">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', minHeight: `${TRACK_HEIGHT}px` }}>
          {/* Label + refresh — absolutely positioned label so it doesn't widen this column */}
          <div style={{ position: 'relative', flexShrink: 0, paddingTop: '28px' }}>
            <span style={{
              position: 'absolute',
              top: '0',
              left: '0',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--fg-muted)',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}>
              Triage Captain
            </span>
            <button
              onClick={refresh}
              disabled={refreshing}
              title="Refresh on-call calendar"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--fg-muted)',
                border: '1px solid var(--border-muted)',
                borderRadius: '4px',
                padding: '4px',
                background: 'var(--bg-muted)',
                cursor: refreshing ? 'wait' : 'pointer',
              }}
            >
              <RefreshIcon spinning={refreshing} />
            </button>
          </div>

          {/* Timeline track */}
          <div style={{ position: 'relative', flex: 1, height: `${TRACK_HEIGHT}px` }}>
            {/* Horizontal baseline */}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${BASELINE_TOP}px`,
              height: '1px',
              backgroundColor: 'var(--border-muted)',
            }} />

            {/* "Now" marker */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: `${BASELINE_TOP - 8}px`,
              width: '2px',
              height: '16px',
              backgroundColor: 'var(--fg-accent)',
              borderRadius: '1px',
            }} />

            {/* Midmonth ticks */}
            {weekTicks.map((pos) => (
              <div
                key={pos}
                style={{
                  position: 'absolute',
                  left: `${pos * 100}%`,
                  top: `${BASELINE_TOP - 4}px`,
                  transform: 'translateX(-50%)',
                  width: '1px',
                  height: '8px',
                  backgroundColor: 'var(--border-muted)',
                }}
              />
            ))}

            {/* Month markers */}
            {monthMarkers.map((m) => (
              <div
                key={m.label}
                style={{
                  position: 'absolute',
                  left: `${m.position * 100}%`,
                  top: `${BASELINE_TOP - 6}px`,
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-default)' }} />
                <span style={{ fontSize: '10px', color: 'var(--fg-muted)', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {m.label}
                </span>
              </div>
            ))}

            {/* On-call shifts — a subtle span shows coverage, the dot sits on the line */}
            {!loading && visibleShifts.map((shift) => {
              const isHovered = hoveredIndex === shift.i;
              return (
                <div key={shift.i}>
                  {/* Coverage span sitting on the baseline */}
                  <div style={{
                    position: 'absolute',
                    left: `${shift.startPos * 100}%`,
                    width: `${(shift.endPos - shift.startPos) * 100}%`,
                    top: `${BASELINE_TOP - 1.5}px`,
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: ONCALL_COLOR,
                    opacity: isHovered ? 0.45 : 0.25,
                  }} />

                  {/* Dot centered on the line at the shift midpoint */}
                  <div
                    onMouseEnter={() => setHoveredIndex(shift.i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    style={{
                      position: 'absolute',
                      left: `${shift.midPos * 100}%`,
                      top: `${BASELINE_TOP}px`,
                      transform: 'translate(-50%, -50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      cursor: 'default',
                      zIndex: isHovered ? 10 : 5,
                      padding: '0 4px',
                    }}
                  >
                    {/* Hover tooltip — floats above the baseline */}
                    {isHovered && (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '10px', color: 'var(--fg-default)', lineHeight: 1.4, userSelect: 'none' }}>
                          {shift.name}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--fg-muted)', lineHeight: 1.3, userSelect: 'none' }}>
                          {formatDate(shift.start)} – {formatDate(shift.lastDayStr)}
                        </div>
                      </div>
                    )}

                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: ONCALL_COLOR,
                      border: '2px solid var(--bg-default)',
                      boxSizing: 'content-box',
                    }} />
                  </div>

                  {/* Name label below the line */}
                  <div style={{
                    position: 'absolute',
                    left: `${shift.midPos * 100}%`,
                    top: `${BASELINE_TOP + 12}px`,
                    transform: 'translateX(-50%)',
                    fontSize: '10px',
                    color: isHovered ? 'var(--fg-default)' : 'var(--fg-muted)',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}>
                    {shift.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
