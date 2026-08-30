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
}

export interface LineShape extends BaseShape {
  type: "line";
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

export type Shape = LineShape | RectangleShape | CircleShape;

export type ShapeType = Shape["type"];

export type ToolId = "select" | "line" | "rectangle" | "circle" | "pan";

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

export interface SnapResult {
  point: Point;
  snapped: boolean;
  snapType: SnapType;
  targetPoint?: Point;
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
