/**
 * Branch Control — keeping the solution the *intended* one.
 * UPCE-MASTER-1.0 §31 (§31.1 hysteresis, §31.2 chirality barrier, §31.3 degeneracy
 * barrier, §31.4 topological validity via Bentley–Ottmann, §31.5 homotopy
 * sub-stepping, §31.6 singular-value / condition-number thresholding).
 *
 * Non-linear systems have multiple valid roots. These utilities keep the solver
 * on the branch the user means, every time. Nothing here performs a solve; each
 * function is a guard applied around the solve performed by
 * `solveLevenbergMarquardt` / `solveDogleg`.
 */

import { SystemModel, LMSolverResult } from "./levenbergMarquardt";
import { svd } from "./matrix/svd";
import { Point2D } from "../geometry/topology/types";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { signedArea } from "./hysteresis";

// ---------------------------------------------------------------------------
// §31.2 / §31.3 — Interior logarithmic barriers
// ---------------------------------------------------------------------------

export interface BarrierOptions {
  /** Barrier weight µ in Φ_barrier = −µ ln(·). Default 1e-3. */
  mu?: number;
  /**
   * Activation threshold. The barrier contributes nothing while the guarded
   * quantity exceeds this, so it never perturbs a healthy configuration.
   */
  activation: number;
}

export interface BarrierTerm {
  /** Barrier potential contribution Φ_barrier ≥ 0 (0 when inactive). */
  potential: number;
  /** True when the guarded quantity is at or past the activation threshold. */
  active: boolean;
  /** The guarded quantity itself (signed area, or edge length). */
  quantity: number;
}

/**
 * §31.2 — Chirality / handedness barrier.
 *
 * For a closed loop the signed area must keep its initial sign. As A → 0 an
 * interior logarithmic barrier Φ = −µ ln(A · sgn_initial) is added to the
 * objective, which prevents an interior chamfer from inverting outward into
 * empty space.
 */
export function chiralityBarrier(
  loop: Point2D[],
  initialSign: number,
  options: BarrierOptions = { activation: 1.0 }
): BarrierTerm {
  const mu = options.mu ?? 1e-3;
  const A = signedArea(loop);
  const oriented = A * Math.sign(initialSign || 1);

  if (oriented >= options.activation) {
    return { potential: 0, active: false, quantity: A };
  }
  if (oriented <= 0) {
    // Already inverted — the barrier is infinite; the caller must reject the step.
    return { potential: Number.POSITIVE_INFINITY, active: true, quantity: A };
  }
  return {
    potential: -mu * Math.log(oriented / options.activation),
    active: true,
    quantity: A,
  };
}

/**
 * §31.3 — Degeneracy barrier.
 *
 * If an edge length approaches zero (‖V_{i+1} − V_i‖ ≤ ε_deg) a logarithmic
 * barrier is added to prevent geometric collapse during large dimensional
 * changes.
 */
export function degeneracyBarrier(
  a: Point2D,
  b: Point2D,
  options: BarrierOptions = { activation: 1.0 }
): BarrierTerm {
  const mu = options.mu ?? 1e-3;
  const L = Math.hypot(b.x - a.x, b.y - a.y);

  if (L >= options.activation) {
    return { potential: 0, active: false, quantity: L };
  }
  if (L <= 0) {
    return { potential: Number.POSITIVE_INFINITY, active: true, quantity: L };
  }
  return {
    potential: -mu * Math.log(L / options.activation),
    active: true,
    quantity: L,
  };
}

/**
 * Aggregate barrier potential for a whole configuration. Used as an additive
 * term on Φ(X) = ½‖F(X)‖² when accepting or rejecting a trial step.
 */
export function evaluateBarrierPotential(
  loops: { vertices: Point2D[]; initialSign: number }[],
  options: BarrierOptions = { activation: 1.0 }
): { total: number; violations: string[] } {
  let total = 0;
  const violations: string[] = [];

  loops.forEach((loop, li) => {
    const chir = chiralityBarrier(loop.vertices, loop.initialSign, options);
    if (!Number.isFinite(chir.potential)) {
      violations.push(`loop[${li}]: chirality inverted (signed area ${chir.quantity.toFixed(4)})`);
      total = Number.POSITIVE_INFINITY;
      return;
    }
    total += chir.potential;

    for (let i = 0; i < loop.vertices.length; i++) {
      const a = loop.vertices[i];
      const b = loop.vertices[(i + 1) % loop.vertices.length];
      const deg = degeneracyBarrier(a, b, options);
      if (!Number.isFinite(deg.potential)) {
        violations.push(`loop[${li}] edge ${i}: degenerate (length ${deg.quantity.toFixed(6)})`);
        total = Number.POSITIVE_INFINITY;
        return;
      }
      total += deg.potential;
    }
  });

  return { total, violations };
}

