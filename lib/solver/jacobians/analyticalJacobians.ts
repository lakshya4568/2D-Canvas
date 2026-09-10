import { createMatrix } from "../matrix/denseMatrix";
import { ConstraintEvaluationResult } from "./types";

/**
 * Coincident: P_A = P_B -> (x_A - x_B = 0, y_A - y_B = 0)
 */
export function evaluateCoincidentConstraint(
  X: number[],
  idxA: number,
  idxB: number
): ConstraintEvaluationResult {
  const n = X.length;
  const xA = X[2 * idxA];
  const yA = X[2 * idxA + 1];
  const xB = X[2 * idxB];
  const yB = X[2 * idxB + 1];

  const residuals = [xA - xB, yA - yB];
  const jacobian = createMatrix(2, n);

  // Row 0: xA - xB
  jacobian[0][2 * idxA] += 1.0;
  jacobian[0][2 * idxB] += -1.0;

  // Row 1: yA - yB
  jacobian[1][2 * idxA + 1] += 1.0;
  jacobian[1][2 * idxB + 1] += -1.0;

  return { residuals, jacobian };
}

/**
 * Horizontal: y_B - y_A = 0
 */
export function evaluateHorizontalConstraint(
  X: number[],
  idxA: number,
  idxB: number
): ConstraintEvaluationResult {
  const n = X.length;
  const yA = X[2 * idxA + 1];
  const yB = X[2 * idxB + 1];

  const residuals = [yB - yA];
  const jacobian = createMatrix(1, n);

  jacobian[0][2 * idxA + 1] += -1.0;
  jacobian[0][2 * idxB + 1] += 1.0;

  return { residuals, jacobian };
}

/**
 * Vertical: x_B - x_A = 0
 */
export function evaluateVerticalConstraint(
  X: number[],
  idxA: number,
  idxB: number
): ConstraintEvaluationResult {
  const n = X.length;
  const xA = X[2 * idxA];
  const xB = X[2 * idxB];

  const residuals = [xB - xA];
  const jacobian = createMatrix(1, n);

  jacobian[0][2 * idxA] += -1.0;
  jacobian[0][2 * idxB] += 1.0;

  return { residuals, jacobian };
}

/**
 * Distance / Length: sqrt((xB - xA)^2 + (yB - yA)^2) - target = 0
 */
export function evaluateDistanceConstraint(
  X: number[],
  idxA: number,
  idxB: number,
  targetDistance: number
): ConstraintEvaluationResult {
  const n = X.length;
  const xA = X[2 * idxA];
  const yA = X[2 * idxA + 1];
  const xB = X[2 * idxB];
  const yB = X[2 * idxB + 1];

  const dx = xB - xA;
  const dy = yB - yA;
  const dist = Math.hypot(dx, dy) + 1e-15;

  const residuals = [dist - targetDistance];
  const jacobian = createMatrix(1, n);

  jacobian[0][2 * idxA] += -dx / dist;
  jacobian[0][2 * idxA + 1] += -dy / dist;
  jacobian[0][2 * idxB] += dx / dist;
  jacobian[0][2 * idxB + 1] += dy / dist;

  return { residuals, jacobian };
}

/**
 * Point-on-Line: (P - P1) x (P2 - P1) = 0
 * f = (x - x1)(y2 - y1) - (y - y1)(x2 - x1) = 0
 */
