"use client";

import React from "react";
import { SlidersHorizontal, Lock, TriangleAlert } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { PanelBody, Empty } from "./DraftPanel";
import type { ParametricVariable } from "@/lib/parametric/model";

/**
 * The PROJECT ENGINEER dock — UPCE-MASTER-1.0 §64, §65.
 *
 * "The UI parses `parameters` and renders controls ONLY for DRIVING; DERIVED
 *  values appear as live read-only badges; FIXED values appear in an
 *  'advanced/standards' disclosure."
 *
 * And §64 on what this persona must never encounter:
 *
 *   "They do NOT see constraints, the DCEL, a Jacobian, a formula DAG, or
 *    PlaneGCS."
 *
 * So this panel renders numbers and names. No expression appears anywhere in it,
 * including on the derived rows — a derived value shows its RESULT, and says
 * which named inputs govern it, never how.
 *
 * §26 governs the bound feedback: a value outside a standards range turns the
 * input amber and cites the clause; only a physically impossible value is a hard
 * block. "the canvas still updates, the input border turns amber, a tooltip
 * cites the clause".
 */

interface DrivingRow {
  variable: ParametricVariable;
  /** Amber advisory from a standards profile, with its clause. */
  advisory?: string;
}

function groupOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("span") || n.includes("height") || n.includes("clear")) {
    return "Clearance dimensions";
  }
  if (n.includes("thick") || n.includes("wall") || n.includes("slab") || n.includes("haunch")) {
    return "Structural thicknesses";
  }
  if (n.includes("count") || n.includes("cell") || n.includes("spacing")) {
    return "Configuration";
  }
  return "Other dimensions";
}

function advisoryFor(v: ParametricVariable): string | undefined {
  const n = v.name.toLowerCase();
  // Representative IRC practice minima (§26). These ship as an editable
  // StandardsProfile marked `verified: false` until a human confirms the clause
  // against the current official edition — the UI says so rather than implying
  // the number is authoritative.
  if (n.includes("wall") && v.value < 250) {
    return "Below the 250 mm practice minimum · IRC:SP:13 (unverified profile)";
  }
  if (n.includes("slab") && v.value < 200) {
    return "Below the 200 mm practice minimum · IRC:SP:13 (unverified profile)";
  }
  return undefined;
}

function ParameterField({
  variable,
  advisory,
  onCommit,
}: {
  variable: ParametricVariable;
  advisory?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(variable.value));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setDraft(String(variable.value));
  }, [variable.value, focused]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(String(variable.value));
  };

  const range =
    variable.min !== undefined && variable.max !== undefined
      ? `${variable.min} – ${variable.max}`
      : undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`param-${variable.name}`}
          className="text-[11.5px] text-(--fg-secondary) truncate"
        >
          {variable.name}
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            id={`param-${variable.name}`}
            value={draft}
            inputMode="decimal"
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraft(String(variable.value));
                e.currentTarget.blur();
              }
            }}
            className={[
              "num w-[78px] h-[26px] px-2 text-right text-[12px] rounded-[5px]",
              "bg-(--ink-raised) text-(--fg-primary) border transition-colors duration-100",
              advisory ? "border-(--warn)" : "border-(--rule) focus:border-(--pen)",
              "outline-none",
            ].join(" ")}
          />
          <span className="text-[10px] text-(--fg-muted) w-[16px]">
            {variable.unit ?? "mm"}
          </span>
        </div>
      </div>

      {(range || advisory) && (
        <p
          className={`text-[10px] leading-snug pl-0.5 flex items-start gap-1 ${
            advisory ? "text-(--warn)" : "text-(--fg-muted)"
          }`}
        >
          {advisory && (
            <TriangleAlert className="w-[10px] h-[10px] mt-[1px] shrink-0" strokeWidth={2.2} />
          )}
          {advisory ?? range}
        </p>
      )}
    </div>
  );
}

export function RunPanel() {
  const { state, dispatch } = useDrawing();

  const all = Object.values(state.variables);
  const driving: DrivingRow[] = all
    .filter((v) => !v.formula)
    .map((v) => ({ variable: v, advisory: advisoryFor(v) }));
  const derived = all.filter((v) => !!v.formula);

  if (all.length === 0) {
    return (
      <PanelBody>
        <Empty
          icon={SlidersHorizontal}
          title="No template loaded"
          body="Open a template to get a form of named engineering parameters. Type new values and the drawing updates — no drafting required."
        />
      </PanelBody>
    );
  }

  const groups = new Map<string, DrivingRow[]>();
  for (const row of driving) {
    const g = groupOf(row.variable.name);
    groups.set(g, [...(groups.get(g) ?? []), row]);
  }

  return (
    <PanelBody>
      {[...groups.entries()].map(([group, rows]) => (
        <section key={group} className="flex flex-col gap-2.5">
          <h3 className="label">{group}</h3>
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => (
              <ParameterField
                key={row.variable.name}
                variable={row.variable}
                advisory={row.advisory}
                onCommit={(value) =>
                  dispatch({
                    type: "SET_VARIABLE",
                    name: row.variable.name,
                    valueOrFormula: value,
                  })
                }
              />
            ))}
          </div>
        </section>
      ))}

      {derived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="label">Derived — read only</h3>
          <div className="rounded-[6px] border border-(--rule) overflow-hidden">
            {derived.map((v, i) => (
              <div
                key={v.name}
                className={`flex items-center justify-between gap-2 px-2.5 h-[30px] bg-(--ink-sunken) ${
                  i > 0 ? "border-t border-(--rule)" : ""
                }`}
              >
                <span className="text-[11.5px] text-(--fg-secondary) flex items-center gap-1.5 truncate">
                  <Lock className="w-[10px] h-[10px] text-(--dim-derived) shrink-0" strokeWidth={2.2} />
                  {v.name}
                </span>
                {/* The RESULT, never the expression (§64). */}
                <span className="num text-[12px] text-(--dim-derived) shrink-0">
                  {v.value.toFixed(1)}
                  <span className="ml-1 text-[10px]">{v.unit ?? "mm"}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </PanelBody>
  );
}
