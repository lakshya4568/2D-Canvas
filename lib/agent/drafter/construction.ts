/**
 * The agent's own construction: a drawing built from primitives, every
 * coordinate written as an expression of values the agent read and worked out
 * in its plan.
 *
 * WHY. The agent must reproduce a general-arrangement drawing from scratch,
 * exactly, and leave it editable. Two things stood in the way:
 *   - typing coordinates it had computed in its head (a wrong subtraction is a
 *     wrong drawing, and nothing notices), and
 *   - a free-hand sketch of a whole GAD — hundreds of lines — is far past what
 *     degrees-of-freedom bookkeeping can carry (CLAUDE.md §2.7).
 * So the agent works the way the constructive engine does (UPCE §23): it
 * PLANS first — the values it read, the relations between them (written as
 * formulas, evaluated by the engine, never by the model), cross-checks against
 * numbers the reference also states, the features and their construction —
 * and then CONSTRUCTS entity by entity, writing coordinates as expressions of
 * those values. The engine evaluates them; mirror, offset, rotate and booleans
 * derive new expressions from old ones (lib/components/symbolic.ts). The result
 * is a drawing-owned component definition (`cad.definitions`, origin "drawn"):
 * built by the agent, never taken from the component library — the agent
 * cannot see the library at all.
 *
 * VERIFY closes the loop deterministically: plan checks, the engine's own
 * geometry checks, every planned feature drawn, and every number the reference
 * writes — dimensions, levels, callouts — measured back from the geometry.
 *
 * Coordinates: model mm, Y up; for drawings at true levels y = RL × 1000.
 */

import type {
  ComponentDefinition,
  ComponentFormula,
  ComponentParameter,
  ComponentPrimitive,
  DimensionDef,
  Expr,
  HatchDef,
  LeaderDef,
  LevelDef,
  TextDef,
  XY,
} from "../../components/types";
import type { HatchMaterial, LayerCategory } from "../../cad/types";
import { HATCH_MATERIALS } from "../../cad/hatch";
import { evalExpr, exprDependencies, orderByDependencies, type Scope } from "../../components/expr";
import { evaluateComponent, type ComponentEvaluation } from "../../components/evaluate";
import { annotationGlobals } from "../../components/instantiate";
import { registryFor } from "../../cad/document";
import { annotationPrims } from "../../cad/annotationPrims";
import { textWidth } from "../../cad/drawList";
import { indexShapes } from "../../cad/geometry";
import { ToolError, fmt, type DraftingWorkspace } from "./workspace";
import * as Sy from "../../components/symbolic";
import { ILLEGIBLE_TEXT_FRACTION, readableAnnotationScale } from "../../cad/sheet";

type Args = Record<string, unknown>;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Route = "construction" | "sketch";
export type PlanUnit = "mm" | "m" | "deg" | "-";

export interface PlanValue {
  name: string;
  expr: string;
  unit: PlanUnit;
  note?: string;
}
export interface PlanCheck {
  label: string;
  expr: string;
  expect: number;
  unit: PlanUnit;
}
/** An inequality the drawing must keep through every edit (becomes an invariant). */
export interface PlanConstraint {
  label: string;
  expr: string;
  op: ">" | ">=" | "<" | "<=";
  than: string;
}
export interface PlanFeature {
  name: string;
  description: string;
  construction?: string;
}
export interface ExpectedContent {
  dimensions: number[];
  levels: { label: string; rl: number }[];
  texts: string[];
  /**
   * Numbers the reference writes that contradict its other numbers. They are
   * not drawn — the agent must not fake a dimension to match — and every one
   * is reported with its reason, so the author sees it.
   */
  disputed: { what: string; reason: string }[];
}
export interface ConstructionPlan {
  route: Route;
  analysis: string;
  frame: string;
  scale?: number;
  values: PlanValue[];
  checks: PlanCheck[];
  constraints: PlanConstraint[];
  features: PlanFeature[];
  expect: ExpectedContent;
}
export interface ConstructionState {
  plan: ConstructionPlan | null;
  definitionId: string | null;
  instanceId: string | null;
  /** Entity or annotation id → the plan feature it belongs to. */
  tags: Record<string, string>;
  /** Result of the last verify, at the workspace revision it ran on. */
  verified: { revision: number; ok: boolean } | null;
}

export function emptyConstruction(): ConstructionState {
  return { plan: null, definitionId: null, instanceId: null, tags: {}, verified: null };
}

