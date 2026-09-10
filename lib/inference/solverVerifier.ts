/**
 * Solver-as-Verifier — the half of arXiv 2504.13178 the spec ADOPTS.
 * UPCE-MASTER-1.0 §51, and the §75.7 stability sweep it powers.
 *
 * "After the deterministic engine proposes constraints, re-solve with perturbed
 *  driving parameters and check the sketch is fully constrained and stable. The
 *  paper's idea, applied deterministically."
 *
 * The operational definition of design intent adopted verbatim (§51):
 *   fully-constrained  AND  solvable  AND  stable under parameter change.
 *
 * Nothing here trains, fits, or samples a model. The verifier is the solver.
 */

import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";

export type ConstraintStatus = "UC" | "FC" | "OC" | "NotSolvable";

/** What one synthetic re-solve returned. */
export interface VerificationSolveResult {
  converged: boolean;
  maxResidual: number;
  status: ConstraintStatus;
  /** Solved coordinates, used for the stability metric. */
  coordinates: number[];
  /** Measured scalar values after the solve, for formula perturbation gating. */
  measurements?: Record<string, number>;
  diagnostic?: string;
}

export interface StabilityMetric {
  /**
   * Max Euclidean displacement of any vertex between the reference and the
   * re-solved configuration, minus the displacement the edit itself required.
   */
  maxDisplacement: number;
  meanDisplacement: number;
  /**
   * arXiv 2504.13178 discretises displacement into grid cells and calls a sketch
   * unstable if primitives jump cells after re-solve. `gridSize` is that cell.
   */
  jumpedCells: number;
  stable: boolean;
}

export interface VerificationSample {
  /** Perturbed driving parameter values used for this sample. */
  inputs: Record<string, number>;
  result: VerificationSolveResult;
  stability: StabilityMetric;
  passed: boolean;
  failures: string[];
}

export interface VerificationReport {
  /** True only when every sample converged, stayed FC, and stayed stable. */
  passed: boolean;
  samples: VerificationSample[];
  sampleCount: number;
  passedCount: number;
  /** The exact parameter combination that first broke, if any (§75.7). */
  breakingCombination: Record<string, number> | null;
  worstResidual: number;
  worstDisplacement: number;
  summary: string;
}

export interface VerifierOptions {
  policy?: TolerancePolicy;
  /** Grid cell for the stability metric, in mm. Default 4× ε_geometry. */
  gridSize?: number;
  /** Statuses considered acceptable. Default: FC only (§51). */
  acceptStatuses?: ConstraintStatus[];
  /**
   * Displacement the edit legitimately requires, per sample. Motion beyond this
   * is what "unstable" means — geometry moving that the edit did not demand.
   */
  expectedDisplacement?: (inputs: Record<string, number>) => number;
}

/**
 * §51 stability metric — Euclidean displacement, discretised into grid bins.
 */
export function computeStability(
  reference: number[],
  resolved: number[],
  gridSize: number,
  allowance: number = 0
): StabilityMetric {
  if (reference.length !== resolved.length || reference.length === 0) {
    return { maxDisplacement: 0, meanDisplacement: 0, jumpedCells: 0, stable: reference.length === resolved.length };
  }

  let maxD = 0;
  let sumD = 0;
  let jumped = 0;
  const count = Math.floor(reference.length / 2);

  for (let i = 0; i < count; i++) {
    const dx = resolved[2 * i] - reference[2 * i];
    const dy = resolved[2 * i + 1] - reference[2 * i + 1];
    const d = Math.hypot(dx, dy);
    maxD = Math.max(maxD, d);
    sumD += d;

    const cellsX = Math.abs(Math.floor(resolved[2 * i] / gridSize) - Math.floor(reference[2 * i] / gridSize));
    const cellsY = Math.abs(Math.floor(resolved[2 * i + 1] / gridSize) - Math.floor(reference[2 * i + 1] / gridSize));
    if (Math.max(cellsX, cellsY) > 0 && d > allowance) jumped++;
  }

  return {
    maxDisplacement: maxD,
    meanDisplacement: count > 0 ? sumD / count : 0,
    jumpedCells: jumped,
    stable: maxD <= allowance + gridSize,
  };
}

/**
 * Runs the verifier loop over a set of perturbed driving-parameter samples.
 *
 * `solve` is injected: the verifier never owns a solver, it consumes one, which
 * is what lets the same code serve author review (§62), the template stability
 * sweep (§75.7), and the formula perturbation gate (§49.4 gate 3).
 */
