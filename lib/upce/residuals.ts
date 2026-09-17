/**
 * Constraint -> residual rows + analytical Jacobian rows.
 *
 * The state vector X holds every sketch point: point i occupies X[2i], X[2i+1].
 * That is the layout `lib/solver/jacobians/analyticalJacobians.ts` already uses,
 * so the verified derivative code is reused unchanged and only the handful of
 * rows it does not cover are added here.
 *
 * §22: a constraint is stored abstractly and compiled at solve time. Nothing in
 * this file knows what a wall or a span is.
 */

import { createMatrix } from "../solver/matrix/denseMatrix";
import { ConstraintEvaluationResult } from "../solver/jacobians/types";
import {
  evaluateCoincidentConstraint,
  evaluateHorizontalConstraint,
  evaluateVerticalConstraint,
  evaluateDistanceConstraint,
  evaluatePointOnLineConstraint,
  evaluateParallelConstraint,
  evaluatePerpendicularConstraint,
  evaluateWallThicknessConstraint,
  evaluateAngleConstraint,
  evaluateSymmetryConstraint,
  evaluateMidpointConstraint,
} from "../solver/jacobians/analyticalJacobians";
import { AuthoringSketch, SketchConstraint } from "./types";
import {
  evaluateRelativeOffsetX,
  evaluateRelativeOffsetY,
  evaluateDirectedNormalOffset,
} from "../parametric/constraints/relativeLineConstraint";
import { evaluateCentroidDistanceConstraint } from "../parametric/constraints/centroidConstraint";

export interface CompiledSystem {
  /** Point id -> index in X. */
  index: Record<string, number>;
  /** Index -> point id. */
  ids: string[];
  /** Current coordinate vector. */
  X: number[];
  /** One entry per residual row, naming the constraint that produced it. */
  rowOwners: string[];
  /** Constraints that contributed rows, in row order. */
  active: SketchConstraint[];
}

export interface EvaluatedSystem {
  residuals: number[];
  jacobian: number[][];
}

/** Constraints that remove degrees of freedom. Reference/suppressed ones do not. */
export function isActive(c: SketchConstraint): boolean {
  return c.state !== "suppressed" && c.strength !== "reference" && c.driving;
}

export function buildSystem(sketch: AuthoringSketch): CompiledSystem {
  const ids = [...sketch.pointOrder];
  const index: Record<string, number> = {};
  ids.forEach((id, i) => (index[id] = i));
  const X: number[] = [];
  for (const id of ids) {
    const p = sketch.points[id];
    X.push(p.x, p.y);
  }
  const active = sketch.constraints.filter(isActive);
  const rowOwners: string[] = [];
  for (const c of active) {
    const n = rowCount(c);
    for (let i = 0; i < n; i++) rowOwners.push(c.id);
  }
  return { index, ids, X, rowOwners, active };
}

/** How many residual rows a constraint contributes. */
/**
 * Every point a constraint actually depends on.
 *
 * Reading `c.points` and the endpoints of `c.segments` used to be the whole
 * answer, and a `centroid_distance` broke that assumption the moment it arrived:
 * it names two whole boundaries and neither of them appears in either field. Any
 * caller that partitions or filters on a constraint's reach — the DOF block
 * decomposition does both — silently dropped the loops and then tried to
 * evaluate a row against a subsystem that did not contain half its inputs.
 *
 * One helper, used by all of them, so the next constraint shaped like this
 * cannot reintroduce the same bug in a different file.
 */
export function referencedPoints(sketch: AuthoringSketch, c: SketchConstraint): string[] {
  const out: string[] = [...c.points];
  for (const s of c.segments) {
    const seg = sketch.segments[s];
    if (seg) out.push(seg.p1, seg.p2);
  }
  if (c.loopA) out.push(...c.loopA);
  if (c.loopB) out.push(...c.loopB);
  return out;
}

export function rowCount(c: SketchConstraint): number {
  switch (c.kind) {
    case "fix":
    case "coincident":
    case "midpoint":
    case "symmetric":
    case "concentric":
      return 2;
    default:
      return 1;
  }
}

/**
 * Resolves a constraint's numeric target: a parameter value when bound,
 * otherwise the literal.
 */
