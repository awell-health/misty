'use client';

import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { TimelineProject, TimelineMode, SCOPE_COLORS, GOAL_NAME_MAX_LENGTH } from '@/types';
import {
  TimelineRange,
  TIMELINE_RANGES,
  buildTimelineScale,
  defaultGoalDate,
  partitionGoals,
  positionOf,
} from './timelineScale';

interface HillTimelineProps {
  projects: TimelineProject[];
  mode: TimelineMode;
  onAddProject: (date: number) => string;
  onDeleteProject: (id: string) => void;
  onUpdateProjectName: (id: string, name: string) => void;
  onUpdateProjectColor: (id: string, color: string) => void;
  onUpdateProjectDate: (id: string, date: number) => void;
  onCommitProjectDate: (id: string, oldDate: number, newDate: number) => void;
  onToggleMode: () => void;
}

const MODE_LABELS: Record<TimelineMode, string> = {
  'fixed-timeline': 'Fixed Timeline + Variable Scope',
  'fixed-scope': 'Fixed Scope + Variable Timeline',
};

// Vertical height of one stacked name label; colliding labels step up by this.
const NAME_LINE_H = 15;

// The edit popover shows a character count once a name gets this close to the
// limit, so a long paste isn't cut short without a word.
const NAME_COUNT_FROM = GOAL_NAME_MAX_LENGTH - 56;

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="4" y1="1" x2="4" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function LegendIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2.5" r="1.5"/>
      <circle cx="2" cy="6" r="1.5"/>
      <circle cx="2" cy="9.5" r="1.5"/>
      <rect x="5" y="1.75" width="7" height="1.5" rx="0.75"/>
      <rect x="5" y="5.25" width="7" height="1.5" rx="0.75"/>
      <rect x="5" y="8.75" width="7" height="1.5" rx="0.75"/>
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
    </svg>
  );
}

