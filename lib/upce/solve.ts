/**
 * The edit pipeline (§66) and the invariant report (§67).
 *
 * Every change to a parametric drawing goes through exactly this path:
 *
 *     parameter DAG  ->  constraint targets  ->  variational solve
 *                    ->  topology check      ->  invariant check
 *                    ->  commit, or reject the whole thing
 *
 * §5 is binding on the last step and is the reason this file is not just a call
 * to the solver: "fully constrained is not the same as correct". A solve that
 * converges but breaks a declared invariant, inverts a loop, or flips an edge's
 * handedness is a failed edit and must leave the drawing untouched (§35 of the
 * repair brief: reject atomically, never leave partially mutated geometry).
 */

import { solveLevenbergMarquardt, LMSolverResult } from "../solver/levenbergMarquardt";
import { solveMinimumNormStep } from "../solver/matrix/pseudoInverse";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { AuthoringSketch, SketchConstraint } from "./types";
import {
  buildSystem,
  evaluateSystem,
  applySolution,
  targetOf,
  isActive,
  rowCount,
  isAngularRow,
  leverArm,
} from "./residuals";
import { refreshParameters } from "./parameters";
import { RigidCondensation } from "../geometry/lcs/componentFrame";
import { condensationFor } from "./rigid";
import { detectOverlaps, OverlapPair } from "./fusion";

export interface InvariantCheck {
  label: string;
  ok: boolean;
  expected: number;
  actual: number;
  error: number;
  constraintId: string;
}

export interface SolveOutcome {
  ok: boolean;
  sketch: AuthoringSketch;
  converged: boolean;
  iterations: number;
  maxResidual: number;
  /** Every hard/fact constraint re-measured on the solved geometry. */
  invariants: InvariantCheck[];
  /** Why the edit was rejected, in the author's vocabulary. */
  rejection?: string;
  parameterErrors: { parameter: string; message: string }[];
  topology: TopologyCheck;
}

export interface TopologyCheck {
  ok: boolean;
  /** Edges of one shape that crossed each other. */
  selfIntersections: string[];
  /** Closed loops whose signed area changed sign — the shape turned inside out. */
  invertedShapeIds: string[];
  /** Segments that collapsed to (near) zero length. */
  degenerateSegmentIds: string[];
  /**
   * Closed profiles that are standing in each other's way (notebook page 7).
   *
   * Reported, never refused. Two solids running into one another is a real
   * drafting situation with two real answers — one monolithic pour, or a joint
   * — and which one applies is the author's call, not the solver's. Rejecting
   * the edit would take that call away and leave them unable to draw the very
   * thing the notebook is about.
   */
  overlaps: OverlapPair[];
}

export interface SolveOptions {
  policy?: TolerancePolicy;
  maxIterations?: number;
  /** Skip the invariant/topology gate. Used only for interactive drag preview. */
  preview?: boolean;
  /** Extra rows that exist only for this solve (drag targets). */
  temporary?: SketchConstraint[];
  /**
   * Display names, so a report can say "Left cell" instead of "R3".
   *
   * The solver has no use for them; the overlap report does, and it is produced
   * here because it is a statement about the solved geometry.
   */
  shapeNames?: Record<string, string>;
}

/**
 * Signed area of a shape's closed edge loop. Used to catch inversion, which is
 * the failure mode that looks fine in a screenshot and is wrong in a fabrication
 * drawing.
 */
function signedAreas(sketch: AuthoringSketch): Record<string, number> {
  const byShape: Record<string, { p1: string; p2: string; idx: number }[]> = {};
  for (const seg of Object.values(sketch.segments)) {
    (byShape[seg.shapeId] ??= []).push({ p1: seg.p1, p2: seg.p2, idx: seg.edgeIndex });
  }
  const out: Record<string, number> = {};
  for (const [shapeId, segs] of Object.entries(byShape)) {
    if (segs.length < 3) continue;
    segs.sort((a, b) => a.idx - b.idx);
    let area = 0;
    for (const s of segs) {
      const a = sketch.points[s.p1];
      const b = sketch.points[s.p2];
      if (!a || !b) continue;
      area += a.x * b.y - b.x * a.y;
    }
    out[shapeId] = area / 2;
  }
  return out;
}

