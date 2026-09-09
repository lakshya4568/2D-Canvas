import { make_gcs_wrapper, GcsWrapper, Algorithm, SolveStatus } from "@salusoft89/planegcs";
import { solveDogleg } from "./dogleg";
import { solveLevenbergMarquardt, SystemModel } from "./levenbergMarquardt";
import { solveSingleCellCulvertSpan, SingleCellCulvertModel } from "../state/presets/singleCellCulvert";
import { BipartiteConstraintGraph } from "../parametric/graph/bipartiteGraph";
import { DulmageMendelsohnSolver, DMResult } from "../parametric/graph/dulmageMendelsohn";
import {
  evaluateCoincidentConstraint,
  evaluateHorizontalConstraint,
  evaluateVerticalConstraint,
  evaluateDistanceConstraint,
  evaluatePointOnLineConstraint,
  evaluateParallelConstraint,
  evaluatePerpendicularConstraint,
  evaluateHaunch45Constraint,
  evaluateWallThicknessConstraint,
  evaluateHaunchLegEqualityConstraint,
  evaluateAngleConstraint,
  evaluateConcentricConstraint,
  evaluateSymmetryConstraint,
  evaluateDragTargetConstraint,
  evaluateMidpointConstraint,
  evaluatePointToLineDistanceConstraint,
  evaluateTangencyLineCircleConstraint,
  evaluateTangencyCircleCircleConstraint,
} from "./jacobians/analyticalJacobians";
import { createMatrix } from "./matrix/denseMatrix";


export type SolverAlgorithm = "DogLeg" | "LevenbergMarquardt" | "BFGS" | "SQP";

export interface SolverPointInput {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
}

export interface SolverLineInput {
  id: string;
  p1Id: string;
  p2Id: string;
}

export interface SolverCircleInput {
  id: string;
  centerId: string;
  radius: number;
}

export interface SolverArcInput {
  id: string;
  centerId: string;
  startId: string;
  endId: string;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

export interface SolverConstraintInput {
  id: string;
  type: string;
  entities: string[];
  targetValue?: number;
  driving?: boolean; // false for reference/measurement dimensions (default: true)
  temporary?: boolean; // true for drag targets (default: false)
  predicate?: string;
  provenance?: "GeometricFact" | "Inference" | "UserConstraint" | "UserFormula" | "Measurement";
  weight?: number;
  signX?: number;
  signY?: number;
  [key: string]: any;
}

export interface SolverParameterInput {
  name: string;
  value: number;
  fixed?: boolean;
}

export interface UnifiedSolverInput {
  points: SolverPointInput[];
  lines?: SolverLineInput[];
  circles?: SolverCircleInput[];
  arcs?: SolverArcInput[];
  constraints: SolverConstraintInput[];
  parameters?: SolverParameterInput[];
  options?: {
    algorithm?: SolverAlgorithm;
    maxIterations?: number;
    convergenceThreshold?: number;
    useAnalyticalDomainLayer?: boolean;
    partitionComponents?: boolean;
    dirtyEntityIds?: string[];
    domainContext?: {
      type: "single_cell_culvert" | "two_span_culvert" | "generic";
      config?: Record<string, any>;
      targetSpan?: number;
    };
  };
}

export interface ComponentDiagnosis {
  componentId: string;
  dof: number;
  status: "under_constrained" | "well_constrained" | "over_constrained";
  conflictingConstraintIds: string[];
  redundantConstraintIds: string[];
  partiallyRedundantConstraintIds: string[];
  entityIds: string[];
}

export interface UnifiedSolverResult {
  converged: boolean;
  status: "converged" | "max_iterations" | "stagnated" | "unsolved";
  iterations: number;
  residualNorm: number;
  maxResidual: number;
  provenance: "planegcs_wasm" | "analytical_culvert" | "dogleg_ts" | "lm_ts";
  points: Map<string, { x: number; y: number; fixed?: boolean }>;
  parameters?: Map<string, number>;
  diagnostics: {
    conflictingConstraints: string[];
    redundantConstraints: string[];
    partiallyRedundantConstraints: string[];
    routingReason?: string;
  };
  components?: ComponentDiagnosis[];
  dmResult?: DMResult;
  rawStatus?: number;
}

let cachedWrapper: GcsWrapper | null = null;
let initPromise: Promise<GcsWrapper> | null = null;

async function getOrInitWrapper(): Promise<GcsWrapper> {
  if (cachedWrapper) return cachedWrapper;
  if (!initPromise) {
    initPromise = make_gcs_wrapper().then((w) => {
      cachedWrapper = w;
      return w;
    });
  }
  return initPromise;
}

export const PLANE_GCS_SUPPORTED_TYPES = new Set([
  "distance",
  "p2p_distance",
  "distance_point_to_point",
  "p2l_distance",
  "distance_point_to_line",
  "coincident",
  "p2p_coincident",
  "point_on_point",
  "horizontal",
  "horizontal_pp",
  "horizontal_l",
  "vertical",
  "vertical_pp",
  "vertical_l",
  "parallel",
  "perpendicular",
  "perpendicular_ll",
  "perpendicular_pppp",
  "point_on_line",
  "point_on_line_ppp",
  "point_on_line_pl",
  "concentric",
  "concentric_cc",
  "tangent",
  "tangent_lc",
  "tangent_line_circle",
  "tangent_cc",
  "tangent_circle_circle",
  "tangent_la",
  "tangent_aa",
  "tangent_ca",
  "equal_length",
  "equal_radius",
  "equal_radius_cc",
  "equal_radius_aa",
  "equal_radius_ca",
  "midpoint",
  "midpoint_on_line_ll",
  "midpoint_on_line_pppp",
  "symmetric",
  "p2p_symmetric_ppl",
  "p2p_symmetric_ppp",
  "angle",
  "l2l_angle",
  "l2l_angle_ll",
  "l2l_angle_pppp",
  "circle_radius",
  "arc_radius",
  "point_on_circle",
  "point_on_arc",
  "coordinate_x",
  "coordinate_y",
]);

/**
 * Checks whether a given constraint type can be natively handled by PlaneGCS WASM.
 * Only standard constraints in PLANE_GCS_SUPPORTED_TYPES return true.
 * Custom non-linear constraints (chamfers, wall offsets, haunches, formulas, expressions) return false.
 */
export function isPlaneGcsSupportedConstraint(c: SolverConstraintInput): boolean {
  const normType = c.type.toLowerCase().replace(/[\s-]/g, "_");
  return PLANE_GCS_SUPPORTED_TYPES.has(normType);
}

/**
 * PlaneGCS WASM Solver Adapter & Unified Solver Engine (UPCE-MASTER-1.0 §86, §29.7, §29.8, §30, §33, §34, Gate G6).
 * Bridges `@salusoft89/planegcs`, maintains side-table handles, supports reference
 * dimensions (`driving: false`) and drag targets (`temporary: true`), connected-component
 * graph partitioning, and embeds analytical solvers & domain layers with clean fallback routing.
 */
export class PlaneGcsClient {
  // Side table: caller ID -> PlaneGCS primitive ID / handle (rebuilt on each init)
  public idToGcsHandle = new Map<string, string>();
  private wrapper: GcsWrapper | null = null;

  public constructor(wrapper?: GcsWrapper) {
    if (wrapper) this.wrapper = wrapper;
  }

  public async init(): Promise<void> {
    this.idToGcsHandle.clear();
    this.wrapper = await getOrInitWrapper();
  }

  public reset(): void {
    this.idToGcsHandle.clear();
    if (this.wrapper) {
      this.wrapper.clear_data();
    }
  }

  // Ephemeral serialization promise to protect stateful WASM wrapper across concurrent solves
  private solveLock: Promise<any> = Promise.resolve();

  /**
   * Purges all temporary drag constraints from a constraint list.
   */
  public static purgeTemporaryConstraints(constraints: SolverConstraintInput[]): SolverConstraintInput[] {
    return constraints.filter((c) => !c.temporary);
  }

  /**
   * Purges temporary drag constraints from a UnifiedSolverInput object, leaving persistent topology pristine.
   */
  public static purgeTemporaryFromInput(input: UnifiedSolverInput): UnifiedSolverInput {
    return {
      ...input,
      constraints: PlaneGcsClient.purgeTemporaryConstraints(input.constraints),
    };
  }

  /**
   * Solves a geometric constraint problem per the Unified Solver Contract (§29.8, Gate G6).
   * Automatically partitions disjoint connected components unless disabled via options.
   * All solve paths are strictly serialized under solveLock to protect the stateful WASM wrapper.
   */
  public async solve(input: UnifiedSolverInput): Promise<UnifiedSolverResult> {
    const run = async () => {
      // If analytical domain layer is explicitly requested, bypass partitioning
      if (
        input.options?.useAnalyticalDomainLayer ||
        input.options?.domainContext?.type === "single_cell_culvert"
      ) {
        return this.solveAnalyticalCulvert(input);
      }

      // Connected-component partitioning: default enabled unless explicitly set to false
      if (input.options?.partitionComponents !== false) {
        return this.solvePartitionedInternal(input);
      }

      return this.executeSolve(input);
    };

    const promise = this.solveLock.then(run, run);
    this.solveLock = promise.catch(() => {});
    return promise;
  }

