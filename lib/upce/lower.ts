/**
 * Lowering and lifting between the drawing's `Shape[]` and the authoring sketch.
 *
 * UPCE-MASTER-1.0 §18: "Every authoring shape lowers into a small primitive set
 * that the resolver understands. Shape identity survives only for rendering and
 * editing; detection never branches on it."
 *
 * Two properties matter and are tested:
 *
 *   1. IDs are a pure function of the owning shape's id and the vertex index, so
 *      a rebuild after any drawing edit keeps every constraint pointing at the
 *      same geometry. Welding picks the lexicographically smallest id in the
 *      group, so it is order-independent too.
 *
 *   2. Lifting is exact, not a bounding box. A rectangle carries its own right
 *      angles as `fact` constraints, so its four solved corners always still
 *      form a rectangle and `x/y/width/height/rotation` can be recovered without
 *      loss. That is why dragging one corner cannot silently square the shape.
 */

import {
  Shape,
  LineShape,
  RectangleShape,
  CircleShape,
  Point,
} from "../geometry/types";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { rotatePoint } from "../geometry/metrics";
import {
  AuthoringSketch,
  SketchPoint,
  SketchSegment,
  SketchCircle,
  SketchConstraint,
  emptySketch,
  Provenance,
} from "./types";

const FACT_ORIGIN: Provenance["origin"] = "geometric-fact";

function fact(detail: string, createdAt: number): Provenance {
  return { origin: FACT_ORIGIN, detail, createdAt };
}

/** Shapes that lower into constraint-editable primitives. */
export function isLowerable(shape: Shape): boolean {
  return (
    shape.type === "line" ||
    shape.type === "arrow" ||
    shape.type === "rectangle" ||
    shape.type === "circle"
  );
}

interface RawPoint {
  id: string;
  x: number;
  y: number;
  owner: string;
  construction?: boolean;
}

function rectCorners(r: RectangleShape): Point[] {
  const corners: Point[] = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
  const rot = r.rotation || 0;
  if (rot === 0) return corners;
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  return corners.map((p) => rotatePoint(p, c, rot));
}

/**
 * Rebuilds the sketch from the current drawing.
 *
 * `previous` is merged forward: constraints and parameters survive as long as
 * the geometry they reference still exists. Anything orphaned by a deletion is
 * dropped and reported, never left dangling.
 */
