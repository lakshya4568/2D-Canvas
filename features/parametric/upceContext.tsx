"use client";

/**
 * The authoring session.
 *
 * §29 of the repair brief forbids dead UI paths: every visible control must run
 * a real core operation and mutate the real model. This context is the single
 * place where that wiring lives, so a reviewer can read one file and see that
 * every button below reaches `lib/upce`.
 *
 * It deliberately owns its own state rather than growing the drafting reducer:
 * the drafting reducer's job is where the pen went, this one's job is what the
 * drawing MEANS. When the solver moves geometry, this dispatches the result
 * back as `APPLY_SOLVED_SHAPES` — coordinates that have already been through
 * the solver, the topology check and the invariant report.
 */

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { Shape } from "@/lib/geometry/types";
import {
  AuthoringSketch,
  ConstraintCandidate,
  DerivedCandidate,
  SketchConstraint,
  SketchParameter,
  ParameterRole,
  emptySketch,
} from "@/lib/upce/types";
import { regenerate, namesOf, addConstraint, removeConstraint } from "@/lib/upce/document";
import { detectCandidates } from "@/lib/upce/detect";
import { suggestCompletion, applyAction, CompletionReport, IntentAction } from "@/lib/upce/completion";
import { proposeDerived, acceptDerived } from "@/lib/upce/derive";
import { analyseDof, DofReport } from "@/lib/upce/dof";
import { assessReadiness, publish, buildManifest, ReadinessReport, TemplateManifest } from "@/lib/upce/template";
import { createComponent, createRepeat, RepeatDraft } from "@/lib/upce/repeat";
import { dependentsOf, validateExpression, uniqueParameterName, makeProvenance } from "@/lib/upce/parameters";
import { measurablesIn, nameMeasurement, linkParameter, unlinkParameter, Measurable, MeasureMode } from "@/lib/upce/link";
import type { InvariantCheck } from "@/lib/upce/solve";

export type AuthoringStage =
  | "drawing"
  | "analysed"
  | "constraining"
  | "template-ready"
  | "published";

export interface Notice {
  kind: "ok" | "warn" | "error" | "info";
  text: string;
}

interface UpceState {
  sketch: AuthoringSketch;
  started: boolean;
  stage: AuthoringStage;
  dof: DofReport | null;
  candidates: ConstraintCandidate[];
  dismissed: string[];
  derived: DerivedCandidate[];
  completion: CompletionReport | null;
  readiness: ReadinessReport | null;
  invariants: InvariantCheck[];
  notice: Notice | null;
  busy: boolean;
  /** Intent-level undo. Separate from the drafting history. */
  past: AuthoringSketch[];
}

const initial: UpceState = {
  sketch: emptySketch(),
  started: false,
  stage: "drawing",
  dof: null,
  candidates: [],
  dismissed: [],
  derived: [],
  completion: null,
  readiness: null,
  invariants: [],
  notice: null,
  busy: false,
  past: [],
};

interface UpceContextValue extends UpceState {
  /**
   * Rebuilt from the live sketch on every render rather than stored.
   *
   * Publishing decides WHICH values a project engineer may change; it must not
   * freeze WHAT those values currently are. Snapshotting the manifest at publish
   * time made the user-mode form read back the published defaults for ever, so
   * typing a new number appeared to do nothing even though the geometry behind
   * it had moved.
   */
  manifest: TemplateManifest | null;
  names: Record<string, string>;
  analyse: () => void;
  acceptCandidate: (id: string) => void;
  rejectCandidate: (id: string) => void;
  applyIntent: (action: IntentAction) => void;
  refreshDerived: () => void;
  acceptDerivedCandidate: (id: string) => void;
  rejectDerivedCandidate: (id: string) => void;
  setParameterValue: (name: string, value: number) => void;
  updateParameter: (name: string, patch: Partial<SketchParameter>) => void;
  renameParameter: (from: string, to: string) => void;
  createDerivedParameter: (name: string, expr: string) => void;
  /** Everything the given shapes can be measured as, for the relationship editor. */
  measurablesFor: (shapeIds: string[]) => Measurable[];
  nameMeasurementAs: (target: Measurable, name: string, mode: MeasureMode) => void;
  linkValue: (name: string, expr: string) => void;
  unlinkValue: (name: string) => void;
  deleteConstraint: (id: string) => void;
  toggleConstraint: (id: string) => void;
  makeComponent: (name: string, shapeIds: string[]) => void;
  makeRepeat: (draft: RepeatDraft) => void;
  setIntentionalFreedom: (value: boolean) => void;
  setTemplateName: (name: string) => void;
  checkReadiness: () => void;
  publishTemplate: () => void;
  dependentsFor: (name: string) => string[];
  undoIntent: () => void;
  canUndoIntent: boolean;
  dismissNotice: () => void;
}

