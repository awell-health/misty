export const SVG_WIDTH = 800;
export const SVG_HEIGHT = 300;
export const PADDING = 40;
export const CHART_WIDTH = SVG_WIDTH - 2 * PADDING;
export const CHART_HEIGHT = SVG_HEIGHT - 2 * PADDING;

export function positionToPoint(position: number): { x: number; y: number } {
  const x = PADDING + position * CHART_WIDTH;
  const y = (SVG_HEIGHT - PADDING) - Math.sin(position * Math.PI) * CHART_HEIGHT;
  return { x, y };
}

export function generateHillPath(): string {
  const steps = 100;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const pos = i / steps;
    const { x, y } = positionToPoint(pos);
    points.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
  }
  return points.join(' ');
}

export function svgXToPosition(svgX: number): number {
  const pos = (svgX - PADDING) / CHART_WIDTH;
  return Math.max(0, Math.min(1, pos));
}

export function getMousePositionInSvg(
  clientX: number,
  clientY: number,
  svgElement: SVGSVGElement
): { x: number; y: number } {
  const rect = svgElement.getBoundingClientRect();
  const scaleX = SVG_WIDTH / rect.width;
  const scaleY = SVG_HEIGHT / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

// --- Scope label layout ---

export const DOT_RADIUS = 8;
export const LABEL_ROW = 18;
export const LABEL_ROW_MIN = 14;
export const LABEL_GAP = 22;
/** Below this fraction of the way up a side, labels sit inside the hill. */
export const LABEL_SWITCH = 0.22;
export const LABEL_MAX_CHARS = 26;
/**
 * Space always reserved above the chart for labels stacked at the crest, so the
 * chart keeps one size while scopes move. Fits five labels a side at full row height.
 */
export const LABEL_HEADROOM = 44;

export interface LabelInput {
  id: string;
  name: string;
  position: number;
}

export interface LabelPlacement {
  id: string;
  dot: { x: number; y: number };
  /** SVG y of the row centre. Negative when a crest stack rises above the viewBox. */
  labelY: number;
  /** x where the text starts (anchor 'start') or ends (anchor 'end'). */
  edgeX: number;
  anchor: 'start' | 'end';
  text: string;
  /** Name to show while the scope is hovered or dragged: the full name, cut only if it would leave the chart. */
  fullText: string;
  truncated: boolean;
  /** Render at 11px instead of 12px. */
  small: boolean;
}

export interface LabelLayout {
  placements: LabelPlacement[];
  /** Height the crest stacks need above y=0. Exceeds LABEL_HEADROOM only when a stack cannot be tightened enough. */
  extraTop: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const BASELINE_Y = SVG_HEIGHT - PADDING;
const MID_X = PADDING + CHART_WIDTH / 2;

export function truncateName(name: string, maxChars: number): string {
  return name.length > maxChars ? name.slice(0, maxChars - 1).trimEnd() + '…' : name;
}

export function dragPosition(startPosition: number, startSvgX: number, currentSvgX: number): number {
  return clamp01(startPosition + (currentSvgX - startSvgX) / CHART_WIDTH);
}

export function leaderPath(p: LabelPlacement): string {
  const s = p.anchor === 'start' ? 1 : -1;
  return `M${p.edgeX - 4 * s},${p.labelY}L${p.edgeX - 11 * s},${p.labelY}L${p.dot.x},${p.dot.y}`;
}

type Side = -1 | 1; // -1 uphill, +1 downhill

interface Row {
  scope: LabelInput;
  dot: { x: number; y: number };
  /** Dot height above the baseline. */
  height: number;
  /** Label row height above the baseline. */
  rowHeight: number;
}

/** x of the hill curve on one side at a given height above the baseline. */
function curveX(side: Side, height: number): number {
  const p = Math.asin(clamp01(height / CHART_HEIGHT)) / Math.PI;
  return PADDING + (side < 0 ? p : 1 - p) * CHART_WIDTH;
}

/**
 * Lowest dot first; each label sits level with its dot (or at `floor`, if that
 * is higher) or one pitch above the label below.
 */
function stackRows(group: LabelInput[], pitch: number, floor: (row: Row) => number = () => 0): Row[] {
  const rows = group
    .map((scope) => {
      const dot = positionToPoint(scope.position);
      return { scope, dot, height: BASELINE_Y - dot.y, rowHeight: 0 };
    })
    .sort((a, b) => a.height - b.height || a.scope.position - b.scope.position);
  rows.forEach((row, i) => {
    const wanted = Math.max(row.height, floor(row));
    row.rowHeight = i === 0 ? wanted : Math.max(wanted, rows[i - 1].rowHeight + pitch);
  });
  return rows;
}

/** Longest version of a name that fits between a label's text edge and the chart edge. */
function fitToChart(name: string, edgeX: number, anchor: 'start' | 'end', charWidth: number, atLeast: number): string {
  const room = anchor === 'end' ? edgeX : SVG_WIDTH - edgeX;
  return truncateName(name, Math.max(atLeast, Math.floor(room / charWidth)));
}

/**
 * Places every scope label so none overlaps another label, a dot or the curve.
 * Near the base of each side labels sit inside the hill; higher up they sit
 * outside it. Crowded labels step upward.
 */
export function layoutLabels(scopes: LabelInput[]): LabelLayout {
  const sides = ([-1, 1] as Side[]).map((side) => {
    const own = scopes.filter((s) => (side < 0 ? s.position < 0.5 : s.position >= 0.5));
    const up = (s: LabelInput) => (side < 0 ? s.position : 1 - s.position);
    // The epsilon keeps 0.78 (1 - 0.78 = 0.2199…) on the outside, like 0.22.
    const isInside = (s: LabelInput) => up(s) < LABEL_SWITCH - 1e-9;
    return { side, inside: own.filter(isInside), outside: own.filter((s) => !isInside(s)) };
  });

  const placements: LabelPlacement[] = [];
  let highestOutsideRow = 0;

  sides.forEach(({ side, inside, outside }, index) => {
    const otherHasInside = sides[1 - index].inside.length > 0;

    // Tighten the row pitch until the outside stack fits in the reserved headroom.
    const outsideLimit = BASELINE_Y - 12 + LABEL_HEADROOM;
    let outsidePitch = LABEL_ROW;
    // Near the crest the curve is almost flat, so a label level with its dot
    // would sit on the hill line. Keep its text 9px above the curve at its near end.
    const clearOfCurve = (row: Row) => {
      const edge = row.dot.x + side * LABEL_GAP;
      return BASELINE_Y - positionToPoint(clamp01((edge - PADDING) / CHART_WIDTH)).y + 9;
    };
    let outsideRows = stackRows(outside, outsidePitch, clearOfCurve);
    while (
      outsidePitch > LABEL_ROW_MIN &&
      outsideRows.length > 0 &&
      outsideRows[outsideRows.length - 1].rowHeight > outsideLimit
    ) {
      outsidePitch -= 1;
      outsideRows = stackRows(outside, outsidePitch, clearOfCurve);
    }
    for (const row of outsideRows) {
      highestOutsideRow = Math.max(highestOutsideRow, row.rowHeight);
      const text = truncateName(row.scope.name, LABEL_MAX_CHARS);
      const edgeX = row.dot.x + side * LABEL_GAP;
      const anchor = side < 0 ? 'end' : 'start';
      placements.push({
        id: row.scope.id,
        dot: row.dot,
        labelY: BASELINE_Y - row.rowHeight,
        edgeX,
        anchor,
        text,
        fullText: fitToChart(row.scope.name, edgeX, anchor, outsidePitch < 16 ? 5.9 : 6.4, text.length),
        truncated: text !== row.scope.name,
        small: outsidePitch < 16,
      });
    }

    // Tighten the row pitch until the inside stack fits under the crest.
    let pitch = LABEL_ROW;
    let rows = stackRows(inside, pitch);
    while (pitch > LABEL_ROW_MIN && rows.length > 0 && rows[rows.length - 1].rowHeight > CHART_HEIGHT - 20) {
      pitch -= 1;
      rows = stackRows(inside, pitch);
    }
    const small = pitch < 16;
    const charWidth = small ? 5.9 : 6.4;
    const farthestIn = side < 0 ? Math.max : Math.min;

    // Rows that touch share one text edge: a column far enough into the hill
    // that its top row is still under the curve.
    let start = 0;
    while (start < rows.length) {
      let end = start;
      while (end + 1 < rows.length && rows[end + 1].rowHeight - rows[end].rowHeight < pitch + 0.5) end++;
      const run = rows.slice(start, end + 1);
      const edgeX = run.reduce(
        (x, row) => farthestIn(x, row.dot.x - side * LABEL_GAP),
        curveX(side, run[run.length - 1].rowHeight + 10) - side * 14,
      );
      for (const row of run) {
        const limit = otherHasInside
          ? MID_X + side * 8
          : curveX(-side as Side, row.rowHeight + 10) + side * 12;
        const maxChars = Math.max(6, Math.floor(Math.abs(limit - edgeX) / charWidth));
        const text = truncateName(row.scope.name, Math.min(LABEL_MAX_CHARS, maxChars));
        const anchor = side < 0 ? 'start' : 'end';
        placements.push({
          id: row.scope.id,
          dot: row.dot,
          labelY: BASELINE_Y - row.rowHeight,
          edgeX,
          anchor,
          text,
          fullText: fitToChart(row.scope.name, edgeX, anchor, charWidth, text.length),
          truncated: text !== row.scope.name,
          small,
        });
      }
      start = end + 1;
    }
  });

  return { placements, extraTop: Math.max(0, Math.ceil(highestOutsideRow - (BASELINE_Y - 12))) };
}