const RESERVED = new Set(["DIM", "TXT", "SCALE", "PI", "pi", "e", "E"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
export const PRIMITIVE_LAYERS: LayerCategory[] = ["outline", "secondary", "hidden", "centre", "water", "ground", "level", "existing", "proposed", "construction", "leader", "text", "general"];

// ---------------------------------------------------------------------------
// Argument readers
// ---------------------------------------------------------------------------

function str(a: Args, k: string): string {
  const v = a[k];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  throw new ToolError(`"${k}" is required.`);
}
function optStr(a: Args, k: string): string | undefined {
  const v = a[k];
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
/** Models often type "\\n" literally where they mean a line break. */
const lineBreaks = (t: string) => t.replace(/\\n/g, "\n");

function exprText(v: unknown, what: string): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim()) return v.trim();
  throw new ToolError(`${what} must be a number or an expression.`);
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function globalsOf(ws: DraftingWorkspace): Scope {
  return annotationGlobals(ws.cad.settings);
}

/** The plan's values evaluated in dependency order, with the annotation globals. */
export function evaluatePlanValues(values: PlanValue[], globals: Scope): { scope: Scope; errors: string[] } {
  const errors: string[] = [];
  const names = new Set<string>();
  for (const v of values) {
    if (!NAME.test(v.name)) errors.push(`"${v.name}" is not a usable name (letters, digits, _; start with a letter).`);
    else if (RESERVED.has(v.name)) errors.push(`"${v.name}" is reserved (DIM, TXT and SCALE are the annotation spacing, PI and e are constants).`);
    else if (names.has(v.name)) errors.push(`${v.name} is defined twice.`);
    names.add(v.name);
  }
  const known = new Set([...names, ...Object.keys(globals)]);
  for (const v of values) {
    const unknown = exprDependencies(v.expr).filter((d) => !known.has(d));
    if (unknown.length) errors.push(`${v.name} = ${v.expr} uses ${unknown.join(", ")}, which the plan does not define.`);
  }
  const { order, cyclic } = orderByDependencies(values.map((v) => ({ name: v.name, expr: v.expr })));
  if (cyclic.length) errors.push(`These values depend on each other in a circle: ${cyclic.join(", ")}.`);
  const scope: Scope = { ...globals };
  if (errors.length) return { scope, errors };
  const byName = new Map(values.map((v) => [v.name, v]));
  for (const n of order) {
    try {
      scope[n] = evalExpr(byName.get(n)!.expr, scope);
    } catch (e) {
      errors.push(`${n} = ${byName.get(n)!.expr}: ${(e as Error).message}.`);
    }
  }
  return { scope, errors };
}

/** How close a check must come: the model tolerance, in the check's own unit. */
function checkTolerance(ws: DraftingWorkspace, unit: PlanUnit): number {
  if (unit === "deg") return (ws.policy.angle_rad * 180) / Math.PI;
  // Levels (m) and ratios compare at the model tolerance's own scale.
  return unit === "mm" ? ws.policy.geometry_mm : ws.policy.geometry_mm / 1000;
}

export function planScope(ws: DraftingWorkspace): Scope {
  const plan = ws.construction.plan;
  if (!plan) throw new ToolError("There is no plan yet. Call plan first.");
  const { scope, errors } = evaluatePlanValues(plan.values, globalsOf(ws));
  if (errors.length) throw new ToolError(`The plan does not evaluate: ${errors.join(" ")}`);
  return scope;
}

function parseValues(raw: unknown): PlanValue[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ToolError(`"values" must be a list of {name, expr, unit, note}.`);
  return raw.map((r, i) => {
    const o = (r ?? {}) as Args;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) throw new ToolError(`Value ${i + 1} has no name.`);
    const expr = exprText(o.expr ?? o.value, `${name}'s expr`);
    const unit = (["mm", "m", "deg", "-"].includes(String(o.unit)) ? String(o.unit) : "mm") as PlanUnit;
    return { name, expr, unit, note: optStr(o, "note") };
  });
}

function parseChecks(raw: unknown): PlanCheck[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ToolError(`"checks" must be a list of {label, expr, expect}.`);
  return raw.map((r, i) => {
    const o = (r ?? {}) as Args;
    const expect = Number(o.expect);
    if (!Number.isFinite(expect)) throw new ToolError(`Check ${i + 1} needs "expect", the number the reference states.`);
    const unit = (["mm", "m", "deg", "-"].includes(String(o.unit)) ? String(o.unit) : "mm") as PlanUnit;
    return { label: optStr(o, "label") ?? `check ${i + 1}`, expr: exprText(o.expr, `Check ${i + 1}'s expr`), expect, unit };
  });
}

function parseConstraints(raw: unknown): PlanConstraint[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ToolError(`"constraints" must be a list of {label, expr, op, than}.`);
  return raw.map((r, i) => {
    const o = (r ?? {}) as Args;
    const op = String(o.op ?? "").trim();
    if (![">", ">=", "<", "<="].includes(op)) throw new ToolError(`Constraint ${i + 1}: op is one of > >= < <=.`);
    return { label: optStr(o, "label") ?? `constraint ${i + 1}`, expr: exprText(o.expr, `Constraint ${i + 1}'s expr`), op: op as PlanConstraint["op"], than: exprText(o.than ?? 0, `Constraint ${i + 1}'s than`) };
  });
}

function parseFeatures(raw: unknown): PlanFeature[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ToolError(`"features" must be a list of {name, description, construction}.`);
  return raw.map((r, i) => {
    const o = (r ?? {}) as Args;
    const name = optStr(o, "name");
    if (!name) throw new ToolError(`Feature ${i + 1} has no name.`);
    return { name, description: optStr(o, "description") ?? "", construction: optStr(o, "construction") };
  });
}

function parseExpect(raw: unknown): ExpectedContent {
  const o = (raw ?? {}) as Args;
  const dims = Array.isArray(o.dimensions) ? (o.dimensions as unknown[]).map(Number).filter(Number.isFinite) : [];
  const levels = Array.isArray(o.levels)
    ? (o.levels as unknown[])
        .map((l) => l as Args)
        .map((l) => ({ label: String(l?.label ?? "").trim(), rl: Number(l?.rl) }))
        .filter((l) => l.label && Number.isFinite(l.rl))
    : [];
  const texts = Array.isArray(o.texts) ? (o.texts as unknown[]).map((t) => String(t).trim()).filter(Boolean) : [];
  const disputed = Array.isArray(o.disputed)
    ? (o.disputed as unknown[])
        .map((d) => d as Args)
        .map((d) => ({ what: String(d?.what ?? "").trim(), reason: String(d?.reason ?? "").trim() }))
        .filter((d) => d.what)
    : [];
  for (const d of disputed) if (d.reason.length < 15) throw new ToolError(`Disputed "${d.what}": say why it contradicts the reference's other numbers (which ones, and what they give).`);
  return { dimensions: dims, levels, texts, disputed };
}

function definitionId(ws: DraftingWorkspace): string {
  if (ws.construction.definitionId) return ws.construction.definitionId;
  const taken = new Set((ws.cad.definitions ?? []).map((d) => d.id));
  for (let i = 1; ; i++) if (!taken.has(`drawing.agent-${i}`)) return `drawing.agent-${i}`;
}

export function currentDefinition(ws: DraftingWorkspace): ComponentDefinition | null {
  const id = ws.construction.definitionId;
  return id ? (ws.cad.definitions ?? []).find((d) => d.id === id) ?? null : null;
}

function withPlan(def: ComponentDefinition | null, plan: ConstructionPlan, id: string, title: string): ComponentDefinition {
  const typed = (v: PlanValue) => /^-?\d+(\.\d+)?$/.test(v.expr.trim());
  const kind = (u: PlanUnit): ComponentParameter["kind"] => (u === "m" ? "level" : u === "deg" ? "angle" : u === "-" ? "ratio" : "length");
  const parameters: ComponentParameter[] = plan.values.filter(typed).map((v) => ({
    name: v.name,
    label: v.note,
    kind: kind(v.unit),
    unit: v.unit,
    default: Number(v.expr),
    group: v.unit === "m" ? "Levels" : "Values read",
    description: v.note,
  }));
  const formulas: ComponentFormula[] = plan.values
    .filter((v) => !typed(v))
    .map((v) => ({ name: v.name, expr: v.expr, label: v.note ?? v.name, unit: v.unit, report: true, group: "Worked out" }));
  return {
    id,
    name: title,
    category: "assembly",
    semanticType: "drawing",
    view: "elevation",
    drawingScale: plan.scale,
    description: plan.analysis.slice(0, 400),
    version: String(Number(def?.version ?? 0) + 1),
    parameters,
    formulas,
    primitives: def?.primitives ?? [],
    dimensions: def?.dimensions ?? [],
    levels: def?.levels ?? [],
    leaders: def?.leaders ?? [],
    texts: def?.texts ?? [],
    hatches: def?.hatches ?? [],
    invariants: (plan.constraints ?? []).map((c, i) => ({ id: `c${i + 1}`, expr: c.expr, op: c.op, than: c.than, message: `${c.label}: needs ${c.expr} ${c.op} ${c.than}.`, severity: "error" as const })),
    origin: { kind: "drawn", relations: def?.origin?.relations, customValues: def?.origin?.customValues, construction: def?.origin?.construction },
  };
}

/** Evaluates a candidate definition as the editor would, without changing anything. */
function evaluateCandidate(ws: DraftingWorkspace, def: ComponentDefinition, values: Record<string, number> = {}): ComponentEvaluation {
  const registry = registryFor({ definitions: [...(ws.cad.definitions ?? []).filter((d) => d.id !== def.id), def] });
  return evaluateComponent(def, values, registry, undefined, { globals: globalsOf(ws) });
}

export function constructionEvaluation(ws: DraftingWorkspace): ComponentEvaluation | null {
  const def = currentDefinition(ws);
  return def ? evaluateCandidate(ws, def) : null;
}

function hasContent(def: ComponentDefinition): boolean {
  return Boolean(def.primitives?.length || def.dimensions?.length || def.levels?.length || def.leaders?.length || def.texts?.length || def.hatches?.length);
}

/**
 * Put the changed definition on the drawing — or refuse the whole change, with
 * the engine's reasons, if it would not evaluate cleanly.
 */
function commit(ws: DraftingWorkspace, draft: ComponentDefinition, tag?: { ids: string[]; feature: string | undefined }): ComponentEvaluation {
  const plan = ws.construction.plan;
  const tags = { ...ws.construction.tags, ...(tag?.feature ? Object.fromEntries(tag.ids.map((id) => [id, tag.feature!])) : {}) };
  const bound = plan ? bindDimensions(draft, plan, globalsOf(ws), ws.policy.geometry_mm) : draft;
  const next: ComponentDefinition = { ...bound, origin: { ...(bound.origin ?? { kind: "drawn" }), kind: "drawn", construction: plan ? { plan, tags } : bound.origin?.construction } };
  const ev = evaluateCandidate(ws, next);
  const errors = ev.issues.filter((i) => i.severity === "error");
  if (errors.length) throw new ToolError(`Refused — ${errors.map((e) => `${e.path ? e.path + ": " : ""}${e.message}`).join(" ")} Nothing was changed.`);
  ws.applyCad({ type: "CAD_PUT_DEFINITION", definition: next });
  ws.construction = { ...ws.construction, definitionId: next.id };
  const placed = ws.construction.instanceId && ws.cad.components.some((c) => c.id === ws.construction.instanceId);
  if (!placed && hasContent(next)) {
    const r = ws.applyCad({ type: "CAD_INSERT_COMPONENT", definitionId: next.id, at: { x: 0, y: 0 }, absoluteElevation: true, name: next.name });
    if (!r.ok) throw new ToolError(r.message);
    ws.construction = { ...ws.construction, instanceId: ws.cad.components[ws.cad.components.length - 1].id };
  }
  ws.construction = { ...ws.construction, tags, verified: null };
  keepScale(ws, ev);
  return ev;
}

/** How long a dimension measures, from its own expressions. */
function dimensionValue(d: DimensionDef, scope: Scope): number {
  const dx = Math.abs(evalExpr(d.to[0], scope) - evalExpr(d.from[0], scope));
  const dy = Math.abs(evalExpr(d.to[1], scope) - evalExpr(d.from[1], scope));
  return d.kind === "horizontal" ? dx : d.kind === "vertical" ? dy : Math.hypot(dx, dy);
}

/**
 * Which value each dimension drives — found, not declared. A dimension drives
 * a typed value when it measures that value exactly and moves one for one with
 * it (∂dimension/∂value = 1, by re-evaluating the plan with the value nudged).
 * Editing such a dimension then sets the value, and the drawing regenerates
 * from it. A dimension that measures a combination (an overall width, a
 * clearance between two levels) drives nothing: it is a result.
 */
export function bindDimensions(def: ComponentDefinition, plan: ConstructionPlan, globals: Scope, tol: number): ComponentDefinition {
  const dims = def.dimensions ?? [];
  if (!dims.length) return def;
  const base = evaluatePlanValues(plan.values, globals);
  if (base.errors.length) return def;
  const measure = (d: DimensionDef, scope: Scope) => {
    try {
      return dimensionValue(d, scope);
    } catch {
      return NaN;
    }
  };
  const m0 = dims.map((d) => measure(d, base.scope));
  const typed = plan.values.filter((v) => v.unit === "mm" && /^-?\d+(\.\d+)?$/.test(v.expr.trim()));
  const candidates: string[][] = dims.map(() => []);
  for (const v of typed) {
    const value = Number(v.expr);
    if (!m0.some((m) => Math.abs(m - value) <= tol)) continue;
    const nudged = evaluatePlanValues(
      plan.values.map((x) => (x.name === v.name ? { ...x, expr: String(value + 1) } : x)),
      globals
    );
    if (nudged.errors.length) continue;
    dims.forEach((d, i) => {
      if (Math.abs(m0[i] - value) > tol) return;
      if (Math.abs(measure(d, nudged.scope) - m0[i] - 1) < 1e-6) candidates[i].push(v.name);
    });
  }
  return {
    ...def,
    dimensions: dims.map((d, i) => {
      const c = candidates[i];
      const drives = d.drives && c.includes(d.drives) ? d.drives : c[0];
      return drives === d.drives ? d : { ...d, drives };
    }),
  };
}

function extentOf(ev: ComponentEvaluation): { w: number; h: number } | null {
  const pts = [...ev.loops.flatMap((l) => l.points), ...ev.circles.flatMap((c) => [{ x: c.center.x - c.r, y: c.center.y - c.r }, { x: c.center.x + c.r, y: c.center.y + c.r }])];
  if (!pts.length) return null;
  return { w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), h: Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)) };
}

/**
 * The annotation scale: the one written on the reference (plan.scale), else
 * the standard scale at which text reads well against the construction
 * (lib/cad/sheet readableAnnotationScale) — re-chosen as the drawing grows, so
 * text is never sized for its first few lines, nor 2.5 mm beside a 400 mm plate.
 */
function keepScale(ws: DraftingWorkspace, ev: ComponentEvaluation) {
  let scale = ws.construction.plan?.scale;
  if (!scale) {
    const e = extentOf(ev);
    if (!e) return;
    const s = ws.cad.settings;
    scale = readableAnnotationScale(e.w, e.h, Math.min(s.textHeight, s.dimTextHeight ?? s.textHeight));
  }
  if (scale && scale !== ws.cad.settings.annotationScale) ws.applyCad({ type: "CAD_SET_SETTINGS", patch: { annotationScale: scale } });
}

/**
 * A revision that sends only what changed: values, checks and features replace
 * the ones of the same name (or are added), `remove` drops names, and each
 * expected list given replaces that list.
 */
function mergePlan(prev: ConstructionPlan, a: Args): Args {
  const byKey = <T,>(old: T[], next: T[], key: (x: T) => string, drop: Set<string>) => {
    const out = old.filter((x) => !drop.has(key(x)));
    for (const n of next) {
      const i = out.findIndex((x) => key(x) === key(n));
      if (i >= 0) out[i] = n;
      else out.push(n);
    }
    return out;
  };
  const drop = new Set(Array.isArray(a.remove) ? (a.remove as unknown[]).map(String) : []);
  const expectIn = (a.expect ?? {}) as Args;
  return {
    route: prev.route,
    title: a.title,
    analysis: optStr(a, "analysis") ?? prev.analysis,
    frame: optStr(a, "frame") ?? prev.frame,
    scale: a.scale ?? prev.scale,
    values: byKey(prev.values, parseValues(a.values), (v) => v.name, drop),
    checks: byKey(prev.checks, parseChecks(a.checks), (c) => c.label, drop),
    constraints: byKey(prev.constraints ?? [], parseConstraints(a.constraints), (c) => c.label, drop),
    features: byKey(prev.features, parseFeatures(a.features), (f) => f.name, drop),
    expect: {
      dimensions: expectIn.dimensions ?? prev.expect.dimensions,
      levels: expectIn.levels ?? prev.expect.levels,
      texts: expectIn.texts ?? prev.expect.texts,
      disputed: expectIn.disputed ?? prev.expect.disputed,
    },
  };
}

