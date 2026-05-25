'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { ref, onValue, set, update, remove, get } from 'firebase/database';
import { getFirebaseDb, getDbPrefix } from '@/lib/firebase';
import { Hill, Scope, TimelineProject, TimelineMode, SCOPE_COLORS } from '@/types';

type UndoAction = { undo: () => void; redo: () => void };

interface HillsContextValue {
  hills: Hill[];
  loading: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  addHill: (title: string) => string;
  duplicateHill: (id: string) => string;
  deleteHill: (id: string) => void;
  reorderHills: (fromIndex: number, toIndex: number) => void;
  getHill: (id: string) => Hill | undefined;
  updateHill: (id: string, updates: Partial<Pick<Hill, 'title' | 'description'>>) => void;
  addScope: (hillId: string, name: string) => void;
  deleteScope: (hillId: string, scopeId: string) => void;
  updateScopePosition: (hillId: string, scopeId: string, position: number) => void;
  commitScopePosition: (hillId: string, scopeId: string, oldPosition: number, newPosition: number) => void;
  updateScopeName: (hillId: string, scopeId: string, name: string) => void;
  updateScopeDescription: (hillId: string, scopeId: string, description: string) => void;
  updateScopeColor: (hillId: string, scopeId: string, color: string) => void;
  toggleScopeHidden: (hillId: string, scopeId: string) => void;
  toggleScopeCompleted: (hillId: string, scopeId: string) => void;
  updateScopeGoalPosition: (hillId: string, scopeId: string, goalPosition: number) => void;
  commitScopeGoalPosition: (hillId: string, scopeId: string, oldPosition: number, newPosition: number) => void;
  syncGoalsFromCurrent: (hillId: string) => void;
  reorderScopes: (hillId: string, fromIndex: number, toIndex: number) => void;
  addTimelineProject: (hillId: string) => string;
  deleteTimelineProject: (hillId: string, projectId: string) => void;
  updateTimelineProjectName: (hillId: string, projectId: string, name: string) => void;
  updateTimelineProjectColor: (hillId: string, projectId: string, color: string) => void;
  updateTimelineProjectDate: (hillId: string, projectId: string, date: number) => void;
  commitTimelineProjectDate: (hillId: string, projectId: string, oldDate: number, newDate: number) => void;
  toggleTimelineMode: (hillId: string) => void;
}

const HillsContext = createContext<HillsContextValue | null>(null);

function snapshotToHills(data: Record<string, any> | null): Hill[] {
  if (!data) return [];
  return Object.entries(data).map(([id, val]) => {
    const scopesMap = val.scopes || {};
    const scopes: Scope[] = Object.entries(scopesMap)
      .map(([scopeId, s]: [string, any]) => ({
        id: scopeId,
        name: s.name || '',
        description: s.description || '',
        position: s.position ?? 0,
        color: s.color || SCOPE_COLORS[0],
        order: s.order ?? 0,
        hidden: s.hidden ?? false,
        goalPosition: s.goalPosition ?? undefined,
        completed: s.completed ?? false,
        completedAt: s.completedAt ?? undefined,
      }))
      .sort((a, b) => a.order - b.order);
    const timelineProjectsMap = val.timelineProjects || {};
    const nowMs = Date.now();
    const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
    const timelineProjects: TimelineProject[] = Object.entries(timelineProjectsMap)
      .map(([pid, p]: [string, any]) => ({
        id: pid,
        name: p.name || '',
        color: p.color || SCOPE_COLORS[0],
        // Migrate old timePosition (0-1 ratio) to absolute epoch ms if date not yet stored
        date: p.date ?? Math.round(nowMs + (p.timePosition ?? 0.5) * threeMonthsMs),
        order: p.order ?? 0,
      }))
      .sort((a, b) => a.order - b.order);
    return {
      id,
      title: val.title || '',
      description: val.description || '',
      scopes,
      order: val.order ?? 0,
      timelineProjects,
      timelineMode: val.timelineMode ?? 'fixed-timeline',
    };
  }).sort((a, b) => a.order - b.order);
}

function dbPath(path: string): string {
  const prefix = getDbPrefix();
  return prefix ? `${prefix}/${path}` : path;
}

const MAX_UNDO = 50;

