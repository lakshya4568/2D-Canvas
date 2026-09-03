import { Point2D } from "../geometry/topology/types";

export interface Segment {
  p1: Point2D;
  p2: Point2D;
}

export interface WallThicknessPair {
  outerSegment: Segment;
  innerSegment: Segment;
  thickness: number;
}

export function extractWallThicknessPairs(
  outerSegments: Segment[],
  innerSegments: Segment[],
  minThickness: number = 5.0,
  maxThickness: number = 200.0,
  parallelToleranceDeg: number = 2.0
): WallThicknessPair[] {
  const pairs: WallThicknessPair[] = [];

  for (const outer of outerSegments) {
    const odx = outer.p2.x - outer.p1.x;
    const ody = outer.p2.y - outer.p1.y;
    const oLen = Math.hypot(odx, ody);
    if (oLen < 1.0) continue;

    const oAngle = Math.atan2(ody, odx);

    for (const inner of innerSegments) {
      const idx = inner.p2.x - inner.p1.x;
      const idy = inner.p2.y - inner.p1.y;
      const iLen = Math.hypot(idx, idy);
      if (iLen < 1.0) continue;

      const iAngle = Math.atan2(idy, idx);

      let angleDiff = Math.abs(oAngle - iAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff > Math.PI / 2) angleDiff = Math.abs(Math.PI - angleDiff);

      const angleDiffDeg = (angleDiff * 180.0) / Math.PI;
      if (angleDiffDeg <= parallelToleranceDeg) {
        // Calculate perpendicular distance from inner.p1 to outer line
        // Distance = |(x - x1)*dy - (y - y1)*dx| / L
        const dist =
          Math.abs(
            (inner.p1.x - outer.p1.x) * ody - (inner.p1.y - outer.p1.y) * odx
          ) / oLen;

        if (dist >= minThickness && dist <= maxThickness) {
          pairs.push({
            outerSegment: outer,
            innerSegment: inner,
            thickness: dist,
          });
          break;
        }
      }
    }
  }

  return pairs;
}