export function rebuildSketch(
  shapes: Shape[],
  previous?: AuthoringSketch,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): { sketch: AuthoringSketch; droppedConstraintIds: string[] } {
  const now = Date.now();
  const sketch = emptySketch();

  const rawPoints: RawPoint[] = [];
  const rawSegments: Omit<SketchSegment, "p1" | "p2">[] = [];
  const segEnds: Record<string, [string, string]> = {};
  const rawCircles: { id: string; center: string; rim: string; shapeId: string }[] = [];
  const facts: SketchConstraint[] = [];

  const visible = shapes.filter((s) => s.isVisible !== false);

  for (const s of visible) {
    if (!isLowerable(s)) {
      sketch.carrierShapeIds.push(s.id);
      continue;
    }

    if (s.type === "line" || s.type === "arrow") {
      const l = s as LineShape;
      const a = `${l.id}:v0`;
      const b = `${l.id}:v1`;
      rawPoints.push({ id: a, x: l.x1, y: l.y1, owner: l.id, construction: l.isReference });
      rawPoints.push({ id: b, x: l.x2, y: l.y2, owner: l.id, construction: l.isReference });
      const segId = `${l.id}:e0`;
      rawSegments.push({ id: segId, shapeId: l.id, edgeIndex: 0, construction: l.isReference });
      segEnds[segId] = [a, b];
      continue;
    }

    if (s.type === "rectangle") {
      const r = s as RectangleShape;
      const corners = rectCorners(r);
      const ids = corners.map((_, i) => `${r.id}:v${i}`);
      corners.forEach((p, i) => rawPoints.push({ id: ids[i], x: p.x, y: p.y, owner: r.id }));
      const segIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const segId = `${r.id}:e${i}`;
        segIds.push(segId);
        rawSegments.push({ id: segId, shapeId: r.id, edgeIndex: i });
        segEnds[segId] = [ids[i], ids[(i + 1) % 4]];
      }
      // Three right angles make a quadrilateral a rectangle; the fourth is
      // linearly dependent and would be reported as redundant. §18.
      for (let i = 0; i < 3; i++) {
        facts.push({
          id: `${r.id}:fact-perp${i}`,
          kind: "perpendicular",
          points: [],
          segments: [segIds[i], segIds[i + 1]],
          strength: "fact",
          driving: true,
          state: "active",
          label: `${r.name ?? "rectangle"} corner ${i + 1} is a right angle`,
          provenance: fact(
            "Asserted when the rectangle was drawn. Three right angles are what make the four edges a rectangle.",
            now
          ),
        });
      }
      continue;
    }

    if (s.type === "circle") {
      const c = s as CircleShape;
      const centre = `${c.id}:v0`;
      const rim = `${c.id}:v1`;
      rawPoints.push({ id: centre, x: c.cx, y: c.cy, owner: c.id });
      rawPoints.push({ id: rim, x: c.cx + c.r, y: c.cy, owner: c.id });
      rawCircles.push({ id: `${c.id}:c`, center: centre, rim, shapeId: c.id });
      const segId = `${c.id}:e0`;
      rawSegments.push({ id: segId, shapeId: c.id, edgeIndex: 0 });
      segEnds[segId] = [centre, rim];
      facts.push({
        id: `${c.id}:fact-radius-axis`,
        kind: "horizontal",
        points: [],
        segments: [segId],
        strength: "fact",
        driving: true,
        state: "active",
        label: `${c.name ?? "circle"} radius handle stays on the horizontal`,
        provenance: fact(
          "A circle has no orientation, so its radius handle is pinned to the horizontal. Without this the sketch would report one degree of freedom that cannot change the drawing.",
          now
        ),
      });
    }
  }

  // ---- deterministic welding -------------------------------------------------
  // Points closer than the weld tolerance become one topological point, which is
  // a coincidence at the data-structure level rather than a constraint row (§22).
  const weld = policy.weld_mm;
  const alias = new Map<string, string>();
  const merged: Record<string, SketchPoint> = {};
  const order: string[] = [];

  const sorted = [...rawPoints].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const rp of sorted) {
    let hostId: string | null = null;
    for (const existingId of order) {
      const host = merged[existingId];
      if (Math.hypot(host.x - rp.x, host.y - rp.y) <= weld) {
        hostId = existingId;
        break;
      }
    }
    if (hostId) {
      alias.set(rp.id, hostId);
      if (!merged[hostId].owners.includes(rp.owner)) merged[hostId].owners.push(rp.owner);
    } else {
      alias.set(rp.id, rp.id);
      merged[rp.id] = { id: rp.id, x: rp.x, y: rp.y, owners: [rp.owner], construction: rp.construction };
      order.push(rp.id);
    }
  }

  sketch.points = merged;
  sketch.pointOrder = order;
  sketch.pointAliases = Object.fromEntries(alias);

  for (const rs of rawSegments) {
    const [a, b] = segEnds[rs.id];
    const p1 = alias.get(a) ?? a;
    const p2 = alias.get(b) ?? b;
    if (p1 === p2) continue; // degenerate
    sketch.segments[rs.id] = { ...rs, p1, p2 };
  }

  for (const rc of rawCircles) {
    const center = alias.get(rc.center) ?? rc.center;
    const rim = alias.get(rc.rim) ?? rc.rim;
    if (center === rim) continue;
    sketch.circles[rc.id] = { ...rc, center, rim } as SketchCircle;
  }

  sketch.constraints = facts.filter((c) => constraintIsResolvable(c, sketch));

  // ---- merge the previous document forward ----------------------------------
  const dropped: string[] = [];
  if (previous) {
    for (const c of previous.constraints) {
      if (c.strength === "fact") continue; // facts are re-derived above
      // Repeat copies are regenerated from the rule on every rebuild (§23.4).
      // Carrying them forward as well made them accumulate: each regenerate
      // added another identical set, so a drawing that had been re-solved a few
      // times was carrying dozens of duplicate rows. They are harmless to the
      // answer — a duplicate row is redundant, not contradictory — but they
      // bloat the solve and fill the diagnosis list with noise.
      if (c.provenance.origin === "component") continue;
      const remapped: SketchConstraint = {
        ...c,
        points: c.points.map((p) => alias.get(p) ?? p),
      };
      if (constraintIsResolvable(remapped, sketch)) sketch.constraints.push(remapped);
      else dropped.push(c.id);
    }
    sketch.parameters = { ...previous.parameters };
    sketch.components = [...previous.components];
    sketch.repeats = [...previous.repeats];
    sketch.meta = { ...previous.meta };

    // A parameter may not claim constraints that no longer exist. The list is
    // rebuilt rather than mutated so a parameter that arrived from a serialised
    // template without one is repaired rather than crashing the rebuild.
    const liveIds = new Set(sketch.constraints.map((c) => c.id));
    for (const [name, p] of Object.entries(sketch.parameters)) {
      sketch.parameters[name] = {
        ...p,
        boundConstraints: (p.boundConstraints ?? []).filter((id) => liveIds.has(id)),
      };
    }
  }

  return { sketch, droppedConstraintIds: dropped };
}

