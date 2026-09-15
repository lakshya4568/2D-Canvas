/**
 * The scalar parameter DAG — System A of the dual model (§9).
 *
 * Directed, arithmetic, evaluated by topological sort before every solve. It
 * never contains geometry and never decides where a point goes; it decides what
 * number a dimensional constraint is aiming at.
 *
 * §21 names the bug this file must not reproduce: dependencies extracted by
 * substring, so that a parameter called `W` registered as a dependency of
 * `WallThickness`. Dependencies here come from the parsed AST's identifier
 * nodes, which is what `parseFormula` already returns.
 */

import { parseFormula, evaluateAST, ASTNode, SymbolTable } from "../parametric/expression";
import { detectCyclesTarjan, topologicalSortDAG } from "../parametric/dag/tarjan";
import { AuthoringSketch, SketchParameter, Provenance } from "./types";

export interface ParameterEvaluation {
  values: Record<string, number>;
  errors: { parameter: string; message: string }[];
  /** Evaluation order actually used; useful for the inspector. */
  order: string[];
  cycles: string[][];
}

const PARSE_CACHE = new Map<string, { ast: ASTNode | null; error?: string; dependencies: string[] }>();

function parseCached(expr: string) {
  const hit = PARSE_CACHE.get(expr);
  if (hit) return hit;
  const parsed = parseFormula(expr);
  if (PARSE_CACHE.size > 500) PARSE_CACHE.clear();
  PARSE_CACHE.set(expr, parsed);
  return parsed;
}

/** AST identifier nodes only. Never a substring scan. */
export function dependenciesOf(expr: string): string[] {
  return parseCached(expr).dependencies;
}

export function validateExpression(
  expr: string,
  target: string,
  parameters: Record<string, SketchParameter>
): { ok: boolean; message?: string; dependencies: string[] } {
  const parsed = parseCached(expr);
  if (parsed.error || !parsed.ast) {
    return { ok: false, message: parsed.error ?? "Could not read that expression.", dependencies: [] };
  }
  const missing = parsed.dependencies.filter((d) => !parameters[d] && d !== target);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `No parameter named ${missing.join(", ")}. Create it first, or correct the spelling.`,
      dependencies: parsed.dependencies,
    };
  }
  if (parsed.dependencies.includes(target)) {
    return { ok: false, message: `${target} cannot be defined in terms of itself.`, dependencies: parsed.dependencies };
  }

  // Cycle check against the graph the new edge would create.
  const adj = new Map<string, string[]>();
  for (const p of Object.values(parameters)) {
    const deps = p.name === target ? parsed.dependencies : p.role === "DERIVED" && p.expr ? dependenciesOf(p.expr) : [];
    adj.set(p.name, deps);
  }
  if (!adj.has(target)) adj.set(target, parsed.dependencies);
  const cycles = detectCyclesTarjan(adj);
  if (cycles.some((c) => c.includes(target))) {
    return {
      ok: false,
      message: `That would make ${target} depend on itself through ${cycles[0].join(" -> ")}.`,
      dependencies: parsed.dependencies,
    };
  }

  return { ok: true, dependencies: parsed.dependencies };
}

/**
 * Evaluates every DERIVED parameter in dependency order.
 * DRIVING, FIXED and MEASURED values are inputs and are returned unchanged.
 */
export function evaluateParameters(parameters: Record<string, SketchParameter>): ParameterEvaluation {
  const values: Record<string, number> = {};
  const errors: ParameterEvaluation["errors"] = [];

  // `deps` points from a parameter to what it reads; `succ` reverses that, and
  // only the reversed graph gives an evaluation order in which every dependency
  // is already known by the time its dependent is reached.
  const deps = new Map<string, string[]>();
  const succ = new Map<string, string[]>();
  for (const p of Object.values(parameters)) {
    values[p.name] = p.value;
    const d = p.role === "DERIVED" && p.expr ? dependenciesOf(p.expr) : [];
    deps.set(p.name, d);
    if (!succ.has(p.name)) succ.set(p.name, []);
    for (const dep of d) {
      const arr = succ.get(dep) ?? [];
      arr.push(p.name);
      succ.set(dep, arr);
    }
  }

  const cycles = detectCyclesTarjan(deps).filter((c) => c.length > 1);
  if (cycles.length > 0) {
    for (const cyc of cycles) {
      errors.push({
        parameter: cyc[0],
        message: `Circular definition: ${cyc.join(" -> ")}. One of these must become a driving value.`,
      });
    }
    return { values, errors, order: [], cycles };
  }

  const order = topologicalSortDAG(succ);
  for (const name of order) {
    const p = parameters[name];
    if (!p || p.role !== "DERIVED" || !p.expr) continue;
    const parsed = parseCached(p.expr);
    if (!parsed.ast) {
      errors.push({ parameter: name, message: parsed.error ?? "Could not read that expression." });
      continue;
    }
    const symbols: SymbolTable = { ...values };
    const res = evaluateAST(parsed.ast, symbols);
    if (res.error) {
      errors.push({ parameter: name, message: res.error });
      continue;
    }
    values[name] = res.value;
  }

  return { values, errors, order, cycles: [] };
}

