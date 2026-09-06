import { describe, it, expect } from "vitest";
import { solveLevenbergMarquardt, SystemModel } from "../../lib/solver/levenbergMarquardt";

describe("Levenberg-Marquardt Quadratic Convergence & Stagnation Detection", () => {
  it("should achieve quadratic convergence on a 2D non-linear distance system", () => {
    const targetDistance = 50;
    const model: SystemModel = {
      evaluateResiduals(X: number[]) {
        const dx = X[0] - 0;
        const dy = X[1] - 0;
        return [dx * dx + dy * dy - targetDistance * targetDistance];
      },
      evaluateJacobian(X: number[]) {
        return [[2 * X[0], 2 * X[1]]];
      },
    };

    const initialX = [30, 45];
    const result = solveLevenbergMarquardt(model, initialX, {
      maxIterations: 50,
      toleranceResidual: 1e-6,
      toleranceStep: 1e-6,
    });

    expect(result.converged).toBe(true);
    expect(result.status).toBe("converged");
    expect(result.maxResidual).toBeLessThan(1e-6);
    const dist = Math.hypot(result.solution[0], result.solution[1]);
    expect(Math.abs(dist - 50)).toBeLessThan(1e-5);
  });

  it("should report stagnated instead of false convergence when constraints cannot be satisfied", () => {
    const model: SystemModel = {
      evaluateResiduals(X: number[]) {
        return [
          X[0] - 10,
          X[0] - 50,
        ];
      },
      evaluateJacobian(_X: number[]) {
        return [
          [1],
          [1],
        ];
      },
    };

    const initialX = [0];
    const result = solveLevenbergMarquardt(model, initialX, {
      maxIterations: 20,
      toleranceResidual: 1e-6,
      toleranceStep: 1e-6,
    });

    expect(result.converged).toBe(false);
    expect(result.status).toBe("stagnated");
    expect(result.maxResidual).toBeGreaterThan(10);
  });
});
