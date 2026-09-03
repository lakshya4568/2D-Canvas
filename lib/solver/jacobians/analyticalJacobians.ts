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
  jacobian[0][2 * idxA] = 1.0;
  jacobian[0][2 * idxB] = -1.0;

  // Row 1: yA - yB
  jacobian[1][2 * idxA + 1] = 1.0;
  jacobian[1][2 * idxB + 1] = -1.0;

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

  jacobian[0][2 * idxA + 1] = -1.0;
  jacobian[0][2 * idxB + 1] = 1.0;

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

  jacobian[0][2 * idxA] = -1.0;
  jacobian[0][2 * idxB] = 1.0;

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

  jacobian[0][2 * idxA] = -dx / dist;
  jacobian[0][2 * idxA + 1] = -dy / dist;
  jacobian[0][2 * idxB] = dx / dist;
  jacobian[0][2 * idxB + 1] = dy / dist;

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
  jacobian[0][2 * idxP] = dy21;
  jacobian[0][2 * idxP + 1] = -dx21;

  // df / dx1 = y - y2, df / dy1 = x2 - x
  jacobian[0][2 * idxP1] = y - y2;
  jacobian[0][2 * idxP1 + 1] = x2 - x;

  // df / dx2 = y1 - y, df / dy2 = x - x1
  jacobian[0][2 * idxP2] = y1 - y;
  jacobian[0][2 * idxP2 + 1] = x - x1;

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

  jacobian[0][2 * idxP1] = -dy34;
  jacobian[0][2 * idxP1 + 1] = dx34;

  jacobian[0][2 * idxP2] = dy34;
  jacobian[0][2 * idxP2 + 1] = -dx34;

  jacobian[0][2 * idxP3] = dy12;
  jacobian[0][2 * idxP3 + 1] = -dx12;

  jacobian[0][2 * idxP4] = -dy12;
  jacobian[0][2 * idxP4 + 1] = dx12;

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

  jacobian[0][2 * idxP1] = -dx34;
  jacobian[0][2 * idxP1 + 1] = -dy34;

  jacobian[0][2 * idxP2] = dx34;
  jacobian[0][2 * idxP2 + 1] = dy34;

  jacobian[0][2 * idxP3] = -dx12;
  jacobian[0][2 * idxP3 + 1] = -dy12;

  jacobian[0][2 * idxP4] = dx12;
  jacobian[0][2 * idxP4 + 1] = dy12;

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
  jacobian[0][2 * idxA] = -1.0;
  jacobian[0][2 * idxB] = 1.0;

  // Row 1: yB - yA
  jacobian[1][2 * idxA + 1] = -1.0;
  jacobian[1][2 * idxB + 1] = 1.0;

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

  jacobian[0][2 * idxP1] = (dN_dx1 * L - N * dL_dx1) / L2;
  jacobian[0][2 * idxP1 + 1] = (dN_dy1 * L - N * dL_dy1) / L2;

  jacobian[0][2 * idxP2] = (dN_dx2 * L - N * dL_dx2) / L2;
  jacobian[0][2 * idxP2 + 1] = (dN_dy2 * L - N * dL_dy2) / L2;

  jacobian[0][2 * idxP3] = dN_dx3 / L;
  jacobian[0][2 * idxP3 + 1] = dN_dy3 / L;

  return { residuals, jacobian };
}
