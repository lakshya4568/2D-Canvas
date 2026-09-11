/**
 * Template readiness, publication, and the user-mode manifest.
 *
 * §24 and §25 of the repair brief: the scorecard must be driven by actual
 * verification results, and §5 of the master plan says a template is complete
 * only if its behaviour survives parameter change — not if it merely renders.
 *
 * So every row below is produced by doing the thing, not by checking that a
 * field is non-empty:
 *
 *   "Constraint solve"        -> a solve is run
 *   "Perturbation stability"  -> each driving value is swept and re-solved
 *   "Declared invariants"     -> re-measured on each swept result
 *   "Repeat rules"            -> the count is actually changed and rebuilt
 *
 * A template that cannot answer those is NOT READY, and the reason names the
 * parameter rather than a matrix row.
 */

import { Shape } from "../geometry/types";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { AuthoringSketch, SketchParameter } from "./types";
import { regenerate, namesOf } from "./document";
import { analyseDof } from "./dof";
import { evaluateParameters } from "./parameters";

export type CheckStatus = "pass" | "warn" | "fail";

export interface ReadinessCheck {
  label: string;
  status: CheckStatus;
  /** What was actually done to reach this verdict. */
  detail: string;
}

export interface ReadinessReport {
  ready: boolean;
  checks: ReadinessCheck[];
  /** Everything that failed, phrased for the author. */
  blockers: string[];
  sweep: SweepResult[];
}

export interface SweepResult {
  parameter: string;
  value: number;
  ok: boolean;
  /** Invariants that stopped holding at this value, by name. */
  brokenInvariants: string[];
  rejection?: string;
}

/** Values to try for a driving parameter: its declared range, or +/-25%. */
function sweepValues(p: SketchParameter): number[] {
  if (p.type === "COUNT") {
    const lo = Math.max(1, Math.round(p.min ?? 1));
    const hi = Math.max(lo, Math.round(p.max ?? Math.max(lo + 3, p.value + 2)));
    const out: number[] = [];
    for (let v = lo; v <= hi && out.length < 8; v++) out.push(v);
    return out;
  }
  if (p.min !== undefined && p.max !== undefined && p.max > p.min) {
    return [p.min, p.min + (p.max - p.min) * 0.25, (p.min + p.max) / 2, p.max];
  }
  return [p.value * 0.75, p.value * 0.9, p.value * 1.1, p.value * 1.25].filter((v) => v > 0);
}

export interface ReadinessOptions {
  policy?: TolerancePolicy;
  shapeNames?: Record<string, string>;
}

