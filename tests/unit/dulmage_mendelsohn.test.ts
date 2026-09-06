import { describe, it, expect } from "vitest";
import { BipartiteConstraintGraph } from "../../lib/parametric/graph/bipartiteGraph";

describe("Dulmage-Mendelsohn (DM) Decomposition & BTF Engine", () => {
  it("should classify an under-constrained system and report true DOFs", () => {
    const graph = new BipartiteConstraintGraph();
    // Two 2D points: 4 DOFs
    graph.addEntity("p1", 2);
    graph.addEntity("p2", 2);

    // 1 distance constraint: 1 equation
    graph.addConstraint("c_dist", ["p1", "p2"], 1);

    const dm = graph.decomposeDM();
    expect(dm.status).toBe("under_constrained");
    expect(dm.totalDof).toBe(3); // 4 - 1 = 3 unconstrained coordinates
    expect(dm.underConstrained.variables.length).toBeGreaterThan(0);
    expect(dm.overConstrained.conflictingConstraints).toHaveLength(0);
  });

  it("should classify a well-constrained subsystem and partition into Block Triangular Form", () => {
    const graph = new BipartiteConstraintGraph();
    // Point p1 (2 DOFs) fixed by 2 coordinate equations
    graph.addEntity("p1", 2);
    graph.addConstraint("c_p1_x", ["p1"], 1);
    graph.addConstraint("c_p1_y", ["p1"], 1);

    // Point p2 (2 DOFs) fixed by 2 coordinate equations
    graph.addEntity("p2", 2);
    graph.addConstraint("c_p2_x", ["p2"], 1);
    graph.addConstraint("c_p2_y", ["p2"], 1);

    const dm = graph.decomposeDM();
    expect(dm.status).toBe("well_constrained");
    expect(dm.totalDof).toBe(0);
    expect(dm.wellConstrained.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("should isolate the exact conflicting constraints in an over-constrained system", () => {
    const graph = new BipartiteConstraintGraph();
    // Scalar coordinate: 1 DOF
    graph.addEntity("x1", 1);

    // 2 conflicting constraints on the same coordinate: 2 equations
    graph.addConstraint("c_x1_fix10", ["x1"], 1);
    graph.addConstraint("c_x1_fix50", ["x1"], 1);

    const dm = graph.decomposeDM();
    expect(dm.status).toBe("over_constrained");
    expect(dm.overConstrained.conflictingConstraints).toContain("c_x1_fix10");
    expect(dm.overConstrained.conflictingConstraints).toContain("c_x1_fix50");
  });

  it("should correctly handle disconnected components without global rigid-body subtraction bugs", () => {
    const graph = new BipartiteConstraintGraph();
    // Component A: Point pA1 (2 DOFs) fixed with 2 constraints
    graph.addEntity("pA1", 2);
    graph.addConstraint("cA_x", ["pA1"], 1);
    graph.addConstraint("cA_y", ["pA1"], 1);

    // Component B: Point pB1 (2 DOFs) completely free
    graph.addEntity("pB1", 2);

    const dm = graph.decomposeDM();
    // Component A is well-constrained, Component B is under-constrained with 2 DOFs
    expect(dm.underConstrained.variables).toContain("pB1_d0");
    expect(dm.underConstrained.variables).toContain("pB1_d1");
    expect(dm.wellConstrained.variables).toContain("pA1_d0");
    expect(dm.wellConstrained.variables).toContain("pA1_d1");
    expect(dm.totalDof).toBe(2);
  });
});
