/**
 * A component's parametric model, laid open: every value (typed, related,
 * automatic or worked out) with its expression, what it depends on and what
 * depends on it; every entity with the expressions of its points and the
 * values that move it; every constraint and whether it holds; every dimension
 * and the value it drives.
 *
 * It is read from the definition and one evaluation — the same dependency
 * graph the engine evaluates, by AST (never by matching names in text). No
 * knowledge of what is being drawn.
 */

import type { ComponentDefinition, ComponentInstance, ComponentParameter, Expr, XY } from "./types";
import type { ComponentEvaluation } from "./evaluate";
import { exprDependencies } from "./expr";
import { valueLabel } from "./labels";

export type ModelValueKind = "typed" | "related" | "auto" | "formula" | "custom";

export interface ModelValue {
  name: string;
  label?: string;
  unit?: string;
  kind: ModelValueKind;
  /** The expression it follows (related, auto, formula). */
  expr?: string;
  value: number;
  /** Values its expression reads directly. */
  dependsOn: string[];
  /** Values whose expressions read it directly. */
  usedBy: string[];
  /** Entity ids it moves, directly or through other values. */
  drives: string[];
  /** Typed values it finally comes from (the inputs to change to move it). */
  roots: string[];
  /** Where a typed value came from (given, scaled, drafting, required). */
  provenance?: ComponentParameter["provenance"];
}

export type ModelEntityKind = "loop" | "path" | "circle" | "dimension" | "level" | "leader" | "text" | "hatch";

export interface ModelEntity {
  id: string;
  kind: ModelEntityKind;
  layer?: string;
  /** Point expressions, in the definition's own words. */
  points: { x: string; y: string }[];
  /** Radius expression (circles). */
  r?: string;
  /** Values its expressions read directly. */
  dependsOn: string[];
  /** Typed values that move it. */
  roots: string[];
  /** Dimensions: the value editing it sets. */
  drives?: string;
  /** Hatches: the outline it fills. */
  boundary?: string;
  text?: string;
}

export interface ModelConstraint {
  id: string;
  expr: string;
  op: string;
  than: string;
  message: string;
  severity: "error" | "warning";
  ok: boolean;
}

export interface ComponentModel {
  values: ModelValue[];
  entities: ModelEntity[];
  constraints: ModelConstraint[];
}

const text = (e: Expr | undefined) => (e === undefined ? "" : String(e));
const deps = (...es: (Expr | undefined)[]) => [...new Set(es.flatMap((e) => (e === undefined ? [] : exprDependencies(e))))];
const pts = (list: XY[]) => list.map((p) => ({ x: text(p[0]), y: text(p[1]) }));

