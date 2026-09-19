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

/**
 * Where a typed value comes from. The agent drafts; it does not design:
 *   given     written on the reference or in the brief (the approved data)
 *   scaled    not written; measured off the reference image
 *   drafting  a drawing-layout choice (a view's position, how far a level line
 *             runs) — never a size of the structure
 *   required  needed but not provided: drawn with a placeholder and reported as
 *             a design input still to come — never silently invented
 */
export type ValueSource = "given" | "scaled" | "drafting" | "required";
export const VALUE_SOURCES: ValueSource[] = ["given", "scaled", "drafting", "required"];

export interface PlanValue {
  name: string;
  expr: string;
  unit: PlanUnit;
  note?: string;
  /** Typed values only (a derived value comes from its expression). */
  source?: ValueSource;
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
/**
 * The order a draftsman builds in. Datums (axes, centre lines, controlling
 * level lines) set out the drawing; the primary structure is built from them;
 * details (haunches, footings, wings, protection) and context (ground,
 * embankment, track) attach to the structure; annotation (dimensions, level
 * callouts, notes, hatching) describes the finished geometry and comes last.
 */
export type FeatureStage = "datum" | "primary" | "detail" | "context" | "annotation";
export const FEATURE_STAGES: FeatureStage[] = ["datum", "primary", "detail", "context", "annotation"];
const STAGE_RANK: Record<FeatureStage, number> = { datum: 0, primary: 1, detail: 2, context: 2, annotation: 3 };
export const stageOfFeature = (f: PlanFeature): FeatureStage => f.stage ?? "primary";

export interface PlanFeature {
  name: string;
  description: string;
  construction?: string;
  stage?: FeatureStage;
  /** Features this one is built from (they must exist first). */
  after?: string[];
  /** The view it belongs to. */
  view?: string;
}
/** One view of the drawing (plan, elevation, section, detail). All views share the plan's values. */
export interface PlanView {
  name: string;
  shows: string;
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
  /** What is being built: the kind of structure or object, in the draftsman's words. */
  structure?: string;
  analysis: string;
  frame: string;
  scale?: number;
  views?: PlanView[];
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
  /**
   * Result of the last check_geometry, with a fingerprint of the geometry it
   * checked: dimensions and annotation wait until it passes on the geometry
   * as it is now.
   */
  geometryChecked?: { fingerprint: string; ok: boolean } | null;
  /**
   * Numbers typed straight into the coordinates of structural entities (entity
   * id → the numbers): sizes with no name and no source. check_geometry
   * refuses them — a size is a plan value that says where it came from.
   */
  typedSizes?: Record<string, number[]>;
  /** What the plan was made from: the brief as written, and whether an image was attached. */
  inputs?: { brief?: string; hasReference: boolean };
}

export function emptyConstruction(): ConstructionState {
  return { plan: null, definitionId: null, instanceId: null, tags: {}, verified: null, typedSizes: {} };
}

const RESERVED = new Set(["DIM", "TXT", "SCALE", "PI", "pi", "e", "E"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
export const PRIMITIVE_LAYERS: LayerCategory[] = ["outline", "secondary", "hidden", "centre", "water", "ground", "level", "existing", "proposed", "construction", "leader", "text", "general"];

/** Layers that draw the structure itself — not its datums, levels, water, ground or construction lines. */
const STRUCTURAL_LAYERS = new Set<LayerCategory>(["outline", "hidden", "secondary", "existing", "proposed"]);

/**
 * Numbers written into expressions that are sizes: anything but small factors
 * (up to 10: "/ 2", "* 1.5") and the unit conversions 100 and 1000.
 */
export function typedNumbers(...values: unknown[]): number[] {
  const out = new Set<number>();
  const consider = (n: number) => {
    const a = Math.abs(n);
    if (Number.isFinite(a) && a > 10 && a !== 100 && a !== 1000) out.add(a);
  };
  const visit = (v: unknown) => {
    if (typeof v === "number") consider(v);
    else if (typeof v === "string") for (const m of v.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g)) consider(Number(m[0]));
    else if (Array.isArray(v)) v.forEach(visit);
  };
  values.forEach(visit);
  return [...out];
}

/** Remembers which structural entities were given unnamed sizes (and forgets fixed ones). */
function recordTypedSizes(ws: DraftingWorkspace, made: [ComponentPrimitive, number[]][]): void {
  const sizes = { ...(ws.construction.typedSizes ?? {}) };
  for (const [p, nums] of made) {
    const keep = STRUCTURAL_LAYERS.has(p.layer) ? [...new Set(nums)] : [];
    if (keep.length) sizes[p.id] = keep;
    else delete sizes[p.id];
  }
  ws.construction = { ...ws.construction, typedSizes: sizes };
}

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
    const source = optStr(o, "source")?.toLowerCase();
    if (source && !(VALUE_SOURCES as string[]).includes(source)) throw new ToolError(`${name}: source is one of ${VALUE_SOURCES.join(", ")}.`);
    return { name, expr, unit, note: optStr(o, "note"), source: source as ValueSource | undefined };
  });
}

export const isTyped = (v: PlanValue) => /^-?\d+(\.\d+)?$/.test(v.expr.trim());

/**
 * Numbers a brief writes, in the units a value may carry them in: "2000 mm",
 * "RL 100.000", "3 cells", "2.5 m" (also 2500 mm), "30°".
 */
export function briefNumbers(brief: string): number[] {
  const out: number[] = [];
  for (const m of brief.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n, n * 1000, n / 1000);
  }
  return out;
}

/**
 * The agent drafts; it does not design. Every typed value says where it comes
 * from, and the claim is checked where it can be: a value "given" by a text
 * brief must be a number the brief writes; "scaled" needs an image to scale
 * from. A size nobody gave is "required" — drawn with a placeholder and
 * reported, never presented as design data.
 */
