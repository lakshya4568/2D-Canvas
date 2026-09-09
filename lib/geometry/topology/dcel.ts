import { Point2D, DcelVertex, DcelHalfEdge, DcelEdge, DcelFace } from "./types";
import { SpatialHashGrid } from "./spatialHash";
import { extractDcelCycles } from "./cycleExtractor";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../tolerance";

export interface DcelSegmentInput {
  id?: string;
  p1: Point2D;
  p2: Point2D;
  sourceShapeId?: string;
  tags?: string[];
}

export interface DcelBuildOptions {
  policy?: TolerancePolicy;
  weldingTolerance?: number;
  previousFaces?: Map<string, DcelFace>;
  skipEulerValidation?: boolean;
}

/**
 * Union-Find Disjoint Set Union data structure for topological vertex welding.
 */
class UnionFind {
  private parent = new Map<string, string>();

  public find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    let root = x;
    while (root !== this.parent.get(root)!) {
      root = this.parent.get(root)!;
    }
    let curr = x;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  public union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootA, rootB);
    }
  }
}

/**
 * Splits intersecting, touching (T-junction), and overlapping segments so that
 * no two segments cross each other except at endpoints.
 */
export function splitIntersectingSegments(
  segments: DcelSegmentInput[],
  geometryTol: number,
  weldTol: number
): DcelSegmentInput[] {
  const n = segments.length;
  if (n <= 1) return segments;

  // Track split parameters t in (0, 1) for each segment
  const splitParams = new Map<number, Set<number>>();
  for (let i = 0; i < n; i++) {
    splitParams.set(i, new Set<number>());
  }

  for (let i = 0; i < n; i++) {
    const s1 = segments[i];
    const dx1 = s1.p2.x - s1.p1.x;
    const dy1 = s1.p2.y - s1.p1.y;
    const len1 = Math.hypot(dx1, dy1);
    if (len1 < weldTol) continue;

    for (let j = i + 1; j < n; j++) {
      const s2 = segments[j];
      const dx2 = s2.p2.x - s2.p1.x;
      const dy2 = s2.p2.y - s2.p1.y;
      const len2 = Math.hypot(dx2, dy2);
      if (len2 < weldTol) continue;

      // Broad-phase bounding box rejection
      const minX1 = Math.min(s1.p1.x, s1.p2.x) - geometryTol;
      const maxX1 = Math.max(s1.p1.x, s1.p2.x) + geometryTol;
      const minY1 = Math.min(s1.p1.y, s1.p2.y) - geometryTol;
      const maxY1 = Math.max(s1.p1.y, s1.p2.y) + geometryTol;

      const minX2 = Math.min(s2.p1.x, s2.p2.x) - geometryTol;
      const maxX2 = Math.max(s2.p1.x, s2.p2.x) + geometryTol;
      const minY2 = Math.min(s2.p1.y, s2.p2.y) - geometryTol;
      const maxY2 = Math.max(s2.p1.y, s2.p2.y) + geometryTol;

      if (minX1 > maxX2 || maxX1 < minX2 || minY1 > maxY2 || maxY1 < minY2) {
        continue;
      }

      const denom = dx1 * dy2 - dy1 * dx2;

      if (Math.abs(denom) > 1e-10) {
        // Non-parallel segments: check for crossing
        const t = ((s2.p1.x - s1.p1.x) * dy2 - (s2.p1.y - s1.p1.y) * dx2) / denom;
        const u = ((s2.p1.x - s1.p1.x) * dy1 - (s2.p1.y - s1.p1.y) * dx1) / denom;

        const eps1 = weldTol / len1;
        const eps2 = weldTol / len2;

        if (t > eps1 && t < 1 - eps1 && u > eps2 && u < 1 - eps2) {
          splitParams.get(i)!.add(t);
          splitParams.get(j)!.add(u);
        }
      }

      // Check T-junction: s2 endpoints lying on s1
      for (const pt of [s2.p1, s2.p2]) {
        const t = ((pt.x - s1.p1.x) * dx1 + (pt.y - s1.p1.y) * dy1) / (len1 * len1);
        const eps1 = weldTol / len1;
        if (t > eps1 && t < 1 - eps1) {
          const projX = s1.p1.x + t * dx1;
          const projY = s1.p1.y + t * dy1;
          if (Math.hypot(pt.x - projX, pt.y - projY) <= geometryTol) {
            splitParams.get(i)!.add(t);
          }
        }
      }

      // Check T-junction: s1 endpoints lying on s2
      for (const pt of [s1.p1, s1.p2]) {
        const u = ((pt.x - s2.p1.x) * dx2 + (pt.y - s2.p1.y) * dy2) / (len2 * len2);
        const eps2 = weldTol / len2;
        if (u > eps2 && u < 1 - eps2) {
          const projX = s2.p1.x + u * dx2;
          const projY = s2.p1.y + u * dy2;
          if (Math.hypot(pt.x - projX, pt.y - projY) <= geometryTol) {
            splitParams.get(j)!.add(u);
          }
        }
      }
    }
  }

  // Subdivide segments according to gathered split parameters
  const result: DcelSegmentInput[] = [];

  for (let i = 0; i < n; i++) {
    const s = segments[i];
    const params = Array.from(splitParams.get(i)!).sort((a, b) => a - b);

    if (params.length === 0) {
      result.push(s);
      continue;
    }

    const dx = s.p2.x - s.p1.x;
    const dy = s.p2.y - s.p1.y;
    const len = Math.hypot(dx, dy);
    const eps = weldTol / len;

    // Filter out parameters too close to each other
    const cleanParams: number[] = [];
    for (const p of params) {
      if (
        cleanParams.length === 0 ||
        p - cleanParams[cleanParams.length - 1] > eps
      ) {
        cleanParams.push(p);
      }
    }

    let prevPt = s.p1;
    for (const p of cleanParams) {
      const splitPt: Point2D = {
        x: s.p1.x + p * dx,
        y: s.p1.y + p * dy,
      };
      if (Math.hypot(splitPt.x - prevPt.x, splitPt.y - prevPt.y) >= weldTol) {
        result.push({
          p1: { ...prevPt },
          p2: { ...splitPt },
          sourceShapeId: s.sourceShapeId,
          tags: s.tags ? [...s.tags] : undefined,
        });
        prevPt = splitPt;
      }
    }

    if (Math.hypot(s.p2.x - prevPt.x, s.p2.y - prevPt.y) >= weldTol) {
      result.push({
        p1: { ...prevPt },
        p2: { ...s.p2 },
        sourceShapeId: s.sourceShapeId,
        tags: s.tags ? [...s.tags] : undefined,
      });
    }
  }

  return result;
}

