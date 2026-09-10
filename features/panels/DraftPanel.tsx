"use client";

import React from "react";
import { Lock, Ruler, Layers } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ConstraintChip } from "../shell/ConstraintStatus";
import { useUpce } from "../parametric/upceContext";

/**
 * The DRAFTSMAN dock — UPCE-MASTER-1.0 §3.
 *
 * The contract for this persona is unusually strict, and this panel is where it
 * is kept or broken:
 *
 *   "Formula exposure: STRICTLY ZERO. No formula bar, no expression syntax, no
 *    dependency graph, no synthetic names like R1_Width."
 *
 * So: no expression strings are rendered here, no variable table, no dependency
 * view. A draftsman sees the dimensions of what they selected and edits them by
 * typing a number. Everything else is the author's problem.
 *
 * §12 also binds the wording: a derived dimension "MUST be visibly locked, or
 * explain the driving dimensions that control it" — hence the lock row below,
 * which names the drivers in plain words and never shows the expression.
 */

interface DimensionRow {
  key: string;
  label: string;
  value: number;
  /** Derived dimensions are locked and explained, never silently editable. */
  derivedFrom?: string[];
}

function measurementsFor(shape: {
  type: string;
  width?: number;
  height?: number;
  radius?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}): DimensionRow[] {
  switch (shape.type) {
    case "line":
    case "arrow":
      return [
        {
          key: "length",
          label: "Length",
          value: Math.hypot(
            (shape.x2 ?? 0) - (shape.x1 ?? 0),
            (shape.y2 ?? 0) - (shape.y1 ?? 0)
          ),
        },
      ];
    case "rectangle":
      return [
        { key: "width", label: "Width", value: shape.width ?? 0 },
        { key: "height", label: "Height", value: shape.height ?? 0 },
        {
          key: "perimeter",
          label: "Perimeter",
          value: 2 * ((shape.width ?? 0) + (shape.height ?? 0)),
          derivedFrom: ["Width", "Height"],
        },
      ];
    case "circle":
      return [
        { key: "radius", label: "Radius", value: shape.radius ?? 0 },
        {
          key: "diameter",
          label: "Diameter",
          value: 2 * (shape.radius ?? 0),
          derivedFrom: ["Radius"],
        },
      ];
    default:
      return [];
  }
}

export function DraftPanel() {
  const { state, selectedShape, selectedShapes, dispatch } = useDrawing();
  const { sketch } = useUpce();

  // Rules the author actually chose. A rectangle's own right angles are part of
  // what the shape is rather than a decision, so counting them here would make
  // an untouched drawing look constrained.
  const rulesInForce = sketch.constraints.filter(
    (c) => c.strength !== "fact" && c.state !== "suppressed"
  ).length;

  if (selectedShapes.length > 1) {
    return (
      <PanelBody>
        <Empty
          icon={Layers}
          title={`${selectedShapes.length} entities selected`}
          body="Select a single entity to read and edit its dimensions."
        />
      </PanelBody>
    );
  }

  if (!selectedShape) {
    return (
      <PanelBody>
        <Empty
          icon={Ruler}
          title="Nothing selected"
          body="Pick an entity on the sheet, or start drawing. Dimensions appear here and on the drawing itself — click any dimension to type a new value."
        />
        <section className="flex flex-col gap-2">
          <h3 className="label">Sheet</h3>
          <KeyValue
            rows={[
              { k: "Entities", v: String(state.shapes.filter((s) => s.isVisible !== false).length) },
              { k: "Rules in force", v: String(rulesInForce) },
            ]}
          />
        </section>
      </PanelBody>
    );
  }

  const rows = measurementsFor(selectedShape as never);

  return (
    <PanelBody>
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h3 className="label">Selected</h3>
          <span className="text-[10px] text-(--pen) font-mono bg-(--pen-soft) px-1.5 py-0.5 rounded truncate max-w-[120px]" title={selectedShape.id}>
            {selectedShape.id}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-(--fg-muted) uppercase font-mono shrink-0">{selectedShape.type}</span>
          <input
            value={selectedShape.name ?? ""}
            placeholder="Name (e.g. Outer_Frame, Cell_Roof)"
            onChange={(e) =>
              dispatch({
                type: "UPDATE_SHAPE",
                id: selectedShape.id,
                updates: { name: e.target.value },
              })
            }
            className="flex-1 min-w-0 h-[24px] px-2 text-[11.5px] rounded-[4px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary) font-mono"
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="label">Dimensions</h3>
        {rows.length === 0 ? (
          <p className="text-[11.5px] text-(--fg-muted) leading-relaxed">
            This entity has no directly editable dimensions. Drag its grips on the
            sheet to reshape it.
          </p>
        ) : (
          <div className="rounded-[6px] border border-(--rule) overflow-hidden">
            {rows.map((row, i) => (
              <div
                key={row.key}
                className={`flex items-center justify-between gap-2 px-2.5 h-[32px] ${
                  i > 0 ? "border-t border-(--rule)" : ""
                } ${row.derivedFrom ? "bg-(--ink-sunken)" : ""}`}
              >
                <span className="text-[11.5px] text-(--fg-secondary) flex items-center gap-1.5">
                  {row.derivedFrom && (
                    <Lock className="w-[10px] h-[10px] text-(--dim-derived)" strokeWidth={2.2} />
                  )}
                  {row.label}
                </span>
                <span
                  className={`num text-[12px] ${
                    row.derivedFrom ? "text-(--dim-derived)" : "text-(--dim-driving) font-medium"
                  }`}
                >
                  {row.value.toFixed(1)}
                  <span className="text-(--fg-muted) ml-1 text-[10px]">mm</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {rows.some((r) => r.derivedFrom) && (
          // §12: explain a locked dimension by NAMING its drivers. Never show
          // the expression — that is the author's view, not this one.
          <p className="text-[11px] leading-relaxed text-(--fg-muted)">
            Locked rows are governed by{" "}
            <span className="text-(--fg-secondary)">
              {[...new Set(rows.flatMap((r) => r.derivedFrom ?? []))].join(" and ")}
            </span>
            . Change those to move them.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="label">Status</h3>
        <div className="flex items-center">
          <ConstraintChip />
        </div>
      </section>
    </PanelBody>
  );
}

/* ---------------------------------------------------------------- shared -- */

export function PanelBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3.5 flex flex-col gap-5">
      {children}
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Ruler;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-1">
      <Icon className="w-[16px] h-[16px] text-(--fg-muted)" strokeWidth={1.8} />
      <p className="text-[12.5px] font-medium text-(--fg-secondary)">{title}</p>
      <p className="text-[11.5px] leading-relaxed text-(--fg-muted) max-w-[30ch]">{body}</p>
    </div>
  );
}

export function KeyValue({ rows }: { rows: { k: string; v: string }[] }) {
  return (
    <div className="rounded-[6px] border border-(--rule) overflow-hidden">
      {rows.map((row, i) => (
        <div
          key={row.k}
          className={`flex items-center justify-between px-2.5 h-[28px] text-[11.5px] ${
            i > 0 ? "border-t border-(--rule)" : ""
          }`}
        >
          <span className="text-(--fg-secondary)">{row.k}</span>
          <span className="num text-[12px] text-(--fg-primary)">{row.v}</span>
        </div>
      ))}
    </div>
  );
}