export function assessReadiness(
  sketch: AuthoringSketch,
  authoredShapes: Shape[],
  options: ReadinessOptions = {}
): ReadinessReport {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const names = options.shapeNames ?? namesOf(authoredShapes);
  const checks: ReadinessCheck[] = [];
  const blockers: string[] = [];
  const sweep: SweepResult[] = [];

  const add = (label: string, status: CheckStatus, detail: string) => {
    checks.push({ label, status, detail });
    if (status === "fail") blockers.push(detail);
  };

  // 1. Is there anything to publish?
  const constrainedShapes = new Set(Object.values(sketch.segments).map((s) => s.shapeId));
  if (constrainedShapes.size === 0) {
    add("Geometry", "fail", "There is no geometry in this drawing that the engine can constrain.");
    return { ready: false, checks, blockers, sweep };
  }
  add(
    "Geometry",
    sketch.carrierShapeIds.length === 0 ? "pass" : "warn",
    sketch.carrierShapeIds.length === 0
      ? `${constrainedShapes.size} shapes lowered into ${Object.keys(sketch.segments).length} edges.`
      : `${sketch.carrierShapeIds.length} shape(s) — ellipses or splines — are drawn and exported but cannot carry constraints yet.`
  );

  // 2. Baseline solve.
  const baseline = regenerate(authoredShapes, sketch, { policy, shapeNames: names });
  if (baseline.rejection) {
    add("Constraint solve", "fail", `The drawing does not solve as it stands: ${baseline.rejection}`);
  } else if (!baseline.converged) {
    add("Constraint solve", "fail", "The solver could not settle the current geometry.");
  } else {
    add("Constraint solve", "pass", `Converged with a worst residual of ${baseline.maxResidual.toExponential(1)}.`);
  }

  const solved = baseline.rejection ? sketch : baseline.sketch;
  const dof = analyseDof(solved, names, policy);

  // 3. Anchor.
  add(
    "Anchored to the sheet",
    dof.anchored ? "pass" : "fail",
    dof.anchored
      ? "One point is pinned, so the remaining freedom describes the design rather than the paper position."
      : "Nothing pins the drawing to the sheet, so every diagnosis below is off by the three ways it can slide and turn."
  );

  // 4. Remaining freedom.
  if (dof.dof === 0) {
    add("Remaining freedom", "pass", "Fully defined — no unintended movement is left.");
  } else if (sketch.meta.freedomIsIntentional) {
    add(
      "Remaining freedom",
      "warn",
      `${dof.dof} degree(s) of freedom remain and the author has marked them intentional: ${dof.motions
        .slice(0, 2)
        .map((m) => m.description)
        .join(" ")}`
    );
  } else {
    add(
      "Remaining freedom",
      "fail",
      `${dof.dof} degree(s) of freedom remain. ${dof.motions[0]?.description ?? ""} Either constrain them or mark the freedom as intended.`
    );
  }

  // 5. Conflicts and redundancy.
  const conflicting = dof.diagnoses.filter((d) => d.status === "conflicting");
  const redundant = dof.diagnoses.filter((d) => d.status === "redundant");
  add(
    "No conflicting requirements",
    conflicting.length === 0 ? "pass" : "fail",
    conflicting.length === 0
      ? redundant.length === 0
        ? "Every requirement earns its place."
        : // Name them. A repeated rule is harmless only while it agrees; the
          // moment a value changes it is the thing that makes the sweep fail,
          // so the author needs to know which rules to look at, not how many.
          `${redundant.length} requirement(s) say something the others already guarantee, so they can never move the geometry — and they are the first thing to remove if a value refuses to change: ${redundant
            .slice(0, 6)
            .map((c) => c.label)
            .join("; ")}`
      : `These cannot all hold at once: ${conflicting.map((c) => c.label).join("; ")}`
  );

  // 6. Parameters.
  const driving = Object.values(solved.parameters).filter((p) => p.role === "DRIVING");
  const published = driving.filter((p) => p.published);
  add(
    "Driving values defined",
    driving.length > 0 ? "pass" : "fail",
    driving.length > 0
      ? `${driving.length} value(s) drive the geometry; ${published.length} are exposed to the project user.`
      : "Nothing in this drawing is driven by a named value, so a user would have nothing to change."
  );

  const unbounded = published.filter((p) => p.min === undefined || p.max === undefined);
  add(
    "Published values have limits",
    unbounded.length === 0 ? "pass" : "warn",
    unbounded.length === 0
      ? "Every published value states the range it is valid over."
      : `${unbounded.map((p) => p.name).join(", ")} can be set to anything. The sweep below uses +/-25% instead.`
  );

  // 7. Derived expressions.
  const evaluation = evaluateParameters(solved.parameters);
  add(
    "Derived values resolve",
    evaluation.errors.length === 0 ? "pass" : "fail",
    evaluation.errors.length === 0
      ? `${Object.values(solved.parameters).filter((p) => p.role === "DERIVED").length} derived value(s) evaluate in order.`
      : evaluation.errors.map((e) => `${e.parameter}: ${e.message}`).join("; ")
  );

  // 8. The behavioural sweep. This is the check that a rendering template fails.
  let sweepFailures = 0;
  for (const p of published.length > 0 ? published : driving) {
    for (const v of sweepValues(p)) {
      const probe: AuthoringSketch = {
        ...solved,
        parameters: { ...solved.parameters, [p.name]: { ...solved.parameters[p.name], value: v } },
      };
      const result = regenerate(authoredShapes, probe, { policy, shapeNames: names });
      const broken = result.invariants.filter((i) => !i.ok).map((i) => i.label);
      const ok = !result.rejection && result.converged && broken.length === 0;
      if (!ok) sweepFailures++;
      sweep.push({
        parameter: p.name,
        value: v,
        ok,
        brokenInvariants: broken,
        rejection: result.rejection,
      });
    }
  }

  add(
    "Behaviour under change",
    sweep.length === 0 ? "warn" : sweepFailures === 0 ? "pass" : "fail",
    sweep.length === 0
      ? "There were no published values to sweep."
      : sweepFailures === 0
        ? `All ${sweep.length} test values re-solved with every declared relationship intact.`
        : `${sweepFailures} of ${sweep.length} test values failed. First: ${
            sweep.find((s) => !s.ok)?.parameter
          } = ${sweep.find((s) => !s.ok)?.value.toFixed(1)} — ${
            sweep.find((s) => !s.ok)?.rejection ?? sweep.find((s) => !s.ok)?.brokenInvariants.join(", ")
          }`
  );

  // 9. Repeats.
  if (sketch.repeats.length > 0) {
    const bad: string[] = [];
    for (const rule of sketch.repeats) {
      for (let n = 1; n <= 5; n++) {
        const countP = solved.parameters[rule.countParam];
        if (!countP) {
          bad.push(`${rule.countParam} does not exist`);
          break;
        }
        const probe: AuthoringSketch = {
          ...solved,
          parameters: { ...solved.parameters, [rule.countParam]: { ...countP, value: n } },
        };
        const result = regenerate(authoredShapes, probe, { policy, shapeNames: names });
        if (result.rejection || !result.topology.ok) {
          bad.push(`${rule.countParam} = ${n}: ${result.rejection ?? "topology became invalid"}`);
        }
      }
    }
    add(
      "Repeat rules regenerate",
      bad.length === 0 ? "pass" : "fail",
      bad.length === 0
        ? `Counts 1 to 5 rebuild cleanly for ${sketch.repeats.length} repeat rule(s).`
        : bad.join("; ")
    );
  }

  // 10. Provenance.
  const anonymous = Object.values(solved.parameters).filter((p) => !p.provenance?.detail);
  add(
    "Every value can be explained",
    anonymous.length === 0 ? "pass" : "fail",
    anonymous.length === 0
      ? "Each parameter records who created it and why."
      : `${anonymous.map((p) => p.name).join(", ")} have no recorded origin.`
  );

  return { ready: blockers.length === 0, checks, blockers, sweep };
}

