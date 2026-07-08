'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Hill, OOOSettings, Metric } from '@/types';
import { positionToPoint, generateHillPath } from '@/components/HillChart/hillMath';
import { useAllPresence, PresenceUser } from '@/lib/usePresence';
import { AnimalAvatar } from '@/lib/animalAvatars';
import OOOTimeline from '@/components/OOOTimeline/OOOTimeline';
import OnCallTimeline from '@/components/OnCallTimeline/OnCallTimeline';
import MetricsBar from '@/components/MetricsBar/MetricsBar';
import HillPotOfGold from '@/components/HillPotOfGold/HillPotOfGold';
import ArchivedHills from '@/components/ArchivedHills/ArchivedHills';

const miniPath = generateHillPath();

interface HillGridProps {
  hills: Hill[];
  onAddHill: (title: string) => string;
  onDeleteHill: (id: string) => void;
  onDuplicateHill: (id: string) => string;
  onToggleHillCompleted: (id: string) => void;
  onToggleHillArchived: (id: string) => void;
  onReorderHills: (fromIndex: number, toIndex: number) => void;
  oooSettings: OOOSettings;
  onUpdateOOOSettings: (updates: Partial<OOOSettings>) => void;
  metrics: Metric[];
  onUpdateMetric: (id: string, updates: Partial<Pick<Metric, 'type' | 'value' | 'sinceDate' | 'name'>>) => void;
}

function MiniHillChart({ hill, mode }: { hill: Hill; mode: 'current' | 'goal' }) {
  const visible = hill.scopes.filter((s) => !s.hidden && !s.completed);
  return (
    <svg viewBox="0 0 800 300" className="w-full h-auto mt-3 block" preserveAspectRatio="xMidYMid meet">
      {mode === 'goal' && (
        <defs>
          {visible.map((scope) => (
            <marker key={scope.id} id={`mini-arrow-${scope.id}`} markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={scope.color} />
            </marker>
          ))}
        </defs>
      )}
      <path d={miniPath} fill="none" stroke="var(--border-default)" strokeWidth={2} />
      {mode === 'goal' && visible.map((scope) => {
        const goalPos = scope.goalPosition ?? scope.position;
        if (Math.abs(scope.position - goalPos) < 0.005) return null;
        const current = positionToPoint(scope.position);
        const goal = positionToPoint(goalPos);
        const dx = goal.x - current.x;
        const dy = goal.y - current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pullback = 22;
        const ax = dist > pullback ? goal.x - (dx / dist) * pullback : goal.x;
        const ay = dist > pullback ? goal.y - (dy / dist) * pullback : goal.y;
        return (
          <g key={`ghost-${scope.id}`}>
            <line x1={current.x} y1={current.y} x2={ax} y2={ay}
              stroke={scope.color} strokeWidth={1.5} strokeDasharray="4 3"
              markerEnd={`url(#mini-arrow-${scope.id})`} opacity={0.5} />
            <circle cx={current.x} cy={current.y} r={7}
              fill="none" stroke={scope.color} strokeWidth={2} strokeDasharray="3 2" opacity={0.5} />
          </g>
        );
      })}
      {visible
        .filter((scope) => {
          if (mode !== 'goal') return true;
          const goalPos = scope.goalPosition ?? scope.position;
          return Math.abs(scope.position - goalPos) >= 0.005;
        })
        .map((scope) => {
          const pos = mode === 'goal' ? (scope.goalPosition ?? scope.position) : scope.position;
          const { x, y } = positionToPoint(pos);
          return (
            <circle key={scope.id} cx={x} cy={y} r={10} fill={scope.color} stroke="var(--bg-default)" strokeWidth={2} />
          );
        })}
    </svg>
  );
}

type IndexMode = 'current' | 'goal';