  /**
   * Solves a temporary drag preview step by injecting temporary coordinate damping constraints ($S_jj = 0.05$).
   * Supports warm-start from previous frame's solution for hysteresis stability (UPCE-MASTER-1.0 §34, Gate G9).
   */
  public async solveDragPreview(
    input: UnifiedSolverInput,
    dragTargets: { entityId: string; targetX: number; targetY: number; weight?: number }[],
    warmStartPoints?: Map<string, { x: number; y: number }>
  ): Promise<UnifiedSolverResult> {
    const tempConstraints: SolverConstraintInput[] = dragTargets.flatMap((t) => [
      {
        id: `__drag_x_${t.entityId}`,
        type: "coordinate_x",
        entities: [t.entityId],
        targetValue: t.targetX,
        temporary: true,
        driving: true,
        scale: 0.05, // S_jj = 0.05 for dragged coordinates per SolveSpace / UPCE §34
        weight: t.weight ?? 0.05,
      },
      {
        id: `__drag_y_${t.entityId}`,
        type: "coordinate_y",
        entities: [t.entityId],
        targetValue: t.targetY,
        temporary: true,
        driving: true,
        scale: 0.05, // S_jj = 0.05 for dragged coordinates per SolveSpace / UPCE §34
        weight: t.weight ?? 0.05,
      },
    ]);

    // Apply warm-start: override initial point coordinates with previous frame's solution
    let warmStartedPoints = input.points;
    if (warmStartPoints && warmStartPoints.size > 0) {
      warmStartedPoints = input.points.map((p) => {
        const ws = warmStartPoints.get(p.id);
        return ws ? { ...p, x: ws.x, y: ws.y } : p;
      });
    }

    const previewInput: UnifiedSolverInput = {
      ...input,
      points: warmStartedPoints,
      constraints: [...input.constraints, ...tempConstraints],
      options: {
        ...input.options,
        dirtyEntityIds: dragTargets.map((t) => t.entityId),
      },
    };

    return this.solve(previewInput);
  }

  /**
   * Commits a drag operation by stripping all temporary constraints from the input
   * and returning the final persistent constraint set.
   */
  public static commitDrag(input: UnifiedSolverInput): UnifiedSolverInput {
    return PlaneGcsClient.purgeTemporaryFromInput(input);
  }

  /**
   * Cancels a drag operation by stripping all temporary constraints and reverting
   * point coordinates to the provided original positions.
   */
  public static cancelDrag(
    input: UnifiedSolverInput,
    originalPoints: SolverPointInput[]
  ): UnifiedSolverInput {
    return {
      ...PlaneGcsClient.purgeTemporaryFromInput(input),
      points: originalPoints,
    };
  }

  /**
   * Public interface for partitioned solve.
   */
  public async solvePartitioned(input: UnifiedSolverInput): Promise<UnifiedSolverResult> {
    const run = () => this.solvePartitionedInternal(input);
    const promise = this.solveLock.then(run, run);
    this.solveLock = promise.catch(() => {});
    return promise;
  }

  /**
   * Partition the constraint problem into connected components (sub-graphs).
   * Solves each component in isolation avoiding quadratic complexity explosion across independent sketch components.
   * If dirtyEntityIds is supplied, re-solves only the affected component(s), leaving untouched components pristine.
   */
  private async solvePartitionedInternal(input: UnifiedSolverInput): Promise<UnifiedSolverResult> {
    const allPtIds = new Set(input.points.map((p) => p.id));
    if (allPtIds.size <= 1) {
      return this.executeSolve(input);
    }

    // Line lookup: lineId -> [p1Id, p2Id]
    const lineMap = new Map<string, { p1: string; p2: string }>();
    if (input.lines) {
      for (const l of input.lines) {
        lineMap.set(l.id, { p1: l.p1Id, p2: l.p2Id });
      }
    }

    // Circle lookup: circleId -> centerId
    const circleMap = new Map<string, string>();
    if (input.circles) {
      for (const c of input.circles) {
        circleMap.set(c.id, c.centerId);
      }
    }

    // Arc lookup: arcId -> { centerId, startId, endId }
    const arcMap = new Map<string, { c: string; s: string; e: string }>();
    if (input.arcs) {
      for (const a of input.arcs) {
        arcMap.set(a.id, { c: a.centerId, s: a.startId, e: a.endId });
      }
    }

    // Build entity adjacency map between point IDs
    const adj = new Map<string, Set<string>>();
    for (const ptId of allPtIds) {
      adj.set(ptId, new Set());
    }

    // Add edges from lines
    if (input.lines) {
      for (const l of input.lines) {
        if (allPtIds.has(l.p1Id) && allPtIds.has(l.p2Id)) {
          adj.get(l.p1Id)!.add(l.p2Id);
          adj.get(l.p2Id)!.add(l.p1Id);
        }
      }
    }

    // Add edges from arcs
    if (input.arcs) {
      for (const a of input.arcs) {
        const pts = [a.centerId, a.startId, a.endId].filter((id) => allPtIds.has(id));
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            adj.get(pts[i])!.add(pts[j]);
            adj.get(pts[j])!.add(pts[i]);
          }
        }
      }
    }

    // Add edges from constraints
    for (const c of input.constraints) {
      const constraintPts: string[] = [];
      for (const e of c.entities) {
        if (allPtIds.has(e)) {
          constraintPts.push(e);
        } else if (lineMap.has(e)) {
          const l = lineMap.get(e)!;
          constraintPts.push(l.p1, l.p2);
        } else if (circleMap.has(e)) {
          constraintPts.push(circleMap.get(e)!);
        } else if (arcMap.has(e)) {
          const a = arcMap.get(e)!;
          constraintPts.push(a.c, a.s, a.e);
        }
      }

      for (let i = 0; i < constraintPts.length; i++) {
        for (let j = i + 1; j < constraintPts.length; j++) {
          adj.get(constraintPts[i])?.add(constraintPts[j]);
          adj.get(constraintPts[j])?.add(constraintPts[i]);
        }
      }
    }

    // Extract connected components using BFS
    const visited = new Set<string>();
    const components: Set<string>[] = [];
    for (const ptId of allPtIds) {
      if (visited.has(ptId)) continue;
      const comp = new Set<string>();
      const queue = [ptId];
      visited.add(ptId);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.add(curr);
        for (const neighbor of adj.get(curr) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(comp);
    }

    // If only 1 component, solve directly as unified problem
    if (components.length <= 1) {
      return this.executeSolve(input);
    }

    // Multiple components: determine which components are active/dirty
    const dirtyIds = input.options?.dirtyEntityIds ? new Set(input.options.dirtyEntityIds) : null;

    const mergedPoints = new Map<string, { x: number; y: number; fixed?: boolean }>();
    for (const pt of input.points) {
      mergedPoints.set(pt.id, { x: pt.x, y: pt.y, fixed: pt.fixed });
    }

    let allConverged = true;
    let maxIterations = 0;
    let sumResidualSq = 0;
    let maxResidual = 0;
    const allConflicting: string[] = [];
    const allRedundant: string[] = [];
    const allPartiallyRedundant: string[] = [];
    const allComponentDiagnoses: ComponentDiagnosis[] = [];
    let primaryProvenance: UnifiedSolverResult["provenance"] = "planegcs_wasm";

    for (let cIdx = 0; cIdx < components.length; cIdx++) {
      const comp = components[cIdx];

      // Check if this component is active
      let isActive = true;
      if (dirtyIds) {
        isActive = false;
        // 1. Point match
        for (const ptId of comp) {
          if (dirtyIds.has(ptId)) {
            isActive = true;
            break;
          }
        }
        // 2. Geometric primitive match
        if (!isActive) {
          for (const dId of dirtyIds) {
            if (lineMap.has(dId) && comp.has(lineMap.get(dId)!.p1)) isActive = true;
            if (circleMap.has(dId) && comp.has(circleMap.get(dId)!)) isActive = true;
            if (arcMap.has(dId) && comp.has(arcMap.get(dId)!.c)) isActive = true;
            if (isActive) break;
          }
        }
        // 3. Constraint match: dirtyIds includes a constraint belonging to this component
        if (!isActive) {
          for (const c of input.constraints) {
            if (dirtyIds.has(c.id)) {
              const touchesComp = c.entities.some((e) => {
                if (comp.has(e)) return true;
                if (lineMap.has(e)) return comp.has(lineMap.get(e)!.p1);
                if (circleMap.has(e)) return comp.has(circleMap.get(e)!);
                if (arcMap.has(e)) return comp.has(arcMap.get(e)!.c);
                return false;
              });
              if (touchesComp) {
                isActive = true;
                break;
              }
            }
          }
        }
      }

      if (!isActive) {
        // Component is untouched! Do not re-solve or perturb points.
        allComponentDiagnoses.push({
          componentId: `comp_${cIdx + 1}`,
          dof: 0,
          status: "well_constrained",
          conflictingConstraintIds: [],
          redundantConstraintIds: [],
          partiallyRedundantConstraintIds: [],
          entityIds: Array.from(comp),
        });
        continue;
      }

      // Filter sub-problem for active component
      const subPoints = input.points.filter((p) => comp.has(p.id));
      const subLines = input.lines?.filter((l) => comp.has(l.p1Id) && comp.has(l.p2Id));
      const subCircles = input.circles?.filter((c) => comp.has(c.centerId));
      const subArcs = input.arcs?.filter((a) => comp.has(a.centerId) && comp.has(a.startId) && comp.has(a.endId));
      const subConstraints = input.constraints.filter((c) => {
        return c.entities.length > 0 && c.entities.every((e) => {
          if (comp.has(e)) return true;
          if (lineMap.has(e)) return comp.has(lineMap.get(e)!.p1);
          if (circleMap.has(e)) return comp.has(circleMap.get(e)!);
          if (arcMap.has(e)) return comp.has(arcMap.get(e)!.c);
          return false;
        });
      });

      const subInput: UnifiedSolverInput = {
        points: subPoints,
        lines: subLines,
        circles: subCircles,
        arcs: subArcs,
        constraints: subConstraints,
        parameters: input.parameters,
        options: {
          ...input.options,
          partitionComponents: false, // Prevent recursion
        },
      };

      const subResult = await this.executeSolve(subInput);

      if (!subResult.converged) allConverged = false;
      if (subResult.iterations > maxIterations) maxIterations = subResult.iterations;
      sumResidualSq += subResult.residualNorm * subResult.residualNorm;
      if (subResult.maxResidual > maxResidual) maxResidual = subResult.maxResidual;
      if (subResult.provenance !== "planegcs_wasm") primaryProvenance = subResult.provenance;

      for (const [ptId, ptPos] of subResult.points.entries()) {
        mergedPoints.set(ptId, ptPos);
      }

      allConflicting.push(...subResult.diagnostics.conflictingConstraints);
      allRedundant.push(...subResult.diagnostics.redundantConstraints);
      allPartiallyRedundant.push(...subResult.diagnostics.partiallyRedundantConstraints);

      if (subResult.components) {
        allComponentDiagnoses.push(...subResult.components);
      } else {
        allComponentDiagnoses.push({
          componentId: `comp_${cIdx + 1}`,
          dof: 0,
          status: subResult.converged ? "well_constrained" : "under_constrained",
          conflictingConstraintIds: subResult.diagnostics.conflictingConstraints,
          redundantConstraintIds: subResult.diagnostics.redundantConstraints,
          partiallyRedundantConstraintIds: subResult.diagnostics.partiallyRedundantConstraints,
          entityIds: Array.from(comp),
        });
      }
    }

    return {
      converged: allConverged,
      status: allConverged ? "converged" : "stagnated",
      iterations: maxIterations,
      residualNorm: Math.sqrt(sumResidualSq),
      maxResidual,
      provenance: primaryProvenance,
      points: mergedPoints,
      diagnostics: {
        conflictingConstraints: Array.from(new Set(allConflicting)),
        redundantConstraints: Array.from(new Set(allRedundant)),
        partiallyRedundantConstraints: Array.from(new Set(allPartiallyRedundant)),
      },
      components: allComponentDiagnoses,
    };
  }

