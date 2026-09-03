import { describe, it, expect } from "vitest";
import { svd, transpose } from "../../lib/solver/matrix/svd";
import { pseudoInverse, solveMinimumNormStep } from "../../lib/solver/matrix/pseudoInverse";

describe("SVD & Moore-Penrose Pseudo-Inverse", () => {
  it("should decompose m >= n matrix and satisfy A = U * Sigma * V^T", () => {
    // 3 x 2 matrix
    const A = [
      [3, 2],
      [2, 3],
      [2, -2],
    ];

    const { U, q, V } = svd(A);

    expect(q.length).toBe(2);
    expect(q[0]).toBeGreaterThanOrEqual(q[1]);

    // Reconstruct A_recon = U * diag(q) * V^T
    const m = A.length;
    const n = A[0].length;
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0.0;
        for (let k = 0; k < q.length; k++) {
          sum += U[i][k] * q[k] * V[j][k];
        }
        expect(sum).toBeCloseTo(A[i][j], 8);
      }
    }
  });

  it("should decompose m < n under-constrained matrix via transpose handling", () => {
    // 2 x 4 under-constrained matrix (e.g. 2 constraints on 4 coordinates)
    const A = [
      [1, 2, 0, -1],
      [0, 1, 3, 2],
    ];

    const { U, q, V } = svd(A);

    expect(q.length).toBe(2);
    expect(q[0]).toBeGreaterThan(0);
    expect(q[1]).toBeGreaterThan(0);

    // Verify reconstruction A = U * Sigma * V^T
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0.0;
        for (let k = 0; k < q.length; k++) {
          sum += U[i][k] * q[k] * V[j][k];
        }
        expect(sum).toBeCloseTo(A[i][j], 8);
      }
    }
  });

  it("should verify Moore-Penrose pseudo-inverse conditions", () => {
    const A = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];

    const Ainv = pseudoInverse(A, 1e-10);

    // Condition 1: A * A^+ * A = A
    // Compute T1 = A * A^+
    const T1: number[][] = [];
    for (let i = 0; i < 3; i++) {
      T1[i] = [];
      for (let j = 0; j < 3; j++) {
        let sum = 0.0;
        for (let k = 0; k < 2; k++) sum += A[i][k] * Ainv[k][j];
        T1[i][j] = sum;
      }
    }
    // Compute T1 * A
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        let sum = 0.0;
        for (let k = 0; k < 3; k++) sum += T1[i][k] * A[k][j];
        expect(sum).toBeCloseTo(A[i][j], 8);
      }
    }
  });

  it("should yield minimum-norm displacement for under-constrained systems", () => {
    // Constraint: x1 - x2 = 5 (residual F = (x1 - x2) - 5)
    // Variables: [x1, y1, x2, y2, x3, y3] (6 variables, 1 constraint on x1 and x2)
    // J = [1, 0, -1, 0, 0, 0]
    // Residual F = [-2]
    const J = [[1, 0, -1, 0, 0, 0]];
    const F = [-2];

    const deltaX = solveMinimumNormStep(J, F);

    // J * deltaX should be -F = [2]
    let J_delta = 0.0;
    for (let j = 0; j < 6; j++) J_delta += J[0][j] * deltaX[j];
    expect(J_delta).toBeCloseTo(2.0, 8);

    // deltaX on uncoupled variables (y1, y2, x3, y3) must be EXACTLY ZERO
    expect(deltaX[1]).toBeCloseTo(0.0, 10);
    expect(deltaX[3]).toBeCloseTo(0.0, 10);
    expect(deltaX[4]).toBeCloseTo(0.0, 10);
    expect(deltaX[5]).toBeCloseTo(0.0, 10);

    // deltaX on x1 and x2 should be equal and opposite (+1.0 and -1.0) to minimize ||deltaX||^2
    expect(deltaX[0]).toBeCloseTo(1.0, 8);
    expect(deltaX[2]).toBeCloseTo(-1.0, 8);
  });
});