// ---------------------------------------------------------------------------
// The published manifest.
// ---------------------------------------------------------------------------

export interface ManifestEntry {
  name: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  group: string;
  description: string;
  /** What visibly changes when this value changes. */
  affects: string[];
}

export interface TemplateManifest {
  name: string;
  version: number;
  publishedAt: number;
  driving: ManifestEntry[];
  derived: ManifestEntry[];
  fixed: ManifestEntry[];
  /** Relationships the template promises to hold, in plain words. */
  invariants: string[];
}

/**
 * What a project engineer sees. §64: they get names, numbers and limits — never
 * an expression, a constraint id, or a degree-of-freedom count.
 */
export function buildManifest(sketch: AuthoringSketch, shapeNames: Record<string, string> = {}): TemplateManifest {
  const entry = (p: SketchParameter): ManifestEntry => ({
    name: p.name,
    value: p.value,
    unit: p.unit,
    min: p.min,
    max: p.max,
    group: p.uiGroup ?? "Dimensions",
    description: p.description ?? p.provenance.detail,
    affects: [
      ...new Set(
        p.boundConstraints
          .map((id) => sketch.constraints.find((c) => c.id === id))
          .flatMap((c) => (c ? [...c.points, ...c.segments] : []))
          .map((ref) => ref.split(":")[0])
          .map((shapeId) => shapeNames[shapeId] ?? shapeId)
      ),
    ],
  });

  const all = Object.values(sketch.parameters);
  return {
    name: sketch.meta.name,
    version: sketch.meta.version,
    publishedAt: sketch.meta.publishedAt ?? Date.now(),
    driving: all.filter((p) => p.role === "DRIVING" && p.published).map(entry),
    derived: all.filter((p) => p.role === "DERIVED").map(entry),
    fixed: all.filter((p) => p.role === "FIXED").map(entry),
    // The author's own decisions first: "the wall stays 300 mm" is what a
    // project engineer wants to see, and a rectangle's right angles are noise
    // above it even though both are equally enforced.
    invariants: [
      ...sketch.constraints.filter((c) => c.strength === "hard"),
      ...sketch.constraints.filter((c) => c.strength === "soft"),
      ...sketch.constraints.filter((c) => c.strength === "fact"),
    ]
      .filter((c) => c.state !== "suppressed")
      .map((c) => c.label),
  };
}

/** Stamps the sketch as published. Refuses if readiness has blockers. */
export function publish(
  sketch: AuthoringSketch,
  authoredShapes: Shape[],
  options: ReadinessOptions = {}
): { sketch: AuthoringSketch; manifest?: TemplateManifest; report: ReadinessReport } {
  const report = assessReadiness(sketch, authoredShapes, options);
  if (!report.ready) return { sketch, report };
  const next: AuthoringSketch = {
    ...sketch,
    meta: { ...sketch.meta, publishedAt: Date.now(), version: sketch.meta.version + 1 },
  };
  return { sketch: next, manifest: buildManifest(next, options.shapeNames), report };
}