export function targetOf(c: SketchConstraint, sketch: AuthoringSketch): number {
  const sign = (c.sign ?? 1) * (c.paramScale ?? 1);
  if (c.paramRef) {
    const p = sketch.parameters[c.paramRef];
    if (p) return sign * p.value;
  }
  return (c.sign ?? 1) * (c.value ?? 0);
}

function endpoints(sketch: AuthoringSketch, segId: string): [string, string] {
  const s = sketch.segments[segId];
  if (!s) throw new Error(`unknown segment ${segId}`);
  return [s.p1, s.p2];
}

/**
 * One coordinate of one point, held at a value.
 *
 * r = X[2i + axis] - target, so the gradient is a single 1. Nothing simpler
 * exists in the file and nothing needed to: the whole content of "be here" is
 * that one number.
 */
function coordinateRow(X: number[], idx: number, axis: 0 | 1, target: number): ConstraintEvaluationResult {
  const jac = createMatrix(1, X.length);
  jac[0][2 * idx + axis] = 1;
  return { residuals: [X[2 * idx + axis] - target], jacobian: jac };
}

function fixRows(X: number[], idx: number, tx: number, ty: number): ConstraintEvaluationResult {
  const jac = createMatrix(2, X.length);
  jac[0][2 * idx] = 1;
  jac[1][2 * idx + 1] = 1;
  return { residuals: [X[2 * idx] - tx, X[2 * idx + 1] - ty], jacobian: jac };
}

function axisDistanceRow(
  X: number[],
  idxA: number,
  idxB: number,
  axis: 0 | 1,
  target: number
): ConstraintEvaluationResult {
  const jac = createMatrix(1, X.length);
  jac[0][2 * idxA + axis] = -1;
  jac[0][2 * idxB + axis] = 1;
  return { residuals: [X[2 * idxB + axis] - X[2 * idxA + axis] - target], jacobian: jac };
}

function equalLengthRow(
  X: number[],
  a1: number,
  a2: number,
  b1: number,
  b2: number
): ConstraintEvaluationResult {
  const jac = createMatrix(1, X.length);
  const ax = X[2 * a2] - X[2 * a1];
  const ay = X[2 * a2 + 1] - X[2 * a1 + 1];
  const bx = X[2 * b2] - X[2 * b1];
  const by = X[2 * b2 + 1] - X[2 * b1 + 1];
  const la = Math.hypot(ax, ay) + 1e-15;
  const lb = Math.hypot(bx, by) + 1e-15;

  // Accumulate, never assign: two edges that share a vertex land on the same
  // column twice and an assignment would silently drop one of the terms.
  jac[0][2 * a1] += -ax / la;
  jac[0][2 * a1 + 1] += -ay / la;
  jac[0][2 * a2] += ax / la;
  jac[0][2 * a2 + 1] += ay / la;
  jac[0][2 * b1] += bx / lb;
  jac[0][2 * b1 + 1] += by / lb;
  jac[0][2 * b2] += -bx / lb;
  jac[0][2 * b2 + 1] += -by / lb;

  return { residuals: [la - lb], jacobian: jac };
}

/**
 * Row scaling — a diagonal preconditioner, and the reason large drawings solve.
 *
 * The residual families here carry different units. A distance residual is in
 * millimetres; a parallel residual is a 2-D cross product, so it grows with the
 * PRODUCT of the two edge lengths. On a 4 m frame that is a factor of 10^7
 * between rows of the same matrix, and Levenberg-Marquardt spends hundreds of
 * iterations fighting the conditioning that creates. The same drawing at 400 mm
 * converges in four.
 *
 * Dividing a row and its residual by the same non-zero factor is a weighted
 * least-squares reweighting: it cannot move the solution set, because F = 0 and
 * sF = 0 have identical roots, and it cannot change the matrix rank. What it
 * does change is that a parallel residual becomes the sine of the angle between
 * the edges, which is both better conditioned and a number a tolerance in
 * radians can meaningfully be compared against.
 */