export function recordPlan(ws: DraftingWorkspace, raw: Args): string {
  const prior = ws.construction.plan;
  const a = raw.update === true && prior ? mergePlan(prior, raw) : raw;
  const route: Route = optStr(a, "route") === "sketch" ? "sketch" : "construction";
  const analysis = optStr(a, "analysis");
  if (!analysis || analysis.length < 40) {
    throw new ToolError(
      "Write the analysis first: every visible part and what it is, the topology (what sits on what, what is inside what), which half is section and which elevation, symmetry, line types (hidden, centre), materials, and every written dimension and level."
    );
  }
  const values = parseValues(a.values);
  const checks = parseChecks(a.checks);
  const constraints = parseConstraints(a.constraints);
  const features = parseFeatures(a.features);
  if (route === "construction" && !features.length) throw new ToolError("List the features you will construct (name, description, construction: which tools, from which values).");
  const scale = Number(a.scale);
  const plan: ConstructionPlan = {
    route,
    analysis,
    frame: optStr(a, "frame") ?? "",
    scale: Number.isFinite(scale) && scale > 0 ? scale : undefined,
    values,
    checks,
    constraints,
    features,
    expect: parseExpect(a.expect),
  };
  const { scope, errors } = evaluatePlanValues(values, annotationGlobals({ ...ws.cad.settings, annotationScale: plan.scale ?? ws.cad.settings.annotationScale }));
  if (errors.length) throw new ToolError(`Plan not recorded — ${errors.join(" ")}`);
  const broken = constraints.filter((c) => {
    try {
      return !holds(evalExpr(c.expr, scope), c.op, evalExpr(c.than, scope));
    } catch {
      return true;
    }
  });
  if (broken.length) throw new ToolError(`Plan not recorded — these constraints do not hold even for the values read: ${broken.map((c) => `${c.label} (${c.expr} ${c.op} ${c.than})`).join("; ")}.`);

  const out: string[] = [];
  const failed: string[] = [];
  const checkLines = checks.map((c) => {
    try {
      const got = evalExpr(c.expr, scope);
      const ok = Math.abs(got - c.expect) <= checkTolerance(ws, c.unit);
      if (!ok) failed.push(c.label);
      return `  ${ok ? "ok  " : "FAIL"} ${c.label}: ${c.expr} = ${fmt3(got)}, the reference says ${fmt3(c.expect)}`;
    } catch (e) {
      failed.push(c.label);
      return `  FAIL ${c.label}: ${(e as Error).message}`;
    }
  });

  if (plan.scale && plan.scale !== ws.cad.settings.annotationScale) ws.applyCad({ type: "CAD_SET_SETTINGS", patch: { annotationScale: plan.scale } });
  const previous = ws.construction.plan;
  ws.construction = { ...ws.construction, plan };
  if (optStr(a, "title")) ws.title = optStr(a, "title")!;
  if (route === "construction") {
    const def = withPlan(currentDefinition(ws), plan, definitionId(ws), optStr(a, "title") ?? currentDefinition(ws)?.name ?? "Agent construction");
    try {
      commit(ws, def);
    } catch (e) {
      ws.construction = { ...ws.construction, plan: previous };
      throw new ToolError(`Plan not recorded — the entities already drawn would break: ${(e as Error).message}`);
    }
  }

  out.push(`Plan recorded (${route} route): ${values.length} values, ${checks.length} checks, ${constraints.length} constraints, ${features.length} features.`);
  const typed = values.filter((v) => /^-?\d+(\.\d+)?$/.test(v.expr.trim()));
  const derived = values.filter((v) => !typed.includes(v));
  if (typed.length) out.push(`Read: ${typed.map((v) => `${v.name}=${fmt3(scope[v.name])}${unitText(v.unit)}`).join(", ")}`);
  if (derived.length) out.push(`Worked out: ${derived.map((v) => `${v.name} = ${v.expr} = ${fmt3(scope[v.name])}${unitText(v.unit)}`).join("; ")}`);
  if (checkLines.length) out.push(`Checks against numbers the reference also writes:\n${checkLines.join("\n")}`);
  if (failed.length) out.push(`${failed.length} check(s) FAIL: a value you read, or a relation you wrote, is wrong — or the reference contradicts itself. Find which before drawing; if the reference really is inconsistent, keep the check, and report it.`);
  const e = plan.expect;
  out.push(`Expected on the finished drawing: ${e.dimensions.length} dimensions, ${e.levels.length} levels, ${e.texts.length} texts. verify measures them back from your geometry.${e.disputed.length ? ` Disputed (not drawn, reported to the author): ${e.disputed.map((d) => d.what).join(", ")}.` : ""}`);
  if (!e.dimensions.length && !e.levels.length) out.push("You listed no expected dimensions or levels — list every number the reference writes in expect, or verify cannot compare your drawing with it.");
  out.push(
    route === "construction"
      ? `Next: construct each feature, writing coordinates as expressions of these values (the engine does the arithmetic). Annotation spacing: DIM=${fmt3(scope.DIM)} mm (one dimension row), TXT=${fmt3(scope.TXT)} mm (text height) at 1:${ws.cad.settings.annotationScale}.`
      : "Next: draw with the sketch tools (draw_*), then constrain and dimension."
  );
  return out.join("\n");
}

const holds = (a: number, op: PlanConstraint["op"], b: number) => (op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : a <= b);

const fmt3 = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3))));
const unitText = (u: PlanUnit) => (u === "-" ? "" : u === "deg" ? "°" : ` ${u}`);

// ---------------------------------------------------------------------------
// References: Box.p3, Box.start, Box.end, Pipe.center, Box.e2.mid, Pipe.r
// ---------------------------------------------------------------------------

function primitive(def: ComponentDefinition, id: string): ComponentPrimitive {
  const p = (def.primitives ?? []).find((x) => x.id === id);
  if (!p) {
    const known = (def.primitives ?? []).map((x) => x.id);
    throw new ToolError(`There is no entity "${id}".${known.length ? ` Entities: ${known.slice(0, 40).join(", ")}${known.length > 40 ? "…" : ""}.` : " Nothing is constructed yet."}`);
  }
  return p;
}

function vertexOf(def: ComponentDefinition, id: string, part: string): XY {
  const p = primitive(def, id);
  const lower = part.toLowerCase();
  if (p.kind === "circle") {
    if (lower === "center" || lower === "centre") return p.center;
    throw new ToolError(`${id} is a circle: use ${id}.center (and ${id}.r).`);
  }
  const pts = p.points;
  if (lower === "start") return pts[0];
  if (lower === "end") return pts[pts.length - 1];
  const v = lower.match(/^p(\d+)$/);
  if (v) {
    const k = Number(v[1]);
    if (k < 1 || k > pts.length) throw new ToolError(`${id} has points p1 to p${pts.length}.`);
    return pts[k - 1];
  }
  const e = lower.match(/^e(\d+)\.mid$/);
  if (e) {
    const k = Number(e[1]);
    const edges = p.kind === "loop" ? pts.length : pts.length - 1;
    if (k < 1 || k > edges) throw new ToolError(`${id} has edges e1 to e${edges}.`);
    const a = pts[k - 1];
    const b = pts[k % pts.length];
    return [`((${a[0]}) + (${b[0]})) / 2`, `((${a[1]}) + (${b[1]})) / 2`];
  }
  throw new ToolError(`"${id}.${part}" is not a point. Use ${id}.p1…, ${id}.start, ${id}.end, ${id}.e1.mid.`);
}

const REF_IN_EXPR = /\b([A-Za-z][A-Za-z0-9_]*)\.(p\d+|start|end|center|centre|e\d+\.mid)\.(x|y)\b|\b([A-Za-z][A-Za-z0-9_]*)\.r\b/g;

/** Replaces entity references inside an expression by the expressions they stand for. */
function resolveRefs(expr: string, def: ComponentDefinition | null): string {
  if (!expr.includes(".")) return expr;
  return expr.replace(REF_IN_EXPR, (m, id?: string, part?: string, axis?: string, cid?: string) => {
    if (/^\d/.test(m)) return m;
    if (!def) throw new ToolError(`"${m}" refers to an entity, but nothing is constructed yet.`);
    if (cid) {
      const c = primitive(def, cid);
      if (c.kind !== "circle") throw new ToolError(`${cid} is not a circle; it has no radius.`);
      return `(${c.r})`;
    }
    const v = vertexOf(def, id!, part!);
    return `(${axis === "x" ? v[0] : v[1]})`;
  });
}

/** A scalar argument: number, value name or expression (entity refs allowed). */
function scalar(v: unknown, what: string, def: ComponentDefinition | null, scope: Scope): Expr {
  const text = resolveRefs(exprText(v, what), def);
  try {
    evalExpr(text, scope);
  } catch (e) {
    throw new ToolError(`${what} "${text}": ${(e as Error).message}. Use numbers, plan value names and + - * / ( ).`);
  }
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
}

/** A point argument: [x, y] (numbers or expressions) or a reference like "Box.p3". */
/** Splits "a, b" at its one top-level comma (commas inside max(a, b) do not count). */
function splitPair(s: string): [string, string] | null {
  const t = s.replace(/^\(\s*/, "").replace(/\s*\)$/, "");
  let depth = 0;
  const cuts: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++;
    else if (t[i] === ")") depth--;
    else if (t[i] === "," && depth === 0) cuts.push(i);
  }
  return cuts.length === 1 ? [t.slice(0, cuts[0]).trim(), t.slice(cuts[0] + 1).trim()] : null;
}

const POINT_REF = /^([A-Za-z][A-Za-z0-9_]*)\.(p\d+|start|end|center|centre|e\d+\.mid)$/i;

/** A point argument: [x, y] (numbers or expressions) or a reference like "Box.p3". */
function point(v: unknown, what: string, def: ComponentDefinition | null, scope: Scope): XY {
  if (typeof v === "string") {
    const s = v.trim();
    const ref = s.match(POINT_REF);
    if (ref) {
      if (!def) throw new ToolError(`${what} "${s}" refers to an entity, but nothing is constructed yet.`);
      const p = vertexOf(def, ref[1], ref[2]);
      return [scalar(p[0], what, def, scope), scalar(p[1], what, def, scope)];
    }
    const pair = splitPair(s);
    if (pair) return [scalar(pair[0], `${what} x`, def, scope), scalar(pair[1], `${what} y`, def, scope)];
    throw new ToolError(`${what} must be [x, y] or a point reference like Box.p3.`);
  }
  if (Array.isArray(v) && v.length >= 2) return [scalar(v[0], `${what} x`, def, scope), scalar(v[1], `${what} y`, def, scope)];
  throw new ToolError(`${what} must be [x, y] or a point reference like Box.p3.`);
}

function points(v: unknown, what: string, def: ComponentDefinition | null, scope: Scope): XY[] {
  if (!Array.isArray(v)) throw new ToolError(`${what} must be a list of points.`);
  return v.map((p, i) => point(p, `${what} ${i + 1}`, def, scope));
}

const num = (e: Expr, scope: Scope) => evalExpr(e, scope);
const showPt = (p: XY, scope: Scope) => `(${fmt(num(p[0], scope))}, ${fmt(num(p[1], scope))})`;

function layerOf(a: Args, fallback: LayerCategory): LayerCategory {
  const l = optStr(a, "layer");
  if (!l) return fallback;
  if (!(PRIMITIVE_LAYERS as string[]).includes(l)) throw new ToolError(`Layer "${l}" is not one of ${PRIMITIVE_LAYERS.join(", ")}.`);
  return l as LayerCategory;
}

// ---------------------------------------------------------------------------
// Construct
// ---------------------------------------------------------------------------

function requireConstruction(ws: DraftingWorkspace): { def: ComponentDefinition; scope: Scope } {
  const plan = ws.construction.plan;
  if (!plan) throw new ToolError("Plan first: call plan with your analysis, values, checks and features. Nothing is drawn before a plan.");
  if (plan.route !== "construction") throw new ToolError("You planned the sketch route; construct belongs to the construction route. Re-plan with route construction, or use the sketch tools.");
  const def = currentDefinition(ws);
  if (!def) throw new ToolError("The plan has no construction yet — call plan again.");
  return { def, scope: planScope(ws) };
}

function allIds(def: ComponentDefinition): Set<string> {
  return new Set([
    ...(def.primitives ?? []).map((p) => p.id),
    ...(def.dimensions ?? []).map((p) => p.id),
    ...(def.levels ?? []).map((p) => p.id),
    ...(def.leaders ?? []).map((p) => p.id),
    ...(def.texts ?? []).map((p) => p.id),
    ...(def.hatches ?? []).map((p) => p.id),
  ]);
}

function freshId(def: ComponentDefinition, base: string): string {
  const ids = allIds(def);
  if (!ids.has(base)) return base;
  for (let i = 2; ; i++) if (!ids.has(`${base}_${i}`)) return `${base}_${i}`;
}