/** Returns the sketch with every DERIVED parameter refreshed. */
export function refreshParameters(sketch: AuthoringSketch): {
  sketch: AuthoringSketch;
  errors: ParameterEvaluation["errors"];
} {
  const { values, errors } = evaluateParameters(sketch.parameters);
  const parameters = { ...sketch.parameters };
  for (const [name, value] of Object.entries(values)) {
    if (parameters[name] && parameters[name].value !== value) {
      parameters[name] = { ...parameters[name], value };
    }
  }
  return { sketch: { ...sketch, parameters }, errors };
}

/** Which parameters read this one, transitively. Answers "what will I change?". */
export function dependentsOf(name: string, parameters: Record<string, SketchParameter>): string[] {
  const out = new Set<string>();
  const walk = (target: string) => {
    for (const p of Object.values(parameters)) {
      if (p.role !== "DERIVED" || !p.expr) continue;
      if (out.has(p.name)) continue;
      if (dependenciesOf(p.expr).includes(target)) {
        out.add(p.name);
        walk(p.name);
      }
    }
  };
  walk(name);
  return [...out];
}

export function makeProvenance(
  origin: Provenance["origin"],
  detail: string,
  extra: Partial<Provenance> = {}
): Provenance {
  return { origin, detail, createdAt: Date.now(), ...extra };
}

/** A name that is safe inside an expression and not already taken. */
export function uniqueParameterName(base: string, parameters: Record<string, SketchParameter>): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, "") || "Value";
  const head = /^[0-9]/.test(clean) ? `P${clean}` : clean;
  if (!parameters[head]) return head;
  let i = 2;
  while (parameters[`${head}${i}`]) i++;
  return `${head}${i}`;
}

/**
 * Renames parameters, any number of them, in one pass.
 *
 * A name is referenced from four places — other parameters' expressions, a
 * constraint's `paramRef`, a constraint's label, and a repeat rule's count and
 * spacing — and every one of them has to move at the same instant or the model
 * is briefly inconsistent. Doing that one name at a time through a React
 * callback also reads the sketch as it was at last render, so a second rename in
 * the same handler silently throws the first away.
 *
 * So the whole map is applied at once, and the substitution is done against the
 * ORIGINAL names: renaming {A -> B, B -> C} must not turn A into C by applying
 * the first rule and then the second to its own output.
 */
export function renameParameters(
  sketch: AuthoringSketch,
  renames: Record<string, string>
): { sketch: AuthoringSketch; applied: { from: string; to: string }[] } {
  const applied: { from: string; to: string }[] = [];
  const taken = new Set(Object.keys(sketch.parameters));
  const map = new Map<string, string>();

  for (const [from, requested] of Object.entries(renames)) {
    if (!sketch.parameters[from] || from === requested || !requested) continue;
    taken.delete(from);
    // Build a throwaway record so `uniqueParameterName` sees the names already
    // claimed by this same batch, not just the ones the sketch started with.
    const claimed: Record<string, SketchParameter> = {};
    for (const n of taken) claimed[n] = sketch.parameters[n] ?? sketch.parameters[from];
    for (const n of map.values()) claimed[n] = sketch.parameters[from];
    const clean = uniqueParameterName(requested, claimed);
    map.set(from, clean);
    taken.add(clean);
    applied.push({ from, to: clean });
  }

  if (map.size === 0) return { sketch, applied };

  /** Substitutes identifiers in one pass, so a rename cannot cascade. */
  const rewrite = (expr: string): string =>
    expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (token) => map.get(token) ?? token);

  const parameters: Record<string, SketchParameter> = {};
  for (const [name, p] of Object.entries(sketch.parameters)) {
    const next = map.get(name) ?? name;
    parameters[next] = {
      ...p,
      name: next,
      expr: p.expr ? rewrite(p.expr) : p.expr,
      dependencies: p.dependencies?.map((d) => map.get(d) ?? d),
    };
  }

  const constraints = sketch.constraints.map((c) => {
    const to = c.paramRef ? map.get(c.paramRef) : undefined;
    if (!to || !c.paramRef) return c;
    return {
      ...c,
      paramRef: to,
      label: c.label.split(c.paramRef).join(to),
    };
  });

  const repeats = sketch.repeats.map((r) => ({
    ...r,
    countParam: map.get(r.countParam) ?? r.countParam,
    spacingParam: map.get(r.spacingParam) ?? r.spacingParam,
  }));

  return { sketch: { ...sketch, parameters, constraints, repeats }, applied };
}
