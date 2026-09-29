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
  // Child label inside the hill's Linear label group. Set by the reconciler;
  // the id is the link, the name is always derived from `name` above.
  linearLabelId?: string;
}

export interface TimelineProject {
  id: string;
  name: string;
  color: string;
  date: number; // epoch ms — absolute calendar date for the goal
  order: number;
}

export type TimelineMode = 'fixed-timeline' | 'fixed-scope';

// A hill connected to a Linear project. Misty owns the label group named here
// and everything inside it, which is what makes it safe to write to Linear
// without asking: no human authors labels in that namespace.
export interface HillLinearConnection {
  orgSlug: string;        // workspace url key, for building links
  projectId: string;
  projectName: string;
  projectUrl: string;
  milestoneId?: string;   // optional narrowing to one milestone
  milestoneName?: string;
  labelGroupId: string;   // the Misty-owned group
  goalId?: string;        // timelineProject mirroring the milestone target date
  connectedAt: number;
}

export interface Hill {
  id: string;
  title: string;
  description: string;
  scopes: Scope[];
  order: number;
  timelineProjects?: TimelineProject[];
  timelineMode?: TimelineMode;
  completed?: boolean;
  completedAt?: number;
  archived?: boolean;
  archivedAt?: number;
  linear?: HillLinearConnection;
}

// Read-only evidence pulled from Linear for one scope. Never persisted, and
// deliberately not a position: the dot on the hill stays a human judgement.
export interface ScopeSignal {
  scopeId: string;
  labelId: string;
  total: number;
  completed: number;
  started: number;
  unstarted: number; // backlog + unstarted + triage
  canceled: number;
  blockedBy: string[]; // names of scopes blocking this one
  url: string;         // pre-filtered Linear view
}

export interface HillLinearSignal {
  configured: boolean;   // false when LINEAR_API_KEY is unset on the server
  connected: boolean;
  projectName?: string;
  projectUrl?: string;
  milestoneName?: string;
  targetDate?: number;   // epoch ms, from the milestone (or project) target date
  scopes: ScopeSignal[];
  unlabeled: number;     // issues in range carrying no scope label
  fetchedAt: number;
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

export interface OnCallShift {
  name: string;   // person on call
  start: string;  // "YYYY-MM-DD" — first day of the shift (inclusive)
  end: string;    // "YYYY-MM-DD" — day after the last day (exclusive)
}

export interface OnCallCalendarData {
  shifts: OnCallShift[];
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
