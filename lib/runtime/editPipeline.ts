/**
 * The User-Mode Edit Pipeline — every user change, exactly this.
 * UPCE-MASTER-1.0 §66, with the transactional rollback of §67 and §13.
 *
 *   1.  User edits a DRIVING parameter
 *   2.  Validate input        → bounds, standards profile, cross-parameter rules
 *   3.  Update the DRIVING parameter
 *   4.  Evaluate the scalar DAG in topological order (Kahn)
 *   5.  If a COUNT changed → regenerate procedural instances (§23.4)
 *   6.  Find the dirty geometry subgraph (BFS on the constraint graph)
 *   7.  Apply component / port / repeat transforms
 *   8.  Bind updated targets into constraint nodes
 *   9.  Solve (warm-started; homotopy sub-stepping for large jumps)
 *   10. Rebuild / re-sync DCEL; re-assign face identity
 *   11. Run the invariant report (§67) → on failure, roll back to last good state
 *   12. Post-solve DAG pass: derived metrics
 *   13. Render (targeted DOM reconciliation)
 *
 * Each step is INJECTED, not owned. The pipeline's job is ordering, the
 * value-only fast path, and the all-or-nothing transaction boundary — not
 * geometry. That keeps it testable in isolation and keeps §13's rule intact:
 * "If a solve diverges or produces topological invalidity, the transaction is
 * rejected wholesale and state reverts cleanly. The user never sees torn geometry."
 */

import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { InvariantReport } from "../validation/invariantChecker";
import {
  StandardsEvaluation,
  StandardsProfile,
  evaluateAgainstProfile,
} from "../validation/standardsProfile";
import {
  planHomotopySubSteps,
  DEFAULT_HOMOTOPY_MAX_DELTA,
} from "../solver/branchControl";

export type EditPipelineStepName =
  | "validate-input"
  | "update-driving"
  | "evaluate-dag"
  | "regenerate-instances"
  | "partition-dirty-subgraph"
  | "apply-transforms"
  | "bind-targets"
  | "solve"
  | "resync-dcel"
  | "check-invariants"
  | "post-solve-metrics"
  | "render";

export interface StepTrace {
  step: EditPipelineStepName;
  index: number;
  skipped: boolean;
  elapsedMs: number;
  detail?: string;
}

export interface ParameterEdit {
  name: string;
  value: number;
}

export interface PipelineParameter {
  name: string;
  role: "DRIVING" | "DERIVED" | "FIXED" | "MEASURED";
  type: "LENGTH" | "ANGLE" | "COUNT" | "RATIO" | "BOOLEAN";
  value: number;
  min?: number;
  max?: number;
  step?: number;
}

/** Everything the pipeline may restore on rollback. Opaque to the pipeline. */
export interface EngineSnapshot {
  parameters: Record<string, number>;
  coordinates: number[];
  /** Anything else the host wants restored atomically. */
  extra?: unknown;
}

export interface SolveOutcome {
  converged: boolean;
  maxResidual: number;
  iterations: number;
  algorithm: string;
  coordinates: number[];
  diagnostic?: string;
}

/**
 * The injected engine. Every method corresponds to one numbered step of §66.
 * Methods the host has not implemented are simply skipped and recorded as such,
 * so a partially-wired host still exercises the ordering and the transaction.
 */
export interface EditPipelineEngine {
  getParameters(): PipelineParameter[];
  snapshot(): EngineSnapshot;
  restore(snapshot: EngineSnapshot): void;

  setDrivingParameter(name: string, value: number): void;
  /** Step 4 — Kahn topological evaluation of the scalar DAG. */
  evaluateDag(): Record<string, number>;
  /** Step 5 — procedural regeneration; returns the new instance count. */
  regenerateInstances?(countParameter: string, count: number): number;
  /** Step 6 — BFS on the constraint graph; returns affected component IDs. */
  partitionDirtySubgraph(changed: string[]): string[];
  /** Step 7 — component / port / repeat transforms. */
  applyTransforms?(components: string[]): void;
  /** Step 8 — bind scalar targets into constraint nodes. */
  bindTargets(values: Record<string, number>): void;
  /** Step 9 — the solve. `substep` is the homotopy continuation fraction. */
  solve(options: { components: string[]; warmStart: boolean; substep: number }): SolveOutcome;
  /** Step 10 — DCEL re-sync and face-identity re-assignment. */
  resyncTopology?(): { faceIdsBefore: string[]; faceIdsAfter: string[] };
  /** Step 11 — the §67 invariant report. */
  checkInvariants(solve: SolveOutcome, compliance: StandardsEvaluation | null): InvariantReport;
  /** Step 12 — derived metrics (area, centroid, quantities). */
  computeDerivedMetrics?(): Record<string, number>;
  /** Step 13 — targeted reconciliation. */
  render?(): void;
}