function checkSources(ws: DraftingWorkspace, values: PlanValue[], opts: PlanOptions): void {
  const typed = values.filter(isTyped);
  const missing = typed.filter((v) => !v.source).map((v) => v.name);
  if (missing.length) {
    throw new ToolError(
      `Say where each value you typed comes from (source): ${missing.join(", ")}. given = written on the reference or in the brief; scaled = measured off the reference image; drafting = a layout choice (where a view or a title sits), never a size of the structure; required = needed but not provided — you draw it with a placeholder and it is reported as a design input still to come. Never invent a span, thickness, level, foundation or other design value.`
    );
  }
  if (!opts.hasReference) {
    const scaled = typed.filter((v) => v.source === "scaled").map((v) => v.name);
    if (scaled.length) throw new ToolError(`${scaled.join(", ")}: "scaled" means measured off a reference image, and none is attached. A value the brief does not give is "required".`);
    if (opts.brief) {
      const written = briefNumbers(opts.brief);
      const invented = typed.filter((v) => v.source === "given" && !written.some((n) => Math.abs(n - Number(v.expr)) <= checkTolerance(ws, v.unit)));
      if (invented.length) {
        throw new ToolError(
          `The brief does not write ${invented.map((v) => `${v.name} = ${v.expr}`).join(", ")}, so ${invented.length === 1 ? "it is" : "they are"} not "given". If the brief states it another way, write the relation (e.g. a width from spans and walls); if nobody gave it, mark it "required" (a placeholder, reported as a design input still to come).`
        );
      }
    }
  }
}

export interface PlanOptions {
  hasReference?: boolean;
  /** The task as the person wrote it: numbers a "given" value may be. */
  brief?: string;
}

function parseViews(raw: unknown): PlanView[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ToolError(`"views" must be a list of {name, shows}.`);
  return raw.map((r, i) => {
    const o = (typeof r === "string" ? { name: r } : (r ?? {})) as Args;
    const name = optStr(o, "name");
    if (!name) throw new ToolError(`View ${i + 1} has no name.`);
    return { name, shows: optStr(o, "shows") ?? optStr(o, "description") ?? "" };
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
    const stage = optStr(o, "stage")?.toLowerCase();
    if (stage && !(FEATURE_STAGES as string[]).includes(stage)) throw new ToolError(`Feature ${name}: stage is one of ${FEATURE_STAGES.join(", ")}.`);
    const after = Array.isArray(o.after) ? (o.after as unknown[]).map(String).filter(Boolean) : typeof o.after === "string" ? o.after.split(/[,\s]+/).filter(Boolean) : [];
    return { name, description: optStr(o, "description") ?? "", construction: optStr(o, "construction"), stage: stage as FeatureStage | undefined, after: after.length ? after : undefined, view: optStr(o, "view") };
  });
}

