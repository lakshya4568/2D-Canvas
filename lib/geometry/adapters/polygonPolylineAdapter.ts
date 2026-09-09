import { PolygonShape, Point } from "../types";
import { Point2D } from "../topology/types";
import { getPolygonPoints, rotatePoint } from "../metrics";
import { PrimitiveAdapter, TopologicalVertex, TopologicalSegment } from "./types";

export interface PolylineData {
  id: string;
  points: Point2D[];
  closed: boolean;
  sourceShapeId?: string;
}

export class PolygonPolylineAdapter implements PrimitiveAdapter<PolygonShape> {
  public lower(shape: PolygonShape): {
    vertices: TopologicalVertex[];
    segments: TopologicalSegment[];
  } {
    const { id, cx, cy, r, sides } = shape;
    let pts: Point[] = getPolygonPoints(cx, cy, r, sides);
    const rotation = shape.rotation || 0;
    if (rotation !== 0) {
      const center: Point = { x: cx, y: cy };
      pts = pts.map((pt) => rotatePoint(pt, center, rotation));
    }

    const vertices: TopologicalVertex[] = pts.map((pt, idx) => ({
      id: `${id}_v${idx}`,
      point: { x: pt.x, y: pt.y },
      sourceShapeId: id,
      sourceVertexIndex: idx,
    }));

    const segments: TopologicalSegment[] = [];
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const nextIdx = (i + 1) % n;
      segments.push({
        id: `${id}_seg${i}`,
        v1Id: vertices[i].id,
        v2Id: vertices[nextIdx].id,
        p1: { ...vertices[i].point },
        p2: { ...vertices[nextIdx].point },
        sourceShapeId: id,
        sourceEdgeIndex: i,
        curveType: "line",
      });
    }

    return { vertices, segments };
  }

  public lowerPolyline(data: PolylineData): {
    vertices: TopologicalVertex[];
    segments: TopologicalSegment[];
  } {
    const shapeId = data.sourceShapeId || data.id;
    const vertices: TopologicalVertex[] = data.points.map((pt, idx) => ({
      id: `${shapeId}_v${idx}`,
      point: { ...pt },
      sourceShapeId: shapeId,
      sourceVertexIndex: idx,
    }));

    const segments: TopologicalSegment[] = [];
    const count = data.closed ? vertices.length : vertices.length - 1;

    for (let i = 0; i < count; i++) {
      const nextIdx = (i + 1) % vertices.length;
      segments.push({
        id: `${shapeId}_seg${i}`,
        v1Id: vertices[i].id,
        v2Id: vertices[nextIdx].id,
        p1: { ...vertices[i].point },
        p2: { ...vertices[nextIdx].point },
        sourceShapeId: shapeId,
        sourceEdgeIndex: i,
        curveType: "line",
      });
    }

    return { vertices, segments };
  }

  public lift(shape: PolygonShape, vertexMap: Map<string, Point2D>): PolygonShape {
    const { id, sides } = shape;
    let sumX = 0;
    let sumY = 0;
    const currentPts: Point2D[] = [];

    for (let i = 0; i < sides; i++) {
      const pt = vertexMap.get(`${id}_v${i}`);
      if (pt) {
        sumX += pt.x;
        sumY += pt.y;
        currentPts.push(pt);
      }
    }

    if (currentPts.length === 0) return shape;

    const cx = sumX / currentPts.length;
    const cy = sumY / currentPts.length;
    let totalR = 0;
    for (const pt of currentPts) {
      totalR += Math.hypot(pt.x - cx, pt.y - cy);
    }
    const r = totalR / currentPts.length;

    return {
      ...shape,
      cx,
      cy,
      r,
    };
  }
}
