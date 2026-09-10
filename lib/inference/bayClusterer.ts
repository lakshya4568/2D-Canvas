/**
 * Bay Clustering — the missing horizontal pass.
 * UPCE-MASTER-1.0 §48.3, §49.1 and the traced failure of §80.
 *
 * §80 diagnoses the live multi-cell failure precisely: with N ≥ 2 nested voids
 * the engine measures each void against the outer envelope independently, so for
 * Void 1 it reports an *apparent* right clearance spanning Void 2 plus the
 * external wall. "Because there is no horizontal bay-clustering pass, it never
 * recognises that the space between the voids is an intermediate web t_mid, and
 * never produces the clean relation
 *
 *     TotalSpan = N·ClearSpan + (N+1)·WallThickness + (N−1)·Gap
 *
 * Instead it shows eleven disjoint, unmerged formula cards."
 *
 * This module is that pass. It projects solid faces and voids onto an interval
 * axis (§49.1 dimension-stack summation), clusters the resulting runs, and emits
 * ONE parameter set plus ONE stack relation rather than 2N+ disjoint clearances.
 *
 * Rotation-invariant: the stacking axis is derived from the geometry itself (the
 * dominant void-centroid direction), never from the world X axis, and every
 * measurement is a projection onto that axis. No axis-aligned bounding box is
 * used anywhere (§Clause 6, forbidden item 7).
 */

import { Point2D } from "../geometry/topology/types";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";

export interface BayVoid {
  /** DCEL face ID (or any stable ID) of the void. */
  id: string;
  /** Boundary points of the void, in order. */
  points: Point2D[];
}

export interface BayInterval {
  voidId: string;
  /** Projection of the void's extent onto the stacking axis. */
  start: number;
  end: number;
  span: number;
  centroid: number;
}

export type BayRunKind = "END_WALL" | "INTERIOR_WEB" | "BAY";

export interface BayRun {
  kind: BayRunKind;
  /** Ordinal along the stacking axis. */
  index: number;
  start: number;
  end: number;
  length: number;
  /** Void ID for BAY runs; the two flanking void IDs for INTERIOR_WEB. */
  refs: string[];
}

export interface BayStackParameter {
  name: string;
  value: number;
  role: "DRIVING" | "DERIVED";
  /** How many runs contributed to this clustered value. */
  occurrences: number;
  /** Spread of the contributing measurements, in mm. */
  deviation: number;
  memberRefs: string[];
}

export interface BayClusterResult {
  /** True when a coherent N-bay stack was recognised. */
  recognised: boolean;
  /** N — the number of bays/cells found. */
  bayCount: number;
  /** Unit direction of the stacking axis, derived from the geometry. */
  axis: { x: number; y: number };
  /** Origin the axis projections are measured from. */
  axisOrigin: Point2D;
  intervals: BayInterval[];
  runs: BayRun[];
  /** The clustered parameter set — two or three cards, not 2N. */
  parameters: BayStackParameter[];
  /** The single stack relation, e.g. "N*ClearSpan + (N+1)*WallThickness + (N-1)*Gap". */
  stackExpression: string | null;
  /** Evaluated total span along the stacking axis. */
  totalSpan: number;
  /** |measured total − Σ runs| — the dimension-stack closure residual. */
  closureResidual: number;
  /** Human-readable reason when `recognised` is false. */
  diagnostic?: string;
  /**
   * True when the axis could not be derived from the geometry and a default was
   * assumed (a single void with no explicit `axis`). §63: surface the ambiguity,
   * do not hide it behind a coin flip.
   */
  axisAmbiguous: boolean;
}

