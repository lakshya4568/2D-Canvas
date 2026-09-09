/**
 * Gate G6 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, §29.7, §29.8, §30, §33, §34)
 *
 * Non-negotiable Gate G6 Criteria:
 * 1. Warm Solve Latency < 5 ms (Target < 1 ms):
 *    PlaneGCS WASM adapter meets warm solve latency < 5 ms on standard benchmark fixtures (e.g. 3-cell culvert).
 * 2. Residual Convergence to Tolerance ||F|| <= 1e-8 mm:
 *    All variational solves converge strictly to residual norm ||F|| <= 1e-8 mm.
 * 3. Connected-Component Partitioning in Solve Path:
 *    Decomposes disjoint components in canvas via bipartite graph analysis.
 *    Modifying or dragging Component A re-solves only Component A, keeping Component B 100% untouched.
 * 4. Temporary Drag Constraints in Preview Mode:
 *    Temporary drag preview targets (`temporary: true`) solve smoothly with coordinate damping
 *    (S_jj = 0.05 for dragged, 1.0 for free, 1000.0 for anchored), and purge cleanly on commit.
 * 5. Clean Routing of Unsupported Constraints to Fallback:
 *    Unsupported or custom non-linear constraints (e.g. chamfer equal leg, wall thickness offset, haunches)
 *    route cleanly to local TS solvers with explicit provenance ("dogleg_ts" | "lm_ts" | "analytical_culvert").
 * 6. Deterministic Fixture Replay & Tolerance Reporting:
 *    Replaying parameter sweep sequences across canonical fixtures produces bit-for-bit identical
 *    coordinates and residual tolerances across runs.
 * 7. Multi-Solver Benchmark Comparison:
 *    Benchmarks PlaneGCS WASM, local DogLeg (Thin SVD), local LM (analytical Jacobians),
 *    and analytical culvert domain model with structured diagnostic reporting.
 */

import { describe, it, expect } from "vitest";
import {
  PlaneGcsClient,
  UnifiedSolverInput,
  isPlaneGcsSupportedConstraint,
} from "../../lib/solver/planegcsClient";
import {
  createThreeCellCulvertFixture,
  createRailingRunFixture,
  createFourBarLinkageFixture,
  runSolverBenchmark,
  SolverBenchmarkRunner,
} from "../../lib/solver/solverBenchmark";
import {
  FixtureReplayer,
} from "../../lib/solver/fixtureReplayer";

