/**
 * The component engine: definition + values → geometry, annotation, facts and
 * a list of problems.
 *
 * One pass, in dependency order:
 *   1. parameters (given values, else defaults) and formulas (topologically
 *      ordered; a cycle is an error, not a hang);
 *   2. invariants;
 *   3. children — each child's values are expressions in THIS scope, its frame
 *      is this frame composed with its placement or attachment (§23.2, §37);
 *   4. primitives, repeats expanded with index-stable ids (§23.4);
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
import { BUILTINS, ExprError, evalExpr, interpolate, orderByDependencies, type Scope } from "./expr";
import type {
  ComponentDefinition,
  ComponentFormula,
  Expr,
  InvariantDef,
  RepeatSpec,
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
}

export interface EvalCircle {
  path: string;
  primitiveId: string;
  role: string;
  layer: LayerCategory;
  label: string;
  center: Point;
  r: number;
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
}

export interface EvalLevel {
  path: string;
  at: Point;
  label: string;
  side: "left" | "right";
}

export interface EvalHatch {
  path: string;
  outer: Point[];
  holes: Point[][];
  material: HatchMaterial;
}

export interface EvalText {
  path: string;
  at: Point;
  text: string;
  height?: number;
  align: "left" | "center" | "right";
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
  facts: EvalFact[];
  issues: ComponentIssue[];
  /** Every (sub)component's evaluated scope, root first. */
  scopes: ScopeReport[];
}

export interface EvaluateOptions {
  /** Skip the defaults comparison (used when evaluating the defaults themselves). */
  skipOrientationCheck?: boolean;
  /** Depth guard against definitions that include themselves. */
  depth?: number;
  /**
   * Values every expression can read, e.g. `DIM` (dimension-line spacing) and
   * `TXT` (text height) in model mm at the drawing's annotation scale. Geometry
   * must not read them; only annotation placement does.
   */
  globals?: Scope;
}

const MAX_REPEAT = 400;
const MAX_DEPTH = 12;

function issue(out: ComponentIssue[], severity: ComponentIssue["severity"], code: string, path: string, message: string, source?: string) {
  out.push({ severity, code, path, message, source });
}

function joinPath(base: string, part: string): string {
  return base ? `${base}/${part}` : part;
}

/**
 * Builds a definition's scope from given values: parameters first, then
 * formulas in dependency order.
 */
