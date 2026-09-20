/**
 * The component engine: definition + values → geometry, annotation, facts and
 * a list of problems.
 *
 * One pass, in dependency order:
 *   1. values — typed values, the definition's defaults and "auto" values
 *      (`defaultExpr`), the instance's own inputs and relationships, table
 *      rows, and the formulas; everything computed is ordered by what it reads
 *      (a cycle is an error, not a hang);
 *   2. invariants;
 *   3. children — each child's values are expressions in THIS scope, its frame
 *      is this frame composed with its placement or attachment (§23.2, §37);
 *   4. primitives, repeats expanded with index-stable ids (§23.4) — a repeat
 *      may walk a table's rows;
 *   5. generic geometric checks — collapsed loops, loops that turned inside out
 *      compared with the definition's defaults (the chirality guard of §31.2),
 *      self-crossing outlines, openings that left the solid they are cut from.
 *
 * Nothing here knows what a culvert is. Everything is in the root frame of the
 * component being evaluated, Y up, millimetres.
 */

import type { Point } from "@/lib/geometry/types";
import { pointInPolygon, signedArea } from "@/lib/cad/geometry";
import type { HatchMaterial, LayerCategory } from "@/lib/cad/types";
import {
  BUILTINS,
  ExprError,
  evalExpr,
  exprDependencies,
  interpolate,
  orderByDependencies,
  type Labels,
  type Scope,
  type Strings,
} from "./expr";
import { namesIn, parseEquation, solveNumeric } from "@/lib/geometry/symbolicAlgebra";
import type {
  ComponentDefinition,
  CustomValue,
  Expr,
  InvariantDef,
  Relationship,
  RepeatSpec,
  TableDef,
  TableRow,
  XY,
} from "./types";

export type ComponentRegistry = ReadonlyMap<string, ComponentDefinition>;

/** Local → root: p' = origin + R(θ) · (mirror ? (−x, y) : (x, y)). */
export interface Frame {
  ox: number;
  oy: number;
  cos: number;
  sin: number;
  mirror: boolean;
}

export const IDENTITY_FRAME: Frame = { ox: 0, oy: 0, cos: 1, sin: 0, mirror: false };

export function applyFrame(f: Frame, x: number, y: number): Point {
  const lx = f.mirror ? -x : x;
  return { x: f.ox + f.cos * lx - f.sin * y, y: f.oy + f.sin * lx + f.cos * y };
}

function applyFrameVector(f: Frame, x: number, y: number): Point {
  const lx = f.mirror ? -x : x;
  return { x: f.cos * lx - f.sin * y, y: f.sin * lx + f.cos * y };
}

function compose(parent: Frame, origin: Point, rotateDeg: number, mirror: boolean): Frame {
  const o = applyFrame(parent, origin.x, origin.y);
  // A mirrored parent reverses the sense of the child's rotation.
  const a = ((parent.mirror ? -rotateDeg : rotateDeg) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    ox: o.x,
    oy: o.y,
    cos: parent.cos * c - parent.sin * s,
    sin: parent.sin * c + parent.cos * s,
    mirror: parent.mirror !== mirror,
  };
}

/** Text never reads upside down: an angle folded into (−90°, 90°]. */
export function readingDegrees(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  if (a > 90) a -= 180;
  if (a <= -90) a += 180;
  return a;
}

export interface EvalLoop {
  /** Index-stable path, e.g. `cells[2]` or `pier[1]/shaft`. */
  path: string;
  primitiveId: string;
  role: string;
  layer: LayerCategory;
  label: string;
  points: Point[];
  closed: boolean;
  draw: boolean;
  /** The scope this instance was evaluated in (its repeat index included). */
  scope?: Scope;
}

export interface EvalCircle {
  path: string;
  primitiveId: string;
  role: string;
  layer: LayerCategory;
  label: string;
  center: Point;
  r: number;
  scope?: Scope;
}

export interface EvalDimension {
  path: string;
  kind: "horizontal" | "vertical" | "aligned" | "radius" | "diameter";
  from: Point;
  to: Point;
  /** The point the dimension line passes through (root frame). */
  line: Point;
  drives?: string;
  /** The instance scope `drives` belongs to ("" = the root component). */
  scopePath: string;
  /** Root-frame x axis of the owning component, to keep "horizontal" meaningful under rotation. */
  axis: Point;
  prefix?: string;
  suffix?: string;
  hideValue?: boolean;
  layer: LayerCategory;
}

export interface EvalLevel {
  path: string;
  at: Point;
  label: string;
  side: "left" | "right";
  style?: "marker" | "gad";
  format?: string;
  symbol?: "none" | "water" | "ground";
  layer: LayerCategory;
}

export interface EvalHatch {
  path: string;
  outer: Point[];
  holes: Point[][];
  material: HatchMaterial;
  angle?: number;
  scale?: number;
}

export interface EvalText {
  path: string;
  at: Point;
  text: string;
  height?: number;
  align: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  /** Degrees, counter-clockwise, in the root frame. */
  rotation: number;
  bold?: boolean;
  layer: LayerCategory;
}

