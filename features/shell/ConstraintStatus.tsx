"use client";

/**
 * Constraint health, told twice — UPCE-MASTER-1.0 §62.
 *
 *   Draftsman: a neutral chip saying how much is still free, or "fully defined",
 *              or a conflict named by the requirements involved.
 *   Author:    the per-block partition, with redundant and conflicting rules
 *              distinguished by their residual rather than by counting (§7.3).
 *
 * This file previously computed `entities * 2 - constraints - 3` and clamped the
 * result at zero, which meant a single free rectangle reported "Fully defined,
 * 0 DOF". Every number here now comes from the rank of the assembled Jacobian.
 * If there is no live analysis, the chip says so instead of inventing one.
 */

import React from "react";
import { useUpce } from "../parametric/upceContext";

const TONE = {
  unknown: { dot: "bg-(--fg-muted)", fg: "text-(--fg-muted)", bg: "bg-transparent" },
  under: { dot: "bg-(--fg-muted)", fg: "text-(--fg-secondary)", bg: "bg-transparent" },
  well: { dot: "bg-(--ok)", fg: "text-(--ok)", bg: "bg-(--ok-soft)" },
  over: { dot: "bg-(--crit)", fg: "text-(--crit)", bg: "bg-(--crit-soft)" },
} as const;

/** The draftsman's view: plain words, one chip, no jargon. */
export function ConstraintChip() {
  const { dof, started } = useUpce();

  if (!started || !dof) {
    return (
      <span
        title="Run Analyse geometry in the Author dock to measure this drawing."
        className={`inline-flex items-center gap-1.5 h-[18px] px-2 rounded-full text-[10.5px] font-medium ${TONE.unknown.bg} ${TONE.unknown.fg}`}
      >
        <span className={`w-[6px] h-[6px] rounded-full ${TONE.unknown.dot}`} aria-hidden="true" />
        Not analysed
      </span>
    );
  }

  const conflicts = dof.diagnoses.filter((d) => d.status === "conflicting");
  const key = dof.status === "over" ? "over" : dof.status === "well" ? "well" : "under";
  const tone = TONE[key];

  const text =
    key === "over"
      ? `Conflict: ${conflicts.slice(0, 2).map((c) => c.label).join(" vs ") || "requirements disagree"}`
      : key === "well"
        ? "Fully defined"
        : `${dof.dof} free`;

  return (
    <span
      title={dof.motions[0]?.description ?? text}
      className={`inline-flex items-center gap-1.5 h-[18px] px-2 rounded-full text-[10.5px] font-medium ${tone.bg} ${tone.fg}`}
    >
      <span className={`w-[6px] h-[6px] rounded-full ${tone.dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

/** The author's view: the per-block partition (§30.3). */
export function ConstraintHealthPanel() {
  const { dof, started } = useUpce();

  if (!started || !dof) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="label">Constraint health</h3>
        <p className="text-[11px] leading-relaxed text-(--fg-muted)">
          Nothing has been measured yet. Analyse the geometry and this fills in from the constraint
          system itself.
        </p>
      </section>
    );
  }

  const under = dof.blocks.filter((b) => b.status === "under").length;
  const well = dof.blocks.filter((b) => b.status === "well").length;
  const over = dof.blocks.filter((b) => b.status === "over").length;
  const redundant = dof.diagnoses.filter((d) => d.status === "redundant");
  const conflicting = dof.diagnoses.filter((d) => d.status === "conflicting");

  const rows = [
    { label: "Well-constrained", value: well, tone: "text-(--ok)" },
    { label: "Under-constrained", value: under, tone: "text-(--fg-secondary)" },
    { label: "Over-constrained", value: over, tone: "text-(--crit)" },
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
          <span className="num text-[12px] text-(--fg-primary)">{dof.dof} DOF</span>
        </div>
        <div className="flex items-center justify-between px-2.5 h-[24px] text-[10.5px] border-t border-(--rule) text-(--fg-muted)">
          <span>{dof.rows} requirements over {dof.variables} coordinates</span>
          <span className="num">rank {dof.rank}</span>
        </div>
      </div>

      {conflicting.length > 0 && (
        <p className="text-[11px] leading-relaxed text-(--crit)">
          Cannot all hold at once: {conflicting.map((c) => c.label).join(" · ")}
        </p>
      )}
      {redundant.length > 0 && (
        <p className="text-[10.5px] leading-relaxed text-(--fg-muted)">
          {redundant.length} rule{redundant.length === 1 ? " is" : "s are"} repeated by others and
          harmless: {redundant.slice(0, 2).map((c) => c.label).join(" · ")}
        </p>
      )}
    </section>
  );
}