function arcPoints(center: XY, r: Expr, start: Expr, end: Expr, scope: Scope): XY[] {
  const s0 = num(start, scope);
  const s1 = num(end, scope);
  const sweep = s1 - s0;
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / 5));
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = `(${start}) + ${i} * ((${end}) - (${start})) / ${n}`;
    out.push([`(${center[0]}) + (${r}) * cos(${ang})`, `(${center[1]}) + (${r}) * sin(${ang})`]);
  }
  return out;
}

function entityFrom(o: Args, def: ComponentDefinition, scope: Scope): ComponentPrimitive {
  const id = optStr(o, "id");
  if (!id || !ID.test(id)) throw new ToolError(`Every entity needs an id (letters, digits, _): got ${JSON.stringify(o.id)}.`);
  const kind = optStr(o, "kind") ?? "polyline";
  const base = { id, role: optStr(o, "role") ?? "general", label: id, draw: o.draw === false ? false : undefined };
  const layer = layerOf(o, "outline");
  switch (kind) {
    case "line":
      return { ...base, kind: "path", layer, points: [point(o.from, `${id} from`, def, scope), point(o.to, `${id} to`, def, scope)] };
    case "polyline":
    case "path": {
      const pts = points(o.points, `${id} points`, def, scope);
      if (pts.length < 2) throw new ToolError(`${id} needs at least 2 points.`);
      return { ...base, kind: "path", layer, points: pts };
    }
    case "loop":
    case "polygon": {
      const pts = points(o.points, `${id} points`, def, scope);
      if (pts.length < 3) throw new ToolError(`${id} needs at least 3 points to close.`);
      return { ...base, kind: "loop", layer, points: pts };
    }
    case "rect": {
      const x = Sy.sym(scalar(o.x, `${id} x`, def, scope), scope);
      const y = Sy.sym(scalar(o.y, `${id} y`, def, scope), scope);
      const w = Sy.sym(scalar(o.w ?? o.width, `${id} w`, def, scope), scope);
      const h = Sy.sym(scalar(o.h ?? o.height, `${id} h`, def, scope), scope);
      const x2 = Sy.add(x, w);
      const y2 = Sy.add(y, h);
      return { ...base, kind: "loop", layer, points: [Sy.toXY(Sy.pt(x, y)), Sy.toXY(Sy.pt(x2, y)), Sy.toXY(Sy.pt(x2, y2)), Sy.toXY(Sy.pt(x, y2))] };
    }
    case "circle":
      return { ...base, kind: "circle", layer, center: point(o.center, `${id} center`, def, scope), r: scalar(o.r ?? o.radius, `${id} r`, def, scope) };
    case "arc": {
      const c = point(o.center, `${id} center`, def, scope);
      const r = scalar(o.r ?? o.radius, `${id} r`, def, scope);
      const s0 = scalar(o.start ?? 0, `${id} start`, def, scope);
      const s1 = scalar(o.end ?? 360, `${id} end`, def, scope);
      return { ...base, kind: "path", layer, points: arcPoints(c, r, s0, s1, scope) };
    }
    default:
      throw new ToolError(`${id}: kind "${kind}" is not one of line, polyline, loop, rect, circle, arc.`);
  }
}

function describeEntity(p: ComponentPrimitive, scope: Scope, full = true): string {
  if (p.kind === "circle") return `${p.id} circle centre ${showPt(p.center, scope)} r ${fmt(num(p.r, scope))}${p.layer !== "outline" ? ` [${p.layer}]` : ""}`;
  const pts = p.points.map((q) => showPt(q, scope));
  const shown = full || pts.length <= 12 ? pts.map((s, i) => `p${i + 1} ${s}`).join(" ") : `${pts.slice(0, 3).map((s, i) => `p${i + 1} ${s}`).join(" ")} … p${pts.length} ${pts[pts.length - 1]}`;
  return `${p.id} ${p.kind === "loop" ? "loop" : "path"}${p.layer !== "outline" ? ` [${p.layer}]` : ""}${p.draw === false ? " (not drawn)" : ""}: ${shown}`;
}

function featureArg(ws: DraftingWorkspace, a: Args): string | undefined {
  const f = optStr(a, "feature");
  if (!f) return undefined;
  const names = ws.construction.plan?.features.map((x) => x.name) ?? [];
  if (!names.includes(f)) throw new ToolError(`"${f}" is not a planned feature. Planned: ${names.join(", ")}. Add it with plan (plan again with the extra feature) if the reference needs it.`);
  return f;
}

function upsert(def: ComponentDefinition, prims: ComponentPrimitive[]): { def: ComponentDefinition; replaced: string[] } {
  const annIds = new Set([...allIds(def)].filter((id) => !(def.primitives ?? []).some((p) => p.id === id)));
  const replaced: string[] = [];
  let list = [...(def.primitives ?? [])];
  for (const p of prims) {
    if (annIds.has(p.id)) throw new ToolError(`"${p.id}" is already an annotation's id.`);
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) {
      list[i] = p;
      replaced.push(p.id);
    } else list.push(p);
  }
  const seen = new Set<string>();
  for (const p of prims) {
    if (seen.has(p.id)) throw new ToolError(`"${p.id}" appears twice in one call.`);
    seen.add(p.id);
  }
  list = list.filter(Boolean);
  return { def: { ...def, primitives: list }, replaced };
}

export function construct(ws: DraftingWorkspace, a: Args): string {
  const { def, scope } = requireConstruction(ws);
  const feature = featureArg(ws, a);
  const raw = Array.isArray(a.entities) ? (a.entities as Args[]) : null;
  if (!raw || !raw.length) throw new ToolError(`"entities" must list what to construct, e.g. [{id: "BoxOuter", kind: "loop", points: [["-HalfWidth", "BottomY"], …]}].`);
  // Entities may refer to ones earlier in the same call.
  let work = def;
  const made: ComponentPrimitive[] = [];
  for (const o of raw) {
    const p = entityFrom(o ?? {}, work, scope);
    made.push(p);
    work = upsert(work, [p]).def;
  }
  const { replaced } = upsert(def, made);
  const ev = commit(ws, work, { ids: made.map((p) => p.id), feature });
  return [
    `${made.length} entit${made.length === 1 ? "y" : "ies"} ${replaced.length ? `(${replaced.join(", ")} replaced) ` : ""}${feature ? `for ${feature}` : "(no feature given — tag it with feature)"}:`,
    ...made.map((p) => "  " + describeEntity(p, scope)),
    ...warnings(ev),
  ].join("\n");
}

function warnings(ev: ComponentEvaluation): string[] {
  const w = ev.issues.filter((i) => i.severity === "warning");
  return w.length ? [`Warnings: ${w.slice(0, 6).map((i) => i.message).join(" ")}`] : [];
}

// ---------------------------------------------------------------------------
// Transform: mirror, copy (array), move, rotate, offset — all symbolic
// ---------------------------------------------------------------------------

function mapPrimitive(p: ComponentPrimitive, f: (q: Sy.SP) => Sy.SP, scope: Scope, id: string): ComponentPrimitive {
  const m = (q: XY) => Sy.toXY(f(Sy.symPoint(q, scope)));
  if (p.kind === "circle") return { ...p, id, label: id, center: m(p.center) };
  return { ...p, id, label: id, points: p.points.map(m) };
}

export function transform(ws: DraftingWorkspace, a: Args): string {
  const { def, scope } = requireConstruction(ws);
  const feature = featureArg(ws, a);
  const op = str(a, "op");
  const targets = Array.isArray(a.targets) ? (a.targets as unknown[]).map(String) : typeof a.targets === "string" ? a.targets.split(/[,\s]+/).filter(Boolean) : [];
  if (!targets.length) throw new ToolError(`"targets" lists the entity ids to ${op}.`);
  const sources = targets.map((id) => primitive(def, id));
  const newIds = Array.isArray(a.ids) ? (a.ids as unknown[]).map(String) : [];
  const tol = ws.policy.geometry_mm;
  const S = (v: unknown, what: string) => Sy.sym(scalar(v, what, def, scope), scope);
  const P = (v: unknown, what: string) => Sy.symPoint(point(v, what, def, scope), scope);
  const made: ComponentPrimitive[] = [];
  const nameFor = (i: number, suffix: string) => newIds[i] ?? freshId({ ...def, primitives: [...(def.primitives ?? []), ...made] }, `${sources[i].id}${suffix}`);

  switch (op) {
    case "mirror": {
      let a1: Sy.SP;
      let a2: Sy.SP;
      if (a.axis_x !== undefined) {
        const x = S(a.axis_x, "axis_x");
        a1 = Sy.pt(x, Sy.lit(0));
        a2 = Sy.pt(x, Sy.lit(1000));
      } else if (a.axis_y !== undefined) {
        const y = S(a.axis_y, "axis_y");
        a1 = Sy.pt(Sy.lit(0), y);
        a2 = Sy.pt(Sy.lit(1000), y);
      } else if (a.axis_from !== undefined && a.axis_to !== undefined) {
        a1 = P(a.axis_from, "axis_from");
        a2 = P(a.axis_to, "axis_to");
      } else throw new ToolError("Give the mirror axis: axis_x (a vertical line x = …), axis_y, or axis_from/axis_to.");
      const keep = a.keep !== false;
      sources.forEach((p, i) => made.push(mapPrimitive(p, (q) => Sy.mirrorPoint(q, a1, a2, tol), scope, keep ? nameFor(i, "_m") : p.id)));
      break;
    }
    case "move":
    case "copy": {
      const dx = S(a.dx ?? 0, "dx");
      const dy = S(a.dy ?? 0, "dy");
      const count = op === "copy" ? Math.max(1, Math.min(200, Math.round(Number(a.count ?? 1)))) : 1;
      for (let k = 1; k <= count; k++) {
        const kx = Sy.mul(Sy.lit(k), dx);
        const ky = Sy.mul(Sy.lit(k), dy);
        sources.forEach((p, i) =>
          made.push(mapPrimitive(p, (q) => Sy.translate(q, kx, ky), scope, op === "move" ? p.id : newIds[(k - 1) * sources.length + i] ?? freshId({ ...def, primitives: [...(def.primitives ?? []), ...made] }, `${p.id}_c${k}`)))
        );
      }
      break;
    }
    case "rotate": {
      const c = P(a.center, "center");
      const ang = S(a.angle, "angle");
      const keep = a.keep === true;
      sources.forEach((p, i) => made.push(mapPrimitive(p, (q) => Sy.rotatePoint(q, c, ang), scope, keep ? nameFor(i, "_r") : p.id)));
      break;
    }
    case "offset": {
      const d = S(a.distance, "distance");
      const side = optStr(a, "side") ?? "outside";
      sources.forEach((p, i) => {
        const id = nameFor(i, "_o");
        if (p.kind === "circle") {
          const r = Sy.sym(p.r, scope);
          made.push({ ...p, id, label: id, r: Sy.add(r, side === "inside" ? Sy.neg(d) : d).e });
          return;
        }
        const pts = p.points.map((q) => Sy.symPoint(q, scope));
        const closed = p.kind === "loop";
        let s: 1 | -1;
        if (closed) {
          const ccw = Sy.areaOf(pts.map((q) => ({ x: q.x.v, y: q.y.v }))) > 0;
          if (side !== "inside" && side !== "outside") throw new ToolError(`A loop is offset "inside" or "outside".`);
          s = (side === "outside") === ccw ? -1 : 1;
        } else {
          if (side !== "left" && side !== "right") throw new ToolError(`An open path is offset "left" or "right" of its direction (start → end).`);
          s = side === "left" ? 1 : -1;
        }
        const out = Sy.offsetPoints(pts, d, closed, s, tol);
        made.push({ ...p, id, label: id, points: out.map(Sy.toXY) } as ComponentPrimitive);
      });
      break;
    }
    default:
      throw new ToolError(`op "${op}" is not mirror, copy, move, rotate or offset.`);
  }
  if (optStr(a, "layer")) for (const m of made) m.layer = layerOf(a, m.layer);
  const { def: next, replaced } = upsert(def, made);
  const ev = commit(ws, next, { ids: made.filter((m) => !replaced.includes(m.id)).map((m) => m.id), feature: feature ?? ws.construction.tags[targets[0]] });
  return [`${op}: ${made.length} entit${made.length === 1 ? "y" : "ies"}${replaced.length ? ` (${replaced.join(", ")} changed in place)` : ""}:`, ...made.map((p) => "  " + describeEntity(p, scope, false)), ...warnings(ev)].join("\n");
}

