export interface Scope {
  id: string;
  name: string;
  description: string;
  position: number; // 0 (start, left) → 0.5 (top of hill) → 1 (done, right)
  color: string;
  order: number;
  hidden?: boolean;
  goalPosition?: number;
  completed?: boolean;
  completedAt?: number;
}

export interface TimelineProject {
  id: string;
  name: string;
  color: string;
  date: number; // epoch ms — absolute calendar date for the goal
  order: number;
}

export type TimelineMode = 'fixed-timeline' | 'fixed-scope';

export interface Hill {
  id: string;
  title: string;
  description: string;
  scopes: Scope[];
  order: number;
  timelineProjects?: TimelineProject[];
  timelineMode?: TimelineMode;
}

export type MetricType = 'raw' | 'since';

export interface Metric {
  id: string;
  type: MetricType;
  value: string;     // shown as the big number when type === 'raw'
  sinceDate: string; // "YYYY-MM-DD" — counts days since this date when type === 'since'
  name: string;      // editable label shown below the value
  order: number;
}

// Exactly three metrics, keyed by fixed ids. Defaults live client-side and are
// only persisted to Firebase once a metric is edited.
export const METRIC_IDS = ['m0', 'm1', 'm2'] as const;

export const DEFAULT_METRICS: Record<string, Omit<Metric, 'id' | 'order'>> = {
  m0: { type: 'raw', value: '0', sinceDate: '', name: 'Metric one' },
  m1: { type: 'raw', value: '0', sinceDate: '', name: 'Metric two' },
  m2: { type: 'since', value: '0', sinceDate: '', name: 'Last incident' },
};

export interface OOODay {
  date: string;    // "YYYY-MM-DD"
  count: number;
  names: string[];
}

export interface OOOCalendarData {
  days: OOODay[];
}

export interface OOOSettings {
  teamSize: number;        // total team members
  orangeThreshold: number; // % OOO to trigger orange warning
  redThreshold: number;    // % OOO to trigger red alert
}

export const DEFAULT_OOO_SETTINGS: OOOSettings = {
  teamSize: 10,
  orangeThreshold: 25,
  redThreshold: 50,
};

export const SCOPE_COLORS = [
  '#1a7f37', // success (green)
  '#0969da', // accent (blue)
  '#d1242f', // danger (red)
  '#9a6700', // attention (yellow)
  '#8250df', // done (purple)
  '#e16f24', // orange
  '#0550ae', // dark blue
  '#116329', // dark green
  '#cf222e', // bright red
  '#7d4e00', // brown
  '#6639ba', // deep purple
  '#d4a72c', // gold
];