export function evaluatePointOnLineConstraint(
  X: number[],
  idxP: number,
  idxP1: number,
  idxP2: number
): ConstraintEvaluationResult {
  const n = X.length;
  const x = X[2 * idxP];
  const y = X[2 * idxP + 1];
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];

  const dx21 = x2 - x1;
  const dy21 = y2 - y1;
  const dxP1 = x - x1;
  const dyP1 = y - y1;

  const residuals = [dxP1 * dy21 - dyP1 * dx21];
  const jacobian = createMatrix(1, n);

  // df / dx = dy21, df / dy = -dx21
  jacobian[0][2 * idxP] += dy21;
  jacobian[0][2 * idxP + 1] += -dx21;

  // df / dx1 = y - y2, df / dy1 = x2 - x
  jacobian[0][2 * idxP1] += y - y2;
  jacobian[0][2 * idxP1 + 1] += x2 - x;

  // df / dx2 = y1 - y, df / dy2 = x - x1
  jacobian[0][2 * idxP2] += y1 - y;
  jacobian[0][2 * idxP2 + 1] += x - x1;

  return { residuals, jacobian };
}

/**
 * Parallel: (P2 - P1) x (P4 - P3) = 0
 * f = (x2 - x1)(y4 - y3) - (y2 - y1)(x4 - x3) = 0
 */
export function evaluateParallelConstraint(
  X: number[],
  idxP1: number,
  idxP2: number,
  idxP3: number,
  idxP4: number
): ConstraintEvaluationResult {
  const n = X.length;
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];
  const x3 = X[2 * idxP3];
  const y3 = X[2 * idxP3 + 1];
  const x4 = X[2 * idxP4];
  const y4 = X[2 * idxP4 + 1];

  const dx12 = x2 - x1;
  const dy12 = y2 - y1;
  const dx34 = x4 - x3;
  const dy34 = y4 - y3;

  const residuals = [dx12 * dy34 - dy12 * dx34];
  const jacobian = createMatrix(1, n);

  jacobian[0][2 * idxP1] += -dy34;
  jacobian[0][2 * idxP1 + 1] += dx34;

  jacobian[0][2 * idxP2] += dy34;
  jacobian[0][2 * idxP2 + 1] += -dx34;

  jacobian[0][2 * idxP3] += dy12;
  jacobian[0][2 * idxP3 + 1] += -dx12;

  jacobian[0][2 * idxP4] += -dy12;
  jacobian[0][2 * idxP4 + 1] += dx12;

  return { residuals, jacobian };
}

/**
 * Perpendicular: (P2 - P1) . (P4 - P3) = 0
 * f = (x2 - x1)(x4 - x3) + (y2 - y1)(y4 - y3) = 0
 */
export function evaluatePerpendicularConstraint(
  X: number[],
  idxP1: number,
  idxP2: number,
  idxP3: number,
  idxP4: number
): ConstraintEvaluationResult {
  const n = X.length;
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];
  const x3 = X[2 * idxP3];
  const y3 = X[2 * idxP3 + 1];
  const x4 = X[2 * idxP4];
  const y4 = X[2 * idxP4 + 1];

  const dx12 = x2 - x1;
  const dy12 = y2 - y1;
  const dx34 = x4 - x3;
  const dy34 = y4 - y3;

  const residuals = [dx12 * dx34 + dy12 * dy34];
  const jacobian = createMatrix(1, n);

  jacobian[0][2 * idxP1] += -dx34;
  jacobian[0][2 * idxP1 + 1] += -dy34;

  jacobian[0][2 * idxP2] += dx34;
  jacobian[0][2 * idxP2 + 1] += dy34;

  jacobian[0][2 * idxP3] += -dx12;
  jacobian[0][2 * idxP3 + 1] += -dy12;

  jacobian[0][2 * idxP4] += dx12;
  jacobian[0][2 * idxP4 + 1] += dy12;

  return { residuals, jacobian };
}

/**
 * Haunch Leg 45-degree Invariant:
 * f1 = (x2 - x1) - s_x * h = 0
 * f2 = (y2 - y1) - s_y * h = 0
 */
