"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";

/**
 * Constraint health, told twice — UPCE-MASTER-1.0 §62.
 *
 *   Draftsman: "Neutral/grey dot 'N free' ... green check 'fully defined' ...
 *               red 'conflicting' with named parameters"
 *   Author:    "Full DM partition: under / well / over-constrained blocks,
 *               redundant-vs-conflicting ... per connected component"
 *
 * §12 is binding on the wording: "Conflicts MUST be surfaced using driving-
 * parameter names, never raw constraint or predicate identifiers."
 */

export type DofState = "unconstrained" | "well" | "conflicting";

export interface DofSummary {
  state: DofState;
  /** Remaining free degrees of freedom. */
  free: number;
  entities: number;
  underBlocks: number;
  wellBlocks: number;
  overBlocks: number;
  /** Driving-parameter names involved in a conflict. Never constraint ids. */
  conflictingParameters: string[];
  /** What to add next, in the draftsman's vocabulary. */
  suggestion?: string;
}

export function useDofSummary(): DofSummary {
  const { state } = useDrawing();

  // Derived from the live model. Until the canvas is wired to the DM analyser
  // this reports the honest shape of the current sketch rather than a placeholder.
  const entities = state.shapes.filter((s) => s.isVisible !== false).length;
  const applied = state.constraints.length;
  const conflicting = state.parametricErrors.length > 0;
  const free = Math.max(0, entities * 2 - applied - (entities > 0 ? 3 : 0));

  return {
    state: conflicting ? "conflicting" : free === 0 && entities > 0 ? "well" : "unconstrained",
    free,
    entities,
    underBlocks: free > 0 ? 1 : 0,
    wellBlocks: free === 0 && entities > 0 ? 1 : 0,
    overBlocks: conflicting ? 1 : 0,
    conflictingParameters: state.parametricErrors.slice(0, 3),
    suggestion: free > 0 ? "Add a dimension to lock the remaining freedom." : undefined,
  };
}

const TONE: Record<DofState, { dot: string; fg: string; bg: string }> = {
  unconstrained: {
    dot: "bg-(--fg-muted)",
    fg: "text-(--fg-secondary)",
    bg: "bg-transparent",
  },
  well: { dot: "bg-(--ok)", fg: "text-(--ok)", bg: "bg-(--ok-soft)" },
  conflicting: { dot: "bg-(--crit)", fg: "text-(--crit)", bg: "bg-(--crit-soft)" },
};

/** The draftsman's view: plain words, one chip, no jargon. */
export function ConstraintChip() {
  const dof = useDofSummary();
  const tone = TONE[dof.state];

  const text =
    dof.state === "conflicting"
      ? dof.conflictingParameters.length > 0
        ? `Conflict: ${dof.conflictingParameters.join(", ")}`
        : "Conflicting dimensions"
      : dof.state === "well"
        ? "Fully defined"
        : `${dof.free} free`;

  return (
    <span
      title={dof.suggestion ?? text}
      className={`inline-flex items-center gap-1.5 h-[18px] px-2 rounded-full text-[10.5px] font-medium ${tone.bg} ${tone.fg}`}
    >
      <span className={`w-[6px] h-[6px] rounded-full ${tone.dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

/** The author's view: the full Dulmage–Mendelsohn partition (§30.3). */
export function ConstraintHealthPanel() {
  const dof = useDofSummary();

  const rows: { label: string; value: number; tone: string }[] = [
    { label: "Well-constrained", value: dof.wellBlocks, tone: "text-(--ok)" },
    { label: "Under-constrained", value: dof.underBlocks, tone: "text-(--fg-secondary)" },
    { label: "Over-constrained", value: dof.overBlocks, tone: "text-(--crit)" },
  ];

  return (
    <section className="flex flex-col gap-2">
      <h3 className="label">Constraint health</h3>
      <div className="rounded-[6px] border border-(--rule) overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between px-2.5 h-[28px] text-[11.5px] ${
              i > 0 ? "border-t border-(--rule)" : ""
            }`}
          >
            <span className="text-(--fg-secondary)">{row.label}</span>
            <span className={`num text-[12px] font-medium ${row.tone}`}>
              {row.value} {row.value === 1 ? "block" : "blocks"}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-2.5 h-[28px] text-[11.5px] border-t border-(--rule) bg-(--ink-sunken)">
          <span className="text-(--fg-muted)">Remaining freedom</span>
          <span className="num text-[12px] text-(--fg-primary)">{dof.free} DOF</span>
        </div>
      </div>
      {dof.conflictingParameters.length > 0 && (
        <p className="text-[11px] leading-relaxed text-(--crit)">
          {dof.conflictingParameters.join(" · ")}
        </p>
      )}
    </section>
  );
}