/**
 * Counts the number of connected components in the DCEL graph.
 */
function countConnectedComponents(
  vertices: Map<string, DcelVertex>,
  edges: Map<string, DcelEdge>,
  halfEdges: Map<string, DcelHalfEdge>
): number {
  if (vertices.size === 0) return 0;

  const adj = new Map<string, Set<string>>();
  for (const vId of vertices.keys()) {
    adj.set(vId, new Set<string>());
  }

  for (const edge of edges.values()) {
    const he = halfEdges.get(edge.halfEdge);
    if (!he) continue;
    adj.get(he.origin)?.add(he.target);
    adj.get(he.target)?.add(he.origin);
  }

  const visited = new Set<string>();
  let components = 0;

  for (const vId of vertices.keys()) {
    if (visited.has(vId)) continue;
    components++;
    const queue = [vId];
    visited.add(vId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const nbrs = adj.get(curr);
      if (nbrs) {
        for (const nbr of nbrs) {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        }
      }
    }
  }

  return Math.max(1, components);
}

/**
 * Matches new faces with previously traced faces across rebuilds.
 * Preserves stable face IDs and tags across parameter sweeps.
 */
export function matchAndPersistFaces(
  newFaces: Map<string, DcelFace>,
  previousFaces: Map<string, DcelFace>
): void {
  if (previousFaces.size === 0) return;

  // 1. Preserve exterior face ID across rebuilds
  const prevExtFace = Array.from(previousFaces.values()).find((f) => f.isExterior);
  const newExtFace = Array.from(newFaces.values()).find((f) => f.isExterior);
  if (prevExtFace && newExtFace) {
    newExtFace.id = prevExtFace.id;
  }

  // 2. Maximum-weight greedy bipartite matching for interior faces
  const newInterior = Array.from(newFaces.values()).filter((f) => !f.isExterior);
  const prevInterior = Array.from(previousFaces.values()).filter((f) => !f.isExterior);

  interface MatchCandidate {
    newFace: DcelFace;
    prevFace: DcelFace;
    score: number;
  }

  const candidates: MatchCandidate[] = [];

  for (const newFace of newInterior) {
    for (const prevFace of prevInterior) {
      // 1. Tag overlap score (weight 1000)
      let tagOverlap = 0;
      if (newFace.tags && prevFace.tags) {
        tagOverlap = newFace.tags.filter((t) => prevFace.tags.includes(t)).length;
      }

      // 2. Nesting depth match (weight 100)
      const depthMatch = newFace.nestingDepth === prevFace.nestingDepth ? 1.0 : 0.0;

      // 3. Centroid proximity
      const dist = Math.hypot(
        newFace.centroid.x - prevFace.centroid.x,
        newFace.centroid.y - prevFace.centroid.y
      );

      // Score: higher is better
      const score = tagOverlap * 1000 + depthMatch * 100 - dist;
      candidates.push({ newFace, prevFace, score });
    }
  }

  // Sort candidates by score descending to prioritize the strongest matches
  candidates.sort((a, b) => b.score - a.score);

  const matchedNewIds = new Set<string>();
  const matchedPrevIds = new Set<string>();

  for (const cand of candidates) {
    if (matchedNewIds.has(cand.newFace.id) || matchedPrevIds.has(cand.prevFace.id)) {
      continue;
    }

    cand.newFace.id = cand.prevFace.id;
    const combinedTags = new Set([...cand.newFace.tags, ...cand.prevFace.tags]);
    cand.newFace.tags = Array.from(combinedTags);
    if (cand.prevFace.semanticCategory && cand.prevFace.semanticCategory !== "UNCLASSIFIED") {
      cand.newFace.semanticCategory = cand.prevFace.semanticCategory;
    }

    matchedNewIds.add(cand.newFace.id);
    matchedPrevIds.add(cand.prevFace.id);
  }
}

