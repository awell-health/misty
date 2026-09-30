import { ref, get, set, update, remove } from 'firebase/database';
import { getFirebaseDb, getDbPrefix } from '@/lib/firebase';
import { Scope, TimelineProject, Hill, HillLinearConnection, SCOPE_COLORS } from '@/types';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function dbPath(path: string): string {
  const prefix = getDbPrefix();
  return prefix ? `${prefix}/${path}` : path;
}

// ---------------------------------------------------------------------------
// Serializers: RTDB stores scopes/goals as UUID-keyed maps with `order`
// fields. The API exposes plain, order-sorted arrays instead. These mirror
// snapshotToHills() in HillsContext.tsx.
// ---------------------------------------------------------------------------

function serializeScope(id: string, s: any): Scope {
  return {
    id,
    name: s.name || '',
    description: s.description || '',
    position: s.position ?? 0,
    color: s.color || SCOPE_COLORS[0],
    order: s.order ?? 0,
    hidden: s.hidden ?? false,
    goalPosition: s.goalPosition ?? undefined,
    completed: s.completed ?? false,
    completedAt: s.completedAt ?? undefined,
    linearLabelId: s.linearLabelId ?? undefined,
  };
}

function serializeScopes(map: Record<string, any> | null | undefined): Scope[] {
  if (!map) return [];
  return Object.entries(map)
    .map(([id, s]) => serializeScope(id, s))
    .sort((a, b) => a.order - b.order);
}

function serializeGoal(id: string, p: any): TimelineProject {
  const nowMs = Date.now();
  const threeMonthsMs = 90 * 24 * 60 * 60 * 1000;
  return {
    id,
    name: p.name || '',
    color: p.color || SCOPE_COLORS[0],
    // Migrate legacy timePosition (0-1 ratio) to absolute epoch ms.
    date: p.date ?? Math.round(nowMs + (p.timePosition ?? 0.5) * threeMonthsMs),
    order: p.order ?? 0,
  };
}

function serializeGoals(map: Record<string, any> | null | undefined): TimelineProject[] {
  if (!map) return [];
  return Object.entries(map)
    .map(([id, p]) => serializeGoal(id, p))
    .sort((a, b) => a.order - b.order);
}

// Full hill including nested scopes + goals, so a single fetch gives a session
// complete context. `goals` is the public name for `timelineProjects`.
export interface SerializedHill extends Omit<Hill, 'scopes' | 'timelineProjects'> {
  scopes: Scope[];
  goals: TimelineProject[];
}

function serializeHill(id: string, val: any): SerializedHill {
  return {
    id,
    title: val.title || '',
    description: val.description || '',
    order: val.order ?? 0,
    timelineMode: val.timelineMode ?? 'fixed-timeline',
    completed: val.completed ?? false,
    completedAt: val.completedAt ?? undefined,
    archived: val.archived ?? false,
    archivedAt: val.archivedAt ?? undefined,
    linear: val.linear ?? undefined,
    scopes: serializeScopes(val.scopes),
    goals: serializeGoals(val.timelineProjects),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listHills(): Promise<SerializedHill[]> {
  const snap = await get(ref(getFirebaseDb(), dbPath('hills')));
  const data = snap.val() as Record<string, any> | null;
  if (!data) return [];
  return Object.entries(data)
    .map(([id, val]) => serializeHill(id, val))
    .sort((a, b) => a.order - b.order);
}

export async function getHill(hillId: string): Promise<SerializedHill | null> {
  const snap = await get(ref(getFirebaseDb(), dbPath(`hills/${hillId}`)));
  const val = snap.val();
  return val ? serializeHill(hillId, val) : null;
}

async function hillExists(hillId: string): Promise<boolean> {
  const snap = await get(ref(getFirebaseDb(), dbPath(`hills/${hillId}`)));
  return snap.exists();
}

export async function listScopes(hillId: string): Promise<Scope[] | null> {
  if (!(await hillExists(hillId))) return null;
  const snap = await get(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes`)));
  return serializeScopes(snap.val());
}

export async function listGoals(hillId: string): Promise<TimelineProject[] | null> {
  if (!(await hillExists(hillId))) return null;
  const snap = await get(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects`)));
  return serializeGoals(snap.val());
}

// ---------------------------------------------------------------------------
// Scope writes
// ---------------------------------------------------------------------------

export interface CreateScopeInput {
  name: string;
  description?: string;
  position?: number;
  color?: string;
  goalPosition?: number;
  hidden?: boolean;
  linearLabelId?: string;
}

// Fields a client may PATCH. `completedAt` is derived from `completed`.
export interface UpdateScopeInput {
  name?: string;
  description?: string;
  position?: number;
  color?: string;
  order?: number;
  hidden?: boolean;
  goalPosition?: number | null;
  completed?: boolean;
}

