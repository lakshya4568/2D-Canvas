/**
 * Bay clustering — the §80 multi-cell failure, closed.
 * UPCE-MASTER-1.0 §48.3, §49.1, §80, and Clause 6 (no bounding boxes).
 */
import { describe, it, expect } from "vitest";
import {
  clusterBays,
  clusterMeasurements,
  deriveStackingAxis,
  BayVoid,
} from "../../lib/inference/bayClusterer";
import { Point2D } from "../../lib/geometry/topology/types";

const rect = (x0: number, y0: number, x1: number, y1: number): Point2D[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const rotate = (pts: Point2D[], deg: number): Point2D[] => {
  const t = (deg * Math.PI) / 180;
  return pts.map((p) => ({
    x: p.x * Math.cos(t) - p.y * Math.sin(t),
    y: p.x * Math.sin(t) + p.y * Math.cos(t),
  }));
};

/**
 * A three-cell culvert: 350 mm end walls, 2000 mm bays, 350 mm interior webs.
 * TotalSpan = 3·2000 + 4·350 = 7400 mm.
 */
function threeCellCulvert(): { outer: Point2D[]; voids: BayVoid[]; total: number } {
  const t = 350;
  const span = 2000;
  const total = 3 * span + 4 * t;
  const outer = rect(0, 0, total, 3000);
  const voids: BayVoid[] = [];
  let x = t;
  for (let i = 0; i < 3; i++) {
    voids.push({ id: `void_${i}`, points: rect(x, 350, x + span, 2650) });
    x += span + t;
  }
  return { outer, voids, total };
}

describe("§42 1-D clustering", () => {
  it("collapses near-equal measurements into one card", () => {
    const clusters = clusterMeasurements(
      [
        { value: 299.6, ref: "a" },
        { value: 300.1, ref: "b" },
        { value: 300.0, ref: "c" },
        { value: 299.8, ref: "d" },
      ],
      1.0
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].mean).toBeCloseTo(299.875, 6);
    expect(clusters[0].members).toHaveLength(4);
    expect(clusters[0].deviation).toBeCloseTo(0.5, 6);
  });

  it("keeps genuinely different values apart", () => {
    const clusters = clusterMeasurements(
      [
        { value: 300, ref: "a" },
        { value: 350, ref: "b" },
      ],
      1.0
    );
    expect(clusters).toHaveLength(2);
  });
});

describe("§80 The multi-cell failure, closed", () => {
  it("recognises three bays and emits ONE parameter set, not eleven cards", () => {
    const { outer, voids, total } = threeCellCulvert();
    const result = clusterBays(outer, voids);

    expect(result.recognised).toBe(true);
    expect(result.bayCount).toBe(3);
    expect(result.totalSpan).toBeCloseTo(total, 6);
    expect(result.closureResidual).toBeLessThan(1e-9);

    // §80: the old engine showed ELEVEN disjoint cards. This must be a handful.
    expect(result.parameters.length).toBeLessThanOrEqual(3);

    const names = result.parameters.map((p) => p.name).sort();
    expect(names).toEqual(["ClearSpan", "TotalSpan", "WallThickness"]);
  });

  it("produces the canonical stack relation TotalSpan = N*ClearSpan + (N+1)*WallThickness", () => {
    const { outer, voids } = threeCellCulvert();
    const result = clusterBays(outer, voids);
    expect(result.stackExpression).toBe("3*ClearSpan + 4*WallThickness");
  });

  it("recognises the intermediate web as WallThickness, not an apparent clearance", () => {
    // §80's exact failure: Void 1's 'apparent right clearance' spanned Void 2
    // plus the external wall. Here every solid run clusters to one 350 mm value.
    const { outer, voids } = threeCellCulvert();
    const result = clusterBays(outer, voids);
    const wall = result.parameters.find((p) => p.name === "WallThickness")!;
    expect(wall.value).toBeCloseTo(350, 6);
    // 2 end walls + 2 interior webs = 4 occurrences, one card.
    expect(wall.occurrences).toBe(4);
    expect(wall.deviation).toBeLessThan(1e-9);
  });

  it("separates a thin inter-cell gap from a structural web (Appendix D)", () => {
    // RDSO: 350 mm web with a 10 mm gap beside it.
    const t = 350;
    const gap = 10;
    const span = 2000;
    const total = 2 * span + 2 * t + gap;
    const outer = rect(0, 0, total, 3000);
    const voids: BayVoid[] = [
      { id: "v0", points: rect(t, 300, t + span, 2700) },
      { id: "v1", points: rect(t + span + gap, 300, t + span + gap + span, 2700) },
    ];

    const result = clusterBays(outer, voids);
    expect(result.recognised).toBe(true);
    const g = result.parameters.find((p) => p.name === "Gap");
    expect(g).toBeDefined();
    expect(g!.value).toBeCloseTo(gap, 6);
    expect(result.stackExpression).toBe("2*ClearSpan + 2*WallThickness + Gap");
  });

  it("scales to N bays with a single relation each time", () => {
    for (const n of [1, 2, 3, 4, 6]) {
      const t = 350;
      const span = 2000;
      const total = n * span + (n + 1) * t;
      const outer = rect(0, 0, total, 3000);
      const voids: BayVoid[] = [];
      let x = t;
      for (let i = 0; i < n; i++) {
        voids.push({ id: `v${i}`, points: rect(x, 300, x + span, 2700) });
        x += span + t;
      }
      // A single void has no derivable stacking axis (§63): declare it.
      const r = clusterBays(outer, voids, n === 1 ? { axis: { x: 1, y: 0 } } : {});
      expect(r.bayCount).toBe(n);
      expect(r.totalSpan).toBeCloseTo(total, 6);
      expect(r.parameters.length).toBeLessThanOrEqual(3);
      const expected =
        n === 1 ? `ClearSpan + ${n + 1}*WallThickness` : `${n}*ClearSpan + ${n + 1}*WallThickness`;
      expect(r.stackExpression).toBe(expected);
    }
  });
});

