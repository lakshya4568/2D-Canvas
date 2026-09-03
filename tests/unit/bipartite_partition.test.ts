import { describe, it, expect } from "vitest";
import { BipartiteConstraintGraph } from "../../lib/parametric/graph/bipartiteGraph";
import { extractConnectedSubgraphsBFS } from "../../lib/parametric/graph/bfsPartition";

describe("Bipartite Constraint Graph & Subgraph Partitioning", () => {
  it("should calculate degree of freedom mobility", () => {
    const graph = new BipartiteConstraintGraph();

    // 4 points in 2D = 8 unconstrained DOFs
    graph.addEntity("p0", 2);
    graph.addEntity("p1", 2);
    graph.addEntity("p2", 2);
    graph.addEntity("p3", 2);

    // Add 4 constraints removing 1 DOF each
    graph.addConstraint("c_dist1", ["p0", "p1"], 1);
    graph.addConstraint("c_dist2", ["p1", "p2"], 1);
    graph.addConstraint("c_dist3", ["p2", "p3"], 1);
    graph.addConstraint("c_dist4", ["p3", "p0"], 1);

    // 8 coordinate DOFs - 4 constraint equations - 3 rigid body motions = 1 internal DOF
    const dof = graph.calculateDegreesOfFreedom();
    expect(dof).toBe(1);
  });

  it("should partition disjoint components via BFS when parameter is dirty", () => {
    const graph = new BipartiteConstraintGraph();

    // Subgraph 1 (Culvert Bay 1): p0, p1, p2 with constraints c1, c2
    graph.addEntity("p0", 2);
    graph.addEntity("p1", 2);
    graph.addEntity("p2", 2);
    graph.addConstraint("c1", ["p0", "p1"], 1);
    graph.addConstraint("c2", ["p1", "p2"], 1);

    // Subgraph 2 (Disjoint Box): p10, p11 with constraint c10
    graph.addEntity("p10", 2);
    graph.addEntity("p11", 2);
    graph.addConstraint("c10", ["p10", "p11"], 1);

    // Only p0 is marked dirty
    const subgraphs = extractConnectedSubgraphsBFS(graph, ["p0"]);

    expect(subgraphs.length).toBe(1);
    const affectedEntities = subgraphs[0].entityIds;
    expect(affectedEntities.has("p0")).toBe(true);
    expect(affectedEntities.has("p1")).toBe(true);
    expect(affectedEntities.has("p2")).toBe(true);
    // Subgraph 2 entities must NOT be in the active sub-problem
    expect(affectedEntities.has("p10")).toBe(false);
    expect(affectedEntities.has("p11")).toBe(false);
  });
});
