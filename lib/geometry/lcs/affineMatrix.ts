import { Point2D } from "../topology/types";

/**
 * 3x3 Homogeneous Affine Transformation Matrix:
 * [ m00  m01  m02 ]   [ ux  vx  x0 ]
 * [ m10  m11  m12 ] = [ uy  vy  y0 ]
 * [   0    0    1 ]   [  0   0   1 ]
 */
export class AffineMatrix3x3 {
  public m: [number, number, number, number, number, number, number, number, number];

  constructor(
    elements: [number, number, number, number, number, number, number, number, number] = [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]
  ) {
    this.m = [...elements];
  }

  public static identity(): AffineMatrix3x3 {
    return new AffineMatrix3x3([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  public static translation(tx: number, ty: number): AffineMatrix3x3 {
    return new AffineMatrix3x3([1, 0, tx, 0, 1, ty, 0, 0, 1]);
  }

  public static rotation(theta: number): AffineMatrix3x3 {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return new AffineMatrix3x3([c, -s, 0, s, c, 0, 0, 0, 1]);
  }

  public static scale(sx: number, sy: number = sx): AffineMatrix3x3 {
    return new AffineMatrix3x3([sx, 0, 0, 0, sy, 0, 0, 0, 1]);
  }

  /**
   * Multiplies this matrix by matrix B: C = this * B.
   */
  public multiply(B: AffineMatrix3x3): AffineMatrix3x3 {
    const A = this.m;
    const b = B.m;

    return new AffineMatrix3x3([
      A[0] * b[0] + A[1] * b[3] + A[2] * b[6],
      A[0] * b[1] + A[1] * b[4] + A[2] * b[7],
      A[0] * b[2] + A[1] * b[5] + A[2] * b[8],

      A[3] * b[0] + A[4] * b[3] + A[5] * b[6],
      A[3] * b[1] + A[4] * b[4] + A[5] * b[7],
      A[3] * b[2] + A[4] * b[5] + A[5] * b[8],

      0, 0, 1,
    ]);
  }

  /**
   * Transforms a 2D point: P_out = M * P_in.
   */
  public transformPoint(p: Point2D): Point2D {
    const x = p.x;
    const y = p.y;
    return {
      x: this.m[0] * x + this.m[1] * y + this.m[2],
      y: this.m[3] * x + this.m[4] * y + this.m[5],
    };
  }

  /**
   * Inverts a rigid-body affine transformation (rotation + translation).
   * For M = [ R | t ]
   *         [ 0 | 1 ]
   * M^-1  = [ R^T | -R^T * t ]
   *         [  0  |     1    ]
   */
  public invertRigid(): AffineMatrix3x3 {
    const ux = this.m[0];
    const vx = this.m[1];
    const x0 = this.m[2];

    const uy = this.m[3];
    const vy = this.m[4];
    const y0 = this.m[5];

    // Transpose of 2x2 rotation/basis block
    const inv00 = ux;
    const inv01 = uy;
    const inv10 = vx;
    const inv11 = vy;

    // Translation block: -R^T * t
    const inv02 = -(inv00 * x0 + inv01 * y0);
    const inv12 = -(inv10 * x0 + inv11 * y0);

    return new AffineMatrix3x3([
      inv00, inv01, inv02,
      inv10, inv11, inv12,
      0, 0, 1,
    ]);
  }
}
