/**
 * Branch Control — §31 verification.
 * UPCE-MASTER-1.0 §31.1–§31.6, §75.6 (continuity), §87 (risk guardrails).
 */
import { describe, it, expect } from "vitest";
import {
  chiralityBarrier,
  degeneracyBarrier,
  evaluateBarrierPotential,
  detectSelfIntersections,
  isTopologicallyValid,
  segmentsProperlyIntersect,
  analyzeConditioning,
  CONDITION_NUMBER_LIMIT,
  planHomotopySubSteps,
  solveWithHomotopy,
  DEFAULT_HOMOTOPY_MAX_DELTA,
  Segment2D,
} from "../../lib/solver/branchControl";
import { SystemModel, LMSolverResult } from "../../lib/solver/levenbergMarquardt";
import { solveDogleg } from "../../lib/solver/dogleg";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";

const CCW_SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("§31.2 Chirality barrier", () => {
  it("contributes nothing to a healthy configuration", () => {
    const t = chiralityBarrier(CCW_SQUARE, 1, { activation: 1000 });
    expect(t.active).toBe(false);
    expect(t.potential).toBe(0);
    expect(t.quantity).toBeCloseTo(10000, 6);
  });

  it("returns an infinite potential once the loop has inverted", () => {
    const reversed = [...CCW_SQUARE].reverse();
    const t = chiralityBarrier(reversed, 1, { activation: 1000 });
    expect(t.active).toBe(true);
    expect(Number.isFinite(t.potential)).toBe(false);
  });

  it("rises monotonically as the signed area collapses toward zero", () => {
    const wide = chiralityBarrier(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 10 },
        { x: 0, y: 10 },
      ],
      1,
      { activation: 5000, mu: 1 }
    );
    const narrow = chiralityBarrier(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 1 },
        { x: 0, y: 1 },
      ],
      1,
      { activation: 5000, mu: 1 }
    );
    expect(narrow.potential).toBeGreaterThan(wide.potential);
    expect(wide.active).toBe(true);
  });
});

describe("§31.3 Degeneracy barrier", () => {
  it("is inactive at a healthy edge length", () => {
    const t = degeneracyBarrier({ x: 0, y: 0 }, { x: 50, y: 0 }, { activation: 1 });
    expect(t.active).toBe(false);
    expect(t.quantity).toBeCloseTo(50, 9);
  });

  it("blows up as an edge collapses", () => {
    const t = degeneracyBarrier({ x: 0, y: 0 }, { x: 0.001, y: 0 }, { activation: 1, mu: 1 });
    expect(t.active).toBe(true);
    expect(t.potential).toBeGreaterThan(6);
  });

  it("aggregates loops and names the offending one", () => {
    const bad = evaluateBarrierPotential(
      [{ vertices: [...CCW_SQUARE].reverse(), initialSign: 1 }],
      { activation: 1000 }
    );
    expect(Number.isFinite(bad.total)).toBe(false);
    expect(bad.violations[0]).toContain("chirality inverted");
  });
});

describe("§31.4 Bentley–Ottmann self-intersection sweep", () => {
  it("accepts a simple closed polygon", () => {
    const segs: Segment2D[] = CCW_SQUARE.map((p, i) => ({
      id: `s${i}`,
      a: p,
      b: CCW_SQUARE[(i + 1) % CCW_SQUARE.length],
    }));
    expect(detectSelfIntersections(segs)).toHaveLength(0);
    expect(isTopologicallyValid(segs)).toBe(true);
  });

  it("detects a crossing (bow-tie) configuration", () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    const segs: Segment2D[] = bowtie.map((p, i) => ({
      id: `s${i}`,
      a: p,
      b: bowtie[(i + 1) % bowtie.length],
    }));
    const hits = detectSelfIntersections(segs);
    expect(hits.length).toBeGreaterThan(0);
    expect(isTopologicallyValid(segs)).toBe(false);
  });

  it("does not report adjacent segments that merely share an endpoint", () => {
    const a: Segment2D = { id: "a", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
    const b: Segment2D = { id: "b", a: { x: 10, y: 0 }, b: { x: 10, y: 10 } };
    expect(segmentsProperlyIntersect(a, b, 0.5)).toBeNull();
  });

  it("reports a T-junction where an endpoint lands mid-segment", () => {
    const a: Segment2D = { id: "a", a: { x: 0, y: 0 }, b: { x: 20, y: 0 } };
    const b: Segment2D = { id: "b", a: { x: 10, y: 0 }, b: { x: 10, y: 10 } };
    const hit = segmentsProperlyIntersect(a, b, 0.5);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(10, 6);
  });

  it("finds the same crossing when the whole assembly is rotated", () => {
    const rotate = (p: { x: number; y: number }, t: number) => ({
      x: p.x * Math.cos(t) - p.y * Math.sin(t),
      y: p.x * Math.sin(t) + p.y * Math.cos(t),
    });
    const bowtie = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    for (const deg of [0, 15, 37, 45]) {
      const t = (deg * Math.PI) / 180;
      const segs: Segment2D[] = bowtie.map((p, i) => ({
        id: `s${i}`,
        a: rotate(p, t),
        b: rotate(bowtie[(i + 1) % bowtie.length], t),
      }));
      expect(detectSelfIntersections(segs).length).toBeGreaterThan(0);
    }
  });
});