export function evaluateHaunch45Constraint(
  X: number[],
  idxA: number,
  idxB: number,
  targetLeg: number,
  signX: number = 1,
  signY: number = 1
): ConstraintEvaluationResult {
  const n = X.length;
  const xA = X[2 * idxA];
  const yA = X[2 * idxA + 1];
  const xB = X[2 * idxB];
  const yB = X[2 * idxB + 1];

  const residuals = [
    (xB - xA) - signX * targetLeg,
    (yB - yA) - signY * targetLeg,
  ];
  const jacobian = createMatrix(2, n);

  // Row 0: xB - xA
  jacobian[0][2 * idxA] += -1.0;
  jacobian[0][2 * idxB] += 1.0;

  // Row 1: yB - yA
  jacobian[1][2 * idxA + 1] += -1.0;
  jacobian[1][2 * idxB + 1] += 1.0;

  return { residuals, jacobian };
}

/**
 * Wall Thickness Offset:
 * Line P1 -> P2, offset point P3.
 * Unit normal n = (dy / L, -dx / L)
 * Distance = ((x3 - x1)*dy - (y3 - y1)*dx) / L
 * f = ((x3 - x1)(y2 - y1) - (y3 - y1)(x2 - x1)) / L - targetThickness = 0
 */
export function evaluateWallThicknessConstraint(
  X: number[],
  idxP1: number,
  idxP2: number,
  idxP3: number,
  targetThickness: number
): ConstraintEvaluationResult {
  const n = X.length;
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];
  const x3 = X[2 * idxP3];
  const y3 = X[2 * idxP3 + 1];

  const dx21 = x2 - x1;
  const dy21 = y2 - y1;
  const L = Math.hypot(dx21, dy21) + 1e-15;

  const dx31 = x3 - x1;
  const dy31 = y3 - y1;

  const N = dx31 * dy21 - dy31 * dx21;
  const residuals = [N / L - targetThickness];
  const jacobian = createMatrix(1, n);

  // Derivatives of f = N / L - t:
  // dL / d(x1) = -dx21 / L, dL / d(y1) = -dy21 / L
  // dL / d(x2) = dx21 / L, dL / d(y2) = dy21 / L
  // dL / d(x3) = 0, dL / d(y3) = 0
  const dL_dx1 = -dx21 / L;
  const dL_dy1 = -dy21 / L;
  const dL_dx2 = dx21 / L;
  const dL_dy2 = dy21 / L;

  // dN / dx3 = dy21, dN / dy3 = -dx21
  const dN_dx3 = dy21;
  const dN_dy3 = -dx21;

  // dN / dx2 = -dy31, dN / dy2 = dx31
  const dN_dx2 = -dy31;
  const dN_dy2 = dx31;

  // dN / dx1 = -dy21 + dy31 = y3 - y2
  // dN / dy1 = dx21 - dx31 = x2 - x3
  const dN_dx1 = y3 - y2;
  const dN_dy1 = x2 - x3;

  // df/dX_j = (dN/dX_j * L - N * dL/dX_j) / L^2
  const L2 = L * L;

  jacobian[0][2 * idxP1] += (dN_dx1 * L - N * dL_dx1) / L2;
  jacobian[0][2 * idxP1 + 1] += (dN_dy1 * L - N * dL_dy1) / L2;

  jacobian[0][2 * idxP2] += (dN_dx2 * L - N * dL_dx2) / L2;
  jacobian[0][2 * idxP2 + 1] += (dN_dy2 * L - N * dL_dy2) / L2;

  jacobian[0][2 * idxP3] += dN_dx3 / L;
  jacobian[0][2 * idxP3 + 1] += dN_dy3 / L;

  return { residuals, jacobian };
}

export const evaluateDirectedWallOffsetConstraint = evaluateWallThicknessConstraint;

/**
 * Squared Distance: (xB - xA)^2 + (yB - yA)^2 - targetDistance^2 = 0
 */