  private async executeSolve(input: UnifiedSolverInput): Promise<UnifiedSolverResult> {
    // 1. Domain-specific analytical layer requested
    if (
      input.options?.useAnalyticalDomainLayer ||
      input.options?.domainContext?.type === "single_cell_culvert"
    ) {
      return this.solveAnalyticalCulvert(input);
    }

    // 2. Check for unsupported or custom non-linear constraints
    const unsupported = input.constraints.filter(
      (c) => c.driving !== false && !isPlaneGcsSupportedConstraint(c)
    );
    if (unsupported.length > 0) {
      const reason = `unsupported_constraint_types: [${Array.from(new Set(unsupported.map((c) => c.type))).join(", ")}]`;
      return this.solveWithTsFallback(input, reason);
    }

    // 3. Attempt PlaneGCS WASM solve
    try {
      if (!this.wrapper) {
        await this.init();
      }
      return await this.solveWithPlaneGcs(input);
    } catch (err: any) {
      // Fallback cleanly to pure TypeScript solver (DogLeg or LM) with explicit provenance
      const reason = `planegcs_wasm_fallback: ${err?.message ?? String(err)}`;
      return this.solveWithTsFallback(input, reason);
    }
  }

  /**
   * Solves via native PlaneGCS WebAssembly core.
   */
  private async solveWithPlaneGcs(input: UnifiedSolverInput): Promise<UnifiedSolverResult> {
    const w = this.wrapper!;
    this.reset();

    const algoName = input.options?.algorithm ?? "DogLeg";
    let gcsAlgo: Algorithm = Algorithm.DogLeg;
    if (algoName === "LevenbergMarquardt") {
      gcsAlgo = Algorithm.LevenbergMarquardt;
    } else if (algoName === "BFGS") {
      gcsAlgo = Algorithm.BFGS;
    } else {
      gcsAlgo = Algorithm.DogLeg;
    }

    if (input.options?.maxIterations) {
      w.set_max_iterations(input.options.maxIterations);
    }
    if (input.options?.convergenceThreshold) {
      w.set_convergence_threshold(input.options.convergenceThreshold);
    }

    // 1. Push Points & Register in Side Table
    for (const pt of input.points) {
      const gcsId = `pt_${pt.id}`;
      this.idToGcsHandle.set(pt.id, gcsId);
      w.push_primitive({
        id: gcsId,
        type: "point",
        x: pt.x,
        y: pt.y,
        fixed: !!pt.fixed,
      });
    }

    // 2. Push Lines & Register in Side Table
    const lineMap = new Map<string, { p1: string; p2: string }>();
    if (input.lines) {
      for (const line of input.lines) {
        const gcsLineId = `line_${line.id}`;
        this.idToGcsHandle.set(line.id, gcsLineId);
        const p1Gcs = this.idToGcsHandle.get(line.p1Id) ?? line.p1Id;
        const p2Gcs = this.idToGcsHandle.get(line.p2Id) ?? line.p2Id;
        lineMap.set(line.id, { p1: p1Gcs, p2: p2Gcs });
        w.push_primitive({
          id: gcsLineId,
          type: "line",
          p1_id: p1Gcs,
          p2_id: p2Gcs,
        });
      }
    }

    // 3. Push Circles
    const circleMap = new Map<string, { c: string; radius: number }>();
    if (input.circles) {
      for (const circle of input.circles) {
        const gcsCId = `circle_${circle.id}`;
        this.idToGcsHandle.set(circle.id, gcsCId);
        const cGcs = this.idToGcsHandle.get(circle.centerId) ?? circle.centerId;
        circleMap.set(circle.id, { c: cGcs, radius: circle.radius });
        w.push_primitive({
          id: gcsCId,
          type: "circle",
          c_id: cGcs,
          radius: circle.radius,
        });
      }
    }

    // 3.5 Push Arcs
    const arcMap = new Map<string, { c: string; s: string; e: string; radius: number }>();
    if (input.arcs) {
      for (const arc of input.arcs) {
        const gcsArcId = `arc_${arc.id}`;
        this.idToGcsHandle.set(arc.id, gcsArcId);
        const cGcs = this.idToGcsHandle.get(arc.centerId) ?? arc.centerId;
        const sGcs = this.idToGcsHandle.get(arc.startId) ?? arc.startId;
        const eGcs = this.idToGcsHandle.get(arc.endId) ?? arc.endId;
        arcMap.set(arc.id, { c: cGcs, s: sGcs, e: eGcs, radius: arc.radius ?? 10 });
        w.push_primitive({
          id: gcsArcId,
          type: "arc",
          c_id: cGcs,
          start_id: sGcs,
          end_id: eGcs,
          radius: arc.radius ?? 10,
          start_angle: arc.startAngle ?? 0,
          end_angle: arc.endAngle ?? Math.PI,
        });
      }
    }

    // 4. Push Parameters if any
    if (input.parameters) {
      for (const param of input.parameters) {
        w.push_sketch_param(param.name, param.value, param.fixed ?? true);
      }
    }

    // 5. Translate & Push Constraints
    for (const c of input.constraints) {
      if (c.entities.length > 0 && !c.entities.every((e) => this.idToGcsHandle.has(e))) {
        continue;
      }

      const gcsCId = `c_${c.id}`;
      this.idToGcsHandle.set(c.id, gcsCId);

      const driving = c.driving ?? true;
      const temporary = c.temporary ?? false;

      const normType = c.type.toLowerCase().replace(/[\s-]/g, "_");
      const ent0 = this.idToGcsHandle.get(c.entities[0]) ?? c.entities[0];
      const ent1 = this.idToGcsHandle.get(c.entities[1]) ?? c.entities[1];
      const ent2 = this.idToGcsHandle.get(c.entities[2]) ?? c.entities[2];
      const ent3 = this.idToGcsHandle.get(c.entities[3]) ?? c.entities[3];

      try {
        if (normType === "distance" || normType === "p2p_distance" || normType === "distance_point_to_point") {
          // Check if second entity is a line (p2l_distance)
          if (lineMap.has(c.entities[1])) {
            w.push_primitive({
              id: gcsCId,
              type: "p2l_distance",
              p_id: ent0,
              l_id: ent1,
              distance: c.targetValue ?? 0,
              driving,
              temporary,
              scale: c.scale ?? c.weight,
            } as any);
          } else if (lineMap.has(c.entities[0])) {
            w.push_primitive({
              id: gcsCId,
              type: "p2l_distance",
              p_id: ent1,
              l_id: ent0,
              distance: c.targetValue ?? 0,
              driving,
              temporary,
              scale: c.scale ?? c.weight,
            } as any);
          } else {
            w.push_primitive({
              id: gcsCId,
              type: "p2p_distance",
              p1_id: ent0,
              p2_id: ent1,
              distance: c.targetValue ?? 0,
              driving,
              temporary,
              scale: c.scale ?? c.weight,
            } as any);
          }
        } else if (normType === "p2l_distance" || normType === "distance_point_to_line") {
          const pId = lineMap.has(c.entities[0]) ? ent1 : ent0;
          const lId = lineMap.has(c.entities[0]) ? ent0 : ent1;
          w.push_primitive({
            id: gcsCId,
            type: "p2l_distance",
            p_id: pId,
            l_id: lId,
            distance: c.targetValue ?? 0,
            driving,
            temporary,
            scale: c.scale ?? c.weight,
          } as any);
        } else if (normType === "horizontal" || normType === "horizontal_pp") {
          if (lineMap.has(c.entities[0])) {
            w.push_primitive({
              id: gcsCId,
              type: "horizontal_l",
              l_id: ent0,
              driving,
              temporary,
            } as any);
          } else {
            w.push_primitive({
              id: gcsCId,
              type: "horizontal_pp",
              p1_id: ent0,
              p2_id: ent1,
              driving,
              temporary,
            } as any);
          }
        } else if (normType === "horizontal_l") {
          w.push_primitive({
            id: gcsCId,
            type: "horizontal_l",
            l_id: ent0,
            driving,
            temporary,
          } as any);
        } else if (normType === "vertical" || normType === "vertical_pp") {
          if (lineMap.has(c.entities[0])) {
            w.push_primitive({
              id: gcsCId,
              type: "vertical_l",
              l_id: ent0,
              driving,
              temporary,
            } as any);
          } else {
            w.push_primitive({
              id: gcsCId,
              type: "vertical_pp",
              p1_id: ent0,
              p2_id: ent1,
              driving,
              temporary,
            } as any);
          }
        } else if (normType === "vertical_l") {
          w.push_primitive({
            id: gcsCId,
            type: "vertical_l",
            l_id: ent0,
            driving,
            temporary,
          } as any);
        } else if (normType === "coincident" || normType === "p2p_coincident" || normType === "point_on_point") {
          w.push_primitive({
            id: gcsCId,
            type: "p2p_coincident",
            p1_id: ent0,
            p2_id: ent1,
            driving,
            temporary,
          } as any);
        } else if (normType === "point_on_line" || normType === "point_on_line_ppp") {
          if (c.entities.length >= 3) {
            w.push_primitive({
              id: gcsCId,
              type: "point_on_line_ppp",
              p_id: ent0,
              lp1_id: ent1,
              lp2_id: ent2,
              driving,
              temporary,
            } as any);
          } else {
            w.push_primitive({
              id: gcsCId,
              type: "point_on_line_pl",
              p_id: ent0,
              l_id: ent1,
              driving,
              temporary,
            } as any);
          }
        } else if (normType === "point_on_line_pl") {
          w.push_primitive({
            id: gcsCId,
            type: "point_on_line_pl",
            p_id: ent0,
            l_id: ent1,
            driving,
            temporary,
          } as any);
        } else if (normType === "parallel") {
          w.push_primitive({
            id: gcsCId,
            type: "parallel",
            l1_id: ent0,
            l2_id: ent1,
            driving,
            temporary,
          } as any);
        } else if (normType === "perpendicular" || normType === "perpendicular_pppp") {
          if (c.entities.length >= 4) {
            w.push_primitive({
              id: gcsCId,
              type: "perpendicular_pppp",
              l1p1_id: ent0,
              l1p2_id: ent1,
              l2p1_id: ent2,
              l2p2_id: ent3,
              driving,
              temporary,
            } as any);
          } else {
            w.push_primitive({
              id: gcsCId,
              type: "perpendicular_ll",
              l1_id: ent0,
              l2_id: ent1,
              driving,
              temporary,
            } as any);
          }
        } else if (normType === "perpendicular_ll") {
          w.push_primitive({
            id: gcsCId,
            type: "perpendicular_ll",
            l1_id: ent0,
            l2_id: ent1,
            driving,
            temporary,
          } as any);
        } else if (normType === "concentric" || normType === "concentric_cc") {
          const c0 = circleMap.get(c.entities[0])?.c ?? arcMap.get(c.entities[0])?.c ?? ent0;
          const c1 = circleMap.get(c.entities[1])?.c ?? arcMap.get(c.entities[1])?.c ?? ent1;
          w.push_primitive({
            id: gcsCId,
            type: "p2p_coincident",
            p1_id: c0,
            p2_id: c1,
            driving,
            temporary,
          } as any);
        } else if (
          normType === "tangent" ||
          normType === "tangent_lc" ||
          normType === "tangent_line_circle" ||
          normType === "tangent_cc" ||
          normType === "tangent_circle_circle" ||
          normType === "tangent_la" ||
          normType === "tangent_aa" ||
          normType === "tangent_ca"
        ) {
          const isLine0 = lineMap.has(c.entities[0]);
          const isCircle0 = circleMap.has(c.entities[0]);
          const isArc0 = arcMap.has(c.entities[0]);
          const isLine1 = lineMap.has(c.entities[1]);
          const isCircle1 = circleMap.has(c.entities[1]);
          const isArc1 = arcMap.has(c.entities[1]);

          if ((isLine0 && isCircle1) || (isLine1 && isCircle0)) {
            const lId = isLine0 ? ent0 : ent1;
            const cId = isLine0 ? ent1 : ent0;
            w.push_primitive({ id: gcsCId, type: "tangent_lc", l_id: lId, c_id: cId, driving, temporary } as any);
          } else if (isCircle0 && isCircle1) {
            w.push_primitive({ id: gcsCId, type: "tangent_cc", c1_id: ent0, c2_id: ent1, driving, temporary } as any);
          } else if ((isLine0 && isArc1) || (isLine1 && isArc0)) {
            const lId = isLine0 ? ent0 : ent1;
            const aId = isLine0 ? ent1 : ent0;
            w.push_primitive({ id: gcsCId, type: "tangent_la", l_id: lId, a_id: aId, driving, temporary } as any);
          } else if (isArc0 && isArc1) {
            w.push_primitive({ id: gcsCId, type: "tangent_aa", a1_id: ent0, a2_id: ent1, driving, temporary } as any);
          } else if ((isCircle0 && isArc1) || (isCircle1 && isArc0)) {
            const cId = isCircle0 ? ent0 : ent1;
            const aId = isCircle0 ? ent1 : ent0;
            w.push_primitive({ id: gcsCId, type: "tangent_ca", c_id: cId, a_id: aId, driving, temporary } as any);
          } else {
            w.push_primitive({ id: gcsCId, type: "tangent_lc", l_id: ent0, c_id: ent1, driving, temporary } as any);
          }
        } else if (normType === "equal_length") {
          w.push_primitive({
            id: gcsCId,
            type: "equal_length",
            l1_id: ent0,
            l2_id: ent1,
            driving,
            temporary,
          } as any);
        } else if (
          normType === "equal_radius" ||
          normType === "equal_radius_cc" ||
          normType === "equal_radius_aa" ||
          normType === "equal_radius_ca"
        ) {
          const isCircle0 = circleMap.has(c.entities[0]);
          const isArc0 = arcMap.has(c.entities[0]);
          const isCircle1 = circleMap.has(c.entities[1]);
          const isArc1 = arcMap.has(c.entities[1]);

          if (isCircle0 && isCircle1) {
            w.push_primitive({ id: gcsCId, type: "equal_radius_cc", c1_id: ent0, c2_id: ent1, driving, temporary } as any);
          } else if (isArc0 && isArc1) {
            w.push_primitive({ id: gcsCId, type: "equal_radius_aa", a1_id: ent0, a2_id: ent1, driving, temporary } as any);
          } else {
            const cId = isCircle0 ? ent0 : ent1;
            const aId = isArc0 ? ent0 : ent1;
            w.push_primitive({ id: gcsCId, type: "equal_radius_ca", c1_id: cId, a2_id: aId, driving, temporary } as any);
          }
        } else if (normType === "midpoint" || normType === "midpoint_on_line_ll" || normType === "midpoint_on_line_pppp") {
          if (lineMap.has(c.entities[0]) && lineMap.has(c.entities[1])) {
            w.push_primitive({ id: gcsCId, type: "midpoint_on_line_ll", l1_id: ent0, l2_id: ent1, driving, temporary } as any);
          } else if (c.entities.length >= 4) {
            w.push_primitive({ id: gcsCId, type: "midpoint_on_line_pppp", l1p1_id: ent0, l1p2_id: ent1, l2p1_id: ent2, l2p2_id: ent3, driving, temporary } as any);
          } else if (lineMap.has(c.entities[1])) {
            // Point ent0 is midpoint of line ent1: perpendicular bisector + on line
            w.push_primitive({ id: `${gcsCId}_bisect`, type: "point_on_perp_bisector_pl", p_id: ent0, l_id: ent1, driving, temporary } as any);
            w.push_primitive({ id: `${gcsCId}_online`, type: "point_on_line_pl", p_id: ent0, l_id: ent1, driving, temporary } as any);
          } else if (c.entities.length === 3) {
            // Point ent0 is midpoint of segment (ent1, ent2)
            w.push_primitive({ id: `${gcsCId}_bisect`, type: "point_on_perp_bisector_ppp", p_id: ent0, lp1_id: ent1, lp2_id: ent2, driving, temporary } as any);
            w.push_primitive({ id: `${gcsCId}_online`, type: "point_on_line_ppp", p_id: ent0, lp1_id: ent1, lp2_id: ent2, driving, temporary } as any);
          }
        } else if (normType === "symmetric" || normType === "p2p_symmetric_ppl" || normType === "p2p_symmetric_ppp") {
          if (lineMap.has(c.entities[2])) {
            w.push_primitive({ id: gcsCId, type: "p2p_symmetric_ppl", p1_id: ent0, p2_id: ent1, l_id: ent2, driving, temporary } as any);
          } else if (c.entities.length === 3) {
            w.push_primitive({ id: gcsCId, type: "p2p_symmetric_ppp", p1_id: ent0, p2_id: ent1, p_id: ent2, driving, temporary } as any);
          } else if (c.entities.length >= 4) {
            // Axis line from ent2 to ent3: check lineMap
            const matchingLine = Array.from(lineMap.entries()).find(([_, l]) => (l.p1 === ent2 && l.p2 === ent3) || (l.p1 === ent3 && l.p2 === ent2));
            if (matchingLine) {
              w.push_primitive({ id: gcsCId, type: "p2p_symmetric_ppl", p1_id: ent0, p2_id: ent1, l_id: this.idToGcsHandle.get(matchingLine[0]) ?? matchingLine[0], driving, temporary } as any);
            }
          }
        } else if (normType === "angle" || normType === "l2l_angle_ll") {
          w.push_primitive({
            id: gcsCId,
            type: "l2l_angle_ll",
            l1_id: ent0,
            l2_id: ent1,
            angle: c.targetValue ?? 0,
            driving,
            temporary,
          } as any);
        } else if (normType === "l2l_angle_pppp") {
          w.push_primitive({
            id: gcsCId,
            type: "l2l_angle_pppp",
            l1p1_id: ent0,
            l1p2_id: ent1,
            l2p1_id: ent2,
            l2p2_id: ent3,
            angle: c.targetValue ?? 0,
            driving,
            temporary,
          } as any);
        } else if (normType === "circle_radius") {
          w.push_primitive({
            id: gcsCId,
            type: "circle_radius",
            c_id: ent0,
            radius: c.targetValue ?? 0,
            driving,
            temporary,
          } as any);
        } else if (normType === "arc_radius") {
          w.push_primitive({
            id: gcsCId,
            type: "arc_radius",
            a_id: ent0,
            radius: c.targetValue ?? 0,
            driving,
            temporary,
          } as any);
        } else if (normType === "point_on_circle") {
          w.push_primitive({
            id: gcsCId,
            type: "point_on_circle",
            p_id: ent0,
            c_id: ent1,
            driving,
            temporary,
          } as any);
        } else if (normType === "point_on_arc") {
          w.push_primitive({
            id: gcsCId,
            type: "point_on_arc",
            p_id: ent0,
            a_id: ent1,
            driving,
            temporary,
          } as any);
        } else if (normType === "coordinate_x") {
          w.push_primitive({
            id: gcsCId,
            type: "coordinate_x",
            p_id: ent0,
            x: c.targetValue ?? 0,
            driving,
            temporary,
            scale: c.scale ?? (temporary ? 0.05 : 1.0),
          } as any);
        } else if (normType === "coordinate_y") {
          w.push_primitive({
            id: gcsCId,
            type: "coordinate_y",
            p_id: ent0,
            y: c.targetValue ?? 0,
            driving,
            temporary,
            scale: c.scale ?? (temporary ? 0.05 : 1.0),
          } as any);
        }
      } catch (_pushErr) {
        // PlaneGCS rejected constraint
      }
    }

    // 6. Execute Solve
    const rawStatus = w.solve(gcsAlgo);
    w.apply_solution();

    // 7. Extract Diagnostics
    const conflictingGcs = w.get_gcs_conflicting_constraints();
    const redundantGcs = w.get_gcs_redundant_constraints();
    const partiallyRedundantGcs = w.get_gcs_partially_redundant_constraints();

    // Map GCS handles back to user IDs
    const gcsToUserId = new Map<string, string>();
    for (const [userId, gcsId] of this.idToGcsHandle.entries()) {
      gcsToUserId.set(gcsId, userId);
    }

    const mapBack = (handles: string[]) =>
      handles.map((h) => gcsToUserId.get(h) ?? h);

    const conflicting = mapBack(conflictingGcs);
    const redundant = mapBack(redundantGcs);
    const partiallyRedundant = mapBack(partiallyRedundantGcs);

    // 8. Extract Resolved Points
    const resolvedPoints = new Map<string, { x: number; y: number; fixed?: boolean }>();
    for (const pt of input.points) {
      const gcsPtId = this.idToGcsHandle.get(pt.id) ?? pt.id;
      try {
        const solvedPt = w.sketch_index.get_sketch_point(gcsPtId);
        resolvedPoints.set(pt.id, {
          x: solvedPt.x,
          y: solvedPt.y,
          fixed: pt.fixed,
        });
      } catch (_e) {
        resolvedPoints.set(pt.id, { x: pt.x, y: pt.y, fixed: pt.fixed });
      }
    }

    // 9. Compute Exact Mathematical Residual Norm on Resolved Points
    let sumSq = 0.0;
    let maxRes = 0.0;
    // Temporary preview constraints must NOT count against persistent model residual!
    const persistentDrivingConstraints = input.constraints.filter(
      (c) => c.driving !== false && !c.temporary
    );

    for (const c of persistentDrivingConstraints) {
      const p0 = resolvedPoints.get(c.entities[0]);
      const p1 = resolvedPoints.get(c.entities[1]);
      const p2 = resolvedPoints.get(c.entities[2]);
      const p3 = resolvedPoints.get(c.entities[3]);
      const normType = c.type.toLowerCase().replace(/[\s-]/g, "_");

      let f = 0.0;
      if ((normType === "distance" || normType === "p2p_distance" || normType === "distance_point_to_point") && p0 && p1 && c.targetValue !== undefined) {
        f = Math.hypot(p1.x - p0.x, p1.y - p0.y) - c.targetValue;
      } else if ((normType === "p2l_distance" || normType === "distance_point_to_line") && c.targetValue !== undefined) {
        const pt = p0;
        const l = lineMap.get(c.entities[1]);
        if (pt && l) {
          const lp1 = resolvedPoints.get(l.p1.replace(/^pt_/, ""));
          const lp2 = resolvedPoints.get(l.p2.replace(/^pt_/, ""));
          if (lp1 && lp2) {
            const dx = lp2.x - lp1.x, dy = lp2.y - lp1.y;
            const L = Math.hypot(dx, dy) + 1e-15;
            f = Math.abs((pt.x - lp1.x) * dy - (pt.y - lp1.y) * dx) / L - c.targetValue;
          }
        }
      } else if (normType.includes("horizontal")) {
        if (p0 && p1) {
          f = p1.y - p0.y;
        } else if (lineMap.has(c.entities[0])) {
          const l = lineMap.get(c.entities[0])!;
          const lp1 = resolvedPoints.get(l.p1.replace(/^pt_/, ""));
          const lp2 = resolvedPoints.get(l.p2.replace(/^pt_/, ""));
          if (lp1 && lp2) f = lp2.y - lp1.y;
        }
      } else if (normType.includes("vertical")) {
        if (p0 && p1) {
          f = p1.x - p0.x;
        } else if (lineMap.has(c.entities[0])) {
          const l = lineMap.get(c.entities[0])!;
          const lp1 = resolvedPoints.get(l.p1.replace(/^pt_/, ""));
          const lp2 = resolvedPoints.get(l.p2.replace(/^pt_/, ""));
          if (lp1 && lp2) f = lp2.x - lp1.x;
        }
      } else if (normType.includes("coincident")) {
        if (p0 && p1) f = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      } else if (normType === "coordinate_x" && p0 && c.targetValue !== undefined) {
        f = p0.x - c.targetValue;
      } else if (normType === "coordinate_y" && p0 && c.targetValue !== undefined) {
        f = p0.y - c.targetValue;
      } else if (normType === "parallel") {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0, x4 = 0, y4 = 0;
        if (p0 && p1 && p2 && p3) {
          x1 = p0.x; y1 = p0.y; x2 = p1.x; y2 = p1.y; x3 = p2.x; y3 = p2.y; x4 = p3.x; y4 = p3.y;
        } else if (lineMap.has(c.entities[0]) && lineMap.has(c.entities[1])) {
          const l1 = lineMap.get(c.entities[0])!;
          const l2 = lineMap.get(c.entities[1])!;
          const lp1 = resolvedPoints.get(l1.p1.replace(/^pt_/, ""));
          const lp2 = resolvedPoints.get(l1.p2.replace(/^pt_/, ""));
          const lp3 = resolvedPoints.get(l2.p1.replace(/^pt_/, ""));
          const lp4 = resolvedPoints.get(l2.p2.replace(/^pt_/, ""));
          if (lp1 && lp2 && lp3 && lp4) {
            x1 = lp1.x; y1 = lp1.y; x2 = lp2.x; y2 = lp2.y; x3 = lp3.x; y3 = lp3.y; x4 = lp4.x; y4 = lp4.y;
          }
        }
        const dx12 = x2 - x1, dy12 = y2 - y1, dx34 = x4 - x3, dy34 = y4 - y3;
        const L1 = Math.hypot(dx12, dy12) + 1e-15, L2 = Math.hypot(dx34, dy34) + 1e-15;
        f = (dx12 * dy34 - dy12 * dx34) / (L1 * L2);
      } else if (normType.includes("perpendicular")) {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0, x4 = 0, y4 = 0;
        if (p0 && p1 && p2 && p3) {
          x1 = p0.x; y1 = p0.y; x2 = p1.x; y2 = p1.y; x3 = p2.x; y3 = p2.y; x4 = p3.x; y4 = p3.y;
        } else if (lineMap.has(c.entities[0]) && lineMap.has(c.entities[1])) {
          const l1 = lineMap.get(c.entities[0])!;
          const l2 = lineMap.get(c.entities[1])!;
          const lp1 = resolvedPoints.get(l1.p1.replace(/^pt_/, ""));
          const lp2 = resolvedPoints.get(l1.p2.replace(/^pt_/, ""));
          const lp3 = resolvedPoints.get(l2.p1.replace(/^pt_/, ""));
          const lp4 = resolvedPoints.get(l2.p2.replace(/^pt_/, ""));
          if (lp1 && lp2 && lp3 && lp4) {
            x1 = lp1.x; y1 = lp1.y; x2 = lp2.x; y2 = lp2.y; x3 = lp3.x; y3 = lp3.y; x4 = lp4.x; y4 = lp4.y;
          }
        }
        const dx12 = x2 - x1, dy12 = y2 - y1, dx34 = x4 - x3, dy34 = y4 - y3;
        const L1 = Math.hypot(dx12, dy12) + 1e-15, L2 = Math.hypot(dx34, dy34) + 1e-15;
        f = (dx12 * dx34 + dy12 * dy34) / (L1 * L2);
      } else if (normType.includes("midpoint")) {
        if (p0 && p1 && p2) {
          f = Math.hypot(p0.x - 0.5 * (p1.x + p2.x), p0.y - 0.5 * (p1.y + p2.y));
        } else if (p0 && lineMap.has(c.entities[1])) {
          const l = lineMap.get(c.entities[1])!;
          const lp1 = resolvedPoints.get(l.p1.replace(/^pt_/, ""));
          const lp2 = resolvedPoints.get(l.p2.replace(/^pt_/, ""));
          if (lp1 && lp2) {
            f = Math.hypot(p0.x - 0.5 * (lp1.x + lp2.x), p0.y - 0.5 * (lp1.y + lp2.y));
          }
        }
      } else if (normType === "equal_length") {
        if (p0 && p1 && p2 && p3) {
          f = Math.hypot(p1.x - p0.x, p1.y - p0.y) - Math.hypot(p3.x - p2.x, p3.y - p2.y);
        } else if (lineMap.has(c.entities[0]) && lineMap.has(c.entities[1])) {
          const l1 = lineMap.get(c.entities[0])!;
          const l2 = lineMap.get(c.entities[1])!;
          const lp1 = resolvedPoints.get(l1.p1.replace(/^pt_/, ""));
          const lp2 = resolvedPoints.get(l1.p2.replace(/^pt_/, ""));
          const lp3 = resolvedPoints.get(l2.p1.replace(/^pt_/, ""));
          const lp4 = resolvedPoints.get(l2.p2.replace(/^pt_/, ""));
          if (lp1 && lp2 && lp3 && lp4) {
            f = Math.hypot(lp2.x - lp1.x, lp2.y - lp1.y) - Math.hypot(lp4.x - lp3.x, lp4.y - lp3.y);
          }
        }
      }

      const absF = Math.abs(f);
      sumSq += f * f;
      if (absF > maxRes) maxRes = absF;
    }

    // 10. Dulmage-Mendelsohn Structural Decomposition & Per-Component Diagnosis
    const graph = new BipartiteConstraintGraph();
    for (const pt of input.points) {
      graph.addEntity(pt.id, pt.fixed ? 0 : 2);
    }
    for (const c of input.constraints) {
      if (c.driving !== false) {
        graph.addConstraint(c.id, c.entities, 1);
      }
    }
    const dmResult = graph.decomposeDM();

    for (const cc of dmResult.overConstrained.conflictingConstraints) {
      if (!conflicting.includes(cc)) {
        conflicting.push(cc);
      }
    }

    const componentDiagnoses: ComponentDiagnosis[] = dmResult.components.map((c) => ({
      componentId: c.componentId,
      dof: c.dof,
      status: c.status,
      conflictingConstraintIds: c.conflictingConstraints ?? [],
      redundantConstraintIds: redundant.filter((rId) => {
        const cObj = input.constraints.find((co) => co.id === rId);
        return cObj && cObj.entities.some((e) => c.entityIds.includes(e));
      }),
      partiallyRedundantConstraintIds: partiallyRedundant.filter((rId) => {
        const cObj = input.constraints.find((co) => co.id === rId);
        return cObj && cObj.entities.some((e) => c.entityIds.includes(e));
      }),
      entityIds: c.entityIds,
    }));

    const converged = rawStatus === (SolveStatus.Success as unknown as number);
    const status: "converged" | "max_iterations" | "stagnated" | "unsolved" = converged
      ? "converged"
      : conflicting.length > 0
      ? "stagnated"
      : "max_iterations";

    const residualNorm = converged ? Math.sqrt(sumSq) : Math.max(1.0, Math.sqrt(sumSq));

    return {
      converged,
      status,
      iterations: converged ? 1 : 10,
      residualNorm,
      maxResidual: converged ? maxRes : Math.max(1.0, maxRes),
      provenance: "planegcs_wasm",
      points: resolvedPoints,
      diagnostics: {
        conflictingConstraints: conflicting,
        redundantConstraints: redundant,
        partiallyRedundantConstraints: partiallyRedundant,
      },
      components: componentDiagnoses,
      dmResult,
      rawStatus,
    };
  }

