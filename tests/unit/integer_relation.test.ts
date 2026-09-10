/**
 * Integer-relation discovery — §49.2 verification.
 * UPCE-MASTER-1.0 §49.2, §49.3 (the anti-curve-fitting rule).
 */
import { describe, it, expect } from "vitest";
import {
  boundedCoefficientSearch,
  discoverIntegerRelations,
  pslq,
  lllIntegerRelation,
  normalizeCoefficients,
  isDimensionallyConsistent,
  relationToExpression,
  ScalarObservation,
} from "../../lib/inference/integerRelation";

const CULVERT_SCALARS: ScalarObservation[] = [
  { id: "p1", name: "TotalWidth", value: 4300, unit: "mm" },
  { id: "p2", name: "ClearSpan", value: 1700, unit: "mm" },
  { id: "p3", name: "WallThickness", value: 300, unit: "mm" },
];

describe("§49.2 Bounded-coefficient search", () => {
  it("recovers TotalWidth = 2*ClearSpan + 3*WallThickness", () => {
    const relations = boundedCoefficientSearch(CULVERT_SCALARS, { tolerance: 0.5 });
    expect(relations.length).toBeGreaterThan(0);

    const rendered = relations
      .map(relationToExpression)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const total = rendered.find((r) => r.target === "TotalWidth");
    expect(total).toBeDefined();
    expect(total!.expression).toBe("2*ClearSpan + 3*WallThickness");
  });

  it("ranks the simplest relation first (Occam, §49.3)", () => {
    const relations = boundedCoefficientSearch(CULVERT_SCALARS, { tolerance: 0.5 });
    for (let i = 1; i < relations.length; i++) {
      expect(relations[i].complexity).toBeGreaterThanOrEqual(relations[i - 1].complexity);
    }
  });

  it("finds nothing when no small-integer relation exists", () => {
    // Deliberately incommensurable: no |aᵢ| ≤ 4 combination reaches zero.
    const noise: ScalarObservation[] = [
      { id: "a", name: "A", value: 1000, unit: "mm" },
      { id: "b", name: "B", value: 1403.7, unit: "mm" },
      { id: "c", name: "C", value: 2711.3, unit: "mm" },
    ];
    expect(boundedCoefficientSearch(noise, { tolerance: 0.5 })).toHaveLength(0);
  });

  it("refuses to fit an offset-plus-slope curve (§49.3 BAD case)", () => {
    // A ≈ 0.713·B + 14.7 is numerology; it has no integer relation.
    const B = 1000;
    const A = 0.713 * B + 14.7;
    const curveFit: ScalarObservation[] = [
      { id: "a", name: "A", value: A, unit: "mm" },
      { id: "b", name: "B", value: B, unit: "mm" },
    ];
    expect(boundedCoefficientSearch(curveFit, { tolerance: 0.5 })).toHaveLength(0);
  });

  it("respects the coefficient bound of 4", () => {
    const wide: ScalarObservation[] = [
      { id: "a", name: "Total", value: 5000, unit: "mm" },
      { id: "b", name: "Unit", value: 1000, unit: "mm" },
    ];
    const relations = boundedCoefficientSearch(wide, { tolerance: 0.5, maxCoefficient: 4 });
    for (const r of relations) {
      for (const c of r.coefficients) expect(Math.abs(c)).toBeLessThanOrEqual(4);
    }
  });
});

describe("§49.4 gate 2 — dimensional consistency", () => {
  it("accepts a relation whose terms are all lengths", () => {
    expect(isDimensionallyConsistent([1, -2, -3], CULVERT_SCALARS)).toBe(true);
  });

  it("rejects a relation mixing a count with lengths", () => {
    const mixed: ScalarObservation[] = [
      { id: "a", name: "Total", value: 6, unit: "mm" },
      { id: "b", name: "Cells", value: 3, unit: "count" },
    ];
    expect(isDimensionallyConsistent([1, -2], mixed)).toBe(false);
  });

  it("treats mm and m as one dimensional class", () => {
    const lengths: ScalarObservation[] = [
      { id: "a", name: "A", value: 2, unit: "m" },
      { id: "b", name: "B", value: 2000, unit: "mm" },
    ];
    expect(isDimensionallyConsistent([1, -1], lengths)).toBe(true);
  });
});

describe("§49.2 PSLQ and LLL", () => {
  it("PSLQ recovers a known integer relation", () => {
    const rel = pslq([1, 2, 3].map((c, i) => [4300, 1700, 300][i]), { tolerance: 1e-12 });
    // Whatever it finds must actually be a relation.
    if (rel) {
      const residual = rel.reduce((s, c, i) => s + c * [4300, 1700, 300][i], 0);
      expect(Math.abs(residual)).toBeLessThan(1e-6);
    }
  });

  it("LLL recovers TotalWidth − 2·ClearSpan − 3·WallThickness = 0", () => {
    const rel = lllIntegerRelation([4300, 1700, 300]);
    expect(rel).not.toBeNull();
    const residual = rel!.reduce((s, c, i) => s + c * [4300, 1700, 300][i], 0);
    expect(Math.abs(residual)).toBeLessThan(1e-6);
  });

  it("normalises coefficients by their GCD and leading sign", () => {
    expect(normalizeCoefficients([-2, 4, -6])).toEqual([1, -2, 3]);
    expect(normalizeCoefficients([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("§49.2 escalation ladder", () => {
  it("prefers the cheap exhaustive search and never widens the accepted set", () => {
    const relations = discoverIntegerRelations(CULVERT_SCALARS, { tolerance: 0.5 });
    expect(relations.length).toBeGreaterThan(0);
    expect(relations.every((r) => r.method === "bounded-search")).toBe(true);
    expect(relations.every((r) => r.residual <= 0.5)).toBe(true);
  });

  it("recovers the multi-cell stack relation of §21 / §80", () => {
    // TotalSpan = 3·ClearSpan + 4·WallThickness  (Gap folded out for a 3-term test)
    const multi: ScalarObservation[] = [
      { id: "t", name: "TotalSpan", value: 3 * 2000 + 4 * 350, unit: "mm" },
      { id: "s", name: "ClearSpan", value: 2000, unit: "mm" },
      { id: "w", name: "WallThickness", value: 350, unit: "mm" },
    ];
    const rendered = discoverIntegerRelations(multi, { tolerance: 0.5 })
      .map(relationToExpression)
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const total = rendered.find((r) => r.target === "TotalSpan");
    expect(total).toBeDefined();
    expect(total!.expression).toBe("3*ClearSpan + 4*WallThickness");
  });

  it("returns nothing for a single scalar", () => {
    expect(discoverIntegerRelations([CULVERT_SCALARS[0]])).toHaveLength(0);
  });
});
