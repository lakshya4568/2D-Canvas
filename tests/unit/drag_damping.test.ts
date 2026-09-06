import { describe, it, expect } from "vitest";
import { DirectManipulationDragSolver, DragSystemModel } from "../../lib/parametric/dragSolver";

describe("SolveSpace 1/20 Column Damped Drag Solver", () => {
  it("should smoothly rotate a fixed-length linkage towards mouse cursor without stretching length", () => {
    // Model: P1 at (0, 0) fixed, P2 at (50, 0) initially with fixed length = 50
    // State: [x1, y1, x2, y2]
    const fixedLength = 50;
    const model: DragSystemModel = {
      evaluateResiduals(X: number[]) {
        const dx = X[2] - X[0];
        const dy = X[3] - X[1];
        return [
          X[0] - 0, // P1.x = 0
          X[1] - 0, // P1.y = 0
          dx * dx + dy * dy - fixedLength * fixedLength, // Length P1-P2 = 50
        ];
      },
      evaluateJacobian(X: number[]) {
        const dx = X[2] - X[0];
        const dy = X[3] - X[1];
        return [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [-2 * dx, -2 * dy, 2 * dx, 2 * dy],
        ];
      },
    };

    const initialX = [0, 0, 50, 0];
    // User drags P2 towards (0, 60)
    const targets = [
      { coordIndex: 2, targetValue: 0 },
      { coordIndex: 3, targetValue: 60 },
    ];

    const result = DirectManipulationDragSolver.solveDragStep(model, initialX, targets, {
      dragScale: 0.05,
      maxIterations: 20,
      tolerance: 1e-4,
    });

    expect(result.solution[0]).toBeCloseTo(0, 2);
    expect(result.solution[1]).toBeCloseTo(0, 2);

    // Length must strictly remain 50
    const solvedLength = Math.hypot(result.solution[2] - result.solution[0], result.solution[3] - result.solution[1]);
    expect(solvedLength).toBeCloseTo(50, 2);

    // P2 should rotate to (0, 50) pointing towards (0, 60)
    expect(result.solution[2]).toBeCloseTo(0, 1);
    expect(result.solution[3]).toBeCloseTo(50, 1);
  });

  it("should penalize moving un-dragged geometry 400x higher than moving dragged geometry", () => {
    // Unconstrained 2D line segment between P1 and P2
    const model: DragSystemModel = {
      evaluateResiduals(_X: number[]) {
        return [];
      },
      evaluateJacobian(_X: number[]) {
        return [];
      },
    };

    const initialX = [10, 10, 40, 10];
    // Drag only P2 towards (50, 20)
    const targets = [
      { coordIndex: 2, targetValue: 50 },
      { coordIndex: 3, targetValue: 20 },
    ];

    const result = DirectManipulationDragSolver.solveDragStep(model, initialX, targets, {
      dragScale: 0.05,
    });

    expect(result.solution[0]).toBeCloseTo(10, 0);
    expect(result.solution[1]).toBeCloseTo(10, 0);
    expect(result.solution[2]).toBeGreaterThan(49);
    expect(result.solution[3]).toBeGreaterThan(19);
  });
});