// ---------------------------------------------------------------------------
// §31.4 — Topological validity: Bentley–Ottmann self-intersection sweep
// ---------------------------------------------------------------------------

export interface Segment2D {
  id: string;
  a: Point2D;
  b: Point2D;
}

/**
 * How two segments meet.
 *
 * §31.4 targets "edge crossing or loop self-intersection". A `touching`
 * T-junction is NOT that: it is geometry that legitimately meets, and planar
 * arrangement resolves it into a shared vertex. Only `crossing` and `overlap`
 * are topological faults.
 */
export type IntersectionKind = "crossing" | "overlap" | "touching";

export interface IntersectionReport {
  segmentA: string;
  segmentB: string;
  point: Point2D;
  kind: IntersectionKind;
}

interface SweepEvent {
  x: number;
  y: number;
  kind: 0 | 1; // 0 = left endpoint (insert), 1 = right endpoint (remove)
  segment: Segment2D;
}

function orient(p: Point2D, q: Point2D, r: Point2D): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

function onSegment(p: Point2D, q: Point2D, r: Point2D, eps: number): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + eps &&
    q.x >= Math.min(p.x, r.x) - eps &&
    q.y <= Math.max(p.y, r.y) + eps &&
    q.y >= Math.min(p.y, r.y) - eps
  );
}

/**
 * Proper segment intersection test. Shared endpoints (adjacency in a boundary
 * loop) are NOT intersections — only crossings and overlaps are.
 */
export function segmentsProperlyIntersect(
  s1: Segment2D,
  s2: Segment2D,
  eps: number
): (Point2D & { kind: IntersectionKind }) | null {
  const sharesEndpoint = (p: Point2D, q: Point2D) => Math.hypot(p.x - q.x, p.y - q.y) <= eps;
  const shared =
    sharesEndpoint(s1.a, s2.a) ||
    sharesEndpoint(s1.a, s2.b) ||
    sharesEndpoint(s1.b, s2.a) ||
    sharesEndpoint(s1.b, s2.b);

  const d1 = orient(s1.a, s1.b, s2.a);
  const d2 = orient(s1.a, s1.b, s2.b);
  const d3 = orient(s2.a, s2.b, s1.a);
  const d4 = orient(s2.a, s2.b, s1.b);

  const scale = Math.max(
    1,
    Math.hypot(s1.b.x - s1.a.x, s1.b.y - s1.a.y),
    Math.hypot(s2.b.x - s2.a.x, s2.b.y - s2.a.y)
  );
  const zero = eps * scale;

  // Collinear overlap: a genuine topological failure even when endpoints touch.
  if (
    Math.abs(d1) <= zero &&
    Math.abs(d2) <= zero &&
    Math.abs(d3) <= zero &&
    Math.abs(d4) <= zero
  ) {
    const overlaps =
      (onSegment(s1.a, s2.a, s1.b, eps) && !sharesEndpoint(s2.a, s1.a) && !sharesEndpoint(s2.a, s1.b)) ||
      (onSegment(s1.a, s2.b, s1.b, eps) && !sharesEndpoint(s2.b, s1.a) && !sharesEndpoint(s2.b, s1.b));
    if (overlaps) {
      return {
        x: (s2.a.x + s2.b.x) / 2,
        y: (s2.a.y + s2.b.y) / 2,
        kind: "overlap",
      };
    }
    return null;
  }

  if (shared) return null;

  if (
    ((d1 > zero && d2 < -zero) || (d1 < -zero && d2 > zero)) &&
    ((d3 > zero && d4 < -zero) || (d3 < -zero && d4 > zero))
  ) {
    const denom =
      (s1.b.x - s1.a.x) * (s2.b.y - s2.a.y) - (s1.b.y - s1.a.y) * (s2.b.x - s2.a.x);
    if (Math.abs(denom) < 1e-15) return null;
    const t =
      ((s2.a.x - s1.a.x) * (s2.b.y - s2.a.y) - (s2.a.y - s1.a.y) * (s2.b.x - s2.a.x)) / denom;
    return {
      x: s1.a.x + t * (s1.b.x - s1.a.x),
      y: s1.a.y + t * (s1.b.y - s1.a.y),
      kind: "crossing",
    };
  }

  // Touching (T-junction): one endpoint strictly interior to the other segment.
  const touch = (d: number, p: Point2D, s: Segment2D) =>
    Math.abs(d) <= zero && onSegment(s.a, p, s.b, eps) && !sharesEndpoint(p, s.a) && !sharesEndpoint(p, s.b);

  if (touch(d1, s2.a, s1)) return { ...s2.a, kind: "touching" };
  if (touch(d2, s2.b, s1)) return { ...s2.b, kind: "touching" };
  if (touch(d3, s1.a, s2)) return { ...s1.a, kind: "touching" };
  if (touch(d4, s1.b, s2)) return { ...s1.b, kind: "touching" };

  return null;
}

