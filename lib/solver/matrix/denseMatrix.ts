/**
 * Pure TypeScript dense matrix and vector operations for variational solving.
 */

export function createMatrix(rows: number, cols: number, initialVal: number = 0): number[][] {
  const m: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const row = new Float64Array(cols);
    if (initialVal !== 0) row.fill(initialVal);
    m[i] = row as unknown as number[];
  }
  return m;
}

export function createVector(size: number, initialVal: number = 0): number[] {
  const v = new Float64Array(size);
  if (initialVal !== 0) v.fill(initialVal);
  return v as unknown as number[];
}

export function transpose(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const AT = createMatrix(n, m);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      AT[j][i] = A[i][j];
    }
  }
  return AT;
}

export function matrixVectorMultiply(A: number[][], x: number[]): number[] {
  const m = A.length;
  const n = A[0].length;
  const b = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let sum = 0.0;
    const row = A[i];
    for (let j = 0; j < n; j++) {
      sum += row[j] * x[j];
    }
    b[i] = sum;
  }
  return b as unknown as number[];
}

export function dot(a: number[], b: number[]): number {
  let sum = 0.0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function norm2(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

export function normInfinity(v: number[]): number {
  let max = 0.0;
  for (let i = 0; i < v.length; i++) {
    const abs = Math.abs(v[i]);
    if (abs > max) max = abs;
  }
  return max;
}
