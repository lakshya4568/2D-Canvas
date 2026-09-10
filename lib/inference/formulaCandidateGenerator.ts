/**
 * Deterministic Formula Inference with the four mandatory validation gates.
 * UPCE-MASTER-1.0 §49 (§49.1 dimension-stack summation, §49.2 integer-relation
 * discovery, §49.3 the anti-curve-fitting rule and Occam ranking, §49.4 the four
 * validation gates).
 *
 * §49.3 is binding:
 *      BAD   :  A ≈ 0.713·B + 14.7
 *      GOOD  :  A = B + 2·T
 * "The second has geometric meaning; the first is numerology that happens to fit."
 *
 * Every candidate produced here is a CANDIDATE. Nothing in this file commits
 * anything (§46 hard rule 1).
 */

import {
  ScalarObservation,
  IntegerRelation,
  discoverIntegerRelations,
  relationToExpression,
  isDimensionallyConsistent,
} from "./integerRelation";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { BayClusterResult } from "./bayClusterer";

export type FormulaGateName =
  | "tolerance"
  | "dimensional-consistency"
  | "perturbation"
  | "minimum-support";

export interface FormulaGateResult {
  gate: FormulaGateName;
  passed: boolean;
  detail: string;
}

export interface FormulaCandidate {
  id: string;
  /** The parameter this formula would drive. */
  targetId: string;
  targetName: string;
  /** RHS expression in parameter names, e.g. "2*ClearSpan + 3*WallThickness". */
  expression: string;
  dependencies: string[];
  /** Residual |LHS − RHS| at the observed configuration, in model units. */
  residual: number;
  /** Occam complexity — fewer terms and smaller integers score lower. */
  complexity: number;
  /** §49.3 composite score; higher is better. */
  score: number;
  scoreBreakdown: {
    geometricFit: number;
    constraintIndependence: number;
    topologyEvidence: number;
    repetitionEvidence: number;
    semanticEvidence: number;
    formulaComplexity: number;
  };
  provenance: "dimension-stack" | "integer-relation";
  evidence: string[];
  gates: FormulaGateResult[];
  /** True only when all four §49.4 gates passed. */
  admissible: boolean;
}

export interface PerturbationSample {
  /** Driving parameter values used for this synthetic re-solve. */
  inputs: Record<string, number>;
  /** Re-measured scalar values after the re-solve. */
  measured: Record<string, number>;
  /** False when the synthetic re-solve failed to converge. */
  converged: boolean;
}

export interface FormulaGenerationOptions {
  policy?: TolerancePolicy;
  /**
   * §49.4 gate 4 — minimum independent occurrences before a relation is more
   * than a coincidence. Default 2.
   */
  minimumSupport?: number;
  /**
   * §49.4 gate 3 — synthetic perturbation samples. When omitted the perturbation
   * gate is recorded as NOT PASSED, and the candidate is inadmissible. The spec
   * calls this "the single most effective control on false positives", so it is
   * never silently skipped.
   */
  perturbations?: PerturbationSample[];
  /** Constraint-independence score per candidate (from the SVD gate, §32). */
  independenceScores?: Record<string, number>;
  /** Candidates carrying topology evidence (shared face/boundary role). */
  topologyBacked?: Set<string>;
  /** Candidates carrying semantic evidence (author-confirmed tag). */
  semanticBacked?: Set<string>;
  maxCandidates?: number;
}

const DEFAULT_MIN_SUPPORT = 2;

/**
 * §49.1 — Dimension-stack summation.
 *
 * "If an exterior dimension D_total spans an interval subdivided by interior
 * spans S₁…S_k and thicknesses T₁…T_{k+1}, propose D_total = Σᵢ Sᵢ + Σⱼ Tⱼ."
 *
 * Fed directly by the bay-clustering pass, so the multi-cell case produces ONE
 * candidate rather than the eleven disjoint cards of §80.
 */
export function generateDimensionStackCandidates(
  stack: BayClusterResult,
  options: FormulaGenerationOptions = {}
): FormulaCandidate[] {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  if (!stack.recognised || !stack.stackExpression) return [];

  const total = stack.parameters.find((p) => p.name === "TotalSpan");
  if (!total) return [];

  const dependencies = stack.parameters
    .filter((p) => p.name !== "TotalSpan")
    .map((p) => p.name);
  if (dependencies.length === 0) return [];

  const repetition = stack.bayCount;
  const candidate: FormulaCandidate = {
    id: `formula_stack_${stack.bayCount}bay`,
    targetId: "TotalSpan",
    targetName: "TotalSpan",
    expression: stack.stackExpression,
    dependencies,
    residual: stack.closureResidual,
    complexity: dependencies.length,
    score: 0,
    scoreBreakdown: {
      geometricFit: 0,
      constraintIndependence: 0,
      topologyEvidence: 0,
      repetitionEvidence: 0,
      semanticEvidence: 0,
      formulaComplexity: 0,
    },
    provenance: "dimension-stack",
    evidence: [
      `${stack.bayCount} bay${stack.bayCount === 1 ? "" : "s"} projected onto the derived ` +
        `stacking axis (${stack.axis.x.toFixed(4)}, ${stack.axis.y.toFixed(4)})`,
      `${stack.runs.length} alternating solid/void runs close to ` +
        `${stack.totalSpan.toFixed(3)} mm (residual ${stack.closureResidual.toFixed(4)} mm)`,
      ...stack.parameters
        .filter((p) => p.name !== "TotalSpan")
        .map(
          (p) =>
            `${p.name} = ${p.value.toFixed(3)} mm clustered from ${p.occurrences} run` +
            `${p.occurrences === 1 ? "" : "s"} (spread ±${(p.deviation / 2).toFixed(3)} mm)`
        ),
    ],
    gates: [],
    admissible: false,
  };

  applyGatesAndScore(
    candidate,
    { repetition, policy, supportCount: repetition },
    options
  );

  return [candidate];
}

