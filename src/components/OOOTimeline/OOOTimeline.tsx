'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { OOOSettings } from '@/types';
import { useOOOCalendar } from '@/lib/useOOOCalendar';

const OOO_ORANGE = '#e16f24';
const OOO_RED = '#d1242f';

interface OOOTimelineProps {
  settings: OOOSettings;
  onUpdateSettings: (updates: Partial<OOOSettings>) => void;
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={spinning ? { animation: 'ooo-spin 0.8s linear infinite' } : undefined}
    >
      <path d="M10.5 2v3H7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.5 10V7h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.81 4.5A4.5 4.5 0 0 1 9.68 3.32M9.19 7.5A4.5 4.5 0 0 1 2.32 8.68" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export default function OOOTimeline({ settings, onUpdateSettings }: OOOTimelineProps) {
  const { data, loading, refreshing, refresh } = useOOOCalendar();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

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

  const getDotColor = useCallback((count: number): string | null => {
    const pct = (count / Math.max(1, settings.teamSize)) * 100;
    if (pct >= settings.redThreshold) return OOO_RED;
    if (pct >= settings.orangeThreshold) return OOO_ORANGE;
    return null;
  }, [settings]);

  const maxCount = data?.days.reduce((max, d) => Math.max(max, d.count), 0) ?? 0;
  const trackHeight = Math.max(68, 46 + maxCount * 10);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [settingsOpen]);

  const formatDate = useCallback((dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' }),
  []);

  const visibleDays = (data?.days ?? []).filter((d) => {
    const pos = dateToPosition(d.date);
    return pos >= 0 && pos <= 1;
  });

  return (
    <>
      <style>{`@keyframes ooo-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div className="bg-bg-default border border-border-muted rounded-lg px-4 py-3 mb-6">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', minHeight: `${trackHeight}px` }}>
          {/* Label is absolutely positioned so it doesn't widen this column — gear button sets the column width */}
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
              Out of office
            </span>
          {/* Gear icon + settings popover */}
          <div ref={settingsRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title="OOO calendar settings"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: settingsOpen ? 'var(--fg-accent)' : 'var(--fg-muted)',
                border: '1px solid var(--border-muted)',
                borderRadius: '4px',
                padding: '4px',
                background: 'var(--bg-muted)',
                cursor: 'pointer',
              }}
            >
              <GearIcon />
            </button>

            {settingsOpen && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: '0',
                  backgroundColor: 'var(--bg-default)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '12px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  minWidth: '200px',
                  zIndex: 100,
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-5px',
                  left: '8px',
                  width: '8px',
                  height: '8px',
                  backgroundColor: 'var(--bg-default)',
                  border: '1px solid var(--border-default)',
                  borderBottom: 'none',
                  borderRight: 'none',
                  transform: 'rotate(45deg)',
                }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--fg-muted)' }}>
                    Team size
                    <input
                      type="number"
                      min="1"
                      value={settings.teamSize}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (v > 0) onUpdateSettings({ teamSize: v });
                      }}
                      style={{
                        display: 'block',
                        marginTop: '3px',
                        width: '100%',
                        boxSizing: 'border-box',
                        border: '1px solid var(--border-muted)',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        fontSize: '12px',
                        backgroundColor: 'var(--bg-muted)',
                        color: 'var(--fg-default)',
                        outline: 'none',
                      }}
                    />
                  </label>

                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--fg-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OOO_ORANGE, display: 'inline-block', flexShrink: 0 }} />
                      Warning threshold
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={settings.orangeThreshold}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (v >= 1 && v <= 100) onUpdateSettings({ orangeThreshold: v });
                        }}
                        style={{
                          flex: 1,
                          border: '1px solid var(--border-muted)',
                          borderRadius: '4px',
                          padding: '4px 6px',
                          fontSize: '12px',
                          backgroundColor: 'var(--bg-muted)',
                          color: 'var(--fg-default)',
                          outline: 'none',
                          minWidth: 0,
                        }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--fg-muted)', flexShrink: 0 }}>% OOO</span>
                    </div>
                  </label>

                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--fg-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: OOO_RED, display: 'inline-block', flexShrink: 0 }} />
                      Alert threshold
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={settings.redThreshold}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (v >= 1 && v <= 100) onUpdateSettings({ redThreshold: v });
                        }}
                        style={{
                          flex: 1,
                          border: '1px solid var(--border-muted)',
                          borderRadius: '4px',
                          padding: '4px 6px',
                          fontSize: '12px',
                          backgroundColor: 'var(--bg-muted)',
                          color: 'var(--fg-default)',
                          outline: 'none',
                          minWidth: 0,
                        }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--fg-muted)', flexShrink: 0 }}>% OOO</span>
                    </div>
                  </label>

                  <button
                    onClick={refresh}
                    disabled={refreshing}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '5px 8px',
                      fontSize: '11px',
                      border: '1px solid var(--border-muted)',
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: refreshing ? 'var(--fg-muted)' : 'var(--fg-default)',
                      cursor: refreshing ? 'wait' : 'pointer',
                      marginTop: '2px',
                    }}
                  >
                    <RefreshIcon spinning={refreshing} />
                    {refreshing ? 'Refreshing…' : 'Refresh calendar'}
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>{/* end left wrapper */}

          {/* Timeline track */}
          <div style={{ position: 'relative', flex: 1, height: `${trackHeight}px` }}>
            {/* Horizontal baseline */}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '38px',
              height: '1px',
              backgroundColor: 'var(--border-muted)',
            }} />

            {/* "Now" marker */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: '30px',
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
                  top: '34px',
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
                  top: '32px',
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

            {/* OOO dot columns — anchored at baseline, dots hang below, tooltip floats above */}
            {!loading && visibleDays.map((day) => {
              const pos = dateToPosition(day.date);
              const dotColor = getDotColor(day.count);
              const isHovered = hoveredDate === day.date;

              return (
                <div
                  key={day.date}
                  onMouseEnter={() => setHoveredDate(day.date)}
                  onMouseLeave={() => setHoveredDate(null)}
                  style={{
                    position: 'absolute',
                    left: `${pos * 100}%`,
                    top: '38px',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '0 5px',
                    cursor: 'default',
                    zIndex: isHovered ? 10 : 5,
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
                      <div style={{ fontSize: '10px', color: 'var(--fg-muted)', lineHeight: 1.3, userSelect: 'none' }}>
                        {formatDate(day.date)}
                      </div>
                      {day.names.map((name, i) => (
                        <div key={i} style={{ fontSize: '10px', color: 'var(--fg-default)', lineHeight: 1.4, userSelect: 'none' }}>
                          {name}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dots hanging below the baseline */}
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    {Array.from({ length: day.count }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: dotColor ?? 'var(--fg-muted)',
                          opacity: dotColor ? 0.85 : 0.45,
                          flexShrink: 0,
                        }}
                      />
                    ))}
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

