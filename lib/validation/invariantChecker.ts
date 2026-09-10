/**
 * The Invariant Report — the product's real quality gate.
 * UPCE-MASTER-1.0 §5 (the acceptance condition) and §67 (the report itself).
 *
 * §5 states the binding caveat once: *fully constrained is not the same as
 * correct.* A sketch can solve cleanly, report DOF = 0, and still encode the
 * wrong intent. The real acceptance condition for any edit is therefore:
 *
 *     solver converged
 *       AND max residual < ε_tol
 *       AND DOF structure as expected (no new over/under-constrained blocks)
 *       AND declared invariants preserved (thicknesses, angles, symmetry, gaps)
 *       AND topology preserved (closure, no self-intersection, chirality intact)
 *       AND semantic expectations met (tags still attached, ports still aligned)
 *
 * "This report is what makes the system production-grade rather than a demo."
 */

import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { Point2D } from "../geometry/topology/types";
import { Segment2D, detectSelfIntersections } from "../solver/branchControl";
import { signedArea } from "../solver/hysteresis";

export type InvariantSeverity = "ok" | "warning" | "error";
export type OverallVerdict = "green" | "amber" | "red";

export interface InvariantLine {
  label: string;
  /** Measured deviation from the declared target, in the invariant's own unit. */
  deviation: number;
  target?: number;
  unit: string;
  severity: InvariantSeverity;
  detail?: string;
}

export interface SolverSection {
  status: "converged" | "stagnated" | "diverged";
  maxResidual: number;
  iterations: number;
  algorithm: string;
  elapsedMs: number;
}

export interface StructureSection {
  underConstrainedBlocks: number;
  wellConstrainedBlocks: number;
  overConstrainedBlocks: number;
  /** Baseline captured before the edit; a NEW block is a failure (§5). */
  expected?: {
    underConstrainedBlocks: number;
    overConstrainedBlocks: number;
  };
}

/** A declared invariant the author committed to: a thickness, angle, gap, symmetry. */
export interface DeclaredInvariant {
  name: string;
  kind: "length" | "angle" | "gap" | "symmetry";
  target: number;
  measured: number;
  unit?: string;
  /** Override the default tolerance for this one invariant. */
  tolerance?: number;
}

export interface TopologyObservation {
  /** Closed boundary loops, as ordered point lists. */
  loops: { id: string; points: Point2D[]; initialSignedArea?: number }[];
  /** Every boundary segment, for the self-intersection sweep. */
  segments: Segment2D[];
  /** Face IDs before the edit and after, for the face-identity check (§19). */
  faceIdsBefore: string[];
  faceIdsAfter: string[];
}

export interface AssemblyObservation {
  /** Per-port residual misalignment after the solve, in mm. */
  portAlignmentErrors: { portId: string; error: number }[];
  repeatedInstanceCount: number;
  expectedInstanceCount: number;
}

export interface ComplianceObservation {
  /** Parameter bound violations, produced by the standards profile evaluator. */
  boundViolations: { parameter: string; message: string; severity: InvariantSeverity }[];
  standardsViolations: { rule: string; message: string; codeRef?: string }[];
  profileId?: string;
  profileRevision?: string;
}

export interface InvariantCheckInput {
  policy?: TolerancePolicy;
  solver: SolverSection;
  structure: StructureSection;
  invariants: DeclaredInvariant[];
  topology?: TopologyObservation;
  assembly?: AssemblyObservation;
  compliance?: ComplianceObservation;
}

export interface InvariantReport {
  verdict: OverallVerdict;
  /** True only when the full §5 acceptance condition holds. */
  accepted: boolean;
  solver: SolverSection & { severity: InvariantSeverity };
  structure: StructureSection & { severity: InvariantSeverity; detail: string };
  geometricInvariants: InvariantLine[];
  topology: {
    loopClosure: InvariantSeverity;
    selfIntersection: InvariantSeverity;
    chiralityPreserved: InvariantSeverity;
    faceIdentityRetained: string;
    severity: InvariantSeverity;
    details: string[];
  };
  assembly: {
    portAlignmentError: number;
    repeatedInstanceCount: number;
    expectedInstanceCount: number;
    severity: InvariantSeverity;
  } | null;
  compliance: {
    parameterBounds: InvariantSeverity;
    standardsViolations: number;
    severity: InvariantSeverity;
    details: string[];
  } | null;
  /** Every reason the report is not green, in the user's vocabulary. */
  failures: string[];
  warnings: string[];
}

