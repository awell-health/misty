import { describe, it, expect } from 'vitest';
import { oooWindows, planOverrides } from './oooOverrides';
import type { Rotation, ScheduleEntry } from './incidentIo';

const now = new Date('2026-09-23T12:00:00Z');

// Shaped like the real API: entries carry a rotation but no layer.
const entry = (email: string, start_at: string, end_at: string, rotation_id = 'rot-mike'): ScheduleEntry => ({
  rotation_id,
  start_at,
  end_at,
  user: { id: `user-${email}`, email },
});

// Mike's personal schedule: one rotation, one layer.
const mikeRotations: Rotation[] = [{ id: 'rot-mike', effective_from: null, layers: [{ id: 'layer-mike' }] }];

describe('oooWindows', () => {
  it('turns an all-day event into whole Denver days, keyed by creator', () => {
    const [w] = oooWindows([
      { summary: 'MP OOO', creator: { email: 'Mike@awellhealth.com' }, start: { date: '2026-10-01' }, end: { date: '2026-10-03' } },
    ]);
    expect(w.email).toBe('mike@awellhealth.com');
    expect(w.start.toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-03T06:00:00.000Z');
  });

  it('keeps timed events to their hours', () => {
    const [w] = oooWindows([
      {
        summary: 'OoO - attending a wedding',
        creator: { email: 'ej@awellhealth.com' },
        start: { dateTime: '2026-09-25T12:00:00-06:00' },
        end: { dateTime: '2026-09-25T17:00:00-06:00' },
      },
    ]);
    expect(w.start.toISOString()).toBe('2026-09-25T18:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-25T23:00:00.000Z');
  });

  it('merges overlapping events for the same person and skips creatorless ones', () => {
    const windows = oooWindows([
      { creator: { email: 'thomas@awellhealth.com' }, start: { date: '2026-10-22' }, end: { date: '2026-10-24' } },
      { creator: { email: 'thomas@awellhealth.com' }, start: { date: '2026-10-23' }, end: { date: '2026-10-25' } },
      { start: { date: '2026-10-22' }, end: { date: '2026-10-23' } },
    ]);
    expect(windows).toHaveLength(1);
    expect(windows[0].end.toISOString()).toBe('2026-10-25T06:00:00.000Z');
  });
});

describe('planOverrides', () => {
  const [mikeOff] = oooWindows([
    { creator: { email: 'mike@awellhealth.com' }, start: { date: '2026-10-01' }, end: { date: '2026-10-03' } },
  ]);

  it("overrides the OOO person's shift on their rotation's only layer, clipped to the OOO window", () => {
    const entries = [entry('mike@awellhealth.com', '2026-09-28T15:00:00Z', '2026-10-05T15:00:00Z')];
    expect(planOverrides([mikeOff], entries, mikeRotations, now)).toEqual({
      planned: [
        {
          email: 'mike@awellhealth.com',
          rotation_id: 'rot-mike',
          layer_id: 'layer-mike',
          start_at: '2026-10-01T06:00:00.000Z',
          end_at: '2026-10-03T06:00:00.000Z',
        },
      ],
      skipped: [],
    });
  });

  it('plans one override per shift the OOO window touches', () => {
    const entries = [
      entry('mike@awellhealth.com', '2026-10-01T15:00:00Z', '2026-10-01T23:00:00Z'),
      entry('mike@awellhealth.com', '2026-10-02T15:00:00Z', '2026-10-02T23:00:00Z'),
    ];
    const { planned } = planOverrides([mikeOff], entries, mikeRotations, now);
    expect(planned.map((p) => [p.start_at, p.end_at])).toEqual([
      ['2026-10-01T15:00:00.000Z', '2026-10-01T23:00:00.000Z'],
      ['2026-10-02T15:00:00.000Z', '2026-10-02T23:00:00.000Z'],
    ]);
  });

  it('leaves other people on the schedule alone', () => {
    const entries = [entry('thomas@awellhealth.com', '2026-10-01T15:00:00Z', '2026-10-01T23:00:00Z')];
    expect(planOverrides([mikeOff], entries, mikeRotations, now)).toEqual({ planned: [], skipped: [] });
  });

  it('skips shifts on a rotation with concurrent layers instead of guessing the layer', () => {
    const rotations: Rotation[] = [{ id: 'rot-mike', effective_from: null, layers: [{ id: 'a' }, { id: 'b' }] }];
    const entries = [entry('mike@awellhealth.com', '2026-10-01T15:00:00Z', '2026-10-01T23:00:00Z')];
    const { planned, skipped } = planOverrides([mikeOff], entries, rotations, now);
    expect(planned).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].start_at).toBe('2026-10-01T15:00:00.000Z');
  });

  it('uses the rotation version in effect on the day of the shift', () => {
    // As on the real schedule: a two-layer version, replaced on Sep 28 by a
    // single-layer one with the same rotation id.
    const rotations: Rotation[] = [
      { id: 'rot-mike', effective_from: null, layers: [{ id: 'a' }, { id: 'b' }] },
      { id: 'rot-mike', effective_from: '2026-09-28T15:00:00Z', layers: [{ id: 'layer-mike' }] },
    ];
    const entries = [entry('mike@awellhealth.com', '2026-10-01T15:00:00Z', '2026-10-01T23:00:00Z')];
    expect(planOverrides([mikeOff], entries, rotations, now).planned[0].layer_id).toBe('layer-mike');
  });

  it('plans nothing once the person is already overridden off the final schedule', () => {
    // After a sync, the final entries no longer show Mike in that slot.
    expect(planOverrides([mikeOff], [], mikeRotations, now)).toEqual({ planned: [], skipped: [] });
  });

  it('never starts an override in the past', () => {
    const [today] = oooWindows([
      { creator: { email: 'mike@awellhealth.com' }, start: { date: '2026-09-23' }, end: { date: '2026-09-24' } },
    ]);
    const entries = [entry('mike@awellhealth.com', '2026-09-21T15:00:00Z', '2026-09-28T15:00:00Z')];
    expect(planOverrides([today], entries, mikeRotations, now).planned[0].start_at).toBe(now.toISOString());
  });
});
