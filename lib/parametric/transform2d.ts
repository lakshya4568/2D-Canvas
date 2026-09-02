/**
 * 2D Affine Transformation & Local Coordinate System (LCS) Engine
 * Implements mathematically rigorous 2D affine transformation matrices [a, b, c, d, tx, ty],
 * Gram-Schmidt orthonormal basis construction, hierarchical parent-child transforms,
 * and bidirectional local <-> world coordinate mappings.
 */

import { Point } from "../geometry/types";

export interface Vector2D {
  x: number;
  y: number;
}

/**
 * 2D Affine Transform Matrix represented in column-major order:
 * [ a  c  tx ]   [ x ]   [ a*x + c*y + tx ]
 * [ b  d  ty ] * [ y ] = [ b*x + d*y + ty ]
 * [ 0  0  1  ]   [ 1 ]   [ 1              ]
 */
export interface AffineMatrix2D {
  a: number;  // scale X * cos(theta)
  b: number;  // scale X * sin(theta)
  c: number;  // -scale Y * sin(theta)
  d: number;  // scale Y * cos(theta)
  tx: number; // translation X
  ty: number; // translation Y
}

export class Transform2D {
  /**
   * Identity Matrix
   */
  public static identity(): AffineMatrix2D {
    return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  }

  /**
   * Pure Translation Matrix
   */
  public static translation(tx: number, ty: number): AffineMatrix2D {
    return { a: 1, b: 0, c: 0, d: 1, tx: tx, ty: ty };
  }

  /**
   * Pure Rotation Matrix around origin (or specified pivot)
   */
  public static rotation(angleRad: number, pivot?: Point): AffineMatrix2D {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    if (!pivot || (pivot.x === 0 && pivot.y === 0)) {
      return { a: cos, b: sin, c: -sin, d: cos, tx: 0, ty: 0 };
    }
    // T(pivot) * R(theta) * T(-pivot)
    return {
      a: cos,
      b: sin,
      c: -sin,
      d: cos,
      tx: pivot.x - cos * pivot.x + sin * pivot.y,
      ty: pivot.y - sin * pivot.x - cos * pivot.y,
    };
  }

  /**
   * Pure Scaling Matrix around origin (or specified pivot)
   */
  public static scale(sx: number, sy = sx, pivot?: Point): AffineMatrix2D {
    if (!pivot || (pivot.x === 0 && pivot.y === 0)) {
      return { a: sx, b: 0, c: 0, d: sy, tx: 0, ty: 0 };
    }
    return {
      a: sx,
      b: 0,
      c: 0,
      d: sy,
      tx: pivot.x * (1 - sx),
      ty: pivot.y * (1 - sy),
    };
  }

  /**
   * Composes two affine matrices: M = M1 * M2
   * Represents applying M2 first, then M1.
   */
  public static multiply(m1: AffineMatrix2D, m2: AffineMatrix2D): AffineMatrix2D {
    return {
      a: m1.a * m2.a + m1.c * m2.b,
      b: m1.b * m2.a + m1.d * m2.b,
      c: m1.a * m2.c + m1.c * m2.d,
      d: m1.b * m2.c + m1.d * m2.d,
      tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
      ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty,
    };
  }

  /**
   * Calculates matrix determinant
   */
  public static determinant(m: AffineMatrix2D): number {
    return m.a * m.d - m.b * m.c;
  }

  /**
   * Computes the inverse of an affine transform matrix.
   * Throws if determinant is zero.
   */
  public static invert(m: AffineMatrix2D): AffineMatrix2D {
    const det = Transform2D.determinant(m);
    if (Math.abs(det) < 1e-12) {
      throw new Error("Cannot invert degenerate 2D affine transformation matrix (determinant = 0)");
    }
    const invDet = 1 / det;
    return {
      a: m.d * invDet,
      b: -m.b * invDet,
      c: -m.c * invDet,
      d: m.a * invDet,
      tx: (m.c * m.ty - m.d * m.tx) * invDet,
      ty: (m.b * m.tx - m.a * m.ty) * invDet,
    };
  }