// ---------------------------------------------------------------------------
// Boolean
// ---------------------------------------------------------------------------

export function booleanOp(ws: DraftingWorkspace, a: Args): string {
  const { def, scope } = requireConstruction(ws);
  const feature = featureArg(ws, a);
  const op = str(a, "op") as Sy.BooleanOp;
  if (!["union", "difference", "intersection"].includes(op)) throw new ToolError(`op must be union, difference or intersection.`);
  const ids = (k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : typeof a[k] === "string" ? String(a[k]).split(/[,\s]+/).filter(Boolean) : []);
  const A = ids("a");
  const B = ids("b");
  if (!A.length || !B.length) throw new ToolError(`Give the loops: a (the base) and b (added, cut away or intersected).`);
  const loopsOf = (list: string[]) =>
    list.map((id) => {
      const p = primitive(def, id);
      if (p.kind !== "loop") throw new ToolError(`${id} is not a closed loop.`);
      return p.points.map((q) => Sy.symPoint(q, scope));
    });
  const result = Sy.booleanLoops(op, loopsOf(A), loopsOf(B), ws.policy.weld_mm);
  if (!result.length) throw new ToolError(`${op} of ${A.join(", ")} and ${B.join(", ")} is empty.`);
  const base = optStr(a, "id") ?? `${A[0]}_${op}`;
  const layer = layerOf(a, primitive(def, A[0]).layer);
  let work = def;
  if (a.keep_sources !== true) work = { ...work, primitives: (work.primitives ?? []).filter((p) => !A.includes(p.id) && !B.includes(p.id)) };
  const made: ComponentPrimitive[] = result.map((loop, i) => {
    const id = i === 0 ? base : `${base}_${i + 1}`;
    return { id, label: id, role: primitive(def, A[0]).role, layer, kind: "loop", points: loop.map(Sy.toXY) };
  });
  const hatchUsers = (work.hatches ?? []).filter((h) => (a.keep_sources !== true && (A.includes(h.boundary) || B.includes(h.boundary))) || (h.holes ?? []).some((x) => a.keep_sources !== true && (A.includes(x) || B.includes(x))));
  if (hatchUsers.length) throw new ToolError(`${hatchUsers.map((h) => h.id).join(", ")} hatch${hatchUsers.length === 1 ? "es" : ""} a source loop; remove the hatch first or pass keep_sources true.`);
  const { def: next } = upsert(work, made);
  const ev = commit(ws, next, { ids: made.map((m) => m.id), feature: feature ?? ws.construction.tags[A[0]] });
  const holes = made.filter((m) => m.kind === "loop" && Sy.areaOf(m.points.map((q) => ({ x: num(q[0], scope), y: num(q[1], scope) }))) < 0).map((m) => m.id);
  return [`${op}: ${made.length} loop(s)${holes.length ? ` — ${holes.join(", ")} ${holes.length === 1 ? "is a hole" : "are holes"} (use as hatch holes)` : ""}${a.keep_sources === true ? "" : "; the source loops were replaced"}:`, ...made.map((p) => "  " + describeEntity(p, scope, false)), ...warnings(ev)].join("\n");
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

export function removeEntities(ws: DraftingWorkspace, a: Args): string {
  const { def } = requireConstruction(ws);
  const ids = Array.isArray(a.ids) ? (a.ids as unknown[]).map(String) : typeof a.ids === "string" ? a.ids.split(/[,\s]+/).filter(Boolean) : [];
  if (!ids.length) throw new ToolError(`"ids" lists what to remove (entities or annotations).`);
  const present = allIds(def);
  const missing = ids.filter((id) => !present.has(id));
  if (missing.length) throw new ToolError(`Not found: ${missing.join(", ")}.`);
  const drop = new Set(ids);
  const hatchesLeft = (def.hatches ?? []).filter((h) => !drop.has(h.id) && (drop.has(h.boundary) || (h.holes ?? []).some((x) => drop.has(x))));
  if (hatchesLeft.length) throw new ToolError(`${hatchesLeft.map((h) => h.id).join(", ")} still use${hatchesLeft.length === 1 ? "s" : ""} ${ids.join(", ")} as a boundary — remove ${hatchesLeft.length === 1 ? "it" : "them"} too.`);
  const keep = <T extends { id: string }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !drop.has(x.id));
  const next: ComponentDefinition = {
    ...def,
    primitives: keep(def.primitives),
    dimensions: keep(def.dimensions),
    levels: keep(def.levels),
    leaders: keep(def.leaders),
    texts: keep(def.texts),
    hatches: keep(def.hatches),
  };
  const tags = { ...ws.construction.tags };
  for (const id of ids) delete tags[id];
  ws.construction = { ...ws.construction, tags };
  commit(ws, next);
  return `Removed ${ids.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Annotation, written into the construction (it follows the values too)
// ---------------------------------------------------------------------------

const MATERIALS = Object.keys(HATCH_MATERIALS) as HatchMaterial[];

function annotationId(def: ComponentDefinition, a: Args, prefix: string): string {
  const id = optStr(a, "id");
  if (id) {
    if (!ID.test(id)) throw new ToolError(`id "${id}": letters, digits and _, starting with a letter.`);
    const clash = (def.primitives ?? []).some((p) => p.id === id);
    if (clash) throw new ToolError(`"${id}" is already an entity's id.`);
    return id;
  }
  const ids = allIds(def);
  for (let i = 1; ; i++) if (!ids.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

function replaceIn<T extends { id: string }>(xs: T[] | undefined, x: T): T[] {
  const list = [...(xs ?? [])];
  const i = list.findIndex((y) => y.id === x.id);
  if (i >= 0) list[i] = x;
  else list.push(x);
  return list;
}

function smallestLoopAround(def: ComponentDefinition, scope: Scope, x: number, y: number): string | null {
  let best: { id: string; area: number } | null = null;
  for (const p of def.primitives ?? []) {
    if (p.kind !== "loop") continue;
    const pts = p.points.map((q) => ({ x: num(q[0], scope), y: num(q[1], scope) }));
    let odd = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (pts[i].y > y !== pts[j].y > y && x < ((pts[j].x - pts[i].x) * (y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) odd = !odd;
    }
    if (!odd) continue;
    const area = Math.abs(Sy.areaOf(pts));
    if (!best || area < best.area) best = { id: p.id, area };
  }
  return best?.id ?? null;
}

export function annotateConstruction(ws: DraftingWorkspace, a: Args): string {
  const { def, scope } = requireConstruction(ws);
  const feature = featureArg(ws, a);
  const kind = str(a, "kind");
  const layer = optStr(a, "layer") as LayerCategory | undefined;
  const height = a.height !== undefined && Number.isFinite(Number(a.height)) ? Number(a.height) : undefined;
  let next: ComponentDefinition;
  let id: string;
  let said: string;
  switch (kind) {
    case "dimension": {
      id = annotationId(def, a, "D");
      const from = point(a.from, "from", def, scope);
      const to = point(a.to, "to", def, scope);
      const dx = Math.abs(num(to[0], scope) - num(from[0], scope));
      const dy = Math.abs(num(to[1], scope) - num(from[1], scope));
      const k = (optStr(a, "orientation") as DimensionDef["kind"] | undefined) ?? (a.aligned === true ? "aligned" : dx >= dy ? "horizontal" : "vertical");
      if (!["horizontal", "vertical", "aligned"].includes(k)) throw new ToolError(`orientation is horizontal, vertical or aligned.`);
      const drives = optStr(a, "drives");
      if (drives && !ws.construction.plan!.values.some((v) => v.name === drives)) throw new ToolError(`drives "${drives}" is not a plan value.`);
      const d: DimensionDef = {
        id,
        kind: k,
        from,
        to,
        offset: a.offset !== undefined ? scalar(a.offset, "offset", def, scope) : "DIM",
        // Spacing matters here ("V.C. " + 3400), so the text is taken as written.
        prefix: typeof a.prefix === "string" && a.prefix ? a.prefix : undefined,
        suffix: typeof a.suffix === "string" && a.suffix ? a.suffix : undefined,
        hideValue: a.hide_value === true ? true : undefined,
        drives,
        layer,
      };
      next = { ...def, dimensions: replaceIn(def.dimensions, d) };
      const value = k === "horizontal" ? dx : k === "vertical" ? dy : Math.hypot(dx, dy);
      said = `dimension ${id} ${k} measuring ${fmt(value)}${d.prefix ? ` (reads "${d.prefix}${fmt(value)}${d.suffix ?? ""}")` : ""}${d.hideValue ? ", number hidden" : ""}`;
      break;
    }
    case "level": {
      id = annotationId(def, a, "LV");
      const at = point(a.at, "at", def, scope);
      const side = optStr(a, "side") === "left" ? "left" : "right";
      const l: LevelDef = {
        id,
        at,
        label: (optStr(a, "label") ?? "").toUpperCase(),
        side,
        style: optStr(a, "style") === "marker" ? "marker" : "gad",
        format: optStr(a, "format"),
        symbol: optStr(a, "symbol") as LevelDef["symbol"],
        layer,
      };
      next = { ...def, levels: replaceIn(def.levels, l) };
      said = `level ${id} "${l.label}" at RL ${(num(at[1], scope) / 1000).toFixed(3)} (read from its height)`;
      break;
    }
    case "leader": {
      id = annotationId(def, a, "LD");
      const pts = Array.isArray(a.points) && a.points.length >= 2 ? points(a.points, "points", def, scope) : [point(a.at, "at", def, scope), point(a.to, "to", def, scope)];
      const l: LeaderDef = {
        id,
        points: pts,
        // A leader may carry no text: a line from a boxed note to what it names.
        text: typeof a.text === "string" ? lineBreaks(a.text) : "",
        height,
        placement: optStr(a, "placement") === "end" ? "end" : "above",
        arrow: (optStr(a, "arrow") as LeaderDef["arrow"]) ?? "arrow",
        layer,
      };
      next = { ...def, leaders: replaceIn(def.leaders, l) };
      said = `leader ${id}${l.text ? ` "${l.text}"` : " (line only)"} from ${showPt(pts[0], scope)}`;
      break;
    }
    case "text": {
      id = annotationId(def, a, "T");
      const along = Array.isArray(a.along) && a.along.length === 2 ? ([point(a.along[0], "along 1", def, scope), point(a.along[1], "along 2", def, scope)] as [XY, XY]) : undefined;
      const t: TextDef = {
        id,
        at: point(a.at, "at", def, scope),
        text: lineBreaks(str(a, "text")),
        height,
        align: (optStr(a, "align") as TextDef["align"]) ?? "left",
        valign: optStr(a, "valign") as TextDef["valign"],
        bold: a.bold === true ? true : undefined,
        rotate: a.rotation !== undefined ? scalar(a.rotation, "rotation", def, scope) : undefined,
        along,
        layer,
      };
      next = { ...def, texts: replaceIn(def.texts, t) };
      said = `text ${id} "${t.text.replace(/\n/g, " / ")}" at ${showPt(t.at, scope)}`;
      break;
    }
    case "hatch": {
      id = annotationId(def, a, "H");
      let boundary = optStr(a, "boundary");
      if (!boundary) {
        const at = point(a.at, "at (a point inside the region)", def, scope);
        boundary = smallestLoopAround(def, scope, num(at[0], scope), num(at[1], scope)) ?? undefined;
        if (!boundary) throw new ToolError("No constructed closed loop around that point. Construct the region as a loop (draw:false if it should not be outlined) and pass boundary.");
      }
      const b = primitive(def, boundary);
      if (b.kind !== "loop") throw new ToolError(`${boundary} is not a closed loop.`);
      const holes = Array.isArray(a.holes) ? (a.holes as unknown[]).map(String) : [];
      for (const h of holes) if (primitive(def, h).kind !== "loop") throw new ToolError(`${h} is not a closed loop.`);
      const material = (optStr(a, "material") ?? "concrete") as HatchMaterial;
      if (!MATERIALS.includes(material)) throw new ToolError(`material is one of ${MATERIALS.join(", ")}.`);
      const h: HatchDef = {
        id,
        boundary,
        holes: holes.length ? holes : undefined,
        material,
        angle: a.angle !== undefined ? scalar(a.angle, "angle", def, scope) : undefined,
        scale: a.scale !== undefined ? scalar(a.scale, "scale", def, scope) : undefined,
      };
      next = { ...def, hatches: replaceIn(def.hatches, h) };
      said = `hatch ${id} ${material} in ${boundary}${holes.length ? ` less ${holes.join(", ")}` : ""}`;
      break;
    }
    default:
      throw new ToolError(`kind "${kind}" — in the construction route annotate takes dimension, level, leader, text or hatch (note, north, flow, kilometrage and section go on the sheet as before).`);
  }
  const ev = commit(ws, next, { ids: [id], feature });
  const d = (currentDefinition(ws)?.dimensions ?? []).find((x) => x.id === id);
  if (d?.drives) said += `; it drives ${d.drives} (edit it to change ${d.drives})`;
  return [`Added ${said}.`, ...warnings(ev)].join("\n");
}

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

type Measured = { kind: "point"; x: number; y: number } | { kind: "edge"; a: { x: number; y: number }; b: { x: number; y: number } } | { kind: "entity"; p: ComponentPrimitive } | { kind: "value"; v: number };

function measureRef(v: unknown, def: ComponentDefinition, scope: Scope): Measured {
  if (Array.isArray(v)) {
    const p = point(v, "point", def, scope);
    return { kind: "point", x: num(p[0], scope), y: num(p[1], scope) };
  }
  const s = exprText(v, "reference");
  const edge = s.match(/^([A-Za-z][A-Za-z0-9_]*)\.e(\d+)$/);
  if (edge) {
    const p = primitive(def, edge[1]);
    if (p.kind === "circle") throw new ToolError(`${edge[1]} is a circle.`);
    const k = Number(edge[2]);
    const n = p.kind === "loop" ? p.points.length : p.points.length - 1;
    if (k < 1 || k > n) throw new ToolError(`${edge[1]} has edges e1 to e${n}.`);
    const q1 = p.points[k - 1];
    const q2 = p.points[k % p.points.length];
    return { kind: "edge", a: { x: num(q1[0], scope), y: num(q1[1], scope) }, b: { x: num(q2[0], scope), y: num(q2[1], scope) } };
  }
  if (POINT_REF.test(s) || splitPair(s)) {
    const p = point(s, "point", def, scope);
    return { kind: "point", x: num(p[0], scope), y: num(p[1], scope) };
  }
  if ((def.primitives ?? []).some((p) => p.id === s)) return { kind: "entity", p: primitive(def, s) };
  const d = (def.dimensions ?? []).find((x) => x.id === s);
  if (d) {
    const dx = Math.abs(num(d.to[0], scope) - num(d.from[0], scope));
    const dy = Math.abs(num(d.to[1], scope) - num(d.from[1], scope));
    return { kind: "value", v: d.kind === "horizontal" ? dx : d.kind === "vertical" ? dy : Math.hypot(dx, dy) };
  }
  return { kind: "value", v: num(scalar(s, "expression", def, scope), scope) };
}

export function measure(ws: DraftingWorkspace, a: Args): string {
  const { def, scope } = requireConstruction(ws);
  const A = measureRef(a.a, def, scope);
  const B = a.b !== undefined ? measureRef(a.b, def, scope) : null;
  const P = (m: Measured) => (m.kind === "point" ? m : null);
  const ptsOf = (p: ComponentPrimitive) => (p.kind === "circle" ? [] : p.points.map((q) => ({ x: num(q[0], scope), y: num(q[1], scope) })));
  if (A.kind === "value" && !B) return `= ${fmt3(A.v)}`;
  if (A.kind === "point" && !B) return `(${fmt(A.x)}, ${fmt(A.y)}) — as a level, RL ${(A.y / 1000).toFixed(3)}`;
  if (A.kind === "edge" && !B) {
    const dx = A.b.x - A.a.x;
    const dy = A.b.y - A.a.y;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const slope = Math.abs(dy) > 1e-9 && Math.abs(dx) > 1e-9 ? `, slope ${fmt3(Math.abs(dx / dy))}H : 1V` : "";
    return `length ${fmt(Math.hypot(dx, dy))}; dx ${fmt(dx)}, dy ${fmt(dy)}; direction ${fmt3(ang)}°${slope}`;
  }
  if (A.kind === "entity" && !B) {
    const p = A.p;
    if (p.kind === "circle") {
      const r = num(p.r, scope);
      return `circle r ${fmt(r)}, diameter ${fmt(2 * r)}, area ${fmt3((Math.PI * r * r) / 1e6)} m²`;
    }
    const pts = ptsOf(p);
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    let perim = 0;
    const n = p.kind === "loop" ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) perim += Math.hypot(pts[(i + 1) % pts.length].x - pts[i].x, pts[(i + 1) % pts.length].y - pts[i].y);
    const area = p.kind === "loop" ? Math.abs(Sy.areaOf(pts)) : 0;
    return `${p.id}: bbox x ${fmt(Math.min(...xs))}…${fmt(Math.max(...xs))} (${fmt(Math.max(...xs) - Math.min(...xs))}), y ${fmt(Math.min(...ys))}…${fmt(Math.max(...ys))} (${fmt(Math.max(...ys) - Math.min(...ys))}); ${p.kind === "loop" ? `perimeter ${fmt(perim)}, area ${fmt3(area / 1e6)} m²` : `length ${fmt(perim)}`}`;
  }
  if (B) {
    const pa = P(A);
    const pb = P(B);
    if (pa && pb) return `distance ${fmt(Math.hypot(pb.x - pa.x, pb.y - pa.y))}; dx ${fmt(pb.x - pa.x)}, dy ${fmt(pb.y - pa.y)}`;
    const onEdge = (q: { x: number; y: number }, e: Extract<Measured, { kind: "edge" }>) => {
      const dx = e.b.x - e.a.x;
      const dy = e.b.y - e.a.y;
      const L = Math.hypot(dx, dy);
      return ((q.x - e.a.x) * -dy + (q.y - e.a.y) * dx) / L;
    };
    if (pa && B.kind === "edge") return `perpendicular distance from the point to the edge's line ${fmt(Math.abs(onEdge(pa, B)))}`;
    if (pb && A.kind === "edge") return `perpendicular distance from the point to the edge's line ${fmt(Math.abs(onEdge(pb, A)))}`;
    if (A.kind === "edge" && B.kind === "edge") {
      const a1 = Math.atan2(A.b.y - A.a.y, A.b.x - A.a.x);
      const a2 = Math.atan2(B.b.y - B.a.y, B.b.x - B.a.x);
      let d = (((a2 - a1) * 180) / Math.PI) % 180;
      if (d < 0) d += 180;
      const parallel = Math.min(d, 180 - d) < (ws.policy.angle_rad * 180) / Math.PI;
      return `angle between ${fmt3(d)}° (${fmt3(180 - d)}°)${parallel ? `; parallel, ${fmt(Math.abs(onEdge(B.a, A)))} apart` : ""}`;
    }
    if (A.kind === "value" && B.kind === "value") return `a = ${fmt3(A.v)}, b = ${fmt3(B.v)}, a − b = ${fmt3(A.v - B.v)}`;
  }
  throw new ToolError("Measure: a point, an edge (Id.e2), an entity, a dimension id or an expression; with b, a second point or edge.");
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

function measuredDims(ev: ComponentEvaluation): { path: string; value: number; text: string }[] {
  return ev.dimensions
    .filter((d) => d.kind === "horizontal" || d.kind === "vertical" || d.kind === "aligned")
    .map((d) => {
      const dx = Math.abs(d.to.x - d.from.x);
      const dy = Math.abs(d.to.y - d.from.y);
      const value = d.kind === "horizontal" ? dx : d.kind === "vertical" ? dy : Math.hypot(dx, dy);
      return { path: d.path, value, text: `${d.prefix ?? ""}${Math.round(value)}${d.suffix ?? ""}` };
    });
}

export interface VerifyReport {
  ok: boolean;
  text: string;
  problems: string[];
}

export function verifyConstruction(ws: DraftingWorkspace): VerifyReport {
  const plan = ws.construction.plan;
  const problems: string[] = [];
  const notes: string[] = [];
  const out: string[] = [];
  if (!plan) return { ok: false, text: "No plan — nothing to verify against.", problems: ["no plan"] };
  if (plan.route !== "construction") return { ok: true, text: "Sketch route: use check and flex_test.", problems: [] };
  const def = currentDefinition(ws);
  if (!def) return { ok: false, text: "Nothing constructed yet.", problems: ["nothing constructed"] };
  let scope: Scope;
  try {
    scope = planScope(ws);
  } catch (e) {
    return { ok: false, text: (e as Error).message, problems: [(e as Error).message] };
  }
  const tol = ws.policy.geometry_mm;

  // 1. The plan's own cross-checks.
  let passed = 0;
  for (const c of plan.checks) {
    try {
      const got = evalExpr(c.expr, scope);
      if (Math.abs(got - c.expect) <= checkTolerance(ws, c.unit)) passed++;
      else problems.push(`Check "${c.label}": ${c.expr} = ${fmt3(got)}, the reference says ${fmt3(c.expect)}.`);
    } catch (e) {
      problems.push(`Check "${c.label}": ${(e as Error).message}.`);
    }
  }
  out.push(`Plan checks: ${passed}/${plan.checks.length} agree with the reference.`);

  // 2. The engine's geometry checks.
  const ev = evaluateCandidate(ws, def);
  const errs = ev.issues.filter((i) => i.severity === "error");
  for (const e of errs) problems.push(`Geometry: ${e.path ? e.path + ": " : ""}${e.message}`);
  for (const w of ev.issues.filter((i) => i.severity === "warning").slice(0, 6)) notes.push(`Geometry warning: ${w.message}`);
  out.push(`Geometry: ${ev.loops.length} outlines, ${ev.circles.length} circles; ${errs.length ? `${errs.length} error(s)` : "no collapsed, crossed or inverted outline"}.`);

  // 3. Every planned feature is drawn; nothing drawn is untagged.
  const tagged = new Map<string, number>();
  for (const f of Object.values(ws.construction.tags)) tagged.set(f, (tagged.get(f) ?? 0) + 1);
  const empty = plan.features.filter((f) => !tagged.get(f.name));
  for (const f of empty) problems.push(`Feature "${f.name}" (${f.description}) has nothing constructed.`);
  const ids = [...allIds(def)];
  const untagged = ids.filter((id) => !ws.construction.tags[id]);
  if (untagged.length) notes.push(`Not tagged with a feature: ${untagged.slice(0, 12).join(", ")}${untagged.length > 12 ? "…" : ""}.`);
  out.push(`Features: ${plan.features.length - empty.length}/${plan.features.length} constructed.`);

  // Every value read must drive something, or Run Mode offers a number that changes nothing.
  const dead = deadValues(plan, def);
  if (dead.length) {
    problems.push(
      `Values that drive nothing: ${dead.join(", ")}. Changing one in Run Mode would change nothing. Build from them — a written level that follows from other values becomes an expression (e.g. SoffitY = FloorY + ClearHeight) and the written RL becomes a check — or remove them.`
    );
  }

  // 4. The reference's numbers, measured back from the geometry.
  const dims = measuredDims(ev);
  const pool = dims.map((d) => ({ ...d, used: false }));
  const missingDims: number[] = [];
  for (const want of plan.expect.dimensions) {
    const hit = pool.find((d) => !d.used && Math.abs(d.value - want) <= tol);
    if (hit) hit.used = true;
    else missingDims.push(want);
  }
  if (missingDims.length) {
    const close = missingDims.map((m) => {
      const near = pool.filter((d) => !d.used).sort((p, q) => Math.abs(p.value - m) - Math.abs(q.value - m))[0];
      return near && Math.abs(near.value - m) < Math.max(50, m * 0.1) ? `${m} (closest drawn dimension measures ${fmt(near.value)})` : `${m}`;
    });
    problems.push(`Reference dimensions not found on your drawing: ${close.join(", ")}.`);
  }
  const extra = pool.filter((d) => !d.used);
  if (extra.length && plan.expect.dimensions.length) notes.push(`Dimensions you drew that the reference does not list: ${extra.slice(0, 10).map((d) => d.text).join(", ")}.`);
  out.push(`Dimensions: ${plan.expect.dimensions.length - missingDims.length}/${plan.expect.dimensions.length} of the reference's are measured by your geometry.`);

  const lv = ev.levels.map((l) => ({ label: norm(l.label), rl: l.at.y / 1000 + ws.cad.settings.datumRL, used: false }));
  let levelsOk = 0;
  for (const want of plan.expect.levels) {
    const words = norm(want.label).split(" ").filter((w) => w.length > 1 && !["PROP", "LEVEL", "OF", "THE", "M"].includes(w));
    const byLabel = lv.filter((l) => !l.used && (words.length === 0 || words.every((w) => l.label.split(" ").includes(w))));
    const hit = byLabel.find((l) => Math.abs(l.rl - want.rl) <= tol / 1000);
    if (hit) {
      hit.used = true;
      levelsOk++;
    } else if (byLabel.length) problems.push(`Level "${want.label}" is at RL ${byLabel.map((l) => l.rl.toFixed(3)).join(" / ")} on your drawing; the reference says ${want.rl.toFixed(3)}.`);
    else problems.push(`Level "${want.label}" (${want.rl.toFixed(3)}) is not called out on your drawing.`);
  }
  out.push(`Levels: ${levelsOk}/${plan.expect.levels.length} called out at the reference's RL.`);

  const written = [
    ...ev.texts.map((t) => t.text),
    ...ev.leaders.map((l) => l.text),
    ...ev.levels.map((l) => l.label),
    ...ev.dimensions.map((d) => `${d.prefix ?? ""} ${d.suffix ?? ""}`),
    ...ws.cad.project.notes,
  ].map(norm);
  const all = written.join(" | ");
  const missingTexts = plan.expect.texts.filter((t) => {
    const n = norm(t);
    return n && !written.some((w) => w.includes(n)) && !all.includes(n);
  });
  if (missingTexts.length) problems.push(`Texts on the reference missing from yours: ${missingTexts.map((t) => `"${t}"`).join(", ")}.`);
  out.push(`Texts: ${plan.expect.texts.length - missingTexts.length}/${plan.expect.texts.length} present.`);

  // 5. Drafting hygiene.
  const zero = dims.filter((d) => d.value <= tol);
  if (zero.length) problems.push(`Dimensions measuring nothing: ${zero.map((d) => d.path).join(", ")}.`);
  const seen = new Map<string, string>();
  for (const l of ev.loops) {
    const key = l.points.map((p) => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`).sort().join(";");
    const dup = seen.get(key);
    if (dup && l.draw) notes.push(`${l.path} lies exactly on ${dup} (drawn twice).`);
    else seen.set(key, l.path);
  }
  const txt = scope.TXT ?? 250;
  const edges: [number, number, number, number][] = [];
  for (const l of ev.loops) {
    if (!l.draw) continue;
    const n = l.closed ? l.points.length : l.points.length - 1;
    for (let i = 0; i < n; i++) edges.push([l.points[i].x, l.points[i].y, l.points[(i + 1) % l.points.length].x, l.points[(i + 1) % l.points.length].y]);
  }
  const distToEdges = (x: number, y: number) => {
    let best = Infinity;
    for (const [x1, y1, x2, y2] of edges) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2)) : 0;
      best = Math.min(best, Math.hypot(x1 + t * dx - x, y1 + t * dy - y));
    }
    for (const c of ev.circles) best = Math.min(best, Math.abs(Math.hypot(x - c.center.x, y - c.center.y) - c.r));
    return best;
  };
  const loose = ev.leaders.filter((l) => l.arrow !== "none" && distToEdges(l.points[0].x, l.points[0].y) > 2 * txt);
  if (loose.length) notes.push(`Leaders pointing at nothing: ${loose.map((l) => `${l.path} "${l.text.slice(0, 30)}"`).join("; ")}.`);
  // Text a person cannot read, seen with the drawing, is not a drawing.
  const e = extentOf(ev);
  if (e) {
    const s = ws.cad.settings;
    const smallest = Math.min(s.textHeight, s.dimTextHeight ?? s.textHeight) * s.annotationScale;
    const side = Math.max(e.w, e.h);
    if (smallest < side * ILLEGIBLE_TEXT_FRACTION) {
      problems.push(
        `Text and dimensions are ${fmt(smallest)} mm high on a ${fmt(side)} mm drawing — too small to read. ${plan.scale ? `Scale 1:${plan.scale} does not suit a drawing this size: leave plan.scale out unless the reference writes one (it is then sized to be read, 1:${readableAnnotationScale(e.w, e.h, Math.min(s.textHeight, s.dimTextHeight ?? s.textHeight))}).` : "Raise the text height."}`
      );
    }
  }
  const overlaps = textOverlaps(ws);
  if (overlaps.length) notes.push(`Texts overlapping each other (hard to read): ${overlaps.slice(0, 8).join("; ")}.`);

  // A number that follows from others must be a formula, not a second copy.
  const dup = duplicatedNumbers(plan, tol);
  if (dup.levels.length) {
    problems.push(
      `Typed numbers that follow exactly from other typed values: ${dup.levels.join("; ")}. Write each as a formula of the values it follows from (keep the written number as a check), so changing one of them moves it.`
    );
  }

  // Every value must regenerate the drawing cleanly when it changes.
  const regen = regenerationTest(ws, def, plan);
  for (const r of regen.broken) problems.push(r);
  if (regen.moved.length) out.push(`Regeneration: every typed value changed ±5% regenerates ${regen.broken.length ? "except as listed" : "cleanly"}; ${regen.moved.join(", ")}.`);

  const frozen = frozenNumbers(def, plan);
  if (frozen.length) notes.push(`Texts that repeat a value as a fixed number (they will not follow an edit): ${frozen.slice(0, 8).join("; ")}. Write the value's placeholder instead — {Name} in mm, {Name:m} in metres.`);

  for (const d of plan.expect.disputed) notes.push(`Disputed on the reference, not drawn: ${d.what} — ${d.reason}. Report it in finish.`);

  const ok = problems.length === 0;
  ws.construction = { ...ws.construction, verified: { revision: ws.revision, ok } };
  const text = [
    `VERIFY: ${ok ? "PASS" : `FAIL — ${problems.length} problem(s)`}`,
    ...out.map((l) => "  " + l),
    ...(problems.length ? ["Problems (fix each at its cause — the value, the relation or the entity; never by hiding it):", ...problems.map((p) => "  * " + p)] : []),
    ...(notes.length ? ["Notes:", ...notes.map((n) => "  - " + n)] : []),
    ok ? "Now compare with the reference (compare_reference, or view) before finish." : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { ok, text, problems };
}

/** Typed plan values that no entity, annotation or used formula reads. */
export function deadValues(plan: ConstructionPlan, def: ComponentDefinition): string[] {
  const used = new Set<string>();
  const read = (e: Expr | undefined) => {
    if (e !== undefined) for (const d of exprDependencies(e)) used.add(d);
  };
  const readXY = (p: XY | undefined) => p && (read(p[0]), read(p[1]));
  for (const p of def.primitives ?? []) {
    if (p.kind === "circle") {
      readXY(p.center);
      read(p.r);
    } else p.points.forEach(readXY);
  }
  for (const d of def.dimensions ?? []) (readXY(d.from), readXY(d.to), read(d.offset));
  for (const l of def.levels ?? []) readXY(l.at);
  for (const l of def.leaders ?? []) l.points.forEach(readXY);
  for (const t of def.texts ?? []) (readXY(t.at), read(t.rotate), t.along?.forEach(readXY));
  for (const h of def.hatches ?? []) (read(h.angle), read(h.scale));
  const byName = new Map(plan.values.map((v) => [v.name, v]));
  const queue = [...used];
  while (queue.length) {
    const v = byName.get(queue.pop()!);
    if (!v) continue;
    for (const d of exprDependencies(v.expr)) if (!used.has(d)) (used.add(d), queue.push(d));
  }
  return plan.values.filter((v) => /^-?\d+(\.\d+)?$/.test(v.expr.trim()) && !used.has(v.name)).map((v) => v.name);
}

/**
 * Typed values that are sums or differences of other typed values, exactly.
 * A level that equals another level ± sizes (a slab top = soffit + slab) is a
 * relation the drawing depends on, and must be a formula. (Sizes that happen
 * to add up — 350 = 500 − 150 — are too often coincidence to call.)
 */
export function duplicatedNumbers(plan: ConstructionPlan, tol: number): { levels: string[] } {
  const typed = plan.values.filter((v) => /^-?\d+(\.\d+)?$/.test(v.expr.trim()) && (v.unit === "mm" || v.unit === "m"));
  const mm = (v: PlanValue) => Number(v.expr) * (v.unit === "m" ? 1000 : 1);
  const term = (v: PlanValue, sign: number) => `${sign < 0 ? "- " : "+ "}${v.name}${v.unit === "m" ? "" : " / 1000"}`;
  const levels: string[] = [];
  const n = typed.length;
  for (let k = 0; k < n; k++) {
    const K = typed[k];
    const target = mm(K);
    let found = false;
    for (let i = 0; i < n && !found; i++) {
      if (i === k) continue;
      for (let j = 0; j < n && !found; j++) {
        if (j === k || j === i) continue;
        for (const sj of [1, -1]) {
          const two = mm(typed[i]) + sj * mm(typed[j]);
          if (Math.abs(two - target) <= tol) {
            const involvesLevel = K.unit === "m" && typed[i].unit === "m" && typed[j].unit === "mm";
            const text = `${K.name} = ${typed[i].name} ${term(typed[j], sj)}`;
            if (involvesLevel) levels.push(text);
            found = involvesLevel;
            if (found) break;
          }
          if (K.unit !== "m" || typed[i].unit !== "m" || typed[j].unit !== "mm") continue;
          for (let l = j + 1; l < n && !found; l++) {
            if (l === k || l === i || typed[l].unit !== "mm") continue;
            for (const sl of [1, -1]) {
              if (Math.abs(two + sl * mm(typed[l]) - target) <= tol) {
                levels.push(`${K.name} = ${typed[i].name} ${term(typed[j], sj)} ${term(typed[l], sl)}`);
                found = true;
                break;
              }
            }
          }
        }
      }
    }
  }
  return { levels };
}

/**
 * Changes every typed value a little each way and regenerates the whole
 * construction, as Run Mode would: an edit that collapses, crosses or turns an
 * outline inside out, or breaks a constraint, is a construction whose
 * relations are wrong. Also says how much of the drawing each value moves.
 */
export function regenerationTest(ws: DraftingWorkspace, def: ComponentDefinition, plan: ConstructionPlan): { broken: string[]; moved: string[] } {
  const typed = plan.values.filter((v) => /^-?\d+(\.\d+)?$/.test(v.expr.trim()));
  const base = evaluateCandidate(ws, def);
  const baseErrors = new Set(base.issues.filter((i) => i.severity === "error").map((i) => i.message));
  const pos = new Map(base.loops.map((l) => [l.path, l.points]));
  const broken: string[] = [];
  const moved: string[] = [];
  for (const v of typed) {
    const value = Number(v.expr);
    const step = v.unit === "m" ? 0.1 : v.unit === "deg" ? 1 : v.unit === "-" ? Math.max(Math.abs(value) * 0.05, 0.05) : Math.max(1, Math.round(Math.abs(value) * 0.05));
    let count = 0;
    for (const sign of [1, -1]) {
      // As Run Mode does it: a typed value against the definition's defaults.
      const ev = evaluateCandidate(ws, def, { [v.name]: value + sign * step });
      const errs = ev.issues.filter((i) => i.severity === "error" && !baseErrors.has(i.message));
      if (errs.length) broken.push(`Changing ${v.name} to ${fmt3(value + sign * step)} breaks the drawing: ${errs.slice(0, 2).map((e) => `${e.path ? e.path + ": " : ""}${e.message}`).join(" ")} Its relations are wrong somewhere (a position typed instead of derived, or a relation to the wrong face).`);
      if (sign === 1) {
        count = ev.loops.filter((l) => {
          const before = pos.get(l.path);
          return before && l.points.some((p, i) => !before[i] || Math.hypot(p.x - before[i].x, p.y - before[i].y) > ws.policy.geometry_mm);
        }).length;
      }
    }
    moved.push(`${v.name} moves ${count}`);
  }
  return { broken, moved };
}

/**
 * Numbers written into texts and callouts that equal exactly one typed value
 * (in mm, or in metres to three decimals): "HAUNCH 200 X 200" while Haunch is
 * 200. Written as {Haunch} they follow an edit; as digits they go stale.
 */
export function frozenNumbers(def: ComponentDefinition, plan: ConstructionPlan): string[] {
  const typed = plan.values.filter((v) => /^-?\d+(\.\d+)?$/.test(v.expr.trim()) && (v.unit === "mm" || v.unit === "m"));
  const out: string[] = [];
  const texts = [...(def.texts ?? []).map((t) => ({ id: t.id, text: t.text })), ...(def.leaders ?? []).map((l) => ({ id: l.id, text: l.text }))];
  for (const t of texts) {
    const bare = t.text.replace(/\{[^}]*\}/g, " ");
    for (const m of bare.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)) {
      const n = Number(m[1]);
      const asMm = typed.filter((v) => v.unit === "mm" && Number(v.expr) === n);
      const asM = /\.\d{3}$/.test(m[1]) ? typed.filter((v) => (v.unit === "m" ? Number(v.expr) === n : Number(v.expr) / 1000 === n)) : [];
      const hits = [...new Set([...asMm, ...asM])];
      if (hits.length === 1) out.push(`${t.id} "${m[1]}" is ${hits[0].name} → {${hits[0].name}${asM.includes(hits[0]) && hits[0].unit === "mm" ? ":m" : ""}}`);
    }
  }
  return out;
}

/** Pairs of the construction's texts whose boxes overlap on the sheet. */
function textOverlaps(ws: DraftingWorkspace): string[] {
  const inst = ws.construction.instanceId;
  if (!inst) return [];
  const ctx = { shapes: indexShapes(ws.allShapes()), settings: ws.cad.settings };
  const boxes: { id: string; text: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const ann of ws.cad.annotations) {
    if (ann.componentInstanceId !== inst) continue;
    for (const p of annotationPrims(ann, ctx)) {
      if (p.k !== "text" || Math.abs(p.rotation) > 1) continue;
      const lines = p.text.split("\n").length;
      const w = textWidth(p.text, p.height);
      const h = p.height * (1 + (lines - 1) * 1.3);
      const x0 = p.align === "center" ? p.x - w / 2 : p.align === "right" ? p.x - w : p.x;
      const y0 = p.baseline === "top" ? p.y : p.baseline === "middle" ? p.y - h / 2 : p.y - h;
      boxes.push({ id: ann.id.split(":").pop() ?? ann.id, text: p.text.split("\n")[0].slice(0, 24), x0, y0, x1: x0 + w, y1: y0 + h });
    }
  }
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.id === b.id) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 0 && oy > 0 && ox * oy > 0.25 * Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0))) out.push(`"${a.text}" and "${b.text}"`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------

export function describeConstruction(ws: DraftingWorkspace, detail: string): string {
  const plan = ws.construction.plan;
  if (!plan) return "No plan yet.";
  const def = currentDefinition(ws);
  const lines: string[] = [];
  let scope: Scope = {};
  try {
    scope = planScope(ws);
  } catch (e) {
    lines.push(`Plan does not evaluate: ${(e as Error).message}`);
  }
  lines.push(`Plan (${plan.route}): ${plan.values.length} values, ${plan.checks.length} checks, features: ${plan.features.map((f) => f.name).join(", ")}.`);
  if (detail === "all" || detail.includes("values")) {
    lines.push("Values: " + plan.values.map((v) => `${v.name}=${fmt3(scope[v.name] ?? NaN)}${/^-?\d+(\.\d+)?$/.test(v.expr) ? "" : ` (= ${v.expr})`}`).join(", "));
  }
  if (!def) return lines.join("\n");
  const byFeature = new Map<string, string[]>();
  const all = (def.primitives ?? []).map((p) => ({ id: p.id, text: describeEntity(p, scope, detail === "all") }));
  const anns: { id: string; text: string }[] = [
    ...(def.dimensions ?? []).map((d) => ({ id: d.id, text: `${d.id} dimension ${d.kind} ${showPt(d.from, scope)} → ${showPt(d.to, scope)}${d.prefix ? ` prefix "${d.prefix}"` : ""}` })),
    ...(def.levels ?? []).map((l) => ({ id: l.id, text: `${l.id} level "${l.label}" RL ${(num(l.at[1], scope) / 1000).toFixed(3)} at ${showPt(l.at, scope)}` })),
    ...(def.leaders ?? []).map((l) => ({ id: l.id, text: `${l.id} leader "${l.text}" tip ${showPt(l.points[0], scope)}` })),
    ...(def.texts ?? []).map((t) => ({ id: t.id, text: `${t.id} text "${t.text.replace(/\n/g, " / ")}" at ${showPt(t.at, scope)}` })),
    ...(def.hatches ?? []).map((h) => ({ id: h.id, text: `${h.id} hatch ${typeof h.material === "string" ? h.material : "per row"} in ${h.boundary}` })),
  ];
  for (const x of [...all, ...anns]) {
    const f = ws.construction.tags[x.id] ?? "(no feature)";
    byFeature.set(f, [...(byFeature.get(f) ?? []), x.text]);
  }
  lines.push(`Constructed: ${all.length} entities, ${anns.length} annotations (component ${ws.construction.instanceId ?? "not placed yet"}, built by you).`);
  for (const [f, xs] of byFeature) {
    lines.push(`${f}:`);
    for (const x of xs.slice(0, 60)) lines.push(`  ${x}`);
    if (xs.length > 60) lines.push(`  … ${xs.length - 60} more`);
  }
  const v = ws.construction.verified;
  lines.push(v ? `Last verify: ${v.ok ? "PASS" : "FAIL"}${v.revision === ws.revision ? "" : " (the drawing changed since)"}.` : "Not verified yet.");
  return lines.join("\n");
}

/** A point argument evaluated to numbers (construction frame, mm). */
export function evalPointArg(ws: DraftingWorkspace, v: unknown, what: string): { x: number; y: number } {
  const def = currentDefinition(ws);
  const scope = planScope(ws);
  const p = point(v, what, def, scope);
  return { x: num(p[0], scope), y: num(p[1], scope) };
}

/**
 * Takes an agent's construction up again from the drawing itself — the plan
 * and the part tags travel in the definition (origin.construction), so a
 * drawing sent back from the editor can be edited by plan update, construct
 * and remove as if the session had never ended.
 */
export function constructionFromDrawing(cad: { definitions?: ComponentDefinition[]; components: { id: string; definitionId: string; values?: Record<string, number> }[] }): ConstructionState | null {
  for (let i = cad.components.length - 1; i >= 0; i--) {
    const inst = cad.components[i];
    const def = (cad.definitions ?? []).find((d) => d.id === inst.definitionId);
    const rec = def?.origin?.construction;
    if (!def || !rec?.plan) continue;
    const plan = rec.plan as ConstructionPlan;
    // The definition is the truth: a person may have typed values, unlinked or
    // rewritten formulas, or shifted entities since the plan was made.
    const notes = new Map(plan.values.map((v) => [v.name, v.note]));
    const order = new Map(plan.values.map((v, k) => [v.name, k]));
    const values: PlanValue[] = [
      ...def.parameters.map((p) => ({ name: p.name, expr: String(inst.values?.[p.name] ?? p.default), unit: p.unit as PlanUnit, note: notes.get(p.name) ?? p.label })),
      ...(def.formulas ?? []).map((f) => ({ name: f.name, expr: String(f.expr), unit: (f.unit === "m2" || !f.unit ? "mm" : f.unit) as PlanUnit, note: notes.get(f.name) ?? f.label })),
    ].sort((a, b) => (order.get(a.name) ?? 1e9) - (order.get(b.name) ?? 1e9));
    const present = new Set([...(def.primitives ?? []), ...(def.dimensions ?? []), ...(def.levels ?? []), ...(def.leaders ?? []), ...(def.texts ?? []), ...(def.hatches ?? [])].map((x) => x.id));
    const tags = Object.fromEntries(Object.entries(rec.tags ?? {}).filter(([id]) => present.has(id)));
    return { plan: { ...plan, values, constraints: plan.constraints ?? [] }, definitionId: def.id, instanceId: inst.id, tags, verified: null };
  }
  return null;
}
