import { describe, it, expect } from 'vitest';
import { planReconcile } from './reconcile';
import { Scope } from '@/types';
import { LinearLabel } from './client';

function scope(partial: Partial<Scope> & { id: string; name: string }): Scope {
  return {
    description: '',
    position: 0,
    color: '#1a7f37',
    order: 0,
    ...partial,
  };
}

function label(partial: Partial<LinearLabel> & { id: string; name: string }): LinearLabel {
  return { color: '#1a7f37', retiredAt: null, ...partial };
}

describe('planReconcile', () => {
  it('creates a label for a scope that has none', () => {
    const actions = planReconcile([scope({ id: 's1', name: 'Registry sync' })], []);
    expect(actions).toEqual([
      { kind: 'create-label', scopeId: 's1', name: 'Registry sync', color: '#1a7f37' },
    ]);
  });

  it('does nothing when scope and label already agree', () => {
    const actions = planReconcile(
      [scope({ id: 's1', name: 'Registry sync', linearLabelId: 'l1' })],
      [label({ id: 'l1', name: 'Registry sync' })]
    );
    expect(actions).toEqual([]);
  });

  it('renames and recolors a linked label that drifted', () => {
    const actions = planReconcile(
      [scope({ id: 's1', name: 'Auth', color: '#0969da', linearLabelId: 'l1' })],
      [label({ id: 'l1', name: 'Old name', color: '#d1242f' })]
    );
    expect(actions).toEqual([
      { kind: 'rename-label', scopeId: 's1', labelId: 'l1', name: 'Auth' },
      { kind: 'recolor-label', scopeId: 's1', labelId: 'l1', color: '#0969da' },
    ]);
  });

  it('restores the original label when a scope delete is undone', () => {
    const actions = planReconcile(
      [scope({ id: 's1', name: 'Auth', linearLabelId: 'l1' })],
      [label({ id: 'l1', name: 'Auth', retiredAt: '2026-09-01T00:00:00Z' })]
    );
    expect(actions).toEqual([{ kind: 'restore-label', scopeId: 's1', labelId: 'l1' }]);
  });

  it('links a same-named label rather than creating a duplicate', () => {
    const actions = planReconcile(
      [scope({ id: 's1', name: 'Registry sync' })],
      [label({ id: 'l1', name: 'registry sync' })]
    );
    expect(actions).toEqual([{ kind: 'link-label', scopeId: 's1', labelId: 'l1' }]);
  });

  it('suffixes scopes that would collide on name', () => {
    const actions = planReconcile(
      [scope({ id: 's1', name: 'Migration' }), scope({ id: 's2', name: 'Migration' })],
      []
    );
    expect(actions.map((a) => 'name' in a && a.name)).toEqual(['Migration', 'Migration (2)']);
  });

  it('leaves unclaimed labels alone in steady state', () => {
    const actions = planReconcile([], [label({ id: 'l1', name: 'Hand-made' })]);
    expect(actions).toEqual([]);
  });

  it('adopts unclaimed labels as scopes when connecting', () => {
    const actions = planReconcile([], [label({ id: 'l1', name: 'Hand-made', color: '#8250df' })], {
      adopt: true,
    });
    expect(actions).toEqual([
      { kind: 'create-scope', labelId: 'l1', name: 'Hand-made', color: '#8250df' },
    ]);
  });

  it('does not adopt a retired label', () => {
    const actions = planReconcile(
      [],
      [label({ id: 'l1', name: 'Gone', retiredAt: '2026-09-01T00:00:00Z' })],
      { adopt: true }
    );
    expect(actions).toEqual([]);
  });

  it('recreates a label that was deleted outright in Linear', () => {
    const actions = planReconcile(
      [scope({ id: 's1', name: 'Auth', linearLabelId: 'gone' })],
      []
    );
    expect(actions).toEqual([
      { kind: 'create-label', scopeId: 's1', name: 'Auth', color: '#1a7f37' },
    ]);
  });
});
