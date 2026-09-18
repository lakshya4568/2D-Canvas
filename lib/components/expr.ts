/**
 * Expression evaluation for component definitions.
 *
 * Reuses the one safe parser the rest of the kernel uses (lib/parametric/
 * expression.ts — AST, no eval) and caches parsed trees, because a bridge
 * assembly re-evaluates the same few hundred strings on every edit.
 *
 * Dependencies come from the AST, never from substring matching (§81 change 2):
 * `W` does not depend on `WallThickness`.
 */

import { parseFormula, evaluateAST, type ASTNode } from "@/lib/parametric/expression";
import type { Expr } from "./types";

const cache = new Map<string, { ast: ASTNode | null; deps: string[]; error?: string }>();

function parsed(src: string) {
  let hit = cache.get(src);
  if (!hit) {
    const r = parseFormula(src);
    hit = { ast: r.ast, deps: r.dependencies, error: r.error };
    cache.set(src, hit);
  }
  return hit;
}

export class ExprError extends Error {
  constructor(
    public readonly expr: string,
    message: string
  ) {
    super(message);
  }
}

export type Scope = Record<string, number>;

/** Constants every expression can use. */
export const BUILTINS: Scope = { PI: Math.PI };

export function evalExpr(e: Expr, scope: Scope): number {
  if (typeof e === "number") return e;
  const src = e.trim();
  if (src === "") throw new ExprError(e, "empty expression");
  // Fast path for plain numbers, which most coordinates are.
  if (/^-?\d+(\.\d+)?$/.test(src)) return Number(src);
  const p = parsed(src);
  if (!p.ast) throw new ExprError(src, p.error ?? "syntax error");
  const r = evaluateAST(p.ast, scope);
  if (r.error) throw new ExprError(src, r.error);
  return r.value;
}

export function exprDependencies(e: Expr): string[] {
  if (typeof e === "number") return [];
  return parsed(e.trim()).deps;
}

/**
 * Orders named expressions so each is evaluated after what it reads.
 * Returns the order and any names caught in a cycle (Kahn's algorithm, §21).
 */
export function orderByDependencies(items: { name: string; expr: Expr }[]): { order: string[]; cyclic: string[] } {
  const names = new Set(items.map((i) => i.name));
  const deps = new Map<string, string[]>();
  for (const i of items) deps.set(i.name, exprDependencies(i.expr).filter((d) => names.has(d) && d !== i.name));
  const selfRef = items.filter((i) => exprDependencies(i.expr).includes(i.name)).map((i) => i.name);
  const indeg = new Map<string, number>();
  for (const i of items) indeg.set(i.name, deps.get(i.name)!.length);
  const users = new Map<string, string[]>();
  for (const [n, ds] of deps) for (const d of ds) users.set(d, [...(users.get(d) ?? []), n]);
  const queue = items.filter((i) => indeg.get(i.name) === 0 && !selfRef.includes(i.name)).map((i) => i.name);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const u of users.get(n) ?? []) {
      indeg.set(u, indeg.get(u)! - 1);
      if (indeg.get(u) === 0 && !selfRef.includes(u)) queue.push(u);
    }
  }
  const cyclic = items.map((i) => i.name).filter((n) => !order.includes(n));
  return { order, cyclic };
}

/** `{Name}`, `{Name:m}` (mm shown as m), `{Name:rl}` (level with sign), `{Name:0}` (fixed decimals). */
export function interpolate(template: string, scope: Scope): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(?::([a-z0-9]+))?\}/g, (_m, name: string, fmt?: string) => {
    const v = scope[name];
    if (v === undefined || !Number.isFinite(v)) return `{${name}}`;
    if (fmt === "m") return (v / 1000).toFixed(3);
    if (fmt === "rl") return (v >= 0 ? "+" : "") + v.toFixed(3);
    if (fmt && /^\d$/.test(fmt)) return v.toFixed(Number(fmt));
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
  });
}
