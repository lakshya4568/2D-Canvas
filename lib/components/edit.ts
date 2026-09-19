/**
 * Editing a drawing's own component definition, entity by entity, without
 * losing what makes it parametric.
 *
 *   remove    drop entities (outlines, circles, dimensions, levels, callouts,
 *             texts, hatches); a hatch whose outline goes goes with it
 *   offset    move entities by a NEW named value pair (e.g. Hole3ShiftX/Y):
 *             each point becomes "(its expression) + shift", so the entity
 *             still follows everything it followed, plus a value a person can
 *             see and change
 *   unlink    a worked-out value becomes a typed one, at its current number
 *   formula   rewrite a worked-out value's expression
 *
 * Pure: the caller evaluates the result and refuses it whole if it breaks
 * anything. Generic — nothing here knows what is drawn.
 */

import type { ComponentDefinition, ComponentParameter, Expr, XY } from "./types";

export type DefinitionEdit =
  | { op: "remove"; ids: string[] }
  | { op: "offset"; ids: string[]; dx: number; dy: number; name?: string }
  | { op: "unlink"; name: string; value: number }
  | { op: "formula"; name: string; expr: string };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function names(def: ComponentDefinition): Set<string> {
  return new Set([...def.parameters.map((p) => p.name), ...(def.formulas ?? []).map((f) => f.name)]);
}

function freshName(def: ComponentDefinition, base: string): string {
  const taken = names(def);
  const clean = base.replace(/[^A-Za-z0-9_]/g, "") || "Shift";
  if (!taken.has(`${clean}X`) && !taken.has(`${clean}Y`)) return clean;
  for (let i = 2; ; i++) if (!taken.has(`${clean}${i}X`) && !taken.has(`${clean}${i}Y`)) return `${clean}${i}`;
}

const plus = (e: Expr, name: string): Expr => (typeof e === "number" && e === 0 ? name : `(${e}) + ${name}`);

export function editDefinition(def: ComponentDefinition, edit: DefinitionEdit): { def: ComponentDefinition; message: string } {
  switch (edit.op) {
    case "remove": {
      const drop = new Set(edit.ids);
      // A hatch cannot outlive the outline it fills.
      for (const h of def.hatches ?? []) if (drop.has(h.boundary) || (h.holes ?? []).some((x) => drop.has(x))) drop.add(h.id);
      const keep = <T extends { id: string }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !drop.has(x.id));
      const before = [def.primitives, def.dimensions, def.levels, def.leaders, def.texts, def.hatches].reduce((n, xs) => n + (xs?.length ?? 0), 0);
      const next: ComponentDefinition = {
        ...def,
        primitives: keep(def.primitives),
        dimensions: keep(def.dimensions),
        levels: keep(def.levels),
        leaders: keep(def.leaders),
        texts: keep(def.texts),
        hatches: keep(def.hatches),
      };
      const after = [next.primitives, next.dimensions, next.levels, next.leaders, next.texts, next.hatches].reduce((n, xs) => n + (xs?.length ?? 0), 0);
      if (after === before) throw new Error("Nothing to remove.");
      return { def: next, message: `Removed ${[...drop].filter((id) => !edit.ids.includes(id)).length ? `${edit.ids.join(", ")} (and ${[...drop].filter((id) => !edit.ids.includes(id)).join(", ")})` : edit.ids.join(", ")}` };
    }

    case "offset": {
      const ids = new Set(edit.ids);
      const base = freshName(def, edit.name ?? (edit.ids.length === 1 ? `${edit.ids[0]}Shift` : "MoveShift"));
      const nx = `${base}X`;
      const ny = `${base}Y`;
      const shift = (p: XY): XY => [plus(p[0], nx), plus(p[1], ny)];
      const params: ComponentParameter[] = [
        { name: nx, label: `Shift of ${edit.ids.join(", ")} (x)`, kind: "length", unit: "mm", default: Math.round(edit.dx * 1000) / 1000, group: "Shifts" },
        { name: ny, label: `Shift of ${edit.ids.join(", ")} (y)`, kind: "length", unit: "mm", default: Math.round(edit.dy * 1000) / 1000, group: "Shifts" },
      ];
      let touched = 0;
      const next: ComponentDefinition = {
        ...def,
        parameters: [...def.parameters, ...params],
        primitives: (def.primitives ?? []).map((p) => {
          if (!ids.has(p.id)) return p;
          touched++;
          return p.kind === "circle" ? { ...p, center: shift(p.center) } : { ...p, points: p.points.map(shift) };
        }),
        dimensions: (def.dimensions ?? []).map((d) => (ids.has(d.id) ? (touched++, { ...d, from: shift(d.from), to: shift(d.to) }) : d)),
        levels: (def.levels ?? []).map((l) => (ids.has(l.id) ? (touched++, { ...l, at: shift(l.at) }) : l)),
        leaders: (def.leaders ?? []).map((l) => (ids.has(l.id) ? (touched++, { ...l, points: l.points.map(shift) }) : l)),
        texts: (def.texts ?? []).map((t) => (ids.has(t.id) ? (touched++, { ...t, at: shift(t.at), along: t.along ? [shift(t.along[0]), shift(t.along[1])] : undefined }) : t)),
      };
      if (!touched) throw new Error("None of those can be moved (a hatch follows its outline).");
      return { def: next, message: `Moved ${edit.ids.join(", ")} by ${nx} = ${params[0].default}, ${ny} = ${params[1].default} (new values; change them in Run Mode)` };
    }

    case "unlink": {
      const f = (def.formulas ?? []).find((x) => x.name === edit.name);
      if (!f) throw new Error(`${edit.name} is not a worked-out value.`);
      if (!Number.isFinite(edit.value)) throw new Error(`${edit.name} has no current value to keep.`);
      const unit = f.unit === "m2" || f.unit === undefined ? "mm" : f.unit;
      const kind: ComponentParameter["kind"] = unit === "m" ? "level" : unit === "deg" ? "angle" : unit === "-" ? "ratio" : "length";
      return {
        def: {
          ...def,
          formulas: (def.formulas ?? []).filter((x) => x.name !== edit.name),
          parameters: [...def.parameters, { name: f.name, label: f.label, kind, unit, default: Math.round(edit.value * 1e6) / 1e6, group: f.group ?? "Values", description: `Was worked out as ${f.expr}; now typed.` }],
        },
        message: `${edit.name} is now a typed value (${Math.round(edit.value * 1000) / 1000}); it no longer follows ${f.expr}`,
      };
    }

    case "formula": {
      const f = (def.formulas ?? []).find((x) => x.name === edit.name);
      if (!f) throw new Error(`${edit.name} is not a worked-out value.`);
      const expr = edit.expr.trim();
      if (!expr) throw new Error("The expression is empty.");
      if (!NAME.test(edit.name)) throw new Error(`"${edit.name}" is not a name.`);
      return {
        def: { ...def, formulas: (def.formulas ?? []).map((x) => (x.name === edit.name ? { ...x, expr } : x)) },
        message: `${edit.name} = ${expr} (was ${f.expr})`,
      };
    }
  }
}