export function rowScale(sketch: AuthoringSketch, c: SketchConstraint, X: number[], I: Record<string, number>): number {
  const lengthOf = (segId: string): number => {
    const seg = sketch.segments[segId];
    if (!seg) return 1;
    const a = I[seg.p1];
    const b = I[seg.p2];
    if (a === undefined || b === undefined) return 1;
    return Math.hypot(X[2 * b] - X[2 * a], X[2 * b + 1] - X[2 * a + 1]) || 1;
  };

  switch (c.kind) {
    case "parallel":
    case "perpendicular":
      return lengthOf(c.segments[0]) * lengthOf(c.segments[1]);
    // An angle residual is already a difference of cosines — no units to take
    // out. Dividing it by two lengths again, as this once did, shrank it by the
    // square of the drawing size: on metre-long edges a 30° error read as 1e-7
    // and passed every tolerance, so an angle dimension held nothing.
    case "angle":
      return 1;
    case "horizontal":
    case "vertical":
    case "point_on_line":
    case "symmetric":
      return lengthOf(c.segments[0]);
    case "centroid_distance": {
      // The residual is |dC|^2 - D^2: square millimetres. Dividing by the
      // target brings it back to millimetres so a millimetre tolerance means
      // what it says — the same units mistake that made a corner square to
      // three thousandths of a degree read as a 1.6 mm contradiction.
      const target = Math.abs(targetOf(c, sketch));
      return target > 1 ? 2 * target : 1;
    }
    default:
      return 1;
  }
}

/**
 * Rows whose scaled residual is a pure number (the sine or cosine of an angle)
 * rather than a length.
 *
 * Every tolerance in the kernel is written in millimetres, and a pure number
 * compared against one means nothing: a 1e-5 sine passes a 1e-5 mm tolerance,
 * and on an 11 m edge it is a tenth of a millimetre out at the far end. Callers
 * that judge a residual convert these rows to millimetres with `leverArm`.
 */
export function isAngularRow(kind: SketchConstraint["kind"]): boolean {
  return kind === "parallel" || kind === "perpendicular" || kind === "horizontal" || kind === "vertical" || kind === "angle";
}

/**
 * The length an angular residual acts over, in mm: how far the end of the
 * shorter edge involved moves per radian. Multiplying a sine by it gives the
 * deviation a draftsman would measure.
 */
export function leverArm(sketch: AuthoringSketch, c: SketchConstraint, X: number[], I: Record<string, number>): number {
  const lengths = c.segments.map((segId) => {
    const seg = sketch.segments[segId];
    const a = seg && I[seg.p1];
    const b = seg && I[seg.p2];
    if (a === undefined || b === undefined) return 1;
    return Math.hypot(X[2 * b] - X[2 * a], X[2 * b + 1] - X[2 * a + 1]) || 1;
  });
  return lengths.length ? Math.max(...lengths) : 1;
}

/**
 * Evaluates every active constraint at X and stacks the rows.
 * `sys.X` is not read; the caller passes the vector so the same compiled system
 * can be evaluated repeatedly during the solve.
 */
export function evaluateSystem(
  sketch: AuthoringSketch,
  sys: CompiledSystem,
  X: number[]
): EvaluatedSystem {
  const residuals: number[] = [];
  const jacobian: number[][] = [];
  const I = sys.index;

  for (const c of sys.active) {
    const res = evaluateConstraint(sketch, c, X, I);
    const s = rowScale(sketch, c, X, I);
    if (s === 1) {
      residuals.push(...res.residuals);
      jacobian.push(...res.jacobian);
    } else {
      for (let r = 0; r < res.residuals.length; r++) {
        residuals.push(res.residuals[r] / s);
        const row = res.jacobian[r];
        const scaled = new Array<number>(row.length);
        for (let k = 0; k < row.length; k++) scaled[k] = row[k] / s;
        jacobian.push(scaled);
      }
    }
  }

  return { residuals, jacobian };
}