describe("§31.6 Condition-number thresholding", () => {
  it("reports a well-conditioned Jacobian as healthy with no damping floor", () => {
    const r = analyzeConditioning([
      [1, 0],
      [0, 1],
    ]);
    expect(r.rank).toBe(2);
    expect(r.conditionNumber).toBeCloseTo(1, 6);
    expect(r.illConditioned).toBe(false);
    expect(r.lambdaFloor).toBe(0);
  });

  it("flags κ(J) > 1e8 and returns a positive λ floor", () => {
    // 1e-9 sits ABOVE the 1e-10 rank cutoff, so this is an ill-conditioned
    // full-rank system, not a rank-deficient one (which min-norm handles).
    const r = analyzeConditioning([
      [1, 0],
      [0, 1e-9],
    ]);
    expect(r.conditionNumber).toBeGreaterThan(CONDITION_NUMBER_LIMIT);
    expect(r.illConditioned).toBe(true);
    expect(r.lambdaFloor).toBeGreaterThan(0);
  });

  it("keeps the damped condition number at or below the limit", () => {
    const r = analyzeConditioning([
      [1e3, 0],
      [0, 1e-6],
    ]);
    const damped = (r.sigmaMax ** 2 + r.lambdaFloor) / (r.sigmaMin ** 2 + r.lambdaFloor);
    expect(damped).toBeLessThanOrEqual(CONDITION_NUMBER_LIMIT * 1.000001);
  });
});

describe("§31.5 Homotopy sub-stepping", () => {
  it("uses one step when the change is within ΔL ≤ 500 mm", () => {
    expect(planHomotopySubSteps({ L: 2000 }, { L: 2400 })).toBe(1);
  });

  it("splits a 2 m → 20 m span change into ΔL ≤ 500 mm increments", () => {
    const n = planHomotopySubSteps({ L: 2000 }, { L: 20000 });
    expect(n).toBe(36);
    expect(18000 / n).toBeLessThanOrEqual(DEFAULT_HOMOTOPY_MAX_DELTA);
  });

  it("converges a 2 m → 20 m span change that a single step would not", () => {
    // The spec's own example (§31.5): a span change from 2.0 m to 20.0 m in one
    // step can diverge. The residual is a real distance constraint,
    // r = ‖P − A‖ − L, anchored at the origin and driven along +x.
    const build = (targets: Record<string, number>): SystemModel => ({
      evaluateResiduals: (X) => [Math.hypot(X[0], X[1]) - targets.Span, X[1]],
      evaluateJacobian: (X) => {
        const L = Math.max(Math.hypot(X[0], X[1]), 1e-12);
        return [
          [X[0] / L, X[1] / L],
          [0, 1],
        ];
      },
    });

    const single = solveDogleg(build({ Span: 20000 }), [2000, 0], { maxIterations: 4 });
    const staged = solveWithHomotopy(
      { Span: 2000 },
      { Span: 20000 },
      [2000, 0],
      build,
      (model, x0) => solveDogleg(model, x0, { maxIterations: 40 }),
      { maxDelta: DEFAULT_HOMOTOPY_MAX_DELTA }
    );

    expect(staged.converged).toBe(true);
    expect(staged.subStepCount).toBe(36);
    expect(staged.solution[0]).toBeCloseTo(20000, 6);
    expect(staged.failedAt).toBeNull();
    expect(staged.steps.every((s) => s.converged)).toBe(true);
    // Each sub-step moves at most ΔL, which is the whole point of §31.5.
    expect(18000 / staged.subStepCount).toBeLessThanOrEqual(DEFAULT_HOMOTOPY_MAX_DELTA);
    // And the single-shot attempt with the same tight budget does not get there.
    expect(single.solution[0]).not.toBeCloseTo(20000, 6);
  });

  it("reports the sub-step at which continuation failed instead of silently succeeding", () => {
    const build = (): SystemModel => ({
      // Unsatisfiable: x² + 1 = 0 has no real root.
      evaluateResiduals: (X) => [X[0] * X[0] + 1],
      evaluateJacobian: (X) => [[2 * X[0]]],
    });
    const failing: LMSolverResult = {
      converged: false,
      solution: [1],
      iterations: 3,
      residualNorm: 1,
      maxResidual: 1,
      status: "stagnated",
    };

    const result = solveWithHomotopy(
      { T: 0 },
      { T: 5000 },
      [1],
      build,
      () => failing,
      { maxDelta: 500 }
    );

    expect(result.converged).toBe(false);
    expect(result.failedAt).toBe(1);
    expect(result.status).toBe("diverged");
  });

  it("preserves the tolerance policy's residual threshold as the acceptance bar", () => {
    // Guards the §27 rule: convergence is on residual, never on step size.
    expect(DEFAULT_TOLERANCE_POLICY.solver_residual).toBe(1e-8);
  });
});
