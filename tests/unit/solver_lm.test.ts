import { describe, it, expect } from "vitest";
import { solveLevenbergMarquardt, SystemModel } from "../../lib/solver/levenbergMarquardt";

describe("Damped Levenberg-Marquardt Solver", () => {
  it("should solve a 4-bar linkage non-linear constraint system to tolerance < 1e-8", () => {
    // 4 points in 2D: P0=(0,0), P1=(100,0), P2=(100,100), P3=(0,100)
    // Fixed: P0=(0,0), P1=(100,0)
    // Variables: P2=(x2, y2), P3=(x3, y3) -> 4 variables [x2, y2, x3, y3]
    // Constraints:
    // f1: dist(P1, P2) = 100
    // f2: dist(P2, P3) = 100
    // f3: dist(P3, P0) = 100
    // f4: horizontal(P3, P2): y2 - y3 = 0
    // Starts with perturbed initial guess: P2=(120, 90), P3=(20, 110)

    const P0 = { x: 0, y: 0 };
    const P1 = { x: 100, y: 0 };

    const model: SystemModel = {
      evaluateResiduals(X: number[]): number[] {
        const x2 = X[0];
        const y2 = X[1];
        const x3 = X[2];
        const y3 = X[3];

        const d1 = Math.hypot(x2 - P1.x, y2 - P1.y);
        const d2 = Math.hypot(x3 - x2, y3 - y2);
        const d3 = Math.hypot(x3 - P0.x, y3 - P0.y);
        const h = y2 - y3;
        const verticalAlignmentP0P3 = x3 - P0.x;

        return [
          d1 - 100.0,
          d2 - 100.0,
          d3 - 100.0,
          h,
          verticalAlignmentP0P3,
        ];
      },

      evaluateJacobian(X: number[]): number[][] {
        const x2 = X[0];
        const y2 = X[1];
        const x3 = X[2];
        const y3 = X[3];

        const d1 = Math.hypot(x2 - P1.x, y2 - P1.y) + 1e-15;
        const d2 = Math.hypot(x3 - x2, y3 - y2) + 1e-15;
        const d3 = Math.hypot(x3 - P0.x, y3 - P0.y) + 1e-15;

        return [
          [(x2 - P1.x) / d1, (y2 - P1.y) / d1, 0, 0],
          [-(x3 - x2) / d2, -(y3 - y2) / d2, (x3 - x2) / d2, (y3 - y2) / d2],
          [0, 0, (x3 - P0.x) / d3, (y3 - P0.y) / d3],
          [0, 1, 0, -1],
          [0, 0, 1, 0],
        ];
      },
    };

    const initialX = [120.0, 90.0, 20.0, 110.0];
    const result = solveLevenbergMarquardt(model, initialX, {
      maxIterations: 50,
      toleranceResidual: 1e-8,
    });

    expect(result.converged).toBe(true);
    expect(result.maxResidual).toBeLessThan(1e-8);
    expect(result.solution[0]).toBeCloseTo(100.0, 4); // x2
    expect(result.solution[1]).toBeCloseTo(100.0, 4); // y2
    expect(result.solution[2]).toBeCloseTo(0.0, 4);   // x3
    expect(result.solution[3]).toBeCloseTo(100.0, 4); // y3
  });
});