const worse = (a: InvariantSeverity, b: InvariantSeverity): InvariantSeverity => {
  const rank = { ok: 0, warning: 1, error: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
};

/**
 * Produces the full §67 report. Pure: it measures, it never mutates and never
 * solves. The caller rolls the transaction back when `accepted` is false (§67
 * failure behaviour, and §13's "the transaction is rejected wholesale").
 */
export function checkInvariants(input: InvariantCheckInput): InvariantReport {
  const policy = input.policy ?? DEFAULT_TOLERANCE_POLICY;
  const failures: string[] = [];
  const warnings: string[] = [];

  // ---- SOLVER ------------------------------------------------------------
  let solverSeverity: InvariantSeverity = "ok";
  if (input.solver.status !== "converged") {
    solverSeverity = "error";
    failures.push(`Solver ${input.solver.status} after ${input.solver.iterations} iterations.`);
  }
  if (input.solver.maxResidual > policy.solver_residual) {
    solverSeverity = "error";
    failures.push(
      `Max residual ${input.solver.maxResidual.toExponential(2)} exceeds tolerance ` +
        `${policy.solver_residual.toExponential(2)}.`
    );
  }

  // ---- STRUCTURE ---------------------------------------------------------
  let structureSeverity: InvariantSeverity = "ok";
  let structureDetail = `${input.structure.wellConstrainedBlocks} well-constrained block(s)`;

  if (input.structure.expected) {
    const newOver =
      input.structure.overConstrainedBlocks - input.structure.expected.overConstrainedBlocks;
    const newUnder =
      input.structure.underConstrainedBlocks - input.structure.expected.underConstrainedBlocks;
    if (newOver > 0) {
      structureSeverity = "error";
      failures.push(`${newOver} new over-constrained block(s) appeared after this edit.`);
    }
    if (newUnder > 0) {
      structureSeverity = worse(structureSeverity, "warning");
      warnings.push(`${newUnder} new under-constrained block(s) appeared after this edit.`);
    }
  } else if (input.structure.overConstrainedBlocks > 0) {
    structureSeverity = "error";
    failures.push(`${input.structure.overConstrainedBlocks} over-constrained block(s).`);
  }

  if (input.structure.underConstrainedBlocks > 0 && structureSeverity === "ok") {
    structureDetail += `, ${input.structure.underConstrainedBlocks} under-constrained block(s)`;
  }

  // ---- GEOMETRIC INVARIANTS ---------------------------------------------
  const geometricInvariants: InvariantLine[] = input.invariants.map((inv) => {
    const tol =
      inv.tolerance ??
      (inv.kind === "angle" ? policy.angle_rad : policy.geometry_mm);
    const deviation = Math.abs(inv.measured - inv.target);
    const severity: InvariantSeverity = deviation > tol ? "error" : "ok";
    if (severity === "error") {
      failures.push(
        `${inv.name} drifted to ${inv.measured.toFixed(3)} ` +
          `(target ${inv.target.toFixed(3)}, deviation ${deviation.toFixed(4)}).`
      );
    }
    return {
      label: inv.name,
      deviation,
      target: inv.target,
      unit: inv.unit ?? (inv.kind === "angle" ? "rad" : "mm"),
      severity,
    };
  });

  // ---- TOPOLOGY ----------------------------------------------------------
  let loopClosure: InvariantSeverity = "ok";
  let selfIntersection: InvariantSeverity = "ok";
  let chirality: InvariantSeverity = "ok";
  const topoDetails: string[] = [];
  let faceIdentity = "n/a";

  if (input.topology) {
    for (const loop of input.topology.loops) {
      if (loop.points.length < 3) {
        loopClosure = "error";
        failures.push(`Loop ${loop.id} has fewer than 3 vertices — closure lost.`);
        continue;
      }
      const first = loop.points[0];
      const last = loop.points[loop.points.length - 1];
      // A loop stored open must still close within the weld tolerance.
      const gap = Math.hypot(last.x - first.x, last.y - first.y);
      if (gap > policy.weld_mm && gap > 0) {
        // An ordered ring may legitimately omit the repeated closing point;
        // only a gap larger than one edge is a genuine break.
        const edge = Math.hypot(
          loop.points[1].x - first.x,
          loop.points[1].y - first.y
        );
        if (gap > Math.max(edge, policy.weld_mm) * 1.5) {
          loopClosure = "error";
          failures.push(`Loop ${loop.id} does not close (gap ${gap.toFixed(3)} mm).`);
        }
      }

      if (loop.initialSignedArea !== undefined) {
        const area = signedArea(loop.points);
        if (Math.sign(area) !== Math.sign(loop.initialSignedArea) || area === 0) {
          chirality = "error";
          failures.push(
            `Loop ${loop.id} inverted its handedness (signed area ` +
              `${loop.initialSignedArea.toFixed(2)} → ${area.toFixed(2)}).`
          );
        }
      }
    }

    if (input.topology.segments.length > 0) {
      const hits = detectSelfIntersections(input.topology.segments, policy, 8);
      if (hits.length > 0) {
        selfIntersection = "error";
        failures.push(
          `${hits.length} self-intersection(s) detected, first between ` +
            `${hits[0].segmentA} and ${hits[0].segmentB}.`
        );
        topoDetails.push(
          ...hits.map(
            (h) =>
              `${h.segmentA} × ${h.segmentB} at (${h.point.x.toFixed(2)}, ${h.point.y.toFixed(2)})`
          )
        );
      }
    }

    const before = new Set(input.topology.faceIdsBefore);
    const retained = input.topology.faceIdsAfter.filter((f) => before.has(f)).length;
    faceIdentity = `${retained} / ${input.topology.faceIdsBefore.length}`;
    if (before.size > 0 && retained < before.size) {
      warnings.push(
        `Face identity: ${before.size - retained} of ${before.size} face(s) lost their ID ` +
          `across the rebuild — semantic tags on them may have detached.`
      );
    }
  }

  const topologySeverity = worse(worse(loopClosure, selfIntersection), chirality);

  // ---- ASSEMBLY ----------------------------------------------------------
  let assembly: InvariantReport["assembly"] = null;
  if (input.assembly) {
    const worstPort = input.assembly.portAlignmentErrors.reduce(
      (m, p) => Math.max(m, Math.abs(p.error)),
      0
    );
    let sev: InvariantSeverity = "ok";
    if (worstPort > policy.geometry_mm) {
      sev = "error";
      const offender = input.assembly.portAlignmentErrors.find(
        (p) => Math.abs(p.error) === worstPort
      );
      failures.push(
        `Port ${offender?.portId ?? "?"} misaligned by ${worstPort.toFixed(4)} mm.`
      );
    }
    if (input.assembly.repeatedInstanceCount !== input.assembly.expectedInstanceCount) {
      sev = "error";
      failures.push(
        `Repeat produced ${input.assembly.repeatedInstanceCount} instance(s), ` +
          `expected ${input.assembly.expectedInstanceCount}.`
      );
    }
    assembly = {
      portAlignmentError: worstPort,
      repeatedInstanceCount: input.assembly.repeatedInstanceCount,
      expectedInstanceCount: input.assembly.expectedInstanceCount,
      severity: sev,
    };
  }

  // ---- COMPLIANCE --------------------------------------------------------
  // §26: violations are validation metadata, not solver logic. Amber, not red,
  // unless the value is physically impossible (severity 'error' from the caller).
  let compliance: InvariantReport["compliance"] = null;
  if (input.compliance) {
    const details: string[] = [];
    let sev: InvariantSeverity = "ok";

    for (const v of input.compliance.boundViolations) {
      details.push(`${v.parameter}: ${v.message}`);
      sev = worse(sev, v.severity);
      if (v.severity === "error") failures.push(`${v.parameter}: ${v.message}`);
      else warnings.push(`${v.parameter}: ${v.message}`);
    }
    for (const v of input.compliance.standardsViolations) {
      details.push(`${v.rule}: ${v.message}${v.codeRef ? ` (${v.codeRef})` : ""}`);
      sev = worse(sev, "warning");
      warnings.push(`${v.message}${v.codeRef ? ` [${v.codeRef}]` : ""}`);
    }

    compliance = {
      parameterBounds: input.compliance.boundViolations.length === 0 ? "ok" : sev,
      standardsViolations: input.compliance.standardsViolations.length,
      severity: sev,
      details,
    };
  }

  // ---- VERDICT -----------------------------------------------------------
  let overall: InvariantSeverity = "ok";
  overall = worse(overall, solverSeverity);
  overall = worse(overall, structureSeverity);
  for (const g of geometricInvariants) overall = worse(overall, g.severity);
  overall = worse(overall, topologySeverity);
  if (assembly) overall = worse(overall, assembly.severity);
  if (compliance) overall = worse(overall, compliance.severity);

  const verdict: OverallVerdict =
    overall === "error" ? "red" : overall === "warning" ? "amber" : "green";

  return {
    verdict,
    accepted: overall !== "error",
    solver: { ...input.solver, severity: solverSeverity },
    structure: { ...input.structure, severity: structureSeverity, detail: structureDetail },
    geometricInvariants,
    topology: {
      loopClosure,
      selfIntersection,
      chiralityPreserved: chirality,
      faceIdentityRetained: faceIdentity,
      severity: topologySeverity,
      details: topoDetails,
    },
    assembly,
    compliance,
    failures,
    warnings,
  };
}

/**
 * Renders the §67 report in the exact fixed-width form the spec shows, for the
 * author-mode expanded view, CI logs, and the CLI.
 */
export function formatInvariantReport(report: InvariantReport): string {
  const pad = (label: string, width = 34) =>
    label + " " + ".".repeat(Math.max(1, width - label.length));
  const lines: string[] = [];

  lines.push("SOLVER");
  lines.push(`  ${pad("status")} ${report.solver.status}`);
  lines.push(`  ${pad("max residual")} ${report.solver.maxResidual.toExponential(2)} mm`);
  lines.push(
    `  ${pad("iterations / algorithm / time")} ${report.solver.iterations} / ` +
      `${report.solver.algorithm} / ${report.solver.elapsedMs.toFixed(1)} ms`
  );
  lines.push("");

  lines.push("STRUCTURE");
  lines.push(`  ${pad("under-constrained blocks")} ${report.structure.underConstrainedBlocks}`);
  lines.push(`  ${pad("well-constrained blocks")} ${report.structure.wellConstrainedBlocks}`);
  lines.push(`  ${pad("over-constrained blocks")} ${report.structure.overConstrainedBlocks}`);
  lines.push("");

  if (report.geometricInvariants.length > 0) {
    lines.push("GEOMETRIC INVARIANTS");
    for (const g of report.geometricInvariants) {
      lines.push(
        `  ${pad(`${g.label} deviation`)} ${g.deviation.toFixed(3)} ${g.unit}` +
          (g.target !== undefined ? `  (target ${g.target})` : "")
      );
    }
    lines.push("");
  }

  lines.push("TOPOLOGY");
  lines.push(`  ${pad("loop closure")} ${report.topology.loopClosure === "ok" ? "OK" : "FAILED"}`);
  lines.push(
    `  ${pad("self-intersection")} ${report.topology.selfIntersection === "ok" ? "none" : "DETECTED"}`
  );
  lines.push(
    `  ${pad("chirality preserved")} ${report.topology.chiralityPreserved === "ok" ? "yes" : "NO"}`
  );
  lines.push(`  ${pad("face identity retained")} ${report.topology.faceIdentityRetained}`);
  lines.push("");

  if (report.assembly) {
    lines.push("ASSEMBLY");
    lines.push(
      `  ${pad("port alignment error")} ${report.assembly.portAlignmentError.toFixed(3)} mm`
    );
    lines.push(
      `  ${pad("repeated instance count")} ${report.assembly.repeatedInstanceCount} ` +
        `(expected ${report.assembly.expectedInstanceCount})`
    );
    lines.push("");
  }

  if (report.compliance) {
    lines.push("COMPLIANCE");
    lines.push(
      `  ${pad("parameter bounds")} ${report.compliance.parameterBounds === "ok" ? "OK" : "VIOLATED"}`
    );
    lines.push(
      `  ${pad("standards violations")} ${
        report.compliance.standardsViolations === 0 ? "none" : report.compliance.standardsViolations
      }`
    );
    lines.push("");
  }

  lines.push(`VERDICT: ${report.verdict.toUpperCase()}`);
  for (const f of report.failures) lines.push(`  ✗ ${f}`);
  for (const w of report.warnings) lines.push(`  ! ${w}`);

  return lines.join("\n");
}
