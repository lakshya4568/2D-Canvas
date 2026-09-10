/**
 * Solver-as-verifier and stability sweeps.
 * UPCE-MASTER-1.0 §51 (the adopted half of arXiv 2504.13178) and §75.7.
 */
import { describe, it, expect } from "vitest";
import {
  computeStability,
  verifyUnderPerturbation,
  generateSweepSamples,
  VerificationSolveResult,
} from "../../lib/inference/solverVerifier";

const ok = (coords: number[]): VerificationSolveResult => ({
  converged: true,
  maxResidual: 1e-12,
  status: "FC",
  coordinates: coords,
});

describe("§51 Stability metric", () => {
  it("reports zero displacement for an unchanged configuration", () => {
    const s = computeStability([0, 0, 100, 0], [0, 0, 100, 0], 2);
    expect(s.maxDisplacement).toBe(0);
    expect(s.jumpedCells).toBe(0);
    expect(s.stable).toBe(true);
  });

  it("counts primitives that jumped a grid cell", () => {
    const s = computeStability([0, 0, 100, 0], [0, 0, 140, 0], 2, 0);
    expect(s.maxDisplacement).toBeCloseTo(40, 9);
    expect(s.jumpedCells).toBe(1);
    expect(s.stable).toBe(false);
  });

  it("treats motion the edit legitimately required as stable", () => {
    const s = computeStability([0, 0, 100, 0], [0, 0, 140, 0], 2, 40);
    expect(s.stable).toBe(true);
    expect(s.jumpedCells).toBe(0);
  });

  it("handles a length mismatch without throwing", () => {
    const s = computeStability([0, 0], [0, 0, 1, 1], 2);
    expect(s.stable).toBe(false);
  });
});

describe("§51 Verifier loop", () => {
  const reference = [0, 0, 2000, 0];

  it("passes when every sample converges, stays FC, and stays stable", () => {
    const report = verifyUnderPerturbation(
      reference,
      [{ ClearSpan: 2000 }, { ClearSpan: 2200 }, { ClearSpan: 2500 }],
      (inputs) => ok([0, 0, inputs.ClearSpan, 0]),
      { expectedDisplacement: (i) => Math.abs(i.ClearSpan - 2000) }
    );
    expect(report.passed).toBe(true);
    expect(report.passedCount).toBe(3);
    expect(report.breakingCombination).toBeNull();
    expect(report.summary).toContain("All 3 perturbation samples");
  });

  it("names the exact parameter combination that first broke (§75.7)", () => {
    const report = verifyUnderPerturbation(
      reference,
      [{ ClearSpan: 2000 }, { ClearSpan: 6000 }, { ClearSpan: 2200 }],
      (inputs) =>
        inputs.ClearSpan > 5000
          ? { converged: false, maxResidual: 1, status: "NotSolvable", coordinates: reference, diagnostic: "diverged" }
          : ok([0, 0, inputs.ClearSpan, 0]),
      { expectedDisplacement: (i) => Math.abs(i.ClearSpan - 2000) }
    );
    expect(report.passed).toBe(false);
    expect(report.breakingCombination).toEqual({ ClearSpan: 6000 });
    expect(report.samples[1].failures.join(" ")).toContain("did not converge");
  });

  it("rejects an under-constrained result even when the solver converged", () => {
    // §5: "fully constrained is not the same as correct" — and neither is
    // "converged". The status gate is separate from the residual gate.
    const report = verifyUnderPerturbation(reference, [{ S: 1 }], () => ({
      converged: true,
      maxResidual: 0,
      status: "UC",
      coordinates: reference,
    }));
    expect(report.passed).toBe(false);
    expect(report.samples[0].failures.join(" ")).toContain("constraint status UC");
  });

  it("rejects a residual above ε_tol even when the solver claimed convergence", () => {
    const report = verifyUnderPerturbation(reference, [{ S: 1 }], () => ({
      converged: true,
      maxResidual: 1e-4,
      status: "FC",
      coordinates: reference,
    }));
    expect(report.passed).toBe(false);
    expect(report.samples[0].failures.join(" ")).toContain("max residual");
  });

  it("flags geometry that moved more than the edit required", () => {
    const report = verifyUnderPerturbation(
      reference,
      [{ ClearSpan: 2100 }],
      () => ok([500, 500, 2100, 0]), // the anchored vertex drifted
      { expectedDisplacement: () => 100, gridSize: 2 }
    );
    expect(report.passed).toBe(false);
    expect(report.samples[0].failures.join(" ")).toContain("unstable");
  });

  it("reports an empty sample set as not passed rather than vacuously true", () => {
    expect(verifyUnderPerturbation(reference, [], () => ok(reference)).passed).toBe(false);
  });
});

describe("§75.7 Sweep generation", () => {
  const params = [
    { name: "ClearSpan", value: 2000, min: 1200, max: 6000 },
    { name: "WallThickness", value: 300, min: 250, max: 600 },
  ];

  it("includes the nominal configuration and grid endpoints", () => {
    const samples = generateSweepSamples(params, { gridSteps: 3 });
    expect(samples[0]).toEqual({ ClearSpan: 2000, WallThickness: 300 });
    expect(samples.some((s) => s.ClearSpan === 1200)).toBe(true);
    expect(samples.some((s) => s.ClearSpan === 6000)).toBe(true);
    expect(samples.some((s) => s.WallThickness === 250)).toBe(true);
    expect(samples.some((s) => s.WallThickness === 600)).toBe(true);
  });

  it("never produces a sample outside the declared range", () => {
    const samples = generateSweepSamples(params, { gridSteps: 5, latinHypercubeSamples: 20 });
    for (const s of samples) {
      expect(s.ClearSpan).toBeGreaterThanOrEqual(1200);
      expect(s.ClearSpan).toBeLessThanOrEqual(6000);
      expect(s.WallThickness).toBeGreaterThanOrEqual(250);
      expect(s.WallThickness).toBeLessThanOrEqual(600);
    }
  });

  it("is deterministic, so a CI failure is reproducible", () => {
    const a = generateSweepSamples(params, { latinHypercubeSamples: 12, seed: 42 });
    const b = generateSweepSamples(params, { latinHypercubeSamples: 12, seed: 42 });
    expect(a).toEqual(b);
    const c = generateSweepSamples(params, { latinHypercubeSamples: 12, seed: 7 });
    expect(c).not.toEqual(a);
  });

  it("deduplicates identical samples", () => {
    const samples = generateSweepSamples(params, { gridSteps: 3, latinHypercubeSamples: 8 });
    const keys = samples.map((s) => JSON.stringify(s));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sweeps ClearSpan over the spec's worked set without leaving the range", () => {
    const only = [{ name: "ClearSpan", value: 2000, min: 1500, max: 3000 }];
    const samples = generateSweepSamples(only, { gridSteps: 6 });
    const values = samples.map((s) => s.ClearSpan).sort((a, b) => a - b);
    expect(values[0]).toBe(1500);
    expect(values[values.length - 1]).toBe(3000);
  });
});
