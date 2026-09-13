/**
 * What happens when two solids are driven into each other (UPCE-ADDENDUM-2.0 §5).
 *
 * Until now the solver would let two cells slide straight through one another.
 * Nothing objected, because the constraint system is a set of statements about
 * distances and directions and none of those statements says "matter is not
 * allowed to be in two places at once". The result was a planar map with edges
 * crossing in the middle of faces — the region the notebook shades green and
 * labels "to be cut or removed".
 *
 * Real construction has two honest answers to that: the two pours become one
 * monolithic solid, or they stay apart with a joint between them. This file
 * implements the first, because it is the one the geometry can decide by itself:
 *
 *     broad phase   bounding boxes, to skip pairs that cannot possibly touch
 *     narrow phase  segment splitting at true intersection points
 *     arrangement   rebuild the DCEL planar map over the split segments
 *     classify      even nesting depth is solid, odd is void
 *
 * The union falls out of the arrangement rather than being computed separately.
 * Once every crossing has been split into a vertex, the outer boundary of the
 * merged region is simply the face at depth 0, and the voids are the faces at
 * depth 1 — they survive the merge because they were never touched by it. That
 * is the whole reason to do this through a planar map instead of a polygon
 * clipping library: the voids stay voids without anyone having to track them.
 *
 * The shared-web collapse is the other half. Two walls that end up within the
 * weld tolerance of each other are not two walls with a hairline crack between
 * them; that crack is a modelling artefact that would export as a zero-width
 * sliver. They become one web whose thickness is what is actually left after the
 * overlap is taken out.
 */

import { Point2D, DcelFace } from "../geometry/topology/types";
import { DcelPlanarMap, DcelSegmentInput } from "../geometry/topology/dcel";
import { BoundingBox2D, doBoxesOverlap } from "../geometry/topology/spatialIndex";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";

export interface FusionRegion {
  id: string;
  /** Outer boundary, in order. */
  outer: Point2D[];
  /** Inner void boundaries. */
  holes: Point2D[][];
  /** Only regions marked structural are candidates for union. */
  structural: boolean;
}

export interface FusionOptions {
  policy?: TolerancePolicy;
  /** Parallel faces closer than this collapse into one web. Defaults to weld_mm. */
  weldEpsilon?: number;
}

export interface CollapsedWeb {
  /** The two regions whose faces merged. */
  between: [string, string];
  /** What is left once the overlap is taken out. */
  thickness: number;
}

/**
 * One solid after the union, possibly assembled from several arrangement faces.
 *
 * The arrangement splits a merged solid wherever the two original outlines
 * crossed, so a clean union of two overlapping cells arrives as three faces
 * sitting side by side with nothing but a dissolved edge between them. They are
 * one pour and have to be reported as one pour, or the quantity take-off counts
 * the overlap twice and the DXF carries a seam that is not there.
 */
export interface SolidRegion {
  id: string;
  /** Arrangement faces that make up this solid. */
  faceIds: string[];
  /** Total area, with the overlap counted once. */
  area: number;
  /** Traced outer boundary, or empty when the merged region is not simple. */
  outer: Point2D[];
}

export interface FusionResult {
  /** Merged solids: depth-0 faces with their shared interior edges dissolved. */
  externalFaces: SolidRegion[];
  /** The raw depth-0 arrangement faces, before merging. */
  solidFaces: DcelFace[];
  /** Enclosed voids: odd nesting depth. */
  voidFaces: DcelFace[];
  /** Every bounded face, for hatching and quantity take-off. */
  allFaces: DcelFace[];
  map: DcelPlanarMap;
  collapsedWebs: CollapsedWeb[];
  /** True when the pair's bounding boxes met at all. */
  interfered: boolean;
  /** Points at which boundaries genuinely crossed. */
  intersections: Point2D[];
  hasSelfIntersections(): boolean;
  /** Area of a named face, for Volume = Area x barrel length. */
  faceArea(faceId: string): number;
}