export function evaluateSquaredDistanceConstraint(
  X: number[],
  idxA: number,
  idxB: number,
  targetDistance: number
): ConstraintEvaluationResult {
  const n = X.length;
  const xA = X[2 * idxA];
  const yA = X[2 * idxA + 1];
  const xB = X[2 * idxB];
  const yB = X[2 * idxB + 1];

  const dx = xB - xA;
  const dy = yB - yA;
  const targetSq = targetDistance * targetDistance;

  const residuals = [dx * dx + dy * dy - targetSq];
  const jacobian = createMatrix(1, n);

  jacobian[0][2 * idxA] += -2.0 * dx;
  jacobian[0][2 * idxA + 1] += -2.0 * dy;
  jacobian[0][2 * idxB] += 2.0 * dx;
  jacobian[0][2 * idxB + 1] += 2.0 * dy;

  return { residuals, jacobian };
}

/**
 * Haunch Leg Equality:
 * Leg 1 (P1 -> P2) length equals Leg 2 (P3 -> P4) length:
 * f = (x2 - x1)^2 + (y2 - y1)^2 - ((x4 - x3)^2 + (y4 - y3)^2) = 0
 */
export function evaluateHaunchLegEqualityConstraint(
  X: number[],
  idxP1: number,
  idxP2: number,
  idxP3: number,
  idxP4: number
): ConstraintEvaluationResult {
  const n = X.length;
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];
  const x3 = X[2 * idxP3];
  const y3 = X[2 * idxP3 + 1];
  const x4 = X[2 * idxP4];
  const y4 = X[2 * idxP4 + 1];

  const dx12 = x2 - x1;
  const dy12 = y2 - y1;
  const dx34 = x4 - x3;
  const dy34 = y4 - y3;

  const residuals = [(dx12 * dx12 + dy12 * dy12) - (dx34 * dx34 + dy34 * dy34)];
  const jacobian = createMatrix(1, n);

  jacobian[0][2 * idxP1] += -2.0 * dx12;
  jacobian[0][2 * idxP1 + 1] += -2.0 * dy12;
  jacobian[0][2 * idxP2] += 2.0 * dx12;
  jacobian[0][2 * idxP2 + 1] += 2.0 * dy12;

  jacobian[0][2 * idxP3] += 2.0 * dx34;
  jacobian[0][2 * idxP3 + 1] += 2.0 * dy34;
  jacobian[0][2 * idxP4] += -2.0 * dx34;
  jacobian[0][2 * idxP4 + 1] += -2.0 * dy34;

  return { residuals, jacobian };
}

/**
 * Angle Constraint between line (P1 -> P2) and line (P3 -> P4):
 * f = (u . v) / (||u|| * ||v||) - cos(targetAngleRad) = 0
 */
export function evaluateAngleConstraint(
  X: number[],
  idxP1: number,
  idxP2: number,
  idxP3: number,
  idxP4: number,
  targetAngleRad: number
): ConstraintEvaluationResult {
  const n = X.length;
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];
  const x3 = X[2 * idxP3];
  const y3 = X[2 * idxP3 + 1];
  const x4 = X[2 * idxP4];
  const y4 = X[2 * idxP4 + 1];

  const ux = x2 - x1;
  const uy = y2 - y1;
  const vx = x4 - x3;
  const vy = y4 - y3;

  const Lu = Math.hypot(ux, uy) + 1e-15;
  const Lv = Math.hypot(vx, vy) + 1e-15;
  const D = ux * vx + uy * vy;

  const residuals = [D / (Lu * Lv) - Math.cos(targetAngleRad)];
  const jacobian = createMatrix(1, n);

  const Lu3Lv = Lu * Lu * Lu * Lv;
  const LuLv3 = Lu * Lv * Lv * Lv;
  const LuLv = Lu * Lv;

  // df/du: v / (Lu * Lv) - D * u / (Lu^3 * Lv)
  const df_dux = vx / LuLv - (D * ux) / Lu3Lv;
  const df_duy = vy / LuLv - (D * uy) / Lu3Lv;

  // df/dv: u / (Lu * Lv) - D * v / (Lu * Lv^3)
  const df_dvx = ux / LuLv - (D * vx) / LuLv3;
  const df_dvy = uy / LuLv - (D * vy) / LuLv3;

  jacobian[0][2 * idxP1] += -df_dux;
  jacobian[0][2 * idxP1 + 1] += -df_duy;
  jacobian[0][2 * idxP2] += df_dux;
  jacobian[0][2 * idxP2 + 1] += df_duy;

  jacobian[0][2 * idxP3] += -df_dvx;
  jacobian[0][2 * idxP3 + 1] += -df_dvy;
  jacobian[0][2 * idxP4] += df_dvx;
  jacobian[0][2 * idxP4 + 1] += df_dvy;

  return { residuals, jacobian };
}