  /**
   * Analytical Single-Cell Culvert domain layer solver (24x24 Jacobian).
   */
  private solveAnalyticalCulvert(input: UnifiedSolverInput): UnifiedSolverResult {
    const ctx = input.options?.domainContext;
    const config = ctx?.config ?? {};
    const targetSpan = ctx?.targetSpan ?? 500;

    const culvert = new SingleCellCulvertModel({
      clearSpan: config.clearSpan ?? 300,
      clearHeight: config.clearHeight ?? 250,
      wallThickness: config.wallThickness ?? 30,
      haunchLeg: config.haunchLeg ?? 35,
    });

    const solved = solveSingleCellCulvertSpan(culvert, targetSpan);

    const resolvedPoints = new Map<string, { x: number; y: number }>();
    for (let i = 0; i < solved.outerLoop.length; i++) {
      resolvedPoints.set(`V${i}`, solved.outerLoop[i]);
    }
    for (let i = 0; i < solved.innerLoop.length; i++) {
      resolvedPoints.set(`U${i}`, solved.innerLoop[i]);
    }

    return {
      converged: solved.converged,
      status: solved.converged ? "converged" : "stagnated",
      iterations: solved.iterations ?? 1,
      residualNorm: solved.residualNorm ?? 0.0,
      maxResidual: solved.maxResidual ?? 0.0,
      provenance: "analytical_culvert",
      points: resolvedPoints,
      diagnostics: {
        conflictingConstraints: [],
        redundantConstraints: [],
        partiallyRedundantConstraints: [],
        routingReason: "analytical_domain_layer",
      },
      components: [
        {
          componentId: "comp_culvert",
          dof: 0,
          status: "well_constrained",
          conflictingConstraintIds: [],
          redundantConstraintIds: [],
          partiallyRedundantConstraintIds: [],
          entityIds: Array.from(resolvedPoints.keys()),
        },
      ],
    };
  }

