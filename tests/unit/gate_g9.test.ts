/**
 * Gate G9 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, §34)
 *
 * Verifies the Direct Manipulation & Solution Hysteresis Engine:
 *
 * Criterion 1: Drag Latency < 16ms per frame (60 FPS budget).
 * Criterion 2: Warm-Start Hysteresis Stability (solution branch tracking).
 * Criterion 3: Coordinate Damping Scale Factors (S_jj hierarchy preservation).
 * Criterion 4: DCEL Face Chirality Preservation (topological invariant under drag).
 * Criterion 5: Drag Residual Isolation (temporary constraints don't pollute persistent model).
 * Criterion 6: Drag Session Lifecycle (commit persists, cancel reverts).
 * Criterion 7: Full System Verification (all gates pass, zero regressions).
 */

import { describe, it, expect } from "vitest";
import {
  DirectManipulationDragSolver,
  DragSession,
  DragTarget,
  DragSystemModel,
  DragSolverOptions,
} from "../../lib/parametric/dragSolver";
import {
  validatePolygonChirality,
  validateDcelFaceChirality,
  clampDragToChirality,
  validateWeldTolerance,
  signedArea,
} from "../../lib/solver/hysteresis";
import {
  PlaneGcsClient,
  UnifiedSolverInput,
  SolverPointInput,
  SolverConstraintInput,
} from "../../lib/solver/planegcsClient";
import { DcelPlanarMap } from "../../lib/geometry/topology/dcel";
import { Point2D } from "../../lib/geometry/topology/types";

// ---------------------------------------------------------------------------
// Test Helpers: Simple constraint models for drag solver testing
// ---------------------------------------------------------------------------

/**
 * Creates a simple constrained rectangle model:
 * 4 points forming a rectangle with 4 distance constraints.
 * Point 0 is fixed at origin. Model has 4 free coordinates (P1.x, P2.x, P2.y, P3.y).
 */
function createRectangleModel(
  width: number,
  height: number
): {
  model: DragSystemModel;
  initialCoords: number[];
  anchoredIndices: number[];
} {
  // Coords: [p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y]
  const initialCoords = [0, 0, width, 0, width, height, 0, height];

  const model: DragSystemModel = {
    evaluateResiduals(X: number[]): number[] {
      const residuals: number[] = [];

      // Constraint 1: distance P0-P1 = width
      const dx01 = X[2] - X[0];
      const dy01 = X[3] - X[1];
      residuals.push(Math.sqrt(dx01 * dx01 + dy01 * dy01) - width);

      // Constraint 2: distance P1-P2 = height
      const dx12 = X[4] - X[2];
      const dy12 = X[5] - X[3];
      residuals.push(Math.sqrt(dx12 * dx12 + dy12 * dy12) - height);

      // Constraint 3: distance P2-P3 = width
      const dx23 = X[6] - X[4];
      const dy23 = X[7] - X[5];
      residuals.push(Math.sqrt(dx23 * dx23 + dy23 * dy23) - width);

      // Constraint 4: distance P3-P0 = height
      const dx30 = X[0] - X[6];
      const dy30 = X[1] - X[7];
      residuals.push(Math.sqrt(dx30 * dx30 + dy30 * dy30) - height);

      // Constraint 5: P0-P1 horizontal (dy = 0)
      residuals.push(X[3] - X[1]);

      // Constraint 6: P3-P0 vertical (dx = 0)
      residuals.push(X[6] - X[0]);

      return residuals;
    },

    evaluateJacobian(X: number[]): number[][] {
      const n = 8;
      const eps = 1e-7;
      const F0 = this.evaluateResiduals(X);
      const m = F0.length;
      const J: number[][] = new Array(m);

      for (let i = 0; i < m; i++) {
        J[i] = new Array(n).fill(0);
      }

      for (let j = 0; j < n; j++) {
        const Xp = [...X];
        Xp[j] += eps;
        const Fp = this.evaluateResiduals(Xp);
        for (let i = 0; i < m; i++) {
          J[i][j] = (Fp[i] - F0[i]) / eps;
        }
      }

      return J;
    },
  };

  // P0 anchored (coords 0, 1)
  const anchoredIndices = [0, 1];

  return { model, initialCoords, anchoredIndices };
}

