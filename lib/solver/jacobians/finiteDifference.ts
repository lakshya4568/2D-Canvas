import { createMatrix } from "../matrix/denseMatrix";

/**
 * Computes central difference numerical Jacobian approximation:
 * J_ij = (f_i(X + h*e_j) - f_i(X - h*e_j)) / (2h)
 */
export function computeCentralDifferenceJacobian(
  evaluateResiduals: (X: number[]) => number[],
  X: number[],
  h: number = 1e-6
): number[][] {
  const f0 = evaluateResiduals(X);
  const m = f0.length;
  const n = X.length;
  const J = createMatrix(m, n);

  const xPerturbedPlus = [...X];
  const xPerturbedMinus = [...X];

  for (let j = 0; j < n; j++) {
    xPerturbedPlus[j] = X[j] + h;
    xPerturbedMinus[j] = X[j] - h;

    const fPlus = evaluateResiduals(xPerturbedPlus);
    const fMinus = evaluateResiduals(xPerturbedMinus);

    for (let i = 0; i < m; i++) {
      J[i][j] = (fPlus[i] - fMinus[i]) / (2.0 * h);
    }

    xPerturbedPlus[j] = X[j];
    xPerturbedMinus[j] = X[j];
  }

  return J;
}
