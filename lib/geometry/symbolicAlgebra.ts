/**
 * Solving an equation into an EXPRESSION, not into a number.
 *
 * The difference is the whole point. A drawing whose wing wall sits where a
 * calculator once said it should is a dead drawing: change the angle and the
 * wall stays put. A drawing whose wing wall sits at
 * `Toe.x + WingLength * cos(WingAngle)` regenerates, because the relationship
 * — not its answer — is what was stored.
 *
 * So this module rearranges relationships. Given `Rise = Length * sin(Angle)`
 * and the unknown `Angle`, it returns `asin(Rise / Length)`: the same equation,
 * written the other way round, still in the drawing's named values. The caller
 * puts that straight into a coordinate or a formula and the dependency chain
 * stays intact.
 *
 * Two methods, in order of preference:
 *   1. ISOLATION — walk down the side the unknown is on, inverting each
 *      operation. Exact, closed form, parametric. Works whenever the unknown
 *      appears once and every step on the way to it can be undone.
 *   2. ELIMINATION — for simultaneous equations: isolate one unknown, put that
 *      expression into the next equation, repeat. Also exact and parametric.
 *
 * What neither can do (the unknown appears twice, or under `abs`, `min`, a
 * variable exponent) is reported as a reason, never guessed at. A caller that
 * still needs an answer can solve it numerically — but a number is not a
 * relationship, and `solveNumeric` exists to CHECK a relationship or to feed a
 * value the engine re-solves on every regeneration, not to freeze one into a
 * coordinate.
 *
 * Angles are in degrees throughout, because that is what the expression
 * language's trigonometry uses.
 */

import { parseFormula, evaluateAST, type ASTNode } from "@/lib/parametric/expression";
import { DEFAULT_TOLERANCE_POLICY, type TolerancePolicy } from "@/lib/geometry/tolerance";

export type Scope = Record<string, number>;

export interface Equation {
  lhs: ASTNode;
  rhs: ASTNode;
}

export type SolveResult = { ok: true; expr: string; method: "isolated" | "eliminated" } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Parsing and printing
// ---------------------------------------------------------------------------

function parse(src: string, what: string): ASTNode {
  const r = parseFormula(src);
  if (!r.ast) throw new Error(`${what} "${src}": ${r.error ?? "syntax error"}`);
  return r.ast;
}

/** Splits "lhs = rhs" at its single equals sign (the grammar has no ==). */
export function parseEquation(equation: string): Equation {
  const parts = equation.split("=");
  if (parts.length !== 2) throw new Error(`"${equation}" is not an equation: write it as "left = right".`);
  return { lhs: parse(parts[0], "left side"), rhs: parse(parts[1], "right side") };
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };

/**
 * Writes an AST back out as an expression the engine can read, with no more
 * brackets than the precedence needs — the result is read by people as often as
 * by the evaluator.
 */
export function printAST(node: ASTNode, parentPrecedence = 0, isRightOperand = false): string {
  switch (node.type) {
    case "NumberLiteral": {
      const v = node.value;
      const text = Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
      return v < 0 && parentPrecedence > 0 ? `(${text})` : text;
    }
    case "Identifier":
      return node.name;
    case "UnaryOp": {
      const inner = printAST(node.argument, 3);
      const text = node.operator === "-" ? `-${inner}` : inner;
      return parentPrecedence > 1 ? `(${text})` : text;
    }
    case "BinaryOp": {
      const p = PRECEDENCE[node.operator];
      const left = printAST(node.left, p);
      // `a - (b - c)` and `a / (b * c)` need their brackets kept.
      const right = printAST(node.right, p, true);
      const text = `${left} ${node.operator} ${right}`;
      const needs = p < parentPrecedence || (p === parentPrecedence && isRightOperand);
      return needs ? `(${text})` : text;
    }
    case "FunctionCall":
      return `${node.name}(${node.args.map((a) => printAST(a)).join(", ")})`;
  }
}