  /**
   * Transforms a point: p' = M * p
   */
  public static applyToPoint(m: AffineMatrix2D, p: Point): Point {
    return {
      x: m.a * p.x + m.c * p.y + m.tx,
      y: m.b * p.x + m.d * p.y + m.ty,
    };
  }

  /**
   * Inverse transforms a point: p = M^(-1) * p'
   */
  public static applyInverseToPoint(m: AffineMatrix2D, p: Point): Point {
    const inv = Transform2D.invert(m);
    return Transform2D.applyToPoint(inv, p);
  }

  /**
   * Transforms a direction vector (translation ignored): v' = M * v
   */
  public static applyToVector(m: AffineMatrix2D, v: Vector2D): Vector2D {
    return {
      x: m.a * v.x + m.c * v.y,
      y: m.b * v.x + m.d * v.y,
    };
  }

  /**
   * Constructs an orthonormal 2D basis (u_x, u_y) using the Gram-Schmidt process.
   * Given primary reference vector v1, and optional secondary guide vector v2.
   * Guarantees:
   *   u_x . u_y = 0
   *   ||u_x|| = 1
   *   ||u_y|| = 1
   *   det([u_x, u_y]) = 1 (right-handed Cartesian system)
   */
  public static gramSchmidt2D(v1: Vector2D, v2?: Vector2D): { u_x: Vector2D; u_y: Vector2D } {
    const len1 = Math.hypot(v1.x, v1.y);
    const u_x: Vector2D = len1 > 1e-12 ? { x: v1.x / len1, y: v1.y / len1 } : { x: 1, y: 0 };

    if (v2) {
      // Gram-Schmidt projection: v2_proj = v2 - (v2 . u_x) * u_x
      const dot = v2.x * u_x.x + v2.y * u_x.y;
      const v2_perp: Vector2D = {
        x: v2.x - dot * u_x.x,
        y: v2.y - dot * u_x.y,
      };
      const len2 = Math.hypot(v2_perp.x, v2_perp.y);
      if (len2 > 1e-12) {
        // Ensure right-handedness: cross(u_x, u_y) > 0
        const cand_uy = { x: v2_perp.x / len2, y: v2_perp.y / len2 };
        const cross = u_x.x * cand_uy.y - u_x.y * cand_uy.x;
        return {
          u_x,
          u_y: cross >= 0 ? cand_uy : { x: -cand_uy.x, y: -cand_uy.y },
        };
      }
    }

    // Standard perpendicular in 2D (counter-clockwise 90 deg: (-y, x))
    const u_y: Vector2D = { x: -u_x.y, y: u_x.x };
    return { u_x, u_y };
  }
}

/**
 * Local Coordinate System (LCS) Class
 * Represents an object's local frame with origin, orthonormal basis axes,
 * rotation, scale, and cached affine transform matrices.
 */
export class LocalCoordinateSystem {
  public origin: Point;
  public axisX: Vector2D;
  public axisY: Vector2D;
  public rotationRad: number;
  public scale: Vector2D;
  public localMatrix: AffineMatrix2D;
  public worldMatrix: AffineMatrix2D;

  constructor(
    origin: Point = { x: 0, y: 0 },
    rotationRad = 0,
    scale: Vector2D = { x: 1, y: 1 }
  ) {
    this.origin = { ...origin };
    this.rotationRad = rotationRad;
    this.scale = { ...scale };

    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);

    this.axisX = { x: cos, y: sin };
    this.axisY = { x: -sin, y: cos };

