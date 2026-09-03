import { Point2D } from "../topology/types";
import { AffineMatrix3x3 } from "./affineMatrix";

export class LocalFrame {
  public id: string;
  public origin: Point2D;
  public rotation: number; // In radians
  public scale: Point2D;
  public parentFrame: LocalFrame | null;

  constructor(
    id: string,
    origin: Point2D = { x: 0, y: 0 },
    rotation: number = 0,
    parentFrame: LocalFrame | null = null,
    scale: Point2D = { x: 1, y: 1 }
  ) {
    this.id = id;
    this.origin = { ...origin };
    this.rotation = rotation;
    this.parentFrame = parentFrame;
    this.scale = { ...scale };
  }

  /**
   * Relative matrix mapping local frame coordinates into parent frame coordinates.
   */
  public localToParentMatrix(): AffineMatrix3x3 {
    const T = AffineMatrix3x3.translation(this.origin.x, this.origin.y);
    const R = AffineMatrix3x3.rotation(this.rotation);
    const S = AffineMatrix3x3.scale(this.scale.x, this.scale.y);
    // M = T * R * S
    return T.multiply(R).multiply(S);
  }

  /**
   * Evaluates cumulative transformation matrix mapping local coordinates directly into world space.
   */
  public localToWorldMatrix(): AffineMatrix3x3 {
    const localMat = this.localToParentMatrix();
    if (this.parentFrame) {
      return this.parentFrame.localToWorldMatrix().multiply(localMat);
    }
    return localMat;
  }

  /**
   * Evaluates cumulative matrix mapping world coordinates into local frame space.
   */
  public worldToLocalMatrix(): AffineMatrix3x3 {
    return this.localToWorldMatrix().invertRigid();
  }

  /**
   * Transforms local point to world coordinates.
   */
  public toWorld(pt: Point2D): Point2D {
    return this.localToWorldMatrix().transformPoint(pt);
  }

  /**
   * Projects world point into local frame coordinates.
   */
  public toLocal(pt: Point2D): Point2D {
    return this.worldToLocalMatrix().transformPoint(pt);
  }
}
