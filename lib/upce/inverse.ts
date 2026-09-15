/**
 * Driving a relationship backwards (§9, §20).
 *
 * The dual model makes the geometry side non-directional on purpose: a distance
 * between two lines is a statement, not an instruction, so the solver will move
 * either line to honour it and dragging works from both ends already. The
 * ARITHMETIC side is directed and has to be — `Width = Count * Pitch` is an
 * assignment, and a cycle in it is not a design, it is a contradiction.
 *
 * That leaves one asymmetry a draftsman runs into constantly. A derived value is
 * a number on the drawing like any other, and it is the one they usually want to
 * type: the clear span is derived from the overall width and the walls, and the
 * clear span is what the brief specifies. Today typing into it does nothing,
 * because it is downstream. So the drawing forces them to work out the upstream
 * number by hand — arithmetic the machine is better at, and the exact arithmetic
 * the machine already knows how to do, only in the other direction.
 *
 * This inverts it. Not by rewriting the formula or flipping who drives whom —
 * that is how you get algebraic loops and a graph nobody can read — but by
 * asking a narrower and entirely safe question:
 *
 *     which single upstream value, changed to what, makes this come out right?
 *
 * The DAG is untouched. `Width` still drives `ClearSpan` afterwards exactly as
 * before; one input simply holds a different number. Nothing can cycle, because
 * nothing is re-pointed.
 *
 * The search is numerical rather than symbolic, and that is deliberate. A
 * symbolic inverter has to be taught every operator and fails silently on the
 * first one it does not know. A bracketed root find works on any expression the
 * evaluator can evaluate, reports honestly when there is no solution in range,
 * and cannot be fooled by an expression shape nobody anticipated.
 */

import { AuthoringSketch, SketchParameter } from "./types";
import { dependenciesOf, evaluateParameters } from "./parameters";

export interface InversionOption {
  /** The upstream value that would move. */
  parameter: string;
  /** Where it is now. */
  from: number;
  /** Where it would go. */
  to: number;
  /**
   * How much the derived value moves per unit of this one, at the current point.
   *
   * Worth showing: a sensitivity of 2 means every millimetre here is two there,
   * which is the difference between "nudge it" and "that will move everything".
   */
  sensitivity: number;
  /** Why this one can be moved, or is worth moving, in a phrase. */
  note: string;
}

export interface InversionReport {
  /** The derived parameter the author typed into. */
  target: string;
  requested: number;
  current: number;
  options: InversionOption[];
  /** Set when nothing upstream can produce the requested value. */
  refused?: string;
}

/** Upstream values the author is allowed to move: driving ones they own. */
function movableInputs(sketch: AuthoringSketch, target: string): string[] {
  const p = sketch.parameters[target];
  if (!p || p.role !== "DERIVED" || !p.expr) return [];

  // Direct dependencies only, and only the ones the author sets by hand.
  //
  // Reaching further upstream is possible and is the wrong thing to offer: the
  // author asked about THIS number, and an option that silently moves something
  // three formulas away is a change they did not ask to review. A chain is
  // walked one link at a time, by choosing again.
  return dependenciesOf(p.expr).filter((name) => {
    const dep = sketch.parameters[name];
    return Boolean(dep) && (dep.role === "DRIVING" || dep.role === "FIXED");
  });
}

/** Evaluates the whole DAG with one input overridden. */
function evaluateWith(
  sketch: AuthoringSketch,
  input: string,
  value: number,
  target: string
): number | null {
  const parameters: Record<string, SketchParameter> = {
    ...sketch.parameters,
    [input]: { ...sketch.parameters[input], value },
  };
  const { values, errors } = evaluateParameters(parameters);
  if (errors.some((e) => e.parameter === target)) return null;
  const v = values[target];
  return Number.isFinite(v) ? v : null;
}

/**
 * Solves `target(input) = requested` for one input.
 *
 * Expand-then-bisect. The expansion finds a bracket by doubling outwards from
 * the current value, which handles expressions that grow slowly without assuming
 * anything about their shape; bisection then converges on it. Fifty halvings is
 * far more than double precision can use, and the loop leaves early the moment
 * the answer stops improving.
 *
 * A non-monotonic expression may have several answers. The one nearest where the
 * author already was is returned, because that is the edit they are most likely
 * to have meant and the one that disturbs the drawing least.
 */
