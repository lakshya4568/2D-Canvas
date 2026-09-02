import { describe, it, expect } from "vitest";
import { ConstraintGraph } from "../lib/parametric/constraintGraph";
import { GeometricConstraintSolver } from "../lib/parametric/constraintSolver";
import { Point } from "../lib/geometry/types";

describe("Bipartite Constraint Graph & Geometric Solver", () => {
  it("calculates degrees of freedom (DOF) correctly for free and fixed entities", () => {
    const graph = new ConstraintGraph();

    // 2 points = 4 DOFs
    graph.addPointEntity("p1", "Point 1", { x: 0, y: 0 });
    graph.addPointEntity("p2", "Point 2", { x: 100, y: 0 });

    let dof = graph.analyzeDOF();
    expect(dof.totalDOFs).toBe(4);
    expect(dof.effectiveDOF).toBe(4);
    expect(dof.status).toBe("under_constrained");

    // Add distance constraint (removes 1 DOF)
    graph.addConstraint("c_dist", "distance", ["p1", "p2"], { targetValue: 120 });
    dof = graph.analyzeDOF();
    expect(dof.effectiveDOF).toBe(3);

    // Fix point 1 (removes 2 DOFs)
    const p1 = graph.entities.get("p1")!;
    p1.isFixed = true;
    p1.dof = 0;

    // Add horizontal constraint (removes 1 DOF)
    graph.addConstraint("c_horiz", "horizontal", ["p1", "p2"]);
    dof = graph.analyzeDOF();
    // 2 free DOFs (on p2) - 2 active constraints = 0 effective DOF! Fully constrained!
    expect(dof.effectiveDOF).toBe(0);
    expect(dof.status).toBe("fully_constrained");
  });

  it("solves distance constraint between two points", () => {
    const graph = new ConstraintGraph();
    const solver = new GeometricConstraintSolver();

    // p1 at (0, 0) fixed, p2 at (50, 0) free
    graph.addPointEntity("p1", "P1", { x: 0, y: 0 }, true);
    graph.addPointEntity("p2", "P2", { x: 50, y: 0 }, false);

    // Prescribe distance = 100
    graph.addConstraint("c1", "distance", ["p1", "p2"], { targetValue: 100 });

    const result = solver.solve(graph);
    expect(result.converged).toBe(true);

    const p2Solved = result.points.get("p2")!;
    expect(p2Solved.x).toBeCloseTo(100, 2);
    expect(p2Solved.y).toBeCloseTo(0, 2);
  });

  it("solves horizontal and vertical alignment constraints", () => {
    const graph = new ConstraintGraph();
    const solver = new GeometricConstraintSolver();

    // p1 at (10, 20) fixed, p2 at (100, 55) free
    graph.addPointEntity("p1", "P1", { x: 10, y: 20 }, true);
    graph.addPointEntity("p2", "P2", { x: 100, y: 55 }, false);

    graph.addConstraint("c_h", "horizontal", ["p1", "p2"]);

    const result = solver.solve(graph);
    expect(result.converged).toBe(true);

    const p2Solved = result.points.get("p2")!;
    expect(p2Solved.y).toBeCloseTo(20, 2); // Leveled horizontally with p1
  });

  it("solves parallel and perpendicular constraints", () => {
    const graph = new ConstraintGraph();
    const solver = new GeometricConstraintSolver();

    // Line 1: (0, 0) -> (100, 0) [Horizontal]
    graph.addPointEntity("l1_p1", "L1_P1", { x: 0, y: 0 }, true);
    graph.addPointEntity("l1_p2", "L1_P2", { x: 100, y: 0 }, true);

    // Line 2: (0, 50) -> (80, 80) [Tilted 45 deg, should become parallel to Line 1]
    graph.addPointEntity("l2_p1", "L2_P1", { x: 0, y: 50 }, false);
    graph.addPointEntity("l2_p2", "L2_P2", { x: 80, y: 80 }, false);

    graph.addConstraint("c_par", "parallel", ["l1_p1", "l1_p2", "l2_p1", "l2_p2"]);

    const result = solver.solve(graph);
    expect(result.converged).toBe(true);

    const p2_1 = result.points.get("l2_p1")!;
    const p2_2 = result.points.get("l2_p2")!;
    const dy = Math.abs(p2_2.y - p2_1.y);
    expect(dy).toBeCloseTo(0, 1); // Line 2 is now parallel to horizontal Line 1
  });

  it("reshapes an 8-sided polygon when an edge length changes while preserving constraints", () => {
    const graph = new ConstraintGraph();
    const solver = new GeometricConstraintSolver();

    // 8 vertices of chamfered polygon
    const initialVertices: Point[] = [
      { x: 150, y: 100 }, // v0
      { x: 327, y: 100 }, // v1 (top edge len = 177)
      { x: 354, y: 127 }, // v2 (tr chamfer)
      { x: 354, y: 219 }, // v3 (right edge len = 92)
      { x: 327, y: 246 }, // v4 (br chamfer)
      { x: 151, y: 246 }, // v5 (bottom edge len = 176)
      { x: 118, y: 213 }, // v6 (bl chamfer)
      { x: 118, y: 134 }, // v7 (left edge len = 79)
    ];

    // Anchor v0 (top-left) to keep polygon in place
    initialVertices.forEach((v, i) => {
      graph.addPointEntity(`v${i}`, `V${i}`, v, i === 0);
    });

    // Top edge length changes to 250 (was 177)
    graph.addConstraint("c_top_len", "length", ["v0", "v1"], { targetValue: 250, isDriving: true });
    graph.addConstraint("c_top_horiz", "horizontal", ["v0", "v1"]);

    const result = solver.solve(graph);
    expect(result.converged).toBe(true);

    const v1Solved = result.points.get("v1")!;
    expect(v1Solved.x).toBeCloseTo(150 + 250, 1); // Expanded to 400
    expect(v1Solved.y).toBeCloseTo(100, 1); // Remained horizontal
  });
});
