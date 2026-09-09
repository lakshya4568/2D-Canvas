import { describe, it, expect } from "vitest";
import { computeCentralDifferenceJacobian } from "../../lib/solver/jacobians/finiteDifference";
import {
  evaluateCoincidentConstraint,
  evaluateHorizontalConstraint,
  evaluateVerticalConstraint,
  evaluateDistanceConstraint,
  evaluateSquaredDistanceConstraint,
  evaluatePointOnLineConstraint,
  evaluateParallelConstraint,
  evaluatePerpendicularConstraint,
  evaluateHaunch45Constraint,
  evaluateHaunchLegEqualityConstraint,
  evaluateWallThicknessConstraint,
  evaluateDirectedWallOffsetConstraint,
  evaluateAngleConstraint,
  evaluateConcentricConstraint,
  evaluateRadialOffsetConstraint,
  evaluatePointOnArcConstraint,
  evaluateTangencyLineCircleConstraint,
  evaluateTangencyCircleCircleConstraint,
  evaluateSymmetryConstraint,
  evaluateDragTargetConstraint,
} from "../../lib/solver/jacobians/analyticalJacobians";

function assertJacobianMatchesFiniteDiff(
  analyticalJ: number[][],
  numericalJ: number[][],
  tolerance: number = 1e-5
) {
  expect(analyticalJ.length).toBe(numericalJ.length);
  expect(analyticalJ[0].length).toBe(numericalJ[0].length);

  const m = analyticalJ.length;
  const n = analyticalJ[0].length;

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const diff = Math.abs(analyticalJ[i][j] - numericalJ[i][j]);
      expect(diff).toBeLessThan(tolerance);
    }
  }
}

describe("Analytical Jacobian Registry & Finite-Difference Cross-Checks (§28)", () => {
  // 6 points in 2D (12 variables)
  const X0 = [
    12.5, 34.2,   // P0
    45.1, 78.9,   // P1
    120.4, 65.7,  // P2
    89.3, 110.2,  // P3
    15.0, 95.0,   // P4
    200.1, 150.8, // P5
  ];

  it("1. Squared Distance constraint matches central finite difference", () => {
    const targetDist = 65.0;
    const analytical = evaluateSquaredDistanceConstraint(X0, 0, 1, targetDist);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateSquaredDistanceConstraint(X, 0, 1, targetDist).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("2. Horizontal constraint matches central finite difference", () => {
    const analytical = evaluateHorizontalConstraint(X0, 0, 1);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateHorizontalConstraint(X, 0, 1).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("3. Vertical constraint matches central finite difference", () => {
    const analytical = evaluateVerticalConstraint(X0, 1, 2);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateVerticalConstraint(X, 1, 2).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("4. Parallel constraint matches central finite difference", () => {
    const analytical = evaluateParallelConstraint(X0, 0, 1, 2, 3);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateParallelConstraint(X, 0, 1, 2, 3).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("5. Perpendicular constraint matches central finite difference", () => {
    const analytical = evaluatePerpendicularConstraint(X0, 0, 1, 2, 3);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluatePerpendicularConstraint(X, 0, 1, 2, 3).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("6. Directed Wall Offset / Wall Thickness matches central finite difference", () => {
    const thickness = 25.0;
    const analytical = evaluateDirectedWallOffsetConstraint(X0, 0, 1, 2, thickness);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateDirectedWallOffsetConstraint(X, 0, 1, 2, thickness).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("7a. Haunch Leg Equality constraint matches central finite difference", () => {
    const analytical = evaluateHaunchLegEqualityConstraint(X0, 0, 1, 2, 3);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateHaunchLegEqualityConstraint(X, 0, 1, 2, 3).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("7b. Haunch 45-degree constraint matches central finite difference", () => {
    const leg = 30.0;
    const analytical = evaluateHaunch45Constraint(X0, 0, 1, leg, 1, -1);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateHaunch45Constraint(X, 0, 1, leg, 1, -1).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("8. Angle constraint matches central finite difference", () => {
    const targetAngle = Math.PI / 3; // 60 degrees
    const analytical = evaluateAngleConstraint(X0, 0, 1, 2, 3, targetAngle);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateAngleConstraint(X, 0, 1, 2, 3, targetAngle).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("9. Concentric constraint matches central finite difference", () => {
    const analytical = evaluateConcentricConstraint(X0, 0, 2);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateConcentricConstraint(X, 0, 2).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("10. Radial Offset constraint matches central finite difference", () => {
    const radius = 50.0;
    const analytical = evaluateRadialOffsetConstraint(X0, 0, 1, radius);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateRadialOffsetConstraint(X, 0, 1, radius).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("11a. Tangency (Line to Circle) matches central finite difference", () => {
    const radius = 35.0;
    const analytical = evaluateTangencyLineCircleConstraint(X0, 0, 1, 2, radius);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateTangencyLineCircleConstraint(X, 0, 1, 2, radius).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("11b. Tangency (Circle to Circle) matches central finite difference", () => {
    const r1 = 20.0;
    const r2 = 30.0;
    const analytical = evaluateTangencyCircleCircleConstraint(X0, 0, 1, r1, r2);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateTangencyCircleCircleConstraint(X, 0, 1, r1, r2).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("12. Point-on-Line constraint matches central finite difference", () => {
    const analytical = evaluatePointOnLineConstraint(X0, 2, 0, 1);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluatePointOnLineConstraint(X, 2, 0, 1).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("13. Point-on-Arc constraint matches central finite difference", () => {
    const radius = 45.0;
    const analytical = evaluatePointOnArcConstraint(X0, 1, 0, radius);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluatePointOnArcConstraint(X, 1, 0, radius).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("14. Symmetry constraint matches central finite difference", () => {
    // Points P2 and P3 symmetric across axis line P0-P1
    const analytical = evaluateSymmetryConstraint(X0, 2, 3, 0, 1);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateSymmetryConstraint(X, 2, 3, 0, 1).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });

  it("15. Drag Target constraint matches central finite difference", () => {
    const targetX = 150.0;
    const targetY = 220.0;
    const analytical = evaluateDragTargetConstraint(X0, 3, targetX, targetY);
    const numerical = computeCentralDifferenceJacobian(
      (X) => evaluateDragTargetConstraint(X, 3, targetX, targetY).residuals,
      X0
    );
    assertJacobianMatchesFiniteDiff(analytical.jacobian, numerical);
  });
});
