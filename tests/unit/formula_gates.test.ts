/**
 * Formula candidate generation and the four mandatory validation gates.
 * UPCE-MASTER-1.0 §49.1, §49.3, §49.4.
 */
import { describe, it, expect } from "vitest";
import {
  generateDimensionStackCandidates,
  generateIntegerRelationCandidates,
  generateFormulaCandidates,
  evaluateLinearExpression,
  PerturbationSample,
} from "../../lib/inference/formulaCandidateGenerator";
import { clusterBays, BayVoid } from "../../lib/inference/bayClusterer";
import { ScalarObservation } from "../../lib/inference/integerRelation";
import { Point2D } from "../../lib/geometry/topology/types";

const rect = (x0: number, y0: number, x1: number, y1: number): Point2D[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function threeCellStack() {
  const t = 350;
  const span = 2000;
  const total = 3 * span + 4 * t;
  const voids: BayVoid[] = [];
  let x = t;
  for (let i = 0; i < 3; i++) {
    voids.push({ id: `v${i}`, points: rect(x, 300, x + span, 2700) });
    x += span + t;
  }
  return clusterBays(rect(0, 0, total, 3000), voids);
}

const SCALARS: ScalarObservation[] = [
  { id: "p1", name: "TotalWidth", value: 4300, unit: "mm" },
  { id: "p2", name: "ClearSpan", value: 1700, unit: "mm" },
  { id: "p3", name: "WallThickness", value: 300, unit: "mm" },
];

describe("Restricted linear expression evaluator", () => {
  it("evaluates the grammar it emits", () => {
    expect(evaluateLinearExpression("2*A + 3*B", { A: 10, B: 100 })).toBe(320);
    expect(evaluateLinearExpression("A - B", { A: 10, B: 4 })).toBe(6);
    expect(evaluateLinearExpression("A", { A: 7 })).toBe(7);
  });

  it("returns null rather than guessing on an unbound symbol", () => {
    expect(evaluateLinearExpression("A + B", { A: 1 })).toBeNull();
  });

  it("refuses anything outside the grammar (never eval, §21)", () => {
    expect(evaluateLinearExpression("A * B", { A: 2, B: 3 })).toBeNull();
    expect(evaluateLinearExpression("process.exit(1)", {})).toBeNull();
    expect(evaluateLinearExpression("A ** 2", { A: 2 })).toBeNull();
  });
});

describe("§49.4 — all four gates are required", () => {
  it("fails the perturbation gate when no samples are supplied", () => {
    const [candidate] = generateDimensionStackCandidates(threeCellStack());
    const gate = candidate.gates.find((g) => g.gate === "perturbation")!;
    expect(gate.passed).toBe(false);
    expect(candidate.admissible).toBe(false);
    expect(gate.detail).toContain("no perturbation samples");
  });

  it("passes all four gates when perturbation samples survive", () => {
    const stack = threeCellStack();
    const samples: PerturbationSample[] = [2000, 2200, 2500].map((span) => ({
      inputs: { ClearSpan: span, WallThickness: 350 },
      measured: { TotalSpan: 3 * span + 4 * 350, ClearSpan: span, WallThickness: 350 },
      converged: true,
    }));

    const [candidate] = generateDimensionStackCandidates(stack, { perturbations: samples });
    expect(candidate.gates.map((g) => g.gate).sort()).toEqual([
      "dimensional-consistency",
      "minimum-support",
      "perturbation",
      "tolerance",
    ]);
    expect(candidate.gates.every((g) => g.passed)).toBe(true);
    expect(candidate.admissible).toBe(true);
  });

  it("fails the perturbation gate when the relation only holds at rest", () => {
    const stack = threeCellStack();
    const samples: PerturbationSample[] = [
      {
        inputs: { ClearSpan: 2500, WallThickness: 350 },
        // Coincidental: the total did NOT follow the span.
        measured: { TotalSpan: 7400, ClearSpan: 2500, WallThickness: 350 },
        converged: true,
      },
    ];
    const [candidate] = generateDimensionStackCandidates(stack, { perturbations: samples });
    expect(candidate.gates.find((g) => g.gate === "perturbation")!.passed).toBe(false);
    expect(candidate.admissible).toBe(false);
  });

  it("fails the perturbation gate when a synthetic re-solve diverged", () => {
    const stack = threeCellStack();
    const samples: PerturbationSample[] = [
      { inputs: { ClearSpan: 9e9 }, measured: {}, converged: false },
    ];
    const [candidate] = generateDimensionStackCandidates(stack, { perturbations: samples });
    expect(candidate.gates.find((g) => g.gate === "perturbation")!.passed).toBe(false);
  });

  it("enforces minimum support", () => {
    const stack = threeCellStack();
    const samples: PerturbationSample[] = [
      {
        inputs: { ClearSpan: 2200 },
        measured: { TotalSpan: 3 * 2200 + 4 * 350, ClearSpan: 2200, WallThickness: 350 },
        converged: true,
      },
    ];
    const strict = generateDimensionStackCandidates(stack, {
      perturbations: samples,
      minimumSupport: 99,
    })[0];
    expect(strict.gates.find((g) => g.gate === "minimum-support")!.passed).toBe(false);
    expect(strict.admissible).toBe(false);
  });
});

describe("§49.1 Dimension-stack candidates", () => {
  it("produces ONE candidate carrying the whole stack, with readable evidence", () => {
    const candidates = generateDimensionStackCandidates(threeCellStack());
    expect(candidates).toHaveLength(1);
    expect(candidates[0].expression).toBe("3*ClearSpan + 4*WallThickness");
    expect(candidates[0].targetName).toBe("TotalSpan");
    expect(candidates[0].provenance).toBe("dimension-stack");
    expect(candidates[0].evidence.join(" ")).toContain("3 bays");
    expect(candidates[0].evidence.join(" ")).toContain("clustered from 4 runs");
  });

  it("closes with a residual below tolerance", () => {
    expect(generateDimensionStackCandidates(threeCellStack())[0].residual).toBeLessThan(1e-9);
  });
});

describe("§49.3 Occam ranking and the anti-curve-fitting rule", () => {
  it("scores the geometric relation above a complex one", () => {
    const samples: PerturbationSample[] = [
      {
        inputs: { ClearSpan: 1700, WallThickness: 300 },
        measured: { TotalWidth: 4300, ClearSpan: 1700, WallThickness: 300 },
        converged: true,
      },
      {
        inputs: { ClearSpan: 2000, WallThickness: 300 },
        measured: { TotalWidth: 4900, ClearSpan: 2000, WallThickness: 300 },
        converged: true,
      },
    ];
    const candidates = generateIntegerRelationCandidates(SCALARS, { perturbations: samples });
    expect(candidates.length).toBeGreaterThan(0);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i].score).toBeLessThanOrEqual(candidates[i - 1].score);
    }
  });

  it("penalises complexity in the score breakdown", () => {
    const candidates = generateIntegerRelationCandidates(SCALARS);
    for (const c of candidates) {
      expect(c.scoreBreakdown.formulaComplexity).toBeGreaterThan(0);
      expect(c.complexity).toBeGreaterThan(0);
    }
  });

  it("produces no candidate at all for a curve-fit (A ≈ 0.713·B + 14.7)", () => {
    const B = 1000;
    const noise: ScalarObservation[] = [
      { id: "a", name: "A", value: 0.713 * B + 14.7, unit: "mm" },
      { id: "b", name: "B", value: B, unit: "mm" },
    ];
    expect(generateIntegerRelationCandidates(noise)).toHaveLength(0);
  });
});