const Ctx = React.createContext<UpceContextValue | null>(null);

/** How long the drawing must sit still before the solver is asked about it. */
const SETTLE_MS = 120;

export function UpceProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useDrawing();
  const [s, setS] = React.useState<UpceState>(initial);

  // Shapes the author drew, with any repeat-generated copies excluded: those are
  // regenerated from the rule, never treated as source geometry.
  const authored = React.useMemo(
    () => state.shapes.filter((sh) => !sh.id.includes("#")),
    [state.shapes]
  );
  const names = React.useMemo(() => namesOf(state.shapes), [state.shapes]);

  const push = React.useCallback((next: Partial<UpceState>, remember?: AuthoringSketch) => {
    setS((prev) => ({
      ...prev,
      ...next,
      past: remember ? [...prev.past.slice(-49), remember] : prev.past,
    }));
  }, []);

  /**
   * The one path that changes geometry. Solve, then either commit the solved
   * coordinates to the drawing or report why the edit was refused — never both,
   * and never a partial result.
   */
  const commit = React.useCallback(
    (nextSketch: AuthoringSketch, description: string, remember?: AuthoringSketch) => {
      const result = regenerate(authored, nextSketch, { shapeNames: names });

      if (result.rejection) {
        push({
          notice: { kind: "error", text: result.rejection },
          invariants: result.invariants,
        });
        return false;
      }

      dispatch({ type: "APPLY_SOLVED_SHAPES", shapes: result.shapes, description });

      const parameterProblems = result.parameterErrors.map((e) => `${e.parameter}: ${e.message}`);
      push(
        {
          sketch: result.sketch,
          dof: result.dof,
          invariants: result.invariants,
          readiness: null,
          notice:
            parameterProblems.length > 0
              ? { kind: "error", text: parameterProblems.join(" ") }
              : result.droppedConstraintIds.length > 0
                ? {
                    kind: "warn",
                    text: `${result.droppedConstraintIds.length} rule(s) were dropped because the geometry they referred to is gone.`,
                  }
                : { kind: "ok", text: description },
          stage: result.dof.dof === 0 ? "constraining" : "constraining",
        },
        remember
      );
      return true;
    },
    [authored, names, dispatch, push]
  );

  /**
   * The drawing moved; catch the model up and let the solver answer.
   *
   * Everything the authoring panels do runs `commit`, where intent changes first
   * and the geometry follows. A drag runs the other way: the canvas writes new
   * coordinates straight into the drafting reducer, and until this existed the
   * authoring sketch never heard about it. Two visible consequences, both of
   * which look like separate bugs and are not:
   *
   *   - constraint glyphs and dimension badges are positioned from the sketch's
   *     points, so they stayed behind at the old location while the shape moved
   *     away from underneath them;
   *   - a `fix` rule is enforced by the solver, and the solver was never asked,
   *     so a pinned shape could be dragged anywhere with nothing to stop it.
   *
   * Re-lowering with `source: "geometry"` puts the new coordinates in as the
   * starting point and keeps the accepted intent, so the solve either accepts
   * the move or pulls the geometry back to where the rules require it.
   */
  const syncFromGeometry = React.useCallback(() => {
    if (!s.started || s.busy) return;

    const result = regenerate(authored, s.sketch, { shapeNames: names, source: "geometry" });

    if (result.rejection) {
      dispatch({ type: "APPLY_SOLVED_SHAPES", shapes: result.shapes, description: "Edit refused" });
      setS((prev) => ({
        ...prev,
        invariants: result.invariants,
        notice: { kind: "error", text: `That edit was put back: ${result.rejection}` },
      }));
      return;
    }

    // Only write back when the solver actually disagreed with the drag. A move
    // the rules are happy with must not turn into a second undo step.
    const held = result.movedShapeIds;
    if (held.length > 0) {
      dispatch({
        type: "APPLY_SOLVED_SHAPES",
        shapes: result.shapes,
        description: "Held by the rules",
      });
    }

    setS((prev) => ({
      ...prev,
      sketch: result.sketch,
      dof: result.dof,
      invariants: result.invariants,
      // Behaviour was verified against the geometry that has just changed.
      readiness: null,
      notice:
        held.length > 0
          ? {
              kind: "warn",
              text: `${held
                .map((id) => names[id] ?? id)
                .slice(0, 3)
                .join(", ")} could not stay where it was put — a rule holds it. Remove or suppress that rule in "Rules in force" to move it freely.`,
            }
          : prev.notice,
    }));
  }, [s.started, s.busy, s.sketch, authored, names, dispatch]);

  /**
   * Debounced so the solve happens once per gesture, not once per frame.
   *
   * The canvas dispatches new coordinates on every pointer move; §34 forbids
   * running full-document analysis at that rate. Waiting for the drawing to sit
   * still costs a few frames of glyph lag during a drag and one solve at the end
   * of it. The ref indirection keeps the timer from re-arming just because the
   * callback's identity changed on an unrelated render.
   */
  const syncRef = React.useRef(syncFromGeometry);
  syncRef.current = syncFromGeometry;
  const syncedRevision = React.useRef(state.geometryRevision);

  React.useEffect(() => {
    if (!s.started) {
      // Nothing to catch up to yet: the sketch starts at the first Analyse.
      syncedRevision.current = state.geometryRevision;
      return;
    }
    if (state.geometryRevision === syncedRevision.current) return;

    const revision = state.geometryRevision;
    const timer = setTimeout(() => {
      syncedRevision.current = revision;
      syncRef.current();
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [state.geometryRevision, s.started]);

  const analyse = React.useCallback(() => {
    // Always carry the current sketch forward, even on the first run.
    //
    // Starting fresh here used to throw away anything the author had already
    // done before pressing Analyse — most visibly a component they had just
    // grouped and named, which then reverted to "Profile A" in every sentence
    // the panel produced. `rebuildSketch` merges an empty sketch to nothing, so
    // there is no case that needs the fresh start.
    const result = regenerate(authored, s.sketch, { shapeNames: names, source: "geometry" });
    const working = result.rejection ? s.sketch : result.sketch;

    const candidates = detectCandidates(working, { shapeNames: names }).filter(
      (c) => !s.dismissed.includes(c.id)
    );
    const completion = suggestCompletion(working, names);

    if (!result.rejection) {
      dispatch({ type: "APPLY_SOLVED_SHAPES", shapes: result.shapes, description: "Analyse geometry" });
    }

    setS((prev) => ({
      ...prev,
      sketch: working,
      started: true,
      stage: "analysed",
      dof: result.dof,
      candidates,
      completion,
      invariants: result.invariants,
      readiness: null,
      notice:
        result.notes.length > 0
          ? { kind: "info", text: result.notes[0] }
          : {
              kind: "info",
              text: `${candidates.length} relationship${candidates.length === 1 ? "" : "s"} detected · ${result.dof.dof} degree${result.dof.dof === 1 ? "" : "s"} of freedom remain`,
            },
    }));
  }, [s.started, s.sketch, s.dismissed, authored, names, dispatch]);

  const reanalyse = React.useCallback(
    (sketch: AuthoringSketch) => {
      setS((prev) => ({
        ...prev,
        candidates: detectCandidates(sketch, { shapeNames: names }).filter(
          (c) => !prev.dismissed.includes(c.id)
        ),
        completion: suggestCompletion(sketch, names),
      }));
    },
    [names]
  );

  const acceptCandidate = React.useCallback(
    (id: string) => {
      const cand = s.candidates.find((c) => c.id === id);
      if (!cand) return;
      const before = s.sketch;
      const next = addConstraint(s.sketch, cand.constraint, `c_${id}`);
      if (commit(next, `Accepted: ${cand.headline}`, before)) {
        reanalyse(next);
      }
    },
    [s.candidates, s.sketch, commit, reanalyse]
  );

  const rejectCandidate = React.useCallback((id: string) => {
    setS((prev) => ({
      ...prev,
      dismissed: [...prev.dismissed, id],
      candidates: prev.candidates.filter((c) => c.id !== id),
    }));
  }, []);

  const applyIntent = React.useCallback(
    (action: IntentAction) => {
      if (action.isDeliberateFreedom) {
        setS((prev) => ({
          ...prev,
          sketch: { ...prev.sketch, meta: { ...prev.sketch.meta, freedomIsIntentional: true } },
          completion: suggestCompletion(prev.sketch, names),
          notice: { kind: "info", text: `Recorded: ${action.title.toLowerCase()}.` },
        }));
        return;
      }
      const before = s.sketch;
      const next = applyAction(s.sketch, action);
      if (commit(next, action.title, before)) reanalyse(next);
    },
    [s.sketch, commit, reanalyse, names]
  );

  const refreshDerived = React.useCallback(() => {
    setS((prev) => ({ ...prev, busy: true }));
    // Deliberately synchronous: the sweep re-solves the sketch several times and
    // §34 puts that at an authoring checkpoint, not on the interaction path.
    const derived = proposeDerived(s.sketch, authored, { shapeNames: names });
    setS((prev) => ({
      ...prev,
      derived,
      busy: false,
      notice: {
        kind: "info",
        text:
          derived.length === 0
            ? "No derived value survived the perturbation test. Nothing is being suggested."
            : `${derived.length} relationship${derived.length === 1 ? "" : "s"} held under every perturbation.`,
      },
    }));
  }, [s.sketch, authored, names]);

  const acceptDerivedCandidate = React.useCallback(
    (id: string) => {
      const cand = s.derived.find((d) => d.id === id);
      if (!cand) return;
      const before = s.sketch;
      const next = acceptDerived(s.sketch, cand);
      if (commit(next, `Added derived value ${cand.name}`, before)) {
        setS((prev) => ({ ...prev, derived: prev.derived.filter((d) => d.id !== id) }));
      }
    },
    [s.derived, s.sketch, commit]
  );

  const rejectDerivedCandidate = React.useCallback((id: string) => {
    setS((prev) => ({ ...prev, derived: prev.derived.filter((d) => d.id !== id) }));
  }, []);

  const setParameterValue = React.useCallback(
    (name: string, value: number) => {
      const p = s.sketch.parameters[name];
      if (!p) return;
      // Bounds are advisory, not a gate. §26: a value outside a standards range
      // turns the field amber and cites the clause; only a value the geometry
      // physically cannot take is refused, and that refusal comes from the
      // solver's own topology check rather than from a range comparison here.
      const before = s.sketch;
      const next: AuthoringSketch = {
        ...s.sketch,
        parameters: { ...s.sketch.parameters, [name]: { ...p, value } },
      };
      commit(next, `${name} = ${value}`, before);
    },
    [s.sketch, commit, push]
  );

  const updateParameter = React.useCallback(
    (name: string, patch: Partial<SketchParameter>) => {
      // Built from the LATEST state, not from the sketch captured when this
      // callback was created. Two edits in quick succession — setting a min and
      // then a max, or ticking two "show to users" boxes — would otherwise both
      // start from the same snapshot and the first would be silently lost.
      setS((prev) => {
        const p = prev.sketch.parameters[name];
        if (!p) return prev;
        return {
          ...prev,
          sketch: {
            ...prev.sketch,
            parameters: { ...prev.sketch.parameters, [name]: { ...p, ...patch } },
          },
          readiness: null,
        };
      });
    },
    []
  );

  const renameParameter = React.useCallback(
    (from: string, to: string) => {
      const p = s.sketch.parameters[from];
      if (!p || !to || from === to) return;
      const clean = uniqueParameterName(to, s.sketch.parameters);
      const parameters: Record<string, SketchParameter> = {};
      for (const [k, v] of Object.entries(s.sketch.parameters)) {
        if (k === from) continue;
        parameters[k] = v.expr
          ? { ...v, expr: v.expr.replace(new RegExp(`\\b${from}\\b`, "g"), clean) }
          : v;
      }
      parameters[clean] = { ...p, name: clean };
      const constraints = s.sketch.constraints.map((c) =>
        c.paramRef === from ? { ...c, paramRef: clean, label: c.label.replace(from, clean) } : c
      );
      const repeats = s.sketch.repeats.map((r) => ({
        ...r,
        countParam: r.countParam === from ? clean : r.countParam,
        spacingParam: r.spacingParam === from ? clean : r.spacingParam,
      }));
      const next = { ...s.sketch, parameters, constraints, repeats };
      commit(next, `Renamed ${from} to ${clean}`, s.sketch);
    },
    [s.sketch, commit]
  );

  const createDerivedParameter = React.useCallback(
    (name: string, expr: string) => {
      const existing = s.sketch.parameters[name];
      const targetName = existing ? name : uniqueParameterName(name, s.sketch.parameters);
      const check = validateExpression(expr, targetName, s.sketch.parameters);
      if (!check.ok) {
        push({ notice: { kind: "error", text: check.message ?? "That expression is not valid." } });
        return;
      }
      const before = s.sketch;
      const next: AuthoringSketch = {
        ...s.sketch,
        parameters: {
          ...s.sketch.parameters,
          [targetName]: {
            ...(existing ?? {
              name: targetName,
              type: "LENGTH",
              unit: "mm",
              value: 0,
              boundConstraints: [],
              published: false,
              uiGroup: "Derived",
            }),
            role: "DERIVED",
            expr,
            dependencies: check.dependencies,
            provenance: makeProvenance("user", `Written by the author as ${targetName} = ${expr}.`),
          },
        },
      };
      commit(next, existing ? `Updated ${targetName} = ${expr}` : `Added ${targetName}`, before);
    },
    [s.sketch, commit, push]
  );

  /**
   * Step one of a relationship the drawing gives no evidence for: give the
   * thing a name. Until a measurement is a named value there is nothing an
   * expression can refer to, which is what made the formula box unusable for
   * two shapes that share no constraint.
   */
  const measurablesFor = React.useCallback(
    (shapeIds: string[]) => measurablesIn(s.sketch, shapeIds, names),
    [s.sketch, names]
  );

  const nameMeasurementAs = React.useCallback(
    (target: Measurable, name: string, mode: MeasureMode) => {
      const { sketch: next, refused } = nameMeasurement(s.sketch, target, name, mode);
      if (refused) {
        push({ notice: { kind: "error", text: refused } });
        return;
      }
      if (commit(next, `Named ${target.label}`, s.sketch)) reanalyse(next);
    },
    [s.sketch, commit, push, reanalyse]
  );

  /** Step two: make one named value follow the others. */
  const linkValue = React.useCallback(
    (name: string, expr: string) => {
      const { sketch: next, refused } = linkParameter(s.sketch, name, expr);
      if (refused) {
        push({ notice: { kind: "error", text: refused } });
        return;
      }
      commit(next, `${name} now follows ${expr}`, s.sketch);
    },
    [s.sketch, commit, push]
  );

  const unlinkValue = React.useCallback(
    (name: string) => {
      const { sketch: next, refused } = unlinkParameter(s.sketch, name);
      if (refused) {
        push({ notice: { kind: "error", text: refused } });
        return;
      }
      commit(next, `${name} is typed again`, s.sketch);
    },
    [s.sketch, commit, push]
  );

  const deleteConstraint = React.useCallback(
    (id: string) => {
      const { sketch: next, refused, removedParameters } = removeConstraint(s.sketch, id);
      if (refused) {
        push({ notice: { kind: "error", text: refused } });
        return;
      }
      const description =
        removedParameters && removedParameters.length > 0
          ? `Removed a rule, and ${removedParameters.join(", ")} with it`
          : "Removed a rule";
      if (commit(next, description, s.sketch)) reanalyse(next);
    },
    [s.sketch, commit, push, reanalyse]
  );

  const toggleConstraint = React.useCallback(
    (id: string) => {
      const target = s.sketch.constraints.find((c) => c.id === id);
      if (!target) return;
      if (target.strength === "fact") {
        push({
          notice: {
            kind: "error",
            text: "That is part of what the shape is, not a rule added on top, so it cannot be switched off.",
          },
        });
        return;
      }
      const next: AuthoringSketch = {
        ...s.sketch,
        constraints: s.sketch.constraints.map((c) =>
          c.id === id ? { ...c, state: c.state === "suppressed" ? "active" : "suppressed" } : c
        ),
      };
      if (commit(next, target.state === "suppressed" ? "Re-enabled a rule" : "Switched off a rule", s.sketch)) {
        reanalyse(next);
      }
    },
    [s.sketch, commit, push, reanalyse]
  );

  const makeComponent = React.useCallback(
    (name: string, shapeIds: string[]) => {
      if (shapeIds.length === 0) {
        push({ notice: { kind: "warn", text: "Select the geometry that makes up one unit first." } });
        return;
      }
      const { sketch: next } = createComponent(s.sketch, authored, shapeIds, name);
      setS((prev) => ({
        ...prev,
        sketch: next,
        past: [...prev.past, prev.sketch],
        notice: { kind: "ok", text: `"${name}" is now a reusable unit.` },
      }));
    },
    [s.sketch, authored, push]
  );

  const makeRepeat = React.useCallback(
    (draft: RepeatDraft) => {
      const before = s.sketch;
      const { sketch: next } = createRepeat(s.sketch, draft);
      if (commit(next, "Created a repeat", before)) reanalyse(next);
    },
    [s.sketch, commit, reanalyse]
  );

  const setIntentionalFreedom = React.useCallback((value: boolean) => {
    setS((prev) => ({
      ...prev,
      sketch: { ...prev.sketch, meta: { ...prev.sketch.meta, freedomIsIntentional: value } },
      readiness: null,
    }));
  }, []);

  const setTemplateName = React.useCallback((name: string) => {
    setS((prev) => ({ ...prev, sketch: { ...prev.sketch, meta: { ...prev.sketch.meta, name } } }));
  }, []);

  const checkReadiness = React.useCallback(() => {
    setS((prev) => ({ ...prev, busy: true }));
    const readiness = assessReadiness(s.sketch, authored, { shapeNames: names });
    setS((prev) => ({
      ...prev,
      readiness,
      busy: false,
      stage: readiness.ready ? "template-ready" : prev.stage,
      notice: {
        kind: readiness.ready ? "ok" : "warn",
        text: readiness.ready
          ? "Every check passed. This drawing is ready to publish."
          : `${readiness.blockers.length} thing(s) still need attention.`,
      },
    }));
  }, [s.sketch, authored, names]);

  const publishTemplate = React.useCallback(() => {
    const result = publish(s.sketch, authored, { shapeNames: names });
    if (!result.manifest) {
      setS((prev) => ({
        ...prev,
        readiness: result.report,
        notice: { kind: "error", text: result.report.blockers[0] ?? "Not ready to publish." },
      }));
      return;
    }
    setS((prev) => ({
      ...prev,
      sketch: result.sketch,
      readiness: result.report,
      stage: "published",
      notice: { kind: "ok", text: `Published "${result.manifest!.name}" v${result.manifest!.version}.` },
    }));
  }, [s.sketch, authored, names]);

  const undoIntent = React.useCallback(() => {
    const previous = s.past[s.past.length - 1];
    if (!previous) return;
    const result = regenerate(authored, previous, { shapeNames: names });
    if (!result.rejection) {
      dispatch({ type: "APPLY_SOLVED_SHAPES", shapes: result.shapes, description: "Undo design intent" });
    }
    setS((prev) => ({
      ...prev,
      sketch: result.rejection ? previous : result.sketch,
      dof: result.dof,
      invariants: result.invariants,
      past: prev.past.slice(0, -1),
      readiness: null,
      candidates: detectCandidates(previous, { shapeNames: names }).filter(
        (c) => !prev.dismissed.includes(c.id)
      ),
      completion: suggestCompletion(previous, names),
      notice: { kind: "info", text: "Stepped back one design decision." },
    }));
  }, [s.past, authored, names, dispatch]);

  const manifest = React.useMemo(
    () => (s.sketch.meta.publishedAt ? buildManifest(s.sketch, names) : null),
    [s.sketch, names]
  );

  const value: UpceContextValue = {
    ...s,
    manifest,
    names,
    analyse,
    acceptCandidate,
    rejectCandidate,
    applyIntent,
    refreshDerived,
    acceptDerivedCandidate,
    rejectDerivedCandidate,
    setParameterValue,
    updateParameter,
    renameParameter,
    createDerivedParameter,
    measurablesFor,
    nameMeasurementAs,
    linkValue,
    unlinkValue,
    deleteConstraint,
    toggleConstraint,
    makeComponent,
    makeRepeat,
    setIntentionalFreedom,
    setTemplateName,
    checkReadiness,
    publishTemplate,
    dependentsFor: (name: string) => dependentsOf(name, s.sketch.parameters),
    undoIntent,
    canUndoIntent: s.past.length > 0,
    dismissNotice: () => setS((prev) => ({ ...prev, notice: null })),
  };

  // Exposed for end-to-end tests and for inspecting a live session from the
  // console. Read-only from the outside; every mutation still goes through the
  // callbacks above.
  if (typeof window !== "undefined") {
    (window as unknown as { __UPCE__?: UpceContextValue }).__UPCE__ = value;
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUpce(): UpceContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useUpce must be used inside UpceProvider");
  return ctx;
}

/** Convenience for panels that only need to read the live diagnosis. */
export function useLiveDof(): DofReport | null {
  return useUpce().dof;
}

export type { SketchConstraint, SketchParameter, ParameterRole, Shape };
export { analyseDof, buildManifest };
