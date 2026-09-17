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
import { DEFAULT_TOLERANCE_POLICY } from "@/lib/geometry/tolerance";
import {
  AuthoringSketch,
  ConstraintCandidate,
  DerivedCandidate,
  SketchConstraint,
  SketchParameter,
  ParameterRole,
  emptySketch,
} from "@/lib/upce/types";
import { rebuildSketch } from "@/lib/upce/lower";
import { regenerate, namesOf, addConstraint, removeConstraint, authoredOnly } from "@/lib/upce/document";
import { detectCandidates } from "@/lib/upce/detect";
import { suggestCompletion, applyAction, CompletionReport, IntentAction } from "@/lib/upce/completion";
import { proposeDerived, acceptDerived } from "@/lib/upce/derive";
import { analyseDof, DofReport } from "@/lib/upce/dof";
import { assessReadiness, publish, buildManifest, ReadinessReport, TemplateManifest } from "@/lib/upce/template";
import { createComponent, createRepeat, measureUnit, RepeatDraft, RepeatMeasurement, UnitMeasurement } from "@/lib/upce/repeat";
import { setComponentRigid, rigidConflict } from "@/lib/upce/rigid";
import type { OverlapPair, FusionSummary } from "@/lib/upce/fusion";
import {
  inversionOptions, applyInversion, explainChain,
  InversionReport, InversionOption,
} from "@/lib/upce/inverse";
import type { AdvisorResult, ReviewedSuggestion, SuggestionPlan } from "@/lib/ai/constraintAdvisor";
import { abstractSketch, planSuggestion } from "@/lib/ai/constraintAdvisor";
import { renameParameters } from "@/lib/upce/parameters";
import { describeDrawing, type QaTurn, type QaResult } from "@/lib/ai/drawingQa";
import { verifyProposedFormula } from "@/lib/upce/formulaCheck";
import { buildSystem } from "@/lib/upce/residuals";
import { dependentsOf, validateExpression, uniqueParameterName, makeProvenance } from "@/lib/upce/parameters";
import {
  measurablesIn, nameMeasurement, linkParameter, unlinkParameter,
  edgesIn, loopsIn, lineRelationOptions, relateLines, relateCentroids,
  shapesAtRisk, holdShapes,
  Measurable, MeasureMode, SelectableEdge, LineRelationKind, LineRelationOption,
} from "@/lib/upce/link";
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
  /** What each repeat rule measured off its unit on the last rebuild. */
  repeatMeasurements: RepeatMeasurement[];
  /**
   * Shapes a rule just created could deform, and the rule that could do it.
   *
   * Kept in state rather than only shown as a notice, because the remedy is one
   * click and the click needs to know which shapes to hold.
   */
  shapeRisk: { message: string; shapeIds: string[] } | null;
  /**
   * A derived value the author typed into, and what could produce that number.
   *
   * Held in state because it is a QUESTION, not an action: several inputs can
   * usually reach the same answer and only the author knows which one they meant
   * to change.
   */
  inversion: InversionReport | null;
  /** The assistant's last reading of the drawing, and whether it is switched on. */
  advisor: AdvisorResult | null;
  advisorStatus: { configured: boolean; model: string; detail: string } | null;
  advisorBusy: boolean;
  /**
   * The conversation about the drawing.
   *
   * Kept apart from `advisor` because the two produce different things: that one
   * produces changes to accept, this one produces sentences. Mixing them in one
   * list would invite accepting a sentence.
   */
  conversation: QaTurn[];
  /** Named values the last answer mentioned, with what they really are. */
  lastCitedValues: QaResult["citedValues"];
  askingBusy: boolean;
  askError: string | null;
  /** Solids currently standing in each other's way. */
  overlaps: OverlapPair[];
  /** The arranged planar map, when anything overlaps. */
  fusion: FusionSummary | null;
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
  shapeRisk: null,
  inversion: null,
  advisor: null,
  advisorStatus: null,
  advisorBusy: false,
  conversation: [],
  lastCitedValues: [],
  askingBusy: false,
  askError: null,
  repeatMeasurements: [],
  overlaps: [],
  fusion: null,
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
  /** Edges of the given shapes, for the line-to-line relation picker. */
  edgesFor: (shapeIds: string[]) => SelectableEdge[];
  /** Closed profiles of the given shapes, for the centre-to-centre relation. */
  loopsFor: (shapeIds: string[]) => Array<{ id: string; label: string; loop: string[] }>;
  relationOptionsFor: (segA: string, segB: string) => LineRelationOption[];
  relateTwoLines: (segA: string, segB: string, kind: LineRelationKind) => void;
  relateTwoCentres: (loopA: string[], loopB: string[], labelA: string, labelB: string) => void;
  /** Freeze the shapes a rule could deform, so it moves them instead. */
  holdShapesOf: (shapeIds: string[]) => void;
  /** Take one of the offered ways to make a derived value read what was typed. */
  applyInversionOption: (option: InversionOption) => void;
  dismissInversion: () => void;
  /** The chain of formulas a value came down, for a refusal that explains itself. */
  chainFor: (name: string) => string[];
  /** Ask the assistant to read the drawing. Never throws; reports instead. */
  askAdvisor: (drawingHint?: string) => void;
  dismissAdvisor: () => void;
  /** Ask a question about the drawing. The answer changes nothing. */
  askQuestion: (question: string) => void;
  clearConversation: () => void;
  /** What accepting a suggestion would do, before it is done. */
  planFor: (suggestion: ReviewedSuggestion) => SuggestionPlan;
  /** Accept one suggestion. Goes through the same gates as any other change. */
  acceptSuggestion: (suggestion: ReviewedSuggestion) => void;
  /** Drop a suggestion from the list without acting on it. */
  rejectSuggestion: (id: string) => void;
  /** Apply every name the assistant proposed, in one go. */
  acceptAllNames: () => void;
  /** Ribbon: make the selection one rigid piece, analysing first if needed. */
  groupSelectionRigid: (shapeIds: string[]) => void;
  /** Ribbon: let every rigid unit change shape again. */
  releaseAllRigid: () => void;
  /** Which of the given shapes can still change shape. */
  shapeRiskFor: (shapeIds: string[]) => string | null;
  dismissShapeRisk: () => void;
  deleteConstraint: (id: string) => void;
  toggleConstraint: (id: string) => void;
  makeComponent: (name: string, shapeIds: string[]) => void;
  makeRepeat: (draft: RepeatDraft) => void;
  /** Freeze or release a unit, so it moves as one body (notebook pages 3, 5). */
  setUnitRigid: (componentId: string, rigid: boolean) => void;
  /** What a unit measures along a direction — for the pitch default and readout. */
  measureUnitFor: (componentId: string, direction: { x: number; y: number }) => UnitMeasurement | null;
  /** Whether overlapping solids are reported as one pour (notebook page 7). */
  setMergeOverlaps: (value: boolean) => void;
  setIntentionalFreedom: (value: boolean) => void;
  setTemplateName: (name: string) => void;
  checkReadiness: () => void;
  publishTemplate: () => void;
  /**
   * Take a drawing the drafting agent built — shapes and the kernel sketch that
   * goes with them — as the current authoring session. Nothing is converted:
   * the agent worked in this same kernel, so its rules and named values arrive
   * exactly as they were verified.
   */
  adoptDrawing: (shapes: Shape[], sketch: AuthoringSketch) => boolean;
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
          repeatMeasurements: result.repeatMeasurements,
          overlaps: result.topology.overlaps,
          fusion: result.fusion,
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
    //
    // "Disagreed" includes producing different SHAPES, not only different
    // coordinates: a repeat rule regenerates its copies here, and if the drawing
    // arrived without them — freshly loaded, or a shape deleted — none of them
    // would ever reach the sheet.
    const held = result.heldShapeIds;
    const changed = result.movedShapeIds.length > 0 || result.shapeSetChanged;
    if (changed) {
      dispatch({
        type: "APPLY_SOLVED_SHAPES",
        shapes: result.shapes,
        description: held.length > 0 ? "Held by the rules" : "Rebuilt from the rules",
      });
    }

    setS((prev) => ({
      ...prev,
      sketch: result.sketch,
      dof: result.dof,
      invariants: result.invariants,
      repeatMeasurements: result.repeatMeasurements,
      overlaps: result.topology.overlaps,
      fusion: result.fusion,
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
        const nextSketch = applyAction(
          { ...s.sketch, meta: { ...s.sketch.meta, freedomIsIntentional: true } },
          action
        );
        setS((prev) => ({
          ...prev,
          sketch: nextSketch,
          completion: suggestCompletion(nextSketch, names),
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

      // A derived value is still a number on the drawing, and usually the one
      // the brief specifies. Typing into it used to do nothing, because it is
      // downstream — which left the author doing the upstream arithmetic by
      // hand. Instead, ask which input would produce it. The graph is not
      // touched: one input holds a different number and everything downstream
      // still follows exactly as it did.
      if (p.role === "DERIVED") {
        const report = inversionOptions(s.sketch, name, value);
        if (report.refused) {
          push({ notice: { kind: "warn", text: report.refused } });
          return;
        }
        setS((prev) => ({ ...prev, inversion: report }));
        return;
      }

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

  const edgesFor = React.useCallback(
    (shapeIds: string[]) => edgesIn(s.sketch, shapeIds, names),
    [s.sketch, names]
  );

  const loopsFor = React.useCallback(
    (shapeIds: string[]) => loopsIn(s.sketch, shapeIds, names),
    [s.sketch, names]
  );

  const relationOptionsFor = React.useCallback(
    (segA: string, segB: string) => lineRelationOptions(s.sketch, segA, segB),
    [s.sketch]
  );

  /**
   * Tie one edge to another (notebook pages 4-6).
   *
   * No detector will ever propose this: the two lines may share nothing at all,
   * and the drawing offers no evidence they are related. Only the engineer
   * knows, which is why it is an assertion rather than a suggestion.
   */
  const relateTwoLines = React.useCallback(
    (segA: string, segB: string, kind: LineRelationKind) => {
      const labelOf = (id: string) => {
        const seg = s.sketch.segments[id];
        return seg ? (names[seg.shapeId] ?? seg.shapeId) : id;
      };
      const { sketch: next, refused, warning, atRisk } = relateLines(
        s.sketch, segA, segB, kind, labelOf(segA), labelOf(segB), names
      );
      if (refused) {
        push({ notice: { kind: "error", text: refused } });
        return;
      }
      if (commit(next, "Related two edges", s.sketch)) {
        reanalyse(next);
        setS((prev) => ({
          ...prev,
          shapeRisk: warning && atRisk ? { message: warning, shapeIds: atRisk } : null,
        }));
      }
    },
    [s.sketch, names, commit, push, reanalyse]
  );

  /** Tie two shapes by the distance between their centres (notebook page 9). */
  const relateTwoCentres = React.useCallback(
    (loopA: string[], loopB: string[], labelA: string, labelB: string) => {
      const { sketch: next, refused, warning, atRisk } = relateCentroids(
        s.sketch, loopA, loopB, labelA, labelB, undefined, names
      );
      if (refused) {
        push({ notice: { kind: "error", text: refused } });
        return;
      }
      if (commit(next, `Tied ${labelA} and ${labelB} centre to centre`, s.sketch)) {
        reanalyse(next);
        setS((prev) => ({
          ...prev,
          shapeRisk: warning && atRisk ? { message: warning, shapeIds: atRisk } : null,
        }));
      }
    },
    [s.sketch, names, commit, push, reanalyse]
  );

  /**
   * Hold the shapes a rule could deform.
   *
   * The remedy that goes with the warning. Every profile among the given shapes
   * that can still change shape becomes a unit that moves as one piece, so the
   * rule that is already in force starts moving them instead of squashing them —
   * no need to undo it and start again.
   */
  const holdShapesOf = React.useCallback(
    (shapeIds: string[]) => {
      const { sketch: next, held } = holdShapes(s.sketch, authored, shapeIds, names);
      if (held.length === 0) {
        push({ notice: { kind: "info", text: "Those shapes are already held." } });
        setS((prev) => ({ ...prev, shapeRisk: null }));
        return;
      }
      if (commit(next, `${held.join(" and ")} now move as one piece`, s.sketch)) {
        reanalyse(next);
        setS((prev) => ({ ...prev, shapeRisk: null }));
      }
    },
    [s.sketch, authored, names, commit, push, reanalyse]
  );

  /**
   * The ribbon's Group button, as ONE state transition.
   *
   * It was two — analyse, then hold — and that was wrong in a way worth
   * recording: every callback in this file closes over `s.sketch` as it stood
   * when the component last rendered, so the second call in a handler operates
   * on the sketch from BEFORE the first one ran. Chaining them silently threw
   * the first result away. Anything the ribbon does in one press has to be
   * computed in one pass, from one sketch.
   */
  const groupSelectionRigid = React.useCallback(
    (shapeIds: string[]) => {
      if (shapeIds.length === 0) {
        push({ notice: { kind: "warn", text: "Select the geometry that makes up one piece first." } });
        return;
      }

      // Grouping is a reasonable first thing to want, so a drawing that has not
      // been analysed is analysed here rather than refused.
      let base = s.sketch;
      if (!s.started) {
        const first = regenerate(authored, s.sketch, { shapeNames: names, source: "geometry" });
        if (first.rejection) {
          push({ notice: { kind: "error", text: first.rejection } });
          return;
        }
        base = first.sketch;
      }

      const { sketch: next, held } = holdShapes(base, authored, shapeIds, names);
      if (held.length === 0) {
        push({
          notice: {
            kind: "info",
            text: "That selection is already held, or has no closed shape to hold.",
          },
        });
        return;
      }
      if (commit(next, `${held.join(" and ")} now move as one piece`, s.sketch)) {
        setS((prev) => ({ ...prev, started: true, shapeRisk: null }));
        reanalyse(next);
      }
    },
    [s.sketch, s.started, authored, names, commit, push, reanalyse]
  );

  /** Every rigid unit released in one pass, for the same reason as above. */
  const releaseAllRigid = React.useCallback(() => {
    const rigid = s.sketch.components.filter((c) => c.rigid);
    if (rigid.length === 0) {
      push({ notice: { kind: "info", text: "Nothing is held rigid." } });
      return;
    }
    const next: AuthoringSketch = {
      ...s.sketch,
      components: s.sketch.components.map((c) => (c.rigid ? { ...c, rigid: false } : c)),
    };
    if (commit(next, `${rigid.length} unit${rigid.length === 1 ? "" : "s"} can change shape again`, s.sketch)) {
      reanalyse(next);
    }
  }, [s.sketch, commit, push, reanalyse]);

  const applyInversionOption = React.useCallback(
    (option: InversionOption) => {
      const next = applyInversion(s.sketch, option);
      if (commit(next, `${option.parameter} = ${option.to.toFixed(2)}`, s.sketch)) {
        setS((prev) => ({ ...prev, inversion: null }));
      }
    },
    [s.sketch, commit]
  );

  const dismissInversion = React.useCallback(() => {
    setS((prev) => ({ ...prev, inversion: null }));
  }, []);

  const chainFor = React.useCallback(
    (name: string) => explainChain(s.sketch, name),
    [s.sketch]
  );

  /**
   * Ask the assistant what it makes of the drawing.
   *
   * Everything it returns is a SUGGESTION on a card. Nothing it says reaches the
   * model without the author accepting it, and the value on any suggestion it
   * makes is measured here rather than supplied by it — so the worst case is a
   * card nobody wants, never a drawing that moved on its own.
   */
  const askAdvisor = React.useCallback(
    (drawingHint?: string) => {
      setS((prev) => ({ ...prev, advisorBusy: true }));
      const body = JSON.stringify({ sketch: s.sketch, names, drawingHint });

      fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
        .then((r) => r.json())
        .then((result: AdvisorResult) => {
          setS((prev) => ({ ...prev, advisor: result, advisorBusy: false }));
        })
        .catch((err: unknown) => {
          setS((prev) => ({
            ...prev,
            advisorBusy: false,
            advisor: {
              suggestions: [],
              source: "unavailable",
              unavailableReason: err instanceof Error ? err.message : String(err),
              elapsedMs: 0,
              rejected: [],
            },
          }));
        });
    },
    [s.sketch, names]
  );

  const dismissAdvisor = React.useCallback(() => {
    setS((prev) => ({ ...prev, advisor: null }));
  }, []);

  /**
   * Ask a question about the drawing.
   *
   * The facts are computed HERE, from the live sketch, and sent with the
   * question — the model is never asked to work anything out, only to find the
   * answer in what it was given and say it in a sentence. That is the whole
   * safeguard, and it is why the question is cheap: nothing it says can reach
   * the model of the drawing, because there is no path from a sentence to a
   * constraint.
   */
  const askQuestion = React.useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      const facts = describeDrawing(s.sketch, {
        names,
        dof: s.dof,
        overlaps: s.overlaps,
        entityCount: authored.length,
      });
      const history = s.conversation;

      setS((prev) => ({
        ...prev,
        askingBusy: true,
        askError: null,
        conversation: [...prev.conversation, { role: "question", text: trimmed }],
      }));

      fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, facts, history }),
      })
        .then((r) => r.json())
        .then((result: QaResult) => {
          setS((prev) => ({
            ...prev,
            askingBusy: false,
            askError: result.source === "unavailable" ? (result.unavailableReason ?? "No answer.") : null,
            lastCitedValues: result.citedValues ?? [],
            conversation:
              result.source === "llm"
                ? [...prev.conversation, { role: "answer", text: result.answer }]
                : prev.conversation,
          }));
        })
        .catch((err: unknown) => {
          setS((prev) => ({
            ...prev,
            askingBusy: false,
            askError: err instanceof Error ? err.message : String(err),
          }));
        });
    },
    [s.sketch, s.dof, s.overlaps, s.conversation, names, authored]
  );

  const clearConversation = React.useCallback(() => {
    setS((prev) => ({ ...prev, conversation: [], lastCitedValues: [], askError: null }));
  }, []);

  const planFor = React.useCallback(
    (suggestion: ReviewedSuggestion) => {
      const { entityIds } = abstractSketch(s.sketch, names);
      return planSuggestion(suggestion, entityIds, s.candidates, (target, expr) =>
        // Without the shapes: the arithmetic is checked, the re-solve is not.
        // This runs while a card is being drawn, and re-solving the drawing on
        // every render would make the panel crawl.
        verifyProposedFormula(s.sketch, target, expr)
      );
    },
    [s.sketch, s.candidates, names]
  );

  const rejectSuggestion = React.useCallback((id: string) => {
    setS((prev) => ({
      ...prev,
      advisor: prev.advisor
        ? { ...prev.advisor, suggestions: prev.advisor.suggestions.filter((x) => x.id !== id) }
        : prev.advisor,
    }));
  }, []);

  /**
   * Accept one suggestion.
   *
   * Nothing here is a special path for the assistant. A name goes through the
   * same `nameMeasurement` a draftsman uses, a rename through the same rewrite,
   * and a geometric relationship through the same candidate acceptance as a card
   * the detectors produced — which means the admissibility gate and the solver's
   * own refusal apply to the model's ideas exactly as they do to anyone's.
   */
  const acceptSuggestion = React.useCallback(
    (suggestion: ReviewedSuggestion) => {
      const plan = planFor(suggestion);

      if (plan.kind === "unavailable") {
        push({ notice: { kind: "warn", text: plan.blocked ?? "There is nothing to apply." } });
        return;
      }

      if (plan.kind === "rename") {
        const { sketch: next, applied } = renameParameters(s.sketch, {
          [suggestion.parameter!]: suggestion.suggestedName!,
        });
        if (applied.length === 0) return;
        if (commit(next, `Renamed ${applied[0].from} to ${applied[0].to}`, s.sketch)) {
          rejectSuggestion(suggestion.id);
        }
        return;
      }

      if (plan.kind === "formula") {
        // The full check this time, shapes included, so a formula that is
        // arithmetically fine but leaves the drawing unsolvable is caught before
        // it is committed rather than after.
        const verdict = verifyProposedFormula(s.sketch, suggestion.parameter!, suggestion.expression!, {
          shapes: authored,
          shapeNames: names,
        });
        if (!verdict.ok) {
          push({ notice: { kind: "warn", text: verdict.reason ?? "That formula does not hold here." } });
          return;
        }
        const existing = s.sketch.parameters[suggestion.parameter!];
        const next: AuthoringSketch = {
          ...s.sketch,
          parameters: {
            ...s.sketch.parameters,
            [suggestion.parameter!]: {
              ...existing,
              role: "DERIVED",
              expr: suggestion.expression!,
              dependencies: verdict.dependencies,
              provenance: makeProvenance(
                "completion-assistant",
                `Proposed by the assistant and accepted by the author. Checked against the drawing first: ${verdict.agreement}.`
              ),
            },
          },
        };
        if (commit(next, `${suggestion.parameter} now follows ${suggestion.expression}`, s.sketch)) {
          reanalyse(next);
          rejectSuggestion(suggestion.id);
        }
        return;
      }

      if (plan.kind === "name") {
        const { measurements } = abstractSketch(s.sketch, names);
        const target = (suggestion.measurements ?? [])
          .map((m) => measurements.get(m))
          .find((m): m is NonNullable<typeof m> => Boolean(m));
        if (!target) {
          push({ notice: { kind: "warn", text: "That measurement is no longer in the drawing." } });
          return;
        }
        const { sketch: next, refused } = nameMeasurement(
          s.sketch,
          target,
          suggestion.suggestedName!,
          "driving"
        );
        if (refused) {
          push({ notice: { kind: "warn", text: refused } });
          return;
        }
        if (commit(next, `Named ${suggestion.suggestedName}`, s.sketch)) {
          reanalyse(next);
          rejectSuggestion(suggestion.id);
        }
        return;
      }

      // Geometric: accept the detector candidates this suggestion matched.
      let next = s.sketch;
      let applied = 0;
      for (const id of plan.candidateIds) {
        const candidate = s.candidates.find((c) => c.id === id);
        if (!candidate) continue;
        next = addConstraint(next, candidate.constraint);
        applied++;
      }
      if (applied === 0) return;
      if (commit(next, `Accepted ${applied} relationship${applied === 1 ? "" : "s"}`, s.sketch)) {
        reanalyse(next);
        rejectSuggestion(suggestion.id);
      }
    },
    [s.sketch, s.candidates, authored, names, planFor, commit, push, reanalyse, rejectSuggestion]
  );

  /**
   * Apply every proposed name at once.
   *
   * Renames are the suggestions people want in bulk — a drawing arrives with a
   * dozen `R1Width`s and nobody wants to press Accept a dozen times. They are
   * also the safest to batch: not one of them moves a millimetre.
   */
  const acceptAllNames = React.useCallback(() => {
    const renames = (s.advisor?.suggestions ?? []).filter(
      (x) => x.kind === "rename_parameter" && x.parameter && x.suggestedName
    );
    if (renames.length === 0) return;

    const map: Record<string, string> = {};
    for (const r of renames) map[r.parameter!] = r.suggestedName!;

    const { sketch: next, applied } = renameParameters(s.sketch, map);
    if (applied.length === 0) return;
    if (commit(next, `Renamed ${applied.length} value${applied.length === 1 ? "" : "s"}`, s.sketch)) {
      const done = new Set(renames.map((r) => r.id));
      setS((prev) => ({
        ...prev,
        advisor: prev.advisor
          ? { ...prev.advisor, suggestions: prev.advisor.suggestions.filter((x) => !done.has(x.id)) }
          : prev.advisor,
      }));
    }
  }, [s.sketch, s.advisor, commit]);

  // Ask once, on mount, whether the assistant is switched on at all, so the
  // panel can say how to switch it on instead of offering a button that fails.
  React.useEffect(() => {
    let live = true;
    fetch("/api/ai/suggest")
      .then((r) => r.json())
      .then((status: { configured: boolean; model: string; detail: string }) => {
        if (live) setS((prev) => ({ ...prev, advisorStatus: status }));
      })
      .catch(() => {
        if (live) {
          setS((prev) => ({
            ...prev,
            advisorStatus: { configured: false, model: "", detail: "The assistant endpoint is not reachable." },
          }));
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const shapeRiskFor = React.useCallback(
    (shapeIds: string[]) => {
      if (shapeIds.length === 0) return null;
      const risks = shapesAtRisk(s.sketch, shapeIds, names);
      if (risks.length === 0) return null;
      const labels = risks.map((r) => r.label).join(" and ");
      return `${labels} can still change shape.`;
    },
    [s.sketch, names]
  );

  const dismissShapeRisk = React.useCallback(() => {
    setS((prev) => ({ ...prev, shapeRisk: null }));
  }, []);

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

  /**
   * Freeze a unit into a body, or let it go loose again (notebook pages 3, 5).
   *
   * The refusal is checked BEFORE the flag is set, so the author finds out while
   * they are still looking at what they selected rather than three edits later
   * when a solve throws.
   */
  const setUnitRigid = React.useCallback(
    (componentId: string, rigid: boolean) => {
      const component = s.sketch.components.find((c) => c.id === componentId);
      if (!component) return;

      if (rigid) {
        const refusal = rigidConflict(s.sketch, buildSystem(s.sketch).index, component);
        if (refusal) {
          push({ notice: { kind: "error", text: refusal } });
          return;
        }
      }

      const next = setComponentRigid(s.sketch, componentId, rigid);
      commit(
        next,
        rigid
          ? `"${component.name}" now moves as one piece`
          : `"${component.name}" can be reshaped again`,
        s.sketch
      );
    },
    [s.sketch, commit, push]
  );

  const measureUnitFor = React.useCallback(
    (componentId: string, direction: { x: number; y: number }) => {
      const component = s.sketch.components.find((c) => c.id === componentId);
      if (!component) return null;
      return measureUnit(s.sketch, component, direction);
    },
    [s.sketch]
  );

  const setMergeOverlaps = React.useCallback(
    (value: boolean) => {
      const next: AuthoringSketch = {
        ...s.sketch,
        meta: { ...s.sketch.meta, mergeOverlaps: value },
      };
      commit(
        next,
        value ? "Overlapping solids read as one pour" : "Overlapping solids stay separate",
        s.sketch
      );
    },
    [s.sketch, commit]
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

  const adoptDrawing = React.useCallback(
    (shapes: Shape[], sketch: AuthoringSketch) => {
      const shapeNames = namesOf(shapes);
      // Re-solved here rather than trusted: the client's kernel is the one the
      // author will edit with, and it must agree with what the server verified.
      const result = regenerate(authoredOnly(shapes), sketch, { shapeNames });
      if (result.rejection) {
        setS((prev) => ({
          ...prev,
          notice: { kind: "error", text: `The agent's drawing did not solve here: ${result.rejection}` },
        }));
        return false;
      }
      dispatch({
        type: "APPLY_SOLVED_SHAPES",
        shapes: result.shapes,
        description: `Drafting agent: ${sketch.meta.name}`,
      });
      const published = Boolean(result.sketch.meta.publishedAt);
      setS((prev) => ({
        ...prev,
        sketch: result.sketch,
        started: true,
        stage: published ? "published" : "constraining",
        dof: result.dof,
        invariants: result.invariants,
        repeatMeasurements: result.repeatMeasurements,
        overlaps: result.topology.overlaps,
        fusion: result.fusion,
        candidates: detectCandidates(result.sketch, { shapeNames }),
        completion: suggestCompletion(result.sketch, shapeNames),
        derived: [],
        readiness: null,
        shapeRisk: null,
        inversion: null,
        past: [...prev.past.slice(-49), prev.sketch],
        notice: {
          kind: "ok",
          text: published
            ? `"${result.sketch.meta.name}" is published — its named values can be changed in Run Mode.`
            : `"${result.sketch.meta.name}" is on the sheet. It was not verified, so it is not published.`,
        },
      }));
      return true;
    },
    [dispatch]
  );

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
    edgesFor,
    loopsFor,
    relationOptionsFor,
    relateTwoLines,
    relateTwoCentres,
    holdShapesOf,
    applyInversionOption,
    dismissInversion,
    chainFor,
    askAdvisor,
    dismissAdvisor,
    askQuestion,
    clearConversation,
    planFor,
    acceptSuggestion,
    rejectSuggestion,
    acceptAllNames,
    groupSelectionRigid,
    releaseAllRigid,
    shapeRiskFor,
    dismissShapeRisk,
    deleteConstraint,
    toggleConstraint,
    makeComponent,
    makeRepeat,
    setUnitRigid,
    measureUnitFor,
    setMergeOverlaps,
    setIntentionalFreedom,
    setTemplateName,
    checkReadiness,
    publishTemplate,
    adoptDrawing,
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