/** The construction sequence must make sense before anything is built from it. */
function checkSequence(features: PlanFeature[], views: PlanView[]): void {
  const unstaged = features.filter((f) => !f.stage).map((f) => f.name);
  if (unstaged.length) {
    throw new ToolError(
      `Give every feature its stage (${unstaged.join(", ")}): datum (axes, centre lines, the controlling level lines — the setting-out), primary (the main structure built from the datums), detail (haunches, footings, wings, protection — attached to the structure), context (ground, embankment, track, formation), annotation (dimensions, level callouts, notes, hatching — added last, from the finished geometry).`
    );
  }
  if (!features.some((f) => f.stage === "datum")) throw new ToolError("Set out first: plan at least one datum feature — the controlling axes and levels (centre line, structure axis, datum/level lines) every other part is built from.");
  if (!features.some((f) => f.stage === "primary")) throw new ToolError("Plan the primary structure (stage primary): the main body the details and annotation hang on.");
  const names = new Set(features.map((f) => f.name));
  for (const f of features) {
    const unknown = (f.after ?? []).filter((n) => !names.has(n));
    if (unknown.length) throw new ToolError(`Feature ${f.name} is built after ${unknown.join(", ")}, which the plan does not list.`);
    const later = (f.after ?? []).map((n) => features.find((g) => g.name === n)!).filter((g) => STAGE_RANK[stageOfFeature(g)] > STAGE_RANK[stageOfFeature(f)]);
    if (later.length) throw new ToolError(`Feature ${f.name} (${f.stage}) cannot be built after ${later.map((g) => `${g.name} (${g.stage})`).join(", ")}: a later stage cannot come first.`);
  }
  const viewNames = new Set(views.map((v) => v.name));
  for (const f of features) if (f.view && viewNames.size && !viewNames.has(f.view)) throw new ToolError(`Feature ${f.name} is in view "${f.view}", which the plan's views do not list (${[...viewNames].join(", ")}).`);
  for (const v of views) if (views.length > 1 && !features.some((f) => f.view === v.name)) throw new ToolError(`View "${v.name}" has no features — say which features belong to it (feature.view).`);
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
  const group = (v: PlanValue) =>
    v.source === "required" ? "Required inputs (placeholders)" : v.source === "drafting" ? "Drawing layout" : v.unit === "m" ? "Levels" : v.source === "scaled" ? "Scaled from the reference" : "Values given";
  const parameters: ComponentParameter[] = plan.values.filter(typed).map((v) => ({
    name: v.name,
    label: v.note,
    kind: kind(v.unit),
    unit: v.unit,
    default: Number(v.expr),
    group: group(v),
    description: v.source === "required" ? `Not provided — ${fmt3(Number(v.expr))} is a placeholder. Enter the approved value.${v.note ? ` (${v.note})` : ""}` : v.note,
    provenance: v.source,
    sourceRequired: v.source === "required" || v.source === "scaled" ? true : undefined,
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
    structure: optStr(a, "structure") ?? prev.structure,
    analysis: optStr(a, "analysis") ?? prev.analysis,
    views: a.views ?? prev.views,
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

export function recordPlan(ws: DraftingWorkspace, raw: Args, opts: PlanOptions = {}): string {
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
  const views = parseViews(a.views);
  const structure = optStr(a, "structure");
  if (route === "construction") {
    if (!structure) throw new ToolError("Say what you are building (structure): the kind of structure or object and what the drawing must show, as a draftsman would name it — e.g. 'single-cell RCC box culvert under a railway: cross section at the track centre line'.");
    if (!views.length) throw new ToolError("List the views the drawing needs (views: [{name, shows}]) — plan, elevation, section, detail. They share one set of values, so a change reaches every view.");
    if (!features.length) throw new ToolError("List the features you will construct (name, description, construction: which tools, from which values).");
    checkSequence(features, views);
    checkSources(ws, values, opts);
  }
  const scale = Number(a.scale);
  const plan: ConstructionPlan = {
    route,
    structure,
    analysis,
    frame: optStr(a, "frame") ?? "",
    scale: Number.isFinite(scale) && scale > 0 ? scale : undefined,
    views: views.length ? views : undefined,
    values,
    checks,
    constraints,
    features,
    expect: parseExpect(a.expect),
  };
  if (route === "construction" && (plan.expect.dimensions.length || plan.expect.levels.length || plan.expect.texts.length) && !features.some((f) => f.stage === "annotation")) {
    throw new ToolError("Plan the annotation too: at least one feature with stage annotation (dimensions, level callouts, notes, hatching) — it is added last, after check_geometry, and verify checks it is there.");
  }
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
  ws.construction = { ...ws.construction, plan, inputs: opts.brief !== undefined || opts.hasReference !== undefined ? { brief: opts.brief, hasReference: !!opts.hasReference } : ws.construction.inputs };
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
  const typed = values.filter(isTyped);
  const derived = values.filter((v) => !typed.includes(v));
  const show = (v: PlanValue) => `${v.name}=${fmt3(scope[v.name])}${unitText(v.unit)}`;
  const bySource = (s: ValueSource | undefined) => typed.filter((v) => (v.source ?? "given") === s);
  if (typed.length) out.push(`Given: ${bySource("given").map(show).join(", ") || "none"}`);
  if (bySource("scaled").length) out.push(`Scaled from the image (approximate — say so in finish): ${bySource("scaled").map(show).join(", ")}`);
  if (bySource("drafting").length) out.push(`Drafting layout choices: ${bySource("drafting").map(show).join(", ")}`);
  if (bySource("required").length) out.push(`REQUIRED INPUTS not provided — drawn with placeholders, reported as design data still to come: ${bySource("required").map(show).join(", ")}`);
  if (derived.length) out.push(`Worked out: ${derived.map((v) => `${v.name} = ${v.expr} = ${fmt3(scope[v.name])}${unitText(v.unit)}`).join("; ")}`);
  if (route === "construction") {
    out.push(`Construction sequence: ${[...features].sort((f, g) => STAGE_RANK[stageOfFeature(f)] - STAGE_RANK[stageOfFeature(g)]).map((f) => `${f.name} (${stageOfFeature(f)}${f.view ? `, ${f.view}` : ""})`).join(" → ")}.`);
  }
  if (checkLines.length) out.push(`Checks against numbers the reference also writes:\n${checkLines.join("\n")}`);
  if (failed.length) out.push(`${failed.length} check(s) FAIL: a value you read, or a relation you wrote, is wrong — or the reference contradicts itself. Find which before drawing; if the reference really is inconsistent, keep the check, and report it.`);
  const e = plan.expect;
  out.push(`Expected on the finished drawing: ${e.dimensions.length} dimensions, ${e.levels.length} levels, ${e.texts.length} texts. verify measures them back from your geometry.${e.disputed.length ? ` Disputed (not drawn, reported to the author): ${e.disputed.map((d) => d.what).join(", ")}.` : ""}`);
  if (!e.dimensions.length && !e.levels.length) out.push("You listed no expected dimensions or levels — list every number the reference writes in expect, or verify cannot compare your drawing with it.");
  out.push(
    route === "construction"
      ? `Next: set out the datum features, then build the primary structure from them, then details and context — coordinates as expressions of these values (the engine does the arithmetic). Then check_geometry; dimensions, level callouts, notes and hatching come only after it passes. Annotation spacing: DIM=${fmt3(scope.DIM)} mm (one dimension row), TXT=${fmt3(scope.TXT)} mm (text height) at 1:${ws.cad.settings.annotationScale}.`
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
  if (p.repeat) throw new ToolError(`${id} repeats (index ${p.repeat.index}); its points differ copy by copy. Write the position from your values instead (e.g. the first copy's expression with ${p.repeat.index} = 0).`);
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

/**
 * A repeated entity: `repeat: {count, index}` makes count copies, the index
 * (0 … count − 1) usable in its expressions — a row of cells, a line of piers.
 * The count is a value like any other, so changing it adds or removes copies
 * (topology, UPCE §23.4) while each copy keeps its relations.
 */
function repeatOf(o: Args, id: string, def: ComponentDefinition, scope: Scope): { spec: { count: Expr; index: string }; scope: Scope } | null {
  if (o.repeat === undefined || o.repeat === null) return null;
  const r = (typeof o.repeat === "object" ? o.repeat : { count: o.repeat }) as Args;
  const index = optStr(r, "index") ?? "i";
  if (!NAME.test(index) || index in scope) throw new ToolError(`${id}: repeat index "${index}" must be a new name (not a plan value).`);
  const count = scalar(r.count, `${id} repeat count`, def, scope);
  const n = num(count, scope);
  if (!(n >= 1)) throw new ToolError(`${id}: repeat count evaluates to ${fmt(n)}; it must be at least 1.`);
  return { spec: { count, index }, scope: { ...scope, [index]: 0 } };
}

/** A repeated entity's own scope: the first copy (index 0). */
const scopeFor = (p: ComponentPrimitive, scope: Scope): Scope => (p.repeat && p.repeat.index && !(p.repeat.index in scope) ? { ...scope, [p.repeat.index]: 0 } : scope);

function entityFrom(o: Args, def: ComponentDefinition, scope0: Scope): ComponentPrimitive {
  const id = optStr(o, "id");
  if (!id || !ID.test(id)) throw new ToolError(`Every entity needs an id (letters, digits, _): got ${JSON.stringify(o.id)}.`);
  const rep = repeatOf(o, id, def, scope0);
  const p = entityShape(o, id, def, rep?.scope ?? scope0);
  return rep ? { ...p, repeat: rep.spec } : p;
}

function entityShape(o: Args, id: string, def: ComponentDefinition, scope: Scope): ComponentPrimitive {
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

function describeEntity(p: ComponentPrimitive, planScope: Scope, full = true): string {
  const scope = scopeFor(p, planScope);
  const times = p.repeat?.count !== undefined ? ` × ${fmt(num(p.repeat.count, planScope))} (${p.repeat.index} = 0 … count − 1; the first shown)` : "";
  if (p.kind === "circle") return `${p.id} circle centre ${showPt(p.center, scope)} r ${fmt(num(p.r, scope))}${times}${p.layer !== "outline" ? ` [${p.layer}]` : ""}`;
  const pts = p.points.map((q) => showPt(q, scope));
  const shown = full || pts.length <= 12 ? pts.map((s, i) => `p${i + 1} ${s}`).join(" ") : `${pts.slice(0, 3).map((s, i) => `p${i + 1} ${s}`).join(" ")} … p${pts.length} ${pts[pts.length - 1]}`;
  return `${p.id} ${p.kind === "loop" ? "loop" : "path"}${times}${p.layer !== "outline" ? ` [${p.layer}]` : ""}${p.draw === false ? " (not drawn)" : ""}: ${shown}`;
}

function featureArg(ws: DraftingWorkspace, a: Args): string | undefined {
  const f = optStr(a, "feature");
  if (!f) return undefined;
  const names = ws.construction.plan?.features.map((x) => x.name) ?? [];
  if (!names.includes(f)) throw new ToolError(`"${f}" is not a planned feature. Planned: ${names.join(", ")}. Add it with plan (plan again with the extra feature) if the reference needs it.`);
  return f;
}

/** Features with something constructed or annotated in them. */
function builtFeatures(ws: DraftingWorkspace): Set<string> {
  return new Set(Object.values(ws.construction.tags));
}

/**
 * The draftsman's order, enforced: datums before the structure, the structure
 * before its details and context, a feature after the ones it is built from,
 * and annotation only through annotate. Rebuilding a feature that already has
 * entities (a correction) is always allowed.
 */
function stageGate(ws: DraftingWorkspace, feature: string | undefined, tool: string): void {
  const plan = ws.construction.plan;
  if (!plan) return;
  if (!feature) throw new ToolError(`Name the planned feature these belong to (feature). Planned: ${plan.features.map((f) => f.name).join(", ")}.`);
  const f = plan.features.find((x) => x.name === feature)!;
  const stage = stageOfFeature(f);
  if (stage === "annotation") throw new ToolError(`${f.name} is an annotation feature: dimensions, levels, notes and hatching are added with annotate, after check_geometry passes. ${tool} builds geometry.`);
  const built = builtFeatures(ws);
  if (built.has(f.name)) return;
  const rank = STAGE_RANK[stage];
  const earlier = plan.features.filter((g) => STAGE_RANK[stageOfFeature(g)] < rank && !built.has(g.name));
  if (earlier.length) {
    throw new ToolError(
      `Build in order: ${f.name} (${stage}) comes after ${earlier.map((g) => `${g.name} (${stageOfFeature(g)})`).join(", ")}. A draftsman sets out the axes and controlling levels first, builds the primary structure from them, then its details and context.`
    );
  }
  const waiting = (f.after ?? []).filter((n) => !built.has(n));
  if (waiting.length) throw new ToolError(`${f.name} is built from ${waiting.join(", ")} — construct ${waiting.length === 1 ? "it" : "them"} first.`);
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
  stageGate(ws, feature, "construct");
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
  recordTypedSizes(ws, made.map((p, i) => [p, typedNumbers(...["x", "y", "w", "h", "width", "height", "r", "radius", "center", "from", "to", "points"].map((k) => (raw[i] ?? {})[k]))]));
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

function mapPrimitive(p: ComponentPrimitive, f: (q: Sy.SP) => Sy.SP, planScope: Scope, id: string): ComponentPrimitive {
  const scope = scopeFor(p, planScope);
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
  stageGate(ws, feature ?? ws.construction.tags[targets[0]], "transform");
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
        const pts = p.points.map((q) => Sy.symPoint(q, scopeFor(p, scope)));
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
  {
    const inherited = targets.flatMap((t) => ws.construction.typedSizes?.[t] ?? []);
    const typed = typedNumbers(a.dx, a.dy, a.distance, a.angle, a.axis_x, a.axis_y, a.axis_from, a.axis_to, a.center);
    recordTypedSizes(ws, made.map((m) => [m, [...inherited, ...typed]]));
  }
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
  stageGate(ws, feature ?? ws.construction.tags[A[0]], "boolean");
  const loopsOf = (list: string[]) =>
    list.map((id) => {
      const p = primitive(def, id);
      if (p.kind !== "loop") throw new ToolError(`${id} is not a closed loop.`);
      if (p.repeat) throw new ToolError(`${id} repeats; a boolean needs single loops. Build the result from the values instead (or boolean one copy and repeat the result).`);
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
  recordTypedSizes(ws, made.map((m) => [m, [...A, ...B].flatMap((id) => ws.construction.typedSizes?.[id] ?? [])]));
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
  const sizes = { ...(ws.construction.typedSizes ?? {}) };
  for (const id of ids) delete sizes[id];
  ws.construction = { ...ws.construction, typedSizes: sizes };
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
    const pts = p.points.map((q) => ({ x: num(q[0], scopeFor(p, scope)), y: num(q[1], scopeFor(p, scope)) }));
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
  annotationGate(ws);
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
      // One dimension per copy of a repeated part (each cell's clear span): repeat, as construct does.
      const rep = repeatOf(a, id, def, scope);
      const s = rep?.scope ?? scope;
      const from = point(a.from, "from", def, s);
      const to = point(a.to, "to", def, s);
      const dx = Math.abs(num(to[0], s) - num(from[0], s));
      const dy = Math.abs(num(to[1], s) - num(from[1], s));
      const k = (optStr(a, "orientation") as DimensionDef["kind"] | undefined) ?? (a.aligned === true ? "aligned" : dx >= dy ? "horizontal" : "vertical");
      if (!["horizontal", "vertical", "aligned"].includes(k)) throw new ToolError(`orientation is horizontal, vertical or aligned.`);
      const drives = optStr(a, "drives");
      if (drives && !ws.construction.plan!.values.some((v) => v.name === drives)) throw new ToolError(`drives "${drives}" is not a plan value.`);
      const d: DimensionDef = {
        id,
        kind: k,
        from,
        to,
        offset: a.offset !== undefined ? scalar(a.offset, "offset", def, s) : "DIM",
        // Spacing matters here ("V.C. " + 3400), so the text is taken as written.
        prefix: typeof a.prefix === "string" && a.prefix ? a.prefix : undefined,
        suffix: typeof a.suffix === "string" && a.suffix ? a.suffix : undefined,
        hideValue: a.hide_value === true ? true : undefined,
        drives,
        layer,
        repeat: rep?.spec,
      };
      next = { ...def, dimensions: replaceIn(def.dimensions, d) };
      anchoredOnGeometry(ws, next, id, "dimension");
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
      anchoredOnGeometry(ws, next, id, "level");
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
  const ptsOf = (p: ComponentPrimitive) => (p.kind === "circle" ? [] : p.points.map((q) => ({ x: num(q[0], scopeFor(p, scope)), y: num(q[1], scopeFor(p, scope)) })));
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
      const r = num(p.r, scopeFor(p, scope));
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

// ---------------------------------------------------------------------------
// Geometry first: what the geometry itself contains, before any annotation
// ---------------------------------------------------------------------------

/** A fingerprint of the geometry (outlines, paths, circles — not annotation). */
export function geometryFingerprint(ev: ComponentEvaluation, tol: number): string {
  let h = 2166136261;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  const q = (v: number) => Math.round(v / tol);
  for (const l of ev.loops) {
    mix(`${l.path}|${l.draw ? 1 : 0}|`);
    for (const p of l.points) mix(`${q(p.x)},${q(p.y)};`);
  }
  for (const c of ev.circles) mix(`${c.path}|${q(c.center.x)},${q(c.center.y)},${q(c.r)};`);
  return `${ev.loops.length}.${ev.circles.length}.${(h >>> 0).toString(36)}`;
}

interface GeometryIndex {
  /** Distinct x and y coordinates of the geometry, sorted, with an entity at each. */
  xs: { v: number; id: string }[];
  ys: { v: number; id: string }[];
  edges: { a: { x: number; y: number }; b: { x: number; y: number }; id: string }[];
  loops: { id: string; points: { x: number; y: number }[] }[];
  circles: { id: string; center: { x: number; y: number }; r: number }[];
}

function geometryIndex(ev: ComponentEvaluation, tol: number): GeometryIndex {
  const xs = new Map<number, { v: number; id: string }>();
  const ys = new Map<number, { v: number; id: string }>();
  const add = (x: number, y: number, id: string) => {
    const kx = Math.round(x / tol);
    const ky = Math.round(y / tol);
    if (!xs.has(kx)) xs.set(kx, { v: x, id });
    if (!ys.has(ky)) ys.set(ky, { v: y, id });
  };
  const edges: GeometryIndex["edges"] = [];
  for (const l of ev.loops) {
    for (const p of l.points) add(p.x, p.y, l.primitiveId);
    const n = l.closed ? l.points.length : l.points.length - 1;
    for (let i = 0; i < n; i++) edges.push({ a: l.points[i], b: l.points[(i + 1) % l.points.length], id: l.primitiveId });
  }
  for (const c of ev.circles) {
    add(c.center.x, c.center.y, c.primitiveId);
    add(c.center.x - c.r, c.center.y - c.r, c.primitiveId);
    add(c.center.x + c.r, c.center.y + c.r, c.primitiveId);
  }
  const sorted = (m: Map<number, { v: number; id: string }>) => [...m.values()].sort((a, b) => a.v - b.v);
  return {
    xs: sorted(xs),
    ys: sorted(ys),
    edges,
    loops: ev.loops.map((l) => ({ id: l.primitiveId, points: l.points })),
    circles: ev.circles.map((c) => ({ id: c.primitiveId, center: c.center, r: c.r })),
  };
}

/** The coordinate in a sorted list nearest v. */
function nearestCoord(list: { v: number; id: string }[], v: number): { v: number; id: string } | null {
  let lo = 0;
  let hi = list.length - 1;
  if (hi < 0) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid].v < v) lo = mid;
    else hi = mid;
  }
  return Math.abs(list[lo].v - v) <= Math.abs(list[hi].v - v) ? list[lo] : list[hi];
}

const onCoord = (list: { v: number; id: string }[], v: number, tol: number) => {
  const n = nearestCoord(list, v);
  return !!n && Math.abs(n.v - v) <= tol;
};

function distanceToGeometry(g: GeometryIndex, p: { x: number; y: number }): number {
  let best = Infinity;
  for (const { a, b } of g.edges) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y));
  }
  for (const c of g.circles) best = Math.min(best, Math.abs(Math.hypot(p.x - c.center.x, p.y - c.center.y) - c.r), Math.hypot(p.x - c.center.x, p.y - c.center.y));
  return best;
}

/**
 * Edges grouped by direction; within a group, each edge's line as its offset
 * along the group's normal (sorted) — the distances between parallel faces.
 */
function parallelOffsets(g: GeometryIndex, tol: number): { v: number }[][] {
  const groups = new Map<number, { nx: number; ny: number; offs: number[] }>();
  // Direction resolution: an edge's end moves less than tol across a 100 m span.
  const step = tol / 100000;
  for (const { a, b } of g.edges) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L <= tol) continue;
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI - step / 2) ang -= Math.PI;
    const key = Math.round(ang / step);
    let grp = groups.get(key);
    if (!grp) groups.set(key, (grp = { nx: -Math.sin(ang), ny: Math.cos(ang), offs: [] }));
    grp.offs.push(grp.nx * a.x + grp.ny * a.y);
  }
  return [...groups.values()].filter((grp) => grp.offs.length > 1).map((grp) => grp.offs.sort((p, q) => p - q).map((v) => ({ v })));
}

/**
 * Whether the geometry contains a length: two of its x (or y) coordinates that
 * far apart, an edge that long, two points of one outline that far apart, or a
 * circle of that radius or diameter. A number the drawing writes must exist in
 * the geometry before any dimension can show it.
 */
function geometryHasLength(g: GeometryIndex, d: number, tol: number): boolean {
  const span = (list: { v: number }[]) => {
    let j = 0;
    for (let i = 0; i < list.length; i++) {
      while (j < list.length && list[j].v - list[i].v < d - tol) j++;
      if (j < list.length && Math.abs(list[j].v - list[i].v - d) <= tol) return true;
    }
    return false;
  };
  if (span(g.xs) || span(g.ys)) return true;
  // A thickness across a sloped or skewed member: two parallel faces that far apart.
  for (const offsets of parallelOffsets(g, tol)) if (span(offsets)) return true;
  for (const e of g.edges) if (Math.abs(Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) - d) <= tol) return true;
  for (const c of g.circles) if (Math.abs(c.r - d) <= tol || Math.abs(2 * c.r - d) <= tol) return true;
  for (const l of g.loops) {
    if (l.points.length > 80) continue;
    for (let i = 0; i < l.points.length; i++)
      for (let k = i + 1; k < l.points.length; k++) if (Math.abs(Math.hypot(l.points[k].x - l.points[i].x, l.points[k].y - l.points[i].y) - d) <= tol) return true;
  }
  return false;
}

/**
 * Dimensions and level callouts describe geometry: a dimension's ends sit on
 * the geometry's own points or faces, a level stands on a constructed line or
 * face. Anything else is a number typed next to the drawing, which is what a
 * draftsman never does.
 */
function anchoredOnGeometry(ws: DraftingWorkspace, next: ComponentDefinition, id: string, kind: "dimension" | "level"): void {
  const tol = ws.policy.geometry_mm;
  const ev = evaluateCandidate(ws, next);
  const g = geometryIndex(ev, tol);
  const mine = (path: string) => path === id || path.startsWith(`${id}[`);
  const near = (list: { v: number; id: string }[], v: number, axis: string) => {
    const n = nearestCoord(list, v);
    return n ? ` (nearest: ${axis} = ${fmt(n.v)} on ${n.id})` : " (nothing is constructed there)";
  };
  if (kind === "dimension") {
    for (const d of ev.dimensions.filter((x) => mine(x.path))) {
      const bad: string[] = [];
      for (const [end, p] of [["from", d.from], ["to", d.to]] as const) {
        if (d.kind === "horizontal" && !onCoord(g.xs, p.x, tol)) bad.push(`${end} x = ${fmt(p.x)} is not at any face or point of your geometry${near(g.xs, p.x, "x")}`);
        else if (d.kind === "vertical" && !onCoord(g.ys, p.y, tol)) bad.push(`${end} y = ${fmt(p.y)} is not at any face or point of your geometry${near(g.ys, p.y, "y")}`);
        else if (d.kind === "aligned" && distanceToGeometry(g, p) > tol) bad.push(`${end} (${fmt(p.x)}, ${fmt(p.y)}) is not on your geometry`);
      }
      if (bad.length) {
        throw new ToolError(
          `A dimension measures the geometry, so its ends are the geometry's own points: ${bad.join("; ")}. Dimension between points of what you constructed (Box.p3, Cell.p1, or the datum expressions those points use). If the size is not in the geometry yet, the geometry is missing it — construct it first.`
        );
      }
    }
  } else {
    for (const l of ev.levels.filter((x) => mine(x.path))) {
      if (!onCoord(g.ys, l.at.y, tol)) {
        throw new ToolError(
          `A level callout reads its RL from the height it stands on, so it stands on geometry: y = ${fmt(l.at.y)} (RL ${(l.at.y / 1000 + ws.cad.settings.datumRL).toFixed(3)}) is not on any constructed line or face${near(g.ys, l.at.y, "y")}. Construct the level line first (a datum feature), then call it out on it.`
        );
      }
    }
  }
}

/** Annotation waits for geometry that has passed check_geometry, as it is now. */
export function annotationGate(ws: DraftingWorkspace): void {
  const g = ws.construction.geometryChecked;
  if (!g) {
    throw new ToolError(
      "Geometry first. Dimensions, level callouts, notes and hatching describe finished geometry: set out the datums, build the structure, its details and context, then call check_geometry. Annotate once it passes."
    );
  }
  if (!g.ok) throw new ToolError("check_geometry found problems in the geometry. Fix them at their cause and run check_geometry again before annotating.");
  const ev = constructionEvaluation(ws);
  if (ev && geometryFingerprint(ev, ws.policy.geometry_mm) !== g.fingerprint) {
    throw new ToolError("The geometry changed since check_geometry passed. Run check_geometry again — annotation describes verified geometry.");
  }
}

/** The plan's cross-checks against the numbers the reference also writes. */
function runPlanChecks(ws: DraftingWorkspace, plan: ConstructionPlan, scope: Scope, problems: string[]): number {
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
  return passed;
}

/** The written numbers and levels, looked for in the geometry itself. */
function numbersInGeometry(ws: DraftingWorkspace, plan: ConstructionPlan, ev: ComponentEvaluation): { dims: number[]; levels: string[] } {
  const tol = ws.policy.geometry_mm;
  const g = geometryIndex(ev, tol);
  const dims = [...new Set(plan.expect.dimensions)].filter((d) => d > tol && !geometryHasLength(g, d, tol));
  const levels = plan.expect.levels.filter((l) => !onCoord(g.ys, (l.rl - ws.cad.settings.datumRL) * 1000, tol)).map((l) => `${l.label} ${l.rl.toFixed(3)}`);
  return { dims, levels };
}

/**
 * Sizes nobody named: numbers typed straight into structural coordinates, and
 * numbers inside the plan's formulas (a level = another + 0.762). Each is a
 * value with no source — the way an invented size gets into a drawing.
 */
function unnamedSizes(ws: DraftingWorkspace, plan: ConstructionPlan, def: ComponentDefinition): string[] {
  const present = new Set((def.primitives ?? []).filter((p) => STRUCTURAL_LAYERS.has(p.layer)).map((p) => p.id));
  const out: string[] = [];
  const inEntities = Object.entries(ws.construction.typedSizes ?? {}).filter(([id, n]) => present.has(id) && n.length);
  if (inEntities.length) out.push(`typed into ${inEntities.map(([id, n]) => `${id} (${n.join(", ")})`).join("; ")}`);
  const inFormulas = plan.values
    .filter((v) => !isTyped(v))
    .map((v) => ({ v, n: [...typedNumbers(v.expr), ...(v.unit === "m" ? [...v.expr.matchAll(/(?<![\w.])\d*\.\d+(?![\w.])/g)].map((m) => Number(m[0])) : [])] }))
    .filter((x) => x.n.length);
  if (inFormulas.length) out.push(`inside formulas: ${inFormulas.map(({ v, n }) => `${v.name} = ${v.expr} (${[...new Set(n)].join(", ")})`).join("; ")}`);
  return out;
}

/**
 * A drafting value places things (a view, a level line's end); it never sizes
 * the structure or changes a number the drawing states. Found by changing
 * each one and looking: an outline changing shape, a level line or level
 * callout moving up or down, a dimension measuring differently.
 */
function draftingThatSizes(ws: DraftingWorkspace, def: ComponentDefinition, plan: ConstructionPlan): string[] {
  const drafting = plan.values.filter((v) => isTyped(v) && v.source === "drafting");
  if (!drafting.length) return [];
  const tol = ws.policy.geometry_mm;
  const edges = (pts: { x: number; y: number }[]) => pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].y - p.y));
  const LEVEL_LAYERS = new Set<LayerCategory>(["level", "water", "ground"]);
  const snapshot = (ev: ComponentEvaluation) => ({
    shapes: new Map(ev.loops.filter((l) => STRUCTURAL_LAYERS.has(l.layer)).map((l) => [l.path, edges(l.points)])),
    radii: new Map(ev.circles.filter((c) => STRUCTURAL_LAYERS.has(c.layer)).map((c) => [c.path, c.r])),
    heights: new Map([...ev.loops.filter((l) => LEVEL_LAYERS.has(l.layer)).map((l) => [l.path, l.points[0].y] as const), ...ev.levels.map((l) => [l.path, l.at.y] as const)]),
    dims: new Map(measuredDims(ev).map((d) => [d.path, d.value])),
  });
  const base = snapshot(evaluateCandidate(ws, def));
  const out: string[] = [];
  for (const v of drafting) {
    const value = Number(v.expr);
    const now = snapshot(evaluateCandidate(ws, def, { [v.name]: value + Math.max(1, Math.round(Math.abs(value) * 0.05)) }));
    const hit: string[] = [];
    for (const [path, lens] of now.shapes) {
      const was = base.shapes.get(path);
      if (was && lens.some((L, i) => Math.abs(L - (was[i] ?? L)) > tol)) hit.push(`the shape of ${path}`);
    }
    for (const [path, r] of now.radii) if (Math.abs(r - (base.radii.get(path) ?? r)) > tol) hit.push(`the size of ${path}`);
    for (const [path, y] of now.heights) if (Math.abs(y - (base.heights.get(path) ?? y)) > tol) hit.push(`the level of ${path}`);
    for (const [path, d] of now.dims) if (Math.abs(d - (base.dims.get(path) ?? d)) > tol) hit.push(`dimension ${path}`);
    if (hit.length) out.push(`${v.name} (${hit.slice(0, 4).join(", ")}${hit.length > 4 ? "…" : ""})`);
  }
  return out;
}

