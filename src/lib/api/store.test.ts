import { describe, it, expect } from 'vitest';
import { stripUndefined, goalNameError } from './store';
import { GOAL_NAME_MAX_LENGTH } from '@/types';

describe('stripUndefined', () => {
  it('drops undefined keys that Firebase would reject', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('keeps null, which Firebase uses to clear a field', () => {
    expect(stripUndefined({ a: null })).toEqual({ a: null });
  });

  it('keeps falsy values that are not undefined', () => {
    expect(stripUndefined({ a: 0, b: '', c: false })).toEqual({ a: 0, b: '', c: false });
  });

  it('handles a connection with no milestone — the case that broke connect', () => {
    const connection = {
      orgSlug: 'awell',
      projectId: 'p1',
      projectName: 'Misty demo',
      projectUrl: 'https://linear.app/awell/project/x',
      milestoneId: undefined,
      milestoneName: undefined,
      labelGroupId: 'g1',
      goalId: undefined,
      connectedAt: 1,
    };
    expect(Object.keys(stripUndefined(connection)).sort()).toEqual([
      'connectedAt', 'labelGroupId', 'orgSlug', 'projectId', 'projectName', 'projectUrl',
    ]);
  });
});

describe('goalNameError', () => {
  it('accepts a name at the limit', () => {
    expect(goalNameError('x'.repeat(GOAL_NAME_MAX_LENGTH))).toBeNull();
  });

  it('rejects a name over the limit, saying what the limit is', () => {
    expect(goalNameError('x'.repeat(GOAL_NAME_MAX_LENGTH + 1))).toMatch(String(GOAL_NAME_MAX_LENGTH));
  });

  it('leaves a missing name alone, since create and update both allow one', () => {
    expect(goalNameError(undefined)).toBeNull();
  });

  it('rejects a name that is not a string', () => {
    expect(goalNameError(42)).not.toBeNull();
  });
});