    this.localMatrix = {
      a: cos * scale.x,
      b: sin * scale.x,
      c: -sin * scale.y,
      d: cos * scale.y,
      tx: origin.x,
      ty: origin.y,
    };
    this.worldMatrix = { ...this.localMatrix };
  }

  /**
   * Constructs an LCS from a line's start and end points
   * Origin = startPoint, Local X = direction towards endPoint, Local Y = perpendicular
   */
  public static fromLine(start: Point, end: Point): LocalCoordinateSystem {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const lcs = new LocalCoordinateSystem(start, angle, { x: 1, y: 1 });
    const { u_x, u_y } = Transform2D.gramSchmidt2D({ x: dx, y: dy });
    lcs.axisX = u_x;
    lcs.axisY = u_y;
    return lcs;
  }

  /**
   * Constructs an LCS using Gram-Schmidt from an origin and arbitrary reference direction
   */
  public static fromGramSchmidt(
    origin: Point,
    directionVector: Vector2D,
    guideVector?: Vector2D
  ): LocalCoordinateSystem {
    const { u_x, u_y } = Transform2D.gramSchmidt2D(directionVector, guideVector);
    const angle = Math.atan2(u_x.y, u_x.x);
    const lcs = new LocalCoordinateSystem(origin, angle, { x: 1, y: 1 });
    lcs.axisX = u_x;
    lcs.axisY = u_y;
    return lcs;
  }

  /**
   * Sets local transformation parameters and recalculates matrices
   */
  public setTransform(origin: Point, rotationRad: number, scale: Vector2D = { x: 1, y: 1 }): void {
    this.origin = { ...origin };
    this.rotationRad = rotationRad;
    this.scale = { ...scale };

    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);

    this.axisX = { x: cos, y: sin };
    this.axisY = { x: -sin, y: cos };

    this.localMatrix = {
      a: cos * scale.x,
      b: sin * scale.x,
      c: -sin * scale.y,
      d: cos * scale.y,
      tx: origin.x,
      ty: origin.y,
    };
    this.worldMatrix = { ...this.localMatrix };
  }

  /**
   * Updates world matrix given a parent's world matrix:
   * M_child_world = M_parent_world * M_child_local
   */
  public updateHierarchicalWorldTransform(parentWorldMatrix?: AffineMatrix2D): void {
    if (!parentWorldMatrix) {
      this.worldMatrix = { ...this.localMatrix };
    } else {
      this.worldMatrix = Transform2D.multiply(parentWorldMatrix, this.localMatrix);
      // Derive composite origin and orientation
      this.origin = { x: this.worldMatrix.tx, y: this.worldMatrix.ty };
      this.axisX = { x: this.worldMatrix.a, y: this.worldMatrix.b };
      const lenX = Math.hypot(this.axisX.x, this.axisX.y);
      if (lenX > 1e-12) {
        this.axisX.x /= lenX;
        this.axisX.y /= lenX;
      }
      this.axisY = { x: this.worldMatrix.c, y: this.worldMatrix.d };
      const lenY = Math.hypot(this.axisY.x, this.axisY.y);
      if (lenY > 1e-12) {
        this.axisY.x /= lenY;
        this.axisY.y /= lenY;
      }
      this.rotationRad = Math.atan2(this.axisX.y, this.axisX.x);
    }
  }

  /**
   * Transforms a point from local coordinates to world coordinates:
   * p_world = LocalToWorld(p_local)
   */
  public localToWorld(localPoint: Point): Point {
    return Transform2D.applyToPoint(this.worldMatrix, localPoint);
  }

  /**
   * Transforms a point from world coordinates to local coordinates:
   * p_local = WorldToLocal(p_world)
   */
  public worldToLocal(worldPoint: Point): Point {
    return Transform2D.applyInverseToPoint(this.worldMatrix, worldPoint);
  }

  /**
   * Transforms a direction vector from local to world
   */
  public localVectorToWorld(localVec: Vector2D): Vector2D {
    return Transform2D.applyToVector(this.worldMatrix, localVec);
  }

  /**
   * Transforms a direction vector from world to local
   */
  public worldVectorToLocal(worldVec: Vector2D): Vector2D {
    const inv = Transform2D.invert(this.worldMatrix);
    return Transform2D.applyToVector(inv, worldVec);
  }

  /**
   * Clone this LCS
   */
  public clone(): LocalCoordinateSystem {
    const next = new LocalCoordinateSystem(this.origin, this.rotationRad, this.scale);
    next.localMatrix = { ...this.localMatrix };
    next.worldMatrix = { ...this.worldMatrix };
    next.axisX = { ...this.axisX };
    next.axisY = { ...this.axisY };
    return next;
  }
}
