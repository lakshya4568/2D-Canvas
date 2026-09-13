/**
 * Groups that move as one piece (UPCE-ADDENDUM-2.0 §4, notebook pages 3 and 5).
 *
 * The notebook asks for this twice and in the most general terms it could:
 *
 *     "first it consider a closed structure as a single unit (not a cell)
 *      but a type of component"
 *     "whether its a line, rect, triangle or anything ... group it ->
 *      treat as single component"
 *
 * so nothing in this file may ask what the group represents. It takes a set of
 * shape ids, finds the sketch points those shapes read, and hands the solver a
 * frame instead of a pile of coordinates. Lines, rectangles, triangles,
 * polylines and a haunched culvert cell all arrive here as the same thing: a
 * list of point indices.
 *
 * The one rule that needs stating is OWNERSHIP. A point belongs to the group if
 * ANY shape that reads it is in the group — not all of them. That sounds lax
 * until you look at what it buys: a loose line welded to a corner of the group
 * follows the group, which is exactly what a draftsman means by welding it
 * there. The strict reading would leave the weld behind and tear the drawing
 * open the first time the group moved.
 *
 * The corollary is that two rigid groups cannot share a point, because two
 * frames cannot both say where it is. That is refused at authoring time, in a
 * sentence, rather than throwing out of the solver later.
 */

import {
  RigidComponentSpec,
  RigidCondensation,
  createRigidComponent,
} from "../geometry/lcs/componentFrame";
import { Shape } from "../geometry/types";
import { AuthoringSketch, ComponentDefinition } from "./types";
import { CompiledSystem } from "./residuals";

/** Components the author has declared rigid, in a stable order. */
export function rigidComponents(sketch: AuthoringSketch): ComponentDefinition[] {
  return sketch.components.filter((c) => c.rigid);
}

/**
 * Sketch points a component's shapes read, as indices into the state vector.
 *
 * Sorted, so the local coordinate list a spec carries is in the same order every
 * rebuild — a frame whose slots shuffled between solves would silently permute
 * the geometry.
 */
export function pointIndicesOf(
  sketch: AuthoringSketch,
  component: ComponentDefinition,
  index: Record<string, number>
): number[] {
  const owned = new Set(component.shapeIds);
  const out: number[] = [];
  for (const id of sketch.pointOrder) {
    const p = sketch.points[id];
    if (!p) continue;
    if (!p.owners.some((o) => owned.has(o))) continue;
    const i = index[id];
    if (i !== undefined) out.push(i);
  }
  return out;
}

/**
 * Why this selection cannot be made rigid, or null when it can.
 *
 * Called before the flag is set, so the refusal arrives while the author is
 * still looking at the thing they selected.
 */
export function rigidConflict(
  sketch: AuthoringSketch,
  index: Record<string, number>,
  component: ComponentDefinition
): string | null {
  const mine = new Set(pointIndicesOf(sketch, component, index));
  if (mine.size === 0) {
    return "That unit has no geometry the solver can hold on to yet.";
  }
  if (mine.size < 2) {
    return "A unit needs at least two points before moving it as one piece means anything.";
  }
  for (const other of rigidComponents(sketch)) {
    if (other.id === component.id) continue;
    const theirs = pointIndicesOf(sketch, other, index);
    const shared = theirs.filter((i) => mine.has(i));
    if (shared.length > 0) {
      return `"${component.name}" and "${other.name}" share ${shared.length} corner${
        shared.length === 1 ? "" : "s"
      }. Two pieces that move independently cannot both decide where the same corner is — separate them, or make them one unit.`;
    }
  }
  return null;
}

/**
 * The reduced state space for this sketch, or null when nothing is rigid.
 *
 * Null rather than an identity condensation on purpose: a drawing with no rigid
 * group must take exactly the path it took before this file existed, with no
 * extra matrix multiply per Jacobian evaluation and no behaviour to re-verify.
 *
 * The frames are rebuilt from the CURRENT coordinates every time, so making a
 * group rigid never moves it — it only changes how it is allowed to move next.
 */
export function condensationFor(
  sketch: AuthoringSketch,
  sys: Pick<CompiledSystem, "index" | "X">
): RigidCondensation | null {
  const components = rigidComponents(sketch);
  if (components.length === 0) return null;

  const specs: RigidComponentSpec[] = [];
  const claimed = new Set<number>();
  for (const c of components) {
    // A point already spoken for stays with the first frame that claimed it.
    // `rigidConflict` stops this arising through the UI; honouring it here as
    // well means a hand-edited or imported template degrades to something
    // sensible instead of throwing out of the solver.
    const indices = pointIndicesOf(sketch, c, sys.index).filter((i) => !claimed.has(i));
    if (indices.length < 2) continue;
    for (const i of indices) claimed.add(i);
    specs.push(createRigidComponent(c.id, sys.X, indices));
  }

  if (specs.length === 0) return null;
  return new RigidCondensation(sys.X.length / 2, specs);
}

