import { describe, it, expect } from 'vitest';
import { buildSignals } from './signal';
import { Scope } from '@/types';
import { LinearIssue } from './client';

function scope(id: string, name: string, labelId?: string): Scope {
  return { id, name, description: '', position: 0, color: '#1a7f37', order: 0, linearLabelId: labelId };
}

function issue(id: string, stateType: string, labelIds: string[], blockedBy: LinearIssue['blockedBy'] = []): LinearIssue {
  return { id, identifier: id, stateType, labelIds, blockedBy };
}

const base = { orgSlug: 'awell', projectId: 'p1' };

describe('buildSignals', () => {
  it('counts issues by state into the right scope', () => {
    const { scopes } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth', 'l1')],
      issues: [
        issue('i1', 'completed', ['l1']),
        issue('i2', 'started', ['l1']),
        issue('i3', 'backlog', ['l1']),
        issue('i4', 'triage', ['l1']),
        issue('i5', 'canceled', ['l1']),
      ],
    });
    expect(scopes[0]).toMatchObject({
      total: 5, completed: 1, started: 1, unstarted: 2, canceled: 1,
    });
  });

  it('counts issues carrying no scope label as unlabeled', () => {
    const { scopes, unlabeled } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth', 'l1')],
      issues: [issue('i1', 'started', ['other']), issue('i2', 'started', [])],
    });
    expect(unlabeled).toBe(2);
    expect(scopes[0].total).toBe(0);
  });

  it('counts a multi-scope issue under each of its scopes', () => {
    const { scopes, unlabeled } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth', 'l1'), scope('s2', 'Registry', 'l2')],
      issues: [issue('i1', 'started', ['l1', 'l2'])],
    });
    expect(scopes.map((s) => s.total)).toEqual([1, 1]);
    expect(unlabeled).toBe(0);
  });

  it('reports a blocking relation across scopes by scope name', () => {
    const { scopes } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth', 'l1'), scope('s2', 'Registry', 'l2')],
      issues: [issue('i1', 'started', ['l2'], [{ id: 'i2', labelIds: ['l1'] }])],
    });
    expect(scopes.find((s) => s.scopeId === 's2')!.blockedBy).toEqual(['Auth']);
    expect(scopes.find((s) => s.scopeId === 's1')!.blockedBy).toEqual([]);
  });

  it('ignores a blocking relation inside one scope', () => {
    const { scopes } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth', 'l1')],
      issues: [issue('i1', 'started', ['l1'], [{ id: 'i2', labelIds: ['l1'] }])],
    });
    expect(scopes[0].blockedBy).toEqual([]);
  });

  it('deduplicates two blockers from the same scope', () => {
    const { scopes } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth', 'l1'), scope('s2', 'Registry', 'l2')],
      issues: [
        issue('i1', 'started', ['l2'], [
          { id: 'i2', labelIds: ['l1'] },
          { id: 'i3', labelIds: ['l1'] },
        ]),
      ],
    });
    expect(scopes.find((s) => s.scopeId === 's2')!.blockedBy).toEqual(['Auth']);
  });

  it('skips scopes that have no label yet', () => {
    const { scopes } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth'), scope('s2', 'Registry', 'l2')],
      issues: [],
    });
    expect(scopes.map((s) => s.scopeId)).toEqual(['s2']);
  });

  it('returns signals in hill order, not label order', () => {
    const { scopes } = buildSignals({
      ...base,
      scopes: [scope('s1', 'Auth', 'l1'), scope('s2', 'Registry', 'l2')],
      issues: [issue('i1', 'started', ['l2'])],
    });
    expect(scopes.map((s) => s.scopeId)).toEqual(['s1', 's2']);
  });
});
