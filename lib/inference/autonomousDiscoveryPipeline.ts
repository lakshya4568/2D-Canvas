/**
 * Full-Pipeline Autonomous Relationship Discovery & CAD Synthesis Engine
 * UPCE-MASTER-1.0 §86, §39–§42, Gate G8 (§76)
 *
 * Provides a unified one-click autonomous CAD synthesis engine:
 * 1. DCEL Planar Arrangement with intersection splitting & vertex welding at weld_mm.
 * 2. Domain Blueprint Auto-Classification (single/multi-cell culverts, bridge piers, parapets).
 * 3. Semantic DCEL Face Tagging & Curated Dictionary Vocabulary population.
 * 4. Coordinate-Free Predicate Discovery across Level 1 & Level 2 assertions.
 * 5. Priority-Ordered Redundancy Filtering & Self-Healing Conflict Recovery with SVD & DM.
 * 6. Interactive Anisotropic Variational Solving with zero user formulas required.
 */

import { Point2D, DcelVertex, DcelFace } from "../geometry/topology/types";
import { DcelPlanarMap, DcelSegmentInput } from "../geometry/topology/dcel";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import {
  detectCandidatesFromDcel,
  buildVertexIndexMap,
  DetectionOptions,
} from "./candidateDetector";
import {
  clusterCandidates,
  MergedParameterCard,
  ConstraintCandidate,
} from "./candidateClusterer";
import {
  classifyDomainBlueprint,
  DomainBlueprintClassification,
  BlueprintClassifierOptions,
} from "./blueprintClassifier";
import {
  filterCandidatesWithPriorityAndDM,
  RedundancyFilterResult,
  RedundancyFilterOptions,
} from "./redundancyFilter";
import { BipartiteConstraintGraph } from "../parametric/graph/bipartiteGraph";
import { DMResult } from "../parametric/graph/dulmageMendelsohn";
import {
  PlaneGcsClient,
  UnifiedSolverInput,
  UnifiedSolverResult,
  SolverPointInput,
  SolverLineInput,
  SolverConstraintInput,
} from "../solver/planegcsClient";
import {
  createParametricSketchFromDcel,
} from "../serialization/sketchSerializer";
import {
  generateConformanceReport,
  ConformanceReport,
} from "../serialization/conformanceReporter";
import { ParametricSketch } from "../parametric/schemaTypes";

export interface AutonomousSynthesisInput {
  segments?: DcelSegmentInput[];
  dcel?: DcelPlanarMap;
  contextHint?: "culvert" | "bridge" | "auto";
  policy?: TolerancePolicy;
  sketchId?: string;
  name?: string;
}

export interface AutonomousCADModel {
  blueprint: DomainBlueprintClassification;
  dcel: DcelPlanarMap;
  rawCandidates: ConstraintCandidate[];
  admissibleCandidates: ConstraintCandidate[];
  redundantCandidates: ConstraintCandidate[];
  conflictingCandidates: ConstraintCandidate[];
  suppressedCandidates: ConstraintCandidate[];
  parameterCards: MergedParameterCard[];
  bipartiteGraph: BipartiteConstraintGraph;
  dmResult: DMResult;
  healingLog: string[];
  solverInput: UnifiedSolverInput;
  lastSolveResult?: UnifiedSolverResult;

  /**
   * Modifies a driving parameter and solves variationally with zero user formulas.
   */
  applyParameterChange(
    parameterName: string,
    newValue: number
  ): Promise<UnifiedSolverResult>;

  /**
   * Exports canonical ParametricSketch JSON document.
   */
  toParametricSketch(): ParametricSketch;

  /**
   * Generates auditable ConformanceReport verifying residuals, tolerances, and topology.
   */
  generateAuditReport(): ConformanceReport;
}

/**
 * Builds UnifiedSolverInput model from DCEL planar map, domain blueprint, and admissible candidates.
 */
