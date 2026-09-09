import { Point2D } from "../topology/types";
import { BoundingBox2D } from "../topology/spatialIndex";
import { Shape } from "../types";

export interface TopologicalVertex {
  id: string;
  point: Point2D;
  sourceShapeId?: string;
  sourceVertexIndex?: number;
}

export interface TopologicalSegment {
  id: string;
  v1Id: string;
  v2Id: string;
  p1: Point2D;
  p2: Point2D;
  sourceShapeId: string;
  sourceEdgeIndex?: number;
  curveType: "line" | "arc";
  arcParams?: {
    center: Point2D;
    radius: number;
    startAngleRad: number;
    endAngleRad: number;
    ccw: boolean;
  };
}

export interface CarrierCurve {
  id: string;
  sourceShapeId: string;
  type: "ellipse" | "spline";
  isCarrier: true;
  isConstraintEditable: false;
  rawParams: Record<string, unknown>;
  boundingBox: BoundingBox2D;
}

export interface LoweredTopology {
  vertices: TopologicalVertex[];
  segments: TopologicalSegment[];
  carriers: CarrierCurve[];
}

export interface PrimitiveAdapter<TShape extends Shape = Shape> {
  lower(shape: TShape): {
    vertices: TopologicalVertex[];
    segments: TopologicalSegment[];
    carriers?: CarrierCurve[];
  };
  lift(
    shape: TShape,
    vertexMap: Map<string, Point2D>
  ): TShape;
}
