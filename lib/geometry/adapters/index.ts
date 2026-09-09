import { Shape, LineShape, RectangleShape, CircleShape, PolygonShape, EllipseShape, StarShape } from "../types";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../tolerance";
import { SpatialHashGrid } from "../topology/spatialHash";
import { getStarPoints, rotatePoint } from "../metrics";
import {
  TopologicalVertex,
  TopologicalSegment,
  CarrierCurve,
  LoweredTopology,
} from "./types";
import { LineAdapter } from "./lineAdapter";
import { RectangleAdapter } from "./rectangleAdapter";
import { PolygonPolylineAdapter } from "./polygonPolylineAdapter";
import { CircleAdapter } from "./circleAdapter";
import { ArcAdapter, ArcShapeData } from "./arcAdapter";
import { CarrierAdapter, SplineShapeData } from "./carrierAdapter";

export * from "./types";
export * from "./lineAdapter";
export * from "./rectangleAdapter";
export * from "./polygonPolylineAdapter";
export * from "./circleAdapter";
export * from "./arcAdapter";
export * from "./carrierAdapter";

export interface LoweringOptions {
  policy?: TolerancePolicy;
  weldTolerance?: number;
}

const lineAdapter = new LineAdapter();
const rectangleAdapter = new RectangleAdapter();
const polygonAdapter = new PolygonPolylineAdapter();
const circleAdapter = new CircleAdapter();
const arcAdapter = new ArcAdapter();
const carrierAdapter = new CarrierAdapter();

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
    // Path compression
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
 * Lowers an array of heterogeneous geometric shapes into a shared topological segment/vertex graph.
 * Welds coincident vertices within policy.weld_mm using union-find.
 * Preserves source editing IDs and isolates carrier curves.
 */
export function lowerShapesToTopology(
  shapes: Shape[],
  options: LoweringOptions = {}
): LoweredTopology {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const weldTol = options.weldTolerance ?? policy.weld_mm;

  const rawVertices: TopologicalVertex[] = [];
  const rawSegments: TopologicalSegment[] = [];
  const carriers: CarrierCurve[] = [];

  // 1. Lower each shape polymorphically via its respective adapter
  for (const s of shapes) {
    const shapeId = s.id;
    switch (s.type) {
      case "line":
      case "arrow": {
        const res = lineAdapter.lower(s as LineShape);
        rawVertices.push(...res.vertices);
        rawSegments.push(...res.segments);
        break;
      }
      case "rectangle": {
        const res = rectangleAdapter.lower(s as RectangleShape);
        rawVertices.push(...res.vertices);
        rawSegments.push(...res.segments);
        break;
      }
      case "polygon": {
        const res = polygonAdapter.lower(s as PolygonShape);
        rawVertices.push(...res.vertices);
        rawSegments.push(...res.segments);
        break;
      }
      case "circle": {
        const res = circleAdapter.lower(s as CircleShape);
        rawVertices.push(...res.vertices);
        rawSegments.push(...res.segments);
        break;
      }
      case "ellipse": {
        const c = carrierAdapter.lowerEllipse(s as EllipseShape);
        carriers.push(c);
        break;
      }
      case "arc" as any: {
        const res = arcAdapter.lower(s as any);
        rawVertices.push(...res.vertices);
        rawSegments.push(...res.segments);
        break;
      }
      case "spline" as any: {
        const c = carrierAdapter.lowerSpline(s as any);
        carriers.push(c);
        break;
      }
      case "star": {
        const star = s as StarShape;
        const pts = getStarPoints(star.cx, star.cy, star.innerR, star.outerR, star.points);
        const rotation = star.rotation || 0;
        const center = { x: star.cx, y: star.cy };
        const finalPts = rotation !== 0 ? pts.map((p) => rotatePoint(p, center, rotation)) : pts;
        const starVerts: TopologicalVertex[] = finalPts.map((p, idx) => ({
          id: `${star.id}_v${idx}`,
          point: { x: p.x, y: p.y },
          sourceShapeId: star.id,
          sourceVertexIndex: idx,
        }));
        const starSegs: TopologicalSegment[] = [];
        const n = starVerts.length;
        for (let i = 0; i < n; i++) {
          const nextIdx = (i + 1) % n;
          starSegs.push({
            id: `${star.id}_seg${i}`,
            v1Id: starVerts[i].id,
            v2Id: starVerts[nextIdx].id,
            p1: { ...starVerts[i].point },
            p2: { ...starVerts[nextIdx].point },
            sourceShapeId: star.id,
            sourceEdgeIndex: i,
            curveType: "line",
          });
        }
        rawVertices.push(...starVerts);
        rawSegments.push(...starSegs);
        break;
      }
      default:
        break;
    }
  }

  // 2. Vertex welding across all shapes using SpatialHashGrid and Union-Find
  const grid = new SpatialHashGrid(weldTol * 2.0);
  const uf = new UnionFind();
  const canonicalVertexById = new Map<string, TopologicalVertex>();

  for (const v of rawVertices) {
    const nearby = grid.insertOrFind(v.point, weldTol);
    uf.union(v.id, nearby.id);
    if (!canonicalVertexById.has(nearby.id)) {
      canonicalVertexById.set(nearby.id, {
        id: nearby.id,
        point: { ...nearby.point },
        sourceShapeId: v.sourceShapeId,
        sourceVertexIndex: v.sourceVertexIndex,
      });
    }
  }

  // 3. Remap segments to welded canonical vertex IDs
  const finalSegments: TopologicalSegment[] = [];
  const seenSegmentEdges = new Set<string>();

  for (const seg of rawSegments) {
    const canonV1 = uf.find(seg.v1Id);
    const canonV2 = uf.find(seg.v2Id);

    // Skip degenerate zero-length segments
    if (canonV1 === canonV2) continue;

    const p1 = canonicalVertexById.get(canonV1)?.point ?? seg.p1;
    const p2 = canonicalVertexById.get(canonV2)?.point ?? seg.p2;

    const edgeKey = canonV1 < canonV2 ? `${canonV1}::${canonV2}` : `${canonV2}::${canonV1}`;

    finalSegments.push({
      ...seg,
      v1Id: canonV1,
      v2Id: canonV2,
      p1: { ...p1 },
      p2: { ...p2 },
    });
    seenSegmentEdges.add(edgeKey);
  }

  // 4. Collect active canonical vertices
  const activeVertexIds = new Set<string>();
  for (const seg of finalSegments) {
    activeVertexIds.add(seg.v1Id);
    activeVertexIds.add(seg.v2Id);
  }

  const finalVertices: TopologicalVertex[] = [];
  for (const vId of activeVertexIds) {
    const v = canonicalVertexById.get(vId);
    if (v) finalVertices.push(v);
  }

  return {
    vertices: finalVertices,
    segments: finalSegments,
    carriers,
  };
}