function segmentsCross(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
): boolean {
  const d = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function checkTopology(
  before: AuthoringSketch,
  after: AuthoringSketch,
  policy: TolerancePolicy,
  names: Record<string, string> = {}
): TopologyCheck {
  const degenerate: string[] = [];
  for (const seg of Object.values(after.segments)) {
    const a = after.points[seg.p1];
    const b = after.points[seg.p2];
    if (!a || !b) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) < policy.weld_mm) degenerate.push(seg.id);
  }

  const areaBefore = signedAreas(before);
  const areaAfter = signedAreas(after);
  const inverted: string[] = [];
  for (const [shapeId, a] of Object.entries(areaAfter)) {
    const b = areaBefore[shapeId];
    if (b === undefined) continue;
    if (Math.sign(a) !== Math.sign(b) && Math.abs(a) > 1e-6 && Math.abs(b) > 1e-6) {
      inverted.push(shapeId);
    }
  }

  // Self-intersection within one shape's own loop.
  const byShape: Record<string, string[]> = {};
  for (const seg of Object.values(after.segments)) (byShape[seg.shapeId] ??= []).push(seg.id);
  const crossings: string[] = [];
  for (const [shapeId, segIds] of Object.entries(byShape)) {
    if (segIds.length < 4) continue;
    for (let i = 0; i < segIds.length; i++) {
      for (let j = i + 2; j < segIds.length; j++) {
        const s1 = after.segments[segIds[i]];
        const s2 = after.segments[segIds[j]];
        if (s1.p1 === s2.p1 || s1.p1 === s2.p2 || s1.p2 === s2.p1 || s1.p2 === s2.p2) continue;
        if (
          segmentsCross(
            after.points[s1.p1],
            after.points[s1.p2],
            after.points[s2.p1],
            after.points[s2.p2]
          )
        ) {
          crossings.push(shapeId);
          break;
        }
      }
    }
  }

  return {
    // Overlap is deliberately absent from `ok`: see the field's comment.
    ok: degenerate.length === 0 && inverted.length === 0 && crossings.length === 0,
    selfIntersections: [...new Set(crossings)],
    invertedShapeIds: inverted,
    degenerateSegmentIds: degenerate,
    overlaps: detectOverlaps(after, policy, names),
  };
}

/**
 * Re-measures every declared invariant on the solved geometry.
 *
 * This is what lets the UI say "wall thickness held at 300 mm" truthfully rather
 * than assuming the solver got it right because it returned converged.
 */
export function checkInvariants(
  sketch: AuthoringSketch,
  policy: TolerancePolicy
): InvariantCheck[] {
  const sys = buildSystem(sketch);
  const out: InvariantCheck[] = [];
  const tol = Math.max(policy.geometry_mm, 1e-6);

  for (const c of sketch.constraints) {
    if (!isActive(c)) continue;
    if (c.strength === "soft") continue; // soft rules may be relaxed; not invariants
    const { residuals } = evaluateSystem(sketch, { ...sys, active: [c], rowOwners: [] }, sys.X);
    // Angular rows are pure numbers; judge them by how far the edge end strays.
    const lever = isAngularRow(c.kind) ? leverArm(sketch, c, sys.X, sys.index) : 1;
    const err = residuals.reduce((m, r) => Math.max(m, Math.abs(r) * lever), 0);
    const expected = targetOf(c, sketch);
    out.push({
      label: c.label,
      constraintId: c.id,
      ok: err <= tol,
      expected,
      actual: expected + (residuals[0] ?? 0),
      error: err,
    });
  }
  return out;
}

/**
 * Homotopy sub-stepping (§31.5).
 *
 * Levenberg-Marquardt is a local method: asked to double a dimension in one
 * jump it can wander off the branch the author is on and stall. Walking the
 * targets there in a few warm-started steps keeps the geometry on its own
 * branch the whole way, which is both far more reliable and much faster than
 * letting the damping fight a large step.
 *
 * The direct solve is tried first, because for ordinary edits it is one call.
 */