const num = (value: number): ASTNode => ({ type: "NumberLiteral", value });
const bin = (operator: "+" | "-" | "*" | "/" | "^", left: ASTNode, right: ASTNode): ASTNode => ({ type: "BinaryOp", operator, left, right });
const call = (name: string, ...args: ASTNode[]): ASTNode => ({ type: "FunctionCall", name, args });

export function namesIn(node: ASTNode, into = new Set<string>()): Set<string> {
  switch (node.type) {
    case "Identifier":
      into.add(node.name);
      break;
    case "UnaryOp":
      namesIn(node.argument, into);
      break;
    case "BinaryOp":
      namesIn(node.left, into);
      namesIn(node.right, into);
      break;
    case "FunctionCall":
      node.args.forEach((a) => namesIn(a, into));
      break;
  }
  return into;
}

function countOf(node: ASTNode, name: string): number {
  switch (node.type) {
    case "Identifier":
      return node.name === name ? 1 : 0;
    case "UnaryOp":
      return countOf(node.argument, name);
    case "BinaryOp":
      return countOf(node.left, name) + countOf(node.right, name);
    case "FunctionCall":
      return node.args.reduce((n, a) => n + countOf(a, name), 0);
    default:
      return 0;
  }
}

/** Replaces every mention of `name` with another expression's tree. */
export function substituteAST(node: ASTNode, name: string, replacement: ASTNode): ASTNode {
  switch (node.type) {
    case "Identifier":
      return node.name === name ? replacement : node;
    case "UnaryOp":
      return { ...node, argument: substituteAST(node.argument, name, replacement) };
    case "BinaryOp":
      return { ...node, left: substituteAST(node.left, name, replacement), right: substituteAST(node.right, name, replacement) };
    case "FunctionCall":
      return { ...node, args: node.args.map((a) => substituteAST(a, name, replacement)) };
    default:
      return node;
  }
}

/** Puts `replacement` in place of `name` inside an expression string. */
export function substitute(expr: string, name: string, replacement: string): string {
  return printAST(substituteAST(parse(expr, "expression"), name, parse(replacement, "replacement")));
}

/** The same, for a whole equation: both sides keep their places. */
export function substituteInEquation(equation: string, name: string, replacement: string): string {
  const eq = parseEquation(equation);
  const put = parse(replacement, "replacement");
  return `${printAST(substituteAST(eq.lhs, name, put))} = ${printAST(substituteAST(eq.rhs, name, put))}`;
}

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

/**
 * Functions that can be undone, and how.
 *
 * `sqrt` undoes to a square rather than `^ 2` so the result reads as the
 * multiplication it is. The trigonometric pairs are degree-based, matching the
 * expression language.
 */
const INVERSE_FUNCTION: Record<string, (rhs: ASTNode) => ASTNode> = {
  sin: (r) => call("asin", r),
  cos: (r) => call("acos", r),
  tan: (r) => call("atan", r),
  asin: (r) => call("sin", r),
  acos: (r) => call("cos", r),
  atan: (r) => call("tan", r),
  sqrt: (r) => bin("*", r, r),
  degtorad: (r) => call("radtodeg", r),
  radtodeg: (r) => call("degtorad", r),
};

/** What an isolation step could not undo, said plainly. */
const CANNOT = (what: string) => `the unknown sits inside ${what}, which cannot be undone in one step`;

/**
 * Rearranges `equation` so that `unknown` stands alone, and returns the
 * expression it equals.
 */