export class DcelPlanarMap {
  public vertices = new Map<string, DcelVertex>();
  public halfEdges = new Map<string, DcelHalfEdge>();
  public edges = new Map<string, DcelEdge>();
  public faces = new Map<string, DcelFace>();
  public connectedComponentsCount = 1;

  private vertexCounter = 0;
  private edgeCounter = 0;
  private halfEdgeCounter = 0;

  public clear(): void {
    this.vertices.clear();
    this.halfEdges.clear();
    this.edges.clear();
    this.faces.clear();
    this.vertexCounter = 0;
    this.edgeCounter = 0;
    this.halfEdgeCounter = 0;
    this.connectedComponentsCount = 1;
  }

  /**
   * Builds a planar DCEL from discrete line segments with automatic intersection splitting,
   * vertex welding via TolerancePolicy, radial half-edge sorting, face tracing, and Euler validation.
   */
  public static buildFromSegments(
    segments: Array<{ p1: Point2D; p2: Point2D; sourceShapeId?: string; tags?: string[] }>,
    optionsOrTolerance: DcelBuildOptions | TolerancePolicy | number = DEFAULT_TOLERANCE_POLICY
  ): DcelPlanarMap {
    let policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY;
    let previousFaces: Map<string, DcelFace> | undefined;
    let skipEulerValidation = false;

    if (typeof optionsOrTolerance === "number") {
      policy = {
        ...DEFAULT_TOLERANCE_POLICY,
        weld_mm: optionsOrTolerance,
      };
    } else if (optionsOrTolerance) {
      if ("weld_mm" in optionsOrTolerance) {
        policy = optionsOrTolerance;
      } else {
        if (optionsOrTolerance.policy) policy = optionsOrTolerance.policy;
        else if (optionsOrTolerance.weldingTolerance !== undefined) {
          policy = {
            ...DEFAULT_TOLERANCE_POLICY,
            weld_mm: optionsOrTolerance.weldingTolerance,
          };
        }
        previousFaces = optionsOrTolerance.previousFaces;
        skipEulerValidation = optionsOrTolerance.skipEulerValidation ?? false;
      }
    }

    const weldTol = policy.weld_mm;
    const geometryTol = policy.geometry_mm;

    // 1. Intersection splitting (planar arrangement)
    const splitSegs = splitIntersectingSegments(segments, geometryTol, weldTol);

    const map = new DcelPlanarMap();
    const grid = new SpatialHashGrid(weldTol * 2.0);

    // Track existing undirected edges between welded vertex pairs
    const edgesByVertexPair = new Map<string, string>(); // pairKey -> edgeId

    // Map vertex ID -> array of outgoing half-edge IDs
    const outgoingByVertex = new Map<string, string[]>();

    // 2. Weld endpoints and create half-edge pairs
    for (let i = 0; i < splitSegs.length; i++) {
      const seg = splitSegs[i];
      const v1 = grid.insertOrFind(seg.p1, weldTol);
      const v2 = grid.insertOrFind(seg.p2, weldTol);

      // Register vertices in map
      if (!map.vertices.has(v1.id)) {
        map.vertices.set(v1.id, v1);
      }
      if (!map.vertices.has(v2.id)) {
        map.vertices.set(v2.id, v2);
      }

      // Ignore zero-length degenerate edges
      if (v1.id === v2.id) continue;

      // Deduplicate shared / overlapping / coincident edges between the same vertex pair
      const pairKey = v1.id < v2.id ? `${v1.id}::${v2.id}` : `${v2.id}::${v1.id}`;
      if (edgesByVertexPair.has(pairKey)) {
        const existingEdgeId = edgesByVertexPair.get(pairKey)!;
        const existingEdge = map.edges.get(existingEdgeId);
        if (existingEdge) {
          const h1 = map.halfEdges.get(existingEdge.halfEdge);
          if (h1) {
            const h2 = map.halfEdges.get(h1.twin);
            if (seg.tags && seg.tags.length > 0) {
              const merged1 = new Set([...(h1.tags || []), ...seg.tags]);
              h1.tags = Array.from(merged1);
              if (h2) {
                const merged2 = new Set([...(h2.tags || []), ...seg.tags]);
                h2.tags = Array.from(merged2);
              }
            }
          }
        }
        continue;
      }

      const edgeId = `e_${++map.edgeCounter}`;
      edgesByVertexPair.set(pairKey, edgeId);

      const h1Id = `h_${++map.halfEdgeCounter}`;
      const h2Id = `h_${++map.halfEdgeCounter}`;

      const angle1 = Math.atan2(v2.point.y - v1.point.y, v2.point.x - v1.point.x);
      const angle2 = Math.atan2(v1.point.y - v2.point.y, v1.point.x - v2.point.x);

      const h1: DcelHalfEdge = {
        id: h1Id,
        origin: v1.id,
        target: v2.id,
        twin: h2Id,
        next: "",
        prev: "",
        face: null,
        edge: edgeId,
        angle: angle1,
        sourceShapeId: seg.sourceShapeId,
        tags: seg.tags ? [...seg.tags] : undefined,
      };

      const h2: DcelHalfEdge = {
        id: h2Id,
        origin: v2.id,
        target: v1.id,
        twin: h1Id,
        next: "",
        prev: "",
        face: null,
        edge: edgeId,
        angle: angle2,
        sourceShapeId: seg.sourceShapeId,
        tags: seg.tags ? [...seg.tags] : undefined,
      };

      map.halfEdges.set(h1Id, h1);
      map.halfEdges.set(h2Id, h2);

      v1.incidentHalfEdge = h1Id;
      v2.incidentHalfEdge = h2Id;

      map.edges.set(edgeId, {
        id: edgeId,
        halfEdge: h1Id,
        sourceShapeId: seg.sourceShapeId,
      });

      if (!outgoingByVertex.has(v1.id)) outgoingByVertex.set(v1.id, []);
      outgoingByVertex.get(v1.id)!.push(h1Id);

      if (!outgoingByVertex.has(v2.id)) outgoingByVertex.set(v2.id, []);
      outgoingByVertex.get(v2.id)!.push(h2Id);
    }

    // 3. Link cycle next/prev pointers using radial counter-clockwise order
    for (const outEdgeIds of outgoingByVertex.values()) {
      if (outEdgeIds.length === 0) continue;

      outEdgeIds.sort((a, b) => {
        const edgeA = map.halfEdges.get(a)!;
        const edgeB = map.halfEdges.get(b)!;
        return edgeA.angle - edgeB.angle;
      });

      const k = outEdgeIds.length;
      for (let i = 0; i < k; i++) {
        const outHId = outEdgeIds[i];
        const outH = map.halfEdges.get(outHId)!;
        const incomingTwin = map.halfEdges.get(outH.twin)!;

        const nextOutgoingId = outEdgeIds[(i - 1 + k) % k];
        incomingTwin.next = nextOutgoingId;
        map.halfEdges.get(nextOutgoingId)!.prev = incomingTwin.id;
      }
    }

    // 4. Extract faces and hole nesting
    const { faces } = extractDcelCycles(map.halfEdges, map.vertices);
    map.faces = faces;

    // 5. Face-identity persistence across rebuilds
    if (previousFaces && previousFaces.size > 0) {
      matchAndPersistFaces(map.faces, previousFaces);
    }

    // 6. Euler-characteristic validation on every DCEL build: V - E + F = 1 + C
    map.connectedComponentsCount = countConnectedComponents(
      map.vertices,
      map.edges,
      map.halfEdges
    );

    if (!skipEulerValidation && map.vertices.size > 0) {
      map.validateTopology();
    }

    return map;
  }