export default function HillTimeline({
  projects,
  mode,
  onAddProject,
  onDeleteProject,
  onUpdateProjectName,
  onUpdateProjectColor,
  onUpdateProjectDate,
  onCommitProjectDate,
  onToggleMode,
}: HillTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const dragStartX = useRef<number | null>(null);
  const dragStartPos = useRef<number | null>(null);
  const hasDragged = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [lanes, setLanes] = useState<Record<string, number>>({});
  // How far ahead to look, and whether to list the goals below the track.
  // Both are this viewer's own view of the hill, so they aren't persisted.
  const [range, setRange] = useState<TimelineRange>('6m');
  const [showLegend, setShowLegend] = useState(false);

  const scale = useMemo(() => buildTimelineScale(range, new Date()), [range]);
  const timelineStart = scale.start;
  const timelineTotalMs = scale.end - scale.start;
  const { visible, later } = useMemo(() => partitionGoals(projects, scale), [projects, scale]);

  const formatDate = (dateMs: number) =>
    new Date(dateMs).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });

  const getPositionFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  // Assign each name label to a vertical lane so overlapping labels stack up
  // instead of colliding. Horizontal positions are lane-independent, so a single
  // measure pass is stable. Labels are numbers while the legend is open, so
  // their widths change with it.
  const posKey = `${range}|${showLegend}|` + visible.map((p) => `${p.id}:${p.date}:${p.name}`).join('|');
  useLayoutEffect(() => {
    const compute = () => {
      const items = visible
        .map((p) => {
          const el = labelRefs.current[p.id];
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { id: p.id, left: r.left, right: r.right };
        })
        .filter((x): x is { id: string; left: number; right: number } => x !== null)
        .sort((a, b) => a.left - b.left);

      const laneRight: number[] = [];
      const next: Record<string, number> = {};
      const GAP = 8;
      for (const it of items) {
        let lane = 0;
        while (lane < laneRight.length && laneRight[lane] + GAP > it.left) lane++;
        laneRight[lane] = it.right;
        next[it.id] = lane;
      }

      setLanes((prev) => {
        const keys = Object.keys(next);
        if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) {
          return prev;
        }
        return next;
      });
    };

    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey]);

  const handleDotMouseDown = useCallback((e: React.MouseEvent, project: TimelineProject) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartX.current = e.clientX;
    dragStartPos.current = project.date;
    hasDragged.current = false;
    setDraggingId(project.id);
  }, []);

  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartX.current !== null && Math.abs(e.clientX - dragStartX.current) > 4) {
        hasDragged.current = true;
        if (tooltipId) setTooltipId(null);
      }
      if (hasDragged.current) {
        const newDate = Math.round(timelineStart + getPositionFromClientX(e.clientX) * timelineTotalMs);
        onUpdateProjectDate(draggingId, newDate);
      }
    };

    const handleMouseUp = () => {
      if (hasDragged.current) {
        const project = projects.find((p) => p.id === draggingId);
        if (project && dragStartPos.current !== null) {
          onCommitProjectDate(draggingId, dragStartPos.current, project.date);
        }
      } else {
        const project = projects.find((p) => p.id === draggingId);
        if (project) {
          setTooltipId(project.id);
          setEditingName(project.name);
        }
      }
      dragStartX.current = null;
      dragStartPos.current = null;
      hasDragged.current = false;
      setDraggingId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, projects, onUpdateProjectDate, onCommitProjectDate, getPositionFromClientX, tooltipId, timelineStart, timelineTotalMs]);

  const commitTooltipName = useCallback(() => {
    if (!tooltipId) return;
    const project = projects.find((p) => p.id === tooltipId);
    if (project && editingName !== project.name) {
      onUpdateProjectName(tooltipId, editingName);
    }
  }, [tooltipId, projects, editingName, onUpdateProjectName]);

  useEffect(() => {
    if (!tooltipId) return;
    const handleMouseDown = (e: MouseEvent) => {
      const tooltip = document.getElementById(`tl-tooltip-${tooltipId}`);
      if (tooltip && tooltip.contains(e.target as Node)) return;
      commitTooltipName();
      setTooltipId(null);
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [tooltipId, commitTooltipName]);

  useEffect(() => {
    if (tooltipId && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [tooltipId]);

  const handleAddProject = useCallback(() => {
    const id = onAddProject(defaultGoalDate(scale, Date.now()));
    setTooltipId(id);
    setEditingName('New goal');
  }, [onAddProject, scale]);

  return (
    <div className="bg-bg-default border border-border-muted rounded-lg px-4 pt-2 pb-3 mb-2">
      <div className="flex items-center gap-6" style={{ height: '92px' }}>
        {/* Mode toggle */}
        <button
          onClick={onToggleMode}
          title={MODE_LABELS[mode]}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-muted)',
            border: '1px solid var(--border-muted)',
            borderRadius: '4px',
            padding: '4px',
            background: 'var(--bg-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {mode === 'fixed-timeline' ? <CalendarIcon /> : <TargetIcon />}
        </button>

        {/* Timeline track */}
        <div
          ref={containerRef}
          // Leave room past the end of the line for the "+N later" count.
          style={{ position: 'relative', flex: 1, height: '100%', marginRight: later.length > 0 ? '56px' : 0 }}
        >
          {/* Horizontal line */}
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '60px',
            height: '1px',
            backgroundColor: 'var(--border-muted)',
          }} />

          {/* "Now" marker — a taller accent-colored tick, no text */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: '52px',
            width: '2px',
            height: '16px',
            backgroundColor: 'var(--fg-accent)',
            borderRadius: '1px',
          }} />

          {/* Minor ticks */}
          {scale.ticks.map((pos) => (
            <div
              key={pos}
              style={{
                position: 'absolute',
                left: `${pos * 100}%`,
                top: '56px',
                transform: 'translateX(-50%)',
                width: '1px',
                height: '8px',
                backgroundColor: 'var(--border-muted)',
              }}
            />
          ))}

          {/* Labelled markers: months, or Mondays in the 30-day view */}
          {scale.markers.map((m) => (
            <div
              key={m.time}
              style={{
                position: 'absolute',
                left: `${m.position * 100}%`,
                top: '54px',
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

          {/* Goals dated after the window: a count just past the end of the line */}
          {later.length > 0 && (
            <div
              title={later.map((p) => `${formatDate(p.date)} · ${p.name || 'Untitled goal'}`).join('\n')}
              style={{
                position: 'absolute',
                left: '100%',
                marginLeft: '6px',
                top: '53px',
                height: '14px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '10px',
                color: 'var(--fg-muted)',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              +{later.length} later &rarr;
            </div>
          )}

          {/* Project dots */}
          {visible.map((project, index) => {
            // With the legend open, its highlighted row already shows the date
            // on hover; keep the floating date for drags only.
            const showHoverLabel =
              (draggingId === project.id || (hoveredId === project.id && !showLegend)) && tooltipId !== project.id;
            const visualPos = positionOf(scale, project.date);
            const lane = lanes[project.id] ?? 0;
            return (
              <div
                key={project.id}
                style={{
                  position: 'absolute',
                  left: `${visualPos * 100}%`,
                  top: '53px',
                  transform: 'translate(-50%, 0)',
                  zIndex: draggingId === project.id ? 20 : tooltipId === project.id ? 15 : hoveredId === project.id ? 10 : 5,
                }}
              >
                {/* Connector line from the dot up to its (possibly stacked) name */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: '100%',
                  transform: 'translateX(-50%)',
                  width: '1px',
                  height: `calc(4px + ${lane * NAME_LINE_H}px)`,
                  backgroundColor: project.color,
                  opacity: 0.4,
                  pointerEvents: 'none',
                }} />

                {/* Name label — always visible; stacks up a lane when it would
                    collide with a neighbouring label. With the legend open it
                    is the goal's number in the legend instead. */}
                <div
                  ref={(el) => { labelRefs.current[project.id] = el; }}
                  style={{
                    position: 'absolute',
                    bottom: `calc(100% + 4px + ${lane * NAME_LINE_H}px)`,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    textAlign: 'center',
                  }}
                >
                  {/* Date — only on hover or while dragging, shown above name */}
                  {showHoverLabel && (
                    <div style={{ fontSize: '10px', color: 'var(--fg-muted)', lineHeight: 1.3, userSelect: 'none' }}>
                      {formatDate(project.date)}
                    </div>
                  )}
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--fg-default)',
                    lineHeight: 1.4,
                    userSelect: 'none',
                    fontWeight: showLegend ? 600 : undefined,
                    fontVariantNumeric: showLegend ? 'tabular-nums' : undefined,
                  }}>
                    {showLegend ? index + 1 : project.name}
                  </div>
                </div>

                {/* Dot */}
                <div
                  onMouseDown={(e) => handleDotMouseDown(e, project)}
                  onMouseEnter={() => setHoveredId(project.id)}
                  onMouseLeave={() => setHoveredId((prev) => prev === project.id ? null : prev)}
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: project.color,
                    border: `2px solid var(--bg-default)`,
                    cursor: draggingId === project.id ? 'grabbing' : 'grab',
                    outline: tooltipId === project.id ? `2px solid ${project.color}` : undefined,
                    outlineOffset: '1px',
                    transform: hoveredId === project.id ? 'scale(1.25)' : undefined,
                    transition: 'transform 100ms',
                  }}
                />

                {/* Edit tooltip (on click) */}
                {tooltipId === project.id && (
                  <div
                    id={`tl-tooltip-${project.id}`}
                    style={{
                      position: 'absolute',
                      top: '20px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'var(--bg-default)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '8px',
                      padding: '8px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      minWidth: '160px',
                      zIndex: 100,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div style={{
                      position: 'absolute',
                      top: '-5px',
                      left: '50%',
                      marginLeft: '-4px',
                      width: '8px',
                      height: '8px',
                      backgroundColor: 'var(--bg-default)',
                      border: '1px solid var(--border-default)',
                      borderBottom: 'none',
                      borderRight: 'none',
                      transform: 'rotate(45deg)',
                    }} />
                    <input
                      ref={nameInputRef}
                      value={editingName}
                      maxLength={GOAL_NAME_MAX_LENGTH}
                      aria-label="Goal name"
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { commitTooltipName(); setTooltipId(null); }
                        else if (e.key === 'Escape') { setTooltipId(null); }
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        boxSizing: 'border-box',
                        border: '1px solid var(--border-muted)',
                        borderRadius: '4px',
                        padding: '4px 6px',
                        fontSize: '12px',
                        backgroundColor: 'var(--bg-muted)',
                        color: 'var(--fg-default)',
                        outline: 'none',
                        marginBottom: editingName.length >= NAME_COUNT_FROM ? '2px' : '8px',
                      }}
                    />
                    {editingName.length >= NAME_COUNT_FROM && (
                      <div style={{
                        fontSize: '10px',
                        textAlign: 'right',
                        marginBottom: '6px',
                        fontVariantNumeric: 'tabular-nums',
                        color: editingName.length >= GOAL_NAME_MAX_LENGTH ? 'var(--fg-danger)' : 'var(--fg-muted)',
                      }}>
                        {editingName.length}/{GOAL_NAME_MAX_LENGTH}
                      </div>
                    )}
                    {/* Color swatches */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gap: '4px',
                      marginBottom: '8px',
                    }}>
                      {SCOPE_COLORS.map((c) => (
                        <div
                          key={c}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            onUpdateProjectColor(project.id, c);
                          }}
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: c,
                            cursor: 'pointer',
                            outline: project.color === c ? `2px solid ${c}` : undefined,
                            outlineOffset: '2px',
                            border: '2px solid var(--bg-default)',
                          }}
                        />
                      ))}
                    </div>
                    <button
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        onDeleteProject(project.id);
                        setTooltipId(null);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '4px 6px',
                        fontSize: '12px',
                        border: '1px solid var(--border-muted)',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: 'var(--fg-danger)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* View controls (top right), with the add button below them */}
        <div className="flex flex-col items-end gap-2 self-start shrink-0">
          <div className="flex items-center gap-1.5">
            <div role="group" aria-label="Timeline range" className="flex bg-bg-muted rounded-md p-0.5 border border-border-muted">
              {TIMELINE_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-sm border-none cursor-pointer transition-colors ${range === r ? 'bg-bg-default text-fg-default shadow-sm' : 'bg-transparent text-fg-muted hover:text-fg-default'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowLegend((v) => !v)}
              aria-pressed={showLegend}
              aria-label="Legend"
              title={showLegend ? 'Hide legend' : 'List goals below the timeline'}
              className={`flex items-center justify-center self-stretch px-[6px] rounded-md border cursor-pointer transition-colors ${showLegend ? 'border-border-accent bg-bg-accent-subtle text-fg-accent' : 'border-border-muted bg-bg-default text-fg-muted hover:text-fg-default'}`}
            >
              <LegendIcon />
            </button>
          </div>

          <button
            onClick={handleAddProject}
            style={{
              fontSize: '11px',
              color: 'var(--fg-muted)',
              border: '1px solid var(--border-muted)',
              borderRadius: '4px',
              padding: '3px 8px',
              background: 'var(--bg-default)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Goal
          </button>
        </div>
      </div>

      {/* Legend: every goal in view, in date order, numbered to match the track */}
      {showLegend && (
        <div className="border-t border-border-muted mt-1 pt-2">
          {visible.length === 0 ? (
            <div className="text-[12px] text-fg-muted py-1 select-none">No goals in this view.</div>
          ) : (
            <ol aria-label="Goals" className="grid grid-cols-[auto_auto_auto_1fr] gap-x-2.5 list-none m-0 p-0">
              {visible.map((project, index) => (
                <li
                  key={project.id}
                  onMouseEnter={() => setHoveredId(project.id)}
                  onMouseLeave={() => setHoveredId((prev) => prev === project.id ? null : prev)}
                  className={`col-span-4 grid grid-cols-subgrid items-baseline px-1.5 py-1 rounded-sm text-[12px] ${hoveredId === project.id ? 'bg-bg-muted' : ''}`}
                >
                  <span className="text-fg-muted font-semibold tabular-nums text-right">{index + 1}</span>
                  <span
                    aria-hidden
                    className="w-2.5 h-2.5 rounded-full self-center"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="text-fg-muted tabular-nums whitespace-nowrap">{formatDate(project.date)}</span>
                  <span className="text-fg-default min-w-0 break-words">{project.name || 'Untitled goal'}</span>
                </li>
              ))}
            </ol>
          )}
          {later.length > 0 && (
            <div className="text-[11px] text-fg-muted px-1.5 pt-1 select-none">
              +{later.length} more after {formatDate(scale.end - 1)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