describe("Clause 6 — rotation invariance, no bounding boxes", () => {
  it("derives the stacking axis from the voids, not the world X axis", () => {
    const { voids } = threeCellCulvert();
    const axis0 = deriveStackingAxis(voids);
    expect(axis0.x).toBeCloseTo(1, 6);
    expect(axis0.y).toBeCloseTo(0, 6);

    const rotated = voids.map((v) => ({ id: v.id, points: rotate(v.points, 37) }));
    const axis37 = deriveStackingAxis(rotated);
    expect(axis37.x).toBeCloseTo(Math.cos((37 * Math.PI) / 180), 6);
    expect(axis37.y).toBeCloseTo(Math.sin((37 * Math.PI) / 180), 6);
  });

  it("produces identical parameters at 0°, 15°, 37° and 45°", () => {
    const { outer, voids } = threeCellCulvert();
    const reference = clusterBays(outer, voids);

    for (const deg of [15, 37, 45]) {
      const r = clusterBays(
        rotate(outer, deg),
        voids.map((v) => ({ id: v.id, points: rotate(v.points, deg) }))
      );
      expect(r.recognised).toBe(true);
      expect(r.bayCount).toBe(reference.bayCount);
      expect(r.stackExpression).toBe(reference.stackExpression);
      expect(r.totalSpan).toBeCloseTo(reference.totalSpan, 6);

      for (const p of reference.parameters) {
        const match = r.parameters.find((q) => q.name === p.name);
        expect(match, `${p.name} missing at ${deg}°`).toBeDefined();
        expect(match!.value).toBeCloseTo(p.value, 6);
        expect(match!.occurrences).toBe(p.occurrences);
      }
    }
  });
});

describe("§63 Single-void axis ambiguity is surfaced, not guessed", () => {
  it("flags the ambiguity when one void gives no derivable axis", () => {
    const outer = rect(0, 0, 2700, 3000);
    const voids: BayVoid[] = [{ id: "v", points: rect(350, 300, 2350, 2700) }];
    const r = clusterBays(outer, voids);
    expect(r.recognised).toBe(true);
    expect(r.axisAmbiguous).toBe(true);
  });

  it("honours an explicitly declared axis and clears the ambiguity flag", () => {
    const outer = rect(0, 0, 2700, 3000);
    const voids: BayVoid[] = [{ id: "v", points: rect(350, 300, 2350, 2700) }];

    const horizontal = clusterBays(outer, voids, { axis: { x: 1, y: 0 } });
    expect(horizontal.axisAmbiguous).toBe(false);
    expect(horizontal.totalSpan).toBeCloseTo(2700, 6);
    expect(horizontal.parameters.find((p) => p.name === "ClearSpan")!.value).toBeCloseTo(2000, 6);

    const vertical = clusterBays(outer, voids, { axis: { x: 0, y: 1 } });
    expect(vertical.totalSpan).toBeCloseTo(3000, 6);
    expect(vertical.parameters.find((p) => p.name === "ClearSpan")!.value).toBeCloseTo(2400, 6);
  });

  it("never flags ambiguity once two or more voids fix the axis", () => {
    const { outer, voids } = threeCellCulvert();
    expect(clusterBays(outer, voids).axisAmbiguous).toBe(false);
  });
});

describe("Graceful refusal", () => {
  it("refuses overlapping voids rather than inventing a stack", () => {
    const outer = rect(0, 0, 5000, 3000);
    const voids: BayVoid[] = [
      { id: "a", points: rect(300, 300, 3000, 2700) },
      { id: "b", points: rect(2000, 300, 4700, 2700) },
    ];
    const r = clusterBays(outer, voids);
    expect(r.recognised).toBe(false);
    expect(r.diagnostic).toContain("overlap");
  });

  it("refuses an empty void set", () => {
    const r = clusterBays(rect(0, 0, 100, 100), []);
    expect(r.recognised).toBe(false);
    expect(r.diagnostic).toContain("No interior voids");
  });

  it("refuses a degenerate boundary", () => {
    const r = clusterBays([{ x: 0, y: 0 }], [{ id: "v", points: rect(1, 1, 2, 2) }]);
    expect(r.recognised).toBe(false);
  });
});
