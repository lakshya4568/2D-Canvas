import { Point2D } from "../topology/types";

export interface OrthonormalBasis2D {
  u: Point2D; // Normalized primary direction vector
  v: Point2D; // Perpendicular normal direction vector
}

/**
 * Constructs an orthonormal 2D basis (u, v) from a guide vector w1 using Gram-Schmidt.
 * v is chosen as the positive 90-degree normal (-u.y, u.x).
 */
export function gramSchmidt2D(guideVector: Point2D): OrthonormalBasis2D {
  const len = Math.hypot(guideVector.x, guideVector.y);
  if (len < 1e-15) {
    // Degenerate vector fallback to standard Cartesian basis
    return {
      u: { x: 1, y: 0 },
      v: { x: 0, y: 1 },
    };
  }

  const ux = guideVector.x / len;
  const uy = guideVector.y / len;

  // Positive 90-degree counter-clockwise normal
  const vx = -uy;
  const vy = ux;

  return {
    u: { x: ux, y: uy },
    v: { x: vx, y: vy },
  };
}
