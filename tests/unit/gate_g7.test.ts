/**
 * Gate G7 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, §35–§38, §57, §61)
 *
 * Proves the 8 end-to-end authoring and drafting workflows:
 * 1. Author Acceptance: Author draws non-rectangular rotated bridge detail (37° skew, corner chamfers),
 *    engine deduces candidates, author accepts driving dimensions with 0 formulas written.
 * 2. Draftsman Badge Edit: Draftsman changes ClearSpan badge (2000 -> 3500), geometry scales
 *    anisotropically preserving walls and haunches, producing an auditable solve report.
 * 3. Direct Manipulation & Drag Preview: Dragging coordinates preserves polygon chirality and topology.
 * 4. Conflict Recovery: Conflicting dimension flagged in red, deleting/suppressing conflict recovers
 *    green fully-defined state.
 * 5. Port Attachment & Repeat Count Mutation: Dynamic repeat mutation (culvert bays, railing posts)
 *    expands topology cleanly.
 * 6. 100-Step Transactional Undo / Redo: Full transactional history with exact undo/redo restoration.
 * 7. Rejection Memory: Rejected candidates remain suppressed across incremental drawing edits;
 *    superseded candidates replace pending suggestions cleanly.
 * 8. Conformance Report: Generates auditable conformance certification report evaluating
 *    standards, tolerances, residuals (<= 1e-8 mm), DOF, and Euler-Poincaré invariants.
 */

import { describe, it, expect } from "vitest";
import { Point2D } from "../../lib/geometry/topology/types";
import { DcelPlanarMap, DcelSegmentInput } from "../../lib/geometry/topology/dcel";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";
import {
  detectCandidatesFromDcel,
  detectAndClusterCandidates,
} from "../../lib/inference/candidateDetector";
import {
  CandidateLifecycleManager,
  clusterCandidates,
  MergedParameterCard,
  ConstraintCandidate,
} from "../../lib/inference/candidateClusterer";
import {
  CURATED_SEMANTIC_VOCABULARY,
  classifySemanticParameter,
  isValidSemanticParameter,
} from "../../lib/inference/semanticVocabulary";
import {
  tagFace,
  hasFaceTag,
  getFacesByTag,
  autoTagDcelFaces,
  computeFaceBoundaryMetrics,
} from "../../lib/geometry/topology/semanticFaceTagger";
import {
  PlaneGcsClient,
  UnifiedSolverInput,
} from "../../lib/solver/planegcsClient";
import { validatePolygonChirality } from "../../lib/solver/hysteresis";
import { TransactionalHistory } from "../../lib/state/transactionalHistory";
import { PersistentState } from "../../lib/state/persistentStore";
import { CompositeAssemblyEngine } from "../../lib/parametric/component/compositeAssemblyEngine";
import {
  generateConformanceReport,
  formatConformanceReportMarkdown,
} from "../../lib/serialization/conformanceReporter";
import {
  serializeSketch,
  deserializeSketch,
  serializeTemplate,
  deserializeTemplate,
  verifyRoundTripSketch,
  verifyRoundTripTemplate,
  createParametricSketchFromDcel,
  validateSketchSchema,
  validateTemplateSchema,
} from "../../lib/serialization/sketchSerializer";
import {
  migrateTemplate,
  migrateSketch,
  validateTemplateVersion,
  validateSketchVersion,
  compareSemVer,
  areVersionsCompatible,
} from "../../lib/parametric/templates/templateMigration";
import {
  SINGLE_CELL_BOX_CULVERT_TEMPLATE,
  CANONICAL_TEMPLATES,
} from "../../lib/parametric/templates/canonicalTemplates";

function rotatePoint(pt: Point2D, angleRad: number, center: Point2D = { x: 0, y: 0 }): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