export interface EvalLeader {
  path: string;
  points: Point[];
  text: string;
  height?: number;
  placement: "end" | "above";
  arrow: "arrow" | "dot" | "none";
  layer: LayerCategory;
}

export interface EvalFact {
  key: string;
  value: number;
  /** Which (sub)component reported it. */
  path: string;
  semanticType: string;
}

export interface ComponentIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** Sub-component path ("" for the root). */
  path: string;
  source?: string;
}

export interface ScopeReport {
  path: string;
  definitionId: string;
  name: string;
  scope: Scope;
}

/** How a root value got its number. */
export type ValueSource = "typed" | "default" | "auto" | "related" | "custom";

export interface ComponentEvaluation {
  definitionId: string;
  scope: Scope;
  loops: EvalLoop[];
  circles: EvalCircle[];
  anchors: Record<string, Point>;
  dimensions: EvalDimension[];
  levels: EvalLevel[];
  hatches: EvalHatch[];
  texts: EvalText[];
  leaders: EvalLeader[];
  facts: EvalFact[];
  issues: ComponentIssue[];
  /** Every (sub)component's evaluated scope, root first. */
  scopes: ScopeReport[];
  /** For each root value: typed, default, auto (follows its default expression), related or custom. */
  sources: Record<string, ValueSource>;
  /** The root's tables as evaluated (defaults and missing cells filled in). */
  tables: Record<string, TableRow[]>;
}

/** What an instance adds to its definition's defaults. */
export interface ComponentInputs {
  values: Record<string, number>;
  relations?: Relationship[];
  customValues?: CustomValue[];
  tables?: Record<string, TableRow[]>;
}

export interface EvaluateOptions {
  /** Skip the defaults comparison (used when evaluating the defaults themselves). */
  skipOrientationCheck?: boolean;
  /** Depth guard against definitions that include themselves. */
  depth?: number;
  /**
   * Values every expression can read, e.g. `DIM` (dimension-line spacing),
   * `TXT` (text height) and `SCALE` (the annotation scale) in model mm at the
   * drawing's annotation scale. Geometry must not read them; only annotation
   * placement does.
   */
  globals?: Scope;
  relations?: Relationship[];
  customValues?: CustomValue[];
  tables?: Record<string, TableRow[]>;
}

const MAX_REPEAT = 400;
const MAX_DEPTH = 12;

function issue(out: ComponentIssue[], severity: ComponentIssue["severity"], code: string, path: string, message: string, source?: string) {
  out.push({ severity, code, path, message, source });
}

function joinPath(base: string, part: string): string {
  return base ? `${base}/${part}` : part;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

interface ResolvedTable {
  def: TableDef;
  rows: TableRow[];
}

/** A definition's tables with the given rows (or the defaults), every cell filled. */
export function resolveTables(def: ComponentDefinition, given: Record<string, TableRow[]> = {}): Map<string, ResolvedTable> {
  const out = new Map<string, ResolvedTable>();
  for (const t of def.tables ?? []) {
    const src = given[t.name] ?? t.rows;
    const rows = src.map((r) => {
      const row: TableRow = {};
      for (const c of t.columns) {
        const v = r[c.name];
        if (c.kind === "text") row[c.name] = v === undefined ? String(c.default) : String(v);
        else {
          const n = typeof v === "number" ? v : Number(v);
          row[c.name] = Number.isFinite(n) ? n : Number(c.default);
        }
      }
      return row;
    });
    out.set(t.name, { def: t, rows });
  }
  return out;
}

/**
 * Required inputs nobody has entered yet (`provenance: "required"`, still at the
 * placeholder), and every value worked out from one. Wherever the drawing
 * states one — a text placeholder, a level or a dimension that depends on it —
 * it is marked "(TBC)", so a placeholder is never read as design data.
 */
function unresolvedInputs(def: ComponentDefinition, inputs: ComponentInputs, sources: Record<string, string>, scope: Scope): Set<string> {
  const out = new Set<string>();
  for (const p of def.parameters) {
    if (p.provenance !== "required") continue;
    if (sources[p.name] === "default" || (sources[p.name] === "typed" && scope[p.name] === p.default)) out.add(p.name);
  }
  if (!out.size) return out;
  const rules: [string, Expr][] = [
    ...(def.formulas ?? []).map((f) => [f.name, f.expr] as [string, Expr]),
    ...def.parameters.filter((p) => p.defaultExpr !== undefined && sources[p.name] === "auto").map((p) => [p.name, p.defaultExpr!] as [string, Expr]),
    ...(inputs.relations ?? []).map((r) => [r.name, r.expr] as [string, Expr]),
  ];
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, e] of rules) {
      if (!out.has(name) && exprDependencies(e).some((d) => out.has(d))) {
        out.add(name);
        grew = true;
      }
    }
  }
  return out;
}

/** Whether an expression reads a placeholder, directly or through what is worked out from one. */
const readsUnresolved = (tbc: Set<string>, ...es: (Expr | undefined)[]) => tbc.size > 0 && es.some((e) => e !== undefined && exprDependencies(e).some((d) => tbc.has(d)));

export const TBC_MARK = " (TBC)";

