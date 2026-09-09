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
  anchoredIndices?: number[]; // anchored coordinate indices (S_jj = 1000.0)
  previousSolution?: number[]; // Warm-start from previous frame for hysteresis stability
}

export interface DragSystemModel {
  evaluateResiduals(X: number[]): number[];
  evaluateJacobian(X: number[]): number[][];
}

export interface DragStepResult {
  solution: number[];
  converged: boolean;
  iterations: number;
  residualNorm: number;
}

/**
 * Direct manipulation drag solver using SVD minimum-norm step with diagonal
 * coordinate damping matrix S_jj ∈ {0.05, 1.0, 1000.0} and Tikhonov regularization.
 * Implements UPCE-MASTER-1.0 §34, §86, Gate G9 (§76).
 *
 * Damping hierarchy:
 *   S_jj = 0.05  → dragged coordinates (20x amplified responsiveness)
 *   S_jj = 1.0   → free/unconstrained coordinates (neutral)
 *   S_jj = 1000.0 → anchored coordinates (near-immovable, 1,000,000x penalty)
 *
 * Step: ΔX* = −J⁺ F  via SVD pseudoinverse with λ = 1e-4 Tikhonov regularization.
 */
export class DirectManipulationDragSolver {
  public static solveDragStep(
    model: DragSystemModel,
    currentX: number[],
    targets: DragTarget[],
    options: DragSolverOptions = {}
  ): DragStepResult {
    const dragScale = options.dragScale ?? 0.05; // 1/20 column scale
    const maxIter = options.maxIterations ?? 25;
    const tol = options.tolerance ?? 1e-6;

    const n = currentX.length;

    // Warm-start: use previous solution if provided (hysteresis stability)
    let X: number[];
    if (options.previousSolution && options.previousSolution.length === n) {
      X = [...options.previousSolution];
    } else {
      X = [...currentX];
    }

    // Jacobian column scaling: S_jj in {0.05 (dragged), 1.0 (free), 1000.0 (anchored)}
    const S = new Float64Array(n);
    S.fill(1.0); // Free un-dragged geometry

    if (options.anchoredIndices) {
      for (const aIdx of options.anchoredIndices) {
        if (aIdx >= 0 && aIdx < n) {
          S[aIdx] = 1000.0; // Anchored geometry heavily penalized (1,000,000x)
        }
      }
    }

    const targetMap = new Map<number, number>();
    for (const t of targets) {
      if (t.coordIndex >= 0 && t.coordIndex < n) {
        S[t.coordIndex] = dragScale; // Dragged geometry absorbs displacement (20x)
        targetMap.set(t.coordIndex, t.targetValue);
      }
    }

    const numAnchors = options.anchoredIndices ? options.anchoredIndices.length : 0;
    let lastResidualNorm = Infinity;
    let totalIter = 0;

    for (let iter = 0; iter < maxIter; iter++) {
      totalIter = iter + 1;
      const baseResiduals = model.evaluateResiduals(X);
      const baseJacobian = model.evaluateJacobian(X);

      const mBase = baseResiduals.length;
      const mDrag = targets.length;
      const mTotal = mBase + numAnchors + mDrag;

      let maxBaseResidual = 0.0;
      for (let i = 0; i < mBase; i++) {
        const absF = Math.abs(baseResiduals[i]);
        if (absF > maxBaseResidual) maxBaseResidual = absF;
      }

      lastResidualNorm = maxBaseResidual;

      if (maxBaseResidual < tol && iter > 0) {
        return { solution: X, converged: true, iterations: totalIter, residualNorm: lastResidualNorm };
      }

      const wBase = 1000.0;
      const F = new Float64Array(mTotal);
      for (let i = 0; i < mBase; i++) F[i] = baseResiduals[i] * wBase;

      const Jtilde: number[][] = new Array(mTotal);
      for (let i = 0; i < mBase; i++) {
        const row = new Float64Array(n);
        for (let j = 0; j < n; j++) {
          row[j] = baseJacobian[i][j] * (1.0 / S[j]) * wBase;
        }
        Jtilde[i] = row as unknown as number[];
      }

      // Anchored coordinate damping rows
      for (let a = 0; a < numAnchors; a++) {
        const aIdx = options.anchoredIndices![a];
        const rowIdx = mBase + a;
        F[rowIdx] = (X[aIdx] - currentX[aIdx]) * wBase;

        const row = new Float64Array(n);
        row[aIdx] = 1.0 * (1.0 / S[aIdx]) * wBase;
        Jtilde[rowIdx] = row as unknown as number[];
      }

      // Drag target soft rows
      for (let k = 0; k < mDrag; k++) {
        const t = targets[k];
        const rowIdx = mBase + numAnchors + k;
        F[rowIdx] = (X[t.coordIndex] - t.targetValue) * (t.weight ?? 1.0);

        const dragRow = new Float64Array(n);
        dragRow[t.coordIndex] = 1.0 * (1.0 / S[t.coordIndex]) * (t.weight ?? 1.0);
        Jtilde[rowIdx] = dragRow as unknown as number[];
      }

      const { U, q, V } = svd(Jtilde);
      const rank = q.length;
      const lambda = 1e-4; // Tikhonov regularization

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
        const dx = deltaXtilde[j] * (1.0 / S[j]);
        X[j] += dx;
        stepNorm += dx * dx;
      }

      if (Math.sqrt(stepNorm) < tol) {
        return { solution: X, converged: true, iterations: totalIter, residualNorm: lastResidualNorm };
      }
    }