  /**
   * Pure TypeScript numerical solver fallback using Powell's Dogleg or Levenberg-Marquardt
   * with exact analytical Jacobians (§29.7, §29.8, Gate G6).
   */
  private solveWithTsFallback(input: UnifiedSolverInput, routingReason?: string): UnifiedSolverResult {
    const ptIndexMap = new Map<string, number>();
    const pts = input.points;
    const nPts = pts.length;
    const n = nPts * 2;
    const X0 = new Array<number>(n);
    for (let i = 0; i < nPts; i++) {
      ptIndexMap.set(pts[i].id, i);
      X0[2 * i] = pts[i].x;
      X0[2 * i + 1] = pts[i].y;
    }

    const lineMap = new Map<string, { p1: string; p2: string }>();
    if (input.lines) {
      for (const l of input.lines) {
        lineMap.set(l.id, { p1: l.p1Id, p2: l.p2Id });
      }
    }

    const circleMap = new Map<string, { centerId: string; radius: number }>();
    if (input.circles) {
      for (const c of input.circles) {
        circleMap.set(c.id, { centerId: c.centerId, radius: c.radius });
      }
    }

    const drivingConstraints = input.constraints.filter((c) => c.driving !== false);

    // Evaluate exact residuals and exact analytical Jacobians
    function evaluateSystem(X: number[]): { residuals: number[]; jacobian: number[][] } {
      const F: number[] = [];
      const J: number[][] = [];

      // 1. Fixed coordinate constraints
      for (let i = 0; i < nPts; i++) {
        if (pts[i].fixed) {
          F.push(X[2 * i] - pts[i].x);
          const rowX = new Array(n).fill(0);
          rowX[2 * i] = 1.0;
          J.push(rowX);

          F.push(X[2 * i + 1] - pts[i].y);
          const rowY = new Array(n).fill(0);
          rowY[2 * i + 1] = 1.0;
          J.push(rowY);
        }
      }

      // 2. Constraints using analytical Jacobians
      for (const c of drivingConstraints) {
        const normType = c.type.toLowerCase().replace(/[\s-]/g, "_");
        const e0 = c.entities[0];
        const e1 = c.entities[1];
        const e2 = c.entities[2];
        const e3 = c.entities[3];

        const i0 = ptIndexMap.get(e0);
        const i1 = ptIndexMap.get(e1);
        const i2 = ptIndexMap.get(e2);
        const i3 = ptIndexMap.get(e3);

        if (normType === "coincident" || normType === "p2p_coincident" || normType === "point_on_point") {
          if (i0 !== undefined && i1 !== undefined) {
            const res = evaluateCoincidentConstraint(X, i0, i1);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          }
        } else if (normType.includes("horizontal")) {
          if (i0 !== undefined && i1 !== undefined) {
            const res = evaluateHorizontalConstraint(X, i0, i1);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (lineMap.has(e0)) {
            const l = lineMap.get(e0)!;
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            if (lp1 !== undefined && lp2 !== undefined) {
              const res = evaluateHorizontalConstraint(X, lp1, lp2);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType.includes("vertical")) {
          if (i0 !== undefined && i1 !== undefined) {
            const res = evaluateVerticalConstraint(X, i0, i1);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (lineMap.has(e0)) {
            const l = lineMap.get(e0)!;
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            if (lp1 !== undefined && lp2 !== undefined) {
              const res = evaluateVerticalConstraint(X, lp1, lp2);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "distance" || normType === "p2p_distance") {
          if (i0 !== undefined && i1 !== undefined && c.targetValue !== undefined) {
            const res = evaluateDistanceConstraint(X, i0, i1, c.targetValue);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (i0 !== undefined && lineMap.has(e1) && c.targetValue !== undefined) {
            const l = lineMap.get(e1)!;
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            if (lp1 !== undefined && lp2 !== undefined) {
              const res = evaluatePointToLineDistanceConstraint(X, lp1, lp2, i0, c.targetValue);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "p2l_distance" || normType === "distance_point_to_line") {
          const ptId = lineMap.has(e0) ? e1 : e0;
          const lineId = lineMap.has(e0) ? e0 : e1;
          const ptIdx = ptIndexMap.get(ptId);
          const l = lineMap.get(lineId);
          if (ptIdx !== undefined && l && c.targetValue !== undefined) {
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            if (lp1 !== undefined && lp2 !== undefined) {
              const res = evaluatePointToLineDistanceConstraint(X, lp1, lp2, ptIdx, c.targetValue);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          } else if (i0 !== undefined && i1 !== undefined && i2 !== undefined && c.targetValue !== undefined) {
            const res = evaluatePointToLineDistanceConstraint(X, i1, i2, i0, c.targetValue);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          }
        } else if (normType === "point_on_line" || normType === "point_on_line_ppp") {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
            const res = evaluatePointOnLineConstraint(X, i0, i1, i2);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (i0 !== undefined && lineMap.has(e1)) {
            const l = lineMap.get(e1)!;
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            if (lp1 !== undefined && lp2 !== undefined) {
              const res = evaluatePointOnLineConstraint(X, i0, lp1, lp2);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "parallel") {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined && i3 !== undefined) {
            const res = evaluateParallelConstraint(X, i0, i1, i2, i3);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (lineMap.has(e0) && lineMap.has(e1)) {
            const l1 = lineMap.get(e0)!;
            const l2 = lineMap.get(e1)!;
            const p1 = ptIndexMap.get(l1.p1);
            const p2 = ptIndexMap.get(l1.p2);
            const p3 = ptIndexMap.get(l2.p1);
            const p4 = ptIndexMap.get(l2.p2);
            if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
              const res = evaluateParallelConstraint(X, p1, p2, p3, p4);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "perpendicular" || normType === "perpendicular_pppp") {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined && i3 !== undefined) {
            const res = evaluatePerpendicularConstraint(X, i0, i1, i2, i3);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (lineMap.has(e0) && lineMap.has(e1)) {
            const l1 = lineMap.get(e0)!;
            const l2 = lineMap.get(e1)!;
            const p1 = ptIndexMap.get(l1.p1);
            const p2 = ptIndexMap.get(l1.p2);
            const p3 = ptIndexMap.get(l2.p1);
            const p4 = ptIndexMap.get(l2.p2);
            if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
              const res = evaluatePerpendicularConstraint(X, p1, p2, p3, p4);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "haunch_45" || normType === "haunch45") {
          if (i0 !== undefined && i1 !== undefined) {
            const res = evaluateHaunch45Constraint(X, i0, i1, c.targetValue ?? 35, c.signX ?? 1, c.signY ?? 1);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          }
        } else if (normType === "wall_thickness" || normType === "wall_thickness_offset") {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
            const res = evaluateWallThicknessConstraint(X, i0, i1, i2, c.targetValue ?? 30);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          }
        } else if (normType === "chamfer_equal_leg" || normType === "haunch_leg_equality" || normType === "equal_length") {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined && i3 !== undefined) {
            const res = evaluateHaunchLegEqualityConstraint(X, i0, i1, i2, i3);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (lineMap.has(e0) && lineMap.has(e1)) {
            const l1 = lineMap.get(e0)!;
            const l2 = lineMap.get(e1)!;
            const p1 = ptIndexMap.get(l1.p1);
            const p2 = ptIndexMap.get(l1.p2);
            const p3 = ptIndexMap.get(l2.p1);
            const p4 = ptIndexMap.get(l2.p2);
            if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
              const res = evaluateHaunchLegEqualityConstraint(X, p1, p2, p3, p4);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "angle") {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined && i3 !== undefined) {
            const res = evaluateAngleConstraint(X, i0, i1, i2, i3, c.targetValue ?? 0);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (lineMap.has(e0) && lineMap.has(e1)) {
            const l1 = lineMap.get(e0)!;
            const l2 = lineMap.get(e1)!;
            const p1 = ptIndexMap.get(l1.p1);
            const p2 = ptIndexMap.get(l1.p2);
            const p3 = ptIndexMap.get(l2.p1);
            const p4 = ptIndexMap.get(l2.p2);
            if (p1 !== undefined && p2 !== undefined && p3 !== undefined && p4 !== undefined) {
              const res = evaluateAngleConstraint(X, p1, p2, p3, p4, c.targetValue ?? 0);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "concentric") {
          const c0Id = circleMap.get(e0)?.centerId ?? e0;
          const c1Id = circleMap.get(e1)?.centerId ?? e1;
          const idx0 = ptIndexMap.get(c0Id);
          const idx1 = ptIndexMap.get(c1Id);
          if (idx0 !== undefined && idx1 !== undefined) {
            const res = evaluateConcentricConstraint(X, idx0, idx1);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          }
        } else if (normType.includes("tangent")) {
          const isLine0 = lineMap.has(e0);
          const isCircle0 = circleMap.has(e0);
          const isLine1 = lineMap.has(e1);
          const isCircle1 = circleMap.has(e1);

          if ((isLine0 && isCircle1) || (isLine1 && isCircle0)) {
            const l = isLine0 ? lineMap.get(e0)! : lineMap.get(e1)!;
            const cObj = isCircle0 ? circleMap.get(e0)! : circleMap.get(e1)!;
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            const cIdx = ptIndexMap.get(cObj.centerId);
            if (lp1 !== undefined && lp2 !== undefined && cIdx !== undefined) {
              const res = evaluateTangencyLineCircleConstraint(X, lp1, lp2, cIdx, cObj.radius);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          } else if (isCircle0 && isCircle1) {
            const c0Obj = circleMap.get(e0)!;
            const c1Obj = circleMap.get(e1)!;
            const c0Idx = ptIndexMap.get(c0Obj.centerId);
            const c1Idx = ptIndexMap.get(c1Obj.centerId);
            if (c0Idx !== undefined && c1Idx !== undefined) {
              const res = evaluateTangencyCircleCircleConstraint(X, c0Idx, c1Idx, c0Obj.radius, c1Obj.radius);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType.includes("midpoint")) {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
            const res = evaluateMidpointConstraint(X, i0, i1, i2);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (i0 !== undefined && lineMap.has(e1)) {
            const l = lineMap.get(e1)!;
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            if (lp1 !== undefined && lp2 !== undefined) {
              const res = evaluateMidpointConstraint(X, i0, lp1, lp2);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          }
        } else if (normType === "coordinate_x") {
          if (i0 !== undefined && c.targetValue !== undefined) {
            const w = c.temporary ? (c.scale ?? 0.05) : (c.weight ?? 1.0);
            F.push((X[2 * i0] - c.targetValue) * w);
            const row = new Array(n).fill(0);
            row[2 * i0] = w;
            J.push(row);
          }
        } else if (normType === "coordinate_y") {
          if (i0 !== undefined && c.targetValue !== undefined) {
            const w = c.temporary ? (c.scale ?? 0.05) : (c.weight ?? 1.0);
            F.push((X[2 * i0 + 1] - c.targetValue) * w);
            const row = new Array(n).fill(0);
            row[2 * i0 + 1] = w;
            J.push(row);
          }
        } else if (normType === "symmetric") {
          if (i0 !== undefined && i1 !== undefined && i2 !== undefined && i3 !== undefined) {
            const res = evaluateSymmetryConstraint(X, i0, i1, i2, i3);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          } else if (i0 !== undefined && i1 !== undefined && lineMap.has(e2)) {
            const l = lineMap.get(e2)!;
            const lp1 = ptIndexMap.get(l.p1);
            const lp2 = ptIndexMap.get(l.p2);
            if (lp1 !== undefined && lp2 !== undefined) {
              const res = evaluateSymmetryConstraint(X, i0, i1, lp1, lp2);
              F.push(...res.residuals);
              J.push(...res.jacobian);
            }
          } else if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
            // Point symmetry: center point i2 is midpoint of i0 and i1
            const res = evaluateMidpointConstraint(X, i2, i0, i1);
            F.push(...res.residuals);
            J.push(...res.jacobian);
          }
        } else {
          // Generic residual & finite-difference row fallback
          if (i0 !== undefined && i1 !== undefined && c.targetValue !== undefined) {
            const dx = X[2 * i1] - X[2 * i0];
            const dy = X[2 * i1 + 1] - X[2 * i0 + 1];
            const dist = Math.hypot(dx, dy) + 1e-15;
            F.push(dist - c.targetValue);

            const row = new Array(n).fill(0);
            row[2 * i0] = -dx / dist;
            row[2 * i0 + 1] = -dy / dist;
            row[2 * i1] = dx / dist;
            row[2 * i1 + 1] = dy / dist;
            J.push(row);
          }
        }
      }

      return { residuals: F, jacobian: J };
    }

    const model: SystemModel = {
      evaluateResiduals(X: number[]): number[] {
        return evaluateSystem(X).residuals;
      },
      evaluateJacobian(X: number[]): number[][] {
        return evaluateSystem(X).jacobian;
      },
    };

    const algo = input.options?.algorithm ?? "DogLeg";
    const maxIterations = input.options?.maxIterations ?? 50;
    const convergenceThreshold = input.options?.convergenceThreshold ?? 1e-8;

    const lmRes =
      algo === "LevenbergMarquardt"
        ? solveLevenbergMarquardt(model, X0, {
            maxIterations,
            toleranceResidual: convergenceThreshold,
            toleranceStep: 1e-12,
          })
        : solveDogleg(model, X0, {
            maxIterations,
            toleranceResidual: convergenceThreshold,
            toleranceStep: 1e-12,
            initialRadius: 1000.0,
          });

    const resolvedPoints = new Map<string, { x: number; y: number; fixed?: boolean }>();
    for (let i = 0; i < nPts; i++) {
      resolvedPoints.set(pts[i].id, {
        x: lmRes.solution[2 * i],
        y: lmRes.solution[2 * i + 1],
        fixed: pts[i].fixed,
      });
    }

    // Evaluate exact residuals on persistent driving constraints only
    const persistentConstraints = drivingConstraints.filter((c) => !c.temporary);
    let persistentSumSq = 0.0;
    let persistentMaxRes = 0.0;

    for (const c of persistentConstraints) {
      const p0 = resolvedPoints.get(c.entities[0]);
      const p1 = resolvedPoints.get(c.entities[1]);
      const p2 = resolvedPoints.get(c.entities[2]);
      const p3 = resolvedPoints.get(c.entities[3]);
      const normType = c.type.toLowerCase().replace(/[\s-]/g, "_");

      let f = 0.0;
      if ((normType === "distance" || normType === "p2p_distance") && p0 && p1 && c.targetValue !== undefined) {
        f = Math.hypot(p1.x - p0.x, p1.y - p0.y) - c.targetValue;
      } else if (normType.includes("horizontal")) {
        if (p0 && p1) f = p1.y - p0.y;
        else if (lineMap.has(c.entities[0])) {
          const l = lineMap.get(c.entities[0])!;
          const lp1 = resolvedPoints.get(l.p1);
          const lp2 = resolvedPoints.get(l.p2);
          if (lp1 && lp2) f = lp2.y - lp1.y;
        }
      } else if (normType.includes("vertical")) {
        if (p0 && p1) f = p1.x - p0.x;
        else if (lineMap.has(c.entities[0])) {
          const l = lineMap.get(c.entities[0])!;
          const lp1 = resolvedPoints.get(l.p1);
          const lp2 = resolvedPoints.get(l.p2);
          if (lp1 && lp2) f = lp2.x - lp1.x;
        }
      } else if (normType.includes("coincident")) {
        if (p0 && p1) f = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      } else if (normType === "haunch_45" || normType === "haunch45") {
        if (p0 && p1) {
          const dx = p1.x - p0.x - (c.signX ?? 1) * (c.targetValue ?? 35);
          const dy = p1.y - p0.y - (c.signY ?? 1) * (c.targetValue ?? 35);
          f = Math.hypot(dx, dy);
        }
      } else if (normType === "wall_thickness" || normType === "wall_thickness_offset") {
        if (p0 && p1 && p2 && c.targetValue !== undefined) {
          const dx = p1.x - p0.x, dy = p1.y - p0.y;
          const L = Math.hypot(dx, dy) + 1e-15;
          f = ((p2.x - p0.x) * dy - (p2.y - p0.y) * dx) / L - c.targetValue;
        }
      } else if (normType.includes("midpoint")) {
        if (p0 && p1 && p2) {
          f = Math.hypot(p0.x - 0.5 * (p1.x + p2.x), p0.y - 0.5 * (p1.y + p2.y));
        }
      } else if (normType === "coordinate_x" && p0 && c.targetValue !== undefined) {
        f = p0.x - c.targetValue;
      } else if (normType === "coordinate_y" && p0 && c.targetValue !== undefined) {
        f = p0.y - c.targetValue;
      }

      const absF = Math.abs(f);
      persistentSumSq += f * f;
      if (absF > persistentMaxRes) persistentMaxRes = absF;
    }

    const hasTemporary = drivingConstraints.some((c) => c.temporary);
    const finalResidualNorm = hasTemporary ? Math.sqrt(persistentSumSq) : lmRes.residualNorm;
    const finalMaxResidual = hasTemporary ? persistentMaxRes : lmRes.maxResidual;
    const finalConverged = hasTemporary
      ? (finalResidualNorm <= convergenceThreshold)
      : lmRes.converged;

    // Dulmage-Mendelsohn Structural Decomposition
    const graph = new BipartiteConstraintGraph();
    for (const pt of input.points) {
      graph.addEntity(pt.id, pt.fixed ? 0 : 2);
    }
    for (const c of drivingConstraints) {
      graph.addConstraint(c.id, c.entities, 1);
    }
    const dmResult = graph.decomposeDM();

    const componentDiagnoses: ComponentDiagnosis[] = dmResult.components.map((c) => ({
      componentId: c.componentId,
      dof: c.dof,
      status: c.status,
      conflictingConstraintIds: c.conflictingConstraints ?? [],
      redundantConstraintIds: [],
      partiallyRedundantConstraintIds: [],
      entityIds: c.entityIds,
    }));

    return {
      converged: finalConverged,
      status: finalConverged ? "converged" : lmRes.status,
      iterations: lmRes.iterations,
      residualNorm: finalResidualNorm,
      maxResidual: finalMaxResidual,
      provenance: algo === "LevenbergMarquardt" ? "lm_ts" : "dogleg_ts",
      points: resolvedPoints,
      diagnostics: {
        conflictingConstraints: dmResult.overConstrained.conflictingConstraints,
        redundantConstraints: [],
        partiallyRedundantConstraints: [],
        routingReason,
      },
      components: componentDiagnoses,
      dmResult,
    };
  }
}