/**
 * Concentric: C1 = C2 -> (xC1 - xC2 = 0, yC1 - yC2 = 0)
 */
export function evaluateConcentricConstraint(
  X: number[],
  idxC1: number,
  idxC2: number
): ConstraintEvaluationResult {
  return evaluateCoincidentConstraint(X, idxC1, idxC2);
}

/**
 * Radial Offset: ||P - C|| - targetRadius = 0
 */
export function evaluateRadialOffsetConstraint(
  X: number[],
  idxCenter: number,
  idxPoint: number,
  targetRadius: number
): ConstraintEvaluationResult {
  return evaluateDistanceConstraint(X, idxCenter, idxPoint, targetRadius);
}

/**
 * Point on Arc / Point on Circle: ||P - C|| - radius = 0
 */
export function evaluatePointOnArcConstraint(
  X: number[],
  idxP: number,
  idxCenter: number,
  radius: number
): ConstraintEvaluationResult {
  return evaluateDistanceConstraint(X, idxCenter, idxP, radius);
}

/**
 * Tangency between line (P1 -> P2) and circle (Center C, radius R):
 * Perpendicular distance from C to line P1-P2 equals R
 */
export function evaluateTangencyLineCircleConstraint(
  X: number[],
  idxP1: number,
  idxP2: number,
  idxCenter: number,
  radius: number
): ConstraintEvaluationResult {
  return evaluateWallThicknessConstraint(X, idxP1, idxP2, idxCenter, radius);
}

/**
 * Tangency between two circles (C1, r1) and (C2, r2):
 * ||C2 - C1|| - (r1 + r2) = 0
 */
export function evaluateTangencyCircleCircleConstraint(
  X: number[],
  idxC1: number,
  idxC2: number,
  r1: number,
  r2: number
): ConstraintEvaluationResult {
  return evaluateDistanceConstraint(X, idxC1, idxC2, r1 + r2);
}

/**
 * Bilateral Symmetry across axis line (P1 -> P2):
 * Point PA and Point PB are symmetric across line P1-P2:
 * 1) Midpoint M = (PA + PB)/2 lies on line P1-P2:
 *    f1 = (xM - x1)(y2 - y1) - (yM - y1)(x2 - x1) = 0
 * 2) Vector PB - PA is perpendicular to line P1-P2:
 *    f2 = (xB - xA)(x2 - x1) + (yB - yA)(y2 - y1) = 0
 */