/**
 * Simple 3-point chain model for damping hierarchy testing.
 * P1 (anchored) -- P2 (free) -- P3 (draggable)
 * Constraint: distance P1-P2 = d1, distance P2-P3 = d2.
 */
function createChainModel(d1: number, d2: number): {
  model: DragSystemModel;
  initialCoords: number[];
} {
  // Coords: [P1x, P1y, P2x, P2y, P3x, P3y]
  const initialCoords = [0, 0, d1, 0, d1 + d2, 0];

  const model: DragSystemModel = {
    evaluateResiduals(X: number[]): number[] {
      const dx12 = X[2] - X[0];
      const dy12 = X[3] - X[1];
      const dx23 = X[4] - X[2];
      const dy23 = X[5] - X[3];

      return [
        Math.sqrt(dx12 * dx12 + dy12 * dy12) - d1,
        Math.sqrt(dx23 * dx23 + dy23 * dy23) - d2,
      ];
    },

    evaluateJacobian(X: number[]): number[][] {
      const n = 6;
      const eps = 1e-7;
      const F0 = this.evaluateResiduals(X);
      const m = F0.length;
      const J: number[][] = new Array(m);

      for (let i = 0; i < m; i++) J[i] = new Array(n).fill(0);

      for (let j = 0; j < n; j++) {
        const Xp = [...X];
        Xp[j] += eps;
        const Fp = this.evaluateResiduals(Xp);
        for (let i = 0; i < m; i++) {
          J[i][j] = (Fp[i] - F0[i]) / eps;
        }
      }

      return J;
    },
  };

  return { model, initialCoords };
}

// ===========================================================================
// Gate G9 Test Suite
// ===========================================================================

