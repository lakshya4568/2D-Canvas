import { svd } from "../solver/matrix/svd";

export interface DragTarget {
  coordIndex: number;
  targetValue: number;
  weight?: number;
}

export interface DragSolverOptions {
  dragScale?: number; // 0.05 (1/20) by default per SolveSpace
  maxIterations?: number;
  tolerance?: number;
}

export interface DragSystemModel {
  evaluateResiduals(X: number[]): number[];
  evaluateJacobian(X: number[]): number[][];
}

export class DirectManipulationDragSolver {
  public static solveDragStep(
    model: DragSystemModel,
    currentX: number[],
    targets: DragTarget[],
    options: DragSolverOptions = {}
  ): { solution: number[]; converged: boolean } {
    const dragScale = options.dragScale ?? 0.05; // 1/20 column scale
    const maxIter = options.maxIterations ?? 25;
    const tol = options.tolerance ?? 1e-6;

    const n = currentX.length;
    let X = [...currentX];

    const S = new Float64Array(n);
    S.fill(1.0);
    const targetMap = new Map<number, number>();
    for (const t of targets) {
      if (t.coordIndex >= 0 && t.coordIndex < n) {
        S[t.coordIndex] = dragScale;
        targetMap.set(t.coordIndex, t.targetValue);
      }
    }

    for (let iter = 0; iter < maxIter; iter++) {
      const baseResiduals = model.evaluateResiduals(X);
      const baseJacobian = model.evaluateJacobian(X);

      const mBase = baseResiduals.length;
      const mDrag = targets.length;
      const mTotal = mBase + mDrag;

      const wBase = 100.0;
      const F = new Float64Array(mTotal);
      for (let i = 0; i < mBase; i++) F[i] = baseResiduals[i] * wBase;

      const Jtilde: number[][] = new Array(mTotal);
      for (let i = 0; i < mBase; i++) {
        const row = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          row[j] = baseJacobian[i][j] * S[j] * wBase;
        }
        Jtilde[i] = row as unknown as number[];
      }

      for (let k = 0; k < mDrag; k++) {
        const t = targets[k];
        const rowIdx = mBase + k;
        F[rowIdx] = (X[t.coordIndex] - t.targetValue) * (t.weight ?? 1.0);

        const dragRow = new Float64Array(n);
        dragRow[t.coordIndex] = 1.0 * S[t.coordIndex] * (t.weight ?? 1.0);
        Jtilde[rowIdx] = dragRow as unknown as number[];
      }

      let maxBaseResidual = 0.0;
      for (let i = 0; i < mBase; i++) {
        const absF = Math.abs(baseResiduals[i]);
        if (absF > maxBaseResidual) maxBaseResidual = absF;
      }

      if (maxBaseResidual < tol && iter > 0) {
        return { solution: X, converged: true };
      }

      const { U, q, V } = svd(Jtilde);
      const rank = q.length;
      const lambda = 1e-4;

      const temp = new Float64Array(rank);
      for (let l = 0; l < rank; l++) {
        if (q[l] > 1e-10) {
          let utF = 0.0;
          for (let i = 0; i < mTotal; i++) {
            utF += U[i][l] * F[i];
          }
          temp[l] = -utF * (q[l] / (q[l] * q[l] + lambda));
        } else {
          temp[l] = 0.0;
        }
      }

      const deltaXtilde = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        let sum = 0.0;
        for (let l = 0; l < rank; l++) {
          sum += V[j][l] * temp[l];
        }
        deltaXtilde[j] = sum;
      }

      let stepNorm = 0.0;
      for (let j = 0; j < n; j++) {
        const dx = deltaXtilde[j] * S[j];
        X[j] += dx;
        stepNorm += dx * dx;
      }

      if (Math.sqrt(stepNorm) < tol) {
        return { solution: X, converged: true };
      }
    }

    return { solution: X, converged: false };
  }
}
