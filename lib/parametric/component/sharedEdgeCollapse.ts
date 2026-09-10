/**
 * Redundant shared-edge collapse for adjoining repeat instances.
 * UPCE-MASTER-1.0 §68 ("collapse redundant coincident edges between adjoining
 * cells") and §23.4 step 2 (inter-instance coincidence wiring).
 *
 * WHY THIS EXISTS
 * ---------------
 * A shared-web multi-cell culvert places instances at a stride SHORTER than one
 * instance's own width, because adjoining cells share their intermediate wall.
 * `CompositeAssemblyEngine.assemble` emits each instance's full boundary, so the
 * regenerated assembly contains overlapping collinear runs: with cell_span 300,
 * wall 30 and stride 330, cell 0's top edge spans x∈[0,360] and cell 1's spans
 * x∈[330,690], overlapping over 30 mm. Every adjoining pair does this.
 *
 * Left uncollapsed, that produces duplicated overlapping lines in exports and
 * spurious slivers in any planar arrangement built over the result.
 *
 * This pass performs the collapse §68 requires: collinear runs that overlap or
 * abut are merged into their union, and any segment wholly contained in another
 * collinear segment is dropped. True crossings are NOT touched here — those are
 * the planar arrangement's job (`splitIntersectingSegments`).
 */

import { Point2D } from "../../geometry/topology/types";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../../geometry/tolerance";

export interface CollapsibleSegment {
  id: string;
  p1: string;
  p2: string;
  construction?: boolean;
  semanticRole?: string;
}

export interface CollapseInput {
  points: { id: string; x: number; y: number; fixed?: boolean; construction?: boolean }[];
  lines: CollapsibleSegment[];
}

export interface CollapseResult {
  points: CollapseInput["points"];
  lines: CollapsibleSegment[];
  /** Line IDs removed because another collinear line covered them. */
  removed: string[];
  /** Merges performed: the surviving line and what it absorbed. */
  merged: { survivor: string; absorbed: string[] }[];
  /** Point IDs that became unreferenced and were pruned. */
  prunedPoints: string[];
}

interface Resolved {
  line: CollapsibleSegment;
  a: Point2D;
  b: Point2D;
  /** Unit direction, canonically oriented so opposite runs compare equal. */
  dir: Point2D;
  /** Signed perpendicular offset of the carrier line from the origin. */
  offset: number;
  /** Projections of both endpoints onto the carrier direction. */
  t1: number;
  t2: number;
}

