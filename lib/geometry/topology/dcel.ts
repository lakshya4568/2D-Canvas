import { Point2D, DcelVertex, DcelHalfEdge, DcelEdge, DcelFace } from "./types";
import { SpatialHashGrid } from "./spatialHash";
import { extractDcelCycles } from "./cycleExtractor";

export class DcelPlanarMap {
  public vertices = new Map<string, DcelVertex>();
  public halfEdges = new Map<string, DcelHalfEdge>();
  public edges = new Map<string, DcelEdge>();
  public faces = new Map<string, DcelFace>();

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
  }

  /**
   * Builds a planar DCEL from discrete line segments with automatic vertex welding.
   */
  public static buildFromSegments(
    segments: Array<{ p1: Point2D; p2: Point2D }>,
    weldingTolerance: number = 1e-4
  ): DcelPlanarMap {
    const map = new DcelPlanarMap();
    const grid = new SpatialHashGrid(weldingTolerance * 2.0);

    // Map vertex ID -> array of outgoing half-edge IDs
    const outgoingByVertex = new Map<string, string[]>();

    // 1. Weld endpoints and create half-edge pairs
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const v1 = grid.insertOrFind(seg.p1, weldingTolerance);
      const v2 = grid.insertOrFind(seg.p2, weldingTolerance);

      // Register vertices in map
      if (!map.vertices.has(v1.id)) {
        map.vertices.set(v1.id, v1);
      }
      if (!map.vertices.has(v2.id)) {
        map.vertices.set(v2.id, v2);
      }

      // Ignore zero-length degenerate edges
      if (v1.id === v2.id) continue;

      const edgeId = `e_${++map.edgeCounter}`;
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
      };

      map.halfEdges.set(h1Id, h1);
      map.halfEdges.set(h2Id, h2);

      v1.incidentHalfEdge = h1Id;
      v2.incidentHalfEdge = h2Id;

      map.edges.set(edgeId, { id: edgeId, halfEdge: h1Id });

      if (!outgoingByVertex.has(v1.id)) outgoingByVertex.set(v1.id, []);
      outgoingByVertex.get(v1.id)!.push(h1Id);

      if (!outgoingByVertex.has(v2.id)) outgoingByVertex.set(v2.id, []);
      outgoingByVertex.get(v2.id)!.push(h2Id);
    }

    // 2. Link cycle next/prev pointers using radial counter-clockwise order
    for (const outEdgeIds of outgoingByVertex.values()) {
      if (outEdgeIds.length === 0) continue;

      // Sort outgoing half-edges counter-clockwise by polar angle
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

        // Preceding half-edge in CCW order around vertex
        const nextOutgoingId = outEdgeIds[(i - 1 + k) % k];
        incomingTwin.next = nextOutgoingId;
        map.halfEdges.get(nextOutgoingId)!.prev = incomingTwin.id;
      }
    }

    // 3. Extract faces and hole nesting
    const { faces } = extractDcelCycles(map.halfEdges, map.vertices);
    map.faces = faces;

    return map;
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