/**
 * §31.4 — Bentley–Ottmann style sweep-line self-intersection detection.
 *
 * A vertical line sweeps left-to-right maintaining the set of segments spanning
 * the current x. Only segments simultaneously in the active set are tested,
 * which reduces the practical cost far below the O(n²) all-pairs scan while
 * remaining exact. Returns every proper intersection found (empty ⇒ valid).
 *
 * `maxReports` bounds the work when geometry is badly torn; the caller only
 * needs to know *that* the step is invalid.
 */
export function detectSelfIntersections(
  segments: Segment2D[],
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY,
  maxReports: number = 32,
  options: { includeTouching?: boolean } = {}
): IntersectionReport[] {
  const includeTouching = options.includeTouching ?? false;
  const eps = policy.geometry_mm;
  const events: SweepEvent[] = [];

  for (const s of segments) {
    const leftFirst = s.a.x < s.b.x || (s.a.x === s.b.x && s.a.y <= s.b.y);
    const left = leftFirst ? s.a : s.b;
    const right = leftFirst ? s.b : s.a;
    events.push({ x: left.x, y: left.y, kind: 0, segment: s });
    events.push({ x: right.x, y: right.y, kind: 1, segment: s });
  }

  // Insert before remove at equal x so touching segments are still compared.
  events.sort((p, q) => (p.x !== q.x ? p.x - q.x : p.kind !== q.kind ? p.kind - q.kind : p.y - q.y));

  const active = new Map<string, Segment2D>();
  const reports: IntersectionReport[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    if (ev.kind === 0) {
      for (const other of active.values()) {
        if (other.id === ev.segment.id) continue;
        const hit = segmentsProperlyIntersect(ev.segment, other, eps);
        if (hit && (includeTouching || hit.kind !== "touching")) {
          const key = [ev.segment.id, other.id].sort().join("::");
          if (!seen.has(key)) {
            seen.add(key);
            reports.push({
              segmentA: ev.segment.id,
              segmentB: other.id,
              point: { x: hit.x, y: hit.y },
              kind: hit.kind,
            });
            if (reports.length >= maxReports) return reports;
          }
        }
      }
      active.set(ev.segment.id, ev.segment);
    } else {
      active.delete(ev.segment.id);
    }
  }

  return reports;
}

/** Convenience: is this configuration topologically valid (no self-intersection)? */
export function isTopologicallyValid(
  segments: Segment2D[],
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): boolean {
  return detectSelfIntersections(segments, policy, 1).length === 0;
}

// ---------------------------------------------------------------------------
// §31.6 — Condition number / singular-value thresholding
// ---------------------------------------------------------------------------

export interface ConditioningReport {
  sigmaMax: number;
  sigmaMin: number;
  /** κ(J) = σ_max / σ_min, computed over singular values above the rank epsilon. */
  conditionNumber: number;
  /** Numerical rank at `epsSingular`. */
  rank: number;
  illConditioned: boolean;
  /** λ floor implied by the conditioning; use max(λ, lambdaFloor). */
  lambdaFloor: number;
}

export const CONDITION_NUMBER_LIMIT = 1e8;

/**
 * §31.6 — "When the condition number κ(J) = σ_max/σ_min > 1e8, clamp λ to
 * prevent division by near-zero pivots."
 *
 * Returns the conditioning report and the implied damping floor. σ_min is taken
 * over singular values above `epsSingular`, so a genuinely rank-deficient system
 * (handled by the minimum-norm projection) is not confused with an ill-conditioned
 * full-rank one.
 */
export function analyzeConditioning(
  J: number[][],
  epsSingular: number = DEFAULT_TOLERANCE_POLICY.singular_value_eps,
  limit: number = CONDITION_NUMBER_LIMIT
): ConditioningReport {
  if (J.length === 0 || J[0].length === 0) {
    return {
      sigmaMax: 0,
      sigmaMin: 0,
      conditionNumber: 1,
      rank: 0,
      illConditioned: false,
      lambdaFloor: 0,
    };
  }

  const { q } = svd(J);
  const sigmaMax = q.length > 0 ? Math.max(...q) : 0;
  const cutoff = Math.max(epsSingular, epsSingular * sigmaMax);
  const significant = q.filter((s: number) => s > cutoff);
  const rank = significant.length;
  const sigmaMin = rank > 0 ? Math.min(...significant) : 0;

  const conditionNumber = sigmaMin > 0 ? sigmaMax / sigmaMin : Number.POSITIVE_INFINITY;
  const illConditioned = conditionNumber > limit;

  // Clamp so the damped pivot (σ² + λ) cannot be dominated by round-off:
  // λ_floor = σ_max² / limit keeps the damped condition number at or below `limit`.
  const lambdaFloor = illConditioned ? (sigmaMax * sigmaMax) / limit : 0;

  return { sigmaMax, sigmaMin, conditionNumber, rank, illConditioned, lambdaFloor };
}

