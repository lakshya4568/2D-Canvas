import { CircleShape } from "../types";
import { Point2D } from "../topology/types";
import { PrimitiveAdapter, TopologicalVertex, TopologicalSegment } from "./types";

export class CircleAdapter implements PrimitiveAdapter<CircleShape> {
  public lower(shape: CircleShape): {
    vertices: TopologicalVertex[];
    segments: TopologicalSegment[];
  } {
    const { id, cx, cy, r } = shape;
    const center: Point2D = { x: cx, y: cy };

    // 4 cardinal quadrant vertices: 0° (East), 90° (South), 180° (West), 270° (North)
    // using SVG screen coordinate system (y grows downward) or standard cartesian
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    const vertices: TopologicalVertex[] = angles.map((angle, idx) => ({
      id: `${id}_v${idx}`,
      point: {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      },
      sourceShapeId: id,
      sourceVertexIndex: idx,
    }));

    const segments: TopologicalSegment[] = [];
    for (let i = 0; i < 4; i++) {
      const nextIdx = (i + 1) % 4;
      const startAngle = angles[i];
      const endAngle = angles[nextIdx];

      segments.push({
        id: `${id}_seg${i}`,
        v1Id: vertices[i].id,
        v2Id: vertices[nextIdx].id,
        p1: { ...vertices[i].point },
        p2: { ...vertices[nextIdx].point },
        sourceShapeId: id,
        sourceEdgeIndex: i,
        curveType: "arc",
        arcParams: {
          center: { ...center },
          radius: r,
          startAngleRad: startAngle,
          endAngleRad: endAngle,
          ccw: true,
        },
      });
    }

    return { vertices, segments };
  }

  public lift(shape: CircleShape, vertexMap: Map<string, Point2D>): CircleShape {
    const { id } = shape;
    const pts: Point2D[] = [];
    for (let i = 0; i < 4; i++) {
      const pt = vertexMap.get(`${id}_v${i}`);
      if (pt) pts.push(pt);
    }

    if (pts.length === 0) return shape;

    const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    const r = pts.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;

    return {
      ...shape,
      cx,
      cy,
      r,
    };
  }
}