function markUnresolved(template: string, tbc: Set<string>): string {
  if (!tbc.size || !template.includes("{")) return template;
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(:[^}]*)?\}/g, (m, name: string) => (tbc.has(name) ? `${m}${TBC_MARK}` : m));
}

function labelsOf(def: ComponentDefinition): Labels {
  const labels: Labels = {};
  for (const p of def.parameters) if (p.options) labels[p.name] = p.options;
  for (const t of def.tables ?? []) for (const c of t.columns) if (c.options) labels[`${t.name}_${c.name}`] = c.options;
  return labels;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export interface BuiltScope {
  scope: Scope;
  sources: Record<string, ValueSource>;
  tables: Map<string, ResolvedTable>;
}

/** The names a solved value's relationship reads, for ordering it. */
function solveInputs(equation: string): string[] {
  try {
    const eq = parseEquation(equation);
    return [...namesIn(eq.lhs, namesIn(eq.rhs))];
  } catch {
    return [];
  }
}

/**
 * A definition's scope: typed values and defaults, the tables' counts and
 * sums, the instance's own inputs, then everything computed — auto values,
 * relationships and formulas — in dependency order.
 */
export function buildScopeFull(
  def: ComponentDefinition,
  inputs: ComponentInputs,
  issues: ComponentIssue[],
  path = "",
  globals: Scope = {}
): BuiltScope {
  const scope: Scope = { ...BUILTINS, ...globals };
  const sources: Record<string, ValueSource> = {};
  const values = inputs.values;
  const tables = resolveTables(def, inputs.tables);
  for (const [name, t] of tables) {
    scope[`${name}_count`] = t.rows.length;
    for (const c of t.def.columns) {
      if (c.kind !== "number") continue;
      scope[`${name}_sum_${c.name}`] = t.rows.reduce((s, r) => s + Number(r[c.name]), 0);
    }
    if (t.def.minRows !== undefined && t.rows.length < t.def.minRows) {
      issue(issues, "error", "table-rows", path, `${t.def.label ?? name} needs at least ${t.def.minRows} row(s).`);
    }
    if (t.def.maxRows !== undefined && t.rows.length > t.def.maxRows) {
      issue(issues, "error", "table-rows", path, `${t.def.label ?? name} can have at most ${t.def.maxRows} rows.`);
    }
  }

  const formulaNames = new Set((def.formulas ?? []).map((f) => f.name));
  const paramNames = new Set(def.parameters.map((p) => p.name));
  for (const c of inputs.customValues ?? []) {
    if (paramNames.has(c.name) || formulaNames.has(c.name)) {
      issue(issues, "error", "custom-conflict", path, `"${c.name}" is already a value of ${def.name}; give the new value another name.`);
      continue;
    }
    scope[c.name] = c.value;
    sources[c.name] = "custom";
  }

  const rel = new Map((inputs.relations ?? []).map((r) => [r.name, r]));
  type Computed = { name: string; expr: Expr; kind: "auto" | "related" | "relation" | "formula"; solve?: { equation: string; min: Expr; max: Expr } };
  const computed: Computed[] = [];
  const countParams = new Set<string>();
  for (const p of def.parameters) {
    if (p.kind === "count") countParams.add(p.name);
    const r = rel.get(p.name);
    const typed = values[p.name];
    if (r) {
      computed.push({ name: p.name, expr: r.expr, kind: "related" });
      sources[p.name] = "related";
    } else if (typed !== undefined && Number.isFinite(typed)) {
      scope[p.name] = typed;
      sources[p.name] = "typed";
    } else if (p.defaultExpr !== undefined) {
      computed.push({ name: p.name, expr: p.defaultExpr, kind: "auto" });
      sources[p.name] = "auto";
    } else {
      scope[p.name] = p.default;
      sources[p.name] = "default";
    }
    if (scope[p.name] !== undefined && p.kind === "count") {
      const v = scope[p.name];
      const rr = Math.round(v);
      if (rr !== v) issue(issues, "warning", "count-rounded", path, `${p.label ?? p.name} is a count; ${v} was taken as ${rr}.`);
      scope[p.name] = rr;
    }
  }
  // A drawing's own definition belongs to its author: a relationship may
  // rewrite one of its formulas. A library definition's formulas stay its own.
  const ownFormulas = def.origin?.kind === "drawn";
  const rewritten = new Set<string>();
  for (const r of rel.values()) {
    if (paramNames.has(r.name)) continue;
    if (formulaNames.has(r.name)) {
      if (ownFormulas) {
        rewritten.add(r.name);
        computed.push({ name: r.name, expr: r.expr, kind: "relation" });
        sources[r.name] = "related";
        continue;
      }
      issue(issues, "error", "relation-formula", path, `${r.name} is worked out by ${def.name} itself; relate one of its values instead, or give the new value another name.`);
      continue;
    }
    if (sources[r.name] === "custom") {
      issue(issues, "error", "relation-custom", path, `${r.name} is an input you added; a relationship cannot also set it.`);
      continue;
    }
    computed.push({ name: r.name, expr: r.expr, kind: "relation" });
  }
  for (const f of def.formulas ?? []) {
    if (rewritten.has(f.name)) continue;
    if (!f.solve) {
      computed.push({ name: f.name, expr: f.expr, kind: "formula" });
      continue;
    }
    // A solved value is ordered by what its relationship READS — itself
    // excluded, or it would look like a value that depends on itself.
    const reads = [...solveInputs(f.solve.equation), ...exprDependencies(f.solve.min), ...exprDependencies(f.solve.max)].filter((n) => n !== f.name);
    computed.push({ name: f.name, expr: reads.length ? reads.join(" + ") : "0", kind: "formula", solve: f.solve });
  }

  const { order, cyclic } = orderByDependencies(computed);
  const byName = new Map(computed.map((c) => [c.name, c]));
  for (const n of cyclic) {
    const c = byName.get(n)!;
    issue(
      issues,
      "error",
      c.kind === "formula" ? "formula-cycle" : "relation-cycle",
      path,
      c.kind === "formula" ? `Formula ${n} depends on itself through other formulas.` : `${n} = ${c.expr} goes round in a circle — it depends on itself through other values.`
    );
    scope[n] = NaN;
  }
  for (const n of order) {
    const c = byName.get(n)!;
    if (c.solve) {
      const r = solveNumeric(c.solve.equation, n, { scope, min: evalExpr(c.solve.min, scope), max: evalExpr(c.solve.max, scope) });
      if (r.ok) scope[n] = countParams.has(n) ? Math.round(r.value) : r.value;
      else {
        scope[n] = NaN;
        issue(issues, "error", "solve-failed", path, `${n} is worked out by solving ${c.solve.equation}, which has no answer here: ${r.reason}`);
      }
      continue;
    }
    try {
      let v = evalExpr(c.expr, scope);
      if (countParams.has(n)) v = Math.round(v);
      scope[n] = v;
    } catch (e) {
      scope[n] = NaN;
      if (c.kind === "formula") issue(issues, "error", "formula-error", path, `Formula ${n} could not be evaluated: ${(e as Error).message}.`);
      else issue(issues, "error", "relation-error", path, `${n} = ${c.expr}: ${(e as Error).message}.`);
    }
  }

  for (const p of def.parameters) {
    const v = scope[p.name];
    if (!Number.isFinite(v)) continue;
    if (p.min !== undefined && v < p.min) {
      issue(issues, "warning", "below-range", path, `${p.label ?? p.name} = ${fmt(v)} ${p.unit} is below the usual minimum ${fmt(p.min)} ${p.unit}.`);
    }
    if (p.max !== undefined && v > p.max) {
      issue(issues, "warning", "above-range", path, `${p.label ?? p.name} = ${fmt(v)} ${p.unit} is above the usual maximum ${fmt(p.max)} ${p.unit}.`);
    }
  }
  return { scope, sources, tables };
}

/** A definition's scope from plain values (defaults for everything else). */
export function buildScope(
  def: ComponentDefinition,
  values: Record<string, number>,
  issues: ComponentIssue[],
  path = "",
  globals: Scope = {}
): Scope {
  return buildScopeFull(def, { values }, issues, path, globals).scope;
}

function checkInvariant(inv: InvariantDef, scope: Scope): boolean {
  const a = evalExpr(inv.expr, scope);
  const b = evalExpr(inv.than, scope);
  switch (inv.op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
  }
}

interface Ctx {
  scope: Scope;
  strings: Strings;
}

/** Expands a repeat into the scopes it produces (a single unindexed scope when absent). */
function expand(
  repeat: RepeatSpec | undefined,
  ctx: Ctx,
  tables: Map<string, ResolvedTable>,
  issues: ComponentIssue[],
  path: string,
  what: string
): (Ctx & { suffix: string })[] {
  if (!repeat) return [{ ...ctx, suffix: "" }];
  if (repeat.table !== undefined) {
    const t = tables.get(repeat.table);
    if (!t) {
      issue(issues, "error", "repeat-table", path, `${what}: there is no table "${repeat.table}".`);
      return [];
    }
    const out: (Ctx & { suffix: string })[] = [];
    const before: Record<string, number> = {};
    t.rows.forEach((row, i) => {
      const scope: Scope = { ...ctx.scope, [repeat.index]: i };
      const strings: Strings = { ...ctx.strings };
      // A text cell may quote its own row: "{thickness}THK. GRANULAR FILLING".
      const own = (text: string) =>
        text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(?::(label))?\}/g, (m, col: string, fmt?: string) => {
          const c = t.def.columns.find((x) => x.name === col);
          if (!c || c.kind === "text") return m;
          const v = Number(row[col]);
          if (fmt === "label") return c.options?.find((o) => o.value === v)?.label ?? String(v);
          return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
        });
      for (const c of t.def.columns) {
        const key = `${t.def.name}_${c.name}`;
        if (c.kind === "text") {
          strings[key] = own(String(row[c.name]));
          continue;
        }
        const v = Number(row[c.name]);
        scope[key] = v;
        if (c.kind === "number") scope[`${t.def.name}_before_${c.name}`] = before[c.name] ?? 0;
      }
      for (const c of t.def.columns) if (c.kind === "number") before[c.name] = (before[c.name] ?? 0) + Number(row[c.name]);
      out.push({ scope, strings, suffix: `[${i}]` });
    });
    return out;
  }
  let n: number;
  try {
    n = Math.round(evalExpr(repeat.count, ctx.scope));
  } catch (e) {
    issue(issues, "error", "repeat-error", path, `${what}: repeat count could not be evaluated (${(e as Error).message}).`);
    return [];
  }
  if (!Number.isFinite(n) || n < 0) {
    issue(issues, "error", "repeat-negative", path, `${what}: repeat count is ${n}.`);
    return [];
  }
  if (n > MAX_REPEAT) {
    issue(issues, "error", "repeat-too-many", path, `${what}: ${n} copies is more than this drawing can hold (${MAX_REPEAT}).`);
    return [];
  }
  const out: (Ctx & { suffix: string })[] = [];
  for (let i = 0; i < n; i++) out.push({ scope: { ...ctx.scope, [repeat.index]: i }, strings: ctx.strings, suffix: `[${i}]` });
  return out;
}

