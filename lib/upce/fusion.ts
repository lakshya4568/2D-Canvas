/**
 * Solids that run into each other (UPCE-ADDENDUM-2.0 §5, notebook page 7).
 *
 *     "the distance closed up ... they will start to overlap the sections;
 *      green shaded: showing this part needs to be cut or removed"
 *
 * The kernel has known how to fuse two solids for a while — `booleanFusion.ts`
 * splits the crossings, rebuilds the planar map and dissolves the seam. What it
 * has never had is anyone to tell it that two solids ARE crossing, because the
 * constraint system has no opinion on the subject: every statement it holds is
 * about a distance or a direction, and none of them says matter may not be in
 * two places at once. So the overlap simply happened, silently, and the drawing
 * went on looking plausible.
 *
 * This file is the missing half. It turns the authoring sketch into regions the
 * fusion engine can take, and it does so without being told what anything is:
 *
 *     closed profile      ->  a loop
 *     loop inside a loop  ->  a void in the one outside it
 *     void inside a void  ->  a solid again (nesting depth, §5.1)
 *
 * A box culvert cell arrives as an outer rectangle with one void. A hollow pier
 * arrives the same way. A triangle someone drew this morning arrives as a solid
 * with no void. None of them is special-cased, and none of them is named.
 *
 * Two deliberate restraints:
 *
 *   Detection never refuses an edit. Two pours meeting is a real drafting
 *   situation with two real answers — monolithic, or a joint — and choosing
 *   between them is the author's business. Refusing would make the notebook's
 *   own scenario undrawable.
 *
 *   Fusion never rewrites what the author drew. The fused map is DERIVED from
 *   the authored shapes, which is what keeps the overlap recoverable: drag the
 *   pieces apart and they come apart. Baking the union back into the shapes
 *   would consume the parameters that produced it.
 */

import { Point2D } from "../geometry/topology/types";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { FusionRegion, fuseRegions, CollapsedWeb } from "../topology/booleanFusion";
import { AuthoringSketch } from "./types";
import { closedLoops } from "./profile";

/** One closed boundary of the sketch, with its nesting worked out. */
export interface SketchRegion {
  id: string;
  label: string;
  shapeIds: string[];
  outer: Point2D[];
  holes: Point2D[][];
  /** Outer area less the voids it encloses, in mm^2. */
  areaMm2: number;
}

export interface OverlapPair {
  a: string;
  b: string;
  labelA: string;
  labelB: string;
  /** Probe points of one that landed in the material of the other. */
  crossedCorners: number;
  /** How far they have run into each other, on their extents, in mm. */
  depthMm: number;
}

export interface FusionSummary {
  /** Whether the seams between touching solids were dissolved. */
  merged: boolean;
  /** How many separate pours the drawing describes. */
  solids: number;
  /** Enclosed voids that survived the merge. */
  voids: number;
  /** Total solid area with every overlap counted once, in mm^2. */
  netAreaMm2: number;
  /** Sum of the regions taken separately — larger than `netAreaMm2` by the overlap. */
  grossAreaMm2: number;
  /** Walls that ended up within the weld tolerance and became one web. */
  webs: CollapsedWeb[];
  /** True crossing points of the boundaries. */
  crossings: number;
}

// ---------------------------------------------------------------------------
// Geometry helpers. Nothing here is specific to any shape.
// ---------------------------------------------------------------------------

function shoelace(loop: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function inLoop(loop: Point2D[], p: Point2D): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A point that is genuinely inside a loop, for asking where the loop sits.
 *
 * The first vertex will not do: it is ON the boundary, where a ray cast is a
 * coin toss. The area centroid is inside for anything convex and for most of
 * what gets drawn; when it is not — an L, a C, a crescent — an edge midpoint
 * pulled a little way towards it is.
 */
function interiorPointOf(loop: Point2D[]): Point2D {
  let cx = 0;
  let cy = 0;
  for (const p of loop) {
    cx += p.x;
    cy += p.y;
  }
  const c = { x: cx / loop.length, y: cy / loop.length };
  if (inLoop(loop, c)) return c;

  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const t of [0.01, 0.1, 0.35]) {
      const probe = { x: m.x + (c.x - m.x) * t, y: m.y + (c.y - m.y) * t };
      if (inLoop(loop, probe)) return probe;
    }
  }
  return c;
}