describe("Gate G6 Acceptance Criterion: Solver Adapter & Performance (UPCE-MASTER-1.0 §76, §86, §29.7, §29.8, §30)", () => {
  describe("Criterion 1: PlaneGCS WASM Warm Solve Latency < 5 ms", () => {
    it("should achieve warm solve latency < 5 ms on 3-cell culvert benchmark fixture", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      const fixture = createThreeCellCulvertFixture(2000, 1500, 250);

      // Cold solve first
      const coldRes = await client.solve(fixture);
      expect(coldRes.converged).toBe(true);
      expect(coldRes.provenance).toBe("planegcs_wasm");

      // Measure warm solves averaged across 20 iterations
      const iterations = 20;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = await client.solve(fixture);
        expect(res.converged).toBe(true);
      }
      const t1 = performance.now();
      const avgLatencyMs = (t1 - t0) / iterations;

      // Gate G6 requirement: strictly < 5.0 ms
      expect(avgLatencyMs).toBeLessThan(5.0);
      // Verify high performance (typically < 1.5 ms in bun/v8)
      expect(avgLatencyMs).toBeGreaterThan(0.0);
    });

    it("should achieve warm solve latency < 5 ms on repeated railing run fixture", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      const railingFixture = createRailingRunFixture(3000, 6, 1000);
      const coldRes = await client.solve(railingFixture);
      expect(coldRes.converged).toBe(true);

      const iterations = 15;
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = await client.solve(railingFixture);
        expect(res.converged).toBe(true);
      }
      const t1 = performance.now();
      const avgLatencyMs = (t1 - t0) / iterations;

      expect(avgLatencyMs).toBeLessThan(5.0);
    });
  });

  describe("Criterion 2: Residual Convergence to Tolerance ||F|| <= 1e-8 mm", () => {
    it("should converge with residual norm ||F|| <= 1e-8 mm on 3-cell culvert span variational change", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      const fixture = createThreeCellCulvertFixture(2500, 1800, 300);
      const res = await client.solve(fixture);

      expect(res.converged).toBe(true);
      expect(res.status).toBe("converged");
      expect(res.residualNorm).toBeLessThanOrEqual(1e-8);
      expect(res.maxResidual).toBeLessThanOrEqual(1e-8);

      // Verify geometry: Bay 1 width is exactly 2500
      const b0 = res.points.get("b0")!;
      const b1 = res.points.get("b1")!;
      const distBay1 = Math.hypot(b1.x - b0.x, b1.y - b0.y);
      expect(distBay1).toBeCloseTo(2500, 6);

      // Total width: 3 * 2500 = 7500
      const b3 = res.points.get("b3")!;
      const totalWidth = Math.hypot(b3.x - b0.x, b3.y - b0.y);
      expect(totalWidth).toBeCloseTo(7500, 6);
    });

    it("should converge with residual norm ||F|| <= 1e-8 mm on 4-bar linkage kinematics", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      const linkage = createFourBarLinkageFixture(120, 180, 140, 200);
      const res = await client.solve(linkage);

      expect(res.converged).toBe(true);
      expect(res.residualNorm).toBeLessThanOrEqual(1e-8);

      const pA = res.points.get("p_ground_a")!;
      const pCrank = res.points.get("p_crank_pin")!;
      const crankLen = Math.hypot(pCrank.x - pA.x, pCrank.y - pA.y);
      expect(crankLen).toBeCloseTo(120, 6);
    });
  });

  describe("Criterion 3: Connected-Component Partitioning in Solve Path", () => {
    it("should solve Component A when modified while keeping Component B 100% untouched", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Setup 2 completely disjoint components on canvas:
      // Component A: Points A0(0, 0) fixed, A1(100, 0) with distance constraint = 100
      // Component B: Points B0(500, 500) fixed, B1(700, 500) with distance constraint = 200
      const twoComponentInput: UnifiedSolverInput = {
        points: [
          { id: "A0", x: 0, y: 0, fixed: true },
          { id: "A1", x: 100, y: 0, fixed: false },
          { id: "B0", x: 500, y: 500, fixed: true },
          { id: "B1", x: 700, y: 500, fixed: false },
        ],
        constraints: [
          { id: "c_A_dist", type: "distance", entities: ["A0", "A1"], targetValue: 100, driving: true },
          { id: "c_A_horiz", type: "horizontal", entities: ["A0", "A1"], driving: true },
          { id: "c_B_dist", type: "distance", entities: ["B0", "B1"], targetValue: 200, driving: true },
          { id: "c_B_horiz", type: "horizontal", entities: ["B0", "B1"], driving: true },
        ],
        options: {
          partitionComponents: true,
        },
      };

      // Initial solve: both components solve
      const resInitial = await client.solve(twoComponentInput);
      expect(resInitial.converged).toBe(true);
      expect(resInitial.points.get("A1")!.x).toBeCloseTo(100, 6);
      expect(resInitial.points.get("B1")!.x).toBeCloseTo(700, 6);

      const b0_before = { ...resInitial.points.get("B0")! };
      const b1_before = { ...resInitial.points.get("B1")! };

      // Now mutate ONLY Component A: expand A distance from 100 to 250
      // Mark A1 as dirty
      const mutatedInput: UnifiedSolverInput = {
        points: [
          { id: "A0", x: 0, y: 0, fixed: true },
          { id: "A1", x: 100, y: 0, fixed: false },
          { id: "B0", x: b0_before.x, y: b0_before.y, fixed: true },
          { id: "B1", x: b1_before.x, y: b1_before.y, fixed: false },
        ],
        constraints: [
          { id: "c_A_dist", type: "distance", entities: ["A0", "A1"], targetValue: 250, driving: true },
          { id: "c_A_horiz", type: "horizontal", entities: ["A0", "A1"], driving: true },
          { id: "c_B_dist", type: "distance", entities: ["B0", "B1"], targetValue: 200, driving: true },
          { id: "c_B_horiz", type: "horizontal", entities: ["B0", "B1"], driving: true },
        ],
        options: {
          partitionComponents: true,
          dirtyEntityIds: ["A1"], // Only Component A is dirty!
        },
      };

      const resMutated = await client.solve(mutatedInput);
      expect(resMutated.converged).toBe(true);

      // Component A updated to 250 mm
      const a1_after = resMutated.points.get("A1")!;
      expect(a1_after.x).toBeCloseTo(250, 6);

      // Component B was NOT re-solved or perturbed: coordinates remain 100% bit-for-bit identical!
      const b0_after = resMutated.points.get("B0")!;
      const b1_after = resMutated.points.get("B1")!;

      expect(b0_after.x).toBe(b0_before.x);
      expect(b0_after.y).toBe(b0_before.y);
      expect(b1_after.x).toBe(b1_before.x);
      expect(b1_after.y).toBe(b1_before.y);
    });

    it("should solve Component A when dirtyEntityIds contains a modified constraint ID while keeping Component B 100% untouched", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      const twoComponentInput: UnifiedSolverInput = {
        points: [
          { id: "A0", x: 0, y: 0, fixed: true },
          { id: "A1", x: 100, y: 0, fixed: false },
          { id: "B0", x: 500, y: 500, fixed: true },
          { id: "B1", x: 700, y: 500, fixed: false },
        ],
        constraints: [
          { id: "c_A_dist", type: "distance", entities: ["A0", "A1"], targetValue: 300, driving: true },
          { id: "c_A_horiz", type: "horizontal", entities: ["A0", "A1"], driving: true },
          { id: "c_B_dist", type: "distance", entities: ["B0", "B1"], targetValue: 200, driving: true },
          { id: "c_B_horiz", type: "horizontal", entities: ["B0", "B1"], driving: true },
        ],
        options: {
          partitionComponents: true,
          dirtyEntityIds: ["c_A_dist"], // user marked constraint ID dirty
        },
      };

      const res = await client.solve(twoComponentInput);
      expect(res.converged).toBe(true);

      // Component A must be re-solved to 300 mm
      const a1 = res.points.get("A1")!;
      expect(a1.x).toBeCloseTo(300, 5);

      // Component B was not dirty, remains untouched
      const b0 = res.points.get("B0")!;
      const b1 = res.points.get("B1")!;
      expect(b0.x).toBe(500);
      expect(b0.y).toBe(500);
      expect(b1.x).toBe(700);
      expect(b1.y).toBe(500);
    });

    it("should partition 3 disjoint components and solve in isolation without cross-coupling", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      const threeComponentInput: UnifiedSolverInput = {
        points: [
          { id: "C1_p1", x: 0, y: 0, fixed: true },
          { id: "C1_p2", x: 50, y: 0 },
          { id: "C2_p1", x: 1000, y: 1000, fixed: true },
          { id: "C2_p2", x: 1000, y: 1050 },
          { id: "C3_p1", x: 5000, y: 5000, fixed: true },
          { id: "C3_p2", x: 5050, y: 5050 },
        ],
        constraints: [
          { id: "c1", type: "distance", entities: ["C1_p1", "C1_p2"], targetValue: 80, driving: true },
          { id: "c2", type: "distance", entities: ["C2_p1", "C2_p2"], targetValue: 120, driving: true },
          { id: "c3", type: "distance", entities: ["C3_p1", "C3_p2"], targetValue: 160, driving: true },
        ],
        options: {
          partitionComponents: true,
        },
      };

      const res = await client.solve(threeComponentInput);
      expect(res.converged).toBe(true);
      expect(res.components?.length).toBe(3);

      const d1 = Math.hypot(res.points.get("C1_p2")!.x - res.points.get("C1_p1")!.x, res.points.get("C1_p2")!.y - res.points.get("C1_p1")!.y);
      const d2 = Math.hypot(res.points.get("C2_p2")!.x - res.points.get("C2_p1")!.x, res.points.get("C2_p2")!.y - res.points.get("C2_p1")!.y);
      const d3 = Math.hypot(res.points.get("C3_p2")!.x - res.points.get("C3_p1")!.x, res.points.get("C3_p2")!.y - res.points.get("C3_p1")!.y);

      expect(d1).toBeCloseTo(80, 5);
      expect(d2).toBeCloseTo(120, 5);
      expect(d3).toBeCloseTo(160, 5);
    });
  });

  describe("Criterion 4: Temporary Drag Constraints in Preview Mode", () => {
    it("should solve drag preview smoothly and purge temporary constraints without polluting persistent topology", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Linkage with fixed length 100: P1 fixed at (0, 0), P2 at (100, 0)
      const persistentInput: UnifiedSolverInput = {
        points: [
          { id: "p1", x: 0, y: 0, fixed: true },
          { id: "p2", x: 100, y: 0, fixed: false },
        ],
        constraints: [
          { id: "c_len", type: "distance", entities: ["p1", "p2"], targetValue: 100, driving: true },
        ],
      };

      // 1. User initiates drag towards (0, 120)
      const previewRes = await client.solveDragPreview(persistentInput, [
        { entityId: "p2", targetX: 0, targetY: 120, weight: 1.0 },
      ]);

      expect(previewRes.converged).toBe(true);

      // Length must strictly remain 100
      const solvedP2 = previewRes.points.get("p2")!;
      const solvedLen = Math.hypot(solvedP2.x, solvedP2.y);
      expect(solvedLen).toBeCloseTo(100, 4);

      // P2 should rotate towards (0, 100)
      expect(solvedP2.x).toBeCloseTo(0, 1);
      expect(solvedP2.y).toBeCloseTo(100, 1);

      // 2. Commit or cancel: purge temporary drag constraints
      const committedInput = PlaneGcsClient.purgeTemporaryFromInput({
        ...persistentInput,
        constraints: [
          ...persistentInput.constraints,
          { id: "__drag_x_p2", type: "coordinate_x", entities: ["p2"], targetValue: 0, temporary: true },
          { id: "__drag_y_p2", type: "coordinate_y", entities: ["p2"], targetValue: 120, temporary: true },
        ],
      });

      // Persistent constraints must be pristine with 0 temporary constraints remaining
      expect(committedInput.constraints.length).toBe(1);
      expect(committedInput.constraints[0].id).toBe("c_len");
      expect(committedInput.constraints.some((c) => c.temporary)).toBe(false);
    });

    it("should penalize moving un-dragged geometry via Jacobian damping", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Free line segment from (10, 10) to (40, 10).
      // When P2 is dragged towards (60, 20), P1 should experience minimal drift.
      const unconstrainedLine: UnifiedSolverInput = {
        points: [
          { id: "pA", x: 10, y: 10, fixed: false },
          { id: "pB", x: 40, y: 10, fixed: false },
        ],
        constraints: [],
      };

      const dragRes = await client.solveDragPreview(unconstrainedLine, [
        { entityId: "pB", targetX: 60, targetY: 20 },
      ]);

      expect(dragRes.converged).toBe(true);
      const pB = dragRes.points.get("pB")!;
      expect(pB.x).toBeCloseTo(60, 1);
      expect(pB.y).toBeCloseTo(20, 1);

      const pA = dragRes.points.get("pA")!;
      expect(pA.x).toBeCloseTo(10, 1);
      expect(pA.y).toBeCloseTo(10, 1);
    });

    it("should converge smoothly under extreme drag displacement (cursor pulled 100,000 mm away) preserving persistent model constraints and residual tolerance", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Fixed-length linkage: Anchor at (0, 0), P2 at (100, 0)
      const input: UnifiedSolverInput = {
        points: [
          { id: "p1", x: 0, y: 0, fixed: true },
          { id: "p2", x: 100, y: 0, fixed: false },
        ],
        constraints: [
          { id: "c_len", type: "distance", entities: ["p1", "p2"], targetValue: 100, driving: true },
        ],
      };

      // Mouse cursor dragged to extreme coordinate (100000, 0)
      const dragRes = await client.solveDragPreview(input, [
        { entityId: "p2", targetX: 100000, targetY: 0 },
      ]);

      expect(dragRes.converged).toBe(true);

      // Persistent constraint distance must strictly remain 100 mm
      const p2 = dragRes.points.get("p2")!;
      const dist = Math.hypot(p2.x, p2.y);
      expect(dist).toBeCloseTo(100, 5);

      // Residual norm must evaluate ONLY persistent model constraints, strictly <= 1e-8 mm
      expect(dragRes.residualNorm).toBeLessThanOrEqual(1e-8);
      expect(dragRes.maxResidual).toBeLessThanOrEqual(1e-8);
    });
  });

  describe("Criterion 5: Clean Routing of Unsupported Constraints to Fallback", () => {
    it("should identify unsupported constraints and route cleanly to TS DogLeg solver with explicit provenance", async () => {
      const client = new PlaneGcsClient();

      // Input containing custom non-linear constraint: chamfer_equal_leg & haunch_45
      const customInput: UnifiedSolverInput = {
        points: [
          { id: "h1", x: 0, y: 0, fixed: true },
          { id: "h2", x: 50, y: 50, fixed: false },
        ],
        constraints: [
          {
            id: "c_haunch",
            type: "haunch_45",
            entities: ["h1", "h2"],
            targetValue: 35,
            driving: true,
            signX: 1,
            signY: 1,
          },
        ],
        options: {
          partitionComponents: false,
          algorithm: "DogLeg",
        },
      };

      expect(isPlaneGcsSupportedConstraint(customInput.constraints[0])).toBe(false);

      const res = await client.solve(customInput);
      expect(res.converged).toBe(true);
      expect(res.provenance).toBe("dogleg_ts");
      expect(res.diagnostics.routingReason).toContain("unsupported_constraint_types");

      // Verify haunch solved: dx = 35, dy = 35
      const h2 = res.points.get("h2")!;
      expect(h2.x).toBeCloseTo(35, 5);
      expect(h2.y).toBeCloseTo(35, 5);
    });

    it("should route to TS Levenberg-Marquardt solver when algorithm is set to LevenbergMarquardt", async () => {
      const client = new PlaneGcsClient();

      const customInput: UnifiedSolverInput = {
        points: [
          { id: "pA", x: 0, y: 0, fixed: true },
          { id: "pB", x: 10, y: 0, fixed: false },
          { id: "pC", x: 10, y: 5, fixed: false },
        ],
        constraints: [
          {
            id: "c_wall",
            type: "wall_thickness_offset",
            entities: ["pA", "pB", "pC"],
            targetValue: 25,
            driving: true,
          },
        ],
        options: {
          partitionComponents: false,
          algorithm: "LevenbergMarquardt",
        },
      };

      const res = await client.solve(customInput);
      expect(res.converged).toBe(true);
      expect(res.provenance).toBe("lm_ts");
      expect(res.diagnostics.routingReason).toContain("unsupported_constraint_types");
    });

    it("should route single-cell culvert domain requests to analytical_culvert with explicit provenance", async () => {
      const client = new PlaneGcsClient();

      const culvertInput: UnifiedSolverInput = {
        points: [],
        constraints: [],
        options: {
          useAnalyticalDomainLayer: true,
          domainContext: {
            type: "single_cell_culvert",
            config: { clearSpan: 300, clearHeight: 250, wallThickness: 30, haunchLeg: 35 },
            targetSpan: 500,
          },
        },
      };

      const res = await client.solve(culvertInput);
      expect(res.converged).toBe(true);
      expect(res.provenance).toBe("analytical_culvert");
      expect(res.points.size).toBe(12);
      expect(res.residualNorm).toBeLessThan(1e-8);
    });

    it("should route arbitrary unknown custom non-linear constraints to TS fallback via allowlist check", async () => {
      const client = new PlaneGcsClient();

      const unknownInput: UnifiedSolverInput = {
        points: [
          { id: "p1", x: 0, y: 0, fixed: true },
          { id: "p2", x: 10, y: 0, fixed: false },
        ],
        constraints: [
          {
            id: "c_custom",
            type: "arbitrary_custom_non_linear_law",
            entities: ["p1", "p2"],
            targetValue: 45,
            driving: true,
          },
        ],
        options: {
          partitionComponents: false,
          algorithm: "DogLeg",
        },
      };

      // Must be rejected by PlaneGCS allowlist
      expect(isPlaneGcsSupportedConstraint(unknownInput.constraints[0])).toBe(false);

      const res = await client.solve(unknownInput);
      expect(res.converged).toBe(true);
      expect(res.provenance).toBe("dogleg_ts");
      expect(res.diagnostics.routingReason).toContain("unsupported_constraint_types");
      expect(res.points.get("p2")!.x).toBeCloseTo(45, 4);
    });

    it("should map midpoint constraints accurately across both PlaneGCS and TS fallback", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // PlaneGCS solve: segment P1(0, 0) to P2(100, 0), midpoint M at (50, 0)
      const midpointWasmInput: UnifiedSolverInput = {
        points: [
          { id: "P1", x: 0, y: 0, fixed: true },
          { id: "P2", x: 100, y: 0, fixed: true },
          { id: "M", x: 20, y: 10, fixed: false },
        ],
        lines: [{ id: "L1", p1Id: "P1", p2Id: "P2" }],
        constraints: [
          { id: "c_mid", type: "midpoint", entities: ["M", "L1"], driving: true },
        ],
        options: { partitionComponents: false },
      };

      const wasmRes = await client.solve(midpointWasmInput);
      expect(wasmRes.converged).toBe(true);
      const mPt = wasmRes.points.get("M")!;
      expect(mPt.x).toBeCloseTo(50, 4);
      expect(mPt.y).toBeCloseTo(0, 4);

      // TS Fallback solve: segment P1(10, 20) to P2(70, 80), midpoint M at (40, 50)
      const midpointTsInput: UnifiedSolverInput = {
        points: [
          { id: "P1", x: 10, y: 20, fixed: true },
          { id: "P2", x: 70, y: 80, fixed: true },
          { id: "M", x: 0, y: 0, fixed: false },
        ],
        constraints: [
          {
            id: "c_mid_ts",
            type: "midpoint",
            entities: ["M", "P1", "P2"],
            driving: true,
          },
          // Trigger TS fallback by adding custom constraint
          {
            id: "c_force_ts",
            type: "chamfer_equal_leg",
            entities: ["P1", "P2", "P1", "P2"],
            driving: false,
          },
        ],
        options: {
          partitionComponents: false,
          algorithm: "DogLeg",
        },
      };

      const tsRes = await (client as any).solveWithTsFallback(midpointTsInput);
      expect(tsRes.converged).toBe(true);
      expect(tsRes.provenance).toBe("dogleg_ts");
      const mTs = tsRes.points.get("M")!;
      expect(mTs.x).toBeCloseTo(40, 5);
      expect(mTs.y).toBeCloseTo(50, 5);
    });

    it("should map point-to-line distance and tangency constraints accurately across both PlaneGCS and TS fallback", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Line along X axis: P1(0, 0) to P2(100, 0). Point P(50, 20).
      // p2l_distance constraint to line = 40 mm.
      const p2lInput: UnifiedSolverInput = {
        points: [
          { id: "p1", x: 0, y: 0, fixed: true },
          { id: "p2", x: 100, y: 0, fixed: true },
          { id: "pTest", x: 50, y: 20, fixed: false },
        ],
        lines: [{ id: "lineX", p1Id: "p1", p2Id: "p2" }],
        constraints: [
          { id: "c_p2l", type: "p2l_distance", entities: ["pTest", "lineX"], targetValue: 40, driving: true },
          { id: "c_x_fix", type: "coordinate_x", entities: ["pTest"], targetValue: 50, driving: true },
        ],
        options: { partitionComponents: false },
      };

      const wasmRes = await client.solve(p2lInput);
      expect(wasmRes.converged).toBe(true);
      const pTest = wasmRes.points.get("pTest")!;
      expect(pTest.x).toBeCloseTo(50, 4);
      expect(Math.abs(pTest.y)).toBeCloseTo(40, 4);

      // Tangency line to circle in TS fallback
      const tangentInput: UnifiedSolverInput = {
        points: [
          { id: "pL1", x: 0, y: 50, fixed: true },
          { id: "pL2", x: 100, y: 50, fixed: true },
          { id: "pCenter", x: 50, y: 10, fixed: false },
        ],
        lines: [{ id: "lTangent", p1Id: "pL1", p2Id: "pL2" }],
        circles: [{ id: "c1", centerId: "pCenter", radius: 25 }],
        constraints: [
          { id: "c_tan", type: "tangent", entities: ["lTangent", "c1"], driving: true },
          { id: "c_cx", type: "coordinate_x", entities: ["pCenter"], targetValue: 50, driving: true },
        ],
        options: { partitionComponents: false, algorithm: "DogLeg" },
      };

      const tsTanRes = await (client as any).solveWithTsFallback(tangentInput);
      expect(tsTanRes.converged).toBe(true);
      const centerPt = tsTanRes.points.get("pCenter")!;
      expect(centerPt.x).toBeCloseTo(50, 4);
      // Distance from center (50, y) to line y = 50 must be radius 25 => y = 25 or 75
      expect(Math.abs(50 - centerPt.y)).toBeCloseTo(25, 4);
    });
  });

  describe("Criterion 6: Deterministic Fixture Replay & Numeric Tolerance Reporting", () => {
    it("should prove bit-for-bit identical coordinates and residuals across multiple replay runs", async () => {
      const replayer = new FixtureReplayer();

      const spanSweep = [300, 350, 400, 450, 500, 450, 300];

      const report = await replayer.replayParameterSweep(
        (span) => createThreeCellCulvertFixture(span, 1500, 250),
        "three_cell_culvert_sweep",
        "clearSpan",
        spanSweep,
        2 // 2 complete sweep runs
      );

      expect(report.allPassed).toBe(true);
      expect(report.totalSweeps).toBe(14); // 7 * 2
      expect(report.bitForBitIdentical).toBe(true);
      expect(report.maxObservedResidual).toBeLessThanOrEqual(1e-8);

      // Verify each entry in the tolerance report
      for (const entry of report.entries) {
        expect(entry.passed).toBe(true);
        expect(entry.status).toBe("converged");
        expect(entry.residualNorm).toBeLessThanOrEqual(1e-8);
        expect(entry.maxResidual).toBeLessThanOrEqual(1e-8);
      }
    });

    it("should replay 4-bar linkage crank angle rotation sweep deterministically", async () => {
      const replayer = new FixtureReplayer();

      const crankXs = [10, 30, 50, 70, 50, 30, 10];

      const report = await replayer.replayParameterSweep(
        (crankX) => createFourBarLinkageFixture(100, 160, 130, 190, crankX),
        "four_bar_linkage_sweep",
        "crankX",
        crankXs,
        2
      );

      expect(report.allPassed).toBe(true);
      expect(report.bitForBitIdentical).toBe(true);
      expect(report.maxObservedResidual).toBeLessThanOrEqual(1e-8);
    });
  });

  describe("Criterion 7: Multi-Solver Benchmark Comparison", () => {
    it("should run full benchmark suite comparing PlaneGCS WASM, DogLeg, LM, and Analytical Culvert", async () => {
      const suiteResult = await runSolverBenchmark(10);

      expect(suiteResult.results.length).toBeGreaterThanOrEqual(10);
      expect(suiteResult.summary.totalFixturesBenchmarked).toBe(3);

      // Confirm all warm solves are strictly under 5 ms
      expect(suiteResult.summary.allWarmSolvesUnder5ms).toBe(true);
      expect(suiteResult.summary.wasmWarmSolveAvgMs).toBeLessThan(5.0);
      expect(suiteResult.summary.doglegWarmSolveAvgMs).toBeLessThan(5.0);
      expect(suiteResult.summary.lmWarmSolveAvgMs).toBeLessThan(5.0);
      expect(suiteResult.summary.analyticalWarmSolveAvgMs).toBeLessThan(5.0);

      // Verify all solvers achieved convergence
      for (const metric of suiteResult.results) {
        expect(metric.converged).toBe(true);
        expect(metric.warmSolveLatencyMs).toBeLessThan(5.0);
      }
    });

    it("should profile single solver configurations with structured latency diagnostics", async () => {
      const runner = new SolverBenchmarkRunner();

      const wasmMetric = await runner.profileSolver(
        "planegcs_wasm",
        "3_cell_culvert",
        createThreeCellCulvertFixture(2200, 1600, 250),
        10
      );

      expect(wasmMetric.solver).toBe("planegcs_wasm");
      expect(wasmMetric.converged).toBe(true);
      expect(wasmMetric.warmSolveLatencyMs).toBeLessThan(5.0);
      expect(wasmMetric.coldSolveLatencyMs).toBeGreaterThan(0);
      expect(wasmMetric.initLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should serialize concurrent solve calls safely without WASM memory corruption or race conditions", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Launch 10 concurrent solve requests across distinct fixture instances
      const promises = [
        client.solve(createThreeCellCulvertFixture(1800, 1200, 200)),
        client.solve(createFourBarLinkageFixture(100, 150, 120, 180, 25)),
        client.solve(createRailingRunFixture(2500, 5, 900)),
        client.solve(createThreeCellCulvertFixture(2200, 1400, 250)),
        client.solve(createFourBarLinkageFixture(110, 160, 130, 190, 45)),
        client.solve(createRailingRunFixture(3200, 7, 1100)),
        client.solve(createThreeCellCulvertFixture(2400, 1600, 250)),
        client.solve(createFourBarLinkageFixture(95, 145, 115, 175, 60)),
        client.solve(createRailingRunFixture(2800, 6, 1000)),
        client.solve(createThreeCellCulvertFixture(2000, 1500, 250)),
      ];

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      for (const res of results) {
        expect(res.converged).toBe(true);
        expect(res.residualNorm).toBeLessThanOrEqual(1e-8);
      }
    });
  });
});
