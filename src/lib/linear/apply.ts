import { SerializedHill, createScope, getHill, setScopeLabelId, updateHillLinear, upsertMilestoneGoal } from '@/lib/api/store';
import { planReconcile, ReconcileOptions } from './reconcile';
import {
  createChildLabel,
  createLabelGroup,
  getLabelGroup,
  getProject,
  restoreLabel,
  updateLabel,
} from './client';

export interface SyncResult {
  applied: number;
  errors: string[];
}

// Name the group after the hill. Plain and obviously machine-owned beats
// clever: `>` already means a flat pseudo-group in this workspace
// (`Customer > Brave`), so reusing it inside a real group would read wrong.
export function labelGroupName(hillTitle: string): string {
  return `Hill: ${hillTitle.trim() || 'Untitled hill'}`;
}

// Reconcile one hill's scopes against its label group. Idempotent, so it is
// safe to call on every scope change, on page load, and on a failure retry.
export async function syncHill(hillId: string, options: ReconcileOptions = {}): Promise<SyncResult> {
  const hill = await getHill(hillId);
  if (!hill?.linear) return { applied: 0, errors: [] };

  let group = await getLabelGroup(hill.linear.labelGroupId);

  // The group was deleted in Linear. Rebuild it and let the plan re-create the
  // children, rather than leaving the hill permanently half-connected.
  if (!group) {
    const fresh = await createLabelGroup(labelGroupName(hill.title));
    await updateHillLinear(hillId, { labelGroupId: fresh.id });
    hill.linear.labelGroupId = fresh.id;
    group = { id: fresh.id, name: fresh.name, children: [] };
  } else if (group.name !== labelGroupName(hill.title)) {
    await updateLabel(group.id, { name: labelGroupName(hill.title) });
  }

  const actions = planReconcile(hill.scopes, group.children, options);
  const errors: string[] = [];
  let applied = 0;

  for (const action of actions) {
    try {
      switch (action.kind) {
        case 'create-label': {
          const label = await createChildLabel(group.id, action.name, action.color);
          await setScopeLabelId(hillId, action.scopeId, label.id);
          break;
        }
        case 'link-label':
          await setScopeLabelId(hillId, action.scopeId, action.labelId);
          break;
        case 'rename-label':
          await updateLabel(action.labelId, { name: action.name });
          break;
        case 'recolor-label':
          await updateLabel(action.labelId, { color: action.color });
          break;
        case 'restore-label':
          await restoreLabel(action.labelId);
          break;
        case 'create-scope':
          await createScope(hillId, {
            name: action.name,
            color: action.color,
            linearLabelId: action.labelId,
          });
          break;
      }
      applied++;
    } catch (e) {
      // One bad action shouldn't abandon the rest; the next pass retries it.
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  await syncMilestoneGoal(hill);
  return { applied, errors };
}

// Mirror the milestone's (or project's) target date onto the hill timeline.
async function syncMilestoneGoal(hill: SerializedHill): Promise<void> {
  if (!hill.linear) return;
  const project = await getProject(hill.linear.projectId);
  if (!project) return;

  const milestone = hill.linear.milestoneId
    ? project.milestones.find((m) => m.id === hill.linear!.milestoneId)
    : undefined;

  const targetDate = milestone?.targetDate ?? project.targetDate;
  if (!targetDate) return;

  // TimelessDate is "YYYY-MM-DD"; read it as midday UTC so a timezone shift
  // can't drag the goal onto the day before.
  const dateMs = Date.parse(`${targetDate}T12:00:00Z`);
  if (Number.isNaN(dateMs)) return;

  const goalId = await upsertMilestoneGoal(
    hill.id,
    milestone?.name ?? project.name,
    dateMs,
    hill.linear.goalId
  );
  if (goalId !== hill.linear.goalId) {
    await updateHillLinear(hill.id, { goalId });
  }
}