/**
 * Whether `inner` sits wholly within `outer`.
 *
 * The crossing test is not an optimisation, it is the whole point. Two solids
 * driven into each other — the situation this file exists for — have one
 * outline's corner inside the other, and a containment test that asks only
 * "is a vertex inside?" then declares the second solid to be a HOLE in the
 * first. The drawing would lose a pour at exactly the moment the author was
 * trying to join two. Loops that cross do not nest, whatever their vertices say.
 */
function nestedIn(inner: Point2D[], outer: Point2D[]): boolean {
  for (let i = 0; i < inner.length; i++) {
    const a1 = inner[i];
    const a2 = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      const b1 = outer[j];
      const b2 = outer[(j + 1) % outer.length];
      if (properCrossing(a1, a2, b1, b2)) return false;
    }
  }
  return inLoop(outer, interiorPointOf(inner));
}

/** Inside the material: within the outer boundary and outside every void. */
function inMaterial(region: SketchRegion, p: Point2D): boolean {
  if (!inLoop(region.outer, p)) return false;
  return !region.holes.some((h) => inLoop(h, p));
}

function properCrossing(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
  const side = (p: Point2D, q: Point2D, r: Point2D) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(b1, b2, a1);
  const d2 = side(b1, b2, a2);
  const d3 = side(a1, a2, b1);
  const d4 = side(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Points worth asking "is this inside the other one?" about.
 *
 * Corners alone are not enough, and the box culvert is the reason: drive one
 * cell into another and the corner that crossed lands exactly ON the first
 * cell's top and bottom edges, because the two units are the same height. It is
 * unambiguously inside the material and every corner-only test reports nothing.
 * Edge midpoints catch it, and between them the two cover every way two
 * outlines can meet without a proper crossing.
 */
function probesOf(region: SketchRegion): Point2D[] {
  const out: Point2D[] = [];
  const loop = region.outer;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    out.push(a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return out;
}

/** True when any edge of one outline properly crosses an edge of the other. */
function outlinesCross(a: SketchRegion, b: SketchRegion): boolean {
  for (let i = 0; i < a.outer.length; i++) {
    const a1 = a.outer[i];
    const a2 = a.outer[(i + 1) % a.outer.length];
    for (let j = 0; j < b.outer.length; j++) {
      const b1 = b.outer[j];
      const b2 = b.outer[(j + 1) % b.outer.length];
      if (properCrossing(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * How far one region has run into the other, in mm.
 *
 * The overlap of their extents, along whichever axis they overlap least — the
 * standard penetration depth of two boxes, and the number a draftsman reads off
 * the drawing when they say "it has gone 200 into the wall". The exact area of
 * the shared material is a harder question with an exact answer, and it is
 * answered where it belongs: by the arrangement, in `fuseSketch`.
 */
function extentDepth(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): number {
  const dx = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const dy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (dx <= 0 || dy <= 0) return 0;
  return Math.min(dx, dy);
}


function boundsOf(loop: Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of loop) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function boxesApart(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  tol: number
): boolean {
  return a.maxX < b.minX - tol || b.maxX < a.minX - tol || a.maxY < b.minY - tol || b.maxY < a.minY - tol;
}

// ---------------------------------------------------------------------------
// Sketch -> regions
// ---------------------------------------------------------------------------

/**
 * Every closed profile in the sketch, nested.
 *
 * Depth is how many other loops contain a loop. Even depth is material, odd is
 * a void in the material around it — the same rule the DCEL arrangement uses,
 * applied here so the two agree about what is solid before anything is fused.
 */
export function sketchRegions(
  sketch: AuthoringSketch,
  names: Record<string, string> = {}
): SketchRegion[] {
  const loops: { id: string; label: string; shapeIds: string[]; loop: Point2D[]; area: number }[] = [];

  // Faces, not connected components: two solids that share an edge are two
  // regions, not one unreadable branched profile.
  for (const profile of closedLoops(sketch, names)) {
    const loop = profile.loopIds.map((id) => sketch.points[id]).filter(Boolean);
    if (loop.length < 3) continue;
    const area = shoelace(loop);
    if (Math.abs(area) < 1e-9) continue;
    loops.push({ id: profile.id, label: profile.label, shapeIds: profile.shapeIds, loop, area });
  }

  // Largest first, so a container is always seen before the things it contains.
  const ordered = [...loops].sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const depth = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (let i = 0; i < ordered.length; i++) {
    const me = ordered[i];
    let container: (typeof ordered)[number] | null = null;
    for (let j = 0; j < i; j++) {
      const other = ordered[j];
      if (!nestedIn(me.loop, other.loop)) continue;
      // The innermost container wins: `ordered` is descending by area, so the
      // last one that contains me is the smallest one that does.
      container = other;
    }
    parent.set(me.id, container?.id ?? null);
    depth.set(me.id, container ? (depth.get(container.id) ?? 0) + 1 : 0);
  }

  const byId = new Map(ordered.map((l) => [l.id, l]));
  const regions: SketchRegion[] = [];

  for (const l of ordered) {
    if ((depth.get(l.id) ?? 0) % 2 !== 0) continue; // a void, not a region
    const holes = ordered
      .filter((h) => parent.get(h.id) === l.id && (depth.get(h.id) ?? 0) % 2 === 1)
      .map((h) => h.loop);
    const holeArea = holes.reduce((sum, h) => sum + Math.abs(shoelace(h)), 0);
    void byId;
    regions.push({
      id: l.id,
      label: l.label,
      shapeIds: l.shapeIds,
      outer: l.loop,
      holes,
      areaMm2: Math.abs(l.area) - holeArea,
    });
  }

  return regions;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Which solids are standing in each other's way, and by how much.
 *
 * Cheap on purpose — bounding boxes first, then corner containment — because
 * this runs on every solve, including the ones a live drag produces. The
 * expensive answer (areas, webs, the merged outline) is `fuseSketch`, which
 * only runs when an edit is committed.
 */
export function detectOverlaps(
  sketch: AuthoringSketch,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY,
  names: Record<string, string> = {}
): OverlapPair[] {
  const regions = sketchRegions(sketch, names);
  if (regions.length < 2) return [];

  const bounds = regions.map((r) => boundsOf(r.outer));
  const out: OverlapPair[] = [];
  const tol = policy.weld_mm;

  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      if (boxesApart(bounds[i], bounds[j], tol)) continue;

      const a = regions[i];
      const b = regions[j];

      let crossed = 0;
      for (const p of probesOf(b)) if (inMaterial(a, p)) crossed++;
      for (const p of probesOf(a)) if (inMaterial(b, p)) crossed++;

      // Two outlines can cross with no vertex or midpoint of either inside the
      // other — a cross of two thin bars is the classic case.
      if (crossed === 0 && !outlinesCross(a, b)) continue;

      // Solids that only TOUCH — a fill resting on a slab, two cells sharing a
      // wall line — share a boundary and no area. Their extents overlap by
      // nothing on one axis, which is the test: a boundary probe landing on the
      // other's boundary is a coin toss and must not turn contact into overlap.
      const depth = extentDepth(bounds[i], bounds[j]);
      if (depth <= tol) continue;

      out.push({
        a: a.id,
        b: b.id,
        labelA: a.label,
        labelB: b.label,
        crossedCorners: crossed,
        depthMm: depth,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

/**
 * Runs the union and reports what came out.
 *
 * `merge` false still arranges the regions — you still want the crossings and
 * the real areas — but leaves the seams in place, which is what an expansion
 * joint between two separate pours actually is.
 */
export function fuseSketch(
  sketch: AuthoringSketch,
  options: { merge?: boolean; policy?: TolerancePolicy; names?: Record<string, string> } = {}
): FusionSummary | null {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const regions = sketchRegions(sketch, options.names ?? {});
  if (regions.length < 2) return null;

  const input: FusionRegion[] = regions.map((r) => ({
    id: r.id,
    outer: r.outer,
    holes: r.holes,
    structural: options.merge !== false,
  }));

  const result = fuseRegions(input, { policy });
  const voidArea = result.voidFaces.reduce((s, f) => s + Math.abs(f.area), 0);
  const solidArea = result.externalFaces.reduce((s, f) => s + f.area, 0);
  const gross = regions.reduce((s, r) => s + r.areaMm2, 0);
  const merged = options.merge !== false;

  // Two different questions, and answering the second with the first's number
  // is how a schedule ends up saying something nobody can act on.
  //
  // MERGED asks what the material is once the seams go: the arrangement's own
  // answer, with the shared material counted once.
  //
  // NOT MERGED asks what the drawing describes: two pours with a joint between
  // them, each measured in full. The arrangement would answer THREE here — it
  // splits the shared strip off as a face of its own, because that strip is
  // where both pours claim the same ground. That is a true statement about the
  // planar map and a useless one about concrete, so what is reported is the
  // pours, and the overlap is named separately where it can be acted on.
  return {
    merged,
    solids: merged ? result.externalFaces.length : regions.length,
    voids: result.voidFaces.length,
    netAreaMm2: merged ? solidArea - voidArea : gross,
    grossAreaMm2: gross,
    webs: result.collapsedWebs,
    crossings: result.intersections.length,
  };
}
