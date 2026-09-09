import { Point2D } from "../topology/types";
import { TopologicalVertex, TopologicalSegment } from "./types";

export interface ArcShapeData {
  id: string;
  cx: number;
  cy: number;
  r: number;
  startAngleRad: number;
  endAngleRad: number;
  ccw?: boolean;
}

export class ArcAdapter {
  public lower(shape: ArcShapeData): {
    vertices: TopologicalVertex[];
    segments: TopologicalSegment[];
  } {
    const { id, cx, cy, r, startAngleRad, endAngleRad } = shape;
    const ccw = shape.ccw ?? true;
    const center: Point2D = { x: cx, y: cy };

    const startPoint: Point2D = {
      x: cx + r * Math.cos(startAngleRad),
      y: cy + r * Math.sin(startAngleRad),
    };

    const endPoint: Point2D = {
      x: cx + r * Math.cos(endAngleRad),
      y: cy + r * Math.sin(endAngleRad),
    };

    const v0: TopologicalVertex = {
      id: `${id}_v0`,
      point: startPoint,
      sourceShapeId: id,
      sourceVertexIndex: 0,
    };

    const v1: TopologicalVertex = {
      id: `${id}_v1`,
      point: endPoint,
      sourceShapeId: id,
      sourceVertexIndex: 1,
    };

    const seg: TopologicalSegment = {
      id: `${id}_seg0`,
      v1Id: v0.id,
      v2Id: v1.id,
      p1: { ...startPoint },
      p2: { ...endPoint },
      sourceShapeId: id,
      sourceEdgeIndex: 0,
      curveType: "arc",
      arcParams: {
        center,
        radius: r,
        startAngleRad,
        endAngleRad,
        ccw,
      },
    };

    return {
      vertices: [v0, v1],
      segments: [seg],
    };
  }

  public lift(shape: ArcShapeData, vertexMap: Map<string, Point2D>): ArcShapeData {
    const { id } = shape;
    const p0 = vertexMap.get(`${id}_v0`);
    const p1 = vertexMap.get(`${id}_v1`);

    if (!p0 || !p1) return shape;

    const startAngleRad = Math.atan2(p0.y - shape.cy, p0.x - shape.cx);
    const endAngleRad = Math.atan2(p1.y - shape.cy, p1.x - shape.cx);
    const r = (Math.hypot(p0.x - shape.cx, p0.y - shape.cy) + Math.hypot(p1.x - shape.cx, p1.y - shape.cy)) / 2;

    return {
      ...shape,
      r,
      startAngleRad,
      endAngleRad,
    };
  }
}