function buildSolverModel(
  dcel: DcelPlanarMap,
  blueprint: DomainBlueprintClassification,
  candidates: ConstraintCandidate[],
  policy: TolerancePolicy
): UnifiedSolverInput {
  const points: SolverPointInput[] = [];
  const lines: SolverLineInput[] = [];
  const constraints: SolverConstraintInput[] = [];

  // 1. Extract points from DCEL vertices
  const vertices = Array.from(dcel.vertices.values());
  let originVertexId: string | null = null;
  let minDistanceToOrigin = Infinity;

  for (const v of vertices) {
    const dist = Math.hypot(v.point.x, v.point.y);
    if (dist < minDistanceToOrigin) {
      minDistanceToOrigin = dist;
      originVertexId = v.id;
    }
  }

  for (const v of vertices) {
    points.push({
      id: v.id,
      x: v.point.x,
      y: v.point.y,
      fixed: v.id === originVertexId, // Anchor one vertex to eliminate rigid body translation
    });
  }

  // 2. Extract lines from DCEL edges
  for (const edge of dcel.edges.values()) {
    const he = dcel.halfEdges.get(edge.halfEdge);
    if (he) {
      lines.push({
        id: edge.id,
        p1Id: he.origin,
        p2Id: he.target,
      });
    }
  }

  // 3. Map admissible candidates to solver constraints
  for (const c of candidates) {
    if (c.predicate === "P8_COINCIDENCE") {
      constraints.push({
        id: c.id,
        type: "coincident",
        entities: c.entityIds,
        driving: true,
        predicate: c.predicate,
        provenance: "GeometricFact",
      });
    } else if (c.predicate === "P2_PERPENDICULAR") {
      // Find endpoints of the two edges
      const edgeA = dcel.edges.get(c.entityIds[0]);
      const edgeB = dcel.edges.get(c.entityIds[1]);
      if (edgeA && edgeB) {
        const heA = dcel.halfEdges.get(edgeA.halfEdge);
        const heB = dcel.halfEdges.get(edgeB.halfEdge);
        if (heA && heB) {
          constraints.push({
            id: c.id,
            type: "perpendicular",
            entities: [heA.origin, heA.target, heB.origin, heB.target],
            driving: true,
            predicate: c.predicate,
            provenance: "GeometricFact",
          });
        }
      }
    } else if (c.predicate === "P3_PARALLEL_OFFSET") {
      const edgeA = dcel.edges.get(c.entityIds[0]);
      const edgeB = dcel.edges.get(c.entityIds[1]);
      if (edgeA && edgeB) {
        const heA = dcel.halfEdges.get(edgeA.halfEdge);
        const heB = dcel.halfEdges.get(edgeB.halfEdge);
        if (heA && heB) {
          constraints.push({
            id: c.id,
            type: "p2l_distance",
            entities: [heB.origin, edgeA.id],
            targetValue: c.nominalValue,
            driving: true,
            predicate: c.predicate,
            provenance: "Inference",
            parameterName: c.parameterName,
          });
        }
      }
    } else if (c.predicate === "P4_CORNER_CHAMFER") {
      constraints.push({
        id: c.id,
        type: "equal_length",
        entities: c.entityIds,
        targetValue: c.nominalValue,
        driving: true,
        predicate: c.predicate,
        provenance: "GeometricFact",
        parameterName: c.parameterName,
      });
    }
  }

  // 4. Populate parameters
  const parameters = blueprint.suggestedParameters.map((p) => ({
    name: p.name,
    value: p.value,
  }));

  return {
    points,
    lines,
    constraints,
    parameters,
    options: {
      algorithm: "DogLeg",
      maxIterations: 100,
      convergenceThreshold: policy.solver_residual,
      partitionComponents: true,
    },
  };
}

/**
 * Executes the full autonomous CAD relationship discovery and synthesis pipeline.
 */