function canonicalDirection(dx: number, dy: number): Point2D | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return null;
  let ux = dx / len;
  let uy = dy / len;
  // Canonical orientation: +x half-plane, then +y — so a run and its reverse
  // land on the same carrier.
  if (ux < -1e-12 || (Math.abs(ux) <= 1e-12 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  return { x: ux, y: uy };
}

/**
 * Collapses redundant collinear overlap between segments.
 *
 * Two segments share a carrier when their directions are parallel within
 * `angle_rad` AND their perpendicular offsets agree within `geometry_mm`. Both
 * comparisons are rotation-invariant vector tests — no bounding box, no
 * axis-aligned assumption (Clause 6).
 *
 * `onlyAcrossInstances` (default true) restricts the collapse to segments whose
 * IDs come from DIFFERENT repeat instances, so a template's own deliberately
 * collinear geometry is never silently merged.
 */
export function collapseSharedEdges(
  input: CollapseInput,
  options: {
    policy?: TolerancePolicy;
    onlyAcrossInstances?: boolean;
    instanceOf?: (lineId: string) => string | null;
  } = {}
): CollapseResult {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const onlyAcross = options.onlyAcrossInstances ?? true;
  const instanceOf =
    options.instanceOf ?? ((id: string) => id.match(/^(.*_repeat_\d+)/)?.[1] ?? null);

  const pointById = new Map(input.points.map((p) => [p.id, p]));
  const resolved: Resolved[] = [];
  const unresolved: CollapsibleSegment[] = [];

  for (const line of input.lines) {
    const p1 = pointById.get(line.p1);
    const p2 = pointById.get(line.p2);
    if (!p1 || !p2) {
      unresolved.push(line);
      continue;
    }
    const dir = canonicalDirection(p2.x - p1.x, p2.y - p1.y);
    if (!dir) {
      unresolved.push(line);
      continue;
    }
    const a = { x: p1.x, y: p1.y };
    const b = { x: p2.x, y: p2.y };
    // Perpendicular offset of the carrier from the origin.
    const offset = -dir.y * a.x + dir.x * a.y;
    const t1 = a.x * dir.x + a.y * dir.y;
    const t2 = b.x * dir.x + b.y * dir.y;
    resolved.push({ line, a, b, dir, offset, t1, t2 });
  }

  // Bucket by carrier (direction + offset), quantised at the tolerance so
  // near-identical carriers land together.
  const angleBin = Math.max(policy.angle_rad, 1e-9);
  const distBin = Math.max(policy.geometry_mm, 1e-9);
  const buckets = new Map<string, Resolved[]>();

  for (const r of resolved) {
    const theta = Math.atan2(r.dir.y, r.dir.x);
    const key = `${Math.round(theta / angleBin)}:${Math.round(r.offset / distBin)}`;
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }

  const removed: string[] = [];
  const merged: { survivor: string; absorbed: string[] }[] = [];
  const survivors = new Map<string, CollapsibleSegment>();
  const endpointOverride = new Map<string, { p1: string; p2: string }>();

  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      survivors.set(bucket[0].line.id, bucket[0].line);
      continue;
    }

    // Sort along the carrier, then sweep, merging overlapping/abutting runs.
    const spans = bucket
      .map((r) => ({
        r,
        lo: Math.min(r.t1, r.t2),
        hi: Math.max(r.t1, r.t2),
        loPoint: r.t1 <= r.t2 ? r.line.p1 : r.line.p2,
        hiPoint: r.t1 <= r.t2 ? r.line.p2 : r.line.p1,
      }))
      .sort((p, q) => p.lo - q.lo || p.hi - q.hi);

    let current = { ...spans[0], members: [spans[0]] as (typeof spans)[number][] };
    const groups: (typeof current)[] = [];

    for (let i = 1; i < spans.length; i++) {
      const s = spans[i];
      // Overlap or abutment within tolerance.
      if (s.lo <= current.hi + policy.geometry_mm) {
        if (s.hi > current.hi) {
          current.hi = s.hi;
          current.hiPoint = s.hiPoint;
        }
        current.members.push(s);
      } else {
        groups.push(current);
        current = { ...s, members: [s] };
      }
    }
    groups.push(current);

    for (const group of groups) {
      if (group.members.length === 1) {
        survivors.set(group.members[0].r.line.id, group.members[0].r.line);
        continue;
      }

      // Only collapse across DIFFERENT instances unless told otherwise.
      const instances = new Set(group.members.map((m) => instanceOf(m.r.line.id) ?? m.r.line.id));
      if (onlyAcross && instances.size < 2) {
        for (const m of group.members) survivors.set(m.r.line.id, m.r.line);
        continue;
      }

      // The survivor is the member spanning the most of the merged run; it is
      // then extended to the union's endpoints.
      const survivorMember = group.members.reduce((best, m) =>
        m.hi - m.lo > best.hi - best.lo ? m : best
      );
      const survivor = survivorMember.r.line;
      survivors.set(survivor.id, survivor);
      endpointOverride.set(survivor.id, { p1: group.loPoint, p2: group.hiPoint });

      const absorbed: string[] = [];
      for (const m of group.members) {
        if (m.r.line.id === survivor.id) continue;
        removed.push(m.r.line.id);
        absorbed.push(m.r.line.id);
      }
      merged.push({ survivor: survivor.id, absorbed });
    }
  }

  const outLines: CollapsibleSegment[] = [];
  for (const line of input.lines) {
    if (removed.includes(line.id)) continue;
    if (!survivors.has(line.id) && !unresolved.includes(line)) continue;
    const override = endpointOverride.get(line.id);
    outLines.push(override ? { ...line, p1: override.p1, p2: override.p2 } : line);
  }
  for (const line of unresolved) {
    if (!outLines.includes(line)) outLines.push(line);
  }

  // Prune points no surviving line references (anchors and fixed points stay).
  const referenced = new Set<string>();
  for (const l of outLines) {
    referenced.add(l.p1);
    referenced.add(l.p2);
  }
  const prunedPoints: string[] = [];
  const outPoints = input.points.filter((p) => {
    if (referenced.has(p.id) || p.fixed) return true;
    prunedPoints.push(p.id);
    return false;
  });

  return { points: outPoints, lines: outLines, removed, merged, prunedPoints };
}
