/**
 * The one entry point the UI uses.
 *
 * §29 of the repair brief demands that every visible control trace through
 *
 *     UI -> handler -> command -> core operation -> model mutation
 *        -> solver / validation -> renderer
 *
 * with no fake paths. Keeping that traceable means the UI must not be able to
 * assemble its own pipeline out of kernel parts; there is exactly one function
 * that turns "the drawing plus the design intent" into "the drawing after the
 * solver has had its say", and every panel calls it.
 */

import { Shape } from "../geometry/types";
import { DEFAULT_TOLERANCE_POLICY, TolerancePolicy } from "../geometry/tolerance";
import { AuthoringSketch, SketchConstraint, emptySketch } from "./types";
import { rebuildSketch, liftSketchToShapes, constraintIsResolvable, isLowerable } from "./lower";
import { expandRepeats, isGeneratedShape } from "./repeat";
import { solveSketch, SolveOutcome, InvariantCheck, TopologyCheck } from "./solve";
import { analyseDof, DofReport } from "./dof";

export interface RegenerateResult {
  shapes: Shape[];
  sketch: AuthoringSketch;
  dof: DofReport;
  invariants: InvariantCheck[];
  topology: TopologyCheck;
  converged: boolean;
  maxResidual: number;
  /** Set when the whole edit was refused; `shapes` and `sketch` are then the ones you passed in. */
  rejection?: string;
  parameterErrors: { parameter: string; message: string }[];
  /** Constraints dropped because the geometry they referenced was deleted. */
  droppedConstraintIds: string[];
  notes: string[];
}

export interface RegenerateOptions {
  policy?: TolerancePolicy;
  shapeNames?: Record<string, string>;
  /** Skip the reject-on-failure gate. Used for live drag preview only. */
  preview?: boolean;
}

/** Display names for the DOF and candidate wording, taken from the drawing. */
export function namesOf(shapes: Shape[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of shapes) out[s.id] = s.name ?? s.id;
  return out;
}

/**
 * Rebuild -> expand repeats -> solve -> lift, in that order and only that order.
 *
 * Repeat expansion happens BEFORE the solve because a count is topology (§23.4):
 * the number of primitives has to be settled before there is a system to solve.
 */
export function regenerate(
  authoredShapes: Shape[],
  previous: AuthoringSketch,
  options: RegenerateOptions = {}
): RegenerateResult {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const names = options.shapeNames ?? namesOf(authoredShapes);

  // 1. Topology first — but from the unit AS IT NOW IS.
  //
  // `authoredShapes` still holds the coordinates the draftsman originally drew.
  // Expanding from those stamps out copies of a stale shape, and the solver then
  // has to drag each one into place from the wrong starting point. On a profile
  // with any freedom in it — a haunch whose angle is implied rather than stated —
  // that is enough for a copy to settle on the MIRRORED solution: congruent, and
  // visibly wrong, with one cell's chamfers leaning the other way (§31.2).
  //
  // Lifting the previous solve back onto the shapes first means every copy starts
  // as an exact translation of the current unit and stays on its branch.
  const current = liftSketchToShapes(previous, authoredShapes, policy).shapes;
  const expansion = expandRepeats(current, previous);

  // 2. Lower the drawing into primitives, carrying the previous intent forward.
  const { sketch: rebuilt, droppedConstraintIds } = rebuildSketch(expansion.shapes, previous, policy);

  // 3. Add the constraints that only exist because of a repeat rule.
  const withRepeatRows: AuthoringSketch = {
    ...rebuilt,
    constraints: [
      ...rebuilt.constraints,
      ...expansion.constraints.filter((c) => constraintIsResolvable(c, rebuilt)),
    ],
  };

  // 4. Solve, with the whole invariant/topology gate behind it.
  const outcome: SolveOutcome = solveSketch(withRepeatRows, { policy, preview: options.preview });

  if (!outcome.ok) {
    return {
      shapes: authoredShapes,
      sketch: previous,
      dof: analyseDof(previous, names, policy),
      invariants: outcome.invariants,
      topology: outcome.topology,
      converged: outcome.converged,
      maxResidual: outcome.maxResidual,
      rejection: outcome.rejection,
      parameterErrors: outcome.parameterErrors,
      droppedConstraintIds,
      notes: expansion.notes,
    };
  }

  // 5. Back into the drawing.
  const lifted = liftSketchToShapes(outcome.sketch, expansion.shapes, policy);

  return {
    shapes: lifted.shapes,
    sketch: outcome.sketch,
    dof: analyseDof(outcome.sketch, names, policy),
    invariants: outcome.invariants,
    topology: outcome.topology,
    converged: outcome.converged,
    maxResidual: outcome.maxResidual,
    parameterErrors: outcome.parameterErrors,
    droppedConstraintIds,
    notes: [...expansion.notes, ...lifted.issues.map((i) => i.message)],
  };
}

