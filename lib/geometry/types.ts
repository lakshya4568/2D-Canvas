export type ID = string;

export interface Point {
  x: number;
  y: number;
}

export interface ShapeStyle {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  opacity?: number;
  strokeDasharray?: string;
}

export interface LineShape {
  id: ID;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  strokeDasharray?: string;
}

export interface RectangleShape {
  id: ID;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  opacity?: number;
  strokeDasharray?: string;
}

export interface CircleShape {
  id: ID;
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  opacity?: number;
  strokeDasharray?: string;
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