function projectOnto(p: Point2D, origin: Point2D, axis: { x: number; y: number }): number {
  return (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y;
}

function centroidOf(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Derives the stacking axis from the void centroids themselves — the direction of
 * maximum spread, obtained from the 2×2 centroid scatter matrix. This is what
 * makes the pass rotation-invariant: a culvert drawn at 37° stacks along its own
 * axis, not the page's.
 */
export function deriveStackingAxis(voids: BayVoid[]): { x: number; y: number } {
  const centroids = voids.map((v) => centroidOf(v.points));
  if (centroids.length < 2) return { x: 1, y: 0 };

  const mean = centroidOf(centroids);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const c of centroids) {
    const dx = c.x - mean.x;
    const dy = c.y - mean.y;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  // Principal eigenvector of [[sxx, sxy], [sxy, syy]]
  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda = trace / 2 + disc;

  let vx = sxy;
  let vy = lambda - sxx;
  if (Math.hypot(vx, vy) < 1e-12) {
    vx = lambda - syy;
    vy = sxy;
  }
  const len = Math.hypot(vx, vy);
  if (len < 1e-12) return { x: 1, y: 0 };

  // Canonical orientation: point in the +x half-plane (or +y when vertical).
  let ax = vx / len;
  let ay = vy / len;
  if (ax < -1e-12 || (Math.abs(ax) <= 1e-12 && ay < 0)) {
    ax = -ax;
    ay = -ay;
  }
  return { x: ax, y: ay };
}

/**
 * 1-D agglomerative clustering at ε_cluster (§42 step 2). Values within the bin
 * collapse to one card carrying the mean, its spread, and its member refs.
 */
export function clusterMeasurements(
  samples: { value: number; ref: string }[],
  epsCluster: number
): { mean: number; deviation: number; members: string[] }[] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((a, b) => a.value - b.value);

  const clusters: { values: number[]; members: string[] }[] = [];
  let current = { values: [sorted[0].value], members: [sorted[0].ref] };

  for (let i = 1; i < sorted.length; i++) {
    const last = current.values[current.values.length - 1];
    if (Math.abs(sorted[i].value - last) <= epsCluster) {
      current.values.push(sorted[i].value);
      current.members.push(sorted[i].ref);
    } else {
      clusters.push(current);
      current = { values: [sorted[i].value], members: [sorted[i].ref] };
    }
  }
  clusters.push(current);

  return clusters.map((c) => {
    const mean = c.values.reduce((s, v) => s + v, 0) / c.values.length;
    const deviation = c.values.length > 1 ? Math.max(...c.values) - Math.min(...c.values) : 0;
    return { mean, deviation, members: c.members };
  });
}

export interface BayClusterOptions {
  policy?: TolerancePolicy;
  /**
   * Explicit stacking axis. Supply it for a SINGLE void, where the direction is
   * genuinely ambiguous — a lone void inside an envelope is simultaneously a
   * horizontal wall stack and a vertical slab stack, and §63 resolves that kind
   * of ambiguity by an author's declared role, never by the engine guessing.
   * With two or more voids the axis is derived and this is ignored.
   */
  axis?: { x: number; y: number };
  /** Names for the emitted cards. Defaults follow the §57 fallback vocabulary. */
  bayName?: string;
  wallName?: string;
  gapName?: string;
  /**
   * A run between two voids is an inter-cell GAP rather than a structural WEB
   * when it is at most this fraction of the clustered wall thickness. The RDSO
   * balancing structure has a 10 mm gap beside a 350 mm web (§68, Appendix D).
   */
  gapWebRatio?: number;
}

/**
 * The bay-clustering pass.
 *
 * Input: the outer envelope boundary and the interior voids (DCEL faces at odd
 * nesting depth). Output: ONE clustered parameter set and ONE stack relation.
 *
 * The projection is a dimension stack along the derived axis:
 *
 *   [ wall ][ BAY 1 ][ web ][ BAY 2 ][ web ][ BAY 3 ][ wall ]
 *
 * so that N bays produce N+1 solid runs, and the stack closes as
 *   TotalSpan = Σ bays + Σ walls (+ Σ gaps)
 */
export function clusterBays(
  outerBoundary: Point2D[],
  voids: BayVoid[],
  options: BayClusterOptions = {}
): BayClusterResult {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const bayName = options.bayName ?? "ClearSpan";
  const wallName = options.wallName ?? "WallThickness";
  const gapName = options.gapName ?? "Gap";
  const gapWebRatio = options.gapWebRatio ?? 0.25;

  const empty = (diagnostic: string): BayClusterResult => ({
    recognised: false,
    bayCount: 0,
    axis: { x: 1, y: 0 },
    axisOrigin: { x: 0, y: 0 },
    intervals: [],
    runs: [],
    parameters: [],
    stackExpression: null,
    totalSpan: 0,
    closureResidual: 0,
    diagnostic,
    axisAmbiguous: false,
  });

  if (outerBoundary.length < 3) return empty("Outer boundary has fewer than 3 points.");
  if (voids.length === 0) return empty("No interior voids supplied.");

  const axisAmbiguous = voids.length < 2 && !options.axis;
  const axis = options.axis
    ? normalizeAxis(options.axis)
    : voids.length >= 2
      ? deriveStackingAxis(voids)
      : principalAxisOf(voids[0].points);
  const origin = centroidOf(outerBoundary);

  // Envelope extent along the axis.
  const outerProj = outerBoundary.map((p) => projectOnto(p, origin, axis));
  const outerStart = Math.min(...outerProj);
  const outerEnd = Math.max(...outerProj);
  const totalSpan = outerEnd - outerStart;

  // Void extents along the same axis.
  const intervals: BayInterval[] = voids
    .map((v) => {
      const proj = v.points.map((p) => projectOnto(p, origin, axis));
      const start = Math.min(...proj);
      const end = Math.max(...proj);
      return {
        voidId: v.id,
        start,
        end,
        span: end - start,
        centroid: (start + end) / 2,
      };
    })
    .sort((a, b) => a.centroid - b.centroid);

  // Reject overlapping voids: they do not form a linear stack along this axis.
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].start < intervals[i - 1].end - policy.geometry_mm) {
      return empty(
        `Voids ${intervals[i - 1].voidId} and ${intervals[i].voidId} overlap along the ` +
          `stacking axis; not a linear bay stack.`
      );
    }
  }

  // Build the alternating solid/void run stack.
  const runs: BayRun[] = [];
  let cursor = outerStart;

  intervals.forEach((iv, i) => {
    const solidLength = iv.start - cursor;
    runs.push({
      kind: i === 0 ? "END_WALL" : "INTERIOR_WEB",
      index: runs.length,
      start: cursor,
      end: iv.start,
      length: solidLength,
      refs: i === 0 ? [iv.voidId] : [intervals[i - 1].voidId, iv.voidId],
    });
    runs.push({
      kind: "BAY",
      index: runs.length,
      start: iv.start,
      end: iv.end,
      length: iv.span,
      refs: [iv.voidId],
    });
    cursor = iv.end;
  });

  runs.push({
    kind: "END_WALL",
    index: runs.length,
    start: cursor,
    end: outerEnd,
    length: outerEnd - cursor,
    refs: [intervals[intervals.length - 1].voidId],
  });

  const bayRuns = runs.filter((r) => r.kind === "BAY");
  const endWalls = runs.filter((r) => r.kind === "END_WALL");
  const interiorRuns = runs.filter((r) => r.kind === "INTERIOR_WEB");

  if (bayRuns.some((r) => r.length <= policy.geometry_mm)) {
    return empty("A bay projected to zero width along the stacking axis.");
  }
  if (endWalls.some((r) => r.length < -policy.geometry_mm)) {
    return empty("A void extends beyond the outer envelope along the stacking axis.");
  }

  // --- Clustering: this is what collapses 2N clearances into 2–3 cards. ---
  const bayClusters = clusterMeasurements(
    bayRuns.map((r) => ({ value: r.length, ref: r.refs[0] })),
    policy.cluster_mm
  );

  // End walls always cluster as WallThickness. Interior runs split into webs
  // (structural, clustered with the walls) and gaps (thin, clustered separately).
  const wallSamples = endWalls.map((r, i) => ({ value: r.length, ref: `end_wall_${i}` }));
  const endWallMean =
    wallSamples.length > 0
      ? wallSamples.reduce((s, w) => s + w.value, 0) / wallSamples.length
      : 0;

  const webSamples: { value: number; ref: string }[] = [];
  const gapSamples: { value: number; ref: string }[] = [];
  interiorRuns.forEach((r, i) => {
    const sample = { value: r.length, ref: `web_${i}` };
    if (endWallMean > 0 && r.length <= gapWebRatio * endWallMean) gapSamples.push(sample);
    else webSamples.push(sample);
  });

  const wallClusters = clusterMeasurements([...wallSamples, ...webSamples], policy.cluster_mm);
  const gapClusters = clusterMeasurements(gapSamples, policy.cluster_mm);

  const parameters: BayStackParameter[] = [];

  bayClusters.forEach((c, i) => {
    parameters.push({
      name: bayClusters.length === 1 ? bayName : `${bayName}_${i + 1}`,
      value: c.mean,
      role: "DRIVING",
      occurrences: c.members.length,
      deviation: c.deviation,
      memberRefs: c.members,
    });
  });

  wallClusters.forEach((c, i) => {
    parameters.push({
      name: wallClusters.length === 1 ? wallName : `${wallName}_${i + 1}`,
      value: c.mean,
      role: "DRIVING",
      occurrences: c.members.length,
      deviation: c.deviation,
      memberRefs: c.members,
    });
  });

  gapClusters.forEach((c, i) => {
    parameters.push({
      name: gapClusters.length === 1 ? gapName : `${gapName}_${i + 1}`,
      value: c.mean,
      role: "DRIVING",
      occurrences: c.members.length,
      deviation: c.deviation,
      memberRefs: c.members,
    });
  });

  const N = bayRuns.length;
  const stackExpression = buildStackExpression(
    N,
    bayClusters.length === 1 ? bayName : null,
    wallClusters.length === 1 ? wallName : null,
    gapClusters.length === 1 ? gapName : null,
    endWalls.length + webSamples.length,
    gapSamples.length,
    bayName,
    wallName,
    gapName
  );

  const summed = runs.reduce((s, r) => s + r.length, 0);
  const closureResidual = Math.abs(totalSpan - summed);

  parameters.push({
    name: "TotalSpan",
    value: totalSpan,
    role: "DERIVED",
    occurrences: 1,
    deviation: closureResidual,
    memberRefs: runs.map((r) => `run_${r.index}`),
  });

  return {
    recognised: true,
    bayCount: N,
    axis,
    axisOrigin: origin,
    intervals,
    runs,
    parameters,
    stackExpression,
    totalSpan,
    closureResidual,
    axisAmbiguous,
  };
}

