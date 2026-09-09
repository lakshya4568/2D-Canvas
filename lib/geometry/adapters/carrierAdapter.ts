import { EllipseShape } from "../types";
import { CarrierCurve } from "./types";
import { BoundingBox2D } from "../topology/spatialIndex";

export interface SplineShapeData {
  id: string;
  controlPoints: Array<{ x: number; y: number }>;
  degree?: number;
  knots?: number[];
  weights?: number[];
  isClosed?: boolean;
}

export class CarrierAdapter {
  public lowerEllipse(shape: EllipseShape): CarrierCurve {
    const minX = shape.cx - shape.rx;
    const maxX = shape.cx + shape.rx;
    const minY = shape.cy - shape.ry;
    const maxY = shape.cy + shape.ry;

    const boundingBox: BoundingBox2D = { minX, minY, maxX, maxY };

    return {
      id: `carrier_${shape.id}`,
      sourceShapeId: shape.id,
      type: "ellipse",
      isCarrier: true,
      isConstraintEditable: false,
      rawParams: {
        cx: shape.cx,
        cy: shape.cy,
        rx: shape.rx,
        ry: shape.ry,
        rotation: shape.rotation ?? 0,
      },
      boundingBox,
    };
  }

  public lowerSpline(shape: SplineShapeData): CarrierCurve {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pt of shape.controlPoints) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    const boundingBox: BoundingBox2D = {
      minX: isFinite(minX) ? minX : 0,
      minY: isFinite(minY) ? minY : 0,
      maxX: isFinite(maxX) ? maxX : 0,
      maxY: isFinite(maxY) ? maxY : 0,
    };

    return {
      id: `carrier_${shape.id}`,
      sourceShapeId: shape.id,
      type: "spline",
      isCarrier: true,
      isConstraintEditable: false,
      rawParams: {
        controlPoints: shape.controlPoints.map((p) => ({ ...p })),
        degree: shape.degree ?? 3,
        knots: shape.knots ? [...shape.knots] : undefined,
        weights: shape.weights ? [...shape.weights] : undefined,
        isClosed: shape.isClosed ?? false,
      },
      boundingBox,
    };
  }
}