export function buildScope(
  def: ComponentDefinition,
  values: Record<string, number>,
  issues: ComponentIssue[],
  path = "",
  globals: Scope = {}
): Scope {
  const scope: Scope = { ...BUILTINS, ...globals };
  for (const p of def.parameters) {
    let v = values[p.name];
    if (v === undefined || !Number.isFinite(v)) v = p.default;
    if (p.kind === "count") {
      const r = Math.round(v);
      if (r !== v) issue(issues, "warning", "count-rounded", path, `${p.label ?? p.name} is a count; ${v} was taken as ${r}.`);
      v = r;
    }
    scope[p.name] = v;
    if (p.min !== undefined && v < p.min) {
      issue(issues, "warning", "below-range", path, `${p.label ?? p.name} = ${fmt(v)} ${p.unit} is below the usual minimum ${fmt(p.min)} ${p.unit}.`);
    }
    if (p.max !== undefined && v > p.max) {
      issue(issues, "warning", "above-range", path, `${p.label ?? p.name} = ${fmt(v)} ${p.unit} is above the usual maximum ${fmt(p.max)} ${p.unit}.`);
    }
  }
  const formulas: ComponentFormula[] = def.formulas ?? [];
  const { order, cyclic } = orderByDependencies(formulas);
  for (const n of cyclic) {
    issue(issues, "error", "formula-cycle", path, `Formula ${n} depends on itself through other formulas.`);
    scope[n] = NaN;
  }
  const byName = new Map(formulas.map((f) => [f.name, f]));
  for (const n of order) {
    const f = byName.get(n)!;
    try {
      scope[n] = evalExpr(f.expr, scope);
    } catch (e) {
      scope[n] = NaN;
      issue(issues, "error", "formula-error", path, `Formula ${n} could not be evaluated: ${(e as Error).message}.`);
    }
  }
  return scope;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
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

/** Expands a repeat into the scopes it produces (a single unindexed scope when absent). */
function expand(repeat: RepeatSpec | undefined, scope: Scope, issues: ComponentIssue[], path: string, what: string): { scope: Scope; suffix: string }[] {
  if (!repeat) return [{ scope, suffix: "" }];
  let n: number;
  try {
    n = Math.round(evalExpr(repeat.count, scope));
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
  const out: { scope: Scope; suffix: string }[] = [];
  for (let i = 0; i < n; i++) out.push({ scope: { ...scope, [repeat.index]: i }, suffix: `[${i}]` });
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
    facts: [],
    issues: [],
    scopes: [],
  };
}

/**
 * Evaluates `def` with `values` into the frame `frame`, appending into `out`.
 * `path` prefixes every id so nested and repeated children stay distinct.
 */
function evaluateInto(
  def: ComponentDefinition,
  values: Record<string, number>,
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
  const scope = buildScope(def, values, out.issues, path, globals);
  out.scopes.push({ path, definitionId: def.id, name: def.name, scope });

  for (const inv of def.invariants ?? []) {
    try {
      if (!checkInvariant(inv, scope)) issue(out.issues, inv.severity, `invariant:${inv.id}`, path, inv.message, inv.source);
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
    for (const { scope: s, suffix } of expand(a.repeat, scope, out.issues, path, `anchor ${a.id}`)) {
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
    for (const { scope: s, suffix } of expand(child.repeat, scope, out.issues, path, `child ${child.id}`)) {
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
        const cscope = buildScope(cdef, cvalues, probe.issues, cpath, globals);
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
      evaluateInto(cdef, cvalues, registry, cframe, cpath, out, depth + 1, globals);
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
    for (const { scope: s, suffix } of expand(prim.repeat, scope, out.issues, path, `${prim.id}`)) {
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
          out.circles.push({ path: ppath, primitiveId: prim.id, role: prim.role, layer: prim.layer, label, center: pt(prim.center, s, frame), r });
          continue;
        }
        const pts = dedupe(prim.points.map((xy) => pt(xy, s, frame)), prim.kind === "loop");
        if (prim.kind === "loop" && pts.length < 3) {
          issue(out.issues, "error", "loop-collapsed", ppath, `${label} has collapsed to ${pts.length} point(s) — a thickness or size has gone to zero.`);
          continue;
        }
        if (prim.kind === "loop" && selfCrosses(pts)) {
          issue(out.issues, "error", "loop-self-crossing", ppath, `${label} crosses itself — a size is larger than the space it sits in.`);
        }
        out.loops.push({ path: ppath, primitiveId: prim.id, role: prim.role, layer: prim.layer, label, points: pts, closed: prim.kind === "loop", draw: prim.draw !== false });
      } catch (e) {
        issue(out.issues, "error", e instanceof ExprError ? "expr-error" : "primitive-error", ppath, `${prim.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  const axis = applyFrameVector(frame, 1, 0);
  for (const d of def.dimensions ?? []) {
    for (const { scope: s, suffix } of expand(d.repeat, scope, out.issues, path, `dimension ${d.id}`)) {
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
        });
      } catch (e) {
        issue(out.issues, "error", "dimension-error", path, `Dimension ${d.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  for (const l of def.levels ?? []) {
    for (const { scope: s, suffix } of expand(l.repeat, scope, out.issues, path, `level ${l.id}`)) {
      try {
        if (!enabled(l.when, s)) continue;
        const side = l.side ?? "right";
        out.levels.push({ path: joinPath(path, l.id + suffix), at: pt(l.at, s, frame), label: l.label, side: frame.mirror ? (side === "left" ? "right" : "left") : side });
      } catch (e) {
        issue(out.issues, "error", "level-error", path, `Level ${l.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  for (const t of def.texts ?? []) {
    for (const { scope: s, suffix } of expand(t.repeat, scope, out.issues, path, `text ${t.id}`)) {
      try {
        if (!enabled(t.when, s)) continue;
        out.texts.push({ path: joinPath(path, t.id + suffix), at: pt(t.at, s, frame), text: interpolate(t.text, s), height: t.height, align: t.align ?? "center", layer: t.layer ?? "text" });
      } catch (e) {
        issue(out.issues, "error", "text-error", path, `Text ${t.id}${suffix}: ${(e as Error).message}.`);
      }
    }
  }

  // Hatches: every instance of the boundary loop, with the hole loops that lie inside it.
  const depthOf = (p: string) => (path ? path.split("/").length + 1 : 1) === p.split("/").length && p.startsWith(path ? path + "/" : "");
  const myLoops = (primId: string): { path: string; label: string; points: Point[] }[] => [
    ...out.loops.filter((l) => l.closed && l.primitiveId === primId && depthOf(l.path)),
    ...out.circles
      .filter((c) => c.primitiveId === primId && depthOf(c.path))
      .map((c) => ({ path: c.path, label: c.label, points: ring(c.center, c.r) })),
  ];
  for (const h of def.hatches ?? []) {
    try {
      if (!enabled(h.when, scope)) continue;
    } catch {
      continue;
    }
    const outers = myLoops(h.boundary);
    const holeLoops = (h.holes ?? []).flatMap((id) => myLoops(id));
    for (const [oi, o] of outers.entries()) {
      const holes: Point[][] = [];
      for (const hl of holeLoops) {
        const inside = hl.points.every((p) => pointInPolygon(p, o.points));
        if (inside) holes.push(hl.points);
        else if (hl.points.some((p) => pointInPolygon(p, o.points))) {
          issue(out.issues, "error", "opening-outside", hl.path, `${hl.label} is no longer inside ${o.label} — the opening has broken through the ${o.label.toLowerCase()}.`);
        }
      }
      // One hatch per instance of a repeated boundary, each with its own stable id.
      out.hatches.push({ path: joinPath(path, h.id + (outers.length > 1 ? `[${oi}]` : "")), outer: o.points, holes, material: h.material });
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
  out.scope = evaluateInto(def, values, registry, frame, "", out, options.depth ?? 0, globals);

  if (!options.skipOrientationCheck) {
    const ref = evaluateComponent(def, {}, registry, frame, { skipOrientationCheck: true, globals });
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