function boundsOf(region: FusionRegion): BoundingBox2D {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of region.outer) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function loopSegments(loop: Point2D[], sourceShapeId: string, tags: string[]): DcelSegmentInput[] {
  const out: DcelSegmentInput[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
    out.push({ p1: a, p2: b, sourceShapeId, tags });
  }
  return out;
}

/** Proper crossing point of two segments, or null when they only meet at an end. */
function properIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
  tol: number
): Point2D | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null; // parallel or collinear

  const t = ((b1.x - a1.x) * sy - (b1.y - a1.y) * sx) / denom;
  const u = ((b1.x - a1.x) * ry - (b1.y - a1.y) * rx) / denom;

  const eps = tol / Math.max(1e-9, Math.hypot(rx, ry));
  if (t <= eps || t >= 1 - eps || u <= -1e-9 || u >= 1 + 1e-9) return null;

  return { x: a1.x + t * rx, y: a1.y + t * ry };
}

/**
 * Merges overlapping solids into one planar map and reports what came out.
 *
 * Regions that are not marked structural are still arranged — you still want to
 * see where they cross — but they are never welded together, because an
 * expansion joint between two separate pours is a real thing and silently
 * fusing it would be the geometry lying about the construction.
 */
export function fuseRegions(regions: FusionRegion[], options: FusionOptions = {}): FusionResult {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const weldEps = options.weldEpsilon ?? policy.weld_mm;

  // 1. Broad phase. Cheap rejection first so a sheet with two hundred components
  //    does not pay for a quadratic sweep it does not need.
  let interfered = false;
  const boxes = regions.map(boundsOf);
  for (let i = 0; i < regions.length && !interfered; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (doBoxesOverlap(boxes[i], boxes[j])) {
        interfered = true;
        break;
      }
    }
  }

  // 2. Collect every boundary as segments.
  const segments: DcelSegmentInput[] = [];
  for (const region of regions) {
    segments.push(...loopSegments(region.outer, region.id, ["outer", region.structural ? "structural" : "loose"]));
    region.holes.forEach((hole, h) => {
      segments.push(...loopSegments(hole, `${region.id}/hole[${h}]`, ["void"]));
    });
  }

  // 3. Narrow phase. Recorded for reporting; the planar map does its own
  //    splitting, but the author wants to be told WHERE the collision was.
  const intersections: Point2D[] = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].sourceShapeId === segments[j].sourceShapeId) continue;
      const p = properIntersection(
        segments[i].p1,
        segments[i].p2,
        segments[j].p1,
        segments[j].p2,
        policy.geometry_mm
      );
      if (p) intersections.push(p);
    }
  }

  // 4. Arrangement. Splitting and welding happen inside; what comes back is a
  //    map in which no two edges cross except at a vertex, which is precisely
  //    the definition of the non-manifold condition being absent.
  const map = DcelPlanarMap.buildFromSegments(segments, { policy, skipEulerValidation: true });

  const bounded = [...map.faces.values()].filter((f) => !f.isExterior);
  const solidFaces = bounded.filter((f) => f.nestingDepth === 0);
  const voidFaces = bounded.filter((f) => f.nestingDepth > 0 && f.nestingDepth % 2 === 1);
  // A seam is only dissolved between two pours that are BOTH structural. This
  // used to be true of the shared-web collapse below and not of the union
  // itself, so declaring two solids separate had no effect on the outline: an
  // expansion joint arrived as one monolithic face, which is the geometry lying
  // about the construction — the exact thing the comment above this function
  // says must not happen.
  const loose = new Set(regions.filter((r) => !r.structural).map((r) => r.id));
  const externalFaces = mergeAdjacentSolids(map, solidFaces, loose);

  // 5. Shared-web collapse between structural neighbours.
  const collapsedWebs: CollapsedWeb[] = [];
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (!regions[i].structural || !regions[j].structural) continue;
      const gap = separationBetween(boxes[i], boxes[j]);
      if (gap > weldEps) continue;
      collapsedWebs.push({
        between: [regions[i].id, regions[j].id],
        thickness: wallThicknessAfterMerge(regions[i], regions[j]),
      });
    }
  }

  return {
    externalFaces,
    solidFaces,
    voidFaces,
    allFaces: bounded,
    map,
    collapsedWebs,
    interfered,
    intersections,

    hasSelfIntersections(): boolean {
      // After the arrangement every crossing is a vertex, so a surviving proper
      // crossing between two distinct edges would mean the split failed.
      const edges: Array<{ a: Point2D; b: Point2D }> = [];
      for (const he of map.halfEdges.values()) {
        const o = map.vertices.get(he.origin);
        const t = map.vertices.get(he.target);
        if (!o || !t) continue;
        if (he.id < he.twin) edges.push({ a: o.point, b: t.point });
      }
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          if (properIntersection(edges[i].a, edges[i].b, edges[j].a, edges[j].b, policy.geometry_mm)) {
            return true;
          }
        }
      }
      return false;
    },

    faceArea(faceId: string): number {
      const face = map.faces.get(faceId);
      return face ? Math.abs(face.area) : 0;
    },
  };
}

