export type ID = string;

export interface Point {
  x: number;
  y: number;
}

export interface BaseShape {
  id: ID;
  groupId?: string;
  name?: string;
  isLocked?: boolean;
  isVisible?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  strokeDasharray?: string;
  rotation?: number; // In degrees, 0 to 360
}

export interface LineShape extends BaseShape {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArrowShape extends BaseShape {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RectangleShape extends BaseShape {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
}

export interface CircleShape extends BaseShape {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  fillColor?: string;
}

export interface EllipseShape extends BaseShape {
  type: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fillColor?: string;
}

export interface PolygonShape extends BaseShape {
  type: "polygon";
  cx: number;
  cy: number;
  r: number;
  sides: number; // 3 for triangle, 5 for pentagon, 6 for hexagon
  fillColor?: string;
}

export interface StarShape extends BaseShape {
  type: "star";
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  points: number; // 5-point star
  fillColor?: string;
}

export type Shape =
  | LineShape
  | ArrowShape
  | RectangleShape
  | CircleShape
  | EllipseShape
  | PolygonShape
  | StarShape;

export type ShapeType = Shape["type"];

export type ToolId =
  | "select"
  | "line"
  | "polyline"
  | "arrow"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "polygon"
  | "chamfer"
  | "construction"
  | "dimension"
  | "star"
  | "pan";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export type SnapType = "grid" | "vertex" | null;
export type SnapCategory =
  | "endpoint"
  | "corner"
  | "midpoint"
  | "center"
  | "centroid"
  | "quadrant"
  | "perpendicular"
  | "intersection"
  | "edge"
  | "chamfer_ref"
  | "grid";

export interface SnapResult {
  point: Point;
  snapped: boolean;
  snapType: SnapType;
  category?: SnapCategory;
  targetPoint?: Point;
  sourcePoint?: Point;
  snapLabel?: string;
  guideLines?: { x1: number; y1: number; x2: number; y2: number }[];
}

export interface LineMetricsResult {
  length: number;
  angleDeg: number;
  midpoint: Point;
  dx: number;
  dy: number;
}

export interface RectMetricsResult {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  perimeter: number;
  center: Point;
}

export interface CircleMetricsResult {
  cx: number;
  cy: number;
  r: number;
  diameter: number;
  circumference: number;
  area: number;
}

export interface ShapeGroup {
  id: string;
  name: string;
  shapeIds: string[];
}