function enabled(when: Expr | undefined, scope: Scope): boolean {
  if (when === undefined) return true;
  return evalExpr(when, scope) > 0;
}

function pt(xy: XY, scope: Scope, frame: Frame): Point {
  return applyFrame(frame, evalExpr(xy[0], scope), evalExpr(xy[1], scope));
}

/** Drops consecutive duplicates (within 1 µm) so zero-size features vanish cleanly. */
function dedupe(points: Point[], closed: boolean): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    out.push(p);
  }
  if (closed && out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) out.pop();
  }
  return out;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function selfCrosses(poly: Point[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** A circle as a 72-gon, for hatching and containment tests. */
function ring(c: Point, r: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

function emptyEvaluation(defId: string): ComponentEvaluation {
  return {
    definitionId: defId,
    scope: {},
    loops: [],
    circles: [],
    anchors: {},
    dimensions: [],
    levels: [],
    hatches: [],
    texts: [],
    leaders: [],
    facts: [],
    issues: [],
    scopes: [],
    sources: {},
    tables: {},
  };
}

/** A local angle (degrees, component frame) in the root frame. */
function frameAngle(frame: Frame, deg: number): number {
  const a = (deg * Math.PI) / 180;
  const v = applyFrameVector(frame, Math.cos(a), Math.sin(a));
  return (Math.atan2(v.y, v.x) * 180) / Math.PI;
}

/**
 * Evaluates `def` with `inputs` into the frame `frame`, appending into `out`.
 * `path` prefixes every id so nested and repeated children stay distinct.
 */
function evaluateInto(
  def: ComponentDefinition,
  inputs: ComponentInputs,
  registry: ComponentRegistry,
  frame: Frame,
  path: string,
  out: ComponentEvaluation,
  depth: number,
  globals: Scope
): Scope {
  if (depth > MAX_DEPTH) {
    issue(out.issues, "error", "nesting-too-deep", path, `${def.name} nests deeper than ${MAX_DEPTH} levels; check for a component that contains itself.`);
    return {};
  }
  const built = buildScopeFull(def, inputs, out.issues, path, globals);
  const scope = built.scope;
  const tables = built.tables;
  const labels = labelsOf(def);
  const root: Ctx = { scope, strings: {} };
  const tbc = unresolvedInputs(def, inputs, built.sources as Record<string, string>, scope);
  if (!path) {
    out.sources = built.sources;
    out.tables = Object.fromEntries([...tables].map(([k, t]) => [k, t.rows]));
  }
  out.scopes.push({ path, definitionId: def.id, name: def.name, scope });

  for (const inv of def.invariants ?? []) {
    try {
      if (!checkInvariant(inv, scope)) issue(out.issues, inv.severity, `invariant:${inv.id}`, path, interpolate(inv.message, scope, {}, labels), inv.source);
    } catch (e) {
      issue(out.issues, "error", `invariant:${inv.id}`, path, `${inv.message} (could not evaluate: ${(e as Error).message})`);
    }
  }

  const localAnchors: Record<string, Point> = {};
  const addAnchor = (name: string, p: Point) => {
    localAnchors[name] = p;
    out.anchors[path ? `${path}.${name}` : name] = p;
  };

  for (const a of def.anchors ?? []) {
    for (const { scope: s, suffix } of expand(a.repeat, root, tables, out.issues, path, `anchor ${a.id}`)) {
      try {
        addAnchor(a.id + suffix, pt(a.at, s, frame));
      } catch (e) {
        issue(out.issues, "error", "anchor-error", path, `Anchor ${a.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  // Children, siblings first when one attaches to another.
  const children = def.children ?? [];
  const childAnchors = new Map<string, Record<string, Point>>();
  const pending = [...children];
  const done = new Set<string>();
  let guard = children.length * children.length + 1;
  while (pending.length && guard-- > 0) {
    const child = pending.shift()!;
    if (child.attach && !done.has(child.attach.to) && children.some((c) => c.id === child.attach!.to)) {
      pending.push(child);
      continue;
    }
    done.add(child.id);
    const cdef = registry.get(child.component);
    if (!cdef) {
      issue(out.issues, "error", "missing-component", path, `Child ${child.id} refers to an unknown component "${child.component}".`);
      continue;
    }
    for (const { scope: s, suffix } of expand(child.repeat, root, tables, out.issues, path, `child ${child.id}`)) {
      try {
        if (!enabled(child.when, s)) continue;
      } catch (e) {
        issue(out.issues, "error", "when-error", path, `Child ${child.id}: ${(e as Error).message}.`);
        continue;
      }
      const cvalues: Record<string, number> = {};
      let failed = false;
      for (const [k, e] of Object.entries(child.values ?? {})) {
        try {
          cvalues[k] = evalExpr(e, s);
        } catch (err) {
          failed = true;
          issue(out.issues, "error", "child-value", path, `Child ${child.id}${suffix}.${k}: ${(err as Error).message}.`);
        }
      }
      if (failed) continue;
      const ctables: Record<string, TableRow[]> = {};
      for (const [k, from] of Object.entries(child.tables ?? {})) {
        const t = tables.get(from);
        if (t) ctables[k] = t.rows;
        else issue(out.issues, "error", "child-table", path, `Child ${child.id}: there is no table "${from}".`);
      }
      const cinputs: ComponentInputs = { values: cvalues, tables: ctables };
      const cpath = joinPath(path, child.id + suffix);
      let cframe: Frame;
      if (child.attach) {
        const target = (childAnchors.get(child.attach.to) ?? {})[child.attach.anchor];
        if (!target) {
          issue(out.issues, "error", "attach-missing", path, `Child ${child.id} attaches to ${child.attach.to}.${child.attach.anchor}, which does not exist.`);
          continue;
        }
        // Evaluate the child's own anchor in its local frame to find where its origin must go.
        const probe = emptyEvaluation(cdef.id);
        const cscope = buildScopeFull(cdef, cinputs, probe.issues, cpath, globals).scope;
        const selfDef = (cdef.anchors ?? []).find((a) => a.id === child.attach!.self);
        if (!selfDef) {
          issue(out.issues, "error", "attach-missing", path, `${cdef.name} has no anchor "${child.attach.self}".`);
          continue;
        }
        let off: Point = { x: 0, y: 0 };
        try {
          if (child.attach.offset) off = applyFrameVector(frame, evalExpr(child.attach.offset[0], s), evalExpr(child.attach.offset[1], s));
        } catch (err) {
          issue(out.issues, "error", "attach-offset", path, `Child ${child.id}: ${(err as Error).message}.`);
          continue;
        }
        const mirror = child.attach.mirror ?? false;
        const base: Frame = { ...frame, mirror: frame.mirror !== mirror, ox: 0, oy: 0 };
        const selfLocal = applyFrame(base, evalExpr(selfDef.at[0], cscope), evalExpr(selfDef.at[1], cscope));
        cframe = { ...base, ox: target.x + off.x - selfLocal.x, oy: target.y + off.y - selfLocal.y };
      } else {
        const place = child.place ?? { at: [0, 0] as XY };
        try {
          const origin = { x: evalExpr(place.at[0], s), y: evalExpr(place.at[1], s) };
          const rot = place.rotate !== undefined ? evalExpr(place.rotate, s) : 0;
          cframe = compose(frame, origin, rot, place.mirror ?? false);
        } catch (err) {
          issue(out.issues, "error", "place-error", path, `Child ${child.id}${suffix}: ${(err as Error).message}.`);
          continue;
        }
      }
      const before = Object.keys(out.anchors).length;
      evaluateInto(cdef, cinputs, registry, cframe, cpath, out, depth + 1, globals);
      // Collect the child's own anchors for its siblings to attach to.
      const mine: Record<string, Point> = {};
      const prefix = `${cpath}.`;
      for (const [k, v] of Object.entries(out.anchors).slice(before)) if (k.startsWith(prefix)) mine[k.slice(prefix.length)] = v;
      childAnchors.set(child.id + suffix, mine);
      if (!suffix) childAnchors.set(child.id, mine);
      else if (suffix === "[0]") childAnchors.set(child.id, mine);
    }
  }

  for (const prim of def.primitives ?? []) {
    for (const { scope: s, suffix } of expand(prim.repeat, root, tables, out.issues, path, `${prim.id}`)) {
      const ppath = joinPath(path, prim.id + suffix);
      try {
        if (!enabled(prim.when, s)) continue;
        const label = prim.label ? `${prim.label}${suffix}` : prim.id + suffix;
        if (prim.kind === "circle") {
          const r = evalExpr(prim.r, s);
          if (!(r > 0)) {
            issue(out.issues, "error", "circle-radius", ppath, `${label}: radius ${fmt(r)} mm is not positive.`);
            continue;
          }
          out.circles.push({ path: ppath, primitiveId: prim.id, role: prim.role, layer: prim.layer, label, center: pt(prim.center, s, frame), r, scope: s });
          continue;
        }
        const pts = dedupe(prim.points.map((xy) => pt(xy, s, frame)), prim.kind === "loop");
        if (prim.kind === "loop" && pts.length < 3) {
          issue(out.issues, "error", "loop-collapsed", ppath, `${label} has collapsed to ${pts.length} point(s) — a thickness or size has gone to zero.`);
          continue;
        }
        if (prim.kind === "path" && pts.length < 2) continue;
        if (prim.kind === "loop" && selfCrosses(pts)) {
          issue(out.issues, "error", "loop-self-crossing", ppath, `${label} crosses itself — a size is larger than the space it sits in.`);
        }
        out.loops.push({ path: ppath, primitiveId: prim.id, role: prim.role, layer: prim.layer, label, points: pts, closed: prim.kind === "loop", draw: prim.draw !== false, scope: s });
      } catch (e) {
        issue(out.issues, "error", e instanceof ExprError ? "expr-error" : "primitive-error", ppath, `${prim.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  const axis = applyFrameVector(frame, 1, 0);
  for (const d of def.dimensions ?? []) {
    for (const { scope: s, strings, suffix } of expand(d.repeat, root, tables, out.issues, path, `dimension ${d.id}`)) {
      try {
        if (!enabled(d.when, s)) continue;
        const fx = evalExpr(d.from[0], s);
        const fy = evalExpr(d.from[1], s);
        const tx = evalExpr(d.to[0], s);
        const ty = evalExpr(d.to[1], s);
        const off = evalExpr(d.offset, s);
        let lx: number;
        let ly: number;
        if (d.kind === "horizontal") {
          lx = (fx + tx) / 2;
          ly = off >= 0 ? Math.max(fy, ty) + off : Math.min(fy, ty) + off;
        } else if (d.kind === "vertical") {
          ly = (fy + ty) / 2;
          lx = off >= 0 ? Math.max(fx, tx) + off : Math.min(fx, tx) + off;
        } else {
          const dx = tx - fx;
          const dy = ty - fy;
          const l = Math.hypot(dx, dy) || 1;
          lx = (fx + tx) / 2 - (dy / l) * off;
          ly = (fy + ty) / 2 + (dx / l) * off;
        }
        out.dimensions.push({
          path: joinPath(path, d.id + suffix),
          kind: d.kind,
          from: applyFrame(frame, fx, fy),
          to: applyFrame(frame, tx, ty),
          line: applyFrame(frame, lx, ly),
          drives: d.drives,
          scopePath: path,
          axis,
          prefix: d.prefix !== undefined ? interpolate(markUnresolved(d.prefix, tbc), s, strings, labels) : undefined,
          suffix: (d.drives && tbc.has(d.drives)) || readsUnresolved(tbc, ...(d.kind === "horizontal" ? [d.from[0], d.to[0]] : d.kind === "vertical" ? [d.from[1], d.to[1]] : [...d.from, ...d.to])) ? `${d.suffix !== undefined ? interpolate(d.suffix, s, strings, labels) : ""}${TBC_MARK}` : d.suffix !== undefined ? interpolate(markUnresolved(d.suffix, tbc), s, strings, labels) : undefined,
          hideValue: d.hideValue,
          layer: d.layer ?? "dimension",
        });
      } catch (e) {
        issue(out.issues, "error", "dimension-error", path, `Dimension ${d.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  for (const l of def.levels ?? []) {
    for (const { scope: s, strings, suffix } of expand(l.repeat, root, tables, out.issues, path, `level ${l.id}`)) {
      try {
        if (!enabled(l.when, s)) continue;
        const side = l.side ?? "right";
        out.levels.push({
          path: joinPath(path, l.id + suffix),
          at: pt(l.at, s, frame),
          label: `${interpolate(markUnresolved(l.label, tbc), s, strings, labels)}${readsUnresolved(tbc, l.at[1]) && !l.label.includes("{") ? TBC_MARK : ""}`,
          side: frame.mirror ? (side === "left" ? "right" : "left") : side,
          style: l.style,
          format: l.format,
          symbol: l.symbol,
          layer: l.layer ?? "level",
        });
      } catch (e) {
        issue(out.issues, "error", "level-error", path, `Level ${l.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  for (const t of def.texts ?? []) {
    for (const { scope: s, strings, suffix } of expand(t.repeat, root, tables, out.issues, path, `text ${t.id}`)) {
      try {
        if (!enabled(t.when, s)) continue;
        let rotation = 0;
        if (t.along) {
          const a = pt(t.along[0], s, frame);
          const b = pt(t.along[1], s, frame);
          rotation = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        } else if (t.rotate !== undefined) {
          rotation = frameAngle(frame, evalExpr(t.rotate, s));
        } else if (frame.sin !== 0 || frame.cos !== 1) {
          rotation = frameAngle(frame, 0);
        }
        out.texts.push({
          path: joinPath(path, t.id + suffix),
          at: pt(t.at, s, frame),
          text: interpolate(markUnresolved(t.text, tbc), s, strings, labels),
          height: t.height,
          align: t.align ?? "center",
          valign: t.valign,
          rotation: readingDegrees(rotation),
          bold: t.bold,
          layer: t.layer ?? "text",
        });
      } catch (e) {
        issue(out.issues, "error", "text-error", path, `Text ${t.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  for (const l of def.leaders ?? []) {
    for (const { scope: s, strings, suffix } of expand(l.repeat, root, tables, out.issues, path, `leader ${l.id}`)) {
      try {
        if (!enabled(l.when, s)) continue;
        const pts = dedupe(l.points.map((xy) => pt(xy, s, frame)), false);
        if (pts.length < 2) continue;
        out.leaders.push({
          path: joinPath(path, l.id + suffix),
          points: pts,
          text: interpolate(markUnresolved(l.text, tbc), s, strings, labels),
          height: l.height,
          placement: l.placement ?? "end",
          arrow: l.arrow ?? "arrow",
          layer: l.layer ?? "leader",
        });
      } catch (e) {
        issue(out.issues, "error", "leader-error", path, `Leader ${l.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  // Hatches: every instance of the boundary loop, with the hole loops that lie inside it.
  const depthOf = (p: string) => (path ? path.split("/").length + 1 : 1) === p.split("/").length && p.startsWith(path ? path + "/" : "");
  const myLoops = (primId: string): { path: string; label: string; points: Point[]; scope?: Scope }[] => [
    ...out.loops.filter((l) => l.closed && l.primitiveId === primId && depthOf(l.path)),
    ...out.circles
      .filter((c) => c.primitiveId === primId && depthOf(c.path))
      .map((c) => ({ path: c.path, label: c.label, points: ring(c.center, c.r), scope: c.scope })),
  ];
  for (const h of def.hatches ?? []) {
    const outers = myLoops(h.boundary);
    const holeLoops = (h.holes ?? []).flatMap((id) => myLoops(id));
    for (const [oi, o] of outers.entries()) {
      const s = o.scope ?? scope;
      let material: HatchMaterial | null;
      let angle: number | undefined;
      let hscale: number | undefined;
      try {
        if (!enabled(h.when, s)) continue;
        if (typeof h.material === "string") material = h.material;
        else {
          const k = Math.round(evalExpr(h.material.pick, s));
          material = h.material.from[k] ?? null;
        }
        angle = h.angle !== undefined ? frameAngle(frame, evalExpr(h.angle, s)) : undefined;
        hscale = h.scale !== undefined ? evalExpr(h.scale, s) : undefined;
      } catch (e) {
        issue(out.issues, "error", "hatch-error", path, `Hatch ${h.id}: ${(e as Error).message}.`);
        continue;
      }
      if (!material) continue;
      const holes: Point[][] = [];
      for (const hl of holeLoops) {
        const inside = hl.points.every((p) => pointInPolygon(p, o.points));
        if (inside) holes.push(hl.points);
        else if (hl.points.some((p) => pointInPolygon(p, o.points))) {
          issue(out.issues, "error", "opening-outside", hl.path, `${hl.label} is no longer inside ${o.label} — the opening has broken through the ${o.label.toLowerCase()}.`);
        }
      }
      // One hatch per instance of a repeated boundary, each with its own stable id.
      out.hatches.push({ path: joinPath(path, h.id + (outers.length > 1 || o.path.endsWith("]") ? `[${oi}]` : "")), outer: o.points, holes, material, angle, scale: hscale });
    }
  }

  for (const f of def.facts ?? []) {
    try {
      out.facts.push({ key: f.key, value: evalExpr(f.expr, scope), path, semanticType: def.semanticType });
    } catch (e) {
      issue(out.issues, "warning", "fact-error", path, `Fact ${f.key}: ${(e as Error).message}.`);
    }
  }

  return scope;
}

/**
 * Evaluates a component definition.
 *
 * Also evaluates the defaults once to compare loop orientation: a loop whose
 * signed area flips sign between the defaults and the requested values has
 * been turned inside out, whatever the values were — a generic guard that
 * needs no per-component rule.
 */
export function evaluateComponent(
  def: ComponentDefinition,
  values: Record<string, number>,
  registry: ComponentRegistry,
  frame: Frame = IDENTITY_FRAME,
  options: EvaluateOptions = {}
): ComponentEvaluation {
  const out = emptyEvaluation(def.id);
  const globals = options.globals ?? {};
  const inputs: ComponentInputs = { values, relations: options.relations, customValues: options.customValues, tables: options.tables };
  out.scope = evaluateInto(def, inputs, registry, frame, "", out, options.depth ?? 0, globals);

  if (!options.skipOrientationCheck) {
    const ref = evaluateComponent(def, {}, registry, frame, { skipOrientationCheck: true, globals, tables: options.tables });
    const refArea = new Map(ref.loops.filter((l) => l.closed).map((l) => [l.path, signedArea(l.points)]));
    for (const l of out.loops) {
      if (!l.closed) continue;
      const a0 = refArea.get(l.path);
      const a1 = signedArea(l.points);
      if (a0 !== undefined && Math.abs(a0) > 0 && Math.sign(a0) !== Math.sign(a1) && Math.abs(a1) > 0) {
        issue(out.issues, "error", "loop-inverted", l.path, `${l.label} has turned inside out — one of its sizes went negative.`);
      }
    }
  }
  return out;
}

export function hasBlockingIssues(ev: ComponentEvaluation): boolean {
  return ev.issues.some((i) => i.severity === "error");
}
