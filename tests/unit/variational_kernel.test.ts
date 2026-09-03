import { describe, it, expect } from "vitest";
import { extractVariationalGAD, solveVariationalGAD } from "../../lib/parametric/variationalKernel";
import { Shape } from "../../lib/geometry/types";

describe("General Variational GAD Kernel (Arbitrary Drawings without Hardcoding)", () => {
  it("should extract topological vertices and weld coincident endpoints", () => {
    // 3 connected line segments forming a triangle
    const shapes: Shape[] = [
      { id: "L1", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: "L2", type: "line", x1: 100, y1: 0, x2: 100, y2: 100 },
      { id: "L3", type: "line", x1: 100, y1: 100, x2: 0, y2: 0 },
    ];

    const gad = extractVariationalGAD(shapes);
    // 3 welded vertices instead of 6 separate endpoints
    expect(gad.vertices).toHaveLength(3);
    expect(gad.segments).toHaveLength(3);
  });

  it("should auto-scale GAD when inner rectangle is modified without formulas", () => {
    // Arbitrary nested frame (could be a building, mechanical cut-out, culvert, or flange)
    const outer: Shape = {
      id: "outer_frame",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    };

    const inner: Shape = {
      id: "inner_cavity",
      type: "rectangle",
      x: 30,
      y: 30,
      width: 340,
      height: 240,
    };

    const shapes: Shape[] = [outer, inner];

    const gad = extractVariationalGAD(shapes);
    // Detects horizontal, vertical, and parallel offset invariants
    expect(gad.constraints.length).toBeGreaterThan(4);

    // User scales inner cavity width from 340 to 500
    const result = solveVariationalGAD(shapes, {
      targetShapeId: "inner_cavity",
      newWidth: 500,
    });

    expect(result.converged).toBe(true);
    const uInner = result.updatedShapes.find((s) => s.id === "inner_cavity") as any;
    const uOuter = result.updatedShapes.find((s) => s.id === "outer_frame") as any;

    expect(uInner.width).toBe(500);
    // Outer frame naturally expands to maintain the right offset (30px)
    expect(uOuter.width).toBe(560);
    // Left offset (30px) is preserved
    expect(uInner.x - uOuter.x).toBe(30);
  });

  it("should handle arbitrary complex multi-cell GAD from JSON without domain hardcoding", () => {
    // 2 adjacent cells inside a main assembly
    const mainBeam: Shape = {
      id: "beam_outer",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 600,
      height: 260,
    };

    const cell1: Shape = {
      id: "cell_1",
      type: "rectangle",
      x: 30,
      y: 30,
      width: 250,
      height: 200,
    };

    const cell2: Shape = {
      id: "cell_2",
      type: "rectangle",
      x: 320,
      y: 30,
      width: 250,
      height: 200,
    };

    const shapes: Shape[] = [mainBeam, cell1, cell2];

    // Scale Cell 1 width from 250 to 400 (+150)
    const result = solveVariationalGAD(shapes, {
      targetShapeId: "cell_1",
      newWidth: 400,
    });

    expect(result.converged).toBe(true);
    const uC1 = result.updatedShapes.find((s) => s.id === "cell_1") as any;
    const uC2 = result.updatedShapes.find((s) => s.id === "cell_2") as any;
    const uBeam = result.updatedShapes.find((s) => s.id === "beam_outer") as any;

    expect(uC1.width).toBe(400);
    // Cell 2 shifted by +150 to preserve partition clearance
    expect(uC2.x).toBe(470);
    expect(uC2.width).toBe(250);
    // Main beam expands to 750
    expect(uBeam.width).toBe(750);
  });
});