export function componentModel(def: ComponentDefinition, inst: ComponentInstance, ev: ComponentEvaluation): ComponentModel {
  const rel = new Map((inst.relations ?? []).map((r) => [r.name, r.expr]));
  const values: ModelValue[] = [];
  for (const p of def.parameters) {
    const source = ev.sources[p.name];
    const expr = source === "related" ? rel.get(p.name) : source === "auto" ? text(p.defaultExpr) : undefined;
    values.push({ name: p.name, label: valueLabel(p, def), unit: p.unit, kind: source === "related" ? "related" : source === "auto" ? "auto" : "typed", expr, value: ev.scope[p.name], dependsOn: deps(expr), usedBy: [], drives: [], roots: [], provenance: p.provenance });
  }
  for (const c of inst.customValues ?? []) values.push({ name: c.name, label: c.label, unit: c.unit, kind: "custom", value: c.value, dependsOn: [], usedBy: [], drives: [], roots: [] });
  for (const f of def.formulas ?? []) {
    const expr = rel.get(f.name) ?? text(f.expr);
    values.push({ name: f.name, label: valueLabel(f, def), unit: f.unit, kind: rel.has(f.name) ? "related" : "formula", expr, value: ev.scope[f.name], dependsOn: deps(expr), usedBy: [], drives: [], roots: [] });
  }
  for (const r of inst.relations ?? []) {
    if (values.some((v) => v.name === r.name)) continue;
    values.push({ name: r.name, label: r.label, unit: r.unit, kind: "related", expr: r.expr, value: ev.scope[r.name], dependsOn: deps(r.expr), usedBy: [], drives: [], roots: [] });
  }
  const byName = new Map(values.map((v) => [v.name, v]));
  for (const v of values) v.dependsOn = v.dependsOn.filter((d) => byName.has(d));
  for (const v of values) for (const d of v.dependsOn) byName.get(d)!.usedBy.push(v.name);

  // Roots: the typed or added values at the bottom of each chain.
  const rootsOf = new Map<string, string[]>();
  const roots = (name: string, seen = new Set<string>()): string[] => {
    const hit = rootsOf.get(name);
    if (hit) return hit;
    const v = byName.get(name);
    if (!v || seen.has(name)) return [];
    seen.add(name);
    const out = v.kind === "typed" || v.kind === "custom" ? [name] : [...new Set(v.dependsOn.flatMap((d) => roots(d, seen)))];
    rootsOf.set(name, out);
    return out;
  };
  for (const v of values) v.roots = roots(v.name);
  const closure = (names: string[]) => {
    const out = new Set<string>();
    const walk = (n: string) => {
      if (out.has(n) || !byName.has(n)) return;
      out.add(n);
      for (const d of byName.get(n)!.dependsOn) walk(d);
    };
    names.forEach(walk);
    return out;
  };

  const entities: ModelEntity[] = [];
  const add = (e: Omit<ModelEntity, "roots" | "dependsOn">, exprs: (Expr | undefined)[]) => {
    const direct = deps(...exprs).filter((d) => byName.has(d));
    entities.push({ ...e, dependsOn: direct, roots: [...new Set(direct.flatMap((d) => roots(d)))] });
  };
  for (const p of def.primitives ?? []) {
    if (p.kind === "circle") add({ id: p.id, kind: "circle", layer: p.layer, points: pts([p.center]), r: text(p.r) }, [p.center[0], p.center[1], p.r]);
    else add({ id: p.id, kind: p.kind, layer: p.layer, points: pts(p.points) }, p.points.flat());
  }
  for (const d of def.dimensions ?? []) add({ id: d.id, kind: "dimension", layer: d.layer, points: pts([d.from, d.to]), drives: d.drives }, [...d.from, ...d.to, d.offset]);
  for (const l of def.levels ?? []) add({ id: l.id, kind: "level", layer: l.layer, points: pts([l.at]), text: l.label }, [...l.at]);
  for (const l of def.leaders ?? []) add({ id: l.id, kind: "leader", layer: l.layer, points: pts(l.points), text: l.text }, l.points.flat());
  for (const t of def.texts ?? []) add({ id: t.id, kind: "text", layer: t.layer, points: pts([t.at]), text: t.text }, [...t.at, t.rotate, ...(t.along?.flat() ?? [])]);
  for (const h of def.hatches ?? []) {
    const b = entities.find((e) => e.id === h.boundary);
    entities.push({ id: h.id, kind: "hatch", points: [], boundary: h.boundary, dependsOn: b?.dependsOn ?? [], roots: b?.roots ?? [] });
  }
  for (const e of entities) for (const n of closure(e.dependsOn)) byName.get(n)!.drives.push(e.id);

  const constraints: ModelConstraint[] = (def.invariants ?? []).map((inv) => ({
    id: inv.id,
    expr: text(inv.expr),
    op: inv.op,
    than: text(inv.than),
    message: inv.message,
    severity: inv.severity,
    ok: !ev.issues.some((i) => i.code === `invariant:${inv.id}`),
  }));
  return { values, entities, constraints };
}

/** The definition entity a generated shape or annotation belongs to (`inst:path[:eN]`). */
export function entityOfGenerated(id: string, instanceId: string): string | null {
  if (!id.startsWith(`${instanceId}:`)) return null;
  const path = id.slice(instanceId.length + 1).replace(/:e\d+$/, "");
  return path;
}
