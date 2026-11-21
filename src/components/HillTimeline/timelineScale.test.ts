import { describe, it, expect } from 'vitest';
import { buildTimelineScale, defaultGoalDate, partitionGoals, positionOf, type TimelineScale } from './timelineScale';

// Saturday 21 Nov 2026, mid-afternoon local time. Local constructors keep the
// tests independent of the machine's timezone.
const NOW = new Date(2026, 10, 21, 15, 30);
const local = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).getTime();

const goal = (id: string, date: number, order = 0) => ({ id, name: id, color: '#000', date, order });

const expectWithinTrack = (scale: TimelineScale) => {
  for (const m of scale.markers) {
    expect(m.position).toBeGreaterThan(0);
    expect(m.position).toBeLessThan(1);
  }
  for (const t of scale.ticks) {
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
  }
};

describe('buildTimelineScale — 6m', () => {
  const scale = buildTimelineScale('6m', NOW);

  it('starts now and runs to the end of the sixth month, counting this one', () => {
    expect(scale.start).toBe(NOW.getTime());
    expect(scale.end).toBe(local(2027, 4, 1)); // midnight that starts 1 May 2027
  });

  it('labels the first of each following month', () => {
    expect(scale.markers.map((m) => m.time)).toEqual([
      local(2026, 11, 1), local(2027, 0, 1), local(2027, 1, 1), local(2027, 2, 1), local(2027, 3, 1),
    ]);
    expect(scale.markers[0].label).toMatch(/Dec/);
  });

  it('ticks the middle of each following month', () => {
    expect(scale.ticks).toHaveLength(5);
    expect(scale.ticks[0]).toBeCloseTo(positionOf(scale, local(2026, 11, 15)), 10);
  });

  it('keeps every marker and tick on the track', () => expectWithinTrack(scale));
});

describe('buildTimelineScale — 90d', () => {
  const scale = buildTimelineScale('90d', NOW);

  it('covers today through day 90', () => {
    expect(scale.end).toBe(local(2027, 1, 20)); // midnight after 19 Feb 2027
  });

  it('labels the first of each month in range', () => {
    expect(scale.markers.map((m) => m.time)).toEqual([
      local(2026, 11, 1), local(2027, 0, 1), local(2027, 1, 1),
    ]);
  });

  it('ticks every Monday, except where a month label already sits', () => {
    // 13 Mondays from 23 Nov to 15 Feb; 1 Feb is also a month start.
    expect(scale.ticks).toHaveLength(12);
    const markerPositions = scale.markers.map((m) => m.position);
    for (const t of scale.ticks) expect(markerPositions).not.toContain(t);
    expect(scale.ticks[0]).toBeCloseTo(positionOf(scale, local(2026, 10, 23)), 10);
  });

  it('keeps every marker and tick on the track', () => expectWithinTrack(scale));
});

describe('buildTimelineScale — 30d', () => {
  const scale = buildTimelineScale('30d', NOW);

  it('covers today through day 30', () => {
    expect(scale.end).toBe(local(2026, 11, 22)); // midnight after 21 Dec 2026
  });

  it('labels every Monday with its day of the month', () => {
    expect(scale.markers.map((m) => m.time)).toEqual([
      local(2026, 10, 23), local(2026, 10, 30), local(2026, 11, 7), local(2026, 11, 14), local(2026, 11, 21),
    ]);
    expect(scale.markers[0].label).toMatch(/23/);
  });

  it('ticks the days between the Mondays', () => {
    // 30 midnights from 22 Nov to 21 Dec, less the 5 labelled Mondays.
    expect(scale.ticks).toHaveLength(25);
  });

  it('keeps every marker and tick on the track', () => expectWithinTrack(scale));
});

describe('positionOf', () => {
  const scale = buildTimelineScale('30d', NOW);

  it('clamps dates before now to the start of the track', () => {
    expect(positionOf(scale, local(2026, 9, 1))).toBe(0);
  });

  it('clamps dates after the window to the end of the track', () => {
    expect(positionOf(scale, local(2027, 5, 1))).toBe(1);
  });
});

describe('partitionGoals', () => {
  const scale = buildTimelineScale('30d', NOW);

  it('orders goals in view by date, and sets aside the ones after the window', () => {
    const { visible, later } = partitionGoals(
      [
        goal('feb', local(2027, 1, 1)),
        goal('dec', local(2026, 11, 10)),
        goal('nov', local(2026, 10, 25)),
      ],
      scale,
    );
    expect(visible.map((g) => g.id)).toEqual(['nov', 'dec']);
    expect(later.map((g) => g.id)).toEqual(['feb']);
  });

  it('keeps overdue goals in view, pinned at the start', () => {
    const { visible } = partitionGoals([goal('overdue', local(2026, 10, 1))], scale);
    expect(visible.map((g) => g.id)).toEqual(['overdue']);
  });

  it('keeps a goal on the last day of the window in view', () => {
    const { visible } = partitionGoals([goal('last-day', local(2026, 11, 21, 18))], scale);
    expect(visible.map((g) => g.id)).toEqual(['last-day']);
  });

  it('keeps a goal dragged to the very end of the track in view', () => {
    const { visible } = partitionGoals([goal('edge', scale.end)], scale);
    expect(visible.map((g) => g.id)).toEqual(['edge']);
  });

  it('breaks date ties by goal order, so numbering is stable', () => {
    const d = local(2026, 11, 1);
    const { visible } = partitionGoals([goal('b', d, 2), goal('a', d, 1)], scale);
    expect(visible.map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('defaultGoalDate', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('puts a new goal ~45 days out when that is in view', () => {
    expect(defaultGoalDate(buildTimelineScale('90d', NOW), NOW.getTime())).toBe(NOW.getTime() + 45 * DAY);
    expect(defaultGoalDate(buildTimelineScale('6m', NOW), NOW.getTime())).toBe(NOW.getTime() + 45 * DAY);
  });

  it('puts a new goal mid-window when 45 days out is past the end', () => {
    const scale = buildTimelineScale('30d', NOW);
    const date = defaultGoalDate(scale, NOW.getTime());
    expect(positionOf(scale, date)).toBeCloseTo(0.5, 10);
  });
});