  /**
   * Validates Euler characteristic (V - E + F = 1 + C), half-edge twin pairing,
   * next/prev cycle continuity, and absence of disconnected joints.
   */
  public validateTopology(): void {
    const V = this.vertices.size;
    const E = this.edges.size;
    const F = this.faces.size;
    const C = this.connectedComponentsCount;

    // Count holes across faces for planar hole-adjusted Euler check
    let totalHoles = 0;
    for (const face of this.faces.values()) {
      totalHoles += face.innerHoles.length;
    }

    const euler = V - E + F;
    const expected = 1 + C;

    // Valid if standard V - E + F == 1 + C, or hole-adjusted V - E + F + H == 1 + C
    const isEulerValid = euler === expected || euler + totalHoles === expected;

    if (!isEulerValid) {
      throw new Error(
        `[DCEL Topology Error] Euler characteristic violation: V(${V}) - E(${E}) + F(${F}) = ${euler}, expected 1 + C(${C}) = ${expected} (holes: ${totalHoles}).`
      );
    }

    // Half-edge twin pairing check
    for (const he of this.halfEdges.values()) {
      const twin = this.halfEdges.get(he.twin);
      if (!twin || twin.twin !== he.id) {
        throw new Error(
          `[DCEL Topology Error] Half-edge twin pairing violation on '${he.id}' (twin: '${he.twin}').`
        );
      }
      const next = this.halfEdges.get(he.next);
      if (!next || next.prev !== he.id) {
        throw new Error(
          `[DCEL Topology Error] Cycle continuity violation on '${he.id}' (next: '${he.next}').`
        );
      }
    }

    // Zero disconnected joints check
    for (const v of this.vertices.values()) {
      if (!v.incidentHalfEdge || !this.halfEdges.has(v.incidentHalfEdge)) {
        throw new Error(
          `[DCEL Topology Error] Disconnected joint at vertex '${v.id}'.`
        );
      }
    }
  }