export default function HillGrid({ hills, onAddHill, onDeleteHill, onDuplicateHill, onToggleHillCompleted, onToggleHillArchived, onReorderHills, oooSettings, onUpdateOOOSettings, metrics, onUpdateMetric }: HillGridProps) {
  const router = useRouter();
  const presenceMap = useAllPresence();
  const [mode, setMode] = useState<IndexMode>('current');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Hill | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleSubmit = () => {
    const trimmed = newTitle.trim();
    if (trimmed) {
      const id = onAddHill(trimmed);
      setNewTitle('');
      setIsAdding(false);
      router.push(`/hill/${id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    else if (e.key === 'Escape') { setNewTitle(''); setIsAdding(false); }
  };

  const activeHills = hills.filter((h) => !h.completed && !h.archived);
  const completedHills = hills
    .filter((h) => h.completed)
    .slice()
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const archivedHills = hills
    .filter((h) => h.archived && !h.completed)
    .slice()
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDragEnter = (index: number) => setOverIndex(index);
  const handleDrop = (index: number) => {
    // dragIndex/index are positions within activeHills; translate to the full array.
    if (dragIndex !== null && dragIndex !== index) {
      const fromId = activeHills[dragIndex]?.id;
      const toId = activeHills[index]?.id;
      const fullFrom = hills.findIndex((h) => h.id === fromId);
      const fullTo = hills.findIndex((h) => h.id === toId);
      if (fullFrom !== -1 && fullTo !== -1) onReorderHills(fullFrom, fullTo);
    }
    setDragIndex(null);
    setOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setOverIndex(null); };

  return (
    <div className="max-w-[960px] mx-auto py-12 px-6">
      <MetricsBar metrics={metrics} onUpdateMetric={onUpdateMetric} />
      <OOOTimeline settings={oooSettings} onUpdateSettings={onUpdateOOOSettings} />
      <OnCallTimeline />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[32px] font-semibold text-fg-default">Hills</h1>
        <div className="flex bg-bg-muted rounded-md p-0.5 border border-border-muted">
          <button
            className={`px-3 py-1 text-xs font-medium rounded-sm border-none cursor-pointer transition-colors ${mode === 'current' ? 'bg-bg-default text-fg-default shadow-sm' : 'bg-transparent text-fg-muted hover:text-fg-default'}`}
            onClick={() => setMode('current')}
          >
            Current
          </button>
          <button
            className={`px-3 py-1 text-xs font-medium rounded-sm border-none cursor-pointer transition-colors ${mode === 'goal' ? 'bg-bg-default text-fg-accent shadow-sm' : 'bg-transparent text-fg-muted hover:text-fg-default'}`}
            onClick={() => setMode('goal')}
          >
            Goal
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 max-sm:grid-cols-1 auto-rows-fr gap-4">
        {activeHills.map((hill, index) => (
          <div
            key={hill.id}
            className={`p-5 bg-bg-default border border-border-muted rounded-md cursor-pointer transition-[border-color,box-shadow,opacity] duration-150 hover:border-fg-accent hover:shadow-[0_1px_3px_var(--bg-accent-subtle)] ${dragIndex === index ? 'opacity-40' : ''} ${overIndex === index && dragIndex !== index ? 'border-fg-accent border-dashed' : ''}`}
            onClick={() => router.push(`/hill/${hill.id}`)}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={handleDragOver}
            onDragEnter={() => handleDragEnter(index)}
            onDrop={() => handleDrop(index)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-fg-default m-0">{hill.title || 'Untitled hill'}</h2>
              <div className="relative shrink-0" ref={menuOpen === hill.id ? menuRef : undefined}>
                <button
                  className="flex items-center justify-center bg-none border-none text-fg-muted cursor-pointer p-1 rounded-sm hover:text-fg-default hover:bg-bg-muted"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === hill.id ? null : hill.id); }}
                  aria-label="Hill options"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
                {menuOpen === hill.id && (
                  <div className="absolute top-7 right-0 bg-bg-default border border-border-muted rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.12)] z-20 min-w-[180px] overflow-hidden whitespace-nowrap">
                    <button
                      className="flex items-center gap-2 w-full py-2 px-3 bg-none border-none text-[13px] text-fg-default cursor-pointer text-left hover:bg-bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleHillCompleted(hill.id);
                        setMenuOpen(null);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden>
                        <path d="M5 10h14v2a5 5 0 01-5 5h-4a5 5 0 01-5-5v-2z" fill="#d4a72c" />
                        <path d="M4 9h16a1 1 0 011 1v1H3v-1a1 1 0 011-1z" fill="#9a6700" />
                        <path d="M9 5a3 3 0 016 0v4h-2V5a1 1 0 10-2 0v4H9V5z" fill="#d4a72c" />
                      </svg>
                      Move to pot of gold
                    </button>
                    <button
                      className="flex items-center gap-2 w-full py-2 px-3 bg-none border-none text-[13px] text-fg-default cursor-pointer text-left hover:bg-bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleHillArchived(hill.id);
                        setMenuOpen(null);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0" aria-hidden>
                        <path d="M1.75 2.5a.75.75 0 00-.75.75v1.5c0 .414.336.75.75.75h12.5a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75H1.75zM2.5 6.5v6.25c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25V6.5H2.5zm4 1.5h3a.75.75 0 010 1.5h-3a.75.75 0 010-1.5z" />
                      </svg>
                      Archive
                    </button>
                    <button
                      className="flex items-center gap-2 w-full py-2 px-3 bg-none border-none text-[13px] text-fg-default cursor-pointer text-left hover:bg-bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateHill(hill.id);
                        setMenuOpen(null);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0" aria-hidden>
                        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25z" />
                        <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z" />
                      </svg>
                      Duplicate
                    </button>
                    <button
                      className="flex items-center gap-2 w-full py-2 px-3 bg-none border-none text-[13px] text-fg-danger cursor-pointer text-left hover:bg-bg-danger-subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(null);
                        setDeleteTarget(hill);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0" aria-hidden>
                        <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75V3h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25zM4.997 6.178a.75.75 0 10-1.493.144l.684 7.088A2.25 2.25 0 006.43 15.5h3.14a2.25 2.25 0 002.242-2.09l.684-7.088a.75.75 0 10-1.493-.144l-.684 7.088a.75.75 0 01-.748.734H6.43a.75.75 0 01-.748-.734l-.684-7.088z" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
            <MiniHillChart hill={hill} mode={mode} />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-fg-muted">
                {hill.scopes.length} {hill.scopes.length === 1 ? 'scope' : 'scopes'}
              </span>
              {presenceMap[hill.id] && presenceMap[hill.id].length > 0 && (
                <div className="flex gap-0.5">
                  {presenceMap[hill.id].map((user) => (
                    <div
                      key={user.id}
                      className="w-6 h-6 rounded-full overflow-hidden bg-bg-muted border border-border-muted"
                      style={{ color: user.color }}
                      title={user.name}
                    >
                      <AnimalAvatar animal={user.animal} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isAdding ? (
          <div className="p-5 bg-bg-default border-2 border-fg-accent rounded-md flex flex-col gap-3 justify-center items-center min-h-[180px]">
            <input
              type="text"
              className="py-2 px-3 border border-border-muted rounded-md text-sm outline-none w-full max-w-[300px] text-fg-default focus:border-fg-accent focus:shadow-[0_0_0_3px_var(--bg-accent-subtle)]"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Hill title..."
              autoFocus
            />
            <div className="flex gap-2 justify-center w-full max-w-[300px]">
              <button className="py-2 px-4 bg-bg-success-emphasis text-fg-on-emphasis border-none rounded-md text-sm font-medium cursor-pointer hover:opacity-90" onClick={handleSubmit}>
                Create
              </button>
              <button
                className="py-2 px-3 bg-none border border-border-muted rounded-md text-sm text-fg-muted cursor-pointer hover:bg-bg-muted"
                onClick={() => { setNewTitle(''); setIsAdding(false); }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="flex flex-col items-center justify-center gap-2 p-5 bg-bg-default border-2 border-dashed border-border-default rounded-md cursor-pointer text-fg-muted text-sm min-h-[180px] transition-[border-color,color] duration-150 hover:border-fg-accent hover:text-fg-accent" onClick={() => setIsAdding(true)}>
            <span className="text-[28px] font-light leading-none">+</span>
            <span>New hill</span>
          </button>
        )}
      </div>

      <HillPotOfGold
        hills={completedHills}
        onToggleCompleted={onToggleHillCompleted}
        onOpen={(hillId) => router.push(`/hill/${hillId}`)}
      />

      <ArchivedHills
        hills={archivedHills}
        onToggleArchived={onToggleHillArchived}
        onOpen={(hillId) => router.push(`/hill/${hillId}`)}
      />

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-100" onClick={() => setDeleteTarget(null)}>
          <div className="bg-bg-default border border-border-muted rounded-lg p-6 w-[360px] shadow-[0_8px_24px_rgba(0,0,0,0.15)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-fg-default mb-5 leading-relaxed">
              Delete <strong>{deleteTarget.title || 'Untitled hill'}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="py-2 px-3 bg-none border border-border-muted rounded-md text-sm text-fg-muted cursor-pointer hover:bg-bg-muted"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="py-2 px-4 bg-fg-danger text-fg-on-emphasis border-none rounded-md text-sm font-medium cursor-pointer hover:opacity-90"
                onClick={() => {
                  onDeleteHill(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