export async function createScope(
  hillId: string,
  input: CreateScopeInput
): Promise<Scope | null> {
  const existing = await listScopes(hillId);
  if (existing === null) return null; // hill not found

  const id = crypto.randomUUID();
  const maxOrder = existing.reduce((m, s) => Math.max(m, s.order), -1);
  const data: Record<string, any> = {
    name: input.name,
    description: input.description ?? '',
    position: clamp01(input.position ?? 0),
    color: input.color ?? SCOPE_COLORS[existing.length % SCOPE_COLORS.length],
    order: maxOrder + 1,
  };
  if (input.goalPosition !== undefined) data.goalPosition = clamp01(input.goalPosition);
  if (input.hidden !== undefined) data.hidden = input.hidden;
  if (input.linearLabelId !== undefined) data.linearLabelId = input.linearLabelId;

  await set(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${id}`)), data);
  return serializeScope(id, data);
}

export async function updateScope(
  hillId: string,
  scopeId: string,
  input: UpdateScopeInput
): Promise<Scope | null> {
  const scopeRef = ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`));
  const snap = await get(scopeRef);
  if (!snap.exists()) return null;

  const updates: Record<string, any> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.position !== undefined) updates.position = clamp01(input.position);
  if (input.color !== undefined) updates.color = input.color;
  if (input.order !== undefined) updates.order = input.order;
  if (input.hidden !== undefined) updates.hidden = input.hidden;
  // Firebase rejects `undefined`; null clears the field.
  if (input.goalPosition !== undefined) {
    updates.goalPosition = input.goalPosition === null ? null : clamp01(input.goalPosition);
  }
  if (input.completed !== undefined) {
    updates.completed = input.completed;
    updates.completedAt = input.completed ? Date.now() : null;
  }

  await update(scopeRef, updates);
  const after = await get(scopeRef);
  return serializeScope(scopeId, after.val());
}

export async function deleteScope(hillId: string, scopeId: string): Promise<boolean> {
  const scopeRef = ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`));
  const snap = await get(scopeRef);
  if (!snap.exists()) return false;
  await remove(scopeRef);
  return true;
}

// ---------------------------------------------------------------------------
// Goal (timelineProject) writes
// ---------------------------------------------------------------------------

export interface CreateGoalInput {
  name?: string;
  color?: string;
  date?: number; // epoch ms
}

export interface UpdateGoalInput {
  name?: string;
  color?: string;
  date?: number;
  order?: number;
}

export async function createGoal(
  hillId: string,
  input: CreateGoalInput
): Promise<TimelineProject | null> {
  const existing = await listGoals(hillId);
  if (existing === null) return null; // hill not found

  const id = crypto.randomUUID();
  const maxOrder = existing.reduce((m, g) => Math.max(m, g.order), -1);
  const data = {
    name: input.name ?? 'New goal',
    color: input.color ?? SCOPE_COLORS[existing.length % SCOPE_COLORS.length],
    date: input.date ?? Math.round(Date.now() + 45 * 24 * 60 * 60 * 1000),
    order: maxOrder + 1,
  };

  await set(ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${id}`)), data);
  return serializeGoal(id, data);
}

export async function updateGoal(
  hillId: string,
  goalId: string,
  input: UpdateGoalInput
): Promise<TimelineProject | null> {
  const goalRef = ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${goalId}`));
  const snap = await get(goalRef);
  if (!snap.exists()) return null;

  const updates: Record<string, any> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.color !== undefined) updates.color = input.color;
  if (input.date !== undefined) updates.date = input.date;
  if (input.order !== undefined) updates.order = input.order;

  await update(goalRef, updates);
  const after = await get(goalRef);
  return serializeGoal(goalId, after.val());
}

export async function deleteGoal(hillId: string, goalId: string): Promise<boolean> {
  const goalRef = ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${goalId}`));
  const snap = await get(goalRef);
  if (!snap.exists()) return false;
  await remove(goalRef);
  return true;
}

// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ---------------------------------------------------------------------------
// Linear connection
//
// Kept beside the other writes so the reconciler has one place to persist what
// it learned, and so the data API exposes the same fields the app sees.
// ---------------------------------------------------------------------------

export async function setHillLinear(
  hillId: string,
  connection: HillLinearConnection
): Promise<void> {
  await set(ref(getFirebaseDb(), dbPath(`hills/${hillId}/linear`)), connection);
}

export async function updateHillLinear(
  hillId: string,
  updates: Partial<HillLinearConnection>
): Promise<void> {
  await update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/linear`)), updates);
}

// Disconnecting leaves Linear untouched — the group and its labels stay exactly
// as they are, and only Misty's side of the link is dropped.
export async function clearHillLinear(hillId: string): Promise<void> {
  const scopes = await listScopes(hillId);
  const updates: Record<string, any> = { [dbPath(`hills/${hillId}/linear`)]: null };
  for (const scope of scopes ?? []) {
    if (scope.linearLabelId) {
      updates[dbPath(`hills/${hillId}/scopes/${scope.id}/linearLabelId`)] = null;
    }
  }
  await update(ref(getFirebaseDb()), updates);
}

export async function setScopeLabelId(
  hillId: string,
  scopeId: string,
  labelId: string
): Promise<void> {
  await update(ref(getFirebaseDb(), dbPath(`hills/${hillId}/scopes/${scopeId}`)), {
    linearLabelId: labelId,
  });
}

// A milestone's target date is a fact rather than a judgement, so it is the one
// thing Misty mirrors onto the hill itself — as a goal on the timeline.
export async function upsertMilestoneGoal(
  hillId: string,
  name: string,
  dateMs: number,
  existingGoalId?: string
): Promise<string> {
  if (existingGoalId) {
    const goalRef = ref(getFirebaseDb(), dbPath(`hills/${hillId}/timelineProjects/${existingGoalId}`));
    const snap = await get(goalRef);
    if (snap.exists()) {
      await update(goalRef, { name, date: dateMs });
      return existingGoalId;
    }
  }
  const goal = await createGoal(hillId, { name, date: dateMs });
  return goal!.id;
}
