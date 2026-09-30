import { Scope } from '@/types';
import { LinearLabel } from './client';

// Reconciliation, not an event stream. Every trigger recomputes the whole
// difference between a hill's scopes and its label group, so a write that fails
// or a change that never fired an event heals on the next pass.
//
// Note what is *not* here: nothing retires a label. Retiring happens only where
// Misty knows a scope was deliberately deleted, because the reconciler cannot
// tell a deleted scope from a label someone added by hand, and guessing wrong
// in either direction is worse than leaving an orphan label alone.

export type ReconcileAction =
  | { kind: 'create-label'; scopeId: string; name: string; color: string }
  | { kind: 'rename-label'; scopeId: string; labelId: string; name: string }
  | { kind: 'recolor-label'; scopeId: string; labelId: string; color: string }
  | { kind: 'restore-label'; scopeId: string; labelId: string }
  | { kind: 'link-label'; scopeId: string; labelId: string }
  | { kind: 'create-scope'; labelId: string; name: string; color: string };

export interface ReconcileOptions {
  // On connect only: child labels nobody claims become scopes on the hill.
  // Off in steady state, or deleting a scope would resurrect it from its label.
  adopt?: boolean;
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

// Linear rejects two children of the same group sharing a name, so scopes that
// collide get a numeric suffix rather than one of them silently failing.
function targetNames(scopes: Scope[]): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const scope of scopes) {
    const base = scope.name.trim() || 'Untitled scope';
    const count = seen.get(norm(base)) ?? 0;
    seen.set(norm(base), count + 1);
    out.set(scope.id, count === 0 ? base : `${base} (${count + 1})`);
  }
  return out;
}

export function planReconcile(
  scopes: Scope[],
  children: LinearLabel[],
  options: ReconcileOptions = {}
): ReconcileAction[] {
  const actions: ReconcileAction[] = [];
  const byId = new Map(children.map((c) => [c.id, c]));
  const claimed = new Set<string>();
  const names = targetNames(scopes);

  for (const scope of scopes) {
    const wanted = names.get(scope.id)!;
    const existing = scope.linearLabelId ? byId.get(scope.linearLabelId) : undefined;

    if (existing) {
      claimed.add(existing.id);
      // A retired label whose scope is back means the delete was undone, so
      // bring the original label back rather than stranding its issues on it.
      if (existing.retiredAt) {
        actions.push({ kind: 'restore-label', scopeId: scope.id, labelId: existing.id });
      }
      if (existing.name !== wanted) {
        actions.push({ kind: 'rename-label', scopeId: scope.id, labelId: existing.id, name: wanted });
      }
      if (norm(existing.color) !== norm(scope.color)) {
        actions.push({ kind: 'recolor-label', scopeId: scope.id, labelId: existing.id, color: scope.color });
      }
      continue;
    }

    // No id yet (new scope, or one whose label was deleted outright in Linear).
    // Prefer an unclaimed child with the same name — that is the same scope
    // arriving from the other direction, and re-creating it would orphan the
    // issues already tagged with it.
    const match = children.find(
      (c) => !claimed.has(c.id) && norm(c.name) === norm(wanted)
    );
    if (match) {
      claimed.add(match.id);
      actions.push({ kind: 'link-label', scopeId: scope.id, labelId: match.id });
      if (match.retiredAt) {
        actions.push({ kind: 'restore-label', scopeId: scope.id, labelId: match.id });
      }
      if (norm(match.color) !== norm(scope.color)) {
        actions.push({ kind: 'recolor-label', scopeId: scope.id, labelId: match.id, color: scope.color });
      }
    } else {
      actions.push({ kind: 'create-label', scopeId: scope.id, name: wanted, color: scope.color });
    }
  }

  if (options.adopt) {
    for (const child of children) {
      if (claimed.has(child.id) || child.retiredAt) continue;
      actions.push({ kind: 'create-scope', labelId: child.id, name: child.name, color: child.color });
    }
  }

  return actions;
}
