'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Scope } from '@/types';
import {
  SVG_WIDTH,
  SVG_HEIGHT,
  PADDING,
  CHART_WIDTH,
  positionToPoint,
  generateHillPath,
  getMousePositionInSvg,
  layoutLabels,
  leaderPath,
  dragPosition,
  DOT_RADIUS,
  LABEL_HEADROOM,
} from './hillMath';


interface HillChartProps {
  scopes: Scope[];
  onUpdatePosition: (id: string, position: number) => void;
  onCommitPosition?: (id: string, oldPosition: number, newPosition: number) => void;
  originPositions?: Record<string, number>; // scope id → current position (shown as ghost in goal mode)
}

const GHOST_RADIUS = 6;
const NUDGE_STEP = 0.01;
const hillPath = generateHillPath();

export default function HillChart({ scopes, onUpdatePosition, onCommitPosition, originPositions }: HillChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dragStartPos = useRef<number | null>(null);
  const dragStartX = useRef(0);
  const heldExtraTop = useRef(0);

  // A drag moves the scope by how far the pointer travels, so grabbing the
  // label does not make the dot jump to the cursor.
  const handleMouseDown = useCallback((id: string, clientX: number) => {
    const scope = scopes.find((s) => s.id === id);
    dragStartPos.current = scope?.position ?? 0;
    if (svgRef.current) dragStartX.current = getMousePositionInSvg(clientX, 0, svgRef.current).x;
    setDraggingId(id);
    setSelectedId(id);
  }, [scopes]);

  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!svgRef.current) return;
      const { x } = getMousePositionInSvg(e.clientX, e.clientY, svgRef.current);
      const position = dragPosition(dragStartPos.current ?? 0, dragStartX.current, x);
      onUpdatePosition(draggingId, position);
    };

    const handleMouseUp = () => {
      if (onCommitPosition && dragStartPos.current !== null) {
        const scope = scopes.find((s) => s.id === draggingId);
        if (scope) onCommitPosition(draggingId, dragStartPos.current, scope.position);
      }
      dragStartPos.current = null;
      setDraggingId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, onUpdatePosition, onCommitPosition, scopes]);

  useEffect(() => {
    if (!draggingId) return;

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!svgRef.current) return;
      const touch = e.touches[0];
      const { x } = getMousePositionInSvg(touch.clientX, touch.clientY, svgRef.current);
      const position = dragPosition(dragStartPos.current ?? 0, dragStartX.current, x);
      onUpdatePosition(draggingId, position);
    };

    const handleTouchEnd = () => {
      if (onCommitPosition && dragStartPos.current !== null) {
        const scope = scopes.find((s) => s.id === draggingId);
        if (scope) onCommitPosition(draggingId!, dragStartPos.current, scope.position);
      }
      dragStartPos.current = null;
      setDraggingId(null);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [draggingId, onUpdatePosition, onCommitPosition, scopes]);

  // Keyboard nudge for selected scope
  useEffect(() => {
    if (!selectedId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      let delta = 0;
      if (e.key === 'ArrowLeft' || e.key === 'h') delta = -NUDGE_STEP;
      else if (e.key === 'ArrowRight' || e.key === 'l') delta = NUDGE_STEP;
      else if (e.key === 'Escape') { setSelectedId(null); return; }
      else return;

      e.preventDefault();
      const scope = scopes.find((s) => s.id === selectedId);
      if (scope) {
        const newPos = Math.max(0, Math.min(1, scope.position + delta));
        onUpdatePosition(selectedId, newPos);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, scopes, onUpdatePosition]);

  // Deselect when clicking outside the SVG
  useEffect(() => {
    if (!selectedId) return;

    const handleClick = (e: MouseEvent) => {
      if (svgRef.current && !svgRef.current.contains(e.target as Node)) {
        setSelectedId(null);
      }
    };

    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [selectedId]);

  const midX = PADDING + CHART_WIDTH / 2;
  const baselineY = SVG_HEIGHT - PADDING;

  const layout = useMemo(
    () => layoutLabels(scopes.map((s) => ({ id: s.id, name: s.name, position: s.position }))),
    [scopes],
  );
  const placementById = new Map(layout.placements.map((p) => [p.id, p]));
  // The chart reserves a fixed headroom so it keeps one size while scopes move.
  // Only a crest stack too tall to tighten grows it, and then it never shrinks
  // mid-drag, so the hill does not jump under the pointer.
  const neededTop = Math.max(LABEL_HEADROOM, layout.extraTop);
  const extraTop = draggingId ? Math.max(heldExtraTop.current, neededTop) : neededTop;
  heldExtraTop.current = draggingId ? extraTop : 0;

  // The scope being dragged, hovered or selected stays bright; the rest dim.
  const focusId = draggingId ?? hoveredId ?? selectedId;
  const fade = (id: string, full = 1) => ({
    opacity: focusId && focusId !== id ? full * 0.22 : full,
    transition: 'opacity 120ms',
  });

  return (
    <div className="bg-bg-default border border-border-muted rounded-lg p-4">
      <svg
        ref={svgRef}
        viewBox={`0 ${-extraTop} ${SVG_WIDTH} ${SVG_HEIGHT + extraTop}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-auto"
      >
        {originPositions && (
          <defs>
            {scopes.map((scope) => (
              <marker key={scope.id} id={`goal-arrow-${scope.id}`} markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={scope.color} />
              </marker>
            ))}
          </defs>
        )}

        {/* Baseline */}
        <line
          x1={PADDING}
          y1={baselineY}
          x2={PADDING + CHART_WIDTH}
          y2={baselineY}
          stroke="var(--border-muted)"
          strokeWidth={1}
        />

        {/* Midline */}
        <line
          x1={midX}
          y1={PADDING - 10}
          x2={midX}
          y2={baselineY}
          stroke="var(--border-muted)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Hill curve */}
        <path
          d={hillPath}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={2}
        />

        {/* Labels */}
        <text
          x={PADDING + CHART_WIDTH * 0.25}
          y={baselineY + 25}
          textAnchor="middle"
          fill="var(--fg-muted)"
          fontSize={12}
        >
          Figuring it out
        </text>
        <text
          x={PADDING + CHART_WIDTH * 0.75}
          y={baselineY + 25}
          textAnchor="middle"
          fill="var(--fg-muted)"
          fontSize={12}
        >
          Making it happen
        </text>

        {/* Origin ghosts and arrows (goal mode) */}
        {originPositions && scopes.map((scope) => {
          const originPos = originPositions[scope.id];
          if (originPos == null || Math.abs(originPos - scope.position) < 0.005) return null;
          const origin = positionToPoint(originPos);
          const goal = positionToPoint(scope.position);
          // Shorten arrow so it ends at the edge of the goal dot
          const dx = goal.x - origin.x;
          const dy = goal.y - origin.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const pullback = DOT_RADIUS + 12; // dot radius + arrow marker length + gap
          const arrowX = dist > pullback ? goal.x - (dx / dist) * pullback : goal.x;
          const arrowY = dist > pullback ? goal.y - (dy / dist) * pullback : goal.y;
          return (
            <g key={`origin-${scope.id}`}>
              <line
                x1={origin.x} y1={origin.y}
                x2={arrowX} y2={arrowY}
                stroke={scope.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                markerEnd={`url(#goal-arrow-${scope.id})`}
                opacity={0.5}
              />
              <circle
                cx={origin.x} cy={origin.y}
                r={GHOST_RADIUS}
                fill="none"
                stroke={scope.color}
                strokeWidth={2}
                strokeDasharray="3 2"
                opacity={0.5}
              />
            </g>
          );
        })}

        {/* Leader lines from each label to its dot */}
        {scopes.map((scope) => {
          const placement = placementById.get(scope.id);
          if (!placement) return null;
          return (
            <path
              key={`leader-${scope.id}`}
              d={leaderPath(placement)}
              fill="none"
              stroke={scope.color}
              strokeWidth={1}
              className="motion-reduce:transition-none"
              style={{ ...fade(scope.id, 0.7), pointerEvents: 'none' }}
            />
          );
        })}

        {/* Scope dots and labels */}
        {scopes.map((scope) => {
          const placement = placementById.get(scope.id);
          if (!placement) return null;
          const { dot } = placement;
          const isDragging = draggingId === scope.id;
          const cursor = isDragging ? 'grabbing' : 'grab';
          return (
            <g
              key={scope.id}
              className="motion-reduce:transition-none"
              style={fade(scope.id)}
              onMouseEnter={() => setHoveredId(scope.id)}
              onMouseLeave={() => setHoveredId((id) => (id === scope.id ? null : id))}
            >
              <circle
                cx={dot.x}
                cy={dot.y}
                r={DOT_RADIUS}
                fill={scope.color}
                stroke="var(--bg-default)"
                strokeWidth={2}
                style={{ cursor }}
                onMouseDown={(e) => handleMouseDown(scope.id, e.clientX)}
                onTouchStart={(e) => handleMouseDown(scope.id, e.touches[0].clientX)}
              />
              <text
                x={placement.edgeX}
                y={placement.labelY + 4}
                textAnchor={placement.anchor}
                fill="var(--fg-default)"
                fontSize={placement.small ? 11 : 12}
                style={{ cursor, userSelect: 'none' }}
                onMouseDown={(e) => handleMouseDown(scope.id, e.clientX)}
                onTouchStart={(e) => handleMouseDown(scope.id, e.touches[0].clientX)}
              >
                {focusId === scope.id ? scope.name : placement.text}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
