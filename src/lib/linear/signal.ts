import { Scope, ScopeSignal } from '@/types';
import { LinearIssue } from './client';

// Turns raw Linear issues into per-scope counts. Pure, so the interesting part
// — what counts as done, what counts as blocked — is testable without a token.

function issueUrl(orgSlug: string, labelId: string, projectId: string, milestoneId?: string): string {
  // Linear reads filters off the query string; this lands on the project's
  // issues narrowed to the one label.
  const filter: Record<string, unknown> = {
    label: { id: { eq: labelId } },
    project: { id: { eq: projectId } },
  };
  if (milestoneId) filter.projectMilestone = { id: { eq: milestoneId } };
  return `https://linear.app/${orgSlug}/search?filter=${encodeURIComponent(JSON.stringify(filter))}`;
}

export interface BuildSignalsInput {
  scopes: Scope[];
  issues: LinearIssue[];
  orgSlug: string;
  projectId: string;
  milestoneId?: string;
}

export function buildSignals(input: BuildSignalsInput): { scopes: ScopeSignal[]; unlabeled: number } {
  const { scopes, issues, orgSlug, projectId, milestoneId } = input;

  const scopeByLabel = new Map<string, Scope>();
  for (const s of scopes) {
    if (s.linearLabelId) scopeByLabel.set(s.linearLabelId, s);
  }

  const signals = new Map<string, ScopeSignal>();
  for (const s of scopes) {
    if (!s.linearLabelId) continue;
    signals.set(s.linearLabelId, {
      scopeId: s.id,
      labelId: s.linearLabelId,
      total: 0,
      completed: 0,
      started: 0,
      unstarted: 0,
      canceled: 0,
      blockedBy: [],
      url: issueUrl(orgSlug, s.linearLabelId, projectId, milestoneId),
    });
  }

  // Collected as sets so two blocking tickets in the same scope read as one edge.
  const blockers = new Map<string, Set<string>>();
  let unlabeled = 0;

  for (const issue of issues) {
    const matched = issue.labelIds.filter((id) => signals.has(id));
    if (matched.length === 0) {
      unlabeled++;
      continue;
    }

    for (const labelId of matched) {
      const sig = signals.get(labelId)!;
      sig.total++;
      switch (issue.stateType) {
        case 'completed':
          sig.completed++;
          break;
        case 'started':
          sig.started++;
          break;
        case 'canceled':
          sig.canceled++;
          break;
        default: // backlog, unstarted, triage
          sig.unstarted++;
      }

      // A blocking relation between tickets in two different scopes is the only
      // dependency worth surfacing on a hill; within one scope it is just work.
      for (const blocker of issue.blockedBy) {
        for (const blockerLabel of blocker.labelIds) {
          if (blockerLabel === labelId || !signals.has(blockerLabel)) continue;
          const name = scopeByLabel.get(blockerLabel)?.name;
          if (!name) continue;
          if (!blockers.has(labelId)) blockers.set(labelId, new Set());
          blockers.get(labelId)!.add(name);
        }
      }
    }
  }

  for (const [labelId, names] of blockers) {
    signals.get(labelId)!.blockedBy = [...names].sort();
  }

  // Keep the hill's own scope order rather than label order.
  const ordered = scopes
    .map((s) => (s.linearLabelId ? signals.get(s.linearLabelId) : undefined))
    .filter((s): s is ScopeSignal => Boolean(s));

  return { scopes: ordered, unlabeled };
}
