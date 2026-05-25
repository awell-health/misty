'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useMemo } from 'react';
import { useHills } from '@/context/HillsContext';
import { usePresence } from '@/lib/usePresence';
import HillDescription from '@/components/HillDescription/HillDescription';
import ScopePanel from '@/components/ScopePanel/ScopePanel';
import HillChart from '@/components/HillChart/HillChart';
import HillTimeline from '@/components/HillTimeline/HillTimeline';
import PotOfGold from '@/components/PotOfGold/PotOfGold';

type HillMode = 'current' | 'goal';

export default function HillPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<HillMode>('current');
  const {
    getHill,
    updateHill,
    addScope,
    deleteScope,
    updateScopePosition,
    commitScopePosition,
    updateScopeGoalPosition,
    commitScopeGoalPosition,
    syncGoalsFromCurrent,
    updateScopeName,
    updateScopeDescription,
    updateScopeColor,
    toggleScopeHidden,
    toggleScopeCompleted,
    reorderScopes,
    addTimelineProject,
    deleteTimelineProject,
    updateTimelineProjectName,
    updateTimelineProjectColor,
    updateTimelineProjectDate,
    commitTimelineProjectDate,
    toggleTimelineMode,
  } = useHills();

  const hill = getHill(id);
  const presenceUsers = usePresence(id);

  const handleTitleChange = useCallback(
    (title: string) => updateHill(id, { title }),
    [id, updateHill]
  );

  const handleDescriptionChange = useCallback(
    (description: string) => updateHill(id, { description }),
    [id, updateHill]
  );

  const handleAddScope = useCallback(
    (name: string) => addScope(id, name),
    [id, addScope]
  );

  const handleDeleteScope = useCallback(
    (scopeId: string) => deleteScope(id, scopeId),
    [id, deleteScope]
  );

  const handleUpdatePosition = useCallback(
    (scopeId: string, position: number) => {
      if (mode === 'goal') {
        updateScopeGoalPosition(id, scopeId, position);
      } else {
        updateScopePosition(id, scopeId, position);
      }
    },
    [id, mode, updateScopePosition, updateScopeGoalPosition]
  );

  const handleCommitPosition = useCallback(
    (scopeId: string, oldPos: number, newPos: number) => {
      if (mode === 'goal') {
        commitScopeGoalPosition(id, scopeId, oldPos, newPos);
      } else {
        commitScopePosition(id, scopeId, oldPos, newPos);
      }
    },
    [id, mode, commitScopePosition, commitScopeGoalPosition]
  );

  const handleUpdateScopeName = useCallback(
    (scopeId: string, name: string) => updateScopeName(id, scopeId, name),
    [id, updateScopeName]
  );

  const handleUpdateScopeDescription = useCallback(
    (scopeId: string, description: string) => updateScopeDescription(id, scopeId, description),
    [id, updateScopeDescription]
  );

  const handleUpdateScopeColor = useCallback(
    (scopeId: string, color: string) => updateScopeColor(id, scopeId, color),
    [id, updateScopeColor]
  );

  const handleToggleHidden = useCallback(
    (scopeId: string) => toggleScopeHidden(id, scopeId),
    [id, toggleScopeHidden]
  );

  const handleToggleCompleted = useCallback(
    (scopeId: string) => toggleScopeCompleted(id, scopeId),
    [id, toggleScopeCompleted]
  );

  const activeScopes = useMemo(
    () => (hill ? hill.scopes.filter((s) => !s.completed) : []),
    [hill]
  );
  const completedScopes = useMemo(
    () => (hill
      ? hill.scopes
          .filter((s) => s.completed)
          .slice()
          .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      : []),
    [hill]
  );

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!hill) return;
      const fromId = activeScopes[fromIndex]?.id;
      const toId = activeScopes[toIndex]?.id;
      if (!fromId || !toId) return;
      const fullFrom = hill.scopes.findIndex((s) => s.id === fromId);
      const fullTo = hill.scopes.findIndex((s) => s.id === toId);
      if (fullFrom === -1 || fullTo === -1) return;
      reorderScopes(id, fullFrom, fullTo);
    },
    [id, hill, activeScopes, reorderScopes]
  );

  const handleSyncGoals = useCallback(
    () => syncGoalsFromCurrent(id),
    [id, syncGoalsFromCurrent]
  );

  const handleAddTimelineProject = useCallback(
    () => addTimelineProject(id),
    [id, addTimelineProject]
  );

  const handleDeleteTimelineProject = useCallback(
    (projectId: string) => deleteTimelineProject(id, projectId),
    [id, deleteTimelineProject]
  );

  const handleUpdateTimelineProjectName = useCallback(
    (projectId: string, name: string) => updateTimelineProjectName(id, projectId, name),
    [id, updateTimelineProjectName]
  );

  const handleUpdateTimelineProjectColor = useCallback(
    (projectId: string, color: string) => updateTimelineProjectColor(id, projectId, color),
    [id, updateTimelineProjectColor]
  );

  const handleUpdateTimelineProjectDate = useCallback(
    (projectId: string, date: number) => updateTimelineProjectDate(id, projectId, date),
    [id, updateTimelineProjectDate]
  );

  const handleCommitTimelineProjectDate = useCallback(
    (projectId: string, oldDate: number, newDate: number) => commitTimelineProjectDate(id, projectId, oldDate, newDate),
    [id, commitTimelineProjectDate]
  );

  const handleToggleTimelineMode = useCallback(
    () => toggleTimelineMode(id),
    [id, toggleTimelineMode]
  );

  // In goal mode, show goalPosition (falling back to position if no goal set)
  const chartScopes = useMemo(() => {
    if (!hill) return [];
    const visible = hill.scopes.filter((s) => !s.hidden && !s.completed);
    if (mode === 'current') return visible;
    return visible.map((s) => ({
      ...s,
      position: s.goalPosition ?? s.position,
    }));
  }, [hill, mode]);

  // Map of scope id → current position, for showing ghost dots in goal mode
  const originPositions = useMemo(() => {
    if (!hill || mode !== 'goal') return undefined;
    const map: Record<string, number> = {};
    hill.scopes.filter((s) => !s.hidden && !s.completed).forEach((s) => {
      map[s.id] = s.position;
    });
    return map;
  }, [hill, mode]);

  if (!hill) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <p>Hill not found.</p>
        <button onClick={() => router.push('/')} style={{ marginTop: 16, cursor: 'pointer' }}>
          Back to hills
        </button>
      </div>
    );
  }

  return (
    <div className="layout">
      <div className="leftPanel">
        <button
          onClick={() => router.push('/')}
          className="bg-none border-none text-fg-muted cursor-pointer text-xs mb-4 p-0 hover:text-fg-default"
        >
          &larr; All hills
        </button>
        <HillDescription
          title={hill.title}
          onTitleChange={handleTitleChange}
          description={hill.description}
          onDescriptionChange={handleDescriptionChange}
          presenceUsers={presenceUsers}
        />
        <ScopePanel
          scopes={activeScopes}
          onAddScope={handleAddScope}
          onDeleteScope={handleDeleteScope}
          onReorder={handleReorder}
          onUpdateName={handleUpdateScopeName}
          onUpdateDescription={handleUpdateScopeDescription}
          onUpdateColor={handleUpdateScopeColor}
          onToggleHidden={handleToggleHidden}
          onToggleCompleted={handleToggleCompleted}
        />
      </div>
      <div className="rightPanel">
        <HillTimeline
          projects={hill.timelineProjects ?? []}
          mode={hill.timelineMode ?? 'fixed-timeline'}
          onAddProject={handleAddTimelineProject}
          onDeleteProject={handleDeleteTimelineProject}
          onUpdateProjectName={handleUpdateTimelineProjectName}
          onUpdateProjectColor={handleUpdateTimelineProjectColor}
          onUpdateProjectDate={handleUpdateTimelineProjectDate}
          onCommitProjectDate={handleCommitTimelineProjectDate}
          onToggleMode={handleToggleTimelineMode}
        />
        <div className="relative">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
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
            {mode === 'goal' && (
              <button
                className="px-2 py-1 text-xs text-fg-muted border border-border-muted rounded-md bg-bg-default cursor-pointer hover:text-fg-default hover:border-fg-accent"
                onClick={handleSyncGoals}
                title="Copy current positions into goal positions"
              >
                Sync from current
              </button>
            )}
          </div>
          <HillChart
            scopes={chartScopes}
            onUpdatePosition={handleUpdatePosition}
            onCommitPosition={handleCommitPosition}
            originPositions={originPositions}
          />
        </div>
        <PotOfGold scopes={completedScopes} onToggleCompleted={handleToggleCompleted} />
      </div>
    </div>
  );
}
