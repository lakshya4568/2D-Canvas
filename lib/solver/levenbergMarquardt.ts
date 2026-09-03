import { svd, SVDResult } from "./matrix/svd";
import { normInfinity } from "./matrix/denseMatrix";

export interface SystemModel {
  evaluateResiduals(X: number[]): number[];
  evaluateJacobian(X: number[]): number[][];
}

export interface LMSolverOptions {
  maxIterations?: number;
  toleranceResidual?: number;
  toleranceStep?: number;
  initialLambda?: number;
  epsSingular?: number;
}

export interface LMSolverResult {
  converged: boolean;
  solution: number[];
  iterations: number;
  residualNorm: number;
  maxResidual: number;
  status: "converged" | "max_iterations" | "stagnated";
}

function norm2Squared(v: number[]): number {
  let sum = 0.0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return sum;
}

/**
 * Damped Levenberg-Marquardt solver with SVD minimum-norm projection.
 */
export function solveLevenbergMarquardt(
  model: SystemModel,
  initialX: number[],
  options: LMSolverOptions = {}
): LMSolverResult {
  const maxIter = options.maxIterations ?? 100;
  const tolRes = options.toleranceResidual ?? 1e-8;
  const tolStep = options.toleranceStep ?? 1e-8;
  const epsSing = options.epsSingular ?? 1e-10;

  let X = [...initialX];
  let lambda = options.initialLambda ?? 1e-3;

  let F = model.evaluateResiduals(X);
  let resNormSq = norm2Squared(F);
  let maxRes = normInfinity(F);

  if (maxRes < tolRes) {
    return {
      converged: true,
      solution: X,
      iterations: 0,
      residualNorm: Math.sqrt(resNormSq),
      maxResidual: maxRes,
      status: "converged",
    };
  }

  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    const J = model.evaluateJacobian(X);
    const m = J.length;
    const n = J[0].length;

    // SVD of Jacobian: J = U * Sigma * V^T
    const svdDecomp: SVDResult = svd(J);
    const { U, q, V } = svdDecomp;
    const k = q.length;

    // Regularized step: delta_X = -V * diag(sigma_i / (sigma_i^2 + lambda)) * U^T * F
    const temp = new Float64Array(k);
    for (let l = 0; l < k; l++) {
      if (q[l] > epsSing) {
        let utF = 0.0;
        for (let j = 0; j < m; j++) {
          utF += U[j][l] * F[j];
        }
        temp[l] = -utF * (q[l] / (q[l] * q[l] + lambda));
      } else {
        temp[l] = 0.0;
      }
    }

    const deltaX = new Array<number>(n);
    let stepNormSq = 0.0;
    for (let i = 0; i < n; i++) {
      let sum = 0.0;
      for (let l = 0; l < k; l++) sum += V[i][l] * temp[l];
      deltaX[i] = sum;
      stepNormSq += sum * sum;
    }

    const stepNorm = Math.sqrt(stepNormSq);

    // Gradient: g = J^T * F
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0.0;
      for (let j = 0; j < m; j++) sum += J[j][i] * F[j];
      g[i] = sum;
    }

    // Trial point
    const xTrial = new Array<number>(n);
    for (let i = 0; i < n; i++) xTrial[i] = X[i] + deltaX[i];

    const fTrial = model.evaluateResiduals(xTrial);
    const trialResNormSq = norm2Squared(fTrial);

    // Predicted reduction: deltaL = delta_X^T * (lambda * delta_X - g)
    let predictedReduction = 0.0;
    for (let i = 0; i < n; i++) {
      predictedReduction += deltaX[i] * (lambda * deltaX[i] - g[i]);
    }

    const actualReduction = resNormSq - trialResNormSq;
    const rho = predictedReduction > 1e-15 ? actualReduction / predictedReduction : -1.0;

    if (rho > 0) {
      // Step Accepted
      X = xTrial;
      F = fTrial;
      resNormSq = trialResNormSq;
      maxRes = normInfinity(F);

      if (rho > 0.75) {
        lambda = Math.max(lambda / 3.0, 1e-12);
      } else if (rho < 0.25) {
        lambda = lambda * 2.0;
      }

      if (maxRes < tolRes || stepNorm < tolStep) {
        return {
          converged: true,
          solution: X,
          iterations: iter + 1,
          residualNorm: Math.sqrt(resNormSq),
          maxResidual: maxRes,
          status: "converged",
        };
      }
    } else {
      // Step Rejected
      lambda = lambda * 4.0;
      if (lambda > 1e12) {
        return {
          converged: false,
          solution: X,
          iterations: iter + 1,
          residualNorm: Math.sqrt(resNormSq),
          maxResidual: maxRes,
          status: "stagnated",
        };
      }
    }
  }

  return {
    converged: maxRes < tolRes,
    solution: X,
    iterations: iter,
    residualNorm: Math.sqrt(resNormSq),
    maxResidual: maxRes,
    status: maxRes < tolRes ? "converged" : "max_iterations",
  };
}