export function evaluateSymmetryConstraint(
  X: number[],
  idxPA: number,
  idxPB: number,
  idxP1: number,
  idxP2: number
): ConstraintEvaluationResult {
  const n = X.length;
  const xA = X[2 * idxPA];
  const yA = X[2 * idxPA + 1];
  const xB = X[2 * idxPB];
  const yB = X[2 * idxPB + 1];
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];

  const xM = 0.5 * (xA + xB);
  const yM = 0.5 * (yA + yB);
  const dx21 = x2 - x1;
  const dy21 = y2 - y1;
  const dxBA = xB - xA;
  const dyBA = yB - yA;

  const residuals = [
    (xM - x1) * dy21 - (yM - y1) * dx21,
    dxBA * dx21 + dyBA * dy21,
  ];
  const jacobian = createMatrix(2, n);

  // Row 0: Midpoint on line
  // df1 / d(xA) = 0.5 * dy21, df1 / d(yA) = -0.5 * dx21
  jacobian[0][2 * idxPA] += 0.5 * dy21;
  jacobian[0][2 * idxPA + 1] += -0.5 * dx21;

  // df1 / d(xB) = 0.5 * dy21, df1 / d(yB) = -0.5 * dx21
  jacobian[0][2 * idxPB] += 0.5 * dy21;
  jacobian[0][2 * idxPB + 1] += -0.5 * dx21;

  // df1 / d(x1) = yM - y2, df1 / d(y1) = x2 - xM
  jacobian[0][2 * idxP1] += yM - y2;
  jacobian[0][2 * idxP1 + 1] += x2 - xM;

  // df1 / d(x2) = y1 - yM, df1 / d(y2) = xM - x1
  jacobian[0][2 * idxP2] += y1 - yM;
  jacobian[0][2 * idxP2 + 1] += xM - x1;

  // Row 1: Perpendicular vector
  // df2 / d(xA) = -dx21, df2 / d(yA) = -dy21
  jacobian[1][2 * idxPA] += -dx21;
  jacobian[1][2 * idxPA + 1] += -dy21;

  // df2 / d(xB) = dx21, df2 / d(yB) = dy21
  jacobian[1][2 * idxPB] += dx21;
  jacobian[1][2 * idxPB + 1] += dy21;

  // df2 / d(x1) = -dxBA, df2 / d(y1) = -dyBA
  jacobian[1][2 * idxP1] += -dxBA;
  jacobian[1][2 * idxP1 + 1] += -dyBA;

  // df2 / d(x2) = dxBA, df2 / d(y2) = dyBA
  jacobian[1][2 * idxP2] += dxBA;
  jacobian[1][2 * idxP2 + 1] += dyBA;

  return { residuals, jacobian };
}

/**
 * Drag Target:
 * f = [xP - targetX, yP - targetY]^T
 */
export function evaluateDragTargetConstraint(
  X: number[],
  idxP: number,
  targetX: number,
  targetY: number
): ConstraintEvaluationResult {
  const n = X.length;
  const x = X[2 * idxP];
  const y = X[2 * idxP + 1];

  const residuals = [x - targetX, y - targetY];
  const jacobian = createMatrix(2, n);

  jacobian[0][2 * idxP] += 1.0;
  jacobian[1][2 * idxP + 1] += 1.0;

  return { residuals, jacobian };
}

/**
 * Midpoint: Point M is midpoint of segment (P1 -> P2):
 * f1 = xM - 0.5 * (x1 + x2) = 0
 * f2 = yM - 0.5 * (y1 + y2) = 0
 */
export function evaluateMidpointConstraint(
  X: number[],
  idxM: number,
  idxP1: number,
  idxP2: number
): ConstraintEvaluationResult {
  const n = X.length;
  const xM = X[2 * idxM];
  const yM = X[2 * idxM + 1];
  const x1 = X[2 * idxP1];
  const y1 = X[2 * idxP1 + 1];
  const x2 = X[2 * idxP2];
  const y2 = X[2 * idxP2 + 1];

  const residuals = [
    xM - 0.5 * (x1 + x2),
    yM - 0.5 * (y1 + y2),
  ];
  const jacobian = createMatrix(2, n);

  // Row 0: xM - 0.5*(x1 + x2)
  jacobian[0][2 * idxM] += 1.0;
  jacobian[0][2 * idxP1] += -0.5;
  jacobian[0][2 * idxP2] += -0.5;

  // Row 1: yM - 0.5*(y1 + y2)
  jacobian[1][2 * idxM + 1] += 1.0;
  jacobian[1][2 * idxP1 + 1] += -0.5;
  jacobian[1][2 * idxP2 + 1] += -0.5;

  return { residuals, jacobian };
}

export const evaluatePointToLineDistanceConstraint = evaluateWallThicknessConstraint;