export interface EditPipelineOptions {
  policy?: TolerancePolicy;
  profile?: StandardsProfile;
  /** Parameters whose value must stay strictly above a floor (hard block, §26). */
  physicalFloors?: Record<string, number>;
  /** §31.5 — split parameter jumps larger than this into continuation steps. */
  homotopyMaxDelta?: number;
  /**
   * §66 — "Value-only changes use setDatum-style updates without re-initialising
   * the solver." Enabled by default; disable to force a full re-init.
   */
  allowValueOnlyFastPath?: boolean;
  now?: () => number;
}

export type EditRejectionReason =
  | "unknown-parameter"
  | "not-driving"
  | "out-of-bounds"
  | "non-finite"
  | "standards-blocked"
  | "solver-failed"
  | "invariants-failed";

export interface EditPipelineResult {
  committed: boolean;
  reason?: EditRejectionReason;
  message?: string;
  /** True when the value-only fast path was taken (no structural re-init). */
  fastPath: boolean;
  /** True when a COUNT changed and instances were regenerated. */
  structural: boolean;
  substeps: number;
  trace: StepTrace[];
  derived: Record<string, number>;
  metrics: Record<string, number>;
  compliance: StandardsEvaluation | null;
  invariantReport: InvariantReport | null;
  solve: SolveOutcome | null;
  totalMs: number;
}

/**
 * Runs one user edit through all thirteen steps as a single transaction.
 *
 * The commit boundary is absolute: the snapshot is taken before step 3, and ANY
 * failure at steps 9–11 restores it. Nothing partial is ever left behind.
 */