/** Every size named and sourced; drafting values only placing things. */
function sourceProblems(ws: DraftingWorkspace, plan: ConstructionPlan, def: ComponentDefinition): string[] {
  const out: string[] = [];
  const unnamed = unnamedSizes(ws, plan, def);
  if (unnamed.length) {
    out.push(
      `Sizes with no name and no source — ${unnamed.join("; ")}. A size is a plan value that says where it comes from (given, scaled or required; drafting only places things): name it, and build from the name.`
    );
  }
  const sizing = draftingThatSizes(ws, def, plan);
  if (sizing.length) out.push(`Values marked drafting that size the structure or move a level: ${sizing.join("; ")}. A layout choice may place things, never size them — such a value is given, scaled or required.`);
  return out;
}

/** Numbers the drawing's notes state that nobody gave (brief only: no reference to have written them). */
function inventedInTexts(ws: DraftingWorkspace, plan: ConstructionPlan, ev: ComponentEvaluation, scope: Scope): string[] {
  const inputs = ws.construction.inputs;
  if (!inputs || inputs.hasReference || !inputs.brief) return [];
  const tol = ws.policy.geometry_mm;
  const known = [...briefNumbers(inputs.brief), ...plan.values.flatMap((v) => (Number.isFinite(scope[v.name]) ? [scope[v.name], scope[v.name] / 1000, scope[v.name] * 1000] : [])), ws.cad.settings.annotationScale];
  const out: string[] = [];
  for (const t of [...ev.texts.map((x) => ({ path: x.path, text: x.text })), ...ev.leaders.map((x) => ({ path: x.path, text: x.text })), ...ev.levels.map((x) => ({ path: x.path, text: x.label }))]) {
    const nums = [...t.text.matchAll(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)].map((m) => Number(m[0])).filter((n) => n > 2 && !known.some((k) => Math.abs(k - n) <= tol));
    if (nums.length) out.push(`${t.path} "${t.text.slice(0, 50)}" (${[...new Set(nums)].join(", ")})`);
  }
  return out;
}

