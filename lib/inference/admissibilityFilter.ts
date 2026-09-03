import { svd } from "../solver/matrix/svd";

export function isConstraintAdmissible(
  currentJacobian: number[][],
  candidateGradient: number[],
  tolerance: number = 1e-6
): boolean {
  if (currentJacobian.length === 0) {
    return true;
  }

  const m = currentJacobian.length;
  const n = currentJacobian[0].length;
  const { U, q, V } = svd(currentJacobian);
  const k = q.length;

  // Compute temp = U^T * (J * candidateGradient) / sigma_i
  // More directly: J^+ * (J * candidateGradient) = V * (Sigma^+ * Sigma) * V^T * candidateGradient
  // For each non-zero singular value, Sigma^+ * Sigma is 1
  const vDotG = new Float64Array(k);
  for (let l = 0; l < k; l++) {
    if (q[l] > 1e-10) {
      let sum = 0.0;
      for (let j = 0; j < n; j++) {
        sum += V[j][l] * candidateGradient[j];
      }
      vDotG[l] = sum;
    } else {
      vDotG[l] = 0.0;
    }
  }

  // g_proj = V * vDotG
  const gProj = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0.0;
    for (let l = 0; l < k; l++) {
      sum += V[i][l] * vDotG[l];
    }
    gProj[i] = sum;
  }

  // Calculate norm of residual perpendicular component: ||g - g_proj||
  let perpNormSq = 0.0;
  for (let i = 0; i < n; i++) {
    const diff = candidateGradient[i] - gProj[i];
    perpNormSq += diff * diff;
  }

  const perpNorm = Math.sqrt(perpNormSq);
  return perpNorm >= tolerance;
}