export function runEditPipeline(
  engine: EditPipelineEngine,
  edits: ParameterEdit[],
  options: EditPipelineOptions = {}
): EditPipelineResult {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const trace: StepTrace[] = [];
  let stepIndex = 0;

  const record = <T>(
    step: EditPipelineStepName,
    fn: () => T,
    opts: { skipped?: boolean; detail?: string } = {}
  ): T => {
    const t0 = now();
    const value = fn();
    trace.push({
      step,
      index: ++stepIndex,
      skipped: opts.skipped ?? false,
      elapsedMs: now() - t0,
      detail: opts.detail,
    });
    return value;
  };

  const reject = (
    reason: EditRejectionReason,
    message: string,
    extras: Partial<EditPipelineResult> = {}
  ): EditPipelineResult => ({
    committed: false,
    reason,
    message,
    fastPath: false,
    structural: false,
    substeps: 0,
    trace,
    derived: {},
    metrics: {},
    compliance: null,
    invariantReport: null,
    solve: null,
    totalMs: now() - startedAt,
    ...extras,
  });

  const parameters = engine.getParameters();
  const byName = new Map(parameters.map((p) => [p.name, p]));

  // ---- Step 1 + 2: validate input ---------------------------------------
  let compliance: StandardsEvaluation | null = null;
  const validation = record("validate-input", () => {
    for (const edit of edits) {
      const p = byName.get(edit.name);
      if (!p) return { ok: false as const, reason: "unknown-parameter" as const, message: `No parameter named '${edit.name}'.` };
      if (p.role !== "DRIVING")
        return {
          ok: false as const,
          reason: "not-driving" as const,
          message: `'${edit.name}' is ${p.role}; only DRIVING parameters accept direct edits. Convert it to a driving dimension first.`,
        };
      if (!Number.isFinite(edit.value))
        return { ok: false as const, reason: "non-finite" as const, message: `'${edit.name}' must be a finite number.` };
      if (p.type === "COUNT" && !Number.isInteger(edit.value))
        return {
          ok: false as const,
          reason: "out-of-bounds" as const,
          message: `'${edit.name}' is a count and must be a whole number.`,
        };
      if (p.min !== undefined && edit.value < p.min)
        return {
          ok: false as const,
          reason: "out-of-bounds" as const,
          message: `${edit.name} must be at least ${p.min}.`,
        };
      if (p.max !== undefined && edit.value > p.max)
        return {
          ok: false as const,
          reason: "out-of-bounds" as const,
          message: `${edit.name} must be at most ${p.max}.`,
        };
    }

    if (options.profile) {
      const proposed: Record<string, number> = {};
      for (const p of parameters) proposed[p.name] = p.value;
      for (const e of edits) proposed[e.name] = e.value;
      compliance = evaluateAgainstProfile(options.profile, proposed, {
        physicalFloors: options.physicalFloors,
      });
      if (compliance.blocked) {
        return {
          ok: false as const,
          reason: "standards-blocked" as const,
          message: compliance.boundViolations
            .filter((v) => v.kind === "physically-impossible")
            .map((v) => v.message)
            .join(" "),
        };
      }
    }
    return { ok: true as const };
  });

  if (!validation.ok) return reject(validation.reason, validation.message, { compliance });

  // ---- Snapshot: the transaction boundary --------------------------------
  const snapshot = engine.snapshot();
  const before: Record<string, number> = {};
  for (const p of parameters) before[p.name] = p.value;

  try {
    // ---- Step 3: update DRIVING parameters -------------------------------
    record("update-driving", () => {
      for (const e of edits) engine.setDrivingParameter(e.name, e.value);
    }, { detail: edits.map((e) => `${e.name}=${e.value}`).join(", ") });

    // ---- Step 4: scalar DAG in topological order -------------------------
    const derived = record("evaluate-dag", () => engine.evaluateDag());

    // ---- Step 5: COUNT change → procedural regeneration ------------------
    const countEdits = edits.filter((e) => byName.get(e.name)?.type === "COUNT");
    const structural = countEdits.length > 0;
    record(
      "regenerate-instances",
      () => {
        if (!structural || !engine.regenerateInstances) return;
        for (const e of countEdits) engine.regenerateInstances!(e.name, e.value);
      },
      {
        skipped: !structural || !engine.regenerateInstances,
        detail: structural ? countEdits.map((e) => `${e.name}→${e.value}`).join(", ") : undefined,
      }
    );

    // A count change mutates topology, so the value-only fast path is void (§66).
    const fastPath =
      !structural && (options.allowValueOnlyFastPath ?? true);

    // ---- Step 6: dirty subgraph -----------------------------------------
    const changedNames = [...edits.map((e) => e.name), ...Object.keys(derived)];
    const components = record("partition-dirty-subgraph", () =>
      engine.partitionDirtySubgraph(changedNames)
    , { detail: `${changedNames.length} dirty parameter(s)` });

    // ---- Step 7: component / port / repeat transforms --------------------
    record("apply-transforms", () => engine.applyTransforms?.(components), {
      skipped: !engine.applyTransforms,
    });

    // ---- Step 8: bind targets -------------------------------------------
    const targets: Record<string, number> = { ...derived };
    for (const e of edits) targets[e.name] = e.value;
    record("bind-targets", () => engine.bindTargets(targets));

    // ---- Step 9: solve, with §31.5 homotopy sub-stepping -----------------
    const after: Record<string, number> = { ...before };
    for (const e of edits) after[e.name] = e.value;
    const substeps = planHomotopySubSteps(
      before,
      after,
      options.homotopyMaxDelta ?? DEFAULT_HOMOTOPY_MAX_DELTA
    );

    const solveResult = record(
      "solve",
      () => {
        let last: SolveOutcome | null = null;
        for (let i = 1; i <= substeps; i++) {
          last = engine.solve({
            components,
            // Warm start from the previous frame or sub-step (§29.6, §31.1).
            warmStart: true,
            substep: i / substeps,
          });
          if (!last.converged) break;
        }
        return last!;
      },
      { detail: `${substeps} sub-step(s)` }
    );

    if (!solveResult || !solveResult.converged) {
      engine.restore(snapshot);
      return reject(
        "solver-failed",
        `The solver could not reach a valid solution${
          solveResult?.diagnostic ? `: ${solveResult.diagnostic}` : ""
        }. Your drawing is unchanged.`,
        { compliance, structural, substeps, solve: solveResult ?? null }
      );
    }
    if (solveResult.maxResidual > policy.solver_residual) {
      engine.restore(snapshot);
      return reject(
        "solver-failed",
        `The solver stalled with a residual of ${solveResult.maxResidual.toExponential(2)}. ` +
          `Your drawing is unchanged.`,
        { compliance, structural, substeps, solve: solveResult }
      );
    }

    // ---- Step 10: DCEL re-sync + face identity ---------------------------
    record("resync-dcel", () => engine.resyncTopology?.(), { skipped: !engine.resyncTopology });

    // ---- Step 11: invariant report, and rollback on failure --------------
    const invariantReport = record("check-invariants", () =>
      engine.checkInvariants(solveResult, compliance)
    );

    if (!invariantReport.accepted) {
      engine.restore(snapshot);
      return reject(
        "invariants-failed",
        invariantReport.failures[0] ??
          "A declared invariant was violated. Your drawing is unchanged.",
        { compliance, structural, substeps, solve: solveResult, invariantReport }
      );
    }

    // ---- Step 12: post-solve derived metrics -----------------------------
    const metrics = record(
      "post-solve-metrics",
      () => engine.computeDerivedMetrics?.() ?? {},
      { skipped: !engine.computeDerivedMetrics }
    );

    // ---- Step 13: render -------------------------------------------------
    record("render", () => engine.render?.(), { skipped: !engine.render });

    return {
      committed: true,
      fastPath,
      structural,
      substeps,
      trace,
      derived,
      metrics,
      compliance,
      invariantReport,
      solve: solveResult,
      totalMs: now() - startedAt,
    };
  } catch (error) {
    // §13: a failed transaction reverts wholesale, including on an exception.
    engine.restore(snapshot);
    return reject(
      "solver-failed",
      `The edit failed and was rolled back: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { compliance }
    );
  }
}
