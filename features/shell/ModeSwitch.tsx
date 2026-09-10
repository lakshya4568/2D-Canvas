"use client";

import React from "react";
import { PencilRuler, SlidersHorizontal, Stamp } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { UserMode } from "@/lib/state/drawingReducer";

/**
 * The persona switch — UPCE-MASTER-1.0 §3.
 *
 * "Three roles, three completely different products sharing one kernel. Mixing
 *  them is the single most common design error in this space."
 *
 * This control is the boundary. Everything in the right dock, every badge state,
 * and every status readout is a function of which persona is active.
 */

const MODES: {
  id: UserMode;
  label: string;
  icon: typeof PencilRuler;
  /** What this persona is actually allowed to do (§3 contract table). */
  contract: string;
}[] = [
  {
    id: "draftsman",
    label: "Draft",
    icon: PencilRuler,
    contract: "Draw geometry, drag grips, type dimensions. No formulas, ever.",
  },
  {
    id: "author",
    label: "Author",
    icon: Stamp,
    contract: "Curate inferred design intent, set roles, ports, repeats, standards.",
  },
  {
    id: "user",
    label: "Run",
    icon: SlidersHorizontal,
    contract: "Enter site conditions. Geometry is read-only.",
  },
];

export function ModeSwitch() {
  const { state, dispatch } = useDrawing();

  return (
    <div
      role="tablist"
      aria-label="Working mode"
      className="flex items-stretch h-[26px] rounded-[5px] bg-(--ink-sunken) p-[2px] gap-[2px] border border-(--rule)"
    >
      {MODES.map((mode) => {
        const active = state.userMode === mode.id;
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            role="tab"
            aria-selected={active}
            title={mode.contract}
            onClick={() => dispatch({ type: "SET_USER_MODE", mode: mode.id })}
            className={[
              "flex items-center gap-1.5 px-2.5 rounded-[3px] text-[11px] font-medium",
              "transition-colors duration-100 cursor-pointer",
              active
                ? "bg-(--ink-raised) text-(--fg-primary) shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                : "text-(--fg-muted) hover:text-(--fg-secondary)",
            ].join(" ")}
          >
            <Icon className="w-[13px] h-[13px]" strokeWidth={2} />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
