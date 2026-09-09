import { svd } from "../solver/matrix/svd";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";

export type AdmissibilityStatus = "independent" | "redundant" | "conflicting";

export interface AdmissibilityEvaluation {
  status: AdmissibilityStatus;
  isAdmissible: boolean; // true if independent
  perpNorm: number;      // ||g_perp||_2
  residual: number;      // |f(X)|
  diagnosis?: string;
}

export interface AdmissibilityOptions {
  independenceEps?: number; // threshold for ||g_perp|| (default 1e-6)
  residualTol?: number;     // threshold for |f(X)| (default 1e-4)
  policy?: TolerancePolicy;
}

/**
 * Evaluates candidate constraint admissibility against the current system Jacobian row-space.
 * UPCE-MASTER-1.0 §32:
 * - ‖g⊥‖ ≥ 1e-6 -> Independent (admissible).
 * - ‖g⊥‖ < 1e-6 and |f| < ε_tol -> Redundant (discard silently).
 * - ‖g⊥‖ < 1e-6 and |f| ≥ ε_tol -> Conflicting (flag with diagnosis).
 */
export function evaluateCandidateAdmissibility(
  currentJacobian: number[][],
  candidateGradient: number[],
  residual: number = 0.0,
  options?: AdmissibilityOptions
): AdmissibilityEvaluation {
  const policy = options?.policy ?? DEFAULT_TOLERANCE_POLICY;
  const indEps = options?.independenceEps ?? policy.independence_eps ?? 1e-6;
  const resTol = options?.residualTol ?? policy.geometry_mm ?? 1e-4;

  const n = candidateGradient.length;
  const absResidual = Math.abs(residual);

  // If Jacobian is empty, any non-zero gradient is independent
  if (currentJacobian.length === 0) {
    let normSq = 0.0;
    for (let i = 0; i < n; i++) {
      normSq += candidateGradient[i] * candidateGradient[i];
    }
    const norm = Math.sqrt(normSq);
    if (norm >= indEps) {
      return {
        status: "independent",
        isAdmissible: true,
        perpNorm: norm,
        residual: absResidual,
      };
    }
    return {
      status: absResidual < resTol ? "redundant" : "conflicting",
      isAdmissible: false,
      perpNorm: norm,
      residual: absResidual,
      diagnosis: absResidual >= resTol ? `Conflicting zero-gradient constraint with non-zero residual ${absResidual}` : undefined,
    };
  }

  const m = currentJacobian.length;
  const jacN = currentJacobian[0].length;

  if (n !== jacN) {
    throw new Error(
      `[admissibilityFilter] Dimension mismatch: candidateGradient has length ${n} but Jacobian has ${jacN} columns.`
    );
  }

  const { U, q, V } = svd(currentJacobian);
  const k = q.length;

  const svdEps = policy.singular_value_eps ?? 1e-10;

  // Compute projection onto row space: g_proj = V * (V^T * g)
  const vDotG = new Float64Array(k);
  for (let l = 0; l < k; l++) {
    if (q[l] > svdEps) {
      let sum = 0.0;
      for (let j = 0; j < n; j++) {
        sum += V[j][l] * candidateGradient[j];
      }
      vDotG[l] = sum;
    } else {
      vDotG[l] = 0.0;
    }
  }

  const gProj = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0.0;
    for (let l = 0; l < k; l++) {
      sum += V[i][l] * vDotG[l];
    }
    gProj[i] = sum;
  }

  // Calculate norm of perpendicular component: ||g_perp|| = ||g - g_proj||
  let perpNormSq = 0.0;
  for (let i = 0; i < n; i++) {
    const diff = candidateGradient[i] - gProj[i];
    perpNormSq += diff * diff;
  }

  const perpNorm = Math.sqrt(perpNormSq);

  if (perpNorm >= indEps) {
    return {
      status: "independent",
      isAdmissible: true,
      perpNorm,
      residual: absResidual,
    };
  }

  if (absResidual < resTol) {
    return {
      status: "redundant",
      isAdmissible: false,
      perpNorm,
      residual: absResidual,
      diagnosis: `Redundant constraint: linearly dependent (perpNorm: ${perpNorm.toExponential(3)}) with satisfied residual (${absResidual.toExponential(3)} < ${resTol})`,
    };
  }

  return {
    status: "conflicting",
    isAdmissible: false,
    perpNorm,
    residual: absResidual,
    diagnosis: `Conflicting constraint: linearly dependent on active constraint row space (perpNorm: ${perpNorm.toExponential(3)} < ${indEps}) with unsatisfied residual ${absResidual.toFixed(4)} >= ${resTol}`,
  };
}

/**
 * Backward-compatible boolean admissibility test.
 */
export function isConstraintAdmissible(
  currentJacobian: number[][],
  candidateGradient: number[],
  tolerance: number = 1e-6
): boolean {
  return evaluateCandidateAdmissibility(currentJacobian, candidateGradient, 0.0, {
    independenceEps: tolerance,
  }).isAdmissible;
}
