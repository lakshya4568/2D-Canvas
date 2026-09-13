/**
 * Rigid components as 3-DOF super-nodes (UPCE-ADDENDUM-2.0 §4).
 *
 * Grouping used to be a label. You selected some lines, called them a component,
 * and the solver went on treating them as 2k loose coordinates — so constraining
 * one edge of the group to something outside it pulled that edge and left the
 * rest of the loop behind, skewed. The group was a group in the panel and not in
 * the mathematics.
 *
 * A rigid component has three degrees of freedom, not 2k:
 *
 *     q = [X0, Y0, theta]
 *
 * Every vertex keeps FIXED local coordinates (u_i, v_i) measured in the
 * component's own frame, and its world position is whatever the frame says:
 *
 *     P_i = [ X0 + u_i cos(t) - v_i sin(t),
 *             Y0 + u_i sin(t) + v_i cos(t) ]
 *
 * Distortion is then not something the solver is discouraged from doing. It is
 * something it cannot express: there is no vector in the reduced state space
 * that changes one vertex relative to another. Internal lengths and angles are
 * preserved exactly, to machine precision, for free.
 *
 * `condense` is what makes this usable with constraints that were written
 * against plain coordinates. A residual still sees world points and still
 * reports a gradient in world coordinates; this maps that gradient onto the
 * three component DOFs by the chain rule:
 *
 *     dP/dX0 = [1, 0]
 *     dP/dY0 = [0, 1]
 *     dP/dtheta = [-u sin(t) - v cos(t),  u cos(t) - v sin(t)]
 *
 * so nothing that already exists has to be rewritten to benefit.
 */

import { Point2D } from "../topology/types";

/** A component's placement: origin in world space plus a rotation. */
export interface ComponentPose {
  x0: number;
  y0: number;
  /** Radians. */
  theta: number;
}

/**
 * How hard a grouped body resists turning, relative to sliding.
 *
 * A body held by one dimension and nothing else is under-determined: it can
 * satisfy that dimension by moving, by turning, or by any mixture. Left to
 * itself the minimum-norm step takes the mixture — and it is right to, because
 * turning genuinely does move the other vertices less. It is also not what
 * anybody means. A draftsman who dimensions one edge of a grouped section to a
 * datum expects the section to SLIDE; a section that arrives twenty-four degrees
 * out of square while reporting every internal length intact is exactly the
 * "behaving ridiculously" this is meant to prevent.
 *
 * So the rotational freedom is weighted, in the same spirit as the Jacobian
 * column damping of §7 Module 2. This changes only how freedom is DISTRIBUTED
 * inside the solution set — never which solutions exist. A rule that can only be
 * satisfied by turning still turns the body; it simply will not turn it by
 * accident to save a few millimetres elsewhere.
 *
 * The value is chosen from what it leaves behind. A body held by one dimension
 * and nothing else settles with a residual tilt that falls as `1 / k^2`; at 500
 * that is under a micrometre across a half-metre section — three orders of
 * magnitude below the weld tolerance, and below anything a drawing records. It is not so large that a rotation the rules DO require
 * becomes hard to reach: the column stays four orders of magnitude above the
 * singular-value floor, so the pseudo-inverse still turns the body when turning
 * is the only way.
 */
export const ROTATION_STIFFNESS = 500;

export interface RigidComponentSpec {
  id: string;
  /**
   * Indices into the ORIGINAL full coordinate state vector of every point this
   * component owns. Ownership is exclusive: a point belongs to at most one rigid
   * component, because two frames cannot both dictate where it is.
   */
  pointIndices: number[];
  /** Where the frame sits when the local coordinates were taken. */
  pose: ComponentPose;
  /** Local coordinates, parallel to `pointIndices`. */
  local: Point2D[];
  /**
   * The solver's third variable is `s = rotationScale * theta`, not theta.
   *
   * Two reasons, and both of them are about making one unit of each variable
   * mean the same amount of drawing. Radians and millimetres are not comparable,
   * so an unscaled pseudo-inverse treats a radian as costing the same as a
   * millimetre and spins a metre-wide body to save a hair's breadth of travel.
   * Dividing by the body's radius of gyration fixes the units — and, because the
   * frame origin is the centroid, it does something better than that: the three
   * columns of dX/dq become mutually orthogonal with equal norm, so a
   * minimum-norm step in the reduced space IS the minimum movement on the sheet.
   * The stiffness factor then sits on top of that as a stated preference.
   */
  rotationScale: number;
}

/**
 * Freezes a set of points into a rigid body.
 *
 * The pose is seeded at the centroid of the selection with zero rotation, and
 * the local coordinates are read off the current geometry — so creating a
 * component never moves anything. It only changes how the solver is allowed to
 * move it afterwards.
 */
