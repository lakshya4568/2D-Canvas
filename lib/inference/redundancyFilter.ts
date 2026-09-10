/**
 * Redundancy & Conflict Suppression Engine with Self-Healing Recovery
 * UPCE-MASTER-1.0 §86, §30, §32, §39–§42, Gate G8 (§76)
 *
 * Implements:
 * 1. Priority-ordered candidate gating:
 *    - Tier 1 (Primary Structural Clearances): WallThickness, ClearSpan, ClearHeight,
 *      TopSlabThickness, BottomSlabThickness, HaunchLeg, Concentric RadialOffset.
 *    - Tier 2 (Inviolable Geometric Facts): Coincidence welds (P8), Orthogonality (P2), Parallelism (P1).
 *    - Tier 3 (Secondary Incidental Alignments): EqualLength, PointOnLine, Symmetry (P9), Auxiliary Offsets.
 * 2. Real-time SVD row-space admissibility projection (||g_perp|| >= 1e-6) per §32.
 * 3. Self-healing conflict recovery: retracting lower-priority secondary alignments when they
 *    obstruct or conflict with primary civil/structural clearances.
 * 4. Bipartite Dulmage-Mendelsohn (DM) structural decomposition to guarantee well-behaved constraint graphs.
 */

import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { svd } from "../solver/matrix/svd";
import {
  evaluateCandidateAdmissibility,
  AdmissibilityEvaluation,
} from "./admissibilityFilter";
import {
  ConstraintCandidate,
  CandidateLifecycleStatus,
} from "./candidateClusterer";
import { BipartiteConstraintGraph } from "../parametric/graph/bipartiteGraph";
import {
  DulmageMendelsohnSolver,
  DMResult,
  traceConflictsViaSVD,
} from "../parametric/graph/dulmageMendelsohn";

export type ConstraintPriorityTier = 1 | 2 | 3;

export interface RedundancyFilterOptions {
  policy?: TolerancePolicy;
  discardRedundant?: boolean; // If true, discard redundant constraints (default: true)
  enableSelfHealing?: boolean; // If true, retracts secondary alignments in favor of primary clearances (default: true)
  vertexIndexMap?: Map<string, number>;
  initialCandidates?: ConstraintCandidate[]; // Pre-existing active constraints from session
  preserveOrder?: boolean; // If true, stream in given candidate order rather than pre-sorting
  /**
   * §18 anchor rule: the entity that fixes the datum and removes the component's
   * three global rigid-body DOF. Without it the DM report charges every sketch
   * three spurious degrees of freedom.
   */
  anchorEntityId?: string;
}

export interface RedundancyFilterResult {
  admissibleCandidates: ConstraintCandidate[];
  redundantCandidates: ConstraintCandidate[];
  conflictingCandidates: ConstraintCandidate[];
  suppressedCandidates: ConstraintCandidate[];
  healingLog: string[];
  dmResult: DMResult;
  systemRank: number;
}

const PRIMARY_STRUCTURAL_NAMES = new Set([
  "WallThickness",
  "ClearSpan",
  "ClearHeight",
  "TopSlabThickness",
  "BottomSlabThickness",
  "IntermediateWallThickness",
  "DividingWallThickness",
  "HaunchLeg",
  "CornerChamfer",
  "PierWidth",
  "PierSpacing",
  "ParapetHeight",
  "RadialOffset",
]);

/**
 * Determines the priority tier of a candidate constraint.
 * Tier 1: Primary Structural Clearances
 * Tier 2: Hard Invariants
 * Tier 3: Secondary Incidental Alignments
 */
/**
 * Equations contributed by one candidate.
 *
 * §22's compilation table is the authority: an `offset` is "not native — compiles
 * to Parallel + equal perpendicular distance", so P3 contributes TWO equations.
 * Counting it as one made the DOF report disagree with the system actually handed
 * to the solver (DEC-057).
 */
export function equationCountFor(candidate: ConstraintCandidate): number {
  switch (candidate.predicate) {
    case "P8_COINCIDENCE":
      return 2;
    case "P3_PARALLEL_OFFSET":
      // §22 says an offset is Parallel + equal perpendicular distance — TWO
      // equations. Only the distance half is currently compiled into the solver
      // (see the DEC-057 note in autonomousDiscoveryPipeline.ts), so counting 2
      // here would make the DOF report claim a system tighter than the one the
      // solver actually receives. Raise this to 2 in the same change that fixes
      // the compilation, not before.
      return 1;
    default:
      return 1;
  }
}

