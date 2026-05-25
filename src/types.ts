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