export function evaluateConstraint(
  sketch: AuthoringSketch,
  c: SketchConstraint,
  X: number[],
  I: Record<string, number>
): ConstraintEvaluationResult {
  const p = (id: string) => {
    const i = I[id];
    if (i === undefined) throw new Error(`constraint ${c.id} references unknown point ${id}`);
    return i;
  };
  const segPts = (segId: string): [number, number] => {
    const [a, b] = endpoints(sketch, segId);
    return [p(a), p(b)];
  };
  const target = targetOf(c, sketch);

  switch (c.kind) {
    case "fix": {
      // An anchor pins the point where it stood when the author placed it, so
      // both literals are stored on the constraint and travel with the template.
      const i = p(c.points[0]);
      return fixRows(X, i, c.value ?? X[2 * i], c.valueY ?? X[2 * i + 1]);
    }
    case "coincident":
      return evaluateCoincidentConstraint(X, p(c.points[0]), p(c.points[1]));
    case "horizontal": {
      const [a, b] = segPts(c.segments[0]);
      return evaluateHorizontalConstraint(X, a, b);
    }
    case "vertical": {
      const [a, b] = segPts(c.segments[0]);
      return evaluateVerticalConstraint(X, a, b);
    }
    case "parallel": {
      const [a, b] = segPts(c.segments[0]);
      const [d, e] = segPts(c.segments[1]);
      return evaluateParallelConstraint(X, a, b, d, e);
    }
    case "perpendicular": {
      const [a, b] = segPts(c.segments[0]);
      const [d, e] = segPts(c.segments[1]);
      return evaluatePerpendicularConstraint(X, a, b, d, e);
    }
    case "equal_length": {
      const [a, b] = segPts(c.segments[0]);
      const [d, e] = segPts(c.segments[1]);
      return equalLengthRow(X, a, b, d, e);
    }
    case "point_on_line": {
      const [a, b] = segPts(c.segments[0]);
      return evaluatePointOnLineConstraint(X, p(c.points[0]), a, b);
    }
    case "midpoint": {
      const [a, b] = segPts(c.segments[0]);
      return evaluateMidpointConstraint(X, p(c.points[0]), a, b);
    }
    case "symmetric": {
      const [a, b] = segPts(c.segments[0]);
      return evaluateSymmetryConstraint(X, p(c.points[0]), p(c.points[1]), a, b);
    }
    case "distance":
      return evaluateDistanceConstraint(X, p(c.points[0]), p(c.points[1]), target);
    case "distance_x":
      return axisDistanceRow(X, p(c.points[0]), p(c.points[1]), 0, target);
    case "distance_y":
      return axisDistanceRow(X, p(c.points[0]), p(c.points[1]), 1, target);
    case "position_x":
      return coordinateRow(X, p(c.points[0]), 0, target);
    case "position_y":
      return coordinateRow(X, p(c.points[0]), 1, target);
    case "point_line_distance": {
      const [a, b] = segPts(c.segments[0]);
      return evaluateWallThicknessConstraint(X, a, b, p(c.points[0]), target);
    }
    case "angle": {
      const [a, b] = segPts(c.segments[0]);
      const [d, e] = segPts(c.segments[1]);
      return evaluateAngleConstraint(X, a, b, d, e, target);
    }
    case "concentric":
      return evaluateCoincidentConstraint(X, p(c.points[0]), p(c.points[1]));

    // --- Relationships the author asserts, ADDENDUM-2.0 §2.1 and §2.2. ---
    //
    // Each takes TWO segments and relates the second to the first. The
    // separation is measured between midpoints rather than endpoints, so the
    // relationship says where one line sits relative to the other and nothing
    // about their lengths or their end alignment — which is what leaves the
    // remaining freedom for other rules to claim.
    case "relative_x":
    case "relative_y": {
      const [a, b] = segPts(c.segments[0]);
      const [d, e] = segPts(c.segments[1]);
      const spec = { p1: a, p2: b, p3: d, p4: e, target };
      return c.kind === "relative_x"
        ? evaluateRelativeOffsetX(X, spec)
        : evaluateRelativeOffsetY(X, spec);
    }
    case "normal_offset": {
      const [a, b] = segPts(c.segments[0]);
      const [d, e] = segPts(c.segments[1]);
      return evaluateDirectedNormalOffset(X, { p1: a, p2: b, p3: d, p4: e, target });
    }
    case "centroid_distance": {
      if (!c.loopA || !c.loopB) throw new Error(`${c.id} has no loops to take centroids of`);
      return evaluateCentroidDistanceConstraint(X, {
        loopA: c.loopA.map(p),
        loopB: c.loopB.map(p),
        targetDistance: target,
      });
    }
    default: {
      const never: never = c.kind;
      throw new Error(`unhandled constraint kind ${never}`);
    }
  }
}

/** Writes a solved X back onto the sketch's points. */
export function applySolution(sketch: AuthoringSketch, sys: CompiledSystem, X: number[]): AuthoringSketch {
  const points = { ...sketch.points };
  sys.ids.forEach((id, i) => {
    points[id] = { ...points[id], x: X[2 * i], y: X[2 * i + 1] };
  });
  return { ...sketch, points };
}
