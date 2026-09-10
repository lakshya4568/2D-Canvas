"use client";

import React from "react";
import { Check, X, Sparkles, ShieldCheck } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ConstraintHealthPanel } from "../shell/ConstraintStatus";
import { PanelBody, Empty } from "./DraftPanel";
import type { InferredFormula } from "@/lib/inference/formulaSynthesizer";

/**
 * The AUTHOR dock — UPCE-MASTER-1.0 §62, and the answer to "do we still need
 * the AutoFormula tab?"
 *
 * The capability is needed; the OLD SHAPE was not. §3 forbids a formula bar to
 * the draftsman outright, so a persistent bottom formula bar was in the wrong
 * place for two of the three personas. What the spec actually asks for is a
 * REVIEW SURFACE, here, in Author mode only:
 *
 *   "For each card the author may Accept / Reject / Edit / Rename, set the role
 *    (DRIVING / DERIVED / FIXED), set units, bounds and step, choose among
 *    competing formulas..."
 *
 * Two rules govern what may appear on these cards:
 *
 *   §46  "Inference produces CANDIDATES, never silent commitments."
 *   §47  Every card is built from a Candidate record, "so every proposal is
 *        explainable" — the evidence is part of the card, not a tooltip.
 *
 * That is why each card leads with its measured evidence and its confidence,
 * and why nothing here is applied until the author presses Accept.
 */

function confidenceTone(c: number): { label: string; cls: string } {
  if (c >= 0.9) return { label: "high", cls: "text-(--ok)" };
  if (c >= 0.7) return { label: "likely", cls: "text-(--fg-secondary)" };
  return { label: "weak", cls: "text-(--warn)" };
}

function CandidateCard({
  formula,
  onAccept,
  onReject,
}: {
  formula: InferredFormula;
  onAccept: () => void;
  onReject: () => void;
}) {
  const tone = confidenceTone(formula.confidence);
  const accepted = formula.status === "accepted" || formula.status === "locked";

  return (
    <article
      className={[
        "rounded-[7px] border overflow-hidden transition-colors duration-100",
        accepted ? "border-(--ok) bg-(--ok-soft)" : "border-(--rule) bg-(--ink-raised)",
      ].join(" ")}
    >
      <div className="px-2.5 pt-2 pb-2 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium text-(--fg-primary) truncate">
            {formula.displayTarget}
          </span>
          <span className="num text-[12px] text-(--fg-primary) shrink-0">
            {formula.evaluatedValue.toFixed(1)}
            <span className="text-(--fg-muted) ml-1 text-[10px]">mm</span>
          </span>
        </div>

        {/* §47: the evidence IS the card. An author must be able to see why. */}
        <p className="text-[11px] leading-[1.5] text-(--fg-secondary)">{formula.reason}</p>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-(--fg-muted) uppercase tracking-wide">
            {formula.provenance}
          </span>
          <span className="w-px h-[9px] bg-(--rule)" aria-hidden="true" />
          <span className={tone.cls}>
            {tone.label} · {(formula.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* The expression is shown HERE and only here — Author mode. §3 keeps it
            out of the draftsman's and the project engineer's sight entirely. */}
        <code className="num text-[10.5px] text-(--fg-muted) bg-(--ink-sunken) rounded px-1.5 py-1 overflow-x-auto whitespace-nowrap">
          {formula.targetProperty} = {formula.expression}
        </code>
      </div>

      {!accepted && (
        <div className="flex border-t border-(--rule)">
          <button
            onClick={onAccept}
            className="flex-1 h-[28px] flex items-center justify-center gap-1.5 text-[11px] font-medium text-(--ok) hover:bg-(--ok-soft) transition-colors duration-100 cursor-pointer"
          >
            <Check className="w-[12px] h-[12px]" strokeWidth={2.4} />
            Accept
          </button>
          <div className="w-px bg-(--rule)" aria-hidden="true" />
          <button
            onClick={onReject}
            className="flex-1 h-[28px] flex items-center justify-center gap-1.5 text-[11px] font-medium text-(--fg-muted) hover:bg-(--crit-soft) hover:text-(--crit) transition-colors duration-100 cursor-pointer"
          >
            <X className="w-[12px] h-[12px]" strokeWidth={2.4} />
            Reject
          </button>
        </div>
      )}

      {accepted && (
        <div className="flex items-center gap-1.5 px-2.5 h-[26px] border-t border-(--ok) text-[10.5px] text-(--ok)">
          <ShieldCheck className="w-[11px] h-[11px]" strokeWidth={2.2} />
          Committed to the template
        </div>
      )}
    </article>
  );
}

export function AuthorPanel() {
  const { state, dispatch } = useDrawing();

  const pending = state.inferredFormulas.filter((f) => f.status === "pending");
  const accepted = state.inferredFormulas.filter(
    (f) => f.status === "accepted" || f.status === "locked"
  );

  return (
    <PanelBody>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="label">Suggested relationships</h3>
          {pending.length > 0 && (
            <span className="num text-[10px] text-(--fg-muted)">{pending.length}</span>
          )}
        </div>

        {pending.length === 0 ? (
          <Empty
            icon={Sparkles}
            title="Nothing proposed yet"
            body="Draw geometry with repeated offsets, equal spans or symmetric features. Detected relationships arrive here as candidates with their evidence — nothing is applied until you accept it."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((formula) => (
              <CandidateCard
                key={formula.id}
                formula={formula}
                onAccept={() => dispatch({ type: "ACCEPT_INFERRED_FORMULA", id: formula.id })}
                onReject={() => dispatch({ type: "UNBIND_INFERRED_FORMULA", id: formula.id })}
              />
            ))}
          </div>
        )}
      </section>

      {accepted.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="label">Committed design intent</h3>
          <div className="flex flex-col gap-2">
            {accepted.map((formula) => (
              <CandidateCard
                key={formula.id}
                formula={formula}
                onAccept={() => undefined}
                onReject={() => dispatch({ type: "UNBIND_INFERRED_FORMULA", id: formula.id })}
              />
            ))}
          </div>
        </section>
      )}

      <ConstraintHealthPanel />

      <section className="flex flex-col gap-2">
        <h3 className="label">Parameters</h3>
        {Object.keys(state.variables).length === 0 ? (
          <p className="text-[11.5px] leading-relaxed text-(--fg-muted)">
            No named parameters yet. Accepting a relationship above creates one.
          </p>
        ) : (
          <div className="rounded-[6px] border border-(--rule) overflow-hidden">
            {Object.values(state.variables).map((v, i) => (
              <div
                key={v.name}
                className={`flex items-center justify-between gap-2 px-2.5 h-[30px] ${
                  i > 0 ? "border-t border-(--rule)" : ""
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[9px] px-1 rounded-sm font-semibold tracking-wide ${
                      v.formula
                        ? "bg-(--ink-sunken) text-(--dim-derived)"
                        : "bg-(--pen-soft) text-(--pen)"
                    }`}
                  >
                    {v.formula ? "DER" : "DRV"}
                  </span>
                  <span className="text-[11.5px] text-(--fg-secondary) truncate">
                    {v.name}
                  </span>
                </div>
                <span className="num text-[12px] text-(--fg-primary) shrink-0">
                  {v.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </PanelBody>
  );
}