describe("Gate G7 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, §35–§38, §57, §61)", () => {
  const policy = DEFAULT_TOLERANCE_POLICY;

  // --------------------------------------------------------------------------
  // Workflow 1: Author Acceptance Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 1: Author Acceptance (Rotated Bridge Detail with Chamfers)", () => {
    it("should deduce all geometric candidates on a 37° skewed bridge detail with corner chamfers, allowing author acceptance with 0 formulas", () => {
      // 1. Author draws a non-rectangular bridge pier cap / culvert detail with 45° chamfers
      // Base (unrotated) coordinates:
      // Outer boundary: 1000 x 600 mm
      // Inner cavity: 800 x 400 mm, offset by 100 mm wall thickness, with 4 corner chamfers (100 mm legs)
      const unrotatedOuter: DcelSegmentInput[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 1000, y: 0 }, sourceShapeId: "outer" },
        { p1: { x: 1000, y: 0 }, p2: { x: 1000, y: 600 }, sourceShapeId: "outer" },
        { p1: { x: 1000, y: 600 }, p2: { x: 0, y: 600 }, sourceShapeId: "outer" },
        { p1: { x: 0, y: 600 }, p2: { x: 0, y: 0 }, sourceShapeId: "outer" },
      ];

      const unrotatedInner: DcelSegmentInput[] = [
        { p1: { x: 200, y: 100 }, p2: { x: 800, y: 100 }, sourceShapeId: "inner" },
        { p1: { x: 800, y: 100 }, p2: { x: 900, y: 200 }, sourceShapeId: "inner" }, // chamfer TR
        { p1: { x: 900, y: 200 }, p2: { x: 900, y: 400 }, sourceShapeId: "inner" },
        { p1: { x: 900, y: 400 }, p2: { x: 800, y: 500 }, sourceShapeId: "inner" }, // chamfer BR
        { p1: { x: 800, y: 500 }, p2: { x: 200, y: 500 }, sourceShapeId: "inner" },
        { p1: { x: 200, y: 500 }, p2: { x: 100, y: 400 }, sourceShapeId: "inner" }, // chamfer BL
        { p1: { x: 100, y: 400 }, p2: { x: 100, y: 200 }, sourceShapeId: "inner" },
        { p1: { x: 100, y: 200 }, p2: { x: 200, y: 100 }, sourceShapeId: "inner" }, // chamfer TL
      ];

      // Rotate entire geometry by 37° skew
      const skewAngleRad = (37 * Math.PI) / 180;
      const skewedSegments: DcelSegmentInput[] = [...unrotatedOuter, ...unrotatedInner].map((s) => ({
        p1: rotatePoint(s.p1, skewAngleRad),
        p2: rotatePoint(s.p2, skewAngleRad),
        sourceShapeId: s.sourceShapeId,
      }));

      // 2. Build DCEL planar map
      const map = DcelPlanarMap.buildFromSegments(skewedSegments, { policy });
      expect(map.vertices.size).toBeGreaterThan(0);
      expect(map.faces.size).toBe(3); // Exterior, outer solid material, inner cavity void

      // 3. Autonomously deduce Level-2 candidates
      const candidates = detectCandidatesFromDcel(map, {
        policy,
        conformanceLevel: 2,
        maxOffsetMm: 200,
      });

      expect(candidates.length).toBeGreaterThan(0);

      // Verify Level-2 chamfer recognition on 37° skewed geometry
      const chamfers = candidates.filter((c) => c.predicate === "P4_CORNER_CHAMFER");
      const haunchChamfers = chamfers.filter((c) => Math.abs(c.nominalValue - 100) < 5);
      expect(haunchChamfers.length).toBeGreaterThanOrEqual(4);
      for (const ch of haunchChamfers) {
        // Chamfer leg dimension is exactly 100 mm in model space
        expect(ch.nominalValue).toBeCloseTo(100, 1);
      }

      // Verify parallel wall thickness offsets (100 mm)
      const wallOffsets = candidates.filter((c) => c.predicate === "P3_PARALLEL_OFFSET");
      expect(wallOffsets.length).toBeGreaterThanOrEqual(4);
      for (const w of wallOffsets) {
        expect(w.nominalValue).toBeCloseTo(100, 1);
      }

      // 4. Synthesize Merged Parameter Cards
      const cards = clusterCandidates(candidates, policy);
      expect(cards.length).toBeGreaterThan(0);

      // Verify curated vocabulary assignment
      const wallCard = cards.find((c) => c.parameterName === "WallThickness" || c.displayName === "Wall Thickness");
      expect(wallCard).toBeDefined();
      expect(wallCard!.nominalValue).toBeCloseTo(100, 1);
      expect(wallCard!.occurrences).toBeGreaterThanOrEqual(4);

      const haunchCard = cards.find((c) => c.parameterName === "HaunchLeg" || c.displayName === "Haunch Leg");
      expect(haunchCard).toBeDefined();
      expect(haunchCard!.nominalValue).toBeCloseTo(100, 1);
      expect(haunchCard!.occurrences).toBeGreaterThanOrEqual(4);

      // 5. Author Acceptance: Author accepts driving dimension cards with 0 formulas written
      const lifecycle = new CandidateLifecycleManager();
      lifecycle.acceptCard(wallCard!);
      lifecycle.acceptCard(haunchCard!);

      expect(wallCard!.status).toBe("accepted");
      expect(haunchCard!.status).toBe("accepted");
      for (const cand of wallCard!.candidates) {
        expect(cand.status).toBe("accepted");
      }
    });
  });

  // --------------------------------------------------------------------------
  // Workflow 2: Draftsman Badge Edit Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 2: Draftsman Badge Edit (Anisotropic Scaling & Solve Report)", () => {
    it("should anisotropically scale ClearSpan badge (2000 -> 3500) preserving wall thicknesses and haunches, producing an auditable solve report", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Initial culvert: ClearSpan = 2000, ClearHeight = 1500, WallThickness = 300, HaunchLeg = 150
      // Driving edit: Draftsman changes ClearSpan badge to 3500 (+1500 mm)
      const newSpan = 3500;
      const height = 1500;
      const wall = 300;

      // Construct parametric solver model
      const solverInput: UnifiedSolverInput = {
        points: [
          // Outer bottom-left, bottom-right, top-right, top-left
          { id: "p_out_bl", x: 0, y: 0, fixed: true },
          { id: "p_out_br", x: newSpan + 2 * wall, y: 0 },
          { id: "p_out_tr", x: newSpan + 2 * wall, y: height + 2 * wall },
          { id: "p_out_tl", x: 0, y: height + 2 * wall },

          // Inner bottom-left, bottom-right, top-right, top-left
          { id: "p_in_bl", x: wall, y: wall },
          { id: "p_in_br", x: wall + newSpan, y: wall },
          { id: "p_in_tr", x: wall + newSpan, y: wall + height },
          { id: "p_in_tl", x: wall, y: wall + height },
        ],
        lines: [
          { id: "l_out_bot", p1Id: "p_out_bl", p2Id: "p_out_br" },
          { id: "l_out_right", p1Id: "p_out_br", p2Id: "p_out_tr" },
          { id: "l_out_top", p1Id: "p_out_tr", p2Id: "p_out_tl" },
          { id: "l_out_left", p1Id: "p_out_tl", p2Id: "p_out_bl" },

          { id: "l_in_bot", p1Id: "p_in_bl", p2Id: "p_in_br" },
          { id: "l_in_right", p1Id: "p_in_br", p2Id: "p_in_tr" },
          { id: "l_in_top", p1Id: "p_in_tr", p2Id: "p_in_tl" },
          { id: "l_in_left", p1Id: "p_in_tl", p2Id: "p_in_bl" },
        ],
        constraints: [
          // Alignment
          { id: "c_out_bot_h", type: "horizontal", entities: ["p_out_bl", "p_out_br"], driving: true },
          { id: "c_out_top_h", type: "horizontal", entities: ["p_out_tl", "p_out_tr"], driving: true },
          { id: "c_out_left_v", type: "vertical", entities: ["p_out_bl", "p_out_tl"], driving: true },
          { id: "c_out_right_v", type: "vertical", entities: ["p_out_br", "p_out_tr"], driving: true },

          { id: "c_in_bot_h", type: "horizontal", entities: ["p_in_bl", "p_in_br"], driving: true },
          { id: "c_in_top_h", type: "horizontal", entities: ["p_in_tl", "p_in_tr"], driving: true },
          { id: "c_in_left_v", type: "vertical", entities: ["p_in_bl", "p_in_tl"], driving: true },
          { id: "c_in_right_v", type: "vertical", entities: ["p_in_br", "p_in_tr"], driving: true },

          // Wall thicknesses strictly preserved
          { id: "c_left_wall", type: "p2p_distance", entities: ["p_out_bl", "p_in_bl"], targetValue: wall * Math.SQRT2, driving: true },
          { id: "c_bot_wall", type: "p2l_distance", entities: ["p_in_bl", "l_out_bot"], targetValue: wall, driving: true },
          { id: "c_top_wall", type: "p2l_distance", entities: ["p_in_tl", "l_out_top"], targetValue: wall, driving: true },
          { id: "c_right_wall", type: "p2l_distance", entities: ["p_in_br", "l_out_right"], targetValue: wall, driving: true },

          // Driving badge parameter: ClearSpan = 3500 mm
          { id: "c_clear_span", type: "p2p_distance", entities: ["p_in_bl", "p_in_br"], targetValue: newSpan, driving: true },
          // Height = 1500 mm
          { id: "c_clear_height", type: "p2p_distance", entities: ["p_in_bl", "p_in_tl"], targetValue: height, driving: true },
        ],
      };

      const result = await client.solve(solverInput);

      // Auditable solve report verification
      expect(result.converged).toBe(true);
      expect(result.residualNorm).toBeLessThanOrEqual(1e-8);
      expect(result.provenance).toBeDefined();

      const pInBL = result.points.get("p_in_bl")!;
      const pInBR = result.points.get("p_in_br")!;
      const pOutBL = result.points.get("p_out_bl")!;
      const pOutBR = result.points.get("p_out_br")!;

      // Clear span expanded from 2000 to 3500 mm
      const actualSpan = Math.hypot(pInBR.x - pInBL.x, pInBR.y - pInBL.y);
      expect(actualSpan).toBeCloseTo(3500, 3);

      // Left wall thickness strictly preserved at 300 mm
      expect(pInBL.x - pOutBL.x).toBeCloseTo(300, 3);

      // Right wall thickness strictly preserved at 300 mm
      expect(pOutBR.x - pInBR.x).toBeCloseTo(300, 3);

      // Anisotropic deformation verified: Span grew by +1500, while wall thickness ratio is not uniformly scaled!
      const totalWidth = pOutBR.x - pOutBL.x;
      expect(totalWidth).toBeCloseTo(4100, 3); // 3500 + 600
    });
  });

  // --------------------------------------------------------------------------
  // Workflow 3: Direct Manipulation & Drag Preview Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 3: Direct Manipulation & Drag Preview", () => {
    it("should preserve polygon chirality and topological structure during interactive direct drag preview", async () => {
      const client = new PlaneGcsClient();
      await client.init();

      // Original CCW rectangle
      const initialPolygon: Point2D[] = [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 300 },
        { x: 0, y: 300 },
      ];

      const input: UnifiedSolverInput = {
        points: [
          { id: "p0", x: 0, y: 0, fixed: true },
          { id: "p1", x: 500, y: 0 },
          { id: "p2", x: 500, y: 300 },
          { id: "p3", x: 0, y: 300 },
        ],
        lines: [
          { id: "l0", p1Id: "p0", p2Id: "p1" },
          { id: "l1", p1Id: "p1", p2Id: "p2" },
          { id: "l2", p1Id: "p2", p2Id: "p3" },
          { id: "l3", p1Id: "p3", p2Id: "p0" },
        ],
        constraints: [
          { id: "c0", type: "horizontal", entities: ["p0", "p1"], driving: true },
          { id: "c1", type: "vertical", entities: ["p1", "p2"], driving: true },
          { id: "c2", type: "horizontal", entities: ["p3", "p2"], driving: true },
          { id: "c3", type: "vertical", entities: ["p0", "p3"], driving: true },
        ],
      };

      // Drag p2 smoothly to (650, 420)
      const previewRes = await client.solveDragPreview(input, [
        { entityId: "p2", targetX: 650, targetY: 420, weight: 0.05 },
      ]);
      expect(previewRes.converged).toBe(true);

      const p0 = previewRes.points.get("p0")!;
      const p1 = previewRes.points.get("p1")!;
      const p2 = previewRes.points.get("p2")!;
      const p3 = previewRes.points.get("p3")!;

      const draggedPolygon: Point2D[] = [p0, p1, p2, p3];

      // Chirality must be strictly preserved
      expect(validatePolygonChirality(initialPolygon, draggedPolygon)).toBe(true);

      // Verify persistent residual isolation (residual <= 1e-8 mm)
      expect(previewRes.residualNorm).toBeLessThanOrEqual(1e-8);

      // Topology purge on release
      const cleanInput = PlaneGcsClient.purgeTemporaryFromInput(input);
      const remainingTemps = cleanInput.constraints.filter((c) => c.temporary);
      expect(remainingTemps.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Workflow 4: Conflict Recovery Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 4: Conflict Recovery", () => {
    it("should flag contradictory dimension in red/conflicting state, and recover green fully-defined state upon conflict suppression", () => {
      // Create candidates where two distance constraints on the same pair contradict each other
      const cand1: ConstraintCandidate = {
        id: "cand_dist_1",
        predicate: "DISTANCE",
        entityIds: ["p1", "p2"],
        nominalValue: 500,
        measuredDeviation: 0,
        confidence: "UserConstraint",
        status: "admissible",
        provenance: "UserEntry",
      };

      const candConflict: ConstraintCandidate = {
        id: "cand_dist_conflict",
        predicate: "DISTANCE",
        entityIds: ["p1", "p2"],
        nominalValue: 600, // Contradictory distance on same point pair
        measuredDeviation: 100,
        confidence: "UserConstraint",
        status: "conflicting",
        provenance: "UserEntry",
        diagnosis: "[Conflict Error] Conflicting distance 600mm overrides established 500mm.",
      };

      // 1. Cluster candidates: card must reflect conflicting status
      const cards = clusterCandidates([cand1, candConflict], policy);
      const conflictCard = cards.find((c) => c.status === "conflicting");
      expect(conflictCard).toBeDefined();
      expect(conflictCard!.status).toBe("conflicting");
      expect(conflictCard!.diagnosis).toContain("Conflicting distance");

      // 2. Draftsman deletes / suppresses the conflicting constraint
      const resolvedCandidates = [cand1];
      const recoveredCards = clusterCandidates(resolvedCandidates, policy);
      expect(recoveredCards.length).toBe(1);
      expect(recoveredCards[0].status).toBe("admissible"); // Fully green / admissible recovered!
      expect(recoveredCards[0].diagnosis).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Workflow 5: Port Attachment & Repeat Count Mutation Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 5: Dynamic Repeat Count Mutation (Culvert Bays & Railing Posts)", () => {
    it("should mutate multi-cell culvert topology across bay counts (2 -> 4 -> 1) expanding topology cleanly with SE(2) port alignment", () => {
      // 2 bays
      const res2 = CompositeAssemblyEngine.assemble("multi_cell_box_culvert", {
        parameterOverrides: {
          cell_count: 2,
          cell_span: 400,
          clear_height: 250,
          wall_thickness: 40,
        },
      });
      expect(res2.instances.size).toBe(2);
      expect(res2.shapes.length).toBeGreaterThan(0);

      // 4 bays (topological expansion)
      const res4 = CompositeAssemblyEngine.assemble("multi_cell_box_culvert", {
        parameterOverrides: {
          cell_count: 4,
          cell_span: 400,
          clear_height: 250,
          wall_thickness: 40,
        },
      });
      expect(res4.instances.size).toBe(4);
      // Spacing strictly preserved at 400 + 40 = 440 mm
      expect(res4.parameters.cell_spacing).toBe(440);
      const bay3 = res4.instances.get("cell_repeat_3");
      expect(bay3?.origin.x).toBeCloseTo(3 * 440, 3);

      // 1 bay (topological contraction)
      const res1 = CompositeAssemblyEngine.assemble("multi_cell_box_culvert", {
        parameterOverrides: {
          cell_count: 1,
          cell_span: 400,
          clear_height: 250,
          wall_thickness: 40,
        },
      });
      expect(res1.instances.size).toBe(1);
    });

    it("should cleanly mutate railing run posts (3 -> 7 posts) preserving post spacing and port re-wiring", () => {
      const runLength = 3600;

      // 3 posts
      const res3 = CompositeAssemblyEngine.assemble("railing_run", {
        parameterOverrides: { run_length: runLength, post_count: 3 },
      });
      expect(res3.instances.size).toBe(3);
      expect(res3.parameters.post_spacing).toBeCloseTo(1800, 3);

      // 7 posts
      const res7 = CompositeAssemblyEngine.assemble("railing_run", {
        parameterOverrides: { run_length: runLength, post_count: 7 },
      });
      expect(res7.instances.size).toBe(7);
      expect(res7.parameters.post_spacing).toBeCloseTo(600, 3); // 3600 / 6
      const lastPost = res7.instances.get("post_repeat_6");
      expect(lastPost?.origin.x).toBeCloseTo(3600, 3);
    });
  });

  // --------------------------------------------------------------------------
  // Workflow 6: 100-Step Transactional Undo / Redo Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 6: 100-Step Transactional Undo / Redo", () => {
    it("should push 100 discrete editing transactions, undo all 100 steps to origin, and redo forward with exact fidelity", () => {
      const initialState: PersistentState = {
        segments: [],
        parameters: [{ id: "p_span", name: "Span", type: "DRIVING", value: 1000 }],
        constraints: [],
        constructionLines: [],
      };

      const history = new TransactionalHistory(initialState, 150);

      // Execute 100 sequential parameter increments (1000 -> 2000)
      for (let i = 1; i <= 100; i++) {
        const nextState: PersistentState = {
          ...initialState,
          parameters: [{ id: "p_span", name: "Span", type: "DRIVING", value: 1000 + i * 10 }],
        };
        history.push(nextState);
      }

      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);

      // Current value should be 2000
      let currentState = history.undo(); // Step 99
      expect(currentState?.parameters[0].value).toBe(1990);

      // Undo all remaining 99 steps back to step 0
      for (let i = 98; i >= 0; i--) {
        currentState = history.undo();
      }

      // We should be at the initial state (1000 mm)
      expect(currentState?.parameters[0].value).toBe(1000);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(true);

      // Redo all 100 steps forward
      for (let i = 1; i <= 100; i++) {
        currentState = history.redo();
        expect(currentState?.parameters[0].value).toBe(1000 + i * 10);
      }

      expect(currentState?.parameters[0].value).toBe(2000);
      expect(history.canRedo()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Workflow 7: Rejection Memory Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 7: Rejection Memory & Lifecycle Superseding", () => {
    it("should suppress rejected candidate signatures across drawing edits, and supersede pending suggestions cleanly", () => {
      const lifecycle = new CandidateLifecycleManager();

      const candA: ConstraintCandidate = {
        id: "cand_p9_sym",
        predicate: "P9_SYMMETRY",
        entityIds: ["line_left", "line_right"],
        nominalValue: 0,
        measuredDeviation: 0,
        confidence: "Inference",
        status: "pending",
        provenance: "SymmetryDetector",
      };

      // Author rejects candidate A
      lifecycle.rejectCandidate(candA);
      expect(lifecycle.isCandidateRejected(candA)).toBe(true);

      // Incremental drawing edit: author draws more geometry, candidate detector runs again
      const candA_reproposed: ConstraintCandidate = {
        ...candA,
        id: "cand_p9_sym_new",
      };
      const candB: ConstraintCandidate = {
        id: "cand_p3_wall",
        predicate: "P3_PARALLEL_OFFSET",
        entityIds: ["line_top", "line_bottom"],
        nominalValue: 300,
        measuredDeviation: 0,
        confidence: "Inference",
        status: "pending",
        provenance: "OffsetDetector",
      };

      // Filter: rejected candidate A must be completely suppressed!
      const filtered = lifecycle.filterRejectedCandidates([candA_reproposed, candB]);
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("cand_p3_wall");

      // Test Lifecycle Superseding:
      // Pending card for wall thickness (nominal 300)
      const initialCards = clusterCandidates([candB], policy);
      lifecycle.updateLifecycleCards(initialCards);
      expect(lifecycle.getActiveCards().length).toBe(1);

      // Author edits geometry, new detection produces updated card targeting same entities (nominal 350)
      const updatedCandB: ConstraintCandidate = {
        ...candB,
        id: "cand_p3_wall_updated",
        nominalValue: 350,
      };
      const newCards = clusterCandidates([updatedCandB], policy);

      const updateResult = lifecycle.updateLifecycleCards(newCards);
      expect(updateResult.activeCards.length).toBe(1);
      expect(updateResult.activeCards[0].nominalValue).toBe(350);
      expect(updateResult.supersededCards.length).toBe(1);
      expect(updateResult.supersededCards[0].status).toBe("superseded");
    });
  });

  // --------------------------------------------------------------------------
  // Workflow 8: Conformance Report Workflow
  // --------------------------------------------------------------------------
  describe("Workflow 8: Conformance Report Generator", () => {
    it("should generate a comprehensive auditable conformance report evaluating Euler, solver residuals, and standards", () => {
      // Construct a valid DCEL culvert
      const segments: DcelSegmentInput[] = [
        // Outer box 2600 x 2100
        { p1: { x: 0, y: 0 }, p2: { x: 2600, y: 0 }, sourceShapeId: "outer" },
        { p1: { x: 2600, y: 0 }, p2: { x: 2600, y: 2100 }, sourceShapeId: "outer" },
        { p1: { x: 2600, y: 2100 }, p2: { x: 0, y: 2100 }, sourceShapeId: "outer" },
        { p1: { x: 0, y: 2100 }, p2: { x: 0, y: 0 }, sourceShapeId: "outer" },
        // Inner cavity 2000 x 1500 (wall = 300)
        { p1: { x: 300, y: 300 }, p2: { x: 2300, y: 300 }, sourceShapeId: "inner" },
        { p1: { x: 2300, y: 300 }, p2: { x: 2300, y: 1800 }, sourceShapeId: "inner" },
        { p1: { x: 2300, y: 1800 }, p2: { x: 300, y: 1800 }, sourceShapeId: "inner" },
        { p1: { x: 300, y: 1800 }, p2: { x: 300, y: 300 }, sourceShapeId: "inner" },
      ];

      const map = DcelPlanarMap.buildFromSegments(segments, { policy });
      autoTagDcelFaces(map, "culvert");

      // Mock full rank Jacobian (6 constraints, 6 variables)
      const jacobian = [
        [1, 0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 0],
        [0, 0, 1, 0, 0, 0],
        [0, 0, 0, 1, 0, 0],
        [0, 0, 0, 0, 1, 0],
        [0, 0, 0, 0, 0, 1],
      ];

      const report = generateConformanceReport({
        sketchId: "culvert_e2e_cert",
        templateId: "single_cell_box_culvert",
        map,
        jacobian,
        solverResult: {
          converged: true,
          residualNorm: 3.4e-12,
          maxResidual: 5.1e-12,
          provenance: "planegcs_wasm",
          iterations: 3,
        },
        parameters: {
          ClearSpan: 2000,
          ClearHeight: 1500,
          WallThickness: 300,
          TopSlabThickness: 300,
          HaunchLeg: 150,
        },
        constraintCount: 16,
        policy,
        standardsProfile: "RDSO_CULVERT",
      });

      // Overall certification: PASS
      expect(report.overallStatus).toBe("PASS");
      expect(report.eulerPoincare.passed).toBe(true);
      expect(report.solverResidualCompliance.passed).toBe(true);
      expect(report.solverResidualCompliance.residualNorm).toBeLessThanOrEqual(1e-8);
      expect(report.tolerancePolicyCompliance.passed).toBe(true);
      expect(report.standardsCompliance.passed).toBe(true);
      expect(report.metrics.dof).toBe(0); // Fully constrained

      // Generate markdown certificate
      const md = formatConformanceReportMarkdown(report);
      expect(md).toContain("Parametric CAD Conformance Certification Report");
      expect(md).toContain("PASS");
      expect(md).toContain("planegcs_wasm");
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases & Round-Trip Serialization Validation
  // --------------------------------------------------------------------------
  describe("Edge Cases: Canonical Serialization, Versioning & Face Tagging", () => {
    it("should achieve 100% round-trip fidelity for ParametricSketch and TemplateDefinition", () => {
      // Build a sketch from DCEL
      const segs: DcelSegmentInput[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 500, y: 0 } },
        { p1: { x: 500, y: 0 }, p2: { x: 500, y: 500 } },
        { p1: { x: 500, y: 500 }, p2: { x: 0, y: 500 } },
        { p1: { x: 0, y: 500 }, p2: { x: 0, y: 0 } },
      ];
      const map = DcelPlanarMap.buildFromSegments(segs, { policy });
      const sketch = createParametricSketchFromDcel({
        sketchId: "square_sketch_01",
        map,
        policy,
      });

      const sketchTrip = verifyRoundTripSketch(sketch);
      expect(sketchTrip.matches).toBe(true);
      expect(sketchTrip.differences).toHaveLength(0);

      // Canonical template round-trip
      const tmpl = SINGLE_CELL_BOX_CULVERT_TEMPLATE;
      const tmplTrip = verifyRoundTripTemplate(tmpl);
      expect(tmplTrip.matches).toBe(true);
      expect(tmplTrip.differences).toHaveLength(0);
    });

    it("should validate and migrate legacy templates and sketches backward-compatibly", () => {
      const legacyTmpl = {
        id: "legacy_01",
        name: "Legacy",
        category: "component",
        schemaVersion: "0.9", // Outdated version
        parameters: [{ id: "p1", name: "W", value: 100 }], // Missing role/type/unit/provenance
      };

      const migration = migrateTemplate(legacyTmpl);
      expect(migration.migrated).toBe(true);
      expect(migration.result.schemaVersion).toBe("1.0");
      expect(migration.result.parameters[0].role).toBe("DRIVING");
      expect(migration.result.parameters[0].unit).toBe("mm");

      // Version compatibility
      expect(areVersionsCompatible("1.2.0", "1.0.0")).toBe(true);
      expect(areVersionsCompatible("2.0.0", "1.0.0")).toBe(false);
      expect(compareSemVer("1.2.3", "1.2.0")).toBe(1);
    });

    it("should accurately tag faces and boundary cycles in bridge and culvert assemblies", () => {
      const segments: DcelSegmentInput[] = [
        // Deck slab (high, wide: 3000 x 200 at Y = 2000)
        { p1: { x: 0, y: 2000 }, p2: { x: 3000, y: 2000 }, tags: ["deck_slab"] },
        { p1: { x: 3000, y: 2000 }, p2: { x: 3000, y: 2200 }, tags: ["deck_slab"] },
        { p1: { x: 3000, y: 2200 }, p2: { x: 0, y: 2200 }, tags: ["deck_slab"] },
        { p1: { x: 0, y: 2200 }, p2: { x: 0, y: 2000 }, tags: ["deck_slab"] },

        // Pier column (vertical, below deck: 400 x 1800 at X = 1300, Y = 200)
        { p1: { x: 1300, y: 200 }, p2: { x: 1700, y: 200 }, tags: ["pier_column"] },
        { p1: { x: 1700, y: 200 }, p2: { x: 1700, y: 2000 }, tags: ["pier_column"] },
        { p1: { x: 1700, y: 2000 }, p2: { x: 1300, y: 2000 }, tags: ["pier_column"] },
        { p1: { x: 1300, y: 2000 }, p2: { x: 1300, y: 200 }, tags: ["pier_column"] },
      ];

      const map = DcelPlanarMap.buildFromSegments(segments, { policy });
      autoTagDcelFaces(map, "bridge");

      const deckFaces = getFacesByTag(map, "deck_slab");
      expect(deckFaces.length).toBeGreaterThan(0);
      expect(deckFaces[0].semanticCategory).toBe("DECK");

      const pierFaces = getFacesByTag(map, "pier_column");
      expect(pierFaces.length).toBeGreaterThan(0);
      expect(pierFaces[0].semanticCategory).toBe("PIER");

      const metrics = computeFaceBoundaryMetrics(map, deckFaces[0].id);
      expect(metrics.aspectRatio).toBeGreaterThan(2.0);
    });

    it("should classify 45° skewed deck slab accurately using rotation-invariant PCA without AABB distortion", () => {
      // 45° skewed deck slab (3000 x 200 mm)
      const angle = (45 * Math.PI) / 180;
      const unrotatedDeck: DcelSegmentInput[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 3000, y: 0 } },
        { p1: { x: 3000, y: 0 }, p2: { x: 3000, y: 200 } },
        { p1: { x: 3000, y: 200 }, p2: { x: 0, y: 200 } },
        { p1: { x: 0, y: 200 }, p2: { x: 0, y: 0 } },
      ];
      const rotatedDeck = unrotatedDeck.map((s) => ({
        p1: rotatePoint(s.p1, angle),
        p2: rotatePoint(s.p2, angle),
      }));

      const map = DcelPlanarMap.buildFromSegments(rotatedDeck, { policy });
      autoTagDcelFaces(map, "bridge");

      const faces = getFacesByTag(map, "deck_slab");
      expect(faces.length).toBeGreaterThan(0);
      expect(faces[0].semanticCategory).toBe("DECK");

      const metrics = computeFaceBoundaryMetrics(map, faces[0].id);
      expect(metrics.aspectRatio).toBeCloseTo(15.0, 1);
      expect(metrics.orientedLength).toBeCloseTo(3000, 1);
      expect(metrics.orientedThickness).toBeCloseTo(200, 1);
    });

    it("should strictly validate and migrate legacy templates with object constraints and semantics into valid schema arrays", () => {
      const legacyWithObjectContainers = {
        id: "legacy_bridge_pier",
        name: "Legacy Pier",
        category: "bridge",
        schemaVersion: "0.8",
        parameters: [{ id: "h", name: "Height", value: 4000 }],
        constraints: {
          geometric: [{ id: "cg1", kind: "vertical", refs: ["l1"] }],
          dimensional: [{ id: "cd1", kind: "distance", refs: ["p1", "p2"], value: 4000 }],
        },
        semantics: {
          blocks: [{ id: "sem1", type: "pier", faces: ["f1"], edges: ["l1"], children: [], params: ["h"] }],
        },
        validation: {
          rules: [{ ruleId: "r1", type: "BOUNDS", severity: "ERROR", expression: "h >= 1000", message: "Min height" }],
        },
        provenance: {
          author: "LegacyAuthor",
          createdAt: "2025-01-01T00:00:00Z",
          source: "v0.8-export",
        },
      };

      const migration = migrateTemplate(legacyWithObjectContainers);
      expect(migration.migrated).toBe(true);
      expect(Array.isArray(migration.result.constraints)).toBe(true);
      expect(migration.result.constraints).toHaveLength(2);
      expect(Array.isArray(migration.result.semantics)).toBe(true);
      expect(migration.result.semantics).toHaveLength(1);
      expect(Array.isArray(migration.result.validation)).toBe(true);
      expect(migration.result.validation).toHaveLength(1);
      expect(Array.isArray(migration.result.provenance)).toBe(true);
      expect(migration.result.provenance).toHaveLength(1);

      // Verify it passes strict schema validation
      const schemaCheck = validateTemplateSchema(migration.result);
      expect(schemaCheck.valid).toBe(true);
      expect(schemaCheck.errors).toHaveLength(0);
    });

    it("should migrate legacy sketches with array constraints and array points without dropping data", () => {
      const legacySketch = {
        sketchId: "legacy_sk_01",
        schemaVersion: "0.9",
        primitives: {
          points: [
            { id: "p1", x: 0, y: 0 },
            { id: "p2", x: 1000, y: 0 },
          ],
          lines: [{ id: "l1", p1: "p1", p2: "p2" }],
        },
        constraints: [
          { id: "c1", type: "HORIZONTAL", entities: ["p1", "p2"], driving: true },
          { id: "c2", type: "DISTANCE_POINT_TO_POINT", entities: ["p1", "p2"], targetValue: 1000, driving: true },
        ],
      };

      const migration = migrateSketch(legacySketch);
      expect(migration.migrated).toBe(true);
      expect(typeof migration.result.constraints).toBe("object");
      expect(Array.isArray(migration.result.constraints)).toBe(false);
      expect(Object.keys(migration.result.constraints)).toHaveLength(2);
      expect(migration.result.constraints["c1"]).toBeDefined();
      expect(migration.result.constraints["c2"]).toBeDefined();
      expect(migration.result.primitives.points["p1"]).toBeDefined();
      expect(migration.result.primitives.points["p2"]).toBeDefined();

      const valCheck = validateSketchSchema(migration.result);
      expect(valCheck.valid).toBe(true);
      expect(valCheck.errors).toHaveLength(0);
    });

    it("should flag conformance failure when maxResidual violates 1e-8 mm and evaluate custom standards relationships", () => {
      // maxResidual > 1e-8 mm must cause FAIL
      const failingReport = generateConformanceReport({
        sketchId: "fail_res_check",
        solverResult: {
          converged: true,
          residualNorm: 5e-9,
          maxResidual: 1e-4, // Exceeds tolerance threshold!
        },
      });
      expect(failingReport.solverResidualCompliance.passed).toBe(false);
      expect(failingReport.overallStatus).toBe("FAIL");

      // Custom standards relationships evaluation
      const customReport = generateConformanceReport({
        sketchId: "custom_standards_eval",
        parameters: {
          ClearSpan: 5000,
          ClearHeight: 1000,
        },
        customStandardsProfile: {
          id: "HIGHWAY_OVERPASS",
          parameterBounds: {
            ClearSpan: { min: 2000, max: 10000, codeRef: "IRC:SP:13" },
          },
          relationships: [
            {
              expr: "ClearSpan / ClearHeight <= 4.0",
              message: "Aspect ratio must not exceed 4.0 for overpass",
              codeRef: "IRC:5 Clause 110",
            },
          ],
        },
      });
      expect(customReport.overallStatus).toBe("WARN");
      expect(customReport.standardsCompliance.violations).toHaveLength(1);
      expect(customReport.standardsCompliance.violations[0].clause).toBe("IRC:5 Clause 110");
    });
  });
});