describe("Full §49 pipeline", () => {
  it("separates admissible from rejected and explains the rejection", () => {
    const stack = threeCellStack();
    const result = generateFormulaCandidates(SCALARS, stack);
    expect(result.admissible).toHaveLength(0);
    expect(result.rejected.length).toBeGreaterThan(0);
    // The rejected candidates must carry a reason the review UI can show.
    for (const c of result.rejected) {
      expect(c.gates.some((g) => !g.passed)).toBe(true);
    }
  });

  it("promotes candidates to admissible once perturbation evidence exists", () => {
    const stack = threeCellStack();
    // One coherent world per sample: both relations are re-measured against the
    // SAME perturbed inputs, which is what a real synthetic re-solve produces.
    const samples: PerturbationSample[] = [1700, 2000, 2400].map((span) => ({
      inputs: { ClearSpan: span, WallThickness: 300 },
      measured: {
        ClearSpan: span,
        WallThickness: 300,
        TotalWidth: 2 * span + 3 * 300,
        TotalSpan: 3 * span + 4 * 300,
      },
      converged: true,
    }));
    const result = generateFormulaCandidates(SCALARS, stack, { perturbations: samples });
    expect(result.admissible.length).toBeGreaterThan(0);
    const stackCandidate = result.admissible.find((c) => c.provenance === "dimension-stack");
    expect(stackCandidate).toBeDefined();
    expect(stackCandidate!.targetName).toBe("TotalSpan");
    expect(stackCandidate!.expression).toBe("3*ClearSpan + 4*WallThickness");
  });

  it("deduplicates identical expressions across both generators", () => {
    const result = generateFormulaCandidates(SCALARS, threeCellStack());
    const keys = [...result.admissible, ...result.rejected].map(
      (c) => `${c.targetName}=${c.expression}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
