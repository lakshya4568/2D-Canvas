import { Point2D } from "../topology/types";

export interface PolygonMoments {
  area: number;           // Absolute positive area
  signedArea: number;     // Positive for CCW, negative for CW
  perimeter: number;
  centroid: Point2D;
  IxxOrigin: number;      // Moment of inertia about origin
  IyyOrigin: number;
  IxyOrigin: number;
  IxxCentroid: number;    // Moment of inertia about polygon's centroid
  IyyCentroid: number;
  IxyCentroid: number;
}

export interface CompositeProperties {
  grossArea: number;
  voidArea: number;
  netArea: number;
  perimeter: number;
  centroid: Point2D;
  IxxNet: number;
  IyyNet: number;
}

/**
 * Computes exact geometric moments of an arbitrary closed polygon via Green's theorem.
 */
export function computePolygonMoments(vertices: Point2D[]): PolygonMoments {
  const n = vertices.length;
  if (n < 3) {
    return {
      area: 0,
      signedArea: 0,
      perimeter: 0,
      centroid: { x: 0, y: 0 },
      IxxOrigin: 0,
      IyyOrigin: 0,
      IxyOrigin: 0,
      IxxCentroid: 0,
      IyyCentroid: 0,
      IxyCentroid: 0,
    };
  }

  let signedArea = 0.0;
  let perimeter = 0.0;
  let cxSum = 0.0;
  let cySum = 0.0;
  let IxxSum = 0.0;
  let IyySum = 0.0;
  let IxySum = 0.0;

  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const x0 = vertices[i].x;
    const y0 = vertices[i].y;
    const x1 = vertices[nextIdx].x;
    const y1 = vertices[nextIdx].y;

    const cross = x0 * y1 - x1 * y0;
    signedArea += cross;
    perimeter += Math.hypot(x1 - x0, y1 - y0);

    cxSum += (x0 + x1) * cross;
    cySum += (y0 + y1) * cross;

    IxxSum += (y0 * y0 + y0 * y1 + y1 * y1) * cross;
    IyySum += (x0 * x0 + x0 * x1 + x1 * x1) * cross;
    IxySum += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * cross;
  }

  signedArea *= 0.5;
  const absArea = Math.abs(signedArea);

  if (absArea < 1e-12) {
    return {
      area: 0,
      signedArea: 0,
      perimeter,
      centroid: { x: 0, y: 0 },
      IxxOrigin: 0,
      IyyOrigin: 0,
      IxyOrigin: 0,
      IxxCentroid: 0,
      IyyCentroid: 0,
      IxyCentroid: 0,
    };
  }

  // Centroid via Green's theorem: 1 / (6 * A) * sum
  const cx = cxSum / (6.0 * signedArea);
  const cy = cySum / (6.0 * signedArea);

  // Moments about origin: 1 / 12 * sum
  const IxxOrigin = IxxSum / 12.0;
  const IyyOrigin = IyySum / 12.0;
  const IxyOrigin = IxySum / 24.0;

  // Parallel axis theorem to centroid: I_centroid = I_origin - A * d^2
  const IxxCentroid = Math.abs(IxxOrigin) - absArea * cy * cy;
  const IyyCentroid = Math.abs(IyyOrigin) - absArea * cx * cx;
  const IxyCentroid = IxyOrigin - signedArea * cx * cy;

  return {
    area: absArea,
    signedArea,
    perimeter,
    centroid: { x: cx, y: cy },
    IxxOrigin: Math.abs(IxxOrigin),
    IyyOrigin: Math.abs(IyyOrigin),
    IxyOrigin,
    IxxCentroid: Math.max(0, IxxCentroid),
    IyyCentroid: Math.max(0, IyyCentroid),
    IxyCentroid,
  };
}

/**
 * Computes net structural cross-section properties for a boundary with multiple internal voids.
 */
export function computeCompositeProperties(
  outerLoop: Point2D[],
  holes: Point2D[][] = []
): CompositeProperties {
  const outerMoments = computePolygonMoments(outerLoop);
  const holeMoments = holes.map((h) => computePolygonMoments(h));

  const grossArea = outerMoments.area;
  let voidArea = 0.0;
  let perimeter = outerMoments.perimeter;

  let weightedCx = outerMoments.area * outerMoments.centroid.x;
  let weightedCy = outerMoments.area * outerMoments.centroid.y;

  for (const hm of holeMoments) {
    voidArea += hm.area;
    perimeter += hm.perimeter;
    weightedCx -= hm.area * hm.centroid.x;
    weightedCy -= hm.area * hm.centroid.y;
  }

  const netArea = Math.max(0, grossArea - voidArea);
  const compositeCentroid: Point2D =
    netArea > 1e-12
      ? { x: weightedCx / netArea, y: weightedCy / netArea }
      : { ...outerMoments.centroid };

  // Parallel axis theorem: I_net = (I_outer_c + A_outer * dy_outer^2) - sum(I_hole_c + A_hole * dy_hole^2)
  const dyOuter = outerMoments.centroid.y - compositeCentroid.y;
  const dxOuter = outerMoments.centroid.x - compositeCentroid.x;

  let IxxNet = outerMoments.IxxCentroid + outerMoments.area * dyOuter * dyOuter;
  let IyyNet = outerMoments.IyyCentroid + outerMoments.area * dxOuter * dxOuter;

  for (const hm of holeMoments) {
    const dyHole = hm.centroid.y - compositeCentroid.y;
    const dxHole = hm.centroid.x - compositeCentroid.x;
    IxxNet -= hm.IxxCentroid + hm.area * dyHole * dyHole;
    IyyNet -= hm.IyyCentroid + hm.area * dxHole * dxHole;
  }

  return {
    grossArea,
    voidArea,
    netArea,
    perimeter,
    centroid: compositeCentroid,
    IxxNet: Math.max(0, IxxNet),
    IyyNet: Math.max(0, IyyNet),
  };
}