  /**
   * Retrieves ordered vertex points of a face's outer boundary.
   */
  public getFaceOuterPoints(faceId: string): Point2D[] {
    const face = this.faces.get(faceId);
    if (!face || !face.outerBoundary) return [];

    const pts: Point2D[] = [];
    let currId = face.outerBoundary;
    const visited = new Set<string>();

    while (!visited.has(currId)) {
      visited.add(currId);
      const he = this.halfEdges.get(currId);
      if (!he) break;
      const v = this.vertices.get(he.origin);
      if (v) pts.push({ ...v.point });
      currId = he.next;
    }

    return pts;
  }

  /**
   * Retrieves array of hole boundary point lists for a given face.
   */
  public getFaceHolePoints(faceId: string): Point2D[][] {
    const face = this.faces.get(faceId);
    if (!face || face.innerHoles.length === 0) return [];

    const holes: Point2D[][] = [];
    for (const holeStartId of face.innerHoles) {
      const pts: Point2D[] = [];
      let currId = holeStartId;
      const visited = new Set<string>();

      while (!visited.has(currId)) {
        visited.add(currId);
        const he = this.halfEdges.get(currId);
        if (!he) break;
        const v = this.vertices.get(he.origin);
        if (v) pts.push({ ...v.point });
        currId = he.next;
      }
      holes.push(pts);
    }

    return holes;
  }
}

/**
 * Lazy DCEL Manager with dirty flag caching and face persistence across rebuilds.
 */
export class LazyDcelManager {
  private isDirty = true;
  private cachedMap: DcelPlanarMap | null = null;
  private previousFaces = new Map<string, DcelFace>();
  private currentSegments: DcelSegmentInput[] = [];
  private policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY;
  private rebuildCount = 0;

  constructor(policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY) {
    this.policy = policy;
  }

  public setSegments(
    segments: DcelSegmentInput[],
    policy?: TolerancePolicy
  ): void {
    this.currentSegments = segments;
    if (policy) this.policy = policy;
    this.markDirty();
  }

  public markDirty(): void {
    this.isDirty = true;
  }

  public getIsDirty(): boolean {
    return this.isDirty;
  }

  public getRebuildCount(): number {
    return this.rebuildCount;
  }

  public getDCEL(): DcelPlanarMap {
    if (!this.isDirty && this.cachedMap) {
      return this.cachedMap;
    }

    const map = DcelPlanarMap.buildFromSegments(this.currentSegments, {
      policy: this.policy,
      previousFaces: this.previousFaces,
    });

    this.previousFaces = new Map(map.faces);
    this.cachedMap = map;
    this.isDirty = false;
    this.rebuildCount++;
    return map;
  }
}
