'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { TimelineProject, TimelineMode, SCOPE_COLORS } from '@/types';

interface HillTimelineProps {
  projects: TimelineProject[];
  mode: TimelineMode;
  onAddProject: () => string;
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

  const { monthMarkers, weekTicks, timelineStart, timelineTotalMs } = useMemo(() => {
    const now = new Date();
    const start = now.getTime();
    // Cap at the last day of the 6th month counting the current one: in July the
    // window ends on Dec 31 (day 0 of month+6 = last day of the prior month).
    const end = new Date(now.getFullYear(), now.getMonth() + 6, 0).getTime();
    const totalMs = end - start;

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      return {
        label: d.toLocaleString('default', { month: 'short' }),
        position: (d.getTime() - start) / totalMs,
      };
    }).filter((m) => m.position < 1);

    // One tick per month at the 15th (halfway through each month)
    const midMonths: number[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 15);
      const pos = (d.getTime() - start) / totalMs;
      if (pos > 0 && pos < 1) midMonths.push(pos);
    }

    return { monthMarkers: months, weekTicks: midMonths, timelineStart: start, timelineTotalMs: totalMs };
  }, []);

  const dateToPosition = (dateMs: number) =>
    (dateMs - timelineStart) / timelineTotalMs;

  const formatDate = (dateMs: number) =>
    new Date(dateMs).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });

  const getPositionFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

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
    const id = onAddProject();
    setTooltipId(id);
    setEditingName('New goal');
  }, [onAddProject]);

  return (
    <div className="bg-bg-default border border-border-muted rounded-lg px-4 pt-2 pb-3 mb-2">
      <div className="flex items-center gap-6" style={{ height: '68px' }}>
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
          style={{ position: 'relative', flex: 1, height: '100%' }}
        >
          {/* Horizontal line */}
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '38px',
            height: '1px',
            backgroundColor: 'var(--border-muted)',
          }} />

          {/* "Now" marker — a taller accent-colored tick, no text */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: '30px',
            width: '2px',
            height: '16px',
            backgroundColor: 'var(--fg-accent)',
            borderRadius: '1px',
          }} />

          {/* Weekly ticks */}
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

          {/* Project dots */}
          {projects.map((project) => {
            const showHoverLabel = (hoveredId === project.id || draggingId === project.id) && tooltipId !== project.id;
            const visualPos = Math.max(0, Math.min(1, dateToPosition(project.date)));
            return (
              <div
                key={project.id}
                style={{
                  position: 'absolute',
                  left: `${visualPos * 100}%`,
                  top: '31px',
                  transform: 'translate(-50%, 0)',
                  zIndex: draggingId === project.id ? 20 : tooltipId === project.id ? 15 : hoveredId === project.id ? 10 : 5,
                }}
              >
                {/* Name label — always visible */}
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  textAlign: 'center',
                }}>
                  {/* Date — only on hover or while dragging, shown above name */}
                  {showHoverLabel && (
                    <div style={{ fontSize: '10px', color: 'var(--fg-muted)', lineHeight: 1.3, userSelect: 'none' }}>
                      {formatDate(project.date)}
                    </div>
                  )}
                  <div style={{ fontSize: '10px', color: 'var(--fg-default)', lineHeight: 1.4, userSelect: 'none' }}>
                    {project.name}
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
                        marginBottom: '8px',
                      }}
                    />
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

        {/* Add project button */}
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
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          + Goal
        </button>
      </div>
    </div>
  );
}