/**
 * How big the drawing is, so convergence can be judged relative to it.
 *
 * §17 permits the scale-aware variant of a tolerance, and this is where it
 * earns its place: a fixed 1e-8 residual is a reasonable demand on a 400 mm
 * detail and an impossible one on a 40 m span, where floating-point noise alone
 * is that size. Judging a 4 m drawing "unsolvable" because a wall was out by
 * a hundredth of a nanometre is a bug, not rigour.
 */
function drawingExtent(sys: ReturnType<typeof buildSystem>): number {
  let maxAbs = 1;
  for (const v of sys.X) maxAbs = Math.max(maxAbs, Math.abs(v));
  return maxAbs;
}

function solveWithHomotopy(
  sketch: AuthoringSketch,
  sys: ReturnType<typeof buildSystem>,
  policy: TolerancePolicy,
  maxIterations: number,
  condensation: RigidCondensation | null
) {
  /**
   * One evaluation, in whichever space the solver is searching.
   *
   * With no rigid group that space is the coordinates themselves and this is
   * the call it always was. With one it is (X0, Y0, theta) per group plus the
   * loose points: the residuals are the SAME geometric statements about the
   * same world points — a distance is still a distance — and only the columns
   * change, by the chain rule through the frame. Nothing that already exists
   * had to be rewritten to benefit, which is the whole reason the condensation
   * sits here rather than inside each constraint.
   */
  const extent = drawingExtent(sys);
  // One unit for every row. A distance residual is millimetres; an angular one
  // is a sine, and the single tolerance below is written in millimetres. Scaling
  // angular rows by the drawing's extent makes them "millimetres at the far
  // side of the drawing", so the same number is equally strict for both. The
  // system's roots are unchanged — a row times a constant has the same zeros.
  const weightsFor = new WeakMap<object, number[]>();
  const weights = (system: typeof sys): number[] => {
    let w = weightsFor.get(system.active);
    if (!w) {
      w = [];
      for (const c of system.active) {
        const n = rowCount(c);
        for (let r = 0; r < n; r++) w.push(isAngularRow(c.kind) ? extent : 1);
      }
      weightsFor.set(system.active, w);
    }
    return w;
  };
  const weigh = (system: typeof sys, out: { residuals: number[]; jacobian: number[][] }) => {
    const w = weights(system);
    for (let r = 0; r < out.residuals.length; r++) {
      if (w[r] === 1 || w[r] === undefined) continue;
      out.residuals[r] *= w[r];
      const row = out.jacobian[r];
      for (let k = 0; k < row.length; k++) row[k] *= w[r];
    }
    return out;
  };
  const evaluate = (s: AuthoringSketch, system: typeof sys, v: number[]) => {
    if (!condensation) return weigh(system, evaluateSystem(s, system, v));
    const X = condensation.expand(v);
    const { residuals, jacobian } = weigh(system, evaluateSystem(s, system, X));
    return { residuals, jacobian: condensation.condenseJacobian(jacobian, v) };
  };
  const model = (s: AuthoringSketch, system: typeof sys) => ({
    evaluateResiduals: (v: number[]) => evaluate(s, system, v).residuals,
    evaluateJacobian: (v: number[]) => evaluate(s, system, v).jacobian,
  });
  const start = condensation ? condensation.reduce(sys.X) : [...sys.X];
  // A residual of `extent x 1e-9` on a 4 m drawing is four nanometres. Demanding
  // better than that is demanding better than double precision can carry, and
  // the gate that actually decides whether an edit is acceptable is the
  // invariant report, which works in engineering millimetres.
  const residualTol = Math.max(policy.solver_residual, extent * 1e-9);
  const lmOptions = {
    maxIterations,
    toleranceResidual: residualTol,
    toleranceStep: Math.max(1e-11, extent * 1e-13),
    epsSingular: policy.singular_value_eps,
  };

  /**
   * Gauss-Newton polish.
   *
   * Levenberg-Marquardt's damping is what makes it robust far from a solution
   * and what makes it crawl near one: this implementation only divides lambda by
   * three per good step, so the last few digits cost dozens of iterations. Once
   * the iterate is close, undamped minimum-norm steps converge quadratically.
   * Each step is accepted only if it actually reduces the residual, so this can
   * improve the answer and cannot damage it.
   */
  const polish = (s: AuthoringSketch, system: typeof sys, result: LMSolverResult): LMSolverResult => {
    if (result.converged) return result;
    let X = [...result.solution];
    let best = result.maxResidual;
    let iterations = result.iterations;
    for (let i = 0; i < 40; i++) {
      const { residuals, jacobian } = evaluate(s, system, X);
      if (jacobian.length === 0) break;
      const step = solveMinimumNormStep(jacobian, residuals, policy.singular_value_eps);
      const trial = X.map((v, k) => v + step[k]);
      const after = evaluate(s, system, trial).residuals;
      const worst = after.reduce((m, r) => Math.max(m, Math.abs(r)), 0);
      iterations++;
      if (!Number.isFinite(worst) || worst >= best) break;
      X = trial;
      best = worst;
      if (best <= residualTol) break;
    }
    return {
      ...result,
      solution: X,
      iterations,
      maxResidual: best,
      converged: best <= residualTol,
      status: best <= residualTol ? "converged" : result.status,
    };
  };

  /** Reduced solution -> world coordinates, so every caller sees full X. */
  const surface = (r: LMSolverResult): LMSolverResult => {
    if (!condensation) return r;
    condensation.commitPoses(r.solution);
    return { ...r, solution: condensation.expand(r.solution) };
  };

  const direct = polish(sketch, sys, solveLevenbergMarquardt(model(sketch, sys), start, lmOptions));
  if (direct.converged) return surface(direct);

  // Where each numeric target currently sits, measured on the start geometry.
  // `residual = measured - target`, so measured = target + residual.
  //
  // An anchor belongs here as much as a dimension does. It was left out at
  // first because it reads as a geometric rule rather than a measurement, and
  // that omission is what made a pinned shape impossible to put back: drag one
  // 300 mm and the direct solve has to swallow the whole displacement in a
  // single bound, which lands it in a local minimum — a rectangle sixteen
  // degrees out of square that no longer lifts back onto a rectangle primitive.
  // Walking the pin home in six steps is the same medicine dimensions already
  // get, and each step is a perturbation the solver handles easily.
  const startTargets = new Map<string, { value: number; valueY?: number }>();
  let cursor = 0;
  const { residuals } = evaluateSystem(sketch, sys, sys.X);
  for (const c of sys.active) {
    const rows = rowCount(c);
    if (c.kind === "fix" && c.value !== undefined && c.valueY !== undefined) {
      startTargets.set(c.id, {
        value: c.value + residuals[cursor],
        valueY: c.valueY + residuals[cursor + 1],
      });
    } else if (c.kind === "centroid_distance") {
      // Its residual is |dC|^2 - D^2, divided by the row scale — neither of
      // which is a distance, so `target + residual` would be meaningless here.
      // Measure the gap directly instead.
      startTargets.set(c.id, { value: measuredCentroidGap(sketch, c, sys.X, sys.index) });
    } else if (c.kind === "angle") {
      // The residual is a cosine difference, not radians; measure the angle.
      startTargets.set(c.id, { value: measuredAngle(sketch, c, sys.X, sys.index) });
    } else if (isDimensional(c)) {
      startTargets.set(c.id, { value: targetOf(c, sketch) + residuals[cursor] });
    }
    cursor += rows;
  }
  if (startTargets.size === 0) return surface(direct);

  let X = [...start];
  let last = direct;
  for (const lambda of [0.15, 0.3, 0.5, 0.7, 0.85, 1]) {
    const staged: AuthoringSketch = {
      ...sketch,
      constraints: sketch.constraints.map((c) => {
        const from = startTargets.get(c.id);
        if (from === undefined) return c;
        if (c.kind === "fix") {
          // An anchor carries its two literals directly; `targetOf` never sees
          // them, so there is no sign or scale to clear here.
          const fromY = from.valueY ?? 0;
          return {
            ...c,
            value: from.value + ((c.value ?? 0) - from.value) * lambda,
            valueY: fromY + ((c.valueY ?? 0) - fromY) * lambda,
          };
        }
        const to = targetOf(c, sketch);
        // The blended literal already carries the sign and the repeat index
        // multiplier, so both are cleared to stop `targetOf` applying them twice.
        return {
          ...c,
          value: from.value + (to - from.value) * lambda,
          sign: 1 as const,
          paramRef: undefined,
          paramScale: undefined,
        };
      }),
    };
    // The staged CONSTRAINTS have to be what the system evaluates, not just what
    // the sketch holds: `evaluateSystem` reads its rows from `system.active`.
    const stagedSys = { ...sys, active: staged.constraints.filter(isActive) };
    last = polish(staged, stagedSys, solveLevenbergMarquardt(model(staged, stagedSys), X, lmOptions));
    if (!last.converged) return surface(last);
    X = last.solution;
  }
  return surface(last);
}

