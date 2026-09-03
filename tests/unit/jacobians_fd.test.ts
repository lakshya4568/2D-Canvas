import { describe, it, expect } from "vitest";
import {
  evaluateCoincidentConstraint,
  evaluateHorizontalConstraint,
  evaluateVerticalConstraint,
  evaluateDistanceConstraint,
  evaluatePointOnLineConstraint,
  evaluateParallelConstraint,
  evaluatePerpendicularConstraint,
  evaluateHaunch45Constraint,
  evaluateWallThicknessConstraint,
} from "../../lib/solver/jacobians/analyticalJacobians";
import { computeCentralDifferenceJacobian } from "../../lib/solver/jacobians/finiteDifference";

describe("Analytical Jacobians vs Finite Differences", () => {
  const h = 1e-6;
  const tol = 1e-5;

  it("should match finite differences for Coincident constraint", () => {
    // 2 points: [x1, y1, x2, y2]
    const X = [12.5, 45.3, 13.0, 44.8];
    const analytical = evaluateCoincidentConstraint(X, 0, 1);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluateCoincidentConstraint(vars, 0, 1).residuals,
      X,
      h
    );

    for (let r = 0; r < analytical.residuals.length; r++) {
      for (let c = 0; c < X.length; c++) {
        expect(analytical.jacobian[r][c]).toBeCloseTo(fd[r][c], 4);
      }
    }
  });

  it("should match finite differences for Horizontal constraint", () => {
    const X = [10.0, 20.0, 50.0, 25.0];
    const analytical = evaluateHorizontalConstraint(X, 0, 1);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluateHorizontalConstraint(vars, 0, 1).residuals,
      X,
      h
    );

    for (let c = 0; c < X.length; c++) {
      expect(analytical.jacobian[0][c]).toBeCloseTo(fd[0][c], 4);
    }
  });

  it("should match finite differences for Vertical constraint", () => {
    const X = [15.0, 20.0, 18.0, 60.0];
    const analytical = evaluateVerticalConstraint(X, 0, 1);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluateVerticalConstraint(vars, 0, 1).residuals,
      X,
      h
    );

    for (let c = 0; c < X.length; c++) {
      expect(analytical.jacobian[0][c]).toBeCloseTo(fd[0][c], 4);
    }
  });

  it("should match finite differences for Distance constraint", () => {
    const X = [10.0, 20.0, 80.0, 100.0];
    const targetDistance = 120.0;
    const analytical = evaluateDistanceConstraint(X, 0, 1, targetDistance);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluateDistanceConstraint(vars, 0, 1, targetDistance).residuals,
      X,
      h
    );

    for (let c = 0; c < X.length; c++) {
      expect(analytical.jacobian[0][c]).toBeCloseTo(fd[0][c], 4);
    }
  });

  it("should match finite differences for Point-on-Line constraint", () => {
    // P=(X[0], X[1]), P1=(X[2], X[3]), P2=(X[4], X[5])
    const X = [25.0, 35.0, 10.0, 20.0, 70.0, 80.0];
    const analytical = evaluatePointOnLineConstraint(X, 0, 1, 2);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluatePointOnLineConstraint(vars, 0, 1, 2).residuals,
      X,
      h
    );

    for (let c = 0; c < X.length; c++) {
      expect(analytical.jacobian[0][c]).toBeCloseTo(fd[0][c], 3);
    }
  });

  it("should match finite differences for Parallel constraint", () => {
    // Segment 1 (P0, P1), Segment 2 (P2, P3) -> 8 variables
    const X = [10.0, 10.0, 50.0, 20.0, 15.0, 40.0, 55.0, 52.0];
    const analytical = evaluateParallelConstraint(X, 0, 1, 2, 3);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluateParallelConstraint(vars, 0, 1, 2, 3).residuals,
      X,
      h
    );

    for (let c = 0; c < X.length; c++) {
      expect(analytical.jacobian[0][c]).toBeCloseTo(fd[0][c], 3);
    }
  });

  it("should match finite differences for Perpendicular constraint", () => {
    const X = [10.0, 10.0, 50.0, 10.0, 30.0, 10.0, 30.0, 60.0];
    const analytical = evaluatePerpendicularConstraint(X, 0, 1, 2, 3);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluatePerpendicularConstraint(vars, 0, 1, 2, 3).residuals,
      X,
      h
    );

    for (let c = 0; c < X.length; c++) {
      expect(analytical.jacobian[0][c]).toBeCloseTo(fd[0][c], 3);
    }
  });

  it("should match finite differences for Haunch 45-degree invariant constraint", () => {
    // P0=(10, 10), P1=(45, 45) -> dx = 35, dy = 35, leg = 35
    const X = [10.0, 10.0, 42.0, 47.0];
    const targetLeg = 35.0;
    const analytical = evaluateHaunch45Constraint(X, 0, 1, targetLeg, 1, 1);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluateHaunch45Constraint(vars, 0, 1, targetLeg, 1, 1).residuals,
      X,
      h
    );

    for (let r = 0; r < analytical.residuals.length; r++) {
      for (let c = 0; c < X.length; c++) {
        expect(analytical.jacobian[r][c]).toBeCloseTo(fd[r][c], 3);
      }
    }
  });

  it("should match finite differences for Wall Thickness constraint", () => {
    // Wall segment (P0, P1), parallel inner point P2
    const X = [0.0, 0.0, 0.0, 100.0, 30.0, 50.0];
    const targetThickness = 30.0;
    const analytical = evaluateWallThicknessConstraint(X, 0, 1, 2, targetThickness);
    const fd = computeCentralDifferenceJacobian(
      (vars) => evaluateWallThicknessConstraint(vars, 0, 1, 2, targetThickness).residuals,
      X,
      h
    );

    for (let c = 0; c < X.length; c++) {
      expect(analytical.jacobian[0][c]).toBeCloseTo(fd[0][c], 3);
    }
  });
});