/** Texts that write a required input's placeholder number as digits — read as design data. */
function placeholdersAsFact(def: ComponentDefinition, plan: ConstructionPlan): string[] {
  const required = plan.values.filter((v) => isTyped(v) && v.source === "required");
  if (!required.length) return [];
  const out: string[] = [];
  for (const t of [...(def.texts ?? []).map((x) => ({ id: x.id, text: x.text })), ...(def.leaders ?? []).map((x) => ({ id: x.id, text: x.text }))]) {
    const bare = t.text.replace(/\{[^}]*\}/g, " ");
    for (const m of bare.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g)) {
      const hit = required.find((v) => Number(v.expr) === Number(m[0]) || (v.unit === "mm" && Number(v.expr) / 1000 === Number(m[0])));
      if (hit) out.push(`${t.id} writes ${m[0]}, the placeholder for ${hit.name} → {${hit.name}}`);
    }
  }
  return out;
}

/**
 * The geometry stage's gate: before any dimension or callout, the geometry
 * alone must be right — the plan's checks hold, no outline collapses, crosses
 * or turns inside out, every geometry feature is built, every number and level
 * the reference writes exists in the geometry, each value regenerates it
 * cleanly, and no number is a copy of a relation.
 */
export function checkGeometry(ws: DraftingWorkspace): VerifyReport {
  const plan = ws.construction.plan;
  if (!plan) return { ok: false, text: "No plan — nothing to check against.", problems: ["no plan"] };
  if (plan.route !== "construction") return { ok: true, text: "Sketch route: use check and flex_test.", problems: [] };
  const def = currentDefinition(ws);
  if (!def || !(def.primitives ?? []).length) return { ok: false, text: "Nothing constructed yet.", problems: ["nothing constructed"] };
  let scope: Scope;
  try {
    scope = planScope(ws);
  } catch (e) {
    return { ok: false, text: (e as Error).message, problems: [(e as Error).message] };
  }
  const problems: string[] = [];
  const notes: string[] = [];
  const out: string[] = [];
  const tol = ws.policy.geometry_mm;

  const passed = runPlanChecks(ws, plan, scope, problems);
  out.push(`Plan checks: ${passed}/${plan.checks.length} agree.`);

  const ev = evaluateCandidate(ws, def);
  const errs = ev.issues.filter((i) => i.severity === "error");
  for (const e of errs) problems.push(`Geometry: ${e.path ? e.path + ": " : ""}${e.message}`);
  out.push(`Geometry: ${ev.loops.length} outlines/lines, ${ev.circles.length} circles; ${errs.length ? `${errs.length} error(s)` : "no collapsed, crossed or inverted outline"}.`);

  const built = builtFeatures(ws);
  const geometryFeatures = plan.features.filter((f) => stageOfFeature(f) !== "annotation");
  const missing = geometryFeatures.filter((f) => !built.has(f.name));
  for (const f of missing) problems.push(`Feature "${f.name}" (${stageOfFeature(f)}: ${f.description}) has nothing constructed.`);
  out.push(`Features: ${geometryFeatures.length - missing.length}/${geometryFeatures.length} geometry features built${plan.views && plan.views.length > 1 ? ` across ${plan.views.length} views` : ""}.`);

  const inGeo = numbersInGeometry(ws, plan, ev);
  if (inGeo.dims.length) problems.push(`Numbers the drawing writes that your geometry does not contain anywhere: ${inGeo.dims.join(", ")}. No two faces are that far apart — a part is missing, or a value or relation is wrong. A dimension can only show what the geometry has.`);
  if (inGeo.levels.length) problems.push(`Levels with no constructed line or face at their height: ${inGeo.levels.join("; ")}. Construct the level line (datum) or the face at that level.`);
  const expDims = new Set(plan.expect.dimensions).size;
  out.push(`Written numbers in the geometry: ${expDims - inGeo.dims.length}/${expDims} lengths, ${plan.expect.levels.length - inGeo.levels.length}/${plan.expect.levels.length} levels.`);

  const dup = duplicatedNumbers(plan, tol);
  if (dup.levels.length) problems.push(`Typed numbers that follow exactly from other typed values: ${dup.levels.join("; ")}. Write each as a formula of the values it follows from (keep the written number as a check).`);
  const regen = regenerationTest(ws, def, plan);
  for (const r of regen.broken) problems.push(r);
  if (regen.moved.length) out.push(`Regeneration: ${regen.broken.length ? "broken as listed" : "every typed value regenerates cleanly"}; ${regen.moved.join(", ")}.`);
  for (const p of sourceProblems(ws, plan, def)) problems.push(p);
  const dead = deadValues(plan, def);
  if (dead.length) notes.push(`Values no entity uses yet: ${dead.join(", ")} (fine if the annotation will use them; verify refuses them at the end).`);

  const required = plan.values.filter((v) => isTyped(v) && v.source === "required");
  if (required.length) notes.push(`Drawn with placeholders — design inputs still required: ${required.map((v) => `${v.name} = ${v.expr}${unitText(v.unit)}`).join(", ")}.`);

  const ok = problems.length === 0;
  ws.construction = { ...ws.construction, geometryChecked: { fingerprint: geometryFingerprint(ev, tol), ok } };
  const text = [
    `CHECK GEOMETRY: ${ok ? "PASS" : `FAIL — ${problems.length} problem(s)`}`,
    ...out.map((l) => "  " + l),
    ...(problems.length ? ["Problems (fix each at its cause — the value, the relation or the entity):", ...problems.map((p) => "  * " + p)] : []),
    ...(notes.length ? ["Notes:", ...notes.map((n) => "  - " + n)] : []),
    ok
      ? "The geometry is right. Now annotate from it, in order: dimensions of the controlling sizes (clear openings, thicknesses, overall sizes, then the rest), level callouts on their lines, callouts and notes, hatching, titles. Then verify."
      : "Annotation waits until this passes.",
  ].join("\n");
  return { ok, text, problems };
}

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

  for (const p of sourceProblems(ws, plan, def)) problems.push(p);
  const stated = placeholdersAsFact(def, plan);
  if (stated.length) problems.push(`Texts that state a placeholder as if it were design data: ${stated.join("; ")}. Write the value's placeholder — the drawing then marks it (TBC) until the approved value is entered.`);
  const invented = inventedInTexts(ws, plan, ev, scope);
  if (invented.length) problems.push(`Notes stating numbers the brief does not give and no value holds: ${invented.join("; ")}. Grades, mixes, sizes and standards come from the design — remove them, or add the value as required.`);
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
    read(p.repeat?.count);
  }
  for (const d of def.dimensions ?? []) (readXY(d.from), readXY(d.to), read(d.offset), read(d.repeat?.count));
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
    const step = v.unit === "m" ? 0.1 : v.unit === "deg" ? 1 : v.unit === "-" ? (Number.isInteger(value) && value >= 1 ? 1 : Math.max(Math.abs(value) * 0.05, 0.05)) : Math.max(1, Math.round(Math.abs(value) * 0.05));
    let count = 0;
    for (const sign of [1, -1]) {
      if (sign < 0 && v.unit === "-" && Number.isInteger(value) && value - step < 1) continue;
      // As Run Mode does it: a typed value against the definition's defaults.
      const ev = evaluateCandidate(ws, def, { [v.name]: value + sign * step });
      const errs = ev.issues.filter((i) => i.severity === "error" && !baseErrors.has(i.message));
      if (errs.length) broken.push(`Changing ${v.name} to ${fmt3(value + sign * step)} breaks the drawing: ${errs.slice(0, 2).map((e) => `${e.path ? e.path + ": " : ""}${e.message}`).join(" ")} Its relations are wrong somewhere (a position typed instead of derived, or a relation to the wrong face).`);
      if (sign === 1) {
        count = ev.loops.filter((l) => {
          const before = pos.get(l.path);
          return !before || l.points.some((p, i) => !before[i] || Math.hypot(p.x - before[i].x, p.y - before[i].y) > ws.policy.geometry_mm);
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
    const recorded = new Map(plan.values.map((v) => [v.name, v.source]));
    // A placeholder a person has since filled in is data they gave; a value a
    // person added (a shift, an unlinked formula) is theirs too.
    const sourceOf = (p: ComponentParameter): ValueSource => {
      const was = p.provenance ?? recorded.get(p.name);
      const typed = inst.values?.[p.name];
      if (was === "required" && typed !== undefined && typed !== p.default) return "given";
      return was ?? "given";
    };
    const values: PlanValue[] = [
      ...def.parameters.map((p) => ({ name: p.name, expr: String(inst.values?.[p.name] ?? p.default), unit: p.unit as PlanUnit, note: notes.get(p.name) ?? p.label, source: sourceOf(p) })),
      ...(def.formulas ?? []).map((f) => ({ name: f.name, expr: String(f.expr), unit: (f.unit === "m2" || !f.unit ? "mm" : f.unit) as PlanUnit, note: notes.get(f.name) ?? f.label })),
    ].sort((a, b) => (order.get(a.name) ?? 1e9) - (order.get(b.name) ?? 1e9));
    const present = new Set([...(def.primitives ?? []), ...(def.dimensions ?? []), ...(def.levels ?? []), ...(def.leaders ?? []), ...(def.texts ?? []), ...(def.hatches ?? [])].map((x) => x.id));
    const tags = Object.fromEntries(Object.entries(rec.tags ?? {}).filter(([id]) => present.has(id)));
    return { plan: { ...plan, values, constraints: plan.constraints ?? [] }, definitionId: def.id, instanceId: inst.id, tags, verified: null };
  }
  return null;
}
