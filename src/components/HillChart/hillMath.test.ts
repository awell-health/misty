import { describe, it, expect } from 'vitest';
import {
  positionToPoint,
  generateHillPath,
  svgXToPosition,
  SVG_WIDTH,
  SVG_HEIGHT,
  PADDING,
  CHART_WIDTH,
  LABEL_GAP,
  LABEL_ROW,
  LABEL_ROW_MIN,
  LABEL_HEADROOM,
  truncateName,
  layoutLabels,
  leaderPath,
  dragPosition,
  type LabelLayout,
} from './hillMath';

describe('positionToPoint', () => {
  it('maps position 0 to the left baseline', () => {
    const { x, y } = positionToPoint(0);
    expect(x).toBe(PADDING);
    expect(y).toBe(SVG_HEIGHT - PADDING);
  });

  it('maps position 1 to the right baseline', () => {
    const { x, y } = positionToPoint(1);
    expect(x).toBe(PADDING + CHART_WIDTH);
    expect(y).toBeCloseTo(SVG_HEIGHT - PADDING, 5);
  });

  it('maps position 0.5 to the top of the hill', () => {
    const { x, y } = positionToPoint(0.5);
    expect(x).toBe(PADDING + CHART_WIDTH / 2);
    expect(y).toBe(PADDING);
  });

  it('maps position 0.25 to a point on the left slope', () => {
    const { x, y } = positionToPoint(0.25);
    expect(x).toBe(PADDING + CHART_WIDTH * 0.25);
    expect(y).toBeGreaterThan(PADDING);
    expect(y).toBeLessThan(SVG_HEIGHT - PADDING);
  });
});

describe('svgXToPosition', () => {
  it('converts left edge to 0', () => {
    expect(svgXToPosition(PADDING)).toBe(0);
  });

  it('converts right edge to 1', () => {
    expect(svgXToPosition(PADDING + CHART_WIDTH)).toBe(1);
  });

  it('converts midpoint to 0.5', () => {
    expect(svgXToPosition(PADDING + CHART_WIDTH / 2)).toBeCloseTo(0.5);
  });

  it('clamps values below 0', () => {
    expect(svgXToPosition(0)).toBe(0);
    expect(svgXToPosition(-100)).toBe(0);
  });

  it('clamps values above 1', () => {
    expect(svgXToPosition(SVG_WIDTH + 100)).toBe(1);
  });
});

describe('generateHillPath', () => {
  it('returns a valid SVG path string', () => {
    const path = generateHillPath();
    expect(path).toMatch(/^M[\d.]+,[\d.]+/);
    expect(path).toContain('L');
  });

  it('starts with M (moveto)', () => {
    const path = generateHillPath();
    expect(path[0]).toBe('M');
  });
});

describe('positionToPoint and svgXToPosition roundtrip', () => {
  it('roundtrips through position -> x -> position', () => {
    for (const pos of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const { x } = positionToPoint(pos);
      const result = svgXToPosition(x);
      expect(result).toBeCloseTo(pos, 10);
    }
  });
});

const mk = (positions: number[], name = 'Scope') =>
  positions.map((position, i) => ({ id: 's' + i, name, position }));
const by = (l: LabelLayout, id: string) => l.placements.find((p) => p.id === id)!;