export function synthesizeAutonomousCAD(
  input: AutonomousSynthesisInput
): AutonomousCADModel {
  const policy = input.policy ?? DEFAULT_TOLERANCE_POLICY;

  // 1. Build DCEL Planar Map
  const dcel = input.dcel
    ? input.dcel
    : input.segments
    ? DcelPlanarMap.buildFromSegments(input.segments, { policy })
    : new DcelPlanarMap();

  // 2. Classify Domain Blueprint
  const blueprint = classifyDomainBlueprint(dcel, {
    policy,
    contextHint: input.contextHint,
  });

  // 3. Detect geometric relationship candidates across Levels 1-3
  const rawCandidates = detectCandidatesFromDcel(dcel, {
    policy,
    conformanceLevel: 2,
  });

  // Enrich raw candidates with blueprint semantic names
  for (const cand of rawCandidates) {
    if (cand.predicate === "P3_PARALLEL_OFFSET") {
      // Check if nominal value matches any suggested parameter
      for (const sp of blueprint.suggestedParameters) {
        if (Math.abs(cand.nominalValue - sp.value) <= policy.cluster_mm) {
          cand.parameterName = sp.name;
          cand.displayName = sp.displayName;
          break;
        }
      }
    }
  }

  // 4. Priority-Ordered Redundancy & Conflict Suppression with SVD & DM
  const filterResult = filterCandidatesWithPriorityAndDM(rawCandidates, {
    policy,
    discardRedundant: true,
    enableSelfHealing: true,
  });

  // 5. Cluster admissible candidates into Merged Parameter Cards
  const parameterCards = clusterCandidates(filterResult.admissibleCandidates, policy);

  // 6. Construct Bipartite Graph
  const bipartiteGraph = new BipartiteConstraintGraph();
  for (const cand of filterResult.admissibleCandidates) {
    const eqCount =
      cand.predicate === "P8_COINCIDENCE" ? 2 : cand.predicate === "P2_PERPENDICULAR" ? 1 : 1;
    bipartiteGraph.addConstraint(cand.id, cand.entityIds, eqCount);
  }

  // 7. Construct Solver Model
  const solverInput = buildSolverModel(
    dcel,
    blueprint,
    filterResult.admissibleCandidates,
    policy
  );

  const model: AutonomousCADModel = {
    blueprint,
    dcel,
    rawCandidates,
    admissibleCandidates: filterResult.admissibleCandidates,
    redundantCandidates: filterResult.redundantCandidates,
    conflictingCandidates: filterResult.conflictingCandidates,
    suppressedCandidates: filterResult.suppressedCandidates,
    parameterCards,
    bipartiteGraph,
    dmResult: filterResult.dmResult,
    healingLog: filterResult.healingLog,
    solverInput,

    async applyParameterChange(
      parameterName: string,
      newValue: number
    ): Promise<UnifiedSolverResult> {
      const client = new PlaneGcsClient();
      await client.init();

      // Find current value of the parameter
      const paramObj = solverInput.parameters?.find((p) => p.name === parameterName);
      let oldValue = paramObj?.value;
      if (oldValue === undefined) {
        if (parameterName === "Bay1Span") {
          oldValue = blueprint.features.clearSpans[0] ?? 2000;
        } else if (parameterName === "Bay2Span") {
          oldValue = blueprint.features.clearSpans[1] ?? 2000;
        } else {
          oldValue = newValue;
        }
      }
      const delta = newValue - oldValue;

      if (paramObj) {
        paramObj.value = newValue;
      } else {
        solverInput.parameters?.push({ name: parameterName, value: newValue });
      }

      // Update driving constraint target values
      for (const c of solverInput.constraints) {
        if (c.parameterName === parameterName) {
          c.targetValue = newValue;
        }
      }

      // Execute anisotropic geometry update
      if (blueprint.topologyType === "single_cell_culvert") {
        if (parameterName === "ClearSpan" && Math.abs(delta) > 1e-4) {
          // Deform culvert points horizontally by delta
          // Find right-side points (x >= midX) and shift by delta
          const minX = Math.min(...solverInput.points.map((p) => p.x));
          const maxX = Math.max(...solverInput.points.map((p) => p.x));
          const midX = (minX + maxX) / 2.0;

          for (const p of solverInput.points) {
            if (p.x > midX) {
              p.x += delta;
            }
          }
        } else if (parameterName === "ClearHeight" && Math.abs(delta) > 1e-4) {
          const minY = Math.min(...solverInput.points.map((p) => p.y));
          const maxY = Math.max(...solverInput.points.map((p) => p.y));
          const midY = (minY + maxY) / 2.0;

          for (const p of solverInput.points) {
            if (p.y > midY) {
              p.y += delta;
            }
          }
        }
      } else if (blueprint.topologyType === "multi_cell_culvert") {
        if ((parameterName === "ClearSpan" || parameterName === "Bay1Span") && Math.abs(delta) > 1e-4) {
          // Multi-cell expansion: expanding Bay 1 shifts subsequent bays rigidly along X
          const minX = Math.min(...solverInput.points.map((p) => p.x));
          const firstVoidMaxX = minX + (blueprint.features.wallThicknesses[0] || 300) + oldValue;

          for (const p of solverInput.points) {
            if (p.x >= firstVoidMaxX - 10) {
              p.x += delta;
            }
          }
        }
      }

      // Solve variationally
      const result = await client.solve(solverInput);

      const resolvedPoints = new Map<string, { x: number; y: number }>();
      for (const p of solverInput.points) {
        const pt = result.points?.get(p.id) ?? { x: p.x, y: p.y };
        resolvedPoints.set(p.id, pt);
        const v = dcel.vertices.get(p.id);
        if (v) {
          v.point.x = pt.x;
          v.point.y = pt.y;
        }
      }

      const solveResult: UnifiedSolverResult = {
        converged: result.converged,
        status: result.status,
        iterations: result.iterations ?? 1,
        residualNorm: result.residualNorm,
        maxResidual: result.maxResidual ?? result.residualNorm,
        provenance: result.provenance || "planegcs_wasm",
        points: resolvedPoints,
        diagnostics: result.diagnostics,
        components: result.components,
      };

      model.lastSolveResult = solveResult;
      return solveResult;
    },

    toParametricSketch(): ParametricSketch {
      const sketchParams: Record<string, any> = {};
      for (const p of blueprint.suggestedParameters) {
        sketchParams[p.name] = {
          name: p.name,
          value: p.value,
          unit: p.unit,
          role: p.role,
          type: "length",
          provenance: "AUTONOMOUS_SYNTHESIS",
          standardRange: p.range,
          description: p.description,
          standardsReference: p.standardsReference,
        };
      }

      return createParametricSketchFromDcel({
        map: dcel,
        sketchId: input.sketchId || `sketch_${blueprint.topologyType}`,
        name: input.name || blueprint.title,
        policy,
        parameters: sketchParams,
      });
    },

    generateAuditReport(): ConformanceReport {
      const paramRecord: Record<string, { value: number; unit?: string }> = {};
      for (const p of blueprint.suggestedParameters) {
        paramRecord[p.name] = { value: p.value, unit: p.unit };
      }

      return generateConformanceReport({
        map: dcel,
        solverResult: model.lastSolveResult,
        policy,
        parameters: paramRecord,
      });
    },
  };

  return model;
}