export function solveForInput(
  sketch: AuthoringSketch,
  target: string,
  requested: number,
  input: string,
  tolerance = 1e-9
): number | null {
  const start = sketch.parameters[input]?.value;
  if (start === undefined) return null;

  const f = (v: number) => {
    const out = evaluateWith(sketch, input, v, target);
    return out === null ? null : out - requested;
  };

  const f0 = f(start);
  if (f0 === null) return null;
  if (Math.abs(f0) <= tolerance) return start;

  // Bracket by stepping outwards, both ways, at a scale set by the value itself.
  const unit = Math.max(1, Math.abs(start)) * 1e-3;
  let lo = start;
  let hi = start;
  let flo = f0;
  let fhi = f0;
  let step = unit;

  for (let i = 0; i < 200; i++) {
    hi = start + step;
    const fh = f(hi);
    if (fh !== null && Math.sign(fh) !== Math.sign(f0)) {
      flo = f0;
      lo = start;
      fhi = fh;
      break;
    }
    lo = start - step;
    const fl = f(lo);
    if (fl !== null && Math.sign(fl) !== Math.sign(f0)) {
      flo = fl;
      hi = start;
      fhi = f0;
      break;
    }
    step *= 2;
    if (step > 1e12) return null; // no sign change anywhere sensible
    lo = start;
    hi = start;
  }

  if (Math.sign(flo) === Math.sign(fhi)) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === null) return null;
    if (Math.abs(fm) <= tolerance || Math.abs(hi - lo) <= Math.abs(mid) * 1e-15) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
      fhi = fm;
    }
  }
  return (lo + hi) / 2;
}

/** d(target)/d(input) at the current point, by a symmetric difference. */
function sensitivityOf(sketch: AuthoringSketch, target: string, input: string): number {
  const v = sketch.parameters[input].value;
  const h = Math.max(1e-4, Math.abs(v) * 1e-6);
  const up = evaluateWith(sketch, input, v + h, target);
  const down = evaluateWith(sketch, input, v - h, target);
  if (up === null || down === null) return 0;
  return (up - down) / (2 * h);
}

/**
 * What the author could change to make a derived value read what they typed.
 *
 * Ordered by how little the drawing has to move: the input with the largest
 * sensitivity reaches the answer with the smallest change to itself, and a small
 * change to one number is nearly always the edit that was meant.
 */
export function inversionOptions(
  sketch: AuthoringSketch,
  target: string,
  requested: number
): InversionReport {
  const p = sketch.parameters[target];
  const current = p?.value ?? 0;
  const base: InversionReport = { target, requested, current, options: [] };

  if (!p) return { ...base, refused: `There is no value called ${target}.` };
  if (p.role !== "DERIVED" || !p.expr) {
    return { ...base, refused: `${target} is not worked out from anything — type into it directly.` };
  }

  const inputs = movableInputs(sketch, target);
  if (inputs.length === 0) {
    return {
      ...base,
      refused: `${target} is worked out from ${
        dependenciesOf(p.expr).join(", ") || "nothing"
      }, and none of those is a value you set by hand. Change one of those first.`,
    };
  }

  const options: InversionOption[] = [];
  for (const input of inputs) {
    const sensitivity = sensitivityOf(sketch, target, input);
    if (Math.abs(sensitivity) < 1e-12) continue; // target does not respond to it

    const to = solveForInput(sketch, target, requested, input);
    if (to === null || !Number.isFinite(to)) continue;

    const dep = sketch.parameters[input];
    if (dep.min !== undefined && to < dep.min) continue;
    if (dep.max !== undefined && to > dep.max) continue;
    // A count is a topology change, not a dial; nudging it to 3.47 is nonsense.
    if (dep.type === "COUNT" && Math.abs(to - Math.round(to)) > 1e-9) continue;

    options.push({
      parameter: input,
      from: dep.value,
      to,
      sensitivity,
      note:
        Math.abs(sensitivity - 1) < 1e-9
          ? "one for one"
          : `${Math.abs(sensitivity).toFixed(2)} mm of ${target} per mm of ${input}`,
    });
  }

  if (options.length === 0) {
    return {
      ...base,
      refused: `Nothing upstream of ${target} can bring it to ${requested}. Its inputs either do not affect it, or would have to go outside the limits set on them.`,
    };
  }

  // Smallest move first: largest sensitivity reaches the answer with least change.
  options.sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity));
  return { ...base, options };
}

/** Applies one option. The DAG is unchanged; one input holds a new number. */
export function applyInversion(
  sketch: AuthoringSketch,
  option: InversionOption
): AuthoringSketch {
  return {
    ...sketch,
    parameters: {
      ...sketch.parameters,
      [option.parameter]: { ...sketch.parameters[option.parameter], value: option.to },
    },
  };
}

/**
 * The chain of reasons a value is what it is.
 *
 * When an edit is refused, "that cannot hold" is true and useless; what a
 * draftsman needs is the path from the number they typed to the thing that
 * actually decides it. Walking the DAG upwards gives exactly that, and stopping
 * at driving values gives it a natural end — those are the ones they can change.
 */
export function explainChain(sketch: AuthoringSketch, name: string, depth = 0): string[] {
  const p = sketch.parameters[name];
  if (!p || depth > 8) return [];
  if (p.role !== "DERIVED" || !p.expr) {
    return [`${name} is ${p ? p.value.toFixed(1) : "?"}, set by hand`];
  }

  const lines = [`${name} = ${p.expr}`];
  for (const dep of dependenciesOf(p.expr)) {
    for (const line of explainChain(sketch, dep, depth + 1)) {
      lines.push(`  ${line}`);
    }
  }
  return lines;
}