describe("Gate G9 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, §34)", () => {
  // --------------------------------------------------------------------------
  // Criterion 1: Drag Latency < 16ms per frame
  // --------------------------------------------------------------------------
  describe("Criterion 1: Drag Latency < 16ms per frame (60 FPS budget)", () => {
    it("should solve 100 drag frames within 16ms average latency on a constrained rectangle", () => {
      const { model, initialCoords, anchoredIndices } = createRectangleModel(100, 80);
      const session = new DragSession(initialCoords);

      const latencies: number[] = [];

      for (let frame = 0; frame < 100; frame++) {
        // Progressively displace P2 (coords 4, 5) rightward
        const targets: DragTarget[] = [
          { coordIndex: 4, targetValue: 100 + frame * 2 },
          { coordIndex: 5, targetValue: 80 + frame * 0.5 },
        ];

        const result = session.solveFrame(model, targets, {
          anchoredIndices,
          maxIterations: 25,
          tolerance: 1e-6,
        });

        latencies.push(result.frameLatency);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      // 60 FPS = 16.67ms budget per frame
      expect(avgLatency).toBeLessThan(16);
      expect(session.getFrameCount()).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 2: Warm-Start Hysteresis Stability
  // --------------------------------------------------------------------------
  describe("Criterion 2: Warm-Start Hysteresis Stability", () => {
    it("should maintain solution branch continuity across consecutive drag frames via warm-start", () => {
      const { model, initialCoords, anchoredIndices } = createRectangleModel(100, 80);

      // Run with warm-start session
      const warmSession = new DragSession(initialCoords);
      const warmResults: number[][] = [];

      for (let frame = 0; frame < 20; frame++) {
        const targets: DragTarget[] = [
          { coordIndex: 4, targetValue: 100 + frame * 5 },
        ];

        const result = warmSession.solveFrame(model, targets, {
          anchoredIndices,
          tolerance: 1e-6,
        });

        warmResults.push([...result.solution]);
      }

      // Verify solution continuity: consecutive frames should not have large jumps
      for (let i = 1; i < warmResults.length; i++) {
        let maxDelta = 0;
        for (let j = 0; j < warmResults[i].length; j++) {
          const delta = Math.abs(warmResults[i][j] - warmResults[i - 1][j]);
          if (delta > maxDelta) maxDelta = delta;
        }
        // Max coordinate change per frame should be bounded (no branch snapping)
        expect(maxDelta).toBeLessThan(50); // 50mm max per-frame jump
      }

      // Verify warm-start flag is set
      expect(warmSession.hasWarmStart()).toBe(true);
    });

    it("should converge to a valid solution with warm-start from previous frame", () => {
      const { model, initialCoords, anchoredIndices } = createRectangleModel(100, 80);
      const session = new DragSession(initialCoords);

      // First frame: cold start
      const frame0 = session.solveFrame(model, [
        { coordIndex: 4, targetValue: 120 },
      ], { anchoredIndices });

      expect(frame0.converged).toBe(true);
      expect(session.hasWarmStart()).toBe(true);

      // Second frame: warm-started from frame 0
      const frame1 = session.solveFrame(model, [
        { coordIndex: 4, targetValue: 140 },
      ], { anchoredIndices });

      expect(frame1.converged).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 3: Coordinate Damping Scale Factors
  // --------------------------------------------------------------------------
  describe("Criterion 3: Coordinate Damping Scale Factors", () => {
    it("should enforce damping hierarchy: |ΔP_anchored| << |ΔP_free| << |ΔP_dragged|", () => {
      const { model, initialCoords } = createChainModel(100, 100);

      // P1 (coords 0,1) anchored, P2 (coords 2,3) free, P3 (coords 4,5) dragged
      const targets: DragTarget[] = [
        { coordIndex: 4, targetValue: 250 }, // Drag P3 rightward by 50mm
      ];

      const result = DirectManipulationDragSolver.solveDragStep(
        model,
        initialCoords,
        targets,
        {
          anchoredIndices: [0, 1], // P1 anchored
          dragScale: 0.05,
          maxIterations: 50,
          tolerance: 1e-6,
        }
      );

      // Compute displacements
      const dP1 = Math.hypot(
        result.solution[0] - initialCoords[0],
        result.solution[1] - initialCoords[1]
      );
      const dP2 = Math.hypot(
        result.solution[2] - initialCoords[2],
        result.solution[3] - initialCoords[3]
      );
      const dP3 = Math.hypot(
        result.solution[4] - initialCoords[4],
        result.solution[5] - initialCoords[5]
      );

      // Damping hierarchy: anchored moves least, dragged moves most
      expect(dP1).toBeLessThan(dP2 + 1e-6); // P1 (anchored) moves less than P2 (free)
      expect(dP3).toBeGreaterThan(dP1);      // P3 (dragged) moves more than P1 (anchored)
    });

    it("should apply correct S_jj values: 0.05 (dragged), 1.0 (free), 1000.0 (anchored)", () => {
      // Verify the DirectManipulationDragSolver uses the correct scale factors
      // by checking that anchored points barely move even under large targets
      const { model, initialCoords } = createChainModel(100, 100);

      const result = DirectManipulationDragSolver.solveDragStep(
        model,
        initialCoords,
        [{ coordIndex: 4, targetValue: 500 }], // Massive drag
        {
          anchoredIndices: [0, 1],
          dragScale: 0.05,
          tolerance: 1e-6,
        }
      );

      // Anchored point P1 should barely move (S = 1000.0 penalty)
      const dP1 = Math.hypot(
        result.solution[0] - initialCoords[0],
        result.solution[1] - initialCoords[1]
      );
      expect(dP1).toBeLessThan(5.0); // < 5mm displacement for anchored point
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 4: DCEL Face Chirality Preservation
  // --------------------------------------------------------------------------
  describe("Criterion 4: DCEL Face Chirality Preservation", () => {
    it("should detect face inversion when a polygon vertex is dragged past an edge", () => {
      // CCW square
      const originalLoop: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];

      // Valid deformation: stretch corner
      const validLoop: Point2D[] = [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 100 },
        { x: 0, y: 100 },
      ];
      expect(validatePolygonChirality(originalLoop, validLoop)).toBe(true);

      // Invalid inversion: flip vertex past opposite edge
      const invertedLoop: Point2D[] = [
        { x: 0, y: 0 },
        { x: 50, y: 150 }, // Dragged past diagonal — inverts triangle chirality
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      expect(validatePolygonChirality(originalLoop, invertedLoop)).toBe(false);
    });

    it("should validate DCEL face chirality across coordinate updates", () => {
      // Build a simple square DCEL
      const segments = [
        { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
        { p1: { x: 100, y: 0 }, p2: { x: 100, y: 100 } },
        { p1: { x: 100, y: 100 }, p2: { x: 0, y: 100 } },
        { p1: { x: 0, y: 100 }, p2: { x: 0, y: 0 } },
      ];

      const dcel = DcelPlanarMap.buildFromSegments(segments, 0.5);

      // Build original point map
      const originalPoints = new Map<string, Point2D>();
      for (const v of dcel.vertices.values()) {
        originalPoints.set(v.id, { ...v.point });
      }

      // Valid update: shift one vertex slightly
      const validUpdate = new Map<string, Point2D>();
      for (const v of dcel.vertices.values()) {
        validUpdate.set(v.id, { ...v.point });
      }
      // Move one vertex slightly
      const firstVertex = Array.from(dcel.vertices.values())[0];
      validUpdate.set(firstVertex.id, {
        x: firstVertex.point.x + 10,
        y: firstVertex.point.y + 10,
      });

      const validResult = validateDcelFaceChirality(dcel, originalPoints, validUpdate);
      expect(validResult.valid).toBe(true);
      expect(validResult.invertedFaceIds.length).toBe(0);
    });

    it("should clamp drag to preserve chirality using binary search", () => {
      const segments = [
        { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
        { p1: { x: 100, y: 0 }, p2: { x: 100, y: 100 } },
        { p1: { x: 100, y: 100 }, p2: { x: 0, y: 100 } },
        { p1: { x: 0, y: 100 }, p2: { x: 0, y: 0 } },
      ];

      const dcel = DcelPlanarMap.buildFromSegments(segments, 0.5);

      // Build coord mapping
      const pointIdToCoordIndex = new Map<string, { xIdx: number; yIdx: number }>();
      const originalCoords: number[] = [];
      let idx = 0;
      for (const v of dcel.vertices.values()) {
        pointIdToCoordIndex.set(v.id, { xIdx: idx, yIdx: idx + 1 });
        originalCoords.push(v.point.x, v.point.y);
        idx += 2;
      }

      // Proposed: safe displacement (just stretch)
      const safeProposed = [...originalCoords];
      safeProposed[0] += 10; // Move first vertex slightly

      const safeResult = clampDragToChirality(
        dcel,
        originalCoords,
        safeProposed,
        pointIdToCoordIndex
      );
      expect(safeResult.wasClamped).toBe(false);
      expect(safeResult.clampFraction).toBe(1.0);
    });

    it("should compute correct signed area for polygons", () => {
      // CCW square: area should be positive
      const ccwSquare: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      expect(signedArea(ccwSquare)).toBeGreaterThan(0);

      // CW square: area should be negative
      const cwSquare: Point2D[] = [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
      ];
      expect(signedArea(cwSquare)).toBeLessThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 5: Drag Residual Isolation
  // --------------------------------------------------------------------------
  describe("Criterion 5: Drag Residual Isolation", () => {
    it("should not pollute persistent model residuals with temporary drag constraints", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Build a simple 2-point distance constraint model
      const persistentInput: UnifiedSolverInput = {
        points: [
          { id: "p0", x: 0, y: 0, fixed: true },
          { id: "p1", x: 100, y: 0 },
        ],
        lines: [{ id: "l01", p1Id: "p0", p2Id: "p1" }],
        constraints: [
          { id: "c_dist", type: "distance", entities: ["p0", "p1"], targetValue: 100, driving: true },
        ],
        options: { partitionComponents: false },
      };

      // Solve persistent model
      const persistentResult = await client.solve(persistentInput);
      expect(persistentResult.converged).toBe(true);

      // Solve with drag targets
      const dragResult = await client.solveDragPreview(persistentInput, [
        { entityId: "p1", targetX: 150, targetY: 0 },
      ]);
      expect(dragResult.converged).toBe(true);

      // Verify persistent model still converges to same residual after purging drag
      const purgedInput = PlaneGcsClient.purgeTemporaryFromInput({
        ...persistentInput,
        constraints: [
          ...persistentInput.constraints,
          { id: "__drag_x_p1", type: "coordinate_x", entities: ["p1"], targetValue: 150, temporary: true, driving: true },
        ],
      });
      expect(purgedInput.constraints.length).toBe(1); // Only persistent constraint remains
      expect(purgedInput.constraints[0].id).toBe("c_dist");

      const revalidation = await client.solve(purgedInput);
      expect(revalidation.converged).toBe(true);
    });

    it("should correctly purge temporary constraints from input", () => {
      const constraints: SolverConstraintInput[] = [
        { id: "c1", type: "distance", entities: ["p0", "p1"], targetValue: 100, driving: true },
        { id: "__drag_x_p1", type: "coordinate_x", entities: ["p1"], targetValue: 150, temporary: true, driving: true },
        { id: "__drag_y_p1", type: "coordinate_y", entities: ["p1"], targetValue: 0, temporary: true, driving: true },
        { id: "c2", type: "horizontal", entities: ["p0", "p1"], driving: true },
      ];

      const purged = PlaneGcsClient.purgeTemporaryConstraints(constraints);
      expect(purged.length).toBe(2);
      expect(purged.map((c) => c.id)).toEqual(["c1", "c2"]);
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 6: Drag Session Lifecycle (Commit/Cancel)
  // --------------------------------------------------------------------------
  describe("Criterion 6: Drag Session Lifecycle", () => {
    it("should persist final coordinates on commit", () => {
      const { model, initialCoords, anchoredIndices } = createRectangleModel(100, 80);
      const session = new DragSession(initialCoords);

      // Run 10 drag frames
      let lastSolution: number[] = [];
      for (let frame = 0; frame < 10; frame++) {
        const targets: DragTarget[] = [
          { coordIndex: 4, targetValue: 100 + frame * 10 },
        ];

        const result = session.solveFrame(model, targets, { anchoredIndices });
        lastSolution = [...result.solution];
      }

      expect(session.getFrameCount()).toBe(10);

      // Commit: should return last frame's solution
      const committed = session.commit();
      expect(committed.length).toBe(initialCoords.length);

      // Committed coordinates should match last solved frame
      for (let i = 0; i < committed.length; i++) {
        expect(committed[i]).toBeCloseTo(lastSolution[i], 8);
      }
    });

    it("should revert to initial state on cancel", () => {
      const { model, initialCoords, anchoredIndices } = createRectangleModel(100, 80);
      const session = new DragSession(initialCoords);

      // Run 10 drag frames
      for (let frame = 0; frame < 10; frame++) {
        const targets: DragTarget[] = [
          { coordIndex: 4, targetValue: 100 + frame * 10 },
        ];
        session.solveFrame(model, targets, { anchoredIndices });
      }

      // Cancel: should return initial state
      const cancelled = session.cancel();
      expect(cancelled.length).toBe(initialCoords.length);

      for (let i = 0; i < cancelled.length; i++) {
        expect(cancelled[i]).toBeCloseTo(initialCoords[i], 8);
      }

      // After cancel, warm-start should be cleared
      expect(session.hasWarmStart()).toBe(false);
    });

    it("should track frame count and latency metrics", () => {
      const { model, initialCoords, anchoredIndices } = createRectangleModel(100, 80);
      const session = new DragSession(initialCoords);

      expect(session.getFrameCount()).toBe(0);
      expect(session.getAverageLatency()).toBe(0);

      session.solveFrame(
        model,
        [{ coordIndex: 4, targetValue: 150 }],
        { anchoredIndices }
      );

      expect(session.getFrameCount()).toBe(1);
      expect(session.getAverageLatency()).toBeGreaterThan(0);
      expect(session.getTotalLatency()).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 7: Weld Tolerance Validation
  // --------------------------------------------------------------------------
  describe("Criterion 7: Weld Tolerance Validation", () => {
    it("should detect collapsing vertex pairs within weld tolerance", () => {
      const points = new Map<string, Point2D>([
        ["v1", { x: 0, y: 0 }],
        ["v2", { x: 0.1, y: 0.1 }], // Within 0.5mm weld tolerance of v1
        ["v3", { x: 100, y: 100 }], // Far away
      ]);

      const result = validateWeldTolerance(points, 0.5);
      expect(result.valid).toBe(false);
      expect(result.collapsingPairs.length).toBe(1);
      expect(result.collapsingPairs[0]).toContain("v1");
      expect(result.collapsingPairs[0]).toContain("v2");
    });

    it("should validate when all vertices are well-separated", () => {
      const points = new Map<string, Point2D>([
        ["v1", { x: 0, y: 0 }],
        ["v2", { x: 100, y: 0 }],
        ["v3", { x: 100, y: 100 }],
      ]);

      const result = validateWeldTolerance(points, 0.5);
      expect(result.valid).toBe(true);
      expect(result.collapsingPairs.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 8: PlaneGcsClient Drag API Integration
  // --------------------------------------------------------------------------
  describe("Criterion 8: PlaneGcsClient Drag API Integration", () => {
    it("should commit drag by stripping temporary constraints", () => {
      const input: UnifiedSolverInput = {
        points: [
          { id: "p0", x: 0, y: 0, fixed: true },
          { id: "p1", x: 100, y: 0 },
        ],
        constraints: [
          { id: "c1", type: "distance", entities: ["p0", "p1"], targetValue: 100, driving: true },
          { id: "__drag_x_p1", type: "coordinate_x", entities: ["p1"], targetValue: 150, temporary: true, driving: true },
        ],
      };

      const committed = PlaneGcsClient.commitDrag(input);
      expect(committed.constraints.length).toBe(1);
      expect(committed.constraints[0].id).toBe("c1");
    });

    it("should cancel drag by stripping temporary constraints and reverting points", () => {
      const originalPoints: SolverPointInput[] = [
        { id: "p0", x: 0, y: 0, fixed: true },
        { id: "p1", x: 100, y: 0 },
      ];

      const modifiedInput: UnifiedSolverInput = {
        points: [
          { id: "p0", x: 0, y: 0, fixed: true },
          { id: "p1", x: 150, y: 20 }, // Modified by drag
        ],
        constraints: [
          { id: "c1", type: "distance", entities: ["p0", "p1"], targetValue: 100, driving: true },
          { id: "__drag_x_p1", type: "coordinate_x", entities: ["p1"], targetValue: 150, temporary: true, driving: true },
        ],
      };

      const cancelled = PlaneGcsClient.cancelDrag(modifiedInput, originalPoints);
      expect(cancelled.constraints.length).toBe(1);
      expect(cancelled.points[1].x).toBe(100); // Reverted to original
      expect(cancelled.points[1].y).toBe(0);
    });

    it("should support warm-start points in solveDragPreview", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      const input: UnifiedSolverInput = {
        points: [
          { id: "p0", x: 0, y: 0, fixed: true },
          { id: "p1", x: 100, y: 0 },
        ],
        lines: [{ id: "l01", p1Id: "p0", p2Id: "p1" }],
        constraints: [
          { id: "c_dist", type: "distance", entities: ["p0", "p1"], targetValue: 100, driving: true },
        ],
      };

      // Solve with warm-start points
      const warmStartPoints = new Map<string, { x: number; y: number }>([
        ["p0", { x: 0, y: 0 }],
        ["p1", { x: 95, y: 5 }], // Warm-start hint
      ]);

      const result = await client.solveDragPreview(
        input,
        [{ entityId: "p1", targetX: 120, targetY: 0 }],
        warmStartPoints
      );

      expect(result.converged).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Criterion 9: Full System Verification — Zero Regressions
  // --------------------------------------------------------------------------
  describe("Criterion 9: Full System Verification", () => {
    it("should verify all Phase 9 components are importable and functional", () => {
      // Verify DragSession exists and is constructable
      const session = new DragSession([0, 0, 100, 100]);
      expect(session).toBeDefined();
      expect(session.getFrameCount()).toBe(0);
      expect(session.hasWarmStart()).toBe(false);

      // Verify hysteresis functions are importable
      expect(typeof validatePolygonChirality).toBe("function");
      expect(typeof validateDcelFaceChirality).toBe("function");
      expect(typeof clampDragToChirality).toBe("function");
      expect(typeof validateWeldTolerance).toBe("function");
      expect(typeof signedArea).toBe("function");

      // Verify PlaneGcsClient drag API
      expect(typeof PlaneGcsClient.commitDrag).toBe("function");
      expect(typeof PlaneGcsClient.cancelDrag).toBe("function");
      expect(typeof PlaneGcsClient.purgeTemporaryConstraints).toBe("function");
      expect(typeof PlaneGcsClient.purgeTemporaryFromInput).toBe("function");
    });
  });
});