/** The unsigned angle between an `angle` constraint's two edges, in radians. */
function measuredAngle(
  sketch: AuthoringSketch,
  c: SketchConstraint,
  X: number[],
  index: Record<string, number>
): number {
  const dir = (segId: string) => {
    const seg = sketch.segments[segId];
    const a = index[seg.p1];
    const b = index[seg.p2];
    return { x: X[2 * b] - X[2 * a], y: X[2 * b + 1] - X[2 * a + 1] };
  };
  const u = dir(c.segments[0]);
  const v = dir(c.segments[1]);
  const cos = (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) || 1) * (Math.hypot(v.x, v.y) || 1));
  // Radians, like the literal the staging writes (it clears sign and scale).
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** The centre-to-centre gap a `centroid_distance` currently spans, in mm. */
function measuredCentroidGap(
  sketch: AuthoringSketch,
  c: SketchConstraint,
  X: number[],
  index: Record<string, number>
): number {
  if (!c.loopA || !c.loopB) return 0;
  const centre = (loop: string[]) => {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of loop) {
      const i = index[id];
      if (i === undefined) continue;
      x += X[2 * i];
      y += X[2 * i + 1];
      n++;
    }
    return n === 0 ? { x: 0, y: 0 } : { x: x / n, y: y / n };
  };
  const a = centre(c.loopA);
  const b = centre(c.loopB);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function isDimensional(c: SketchConstraint): boolean {
  return (
    c.kind === "distance" ||
    c.kind === "distance_x" ||
    c.kind === "distance_y" ||
    c.kind === "point_line_distance" ||
    c.kind === "angle" ||
    // The addendum's relationships carry numeric targets like any dimension, so
    // they need the same staging. A centre-to-centre gap dropping from 900 to
    // 500 is a 400 mm jump the direct solve will not make in one bound — it
    // settles instead on a compromise that squashes a rectangle, because
    // deforming a box is a cheaper least-squares answer than moving it when the
    // step is that large.
    c.kind === "relative_x" ||
    c.kind === "relative_y" ||
    c.kind === "normal_offset" ||
    c.kind === "centroid_distance" ||
    // An absolute coordinate is a dimension like any other — and a big jump in
    // one is exactly the case the direct solve settles badly.
    c.kind === "position_x" ||
    c.kind === "position_y"
  );
}