// ---------------------------------------------------------------------------
// §31.5 — Homotopy sub-stepping
// ---------------------------------------------------------------------------

export interface HomotopyOptions {
  /** Maximum change in a driving parameter per sub-step. Default 500 mm (§31.5). */
  maxDelta?: number;
  /** Hard cap on sub-steps so a pathological jump cannot hang the UI. */
  maxSubSteps?: number;
  toleranceResidual?: number;
  maxIterationsPerStep?: number;
}

export interface HomotopyStep {
  index: number;
  /** Homotopy parameter t ∈ (0, 1]. */
  t: number;
  targets: Record<string, number>;
  converged: boolean;
  iterations: number;
  maxResidual: number;
}

export interface HomotopyResult {
  converged: boolean;
  solution: number[];
  steps: HomotopyStep[];
  subStepCount: number;
  totalIterations: number;
  maxResidual: number;
  status: "converged" | "diverged" | "max_iterations";
  /** The sub-step at which it failed, or null. */
  failedAt: number | null;
}

export const DEFAULT_HOMOTOPY_MAX_DELTA = 500;

/**
 * Number of sub-steps needed so that no driving parameter moves by more than
 * `maxDelta` in a single continuation step.
 */
export function planHomotopySubSteps(
  from: Record<string, number>,
  to: Record<string, number>,
  maxDelta: number = DEFAULT_HOMOTOPY_MAX_DELTA
): number {
  let largest = 0;
  for (const key of Object.keys(to)) {
    const a = from[key];
    if (a === undefined) continue;
    largest = Math.max(largest, Math.abs(to[key] - a));
  }
  if (largest <= maxDelta) return 1;
  return Math.ceil(largest / maxDelta);
}

/**
 * §31.5 — "A span change from 2.0 m to 20.0 m in one step can diverge or produce
 * NaN. Split large changes into sub-steps of ΔL ≤ 500 mm, converging at each and
 * warm-starting the next."
 *
 * `buildModel` receives the interpolated parameter targets for a sub-step and
 * returns the residual/Jacobian model for them. `solveStep` performs the actual
 * solve (Dogleg or LM) — injected so branch control never hard-codes an algorithm.
 */
export function solveWithHomotopy(
  from: Record<string, number>,
  to: Record<string, number>,
  initialX: number[],
  buildModel: (targets: Record<string, number>) => SystemModel,
  solveStep: (model: SystemModel, x0: number[]) => LMSolverResult,
  options: HomotopyOptions = {}
): HomotopyResult {
  const maxDelta = options.maxDelta ?? DEFAULT_HOMOTOPY_MAX_DELTA;
  const hardCap = options.maxSubSteps ?? 256;

  const planned = planHomotopySubSteps(from, to, maxDelta);
  const n = Math.min(planned, hardCap);

  let X = [...initialX];
  const steps: HomotopyStep[] = [];
  let totalIterations = 0;
  let lastMaxResidual = Number.POSITIVE_INFINITY;

  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const targets: Record<string, number> = {};
    for (const key of Object.keys(to)) {
      const a = from[key] ?? to[key];
      targets[key] = a + (to[key] - a) * t;
    }

    const model = buildModel(targets);
    // Warm start from the previous converged sub-step (§29.6, §31.1).
    const res = solveStep(model, X);

    totalIterations += res.iterations;
    lastMaxResidual = res.maxResidual;
    steps.push({
      index: i,
      t,
      targets,
      converged: res.converged,
      iterations: res.iterations,
      maxResidual: res.maxResidual,
    });

    if (!res.converged || res.solution.some((v) => !Number.isFinite(v))) {
      return {
        converged: false,
        solution: X,
        steps,
        subStepCount: n,
        totalIterations,
        maxResidual: res.maxResidual,
        status: res.status === "stagnated" ? "diverged" : "max_iterations",
        failedAt: i,
      };
    }

    X = res.solution;
  }

  return {
    converged: true,
    solution: X,
    steps,
    subStepCount: n,
    totalIterations,
    maxResidual: lastMaxResidual,
    status: "converged",
    failedAt: null,
  };
}