export function createRigidComponent(
  id: string,
  X: number[],
  pointIndices: number[]
): RigidComponentSpec {
  let cx = 0;
  let cy = 0;
  for (const i of pointIndices) {
    cx += X[2 * i];
    cy += X[2 * i + 1];
  }
  const n = Math.max(1, pointIndices.length);
  cx /= n;
  cy /= n;

  const pose: ComponentPose = { x0: cx, y0: cy, theta: 0 };
  const local: Point2D[] = pointIndices.map((i) => ({
    x: X[2 * i] - cx,
    y: X[2 * i + 1] - cy,
  }));

  // Radius of gyration about the centroid. Guarded below 1 mm so a degenerate
  // selection — two coincident points — cannot divide by nothing.
  const gyration = Math.sqrt(local.reduce((sum, p) => sum + p.x * p.x + p.y * p.y, 0) / n);

  return {
    id,
    pointIndices,
    pose,
    local,
    rotationScale: Math.max(1, gyration) * ROTATION_STIFFNESS,
  };
}

/** World position of one of a component's points under a given pose. */
export function worldPointOf(spec: RigidComponentSpec, slot: number, pose: ComponentPose): Point2D {
  const { x: u, y: v } = spec.local[slot];
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  return {
    x: pose.x0 + u * c - v * s,
    y: pose.y0 + u * s + v * c,
  };
}

/**
 * The 2 x 3 block dP/d[X0, Y0, theta] for one point, as a flat row-major array:
 *   [ dPx/dX0, dPx/dY0, dPx/dtheta,
 *     dPy/dX0, dPy/dY0, dPy/dtheta ]
 */
export function poseJacobianOf(spec: RigidComponentSpec, slot: number, pose: ComponentPose): number[] {
  const { x: u, y: v } = spec.local[slot];
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  return [1, 0, -u * s - v * c, 0, 1, u * c - v * s];
}

/** Pose held in a reduced vector, undoing the rotation scaling. */
function poseFrom(spec: RigidComponentSpec, q: number[], base: number): ComponentPose {
  return { x0: q[base], y0: q[base + 1], theta: q[base + 2] / spec.rotationScale };
}

/**
 * The mapping between a reduced state vector and the full coordinate vector.
 *
 * Reduced layout: every point that no component owns keeps its own two slots, in
 * their original order; each rigid component then contributes three slots at the
 * end. Keeping free points first means an existing anchored-index or drag-target
 * list that refers to free geometry stays valid without translation.
 */
export class RigidCondensation {
  readonly freePoints: number[] = [];
  readonly components: RigidComponentSpec[];
  /** reduced slot where each component's (X0, Y0, theta) triple begins. */
  private readonly componentBase = new Map<string, number>();
  /** point index -> [component, slot within that component] */
  private readonly owner = new Map<number, { spec: RigidComponentSpec; slot: number }>();
  private readonly freeSlot = new Map<number, number>();
  readonly reducedSize: number;
  readonly fullSize: number;

  constructor(fullPointCount: number, components: RigidComponentSpec[]) {
    this.components = components;
    this.fullSize = 2 * fullPointCount;

    for (const spec of components) {
      spec.pointIndices.forEach((pointIndex, slot) => {
        if (this.owner.has(pointIndex)) {
          throw new Error(
            `point ${pointIndex} is claimed by two rigid components; a point can only belong to one frame`
          );
        }
        this.owner.set(pointIndex, { spec, slot });
      });
    }

    let cursor = 0;
    for (let i = 0; i < fullPointCount; i++) {
      if (this.owner.has(i)) continue;
      this.freePoints.push(i);
      this.freeSlot.set(i, cursor);
      cursor += 2;
    }
    for (const spec of components) {
      this.componentBase.set(spec.id, cursor);
      cursor += 3;
    }
    this.reducedSize = cursor;
  }

  /** Builds the reduced state vector from the current full coordinates and poses. */
  public reduce(X: number[]): number[] {
    const q = new Array<number>(this.reducedSize).fill(0);
    for (const i of this.freePoints) {
      const slot = this.freeSlot.get(i)!;
      q[slot] = X[2 * i];
      q[slot + 1] = X[2 * i + 1];
    }
    for (const spec of this.components) {
      const base = this.componentBase.get(spec.id)!;
      q[base] = spec.pose.x0;
      q[base + 1] = spec.pose.y0;
      q[base + 2] = spec.pose.theta * spec.rotationScale;
    }
    return q;
  }

  /** Expands a reduced state vector back into full world coordinates. */
  public expand(q: number[]): number[] {
    const X = new Array<number>(this.fullSize).fill(0);
    for (const i of this.freePoints) {
      const slot = this.freeSlot.get(i)!;
      X[2 * i] = q[slot];
      X[2 * i + 1] = q[slot + 1];
    }
    for (const spec of this.components) {
      const base = this.componentBase.get(spec.id)!;
      const pose = poseFrom(spec, q, base);
      spec.pointIndices.forEach((pointIndex, slot) => {
        const p = worldPointOf(spec, slot, pose);
        X[2 * pointIndex] = p.x;
        X[2 * pointIndex + 1] = p.y;
      });
    }
    return X;
  }