/** Shortest gap between two boxes along either axis; negative when they overlap. */
function separationBetween(a: BoundingBox2D, b: BoundingBox2D): number {
  const dx = Math.max(b.minX - a.maxX, a.minX - b.maxX);
  const dy = Math.max(b.minY - a.maxY, a.minY - b.maxY);
  return Math.max(dx, dy);
}

/**
 * The web left when two walls merge: t1 + t2 - overlap.
 *
 * Wall thickness is taken as the distance from each region's outer boundary to
 * its nearest void, so this works on any region that has one — it does not need
 * to be told which edge is a wall.
 */
function wallThicknessAfterMerge(a: FusionRegion, b: FusionRegion): number {
  const ta = nearestVoidOffset(a);
  const tb = nearestVoidOffset(b);
  const boxA = boundsOf(a);
  const boxB = boundsOf(b);
  const overlap = -separationBetween(boxA, boxB);
  return ta + tb - Math.max(0, overlap);
}

function nearestVoidOffset(region: FusionRegion): number {
  if (region.holes.length === 0) return 0;
  const box = boundsOf(region);
  let best = Infinity;
  for (const hole of region.holes) {
    for (const p of hole) {
      best = Math.min(best, p.x - box.minX, box.maxX - p.x, p.y - box.minY, box.maxY - p.y);
    }
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * Drives one region into another by a stated overlap and fuses the result.
 *
 * The motion is a rigid translation along the line between the two centres, so
 * neither region is distorted on the way in — the overlap is a placement
 * decision, and what happens to the material afterwards is the arrangement's
 * business.
 */
export function executeTopologicalFusion(
  fixed: FusionRegion,
  moving: FusionRegion,
  options: FusionOptions & { targetOverlap: number }
): FusionResult & { appliedTranslation: Point2D } {
  const a = boundsOf(fixed);
  const b = boundsOf(moving);

  const gap = separationBetween(a, b);
  const alongX = Math.abs(b.minX - a.maxX) <= Math.abs(b.minY - a.maxY);
  const distance = gap + options.targetOverlap;
  const dir = alongX ? (b.minX >= a.maxX ? -1 : 1) : (b.minY >= a.maxY ? -1 : 1);

  const dx = alongX ? dir * distance : 0;
  const dy = alongX ? 0 : dir * distance;

  const shift = (p: Point2D): Point2D => ({ x: p.x + dx, y: p.y + dy });
  const translated: FusionRegion = {
    ...moving,
    outer: moving.outer.map(shift),
    holes: moving.holes.map((h) => h.map(shift)),
  };

  const result = fuseRegions([fixed, translated], options);
  return { ...result, appliedTranslation: { x: dx, y: dy } };
}

/** Rectangular cell with a concentric void — the shape the notebook draws. */
export function createBoxCellRegion(spec: {
  id: string;
  originX: number;
  originY?: number;
  width: number;
  height?: number;
  wall: number;
  structural?: boolean;
}): FusionRegion {
  const y0 = spec.originY ?? 0;
  const h = spec.height ?? spec.width;
  const x0 = spec.originX;
  const t = spec.wall;
  return {
    id: spec.id,
    structural: spec.structural ?? true,
    outer: [
      { x: x0, y: y0 },
      { x: x0 + spec.width, y: y0 },
      { x: x0 + spec.width, y: y0 + h },
      { x: x0, y: y0 + h },
    ],
    holes: [
      [
        { x: x0 + t, y: y0 + t },
        { x: x0 + spec.width - t, y: y0 + t },
        { x: x0 + spec.width - t, y: y0 + h - t },
        { x: x0 + t, y: y0 + h - t },
      ],
    ],
  };
}

/**
 * Dissolves the seams between touching solids: the union itself.
 *
 * An edge whose two sides are both solid is interior to the merged material and
 * has no business being a boundary. Union-find over exactly that relation groups
 * the arrangement's faces into pours; what remains on the outside of each group
 * is its real outline.
 */
function mergeAdjacentSolids(
  map: DcelPlanarMap,
  solids: DcelFace[],
  looseRegionIds: Set<string> = new Set()
): SolidRegion[] {
  const inGroup = new Set(solids.map((f) => f.id));
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
    let cur = a;
    while (cur !== r) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const f of solids) parent.set(f.id, f.id);

  for (const he of map.halfEdges.values()) {
    const twin = map.halfEdges.get(he.twin);
    if (!twin) continue;
    if (!he.face || !twin.face) continue;
    if (he.face === twin.face) continue;
    if (!inGroup.has(he.face) || !inGroup.has(twin.face)) continue;
    // The seam came from someone's boundary; if that someone asked to stay
    // separate, the boundary stays.
    if (looseRegionIds.has(he.sourceShapeId ?? "") || looseRegionIds.has(twin.sourceShapeId ?? "")) {
      continue;
    }
    union(he.face, twin.face);
  }

  const groups = new Map<string, DcelFace[]>();
  for (const f of solids) {
    const root = find(f.id);
    const list = groups.get(root) ?? [];
    list.push(f);
    groups.set(root, list);
  }

  const out: SolidRegion[] = [];
  for (const [root, members] of groups) {
    const memberIds = new Set(members.map((m) => m.id));
    out.push({
      id: `solid:${root}`,
      faceIds: members.map((m) => m.id),
      area: members.reduce((sum, m) => sum + Math.abs(m.area), 0),
      outer: traceGroupBoundary(map, memberIds),
    });
  }
  return out;
}

/**
 * Walks the outside of a merged group.
 *
 * A half-edge is on the boundary when its own face is in the group and its
 * twin's is not. Chaining those around shared vertices reproduces the outline;
 * if the walk fails to close — which a group with a pinch point can cause — an
 * empty loop is returned rather than a wrong one, and the caller still has the
 * face list and the area.
 */
function traceGroupBoundary(map: DcelPlanarMap, memberIds: Set<string>): Point2D[] {
  const boundary: string[] = [];
  for (const he of map.halfEdges.values()) {
    const twin = map.halfEdges.get(he.twin);
    if (!twin) continue;
    if (he.face && memberIds.has(he.face) && !(twin.face && memberIds.has(twin.face))) {
      boundary.push(he.id);
    }
  }
  if (boundary.length === 0) return [];

  const byOrigin = new Map<string, string[]>();
  for (const id of boundary) {
    const he = map.halfEdges.get(id)!;
    const list = byOrigin.get(he.origin) ?? [];
    list.push(id);
    byOrigin.set(he.origin, list);
  }

  const startId = boundary[0];
  const start = map.halfEdges.get(startId)!;
  const loop: Point2D[] = [];
  const used = new Set<string>();
  let current = start;

  for (let guard = 0; guard <= boundary.length; guard++) {
    const origin = map.vertices.get(current.origin);
    if (!origin) return [];
    loop.push(origin.point);
    used.add(current.id);

    const candidates = (byOrigin.get(current.target) ?? []).filter((id) => !used.has(id));
    if (candidates.length === 0) {
      // Closed if we are back where we started; otherwise the region is not
      // simple and a partial trace would be worse than none.
      return current.target === start.origin ? loop : [];
    }
    current = map.halfEdges.get(candidates[0])!;
  }
  return [];
}
