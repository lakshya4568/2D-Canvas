export type ID = string;

export interface Point {
  x: number;
  y: number;
}

export interface BaseShape {
  id: ID;
  groupId?: string;
  groupName?: string;
  groupPath?: string[];
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

export interface ArcShape extends BaseShape {
  type: "arc";
  cx: number;
  cy: number;
  radius: number;
  startAngle: number;
  endAngle: number;
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
  | "move"
  | "line"
  | "polyline"
  | "arc"
  | "arrow"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "polygon"
  | "chamfer"
  | "fillet"
  | "trim"
  | "extend"
  | "offset"
  | "mirror"
  | "array"
  | "construction"
  | "dimension"
  | "measure"
  | "rotate"
  | "scale"
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

export type GripType = "vertex" | "midpoint" | "center" | "quadrant";
export type GripState = "warm" | "hover" | "hot";

export interface CadGrip {
  id: string;
  shapeId: string;
  type: GripType;
  x: number;
  y: number;
  vertexIndex?: number;
  segmentIndex?: number;
  state: GripState;
  cursor: string;
  tooltip?: string;
}

export type PortKind = "point" | "edge" | "surface";

export interface ComponentPort {
  id: string;
  label: string;
  kind: PortKind;
  localOrigin: { x: string; y: string };
  localAngleDeg: string;
  compatiblePortKinds: string[];
}

export interface ComponentInstanceAttachment {
  parentInstanceId: string;
  parentPortId: string;
  ownPortId: string;
  offsetExpr?: { dx: string; dy: string; dAngle?: string };
}
