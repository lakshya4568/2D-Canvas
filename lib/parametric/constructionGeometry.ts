/**
 * Construction & Reference Geometry for 2D Parametric CAD
 * Manages reference lines, infinite axes, guide lines, measurement lines,
 * and corner reference vectors.
 * Addressable by the constraint system and dependency graph.
 */

import { Point } from "../geometry/types";

export type ConstructionType =
  | "reference_line"
  | "infinite_axis"
  | "guide_line"
  | "measurement_line"
  | "corner_vector"
  | "center_mark";

export interface ConstructionElement {
  id: string;
  name: string;
  type: ConstructionType;
  p1: Point;
  p2?: Point;
  direction?: Point; // Normalized unit vector for infinite axis
  referenceFeatureId?: string; // e.g. edge or corner it derives from
  color: string;
  dashPattern: string;
  isVisible: boolean;
  isLocked: boolean;
  length?: number;
  angleDeg?: number;
}

export class ConstructionManager {
  public elements = new Map<string, ConstructionElement>();

  public addReferenceLine(
    id: string,
    name: string,
    p1: Point,
    p2: Point,
    referenceFeatureId?: string
  ): ConstructionElement {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    const elem: ConstructionElement = {
      id,
      name,
      type: "reference_line",
      p1: { ...p1 },
      p2: { ...p2 },
      length: Number(len.toFixed(2)),
      angleDeg: Number(angle.toFixed(2)),
      referenceFeatureId,
      color: "#94a3b8", // Muted slate color for CAD guides
      dashPattern: "6 4",
      isVisible: true,
      isLocked: false,
    };
    this.elements.set(id, elem);
    return elem;
  }

  public addInfiniteAxis(
    id: string,
    name: string,
    origin: Point,
    direction: Point,
    referenceFeatureId?: string
  ): ConstructionElement {
    const len = Math.hypot(direction.x, direction.y) || 1;
    const dir: Point = { x: direction.x / len, y: direction.y / len };
    let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    const elem: ConstructionElement = {
      id,
      name,
      type: "infinite_axis",
      p1: { ...origin },
      direction: dir,
      angleDeg: Number(angle.toFixed(2)),
      referenceFeatureId,
      color: "#38bdf8", // Cyan reference axis
      dashPattern: "12 4 3 4",
      isVisible: true,
      isLocked: true,
    };
    this.elements.set(id, elem);
    return elem;
  }

  public addCornerVector(
    id: string,
    name: string,
    corner: Point,
    bisectorDirection: Point,
    referenceFeatureId?: string
  ): ConstructionElement {
    const len = Math.hypot(bisectorDirection.x, bisectorDirection.y) || 1;
    const dir: Point = { x: bisectorDirection.x / len, y: bisectorDirection.y / len };
    const p2: Point = { x: corner.x + dir.x * 40, y: corner.y + dir.y * 40 };

    const elem: ConstructionElement = {
      id,
      name,
      type: "corner_vector",
      p1: { ...corner },
      p2,
      direction: dir,
      referenceFeatureId,
      color: "#f59e0b", // Amber corner reference
      dashPattern: "4 3",
      isVisible: true,
      isLocked: false,
    };
    this.elements.set(id, elem);
    return elem;
  }

  public removeElement(id: string): boolean {
    return this.elements.delete(id);
  }

  public clear(): void {
    this.elements.clear();
  }
}
