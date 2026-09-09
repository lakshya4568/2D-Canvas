import { RectangleShape } from "../types";
import { Point2D } from "../topology/types";
import { rotatePoint } from "../metrics";
import { PrimitiveAdapter, TopologicalVertex, TopologicalSegment } from "./types";

export class RectangleAdapter implements PrimitiveAdapter<RectangleShape> {
  public lower(shape: RectangleShape): {
    vertices: TopologicalVertex[];
    segments: TopologicalSegment[];
  } {
    const { id, x, y, width, height } = shape;
    const rotation = shape.rotation || 0;

    let corners: Point2D[] = [
      { x, y },                      // v0: Top-Left
      { x: x + width, y },           // v1: Top-Right
      { x: x + width, y: y + height },// v2: Bottom-Right
      { x, y: y + height },          // v3: Bottom-Left
    ];

    if (rotation !== 0) {
      const center = { x: x + width / 2, y: y + height / 2 };
      corners = corners.map((pt) => rotatePoint(pt, center, rotation));
    }

    const vertices: TopologicalVertex[] = corners.map((pt, idx) => ({
      id: `${id}_v${idx}`,
      point: { ...pt },
      sourceShapeId: id,
      sourceVertexIndex: idx,
    }));

    const segments: TopologicalSegment[] = [];
    for (let i = 0; i < 4; i++) {
      const nextIdx = (i + 1) % 4;
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

  public lift(shape: RectangleShape, vertexMap: Map<string, Point2D>): RectangleShape {
    const { id } = shape;
    const v0 = vertexMap.get(`${id}_v0`) ?? { x: shape.x, y: shape.y };
    const v1 = vertexMap.get(`${id}_v1`) ?? { x: shape.x + shape.width, y: shape.y };
    const v2 = vertexMap.get(`${id}_v2`) ?? { x: shape.x + shape.width, y: shape.y + shape.height };
    const v3 = vertexMap.get(`${id}_v3`) ?? { x: shape.x, y: shape.y + shape.height };

    const minX = Math.min(v0.x, v1.x, v2.x, v3.x);
    const maxX = Math.max(v0.x, v1.x, v2.x, v3.x);
    const minY = Math.min(v0.y, v1.y, v2.y, v3.y);
    const maxY = Math.max(v0.y, v1.y, v2.y, v3.y);

    return {
      ...shape,
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }
}
