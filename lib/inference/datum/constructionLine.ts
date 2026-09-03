import { Point2D } from "../../geometry/topology/types";

export interface ConstructionLine {
  id: string;
  origin: Point2D;
  direction: Point2D; // Normalized unit vector
  isSymmetryAxis?: boolean;
}

export function computeVirtualIntersection(
  p1: Point2D,
  p2: Point2D,
  q1: Point2D,
  q2: Point2D
): Point2D | null {
  const dpx = p2.x - p1.x;
  const dpy = p2.y - p1.y;
  const dqx = q2.x - q1.x;
  const dqy = q2.y - q1.y;

  const denom = dpx * dqy - dpy * dqx;
  if (Math.abs(denom) < 1e-12) {
    return null; // Parallel or degenerate
  }

  const dxqp = q1.x - p1.x;
  const dyqp = q1.y - p1.y;

  const t = (dxqp * dqy - dyqp * dqx) / denom;

  return {
    x: p1.x + t * dpx,
    y: p1.y + t * dpy,
  };
}