export function isolate(equation: string, unknown: string): SolveResult {
  let eq: Equation;
  try {
    eq = parseEquation(equation);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }

  const onLeft = countOf(eq.lhs, unknown);
  const onRight = countOf(eq.rhs, unknown);
  const total = onLeft + onRight;
  if (total === 0) return { ok: false, reason: `"${unknown}" does not appear in ${equation}.` };
  if (total > 1) {
    return {
      ok: false,
      reason: `"${unknown}" appears ${total} times in ${equation}. Rearrange it so it appears once, or solve it numerically.`,
    };
  }

  // Work with the unknown on the left.
  let left = onLeft ? eq.lhs : eq.rhs;
  let right = onLeft ? eq.rhs : eq.lhs;

  for (let guard = 0; guard < 64; guard++) {
    if (left.type === "Identifier" && left.name === unknown) {
      return { ok: true, expr: printAST(right), method: "isolated" };
    }
    if (left.type === "UnaryOp") {
      if (left.operator === "-") right = { type: "UnaryOp", operator: "-", argument: right };
      left = left.argument;
      continue;
    }
    if (left.type === "FunctionCall") {
      const inv = INVERSE_FUNCTION[left.name];
      if (left.args.length === 1 && inv) {
        right = inv(right);
        left = left.args[0];
        continue;
      }
      // hypot(x, b) = R  →  x = sqrt(R * R - b * b); pow(x, n) is handled as ^.
      if (left.name === "hypot" && left.args.length === 2) {
        const i = countOf(left.args[0], unknown) ? 0 : 1;
        const other = left.args[1 - i];
        right = call("sqrt", bin("-", bin("*", right, right), bin("*", other, other)));
        left = left.args[i];
        continue;
      }
      if (left.name === "pow" && left.args.length === 2 && countOf(left.args[1], unknown) === 0) {
        left = bin("^", left.args[0], left.args[1]);
        continue;
      }
      return { ok: false, reason: CANNOT(`${left.name}()`) };
    }
    if (left.type === "BinaryOp") {
      const inLeft = countOf(left.left, unknown) > 0;
      const keep = inLeft ? left.left : left.right;
      const other = inLeft ? left.right : left.left;
      switch (left.operator) {
        case "+":
          right = bin("-", right, other);
          break;
        case "-":
          // x - b = R → x = R + b;  b - x = R → x = b - R
          right = inLeft ? bin("+", right, other) : bin("-", other, right);
          break;
        case "*":
          right = bin("/", right, other);
          break;
        case "/":
          // x / b = R → x = R * b;  b / x = R → x = b / R
          right = inLeft ? bin("*", right, other) : bin("/", other, right);
          break;
        case "^":
          if (!inLeft) return { ok: false, reason: CANNOT("an exponent") };
          right = bin("^", right, bin("/", num(1), other));
          break;
        default:
          return { ok: false, reason: CANNOT(`"${left.operator}"`) };
      }
      left = keep;
      continue;
    }
    return { ok: false, reason: `"${unknown}" could not be isolated in ${equation}.` };
  }
  return { ok: false, reason: `"${unknown}" could not be isolated in ${equation}.` };
}

// ---------------------------------------------------------------------------
// Elimination — simultaneous equations
// ---------------------------------------------------------------------------

export type SystemResult =
  | { ok: true; solutions: { name: string; expr: string }[]; method: "eliminated" }
  | { ok: false; reason: string };

/**
 * Solves equations for several unknowns at once, by substitution.
 *
 * Each round looks for an equation in which exactly one unknown is still left
 * and can be isolated; that expression is then put into the others. What comes
 * back is every unknown written in the knowns — expressions, so the geometry
 * built from them still regenerates.
 */
export function solveSystem(equations: string[], unknowns: string[]): SystemResult {
  if (equations.length < unknowns.length) {
    return { ok: false, reason: `${unknowns.length} unknowns need at least ${unknowns.length} equations; ${equations.length} given.` };
  }
  let pending = [...equations];
  const remaining = [...unknowns];
  const found: { name: string; expr: string }[] = [];

  for (let round = 0; round < unknowns.length; round++) {
    let progressed = false;
    for (let i = 0; i < pending.length && !progressed; i++) {
      const here = remaining.filter((u) => {
        const eq = parseEquation(pending[i]);
        return countOf(eq.lhs, u) + countOf(eq.rhs, u) > 0;
      });
      if (here.length !== 1) continue;
      const r = isolate(pending[i], here[0]);
      if (!r.ok) continue;
      found.push({ name: here[0], expr: r.expr });
      remaining.splice(remaining.indexOf(here[0]), 1);
      pending = pending.filter((_, k) => k !== i).map((e) => substituteInEquation(e, here[0], r.expr));
      progressed = true;
    }
    if (!progressed) break;
  }

  if (remaining.length > 0) {
    return {
      ok: false,
      reason: `${remaining.join(", ")} could not be separated out by substitution. Give one more relationship, or solve numerically.`,
    };
  }
  // Back-substitute so no solution is written in another unknown.
  const ordered = [...found].reverse();
  const resolved: { name: string; expr: string }[] = [];
  for (const s of ordered) {
    let expr = s.expr;
    for (const done of resolved) expr = substitute(expr, done.name, done.expr);
    resolved.push({ name: s.name, expr });
  }
  return { ok: true, solutions: resolved.reverse(), method: "eliminated" };
}