/**
 * First entry into authoring: lower the current drawing with no prior intent.
 * Constraints created here are only the shapes' own geometric facts.
 */
export function startAuthoring(
  shapes: Shape[],
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): { sketch: AuthoringSketch; unsupported: string[] } {
  const { sketch } = rebuildSketch(shapes, undefined, policy);
  const unsupported = shapes.filter((s) => !isLowerable(s)).map((s) => s.name ?? s.id);
  return { sketch, unsupported };
}

/** Adds an author-asserted constraint without touching anything else. */
export function addConstraint(
  sketch: AuthoringSketch,
  constraint: Omit<SketchConstraint, "id">,
  id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
): AuthoringSketch {
  const next = { ...sketch, constraints: [...sketch.constraints, { ...constraint, id }] };
  if (constraint.paramRef && next.parameters[constraint.paramRef]) {
    next.parameters = {
      ...next.parameters,
      [constraint.paramRef]: {
        ...next.parameters[constraint.paramRef],
        boundConstraints: [...next.parameters[constraint.paramRef].boundConstraints, id],
      },
    };
  }
  return next;
}

/** Removes a constraint. Geometric facts are refused, with a reason. */
export function removeConstraint(
  sketch: AuthoringSketch,
  id: string
): { sketch: AuthoringSketch; refused?: string; removedParameters?: string[] } {
  const target = sketch.constraints.find((c) => c.id === id);
  if (!target) return { sketch };
  if (target.strength === "fact") {
    return {
      sketch,
      refused:
        "That is part of what the shape is, not a rule added on top. Explode the shape into separate lines if you need its corners to move freely.",
    };
  }
  const constraints = sketch.constraints.filter((c) => c.id !== id);
  const parameters = { ...sketch.parameters };
  const removed: string[] = [];

  for (const [name, p] of Object.entries(parameters)) {
    if (!p.boundConstraints.includes(id)) continue;
    const remaining = p.boundConstraints.filter((c) => c !== id);
    // A driving value that no longer drives anything is exactly the kind of
    // unexplained entry the inspector is supposed to make impossible. If nothing
    // else reads it either, it goes with the rule it belonged to.
    const readByFormula = Object.values(parameters).some(
      (other) => other.name !== name && other.role === "DERIVED" && (other.expr ?? "").includes(name)
    );
    const usedByRepeat = sketch.repeats.some(
      (r) => r.countParam === name || r.spacingParam === name
    );
    if (remaining.length === 0 && !readByFormula && !usedByRepeat) {
      delete parameters[name];
      removed.push(name);
    } else {
      parameters[name] = { ...p, boundConstraints: remaining };
    }
  }

  return { sketch: { ...sketch, constraints, parameters }, removedParameters: removed };
}

/** Shapes the author actually drew, with repeat-generated copies filtered out. */
export function authoredOnly(shapes: Shape[]): Shape[] {
  return shapes.filter((s) => !isGeneratedShape(s.id));
}

export const emptyAuthoringSketch = emptySketch;