export function verifyUnderPerturbation(
  referenceCoordinates: number[],
  perturbations: Record<string, number>[],
  solve: (inputs: Record<string, number>) => VerificationSolveResult,
  options: VerifierOptions = {}
): VerificationReport {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const gridSize = options.gridSize ?? 4 * policy.geometry_mm;
  const accept = options.acceptStatuses ?? ["FC"];

  const samples: VerificationSample[] = [];
  let breakingCombination: Record<string, number> | null = null;
  let worstResidual = 0;
  let worstDisplacement = 0;

  for (const inputs of perturbations) {
    const result = solve(inputs);
    const allowance = options.expectedDisplacement?.(inputs) ?? Number.POSITIVE_INFINITY;
    const stability = computeStability(
      referenceCoordinates,
      result.coordinates,
      gridSize,
      Number.isFinite(allowance) ? allowance : Number.MAX_SAFE_INTEGER
    );

    const failures: string[] = [];
    if (!result.converged) failures.push(`solver did not converge (${result.diagnostic ?? "no detail"})`);
    if (result.maxResidual > policy.solver_residual)
      failures.push(`max residual ${result.maxResidual.toExponential(2)} > ε_tol ${policy.solver_residual.toExponential(2)}`);
    if (!accept.includes(result.status))
      failures.push(`constraint status ${result.status} not in [${accept.join(", ")}]`);
    if (Number.isFinite(allowance) && !stability.stable)
      failures.push(
        `unstable: max displacement ${stability.maxDisplacement.toFixed(3)} mm exceeds ` +
          `allowance ${allowance.toFixed(3)} mm + grid ${gridSize.toFixed(3)} mm`
      );

    worstResidual = Math.max(worstResidual, result.maxResidual);
    worstDisplacement = Math.max(worstDisplacement, stability.maxDisplacement);

    const passed = failures.length === 0;
    if (!passed && breakingCombination === null) breakingCombination = { ...inputs };

    samples.push({ inputs, result, stability, passed, failures });
  }

  const passedCount = samples.filter((s) => s.passed).length;
  const passed = passedCount === samples.length && samples.length > 0;

  return {
    passed,
    samples,
    sampleCount: samples.length,
    passedCount,
    breakingCombination,
    worstResidual,
    worstDisplacement,
    summary: passed
      ? `All ${samples.length} perturbation samples converged, stayed fully constrained, and stayed stable.`
      : `${passedCount}/${samples.length} samples passed. First failure at ` +
        `${breakingCombination ? JSON.stringify(breakingCombination) : "unknown"}.`,
  };
}

/**
 * §75.7 sweep generator: for every DRIVING parameter, sweep P − δ, P, P + δ
 * across its declared range on a grid, plus Latin-hypercube samples.
 * Deterministic: the LHS uses a seeded LCG so a CI failure is reproducible.
 */
export function generateSweepSamples(
  parameters: { name: string; value: number; min?: number; max?: number }[],
  options: { gridSteps?: number; latinHypercubeSamples?: number; seed?: number } = {}
): Record<string, number>[] {
  const gridSteps = options.gridSteps ?? 3;
  const lhsCount = options.latinHypercubeSamples ?? 0;
  const base: Record<string, number> = {};
  for (const p of parameters) base[p.name] = p.value;

  const samples: Record<string, number>[] = [];
  const seen = new Set<string>();
  const push = (s: Record<string, number>) => {
    const key = JSON.stringify(s);
    if (seen.has(key)) return;
    seen.add(key);
    samples.push(s);
  };

  push({ ...base });

  // One-at-a-time grid across each parameter's declared range.
  for (const p of parameters) {
    const min = p.min ?? p.value * 0.8;
    const max = p.max ?? p.value * 1.2;
    if (!(max > min)) continue;
    for (let i = 0; i < gridSteps; i++) {
      const t = gridSteps === 1 ? 0.5 : i / (gridSteps - 1);
      push({ ...base, [p.name]: min + (max - min) * t });
    }
  }

  // Latin-hypercube over all parameters simultaneously.
  if (lhsCount > 0 && parameters.length > 0) {
    let seed = options.seed ?? 0x2f6e2b1;
    const rand = () => {
      // 32-bit LCG (Numerical Recipes constants) — deterministic and portable.
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    const strata: Record<string, number[]> = {};
    for (const p of parameters) {
      const perm = Array.from({ length: lhsCount }, (_, i) => i);
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      strata[p.name] = perm;
    }

    for (let s = 0; s < lhsCount; s++) {
      const sample: Record<string, number> = {};
      for (const p of parameters) {
        const min = p.min ?? p.value * 0.8;
        const max = p.max ?? p.value * 1.2;
        const stratum = strata[p.name][s];
        const t = (stratum + rand()) / lhsCount;
        sample[p.name] = max > min ? min + (max - min) * t : p.value;
      }
      push(sample);
    }
  }

  return samples;
}