/**
 * Runs the full pipeline. On any failure the ORIGINAL sketch comes back, so a
 * caller can assign the result unconditionally and never end up with half-moved
 * geometry.
 */
export function solveSketch(input: AuthoringSketch, options: SolveOptions = {}): SolveOutcome {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;

  // 1. Scalar DAG first: derived parameters become constraint targets.
  const { sketch: withParams, errors: parameterErrors } = refreshParameters(input);

  const working: AuthoringSketch = options.temporary?.length
    ? { ...withParams, constraints: [...withParams.constraints, ...options.temporary] }
    : withParams;

  const sys = buildSystem(working);

  if (sys.X.length === 0 || sys.active.length === 0) {
    return {
      ok: true,
      sketch: withParams,
      converged: true,
      iterations: 0,
      maxResidual: 0,
      invariants: [],
      parameterErrors,
      topology: {
        ok: true,
        selfIntersections: [],
        invertedShapeIds: [],
        degenerateSegmentIds: [],
        overlaps: [],
      },
    };
  }

  // 2. Variational solve. Minimum-norm steps keep the result near where the
  //    author left the geometry, which is what makes edits feel local (§29.4).
  // Rigid groups change the SPACE the solver searches, so they are settled
  // before it starts, from the coordinates as they now stand (§4.2).
  const condensation = condensationFor(working, sys);

  const result = solveWithHomotopy(working, sys, policy, options.maxIterations ?? 300, condensation);

  const solvedFull = applySolution(working, sys, result.solution);
  const solved: AuthoringSketch = { ...solvedFull, constraints: withParams.constraints };

  const topology = checkTopology(withParams, solved, policy, options.shapeNames);
  const invariants = checkInvariants(solved, policy);

  if (options.preview) {
    return {
      ok: true,
      sketch: solved,
      converged: result.converged,
      iterations: result.iterations,
      maxResidual: result.maxResidual,
      invariants,
      parameterErrors,
      topology,
    };
  }

  // 3. The gate. Any of these means the edit did not do what the author asked.
  let rejection: string | undefined;

  // What decides whether an edit is acceptable is the INVARIANT REPORT, not the
  // solver's own convergence flag (§5).
  //
  // Those are different questions. "Converged" asks whether the residual fell
  // below a numerical threshold; "correct" asks whether every relationship the
  // author declared still holds, in millimetres. On a ten-metre drawing with
  // thirty degrees of freedom the solver can settle thirteen micrometres away
  // from perfect and stay there — which satisfies every declared relationship a
  // thousand times over, and which the old rule threw away with "the
  // requirements cannot all hold at once". That message was also simply untrue:
  // nothing conflicted.
  //
  // So a failure to converge is only a refusal when something real is broken
  // with it. When it is, the message names what.
  const brokenNow = invariants
    .filter((i) => !i.ok)
    .sort((a, b) => b.error - a.error);

  if (!result.converged && brokenNow.length > 0) {
    rejection = `Those values cannot all hold at once. The requirements that disagree are: ${brokenNow
      .slice(0, 3)
      .map((i) => `${i.label} (out by ${i.error.toFixed(1)})`)
      .join("; ")}. Nothing was changed.`;
  } else if (!topology.ok) {
    if (topology.invertedShapeIds.length > 0) {
      rejection = `That value turns ${topology.invertedShapeIds.length === 1 ? "a shape" : "shapes"} inside out. Nothing was changed.`;
    } else if (topology.degenerateSegmentIds.length > 0) {
      rejection = "That value collapses an edge to nothing. Nothing was changed.";
    } else {
      rejection = "That value makes edges cross themselves. Nothing was changed.";
    }
  } else if (brokenNow.length > 0) {
    rejection = `The drawing would no longer honour: ${brokenNow
      .slice(0, 3)
      .map((i) => i.label)
      .join("; ")}. Nothing was changed.`;
  }

  if (rejection) {
    return {
      ok: false,
      sketch: input,
      converged: result.converged,
      iterations: result.iterations,
      maxResidual: result.maxResidual,
      invariants,
      rejection,
      parameterErrors,
      topology,
    };
  }

  return {
    ok: true,
    sketch: solved,
    // Report what the solver actually did, not what the gate decided.
    //
    // These are two different questions and this used to answer the second one
    // twice: an edit that passed the invariant report came back flagged
    // `converged: true` whatever the residual was. That hid a genuine stall —
    // a large anchored drag settling sixteen degrees out of square — behind a
    // clean-looking result, because every downstream check was reading a
    // constant. Acceptance is still the invariant report; this field is now
    // just the truth about the numerics.
    converged: result.converged,
    iterations: result.iterations,
    maxResidual: result.maxResidual,
    invariants,
    parameterErrors,
    topology,
  };
}

/**
 * Drag a point and let the constraint system decide what follows.
 *
 * This is the bidirectional half of §12: the grip does not write coordinates,
 * it adds a temporary target row and the solver works out which parameters and
 * vertices must move to honour it while every accepted relationship holds.
 */
export function dragPoint(
  sketch: AuthoringSketch,
  pointId: string,
  target: { x: number; y: number },
  options: SolveOptions = {}
): SolveOutcome {
  const temp: SketchConstraint = {
    id: `__drag__${pointId}`,
    kind: "fix",
    points: [pointId],
    segments: [],
    value: target.x,
    valueY: target.y,
    strength: "hard",
    driving: true,
    state: "active",
    label: "drag target",
    provenance: { origin: "user", detail: "Live drag", createdAt: Date.now() },
  };
  return solveSketch(sketch, { ...options, temporary: [temp], preview: true });
}