export function constraintIsResolvable(c: SketchConstraint, sketch: AuthoringSketch): boolean {
  for (const p of c.points) if (!sketch.points[p]) return false;
  for (const s of c.segments) if (!sketch.segments[s]) return false;
  return true;
}

/** Endpoints of a segment, as point ids. */
export function segmentEnds(sketch: AuthoringSketch, segId: string): [string, string] | null {
  const seg = sketch.segments[segId];
  if (!seg) return null;
  return [seg.p1, seg.p2];
}

// ---------------------------------------------------------------------------
// Lifting — sketch points back into drawing shapes.
// ---------------------------------------------------------------------------

export interface LiftIssue {
  shapeId: string;
  message: string;
}

/**
 * Writes solved point positions back into the drawing.
 *
 * The rectangle case recovers `x/y/width/height/rotation` exactly from the four
 * corners. If a rectangle's corners are no longer rectangular — only possible if
 * its `fact` constraints were suppressed — the shape is left untouched and the
 * caller is told, rather than the drawing being silently squared off.
 */
export function liftSketchToShapes(
  sketch: AuthoringSketch,
  shapes: Shape[],
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): { shapes: Shape[]; issues: LiftIssue[] } {
  const issues: LiftIssue[] = [];
  const pt = (id: string) => sketch.points[id];

  const next = shapes.map((s): Shape => {
    if (s.type === "line" || s.type === "arrow") {
      const a = pt(`${s.id}:v0`) ?? pt(resolveAlias(sketch, `${s.id}:v0`));
      const b = pt(`${s.id}:v1`) ?? pt(resolveAlias(sketch, `${s.id}:v1`));
      if (!a || !b) return s;
      return { ...s, x1: a.x, y1: a.y, x2: b.x, y2: b.y } as Shape;
    }

    if (s.type === "rectangle") {
      const corners = [0, 1, 2, 3].map((i) => pt(resolveAlias(sketch, `${s.id}:v${i}`)));
      if (corners.some((c) => !c)) return s;
      const [v0, v1, v2, v3] = corners as SketchPoint[];

      const width = Math.hypot(v1.x - v0.x, v1.y - v0.y);
      const height = Math.hypot(v3.x - v0.x, v3.y - v0.y);
      const widthB = Math.hypot(v2.x - v3.x, v2.y - v3.y);
      const heightB = Math.hypot(v2.x - v1.x, v2.y - v1.y);

      const tol = Math.max(policy.geometry_mm, 1e-6);
      if (Math.abs(width - widthB) > tol || Math.abs(height - heightB) > tol) {
        issues.push({
          shapeId: s.id,
          message:
            "Corners no longer form a rectangle. The shape was left as it was — explode it to four lines to edit it freely.",
        });
        return s;
      }

      const rotationRad = Math.atan2(v1.y - v0.y, v1.x - v0.x);
      const cx = (v0.x + v2.x) / 2;
      const cy = (v0.y + v2.y) / 2;
      return {
        ...s,
        x: cx - width / 2,
        y: cy - height / 2,
        width,
        height,
        rotation: (rotationRad * 180) / Math.PI,
      } as Shape;
    }

    if (s.type === "circle") {
      const c = pt(resolveAlias(sketch, `${s.id}:v0`));
      const rim = pt(resolveAlias(sketch, `${s.id}:v1`));
      if (!c || !rim) return s;
      return { ...s, cx: c.x, cy: c.y, r: Math.hypot(rim.x - c.x, rim.y - c.y) } as Shape;
    }

    return s;
  });

  return { shapes: next, issues };
}

/**
 * Point ids are welded to the lexicographically smallest id in their group, so a
 * shape's own vertex id may have been absorbed. The alias map records where.
 */
export function resolveAlias(sketch: AuthoringSketch, rawId: string): string {
  return sketch.pointAliases[rawId] ?? rawId;
}
