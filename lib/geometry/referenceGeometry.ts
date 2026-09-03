import { Shape, LineShape, RectangleShape } from "./types";

export type ReferenceGeometryType = "centerline" | "reference_line" | "reference_axis" | "construction_line";

export interface ReferenceGeometry {
  id: string;
  name: string;
  refType: ReferenceGeometryType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor?: string;
  strokeDasharray?: string;
  isLocked?: boolean;
  associatedShapeId?: string;
}

/**
 * Creates a centerline reference line for a shape.
 */
export function createShapeCenterline(shape: Shape, orientation: "vertical" | "horizontal" = "vertical"): ReferenceGeometry | null {
  if (shape.type === "rectangle") {
    const s = shape as RectangleShape;
    if (orientation === "vertical") {
      const cx = s.x + s.width / 2;
      return {
        id: `ref_center_${s.id}`,
        name: `${(s as any).name || s.id} Centerline`,
        refType: "centerline",
        x1: cx,
        y1: s.y - 40,
        x2: cx,
        y2: s.y + s.height + 40,
        strokeColor: "#38bdf8",
        strokeDasharray: "8 4 2 4", // Standard CAD centerline pattern
        associatedShapeId: s.id,
      };
    } else {
      const cy = s.y + s.height / 2;
      return {
        id: `ref_center_h_${s.id}`,
        name: `${(s as any).name || s.id} Horizontal Axis`,
        refType: "centerline",
        x1: s.x - 40,
        y1: cy,
        x2: s.x + s.width + 40,
        y2: cy,
        strokeColor: "#38bdf8",
        strokeDasharray: "8 4 2 4",
        associatedShapeId: s.id,
      };
    }
  }

  return null;
}

/**
 * Converts a reference line into a standard LineShape with reference flags for rendering.
 */
export function referenceGeometryToShape(ref: ReferenceGeometry): LineShape {
  return {
    id: ref.id,
    name: ref.name,
    type: "line",
    x1: ref.x1,
    y1: ref.y1,
    x2: ref.x2,
    y2: ref.y2,
    strokeColor: ref.strokeColor || "#38bdf8",
    strokeWidth: 1.5,
    strokeDasharray: ref.strokeDasharray || "8 4 2 4",
    isReference: true,
  } as any;
}