function normalizeAxis(axis: { x: number; y: number }): { x: number; y: number } {
  const len = Math.hypot(axis.x, axis.y);
  if (len < 1e-12) return { x: 1, y: 0 };
  let ax = axis.x / len;
  let ay = axis.y / len;
  if (ax < -1e-12 || (Math.abs(ax) <= 1e-12 && ay < 0)) {
    ax = -ax;
    ay = -ay;
  }
  return { x: ax, y: ay };
}

/**
 * Builds the canonical stack relation. When every bay clusters to one value and
 * every solid run clusters to one value, this is exactly the §21 / §80 relation:
 *
 *     TotalSpan = N*ClearSpan + (N+1)*WallThickness + (N-1)*Gap
 *
 * With mixed clusters it degrades gracefully to an explicit per-cluster sum
 * rather than fabricating a uniformity the geometry does not show.
 */
function buildStackExpression(
  bayCount: number,
  uniformBayName: string | null,
  uniformWallName: string | null,
  uniformGapName: string | null,
  wallRunCount: number,
  gapRunCount: number,
  bayFallback: string,
  wallFallback: string,
  gapFallback: string
): string | null {
  if (bayCount < 1) return null;

  const parts: string[] = [];

  if (uniformBayName) parts.push(bayCount === 1 ? uniformBayName : `${bayCount}*${uniformBayName}`);
  else parts.push(`sum(${bayFallback}_1..${bayFallback}_${bayCount})`);

  if (wallRunCount > 0) {
    if (uniformWallName)
      parts.push(wallRunCount === 1 ? uniformWallName : `${wallRunCount}*${uniformWallName}`);
    else parts.push(`sum(${wallFallback}_*)`);
  }

  if (gapRunCount > 0) {
    if (uniformGapName)
      parts.push(gapRunCount === 1 ? uniformGapName : `${gapRunCount}*${uniformGapName}`);
    else parts.push(`sum(${gapFallback}_*)`);
  }

  return parts.join(" + ");
}

/**
 * Single-void default axis: the principal axis of the void's OWN boundary
 * points — the direction of its greatest extent. Derived from the geometry and
 * therefore rotation-invariant, but still only a default: the caller should pass
 * an explicit `axis` when the author has declared which direction is the span.
 */
export function principalAxisOf(points: Point2D[]): { x: number; y: number } {
  if (points.length < 2) return { x: 1, y: 0 };
  const mean = centroidOf(points);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.x - mean.x;
    const dy = p.y - mean.y;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  const trace = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda = trace / 2 + disc;

  let vx = sxy;
  let vy = lambda - sxx;
  if (Math.hypot(vx, vy) < 1e-12) {
    // Axis-aligned scatter: the eigenvector is a coordinate direction.
    vx = sxx >= syy ? 1 : 0;
    vy = sxx >= syy ? 0 : 1;
  }
  return normalizeAxis({ x: vx, y: vy });
}
