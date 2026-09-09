import { LineShape } from "../types";
import { Point2D } from "../topology/types";
import { PrimitiveAdapter, TopologicalVertex, TopologicalSegment } from "./types";

export class LineAdapter implements PrimitiveAdapter<LineShape> {
  public lower(shape: LineShape): {
    vertices: TopologicalVertex[];
    segments: TopologicalSegment[];
  } {
    const v0Id = `${shape.id}_v0`;
    const v1Id = `${shape.id}_v1`;

    const v0: TopologicalVertex = {
      id: v0Id,
      point: { x: shape.x1, y: shape.y1 },
      sourceShapeId: shape.id,
      sourceVertexIndex: 0,
    };

    const v1: TopologicalVertex = {
      id: v1Id,
      point: { x: shape.x2, y: shape.y2 },
      sourceShapeId: shape.id,
      sourceVertexIndex: 1,
    };

    const seg: TopologicalSegment = {
      id: `${shape.id}_seg0`,
      v1Id: v0Id,
      v2Id: v1Id,
      p1: { ...v0.point },
      p2: { ...v1.point },
      sourceShapeId: shape.id,
      sourceEdgeIndex: 0,
      curveType: "line",
    };

    return {
      vertices: [v0, v1],
      segments: [seg],
    };
  }

  public lift(shape: LineShape, vertexMap: Map<string, Point2D>): LineShape {
    const v0Id = `${shape.id}_v0`;
    const v1Id = `${shape.id}_v1`;
    const p1 = vertexMap.get(v0Id) ?? { x: shape.x1, y: shape.y1 };
    const p2 = vertexMap.get(v1Id) ?? { x: shape.x2, y: shape.y2 };

    return {
      ...shape,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
    };
  }
}
