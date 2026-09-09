import { svd, SVDResult } from "./matrix/svd";
import { normInfinity } from "./matrix/denseMatrix";
import { SystemModel, LMSolverResult } from "./levenbergMarquardt";

export interface DoglegSolverOptions {
  maxIterations?: number;
  toleranceResidual?: number;
  toleranceStep?: number;
  initialRadius?: number;
  maxRadius?: number;
  epsSingular?: number;
}

function norm2Squared(v: number[] | Float64Array): number {
  let sum = 0.0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return sum;
}

/**
 * Powell's Dogleg Trust-Region Solver with SVD Pseudo-Inverse Regularization.
 * Implements the hybrid Cauchy-steepest-descent / Gauss-Newton path within an
 * adaptive trust region (UPCE-MASTER-1.0 §29, §3.5).
 */
export function solveDogleg(
  model: SystemModel,
  initialX: number[],
  options: DoglegSolverOptions = {}
): LMSolverResult {
  const maxIter = options.maxIterations ?? 100;
  const tolRes = options.toleranceResidual ?? 1e-8;
  const tolStep = options.toleranceStep ?? 1e-8;
  const maxRadius = options.maxRadius ?? 1e5;
  const epsSing = options.epsSingular ?? 1e-10;

  let X = [...initialX];
  let Delta = options.initialRadius ?? 1.0;

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

    // Gradient: g = J^T * F
    const g = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0.0;
      for (let j = 0; j < m; j++) sum += J[j][i] * F[j];
      g[i] = sum;
    }

    const gNormSq = norm2Squared(g);
    if (Math.sqrt(gNormSq) < 1e-14) {
      // Stationary point reached
      return {
        converged: maxRes < tolRes,
        solution: X,
        iterations: iter + 1,
        residualNorm: Math.sqrt(resNormSq),
        maxResidual: maxRes,
        status: maxRes < tolRes ? "converged" : "stagnated",
      };
    }

    // 1. Cauchy Steepest Descent step: h_sd = -alpha * g, alpha = ||g||^2 / ||J * g||^2
    const Jg = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let sum = 0.0;
      for (let j = 0; j < n; j++) sum += J[i][j] * g[j];
      Jg[i] = sum;
    }
    const JgNormSq = norm2Squared(Jg);
    const alpha = JgNormSq > 1e-15 ? gNormSq / JgNormSq : 1.0;

    const hSd = new Float64Array(n);
    for (let i = 0; i < n; i++) hSd[i] = -alpha * g[i];
    const hSdNorm = Math.sqrt(norm2Squared(hSd));

    // 2. Gauss-Newton step via Thin SVD: J = U * Sigma * V^T, h_gn = -V * Sigma^+ * U^T * F
    const svdDecomp: SVDResult = svd(J);
    const { U, q, V } = svdDecomp;
    const k = q.length;

    const hGn = new Float64Array(n);
    for (let l = 0; l < k; l++) {
      if (q[l] > epsSing) {
        let utF = 0.0;
        for (let j = 0; j < m; j++) utF += U[j][l] * F[j];
        const coeff = -utF / q[l];
        for (let i = 0; i < n; i++) hGn[i] += V[i][l] * coeff;
      }
    }
    const hGnNorm = Math.sqrt(norm2Squared(hGn));

    // 3. Dogleg Step selection
    const h = new Float64Array(n);

    if (hGnNorm <= Delta) {
      // Full Gauss-Newton step inside trust region
      for (let i = 0; i < n; i++) h[i] = hGn[i];
    } else if (hSdNorm >= Delta) {
      // Scaled Cauchy step along boundary
      const factor = Delta / (hSdNorm + 1e-15);
      for (let i = 0; i < n; i++) h[i] = factor * hSd[i];
    } else {
      // Interpolated step along Dogleg trajectory: h_sd + beta * (h_gn - h_sd)
      const d = new Float64Array(n);
      for (let i = 0; i < n; i++) d[i] = hGn[i] - hSd[i];

      const dNormSq = norm2Squared(d);
      let dotSdD = 0.0;
      for (let i = 0; i < n; i++) dotSdD += hSd[i] * d[i];

      const a = dNormSq;
      const b = 2.0 * dotSdD;
      const c = hSdNorm * hSdNorm - Delta * Delta;

      const disc = Math.max(0.0, b * b - 4.0 * a * c);
      const beta = a > 1e-15 ? (-b + Math.sqrt(disc)) / (2.0 * a) : 0.0;
      const clampedBeta = Math.max(0.0, Math.min(1.0, beta));

      for (let i = 0; i < n; i++) h[i] = hSd[i] + clampedBeta * d[i];
    }

    const stepNorm = Math.sqrt(norm2Squared(h));

    // Evaluate trial point
    const xTrial = new Array<number>(n);
    for (let i = 0; i < n; i++) xTrial[i] = X[i] + h[i];

    const fTrial = model.evaluateResiduals(xTrial);
    const trialResNormSq = norm2Squared(fTrial);

    // Linear model value at h: L(h) = ||F + J*h||^2
    const Jh = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let sum = 0.0;
      for (let j = 0; j < n; j++) sum += J[i][j] * h[j];
      Jh[i] = sum;
    }
    let linearModelNormSq = 0.0;
    for (let i = 0; i < m; i++) {
      const val = F[i] + Jh[i];
      linearModelNormSq += val * val;
    }

    const actualReduction = resNormSq - trialResNormSq;
    const predictedReduction = resNormSq - linearModelNormSq;

    const rho = predictedReduction > 1e-15 ? actualReduction / predictedReduction : -1.0;

    if (rho > 0.0) {
      // Step Accepted
      X = xTrial;
      F = fTrial;
      resNormSq = trialResNormSq;
      maxRes = normInfinity(F);

      if (rho > 0.75 && stepNorm > 0.8 * Delta) {
        Delta = Math.min(2.0 * Delta, maxRadius);
      } else if (rho < 0.25) {
        Delta = Math.max(0.5 * Delta, 1e-12);
      }

      if (maxRes < tolRes) {
        return {
          converged: true,
          solution: X,
          iterations: iter + 1,
          residualNorm: Math.sqrt(resNormSq),
          maxResidual: maxRes,
          status: "converged",
        };
      }

      if (stepNorm < tolStep) {
        return {
          converged: maxRes < tolRes,
          solution: X,
          iterations: iter + 1,
          residualNorm: Math.sqrt(resNormSq),
          maxResidual: maxRes,
          status: maxRes < tolRes ? "converged" : "stagnated",
        };
      }
    } else {
      // Step Rejected: shrink trust region
      Delta = 0.5 * Delta;
      if (Delta < 1e-12) {
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