export function HillsProvider({ children }: { children: ReactNode }) {
  const [hills, setHills] = useState<Hill[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const isUndoRedoing = useRef(false);

  const pushUndo = useCallback((action: UndoAction) => {
    if (isUndoRedoing.current) return;
    setUndoStack((prev) => [...prev.slice(-MAX_UNDO + 1), action]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const action = prev[prev.length - 1];
      isUndoRedoing.current = true;
      action.undo();
      isUndoRedoing.current = false;
      setRedoStack((r) => [...r, action]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const action = prev[prev.length - 1];
      isUndoRedoing.current = true;
      action.redo();
      isUndoRedoing.current = false;
      setUndoStack((u) => [...u, action]);
      return prev.slice(0, -1);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const db = getFirebaseDb();
    const hillsRef = ref(db, dbPath('hills'));
    const unsubscribe = onValue(hillsRef, (snapshot) => {
      const data = snapshot.val();
      setHills(snapshotToHills(data));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const addHill = useCallback((title: string) => {
    const id = crypto.randomUUID();
    const db = getFirebaseDb();
    const maxOrder = hills.reduce((max, h) => Math.max(max, h.order), -1);
    const hillData = { title, description: '', order: maxOrder + 1 };
    set(ref(db, dbPath(`hills/${id}`)), hillData);
    pushUndo({
      undo: () => remove(ref(getFirebaseDb(), dbPath(`hills/${id}`))),
      redo: () => set(ref(getFirebaseDb(), dbPath(`hills/${id}`)), hillData),
    });
    return id;
  }, [hills, pushUndo]);

  const duplicateHill = useCallback((id: string) => {
    const hill = hills.find((h) => h.id === id);
    if (!hill) return id;
    const newId = crypto.randomUUID();
    const db = getFirebaseDb();
    const maxOrder = hills.reduce((max, h) => Math.max(max, h.order), -1);
    const hillData: Record<string, any> = {
      title: `${hill.title} (copy)`,
      description: hill.description,
      order: maxOrder + 1,
    };
    if (hill.scopes.length > 0) {
      hillData.scopes = {};
      hill.scopes.forEach((s) => {
        const newScopeId = crypto.randomUUID();
        hillData.scopes[newScopeId] = {
          name: s.name,
          description: s.description,
          position: s.position,
          color: s.color,
          order: s.order,
        };
      });
    }
    set(ref(db, dbPath(`hills/${newId}`)), hillData);
    pushUndo({
      undo: () => remove(ref(getFirebaseDb(), dbPath(`hills/${newId}`))),
      redo: () => set(ref(getFirebaseDb(), dbPath(`hills/${newId}`)), hillData),
    });
    return newId;
  }, [hills, pushUndo]);

  const deleteHill = useCallback((id: string) => {
    const db = getFirebaseDb();
    const hillRef = ref(db, dbPath(`hills/${id}`));
    get(hillRef).then((snapshot) => {
      const data = snapshot.val();
      remove(hillRef);
      pushUndo({
        undo: () => set(ref(getFirebaseDb(), dbPath(`hills/${id}`)), data),
        redo: () => remove(ref(getFirebaseDb(), dbPath(`hills/${id}`))),
      });
    });
  }, [pushUndo]);

  const getHill = useCallback(
    (id: string) => hills.find((h) => h.id === id),
    [hills]
  );

  const updateHill = useCallback(
    (id: string, updates: Partial<Pick<Hill, 'title' | 'description'>>) => {
      const db = getFirebaseDb();
      const hillRef = ref(db, dbPath(`hills/${id}`));
      get(hillRef).then((snapshot) => {
        const prev = snapshot.val();
        const oldValues: Record<string, any> = {};
        for (const key of Object.keys(updates)) {
          oldValues[key] = prev?.[key] ?? '';
        }
        update(hillRef, updates);
        pushUndo({
          undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${id}`)), oldValues),
          redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${id}`)), updates),
        });
      });
    },
    [pushUndo]
  );

  const addScope = useCallback((hillId: string, name: string) => {
    const id = crypto.randomUUID();
    const db = getFirebaseDb();
    const hill = hills.find((h) => h.id === hillId);
    const maxOrder = hill?.scopes.reduce((max, s) => Math.max(max, s.order), -1) ?? -1;
    const scopeData = {
      name,
      description: '',
      position: 0,
      color: SCOPE_COLORS[(hill?.scopes.length ?? 0) % SCOPE_COLORS.length],
      order: maxOrder + 1,
    };
    set(ref(db, dbPath(`hills/${hillId}/scopes/${id}`)), scopeData);
    pushUndo({
      undo: () => remove(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${id}`))),
      redo: () => set(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${id}`)), scopeData),
    });
  }, [hills, pushUndo]);

  const deleteScope = useCallback((hillId: string, scopeId: string) => {
    const db = getFirebaseDb();
    const scopeRef = ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`));
    get(scopeRef).then((snapshot) => {
      const data = snapshot.val();
      remove(scopeRef);
      pushUndo({
        undo: () => set(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), data),
        redo: () => remove(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`))),
      });
    });
  }, [pushUndo]);

  // Live position updates during drag — no undo entry
  const updateScopePosition = useCallback(
    (hillId: string, scopeId: string, position: number) => {
      const db = getFirebaseDb();
      update(ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`)), { position });
    },
    []
  );

  // Called at end of drag with captured start position — creates one undo entry
  const commitScopePosition = useCallback(
    (hillId: string, scopeId: string, oldPosition: number, newPosition: number) => {
      if (Math.abs(oldPosition - newPosition) < 0.001) return;
      pushUndo({
        undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { position: oldPosition }),
        redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { position: newPosition }),
      });
    },
    [pushUndo]
  );

  const updateScopeName = useCallback(
    (hillId: string, scopeId: string, name: string) => {
      const db = getFirebaseDb();
      const scopeRef = ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`));
      get(scopeRef).then((snapshot) => {
        const oldName = snapshot.val()?.name ?? '';
        update(scopeRef, { name });
        pushUndo({
          undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { name: oldName }),
          redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { name }),
        });
      });
    },
    [pushUndo]
  );

  const descTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const descSnapshots = useRef<Record<string, string>>({});

  const updateScopeDescription = useCallback(
    (hillId: string, scopeId: string, description: string) => {
      const db = getFirebaseDb();
      const key = `${hillId}/${scopeId}`;
      // Capture old value on first keystroke of a batch
      if (!descSnapshots.current[key]) {
        const scope = hills.find((h) => h.id === hillId)?.scopes.find((s) => s.id === scopeId);
        descSnapshots.current[key] = scope?.description ?? '';
      }
      update(ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`)), { description });
      // Debounce: commit undo entry after 1s of inactivity
      clearTimeout(descTimers.current[key]);
      descTimers.current[key] = setTimeout(() => {
        const oldDesc = descSnapshots.current[key];
        delete descSnapshots.current[key];
        if (oldDesc === description) return;
        pushUndo({
          undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { description: oldDesc }),
          redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { description }),
        });
      }, 1000);
    },
    [hills, pushUndo]
  );

  const updateScopeColor = useCallback(
    (hillId: string, scopeId: string, color: string) => {
      const db = getFirebaseDb();
      const scopeRef = ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`));
      get(scopeRef).then((snapshot) => {
        const oldColor = snapshot.val()?.color ?? SCOPE_COLORS[0];
        update(scopeRef, { color });
        pushUndo({
          undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { color: oldColor }),
          redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { color }),
        });
      });
    },
    [pushUndo]
  );

  const toggleScopeHidden = useCallback(
    (hillId: string, scopeId: string) => {
      const scope = hills.find((h) => h.id === hillId)?.scopes.find((s) => s.id === scopeId);
      if (!scope) return;
      const newHidden = !scope.hidden;
      const db = getFirebaseDb();
      update(ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`)), { hidden: newHidden });
      pushUndo({
        undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { hidden: !newHidden }),
        redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { hidden: newHidden }),
      });
    },
    [hills, pushUndo]
  );

  const toggleScopeCompleted = useCallback(
    (hillId: string, scopeId: string) => {
      const scope = hills.find((h) => h.id === hillId)?.scopes.find((s) => s.id === scopeId);
      if (!scope) return;
      const newCompleted = !scope.completed;
      const oldCompletedAt = scope.completedAt ?? null;
      const newCompletedAt = newCompleted ? Date.now() : null;
      const db = getFirebaseDb();
      update(ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`)), {
        completed: newCompleted,
        completedAt: newCompletedAt,
      });
      pushUndo({
        undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), {
          completed: !newCompleted,
          completedAt: oldCompletedAt,
        }),
        redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), {
          completed: newCompleted,
          completedAt: newCompletedAt,
        }),
      });
    },
    [hills, pushUndo]
  );

  // Live goal position updates during drag — no undo entry
  const updateScopeGoalPosition = useCallback(
    (hillId: string, scopeId: string, goalPosition: number) => {
      const db = getFirebaseDb();
      update(ref(db, dbPath(`hills/${hillId}/scopes/${scopeId}`)), { goalPosition });
    },
    []
  );

  // Called at end of drag with captured start position — creates one undo entry
  const commitScopeGoalPosition = useCallback(
    (hillId: string, scopeId: string, oldPosition: number, newPosition: number) => {
      if (Math.abs(oldPosition - newPosition) < 0.001) return;
      pushUndo({
        undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { goalPosition: oldPosition }),
        redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), { goalPosition: newPosition }),
      });
    },
    [pushUndo]
  );

  const syncGoalsFromCurrent = useCallback(
    (hillId: string) => {
      const hill = hills.find((h) => h.id === hillId);
      if (!hill) return;
      const db = getFirebaseDb();
      const updates: Record<string, number> = {};
      const oldGoals: Record<string, number | null> = {};
      hill.scopes.forEach((s) => {
        oldGoals[s.id] = s.goalPosition ?? null;
        updates[dbPath(`hills/${hillId}/scopes/${s.id}/goalPosition`)] = s.position;
      });
      update(ref(db), updates);
      pushUndo({
        undo: () => {
          const undoUpdates: Record<string, any> = {};
          Object.entries(oldGoals).forEach(([scopeId, pos]) => {
            undoUpdates[dbPath(`hills/${hillId}/scopes/${scopeId}/goalPosition`)] = pos;
          });
          update(ref(getFirebaseDb()), undoUpdates);
        },
        redo: () => update(ref(getFirebaseDb()), updates),
      });
    },
    [hills, pushUndo]
  );

  const reorderScopes = useCallback(
    (hillId: string, fromIndex: number, toIndex: number) => {
      const hill = hills.find((h) => h.id === hillId);
      if (!hill) return;
      const scopes = [...hill.scopes];
      const [moved] = scopes.splice(fromIndex, 1);
      scopes.splice(toIndex, 0, moved);
      const db = getFirebaseDb();
      const newUpdates: Record<string, number> = {};
      scopes.forEach((s, i) => {
        newUpdates[dbPath(`hills/${hillId}/scopes/${s.id}/order`)] = i;
      });
      update(ref(db), newUpdates);

      // Reverse: put it back
      const oldScopes = [...hill.scopes];
      const oldUpdates: Record<string, number> = {};
      oldScopes.forEach((s, i) => {
        oldUpdates[dbPath(`hills/${hillId}/scopes/${s.id}/order`)] = i;
      });
      pushUndo({
        undo: () => update(ref(getFirebaseDb()), oldUpdates),
        redo: () => update(ref(getFirebaseDb()), newUpdates),
      });
    },
    [hills, pushUndo]
  );

  const reorderHills = useCallback(
    (fromIndex: number, toIndex: number) => {
      const sorted = [...hills];
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      const db = getFirebaseDb();
      const newUpdates: Record<string, number> = {};
      sorted.forEach((h, i) => {
        newUpdates[dbPath(`hills/${h.id}/order`)] = i;
      });
      update(ref(db), newUpdates);

      const oldUpdates: Record<string, number> = {};
      hills.forEach((h, i) => {
        oldUpdates[dbPath(`hills/${h.id}/order`)] = i;
      });
      pushUndo({
        undo: () => update(ref(getFirebaseDb()), oldUpdates),
        redo: () => update(ref(getFirebaseDb()), newUpdates),
      });
    },
    [hills, pushUndo]
  );

  const addTimelineProject = useCallback((hillId: string) => {
    const id = crypto.randomUUID();
    const db = getFirebaseDb();
    const hill = hills.find((h) => h.id === hillId);
    const existingProjects = hill?.timelineProjects ?? [];
    const maxOrder = existingProjects.reduce((max, p) => Math.max(max, p.order), -1);
    const projectData = {
      name: 'New goal',
      color: SCOPE_COLORS[existingProjects.length % SCOPE_COLORS.length],
      date: Math.round(Date.now() + 45 * 24 * 60 * 60 * 1000), // ~1.5 months from now
      order: maxOrder + 1,
    };
    set(ref(db, dbPath(`hills/${hillId}/timelineProjects/${id}`)), projectData);
    pushUndo({
      undo: () => remove(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${id}`))),
      redo: () => set(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${id}`)), projectData),
    });
    return id;
  }, [hills, pushUndo]);

  const deleteTimelineProject = useCallback((hillId: string, projectId: string) => {
    const db = getFirebaseDb();
    const projectRef = ref(db, dbPath(`hills/${hillId}/timelineProjects/${projectId}`));
    get(projectRef).then((snapshot) => {
      const data = snapshot.val();
      remove(projectRef);
      pushUndo({
        undo: () => set(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), data),
        redo: () => remove(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`))),
      });
    });
  }, [pushUndo]);

  const updateTimelineProjectName = useCallback((hillId: string, projectId: string, name: string) => {
    const db = getFirebaseDb();
    const projectRef = ref(db, dbPath(`hills/${hillId}/timelineProjects/${projectId}`));
    get(projectRef).then((snapshot) => {
      const oldName = snapshot.val()?.name ?? '';
      update(projectRef, { name });
      pushUndo({
        undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), { name: oldName }),
        redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), { name }),
      });
    });
  }, [pushUndo]);

  const updateTimelineProjectColor = useCallback((hillId: string, projectId: string, color: string) => {
    const db = getFirebaseDb();
    const projectRef = ref(db, dbPath(`hills/${hillId}/timelineProjects/${projectId}`));
    get(projectRef).then((snapshot) => {
      const oldColor = snapshot.val()?.color ?? SCOPE_COLORS[0];
      update(projectRef, { color });
      pushUndo({
        undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), { color: oldColor }),
        redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), { color }),
      });
    });
  }, [pushUndo]);

  const updateTimelineProjectDate = useCallback((hillId: string, projectId: string, date: number) => {
    const db = getFirebaseDb();
    update(ref(db, dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), { date });
  }, []);

  const commitTimelineProjectDate = useCallback((hillId: string, projectId: string, oldDate: number, newDate: number) => {
    if (oldDate === newDate) return;
    pushUndo({
      undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), { date: oldDate }),
      redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${projectId}`)), { date: newDate }),
    });
  }, [pushUndo]);

  const toggleTimelineMode = useCallback((hillId: string) => {
    const hill = hills.find((h) => h.id === hillId);
    if (!hill) return;
    const oldMode = hill.timelineMode ?? 'fixed-timeline';
    const newMode: TimelineMode = oldMode === 'fixed-timeline' ? 'fixed-scope' : 'fixed-timeline';
    const db = getFirebaseDb();
    update(ref(db, dbPath(`hills/${hillId}`)), { timelineMode: newMode });
    pushUndo({
      undo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}`)), { timelineMode: oldMode }),
      redo: () => update(ref(getFirebaseDb(), dbPath(`hills/${hillId}`)), { timelineMode: newMode }),
    });
  }, [hills, pushUndo]);

  return (
    <HillsContext.Provider
      value={{
        hills,
        loading,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undo,
        redo,
        addHill,
        duplicateHill,
        deleteHill,
        reorderHills,
        getHill,
        updateHill,
        addScope,
        deleteScope,
        updateScopePosition,
        commitScopePosition,
        updateScopeName,
        updateScopeDescription,
        updateScopeColor,
        toggleScopeHidden,
        toggleScopeCompleted,
        updateScopeGoalPosition,
        commitScopeGoalPosition,
        syncGoalsFromCurrent,
        reorderScopes,
        addTimelineProject,
        deleteTimelineProject,
        updateTimelineProjectName,
        updateTimelineProjectColor,
        updateTimelineProjectDate,
        commitTimelineProjectDate,
        toggleTimelineMode,
      }}
    >
      {children}
    </HillsContext.Provider>
  );
}

export function useHills() {
  const ctx = useContext(HillsContext);
  if (!ctx) throw new Error('useHills must be used within HillsProvider');
  return ctx;
}