  /** Writes the poses in `q` back onto the component specs, so they persist. */
  public commitPoses(q: number[]): void {
    for (const spec of this.components) {
      const base = this.componentBase.get(spec.id)!;
      spec.pose = poseFrom(spec, q, base);
    }
  }

  /**
   * Maps a Jacobian written in full coordinates onto the reduced DOFs.
   *
   * J_reduced = J_full * dX/dq. Done row by row so a constraint that touches one
   * component and one loose line produces a row with entries in both regions,
   * which is exactly what lets an external line drag a whole component.
   */
  public condenseJacobian(jacobianFull: number[][], q: number[]): number[][] {
    const out: number[][] = new Array(jacobianFull.length);

    for (let r = 0; r < jacobianFull.length; r++) {
      const src = jacobianFull[r];
      const row = new Array<number>(this.reducedSize).fill(0);

      for (const i of this.freePoints) {
        const slot = this.freeSlot.get(i)!;
        row[slot] += src[2 * i];
        row[slot + 1] += src[2 * i + 1];
      }

      for (const spec of this.components) {
        const base = this.componentBase.get(spec.id)!;
        const pose = poseFrom(spec, q, base);
        const w = 1 / spec.rotationScale;
        spec.pointIndices.forEach((pointIndex, slot) => {
          const dPx = src[2 * pointIndex];
          const dPy = src[2 * pointIndex + 1];
          if (dPx === 0 && dPy === 0) return;
          const J = poseJacobianOf(spec, slot, pose);
          // row += [dr/dPx, dr/dPy] * (2x3 block), the last column in ds not dtheta
          row[base] += dPx * J[0] + dPy * J[3];
          row[base + 1] += dPx * J[1] + dPy * J[4];
          row[base + 2] += (dPx * J[2] + dPy * J[5]) * w;
        });
      }

      out[r] = row;
    }

    return out;
  }

  /**
   * dX/dq at `q`: how a reduced motion shows up in world coordinates.
   *
   * `condenseJacobian` computes J_full . B without ever forming B, which is the
   * right thing when all you want is the product. A degree-of-freedom report
   * wants the other direction: it finds the null space in REDUCED coordinates
   * and then has to say which lines on the sheet are free to move, in
   * millimetres. That answer is B v, so B has to exist.
   */
  public tangentMatrix(q: number[]): number[][] {
    const B: number[][] = [];
    for (let r = 0; r < this.fullSize; r++) B.push(new Array<number>(this.reducedSize).fill(0));

    for (const i of this.freePoints) {
      const slot = this.freeSlot.get(i)!;
      B[2 * i][slot] = 1;
      B[2 * i + 1][slot + 1] = 1;
    }

    for (const spec of this.components) {
      const base = this.componentBase.get(spec.id)!;
      const pose = poseFrom(spec, q, base);
      const w = 1 / spec.rotationScale;
      spec.pointIndices.forEach((pointIndex, slot) => {
        const J = poseJacobianOf(spec, slot, pose);
        B[2 * pointIndex][base] = J[0];
        B[2 * pointIndex][base + 1] = J[1];
        B[2 * pointIndex][base + 2] = J[2] * w;
        B[2 * pointIndex + 1][base] = J[3];
        B[2 * pointIndex + 1][base + 1] = J[4];
        B[2 * pointIndex + 1][base + 2] = J[5] * w;
      });
    }

    return B;
  }

  /** Reduced slot where a component's pose triple starts, for anchoring or drag. */
  public componentSlot(componentId: string): number | undefined {
    return this.componentBase.get(componentId);
  }

  /** Reduced slot for a free point's x coordinate, or undefined if it is owned. */
  public freePointSlot(pointIndex: number): number | undefined {
    return this.freeSlot.get(pointIndex);
  }
}

/**
 * Wraps a coordinate-space system model so the solver sees only reduced DOFs.
 *
 * The residuals are unchanged — they are still the same geometric statements
 * about the same world points. Only the space the solver searches has shrunk,
 * and shrunk in a way that removes exactly the motions a rigid body is not
 * allowed to make.
 */
export function condenseSystemModel(
  model: { evaluateResiduals(X: number[]): number[]; evaluateJacobian(X: number[]): number[][] },
  condensation: RigidCondensation
): { evaluateResiduals(q: number[]): number[]; evaluateJacobian(q: number[]): number[][] } {
  return {
    evaluateResiduals(q: number[]): number[] {
      return model.evaluateResiduals(condensation.expand(q));
    },
    evaluateJacobian(q: number[]): number[][] {
      const X = condensation.expand(q);
      return condensation.condenseJacobian(model.evaluateJacobian(X), q);
    },
  };
}