/**
 * §49.2 — Integer-relation candidates, scored and gated.
 */
export function generateIntegerRelationCandidates(
  scalars: ScalarObservation[],
  options: FormulaGenerationOptions = {}
): FormulaCandidate[] {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const relations = discoverIntegerRelations(scalars, {
    tolerance: policy.cluster_mm,
  });

  const out: FormulaCandidate[] = [];

  for (const relation of relations) {
    const rendered = relationToExpression(relation);
    if (!rendered) continue;

    const candidate: FormulaCandidate = {
      id: `formula_rel_${relation.coefficients.join("_")}`,
      targetId: rendered.targetId,
      targetName: rendered.target,
      expression: rendered.expression,
      dependencies: relation.terms
        .filter((t) => t.id !== rendered.targetId)
        .map((t) => t.name),
      residual: relation.residual,
      complexity: relation.complexity,
      score: 0,
      scoreBreakdown: {
        geometricFit: 0,
        constraintIndependence: 0,
        topologyEvidence: 0,
        repetitionEvidence: 0,
        semanticEvidence: 0,
        formulaComplexity: 0,
      },
      provenance: "integer-relation",
      evidence: [
        `Small-integer relation found by ${relation.method}: ` +
          relation.terms
            .map((t) => `${t.coefficient > 0 ? "+" : ""}${t.coefficient}·${t.name}`)
            .join(" ") +
          ` = 0`,
        `Residual ${relation.residual.toFixed(4)} mm across ${relation.terms.length} terms`,
      ],
      gates: [],
      admissible: false,
    };

    applyGatesAndScore(
      candidate,
      {
        repetition: countRepeatedCoefficients(relation),
        policy,
        supportCount: relation.terms.length,
        dimensionallyConsistent: isDimensionallyConsistent(relation.coefficients, scalars),
      },
      options
    );

    out.push(candidate);
  }

  const max = options.maxCandidates ?? 16;
  return out.sort((a, b) => b.score - a.score).slice(0, max);
}

function countRepeatedCoefficients(relation: IntegerRelation): number {
  return relation.terms.reduce((s, t) => s + (Math.abs(t.coefficient) > 1 ? Math.abs(t.coefficient) : 0), 0);
}

interface GateContext {
  repetition: number;
  policy: TolerancePolicy;
  supportCount: number;
  dimensionallyConsistent?: boolean;
}

/**
 * §49.4 — all four gates, and §49.3 — the ranking function.
 *
 *   Score = geometricFit + constraintIndependence + topologyEvidence
 *         + repetitionEvidence + semanticEvidence − formulaComplexity
 */
function applyGatesAndScore(
  candidate: FormulaCandidate,
  ctx: GateContext,
  options: FormulaGenerationOptions
): void {
  const minSupport = options.minimumSupport ?? DEFAULT_MIN_SUPPORT;
  const gates: FormulaGateResult[] = [];

  // Gate 1 — within tolerance at the current configuration.
  const tolPassed = candidate.residual <= ctx.policy.cluster_mm;
  gates.push({
    gate: "tolerance",
    passed: tolPassed,
    detail: `residual ${candidate.residual.toFixed(4)} mm ${tolPassed ? "≤" : ">"} ε_cluster ${ctx.policy.cluster_mm} mm`,
  });

  // Gate 2 — dimensional consistency.
  const dimPassed = ctx.dimensionallyConsistent ?? true;
  gates.push({
    gate: "dimensional-consistency",
    passed: dimPassed,
    detail: dimPassed
      ? "all terms share a dimensional class"
      : "terms mix incompatible dimensional classes",
  });

  // Gate 3 — perturbation survival. Never assumed; absent samples mean FAIL.
  const perturbation = evaluatePerturbationGate(candidate, options.perturbations, ctx.policy);
  gates.push(perturbation.result);

  // Gate 4 — minimum support.
  const supportPassed = ctx.supportCount >= minSupport;
  gates.push({
    gate: "minimum-support",
    passed: supportPassed,
    detail: `${ctx.supportCount} independent occurrence${ctx.supportCount === 1 ? "" : "s"} ` +
      `(minimum ${minSupport})`,
  });

  candidate.gates = gates;
  candidate.admissible = gates.every((g) => g.passed);

  // §49.3 ranking.
  const scale = Math.max(ctx.policy.cluster_mm, 1e-9);
  const geometricFit = Math.max(0, 1 - candidate.residual / scale);
  const constraintIndependence = options.independenceScores?.[candidate.id] ?? 0.5;
  const topologyEvidence = options.topologyBacked?.has(candidate.id) ? 1 : 0;
  const repetitionEvidence = Math.min(1, ctx.repetition / 4);
  const semanticEvidence = options.semanticBacked?.has(candidate.id) ? 1 : 0;
  // Occam: prefer fewest terms and smallest integer coefficients.
  const formulaComplexity = candidate.complexity / 10;

  candidate.scoreBreakdown = {
    geometricFit,
    constraintIndependence,
    topologyEvidence,
    repetitionEvidence,
    semanticEvidence,
    formulaComplexity,
  };
  candidate.score =
    geometricFit +
    constraintIndependence +
    topologyEvidence +
    repetitionEvidence +
    semanticEvidence -
    formulaComplexity +
    (perturbation.stabilityBonus ?? 0);
}