describe('truncateName', () => {
  it('keeps short names', () => expect(truncateName('V2 Docs', 26)).toBe('V2 Docs'));
  it('cuts to maxChars including the ellipsis', () => {
    const out = truncateName('Moving Langsmith -> Phoenix + Aegra', 26);
    expect(out.length).toBe(26);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('layoutLabels', () => {
  it('returns nothing for no scopes', () =>
    expect(layoutLabels([])).toEqual({ placements: [], extraTop: 0 }));

  it('puts a lone mid-slope uphill label outside, level with its dot', () => {
    const p = by(layoutLabels(mk([0.3])), 's0');
    expect(p.anchor).toBe('end');
    expect(p.edgeX).toBeCloseTo(p.dot.x - LABEL_GAP);
    expect(p.labelY).toBeCloseTo(p.dot.y);
  });

  it('mirrors on the downhill side', () => {
    const p = by(layoutLabels(mk([0.7])), 's0');
    expect(p.anchor).toBe('start');
    expect(p.edgeX).toBeCloseTo(p.dot.x + LABEL_GAP);
  });

  it('puts base labels inside the hill', () => {
    const l = layoutLabels(mk([0.1, 0.9]));
    expect(by(l, 's0').anchor).toBe('start'); // uphill base: text runs right, into the hill
    expect(by(l, 's1').anchor).toBe('end');
  });

  it('assigns boundary positions to exactly one group', () => {
    const l = layoutLabels(mk([0.22, 0.5, 0.78]));
    expect(l.placements).toHaveLength(3);
    expect(by(l, 's0').anchor).toBe('end'); // 0.22 is outside, uphill
    expect(by(l, 's1').anchor).toBe('start'); // 0.5 counts as downhill
    expect(by(l, 's2').anchor).toBe('start'); // 0.78 is outside, downhill
  });

  it('steps crowded crest labels upward, never below their dot', () => {
    const l = layoutLabels(mk([0.44, 0.46, 0.48, 0.49]));
    const ys = l.placements.map((p) => p.labelY).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_ROW - 0.01);
    for (const p of l.placements) expect(p.labelY).toBeLessThanOrEqual(p.dot.y + 0.01);
  });

  it('reports extra height only when the crest stack needs it', () => {
    expect(layoutLabels(mk([0.45, 0.48])).extraTop).toBe(0);
    expect(layoutLabels(mk([0.4, 0.42, 0.44, 0.46, 0.47, 0.48, 0.49])).extraTop).toBeGreaterThan(0);
  });

  it('fits five crest labels on one side in the reserved headroom at full row height', () => {
    const l = layoutLabels(mk([0.42, 0.44, 0.46, 0.48, 0.49]));
    expect(l.extraTop).toBeLessThanOrEqual(LABEL_HEADROOM);
    expect(l.placements.every((p) => !p.small)).toBe(true);
  });

  it('tightens crest rows before asking for more than the reserved headroom', () => {
    const l = layoutLabels(mk([0.4, 0.42, 0.44, 0.46, 0.48, 0.49]));
    expect(l.extraTop).toBeLessThanOrEqual(LABEL_HEADROOM);
    const ys = l.placements.map((p) => p.labelY).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_ROW_MIN - 0.01);
      expect(ys[i] - ys[i - 1]).toBeLessThan(LABEL_ROW);
    }
  });

  it('gives scopes at the same position separate rows', () => {
    const l = layoutLabels(mk([0, 0, 0]));
    const ys = l.placements.map((p) => p.labelY).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(LABEL_ROW - 0.01);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(LABEL_ROW - 0.01);
  });

  it('lines a crowded start up as one column under the curve', () => {
    const positions = [0, 0.01, 0.02, 0.035, 0.05, 0.065, 0.08, 0.095, 0.11, 0.125, 0.14, 0.16, 0.18, 0.2];
    const l = layoutLabels(mk(positions, 'Workbench Manage Org Data'));
    const edges = new Set(l.placements.map((p) => Math.round(p.edgeX)));
    expect(edges.size).toBe(1); // shared text edge
    expect(l.extraTop).toBe(0); // stays inside the hill
    expect(l.placements.every((p) => p.small)).toBe(true); // 14 rows need the tight pitch
    const top = Math.min(...l.placements.map((p) => p.labelY));
    expect(top).toBeGreaterThan(PADDING + 10); // below the crest
    const ys = l.placements.map((p) => p.labelY).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_ROW_MIN - 0.01);
  });

  it('keeps each side to its own half when both ends are crowded', () => {
    const l = layoutLabels(mk([0, 0.02, 0.04, 0.96, 0.98, 1], 'Workbench Manage Org Data'));
    const mid = PADDING + CHART_WIDTH / 2;
    for (const p of l.placements) {
      const width = p.text.length * 6.4;
      if (p.anchor === 'start') expect(p.edgeX + width).toBeLessThanOrEqual(mid);
      else expect(p.edgeX - width).toBeGreaterThanOrEqual(mid);
    }
  });

  it('never cuts a name below 6 characters', () => {
    const l = layoutLabels(mk(Array.from({ length: 15 }, (_, i) => i * 0.014), 'Workbench Manage Org Data'));
    for (const p of l.placements) expect(p.text.length).toBeGreaterThanOrEqual(6);
  });
});

describe('leaderPath', () => {
  it('starts 4px inside the text edge and ends at the dot', () => {
    const p = by(layoutLabels(mk([0.3])), 's0');
    expect(leaderPath(p)).toBe(`M${p.edgeX + 4},${p.labelY}L${p.edgeX + 11},${p.labelY}L${p.dot.x},${p.dot.y}`);
  });
});

describe('dragPosition', () => {
  it('moves by pointer travel, not pointer location', () =>
    expect(dragPosition(0.3, 500, 500 + CHART_WIDTH * 0.1)).toBeCloseTo(0.4));
  it('clamps to 0..1', () => {
    expect(dragPosition(0.05, 500, 0)).toBe(0);
    expect(dragPosition(0.95, 100, 800)).toBe(1);
  });
});