/** How much freedom the rigid groups removed, for the wording in the panel. */
export function rigidSummary(
  sketch: AuthoringSketch,
  condensation: RigidCondensation | null
): { components: number; pointsFrozen: number; dofRemoved: number } {
  if (!condensation) return { components: 0, pointsFrozen: 0, dofRemoved: 0 };
  const pointsFrozen = condensation.components.reduce((n, c) => n + c.pointIndices.length, 0);
  return {
    components: condensation.components.length,
    pointsFrozen,
    // 2k coordinates became 3 per component.
    dofRemoved: 2 * pointsFrozen - 3 * condensation.components.length,
  };
}

/** Marks a component rigid or loose, leaving everything else alone. */
export function setComponentRigid(
  sketch: AuthoringSketch,
  componentId: string,
  rigid: boolean
): AuthoringSketch {
  return {
    ...sketch,
    components: sketch.components.map((c) => (c.id === componentId ? { ...c, rigid } : c)),
  };
}

// ---------------------------------------------------------------------------
// Absorbing a direct edit
// ---------------------------------------------------------------------------

/**
 * A rigid motion of the plane: turn by `theta`, then shift.
 *
 * SE(2), the only thing a body is allowed to do to itself.
 */
export interface RigidMotion {
  theta: number;
  tx: number;
  ty: number;
}

export const IDENTITY_MOTION: RigidMotion = { theta: 0, tx: 0, ty: 0 };

/**
 * The rigid motion that best carries `from` onto `to`.
 *
 * Orthogonal Procrustes in two dimensions, which for a rotation and a
 * translation has a closed form and needs no iteration: subtract the centroids,
 * and the best angle is the argument of the summed products.
 *
 * What is handed in matters more than the arithmetic. The pairs must come from
 * the parts of the body the author actually touched, and from all of those
 * parts. Both halves of that are load-bearing:
 *
 *   Include an untouched member and the fit answers a different question —
 *   "what single motion best explains all of these positions" — which for
 *   dragging one line of a three-line group is a third of the drag plus a
 *   twist, because two thirds of the evidence says nothing happened. A member
 *   that did not move is not evidence that the body stayed still; it is the
 *   rest of the body waiting to be told where it went.
 *
 *   Drop the STATIONARY POINTS of a member that did move and the fit goes
 *   blind to rotation. Swing a line about one of its own ends and only one end
 *   has moved; one point can be explained by a translation, so a translation is
 *   what you get, and the group slides away instead of turning.
 */
export function fitRigidMotion(
  from: { x: number; y: number }[],
  to: { x: number; y: number }[]
): RigidMotion {
  const n = Math.min(from.length, to.length);
  if (n === 0) return IDENTITY_MOTION;
  if (n === 1) return { theta: 0, tx: to[0].x - from[0].x, ty: to[0].y - from[0].y };

  let px = 0;
  let py = 0;
  let qx = 0;
  let qy = 0;
  for (let i = 0; i < n; i++) {
    px += from[i].x;
    py += from[i].y;
    qx += to[i].x;
    qy += to[i].y;
  }
  px /= n;
  py /= n;
  qx /= n;
  qy /= n;

  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    const ax = from[i].x - px;
    const ay = from[i].y - py;
    const bx = to[i].x - qx;
    const by = to[i].y - qy;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  }

  // Two coincident points carry no orientation; treat that as a translation
  // rather than letting atan2(0, 0) invent an angle.
  const theta = Math.abs(dot) < 1e-12 && Math.abs(cross) < 1e-12 ? 0 : Math.atan2(cross, dot);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    theta,
    tx: qx - (px * c - py * s),
    ty: qy - (px * s + py * c),
  };
}

export function applyMotion(m: RigidMotion, p: { x: number; y: number }): { x: number; y: number } {
  const c = Math.cos(m.theta);
  const s = Math.sin(m.theta);
  return { x: m.tx + p.x * c - p.y * s, y: m.ty + p.x * s + p.y * c };
}

export function isIdentityMotion(m: RigidMotion, tol: number): boolean {
  return Math.abs(m.tx) <= tol && Math.abs(m.ty) <= tol && Math.abs(m.theta) <= 1e-9;
}