export function getCandidatePriorityTier(candidate: ConstraintCandidate): ConstraintPriorityTier {
  // User constraints always take highest priority
  if (candidate.confidence === "UserConstraint") {
    return 1;
  }

  // Tier 1: Primary structural clearances & haunches
  if (
    (candidate.predicate === "P3_PARALLEL_OFFSET" &&
      candidate.parameterName &&
      PRIMARY_STRUCTURAL_NAMES.has(candidate.parameterName)) ||
    candidate.predicate === "P4_CORNER_CHAMFER" ||
    candidate.predicate === "P5_CONCENTRIC_RADIAL_OFFSET"
  ) {
    return 1;
  }

  // Tier 2: Hard geometric facts (vertex welds, perpendicularity, parallelism)
  if (
    candidate.predicate === "P8_COINCIDENCE" ||
    candidate.predicate === "P2_PERPENDICULAR" ||
    candidate.predicate === "P1_PARALLEL" ||
    candidate.predicate === "FIXED_ENTITY"
  ) {
    return 2;
  }

  // Tier 3: Secondary alignments
  return 3;
}

/**
 * Priority-based candidate filter with real-time SVD row-space gating and self-healing recovery.
 */
export function filterCandidatesWithPriorityAndDM(
  candidates: ConstraintCandidate[],
  options: RedundancyFilterOptions = {}
): RedundancyFilterResult {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const discardRedundant = options.discardRedundant ?? true;
  const enableSelfHealing = options.enableSelfHealing ?? true;

  // 1. Sort candidates into priority order (Tier 1 first, then Tier 2, then Tier 3), unless preserveOrder is set
  const prioritizedCandidates = options.preserveOrder
    ? [...candidates]
    : [...candidates].sort((a, b) => {
        const tierA = getCandidatePriorityTier(a);
        const tierB = getCandidatePriorityTier(b);
        if (tierA !== tierB) return tierA - tierB;
        // Secondary tie-breaker: GeometricFact before Inference
        if (a.confidence === "GeometricFact" && b.confidence !== "GeometricFact") return -1;
        if (b.confidence === "GeometricFact" && a.confidence !== "GeometricFact") return 1;
        return 0;
      });

  const activeCandidates: ConstraintCandidate[] = [];
  const activeJacobian: number[][] = [];
  const candidateIdToIndex = new Map<string, number>();

  // Pre-seed initial candidates if provided
  if (options.initialCandidates) {
    for (const initCand of options.initialCandidates) {
      if (initCand.gradient && initCand.gradient.length > 0) {
        candidateIdToIndex.set(initCand.id, activeJacobian.length);
        activeJacobian.push(initCand.gradient);
        activeCandidates.push(initCand);
      }
    }
  }

  const redundantCandidates: ConstraintCandidate[] = [];
  const conflictingCandidates: ConstraintCandidate[] = [];
  const suppressedCandidates: ConstraintCandidate[] = [];
  const healingLog: string[] = [];

  // 2. Stream candidates through SVD row-space admissibility
  for (const cand of prioritizedCandidates) {
    const tier = getCandidatePriorityTier(cand);

    // If candidate has no gradient vector, evaluate topology-only
    if (!cand.gradient || cand.gradient.length === 0) {
      activeCandidates.push(cand);
      cand.status = "admissible";
      continue;
    }

    const grad = cand.gradient;
    const residual = cand.residual ?? 0.0;

    // Evaluate against current active Jacobian
    const evalRes = evaluateCandidateAdmissibility(activeJacobian, grad, residual, { policy });

    if (evalRes.isAdmissible) {
      // Independent constraint row: admit immediately
      cand.status = "admissible";
      candidateIdToIndex.set(cand.id, activeJacobian.length);
      activeJacobian.push(grad);
      activeCandidates.push(cand);
    } else if (evalRes.status === "redundant") {
      // Linearly dependent with satisfied residual: redundant constraint
      cand.status = "redundant";
      cand.diagnosis = evalRes.diagnosis;
      redundantCandidates.push(cand);
      if (!discardRedundant) {
        // Keep in list with status redundant if not discarding
      }
    } else if (evalRes.status === "conflicting") {
      // Linearly dependent with non-zero residual: mathematical conflict!
      let resolvedBySelfHealing = false;

      if (enableSelfHealing && tier === 1) {
        // Self-Healing Recovery: A Primary Structural Clearance is obstructed!
        // Check if any currently active constraints are Tier 3 (secondary incidental alignments)
        const secondaryActiveIndices: number[] = [];
        for (let i = 0; i < activeCandidates.length; i++) {
          if (getCandidatePriorityTier(activeCandidates[i]) === 3) {
            secondaryActiveIndices.push(i);
          }
        }

        if (secondaryActiveIndices.length > 0) {
          // Trace which constraints in activeJacobian + [grad] participate in the conflicting nullspace mode
          const testJ = [...activeJacobian, grad];
          const testF = [...activeCandidates.map((c) => c.residual ?? 0.0), residual];
          const testIds = [...activeCandidates.map((c) => c.id), cand.id];

          const conflictAnalysis = traceConflictsViaSVD(
            testJ,
            testF,
            testIds,
            policy.singular_value_eps ?? 1e-8,
            policy.geometry_mm ?? 1e-4
          );

          // Find if any conflicting constraint is Tier 3
          const toRetractIndices = new Set<number>();
          for (const secIdx of secondaryActiveIndices) {
            const secCand = activeCandidates[secIdx];
            if (conflictAnalysis.conflictingConstraints.includes(secCand.id)) {
              toRetractIndices.add(secIdx);
            }
          }

          if (toRetractIndices.size > 0) {
            // Retract conflicting secondary constraints
            const retainedCandidates: ConstraintCandidate[] = [];
            const retainedJacobian: number[][] = [];

            for (let i = 0; i < activeCandidates.length; i++) {
              if (toRetractIndices.has(i)) {
                const retracted = activeCandidates[i];
                retracted.status = "superseded";
                retracted.diagnosis = `Retracted by self-healing recovery in favor of primary structural clearance '${cand.parameterName ?? cand.id}'`;
                suppressedCandidates.push(retracted);
                healingLog.push(
                  `Self-healing recovery: suppressed secondary alignment '${retracted.id}' (${retracted.parameterName ?? retracted.predicate}) to preserve primary structural clearance '${cand.id}' (${cand.parameterName ?? cand.predicate})`
                );
              } else {
                retainedCandidates.push(activeCandidates[i]);
                retainedJacobian.push(activeJacobian[i]);
              }
            }

            // Replace active sets
            activeCandidates.length = 0;
            activeCandidates.push(...retainedCandidates);
            activeJacobian.length = 0;
            activeJacobian.push(...retainedJacobian);

            // Re-evaluate the primary candidate against the cleaned Jacobian
            const reEval = evaluateCandidateAdmissibility(activeJacobian, grad, residual, { policy });
            if (reEval.isAdmissible) {
              cand.status = "admissible";
              activeJacobian.push(grad);
              activeCandidates.push(cand);
              resolvedBySelfHealing = true;
            }
          }
        }
      }

      if (!resolvedBySelfHealing) {
        cand.status = "conflicting";
        cand.diagnosis = evalRes.diagnosis;
        conflictingCandidates.push(cand);
        if (enableSelfHealing) {
          healingLog.push(
            `Self-healing recovery: suppressed conflicting lower-priority alignment '${cand.id}' (${cand.parameterName ?? cand.predicate}) to preserve higher-priority clearances.`
          );
        }
      }
    }
  }

  // 3. Dulmage-Mendelsohn (DM) Decomposition & BTF Gating
  const buildGraph = (cands: ConstraintCandidate[]): BipartiteConstraintGraph => {
    const g = new BipartiteConstraintGraph();
    for (const cand of cands) {
      g.addConstraint(cand.id, cand.entityIds, equationCountFor(cand));
    }
    // §18: anchor the datum so the DOF report is not inflated by rigid-body
    // freedom the sketch does not actually have.
    if (options.anchorEntityId) g.setAnchor(options.anchorEntityId);
    return g;
  };

  const graph = buildGraph(activeCandidates);
  let dmResult = graph.decomposeDM();

  // If DM reports over-constrained equations, check if any remaining secondary constraints cause it
  if (dmResult.overConstrained.conflictingConstraints.length > 0) {
    for (const conflictId of dmResult.overConstrained.conflictingConstraints) {
      const idx = activeCandidates.findIndex((c) => c.id === conflictId);
      if (idx !== -1 && getCandidatePriorityTier(activeCandidates[idx]) === 3) {
        const secCand = activeCandidates.splice(idx, 1)[0];
        secCand.status = "superseded";
        secCand.diagnosis = "Suppressed to resolve bipartite over-constraint in Dulmage-Mendelsohn decomposition";
        suppressedCandidates.push(secCand);
        healingLog.push(
          `DM resolution: suppressed over-constraining secondary constraint '${secCand.id}' (${secCand.parameterName ?? secCand.predicate})`
        );
      }
    }

    // Re-decompose with cleaned graph
    dmResult = buildGraph(activeCandidates).decomposeDM();
  }

  // Calculate final system Jacobian rank
  let systemRank = 0;
  if (activeJacobian.length > 0) {
    const { q } = svd(activeJacobian);
    const epsRank = policy.singular_value_eps ?? 1e-8;
    for (const s of q) {
      if (s > epsRank) systemRank++;
    }
  }

  return {
    admissibleCandidates: activeCandidates,
    redundantCandidates,
    conflictingCandidates,
    suppressedCandidates,
    healingLog,
    dmResult,
    systemRank,
  };
}