    return { solution: X, converged: false, iterations: totalIter, residualNorm: lastResidualNorm };
  }
}

/**
 * DragSession: Manages interactive drag lifecycle with warm-start hysteresis.
 *
 * Maintains previous frame's converged solution as the initial guess for the next frame,
 * preventing solution branch flipping during continuous drag. The initial state is
 * snapshotted on construction and restored on cancel().
 *
 * UPCE-MASTER-1.0 §34, §86, Gate G9 (§76)
 */
export class DragSession {
  private previousSolution: number[] | null = null;
  private initialState: number[];
  private latestSolution: number[] | null = null;
  private frameCount = 0;
  private totalLatency = 0;

  constructor(initialState: number[]) {
    this.initialState = [...initialState];
  }

  /**
   * Process one drag frame with warm-start from the previous frame's solution.
   * Returns the converged solution, convergence status, and frame latency.
   */
  public solveFrame(
    model: DragSystemModel,
    targets: DragTarget[],
    options: DragSolverOptions = {}
  ): { solution: number[]; converged: boolean; frameLatency: number; frameIndex: number } {
    const t0 = performance.now();

    const solveOptions: DragSolverOptions = {
      ...options,
      previousSolution: this.previousSolution ?? undefined,
    };

    const result = DirectManipulationDragSolver.solveDragStep(
      model,
      this.initialState,
      targets,
      solveOptions
    );

    const frameLatency = performance.now() - t0;
    this.frameCount++;
    this.totalLatency += frameLatency;

    // Store converged solution as warm-start for next frame
    this.previousSolution = [...result.solution];
    this.latestSolution = [...result.solution];

    return {
      solution: result.solution,
      converged: result.converged,
      frameLatency,
      frameIndex: this.frameCount - 1,
    };
  }

  /**
   * Commit drag — persist the final coordinates from the last solved frame.
   */
  public commit(): number[] {
    return this.latestSolution ? [...this.latestSolution] : [...this.initialState];
  }

  /**
   * Cancel drag — revert to the pre-drag initial state.
   */
  public cancel(): number[] {
    this.previousSolution = null;
    this.latestSolution = null;
    return [...this.initialState];
  }

  /** Number of frames solved in this session. */
  public getFrameCount(): number {
    return this.frameCount;
  }

  /** Average frame latency in milliseconds. */
  public getAverageLatency(): number {
    return this.frameCount > 0 ? this.totalLatency / this.frameCount : 0;
  }

  /** Total accumulated latency in milliseconds. */
  public getTotalLatency(): number {
    return this.totalLatency;
  }

  /** Whether a warm-start solution is available (i.e., at least one frame was solved). */
  public hasWarmStart(): boolean {
    return this.previousSolution !== null;
  }
}