/** Every point of a shape, in a fixed order. Empty for shapes with no vertices. */
export function verticesOf(shape: Shape): { x: number; y: number }[] {
  const s = shape as unknown as Record<string, number>;
  switch (shape.type) {
    case "line":
    case "arrow":
      return [
        { x: s.x1, y: s.y1 },
        { x: s.x2, y: s.y2 },
      ];
    case "rectangle": {
      // The centre alone would not see a rotation; two points do, and a
      // rectangle's own `rotation` is carried through by `moveShape` below.
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      return [
        { x: cx, y: cy },
        { x: cx + Math.cos(((s.rotation ?? 0) * Math.PI) / 180) * (s.width / 2),
          y: cy + Math.sin(((s.rotation ?? 0) * Math.PI) / 180) * (s.width / 2) },
      ];
    }
    case "circle":
    case "ellipse":
    case "polygon":
    case "star":
      return [{ x: s.cx, y: s.cy }];
    default:
      // `ArcShape` is declared in the geometry types but is not yet a member of
      // the `Shape` union, so an arc cannot reach here. When it joins, it wants
      // a centre here and its two angles turned in `moveShape`.
      return [];
  }
}

/**
 * Carries a shape through a rigid motion.
 *
 * Everything with an anchor and an angle is handled the same way: move the
 * anchor, add the angle. Nothing here asks what the shape represents, and a
 * shape type it has not met keeps its geometry rather than being mangled — a
 * spline that does not follow its group is a visible problem the author can
 * see and report; a spline silently rewritten is not.
 */
export function moveShape(shape: Shape, m: RigidMotion): Shape {
  const deg = (m.theta * 180) / Math.PI;
  const s = shape as unknown as Record<string, number>;
  switch (shape.type) {
    case "line":
    case "arrow": {
      const a = applyMotion(m, { x: s.x1, y: s.y1 });
      const b = applyMotion(m, { x: s.x2, y: s.y2 });
      return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y } as Shape;
    }
    case "rectangle": {
      const c = applyMotion(m, { x: s.x + s.width / 2, y: s.y + s.height / 2 });
      return {
        ...shape,
        x: c.x - s.width / 2,
        y: c.y - s.height / 2,
        rotation: (s.rotation ?? 0) + deg,
      } as Shape;
    }
    case "circle":
    case "ellipse":
    case "polygon":
    case "star": {
      const c = applyMotion(m, { x: s.cx, y: s.cy });
      return { ...shape, cx: c.x, cy: c.y, rotation: (s.rotation ?? 0) + deg } as Shape;
    }
    default:
      return shape;
  }
}

/**
 * Lets each rigid group absorb a direct edit as the nearest rigid motion.
 *
 * This is the drag half of notebook pages 3 and 5. The constraint half — a rule
 * pulling a body around — is handled in the solver, where the body's three
 * freedoms are the only variables it has. But a draftsman does not only reach a
 * group through a rule; they grab one of its lines and pull. The canvas writes
 * that straight into the drawing, and without this the group tears: the line
 * they grabbed goes, and the other eleven stay put.
 *
 * So the edit is read as evidence of where the body went, and the body goes
 * there — whole. Grab a line and slide it: the group slides by exactly that.
 * Turn it: the group turns. It is not a special case for dragging; it is the
 * same statement the solver enforces, applied to an edit that never went
 * through the solver.
 *
 * `before` and `after` must be the same shapes, in the same order, so that a
 * shape can be compared with itself.
 */
export function absorbRigidEdits(
  sketch: AuthoringSketch,
  before: Shape[],
  after: Shape[],
  tolerance: number
): Shape[] {
  const bodies = rigidComponents(sketch);
  if (bodies.length === 0) return after;

  const priorById = new Map(before.map((s) => [s.id, s]));
  const out = [...after];
  const indexById = new Map(after.map((s, i) => [s.id, i]));

  for (const body of bodies) {
    const from: { x: number; y: number }[] = [];
    const to: { x: number; y: number }[] = [];

    for (const shapeId of body.shapeIds) {
      const was = priorById.get(shapeId);
      const now = after[indexById.get(shapeId) ?? -1];
      if (!was || !now || was.type !== now.type) continue;
      const a = verticesOf(was);
      const b = verticesOf(now);
      const n = Math.min(a.length, b.length);

      // A member counts when ANY of its points moved, and then ALL of its
      // points are evidence — including the ones that stayed, which are what
      // tell a swing apart from a slide.
      let touched = false;
      for (let i = 0; i < n; i++) {
        if (Math.hypot(b[i].x - a[i].x, b[i].y - a[i].y) > tolerance) touched = true;
      }
      if (!touched) continue;

      for (let i = 0; i < n; i++) {
        from.push(a[i]);
        to.push(b[i]);
      }
    }

    if (from.length === 0) continue;
    const motion = fitRigidMotion(from, to);
    if (isIdentityMotion(motion, tolerance)) continue;

    // Every member moves from where it WAS, so a member the author did not
    // touch is placed by the motion rather than left behind, and the one they
    // did touch is placed by the motion too — which is what stops a drag from
    // shearing the body by exactly the amount the fit could not explain.
    for (const shapeId of body.shapeIds) {
      const was = priorById.get(shapeId);
      const at = indexById.get(shapeId);
      if (!was || at === undefined) continue;
      out[at] = moveShape(was, motion);
    }
  }

  return out;
}
