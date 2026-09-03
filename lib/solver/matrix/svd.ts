import { createMatrix, transpose } from "./denseMatrix";

export { transpose };

export interface SVDResult {
  U: number[][]; // m x k (or m x m)
  q: number[];   // Singular values sorted in descending order
  V: number[][]; // n x k (or n x n)
}

function pythag(a: number, b: number): number {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  if (absA > absB) {
    const r = absB / absA;
    return absA * Math.sqrt(1.0 + r * r);
  }
  if (absB === 0.0) return 0.0;
  const r = absA / absB;
  return absB * Math.sqrt(1.0 + r * r);
}

/**
 * Standard Golub-Reinsch SVD for m >= n matrices.
 * Decomposes A = U * diag(q) * V^T
 */
function svdGolubReinsch(A: number[][]): SVDResult {
  const m = A.length;
  const n = A[0].length;

  const u = createMatrix(m, n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      u[i][j] = A[i][j];
    }
  }

  const q = new Float64Array(n) as unknown as number[];
  const v = createMatrix(n, n);
  const e = new Float64Array(n) as unknown as number[];

  let g = 0.0;
  let anorm = 0.0;

  // Step 1: Householder reduction to bidiagonal form
  for (let i = 0; i < n; i++) {
    const l = i + 1;
    e[i] = g;
    let s = 0.0;

    for (let k = i; k < m; k++) s += u[k][i] * u[k][i];

    if (s < 1e-30) {
      g = 0.0;
    } else {
      const f = u[i][i];
      g = f < 0.0 ? Math.sqrt(s) : -Math.sqrt(s);
      const h = f * g - s;
      u[i][i] = f - g;
      for (let j = l; j < n; j++) {
        let sum = 0.0;
        for (let k = i; k < m; k++) sum += u[k][i] * u[k][j];
        const val = sum / h;
        for (let k = i; k < m; k++) u[k][j] += val * u[k][i];
      }
    }
    q[i] = g;

    s = 0.0;
    for (let j = l; j < n; j++) s += u[i][j] * u[i][j];

    if (s < 1e-30) {
      g = 0.0;
    } else {
      const f = u[i][l];
      g = f < 0.0 ? Math.sqrt(s) : -Math.sqrt(s);
      const h = f * g - s;
      u[i][l] = f - g;
      for (let j = l; j < n; j++) e[j] = u[i][j] / h;
      for (let k = l; k < m; k++) {
        let sum = 0.0;
        for (let j = l; j < n; j++) sum += u[k][j] * u[i][j];
        for (let j = l; j < n; j++) u[k][j] += sum * e[j];
      }
    }
    const y = Math.abs(q[i]) + Math.abs(e[i]);
    if (y > anorm) anorm = y;
  }

  // Step 2: Accumulation of right-hand transformations (V)
  for (let i = n - 1; i >= 0; i--) {
    const l = i + 1;
    if (g !== 0.0) {
      const h = g * u[i][l];
      for (let j = l; j < n; j++) v[j][i] = u[i][j] / h;
      for (let j = l; j < n; j++) {
        let s = 0.0;
        for (let k = l; k < n; k++) s += u[i][k] * v[k][j];
        for (let k = l; k < n; k++) v[k][j] += s * v[k][i];
      }
    }
    for (let j = l; j < n; j++) {
      v[i][j] = 0.0;
      v[j][i] = 0.0;
    }
    v[i][i] = 1.0;
    g = e[i];
  }

  // Step 3: Accumulation of left-hand transformations (U)
  for (let i = n - 1; i >= 0; i--) {
    const l = i + 1;
    g = q[i];
    for (let j = l; j < n; j++) u[i][j] = 0.0;

    if (g !== 0.0) {
      const h = u[i][i] * g;
      for (let j = l; j < n; j++) {
        let s = 0.0;
        for (let k = l; k < m; k++) s += u[k][i] * u[k][j];
        const val = s / h;
        for (let k = i; k < m; k++) u[k][j] += val * u[k][i];
      }
      for (let j = i; j < m; j++) u[j][i] /= g;
    } else {
      for (let j = i; j < m; j++) u[j][i] = 0.0;
    }
    u[i][i] += 1.0;
  }

  // Step 4: Diagonalization of bidiagonal form via implicit QR shifts
  const eps = 1e-15;
  for (let k = n - 1; k >= 0; k--) {
    for (let iter = 0; iter < 60; iter++) {
      let flag = true;
      let l = 0;

      for (let ll = k; ll >= 0; ll--) {
        l = ll;
        if (Math.abs(e[l]) <= eps * anorm) {
          flag = false;
          break;
        }
        if (l === 0 || Math.abs(q[l - 1]) <= eps * anorm) {
          break;
        }
      }

      if (flag) {
        let c = 0.0;
        let s = 1.0;
        for (let i = l; i <= k; i++) {
          const f = s * e[i];
          e[i] = c * e[i];
          if (Math.abs(f) <= eps * anorm) break;
          g = q[i];
          const h = pythag(f, g);
          q[i] = h;
          c = g / h;
          s = -f / h;
          for (let j = 0; j < m; j++) {
            const y1 = u[j][l - 1];
            const z1 = u[j][i];
            u[j][l - 1] = y1 * c + z1 * s;
            u[j][i] = -y1 * s + z1 * c;
          }
        }
      }

      const z = q[k];
      if (l === k) {
        if (z < 0.0) {
          q[k] = -z;
          for (let j = 0; j < n; j++) v[j][k] = -v[j][k];
        }
        break; // Converged
      }

      if (iter === 59) {
        break; // Max iterations reached
      }

      let x = q[l];
      const y1 = q[k - 1];
      g = e[k - 1];
      const h1 = e[k];
      const f1 = ((y1 - z) * (y1 + z) + (g - h1) * (g + h1)) / (2.0 * h1 * y1);
      g = pythag(f1, 1.0);
      const sh = f1 < 0.0 ? f1 - g : f1 + g;
      let f2 = ((x - z) * (x + z) + h1 * (y1 / sh - h1)) / x;

      let c = 1.0;
      let s = 1.0;
      for (let i = l; i < k; i++) {
        const i1 = i + 1;
        g = e[i1];
        const y2 = q[i1];
        const h2 = s * g;
        g = c * g;
        const z2 = pythag(f2, h2);
        e[i] = z2;
        c = f2 / z2;
        s = h2 / z2;
        const f3 = x * c + g * s;
        g = -x * s + g * c;
        const h3 = y2 * s;
        const y3 = y2 * c;

        for (let j = 0; j < n; j++) {
          const x1 = v[j][i];
          const z3 = v[j][i1];
          v[j][i] = x1 * c + z3 * s;
          v[j][i1] = -x1 * s + z3 * c;
        }

        const z4 = pythag(f3, h3);
        q[i] = z4;
        if (z4 !== 0.0) {
          c = f3 / z4;
          s = h3 / z4;
        }
        f2 = c * g + s * y3;
        x = -s * g + c * y3;

        for (let j = 0; j < m; j++) {
          const y4 = u[j][i];
          const z5 = u[j][i1];
          u[j][i] = y4 * c + z5 * s;
          u[j][i1] = -y4 * s + z5 * c;
        }
      }
      e[l] = 0.0;
      e[k] = f2;
      q[k] = x;
    }
  }

  // Step 5: Sort singular values in descending order
  for (let i = 0; i < n - 1; i++) {
    let maxIdx = i;
    let maxVal = q[i];
    for (let j = i + 1; j < n; j++) {
      if (q[j] > maxVal) {
        maxVal = q[j];
        maxIdx = j;
      }
    }
    if (maxIdx !== i) {
      q[maxIdx] = q[i];
      q[i] = maxVal;
      for (let j = 0; j < m; j++) {
        const temp = u[j][i];
        u[j][i] = u[j][maxIdx];
        u[j][maxIdx] = temp;
      }
      for (let j = 0; j < n; j++) {
        const temp = v[j][i];
        v[j][i] = v[j][maxIdx];
        v[j][maxIdx] = temp;
      }
    }
  }

  return { U: u, q: Array.from(q), V: v };
}

/**
 * Universal SVD routine handling arbitrary m x n real matrices.
 * When m < n, computes SVD of A^T and transposes factors.
 */
export function svd(A: number[][]): SVDResult {
  const m = A.length;
  if (m === 0) throw new Error("Matrix has 0 rows");
  const n = A[0].length;
  if (n === 0) throw new Error("Matrix has 0 columns");

  if (m >= n) {
    return svdGolubReinsch(A);
  } else {
    // Under-constrained: compute SVD of A^T in R^(n x m)
    const AT = transpose(A);
    const res = svdGolubReinsch(AT);
    // A = (A^T)^T = (U_AT * Sigma * V_AT^T)^T = V_AT * Sigma^T * U_AT^T
    return {
      U: res.V,
      q: res.q,
      V: res.U,
    };
  }
}
