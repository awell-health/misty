import { TimelineProject } from '@/types';

// How far ahead the goals timeline looks. It always starts now.
export type TimelineRange = '30d' | '90d' | '6m';

export const TIMELINE_RANGES: TimelineRange[] = ['30d', '90d', '6m'];

export interface AxisMarker {
  time: number;     // epoch ms
  position: number; // 0 (now) → 1 (end of window)
  label: string;
}

export interface TimelineScale {
  start: number;
  end: number;
  markers: AxisMarker[]; // labelled ticks
  ticks: number[];       // unlabelled minor ticks, as positions
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function positionOf(scale: TimelineScale, dateMs: number): number {
  return Math.max(0, Math.min(1, (dateMs - scale.start) / (scale.end - scale.start)));
}

// Local midnights strictly after `start` and before `end`, one per day.
function midnightsBetween(start: number, end: number): Date[] {
  const s = new Date(start);
  const out: Date[] = [];
  for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1); d.getTime() < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    out.push(d);
  }
  return out;
}

export function buildTimelineScale(range: TimelineRange, now: Date): TimelineScale {
  const start = now.getTime();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  // Windows end at a local midnight, so a goal dated on the last day of the
  // window — at any time of day — still falls inside it.
  const end =
    range === '6m'
      ? new Date(y, m + 6, 1).getTime() // the sixth month counting this one, inclusive
      : new Date(y, m, d + (range === '30d' ? 30 : 90) + 1).getTime(); // today through day N

  const pos = (t: number) => (t - start) / (end - start);
  const onTrack = (p: number) => p > 0 && p < 1;
  const monthLabel = (t: Date) => t.toLocaleString('default', { month: 'short' });
  const dayLabel = (t: Date) => t.toLocaleString('default', { month: 'short', day: 'numeric' });

  let markers: AxisMarker[];
  let ticks: number[];

  if (range === '30d') {
    // Label each Monday; tick the days between.
    const days = midnightsBetween(start, end);
    markers = days
      .filter((t) => t.getDay() === 1)
      .map((t) => ({ time: t.getTime(), position: pos(t.getTime()), label: dayLabel(t) }));
    ticks = days.filter((t) => t.getDay() !== 1).map((t) => pos(t.getTime()));
  } else {
    // Label each month start; tick mid-month (6m) or each Monday (90d).
    const monthStarts = Array.from({ length: 7 }, (_, i) => new Date(y, m + i + 1, 1))
      .filter((t) => onTrack(pos(t.getTime())));
    markers = monthStarts.map((t) => ({ time: t.getTime(), position: pos(t.getTime()), label: monthLabel(t) }));
    ticks = range === '6m'
      ? Array.from({ length: 6 }, (_, i) => pos(new Date(y, m + i + 1, 15).getTime()))
      : midnightsBetween(start, end)
          .filter((t) => t.getDay() === 1 && t.getDate() !== 1)
          .map((t) => pos(t.getTime()));
  }

  return { start, end, markers, ticks: ticks.filter(onTrack) };
}

// Goals that fall in the window, in date order (ties by goal order, so the
// numbers shown with the legend stay put), and those dated after it. Overdue
// goals stay in view, pinned to the start of the track.
export function partitionGoals<T extends Pick<TimelineProject, 'date' | 'order'>>(
  goals: T[],
  scale: TimelineScale,
): { visible: T[]; later: T[] } {
  const sorted = [...goals].sort((a, b) => a.date - b.date || a.order - b.order);
  return {
    visible: sorted.filter((g) => g.date <= scale.end),
    later: sorted.filter((g) => g.date > scale.end),
  };
}

// Where a new goal lands: the usual ~45 days out, unless that is past the end
// of the window being looked at, in which case the middle of the window, so
// the goal (and its edit popover) shows up where the user is looking.
export function defaultGoalDate(scale: TimelineScale, now: number): number {
  const usual = Math.round(now + 45 * DAY_MS);
  return usual <= scale.end ? usual : Math.round(scale.start + (scale.end - scale.start) / 2);
}