function evaluatePerturbationGate(
  candidate: FormulaCandidate,
  samples: PerturbationSample[] | undefined,
  policy: TolerancePolicy
): { result: FormulaGateResult; stabilityBonus?: number } {
  if (!samples || samples.length === 0) {
    return {
      result: {
        gate: "perturbation",
        passed: false,
        detail:
          "no perturbation samples supplied — relation holds only at the observed " +
          "configuration and is treated as unvalidated (§49.4 gate 3)",
      },
    };
  }

  let survived = 0;
  let failed = 0;
  let worst = 0;

  for (const s of samples) {
    if (!s.converged) {
      failed++;
      continue;
    }
    const lhs = s.measured[candidate.targetName];
    const rhs = evaluateLinearExpression(candidate.expression, {
      ...s.inputs,
      ...s.measured,
    });
    if (lhs === undefined || rhs === null) {
      failed++;
      continue;
    }
    const err = Math.abs(lhs - rhs);
    worst = Math.max(worst, err);
    if (err <= policy.cluster_mm) survived++;
    else failed++;
  }

  const passed = failed === 0 && survived === samples.length;
  return {
    result: {
      gate: "perturbation",
      passed,
      detail: `${survived}/${samples.length} synthetic re-solves preserved the relation ` +
        `(worst error ${worst.toFixed(4)} mm)`,
    },
    stabilityBonus: passed ? 0.5 : 0,
  };
}

/**
 * Evaluates the restricted linear expression grammar this module emits:
 *   term := [integer '*'] identifier
 *   expr := term (('+' | '-') term)*
 *
 * Deliberately NOT a general evaluator — general expressions go through the
 * sandboxed evaluator (§21). Returns null if the string leaves the grammar or a
 * symbol is unbound, so an unparseable candidate fails its gate rather than
 * silently scoring well.
 */
export function evaluateLinearExpression(
  expression: string,
  scope: Record<string, number>
): number | null {
  const tokens = expression.replace(/\s+/g, "").match(/[+-]?[^+-]+/g);
  if (!tokens) return null;

  let total = 0;
  for (const raw of tokens) {
    let sign = 1;
    let body = raw;
    if (body.startsWith("+")) body = body.slice(1);
    else if (body.startsWith("-")) {
      sign = -1;
      body = body.slice(1);
    }
    if (body.length === 0) return null;

    const parts = body.split("*");
    let coefficient = 1;
    let identifier: string;

    if (parts.length === 1) {
      identifier = parts[0];
    } else if (parts.length === 2) {
      const n = Number(parts[0]);
      if (!Number.isFinite(n)) return null;
      coefficient = n;
      identifier = parts[1];
    } else {
      return null;
    }

    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(identifier)) return null;
    const value = scope[identifier];
    if (value === undefined || !Number.isFinite(value)) return null;

    total += sign * coefficient * value;
  }

  return total;
}

/**
 * Full §49 pipeline: dimension stacks first (they carry topology evidence), then
 * integer relations, deduplicated by expression, ranked by the §49.3 score.
 * Only admissible candidates reach the author — but inadmissible ones are
 * returned too so the review UI can explain *why* something was withheld.
 */
export function generateFormulaCandidates(
  scalars: ScalarObservation[],
  stack: BayClusterResult | null,
  options: FormulaGenerationOptions = {}
): { admissible: FormulaCandidate[]; rejected: FormulaCandidate[] } {
  const all: FormulaCandidate[] = [];

  if (stack) {
    const stackCandidates = generateDimensionStackCandidates(stack, {
      ...options,
      topologyBacked: new Set([
        ...(options.topologyBacked ?? []),
        `formula_stack_${stack.bayCount}bay`,
      ]),
    });
    all.push(...stackCandidates);
  }

  all.push(...generateIntegerRelationCandidates(scalars, options));

  const seen = new Set<string>();
  const deduped: FormulaCandidate[] = [];
  for (const c of all.sort((a, b) => b.score - a.score)) {
    const key = `${c.targetName}=${c.expression}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  return {
    admissible: deduped.filter((c) => c.admissible),
    rejected: deduped.filter((c) => !c.admissible),
  };
}