// ---------------------------------------------------------------------------
// Numerical solving
// ---------------------------------------------------------------------------

export interface NumericOptions {
  scope: Scope;
  min: number;
  max: number;
  policy?: TolerancePolicy;
}

export type NumericResult = { ok: true; value: number; residual: number; steps: number } | { ok: false; reason: string };

/**
 * Finds where `equation` balances, for one unknown, inside a range.
 *
 * Bisection: it cannot diverge, cannot overshoot, and needs no derivative —
 * which matters because the caller is a drafting agent, not a numerical
 * analyst, and a solver that silently wanders off is worse than one that says
 * it could not find the answer. The range must bracket the answer (the residual
 * has to change sign across it), and saying so is the honest failure.
 */
export function solveNumeric(equation: string, unknown: string, opts: NumericOptions): NumericResult {
  const policy = opts.policy ?? DEFAULT_TOLERANCE_POLICY;
  let eq: Equation;
  try {
    eq = parseEquation(equation);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  if (countOf(eq.lhs, unknown) + countOf(eq.rhs, unknown) === 0) {
    return { ok: false, reason: `"${unknown}" does not appear in ${equation}.` };
  }
  if (!(opts.max > opts.min)) return { ok: false, reason: `The range for ${unknown} must run upwards (min ${opts.min}, max ${opts.max}).` };

  const residual = (x: number): number | null => {
    const scope = { ...opts.scope, [unknown]: x };
    const l = evaluateAST(eq.lhs, scope);
    const r = evaluateAST(eq.rhs, scope);
    if (l.error || r.error) return null;
    return l.value - r.value;
  };

  let lo = opts.min;
  let hi = opts.max;
  const flo = residual(lo);
  const fhi = residual(hi);
  if (flo === null || fhi === null) return { ok: false, reason: `${equation} cannot be evaluated across that range (a value it reads may be missing).` };
  if (flo === 0) return { ok: true, value: lo, residual: 0, steps: 0 };
  if (fhi === 0) return { ok: true, value: hi, residual: 0, steps: 0 };
  if (flo > 0 === fhi > 0) {
    return {
      ok: false,
      reason: `Between ${unknown} = ${lo} and ${unknown} = ${hi} the two sides never meet (they differ by ${flo.toPrecision(4)} and ${fhi.toPrecision(4)}). Widen the range, or check the relationship.`,
    };
  }

  let sLo = flo > 0;
  let mid = lo;
  let fMid = flo;
  let steps = 0;
  // 200 halvings take any sensible range below the residual tolerance; the
  // loop stops as soon as it is there, and the count is reported.
  for (; steps < 200; steps++) {
    mid = (lo + hi) / 2;
    const f = residual(mid);
    if (f === null) return { ok: false, reason: `${equation} cannot be evaluated at ${unknown} = ${mid}.` };
    fMid = f;
    if (Math.abs(f) <= policy.solver_residual || (hi - lo) / 2 <= policy.solver_residual) break;
    if (f > 0 === sLo) {
      lo = mid;
      sLo = f > 0;
    } else {
      hi = mid;
    }
  }
  return { ok: true, value: mid, residual: fMid, steps };
}

/** Evaluates an expression, returning null rather than throwing. */
export function value(expr: string, scope: Scope): number | null {
  try {
    const r = evaluateAST(parse(expr, "expression"), scope);
    return r.error ? null : r.value;
  } catch {
    return null;
  }
}
