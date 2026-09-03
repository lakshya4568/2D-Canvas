import { createMatrix } from "./denseMatrix";
import { svd } from "./svd";

/**
 * Computes the Moore-Penrose Pseudo-Inverse A^+ = V * Sigma^+ * U^T.
 */
export function pseudoInverse(A: number[][], epsSingular: number = 1e-10): number[][] {
  const m = A.length;
  const n = A[0].length;
  const { U, q, V } = svd(A);

  const k = q.length;
  const pinv = createMatrix(n, m);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0.0;
      for (let l = 0; l < k; l++) {
        if (q[l] > epsSingular) {
          sum += V[i][l] * (1.0 / q[l]) * U[j][l];
        }
      }
      pinv[i][j] = sum;
    }
  }

  return pinv;
}

/**
 * Computes the minimum-norm update step: delta_X* = -A^+ * F.
 * Solves min ||delta_X||^2 subject to A * delta_X = -F.
 */
export function solveMinimumNormStep(
  A: number[][],
  F: number[],
  epsSingular: number = 1e-10
): number[] {
  const m = A.length;
  const n = A[0].length;
  const { U, q, V } = svd(A);
  const k = q.length;

  // temp = Sigma^+ * U^T * (-F)
  const temp = new Float64Array(k);
  for (let l = 0; l < k; l++) {
    if (q[l] > epsSingular) {
      let utF = 0.0;
      for (let j = 0; j < m; j++) {
        utF += U[j][l] * F[j];
      }
      temp[l] = -utF / q[l];
    } else {
      temp[l] = 0.0;
    }
  }

  // deltaX = V * temp
  const deltaX = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0.0;
    for (let l = 0; l < k; l++) {
      sum += V[i][l] * temp[l];
    }
    deltaX[i] = sum;
  }

  return deltaX;
}
