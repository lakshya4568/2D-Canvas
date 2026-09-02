"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ConstraintType, GeometricConstraint } from "@/lib/parametric/constraints";
import { ParametricModel } from "@/lib/parametric/model";

const CONSTRAINT_OPTIONS: { type: ConstraintType; label: string; glyph: string; requiresTwoShapes: boolean; requiresValue?: boolean }[] = [
  { type: "horizontal", label: "Horizontal", glyph: "—", requiresTwoShapes: false },
  { type: "vertical", label: "Vertical", glyph: "|", requiresTwoShapes: false },
  { type: "parallel", label: "Parallel", glyph: "//", requiresTwoShapes: true },
  { type: "perpendicular", label: "Perpendicular", glyph: "⟂", requiresTwoShapes: true },
  { type: "equal_length", label: "Equal Length", glyph: "=", requiresTwoShapes: true },
  { type: "fixed_length", label: "Fixed Length", glyph: "📏", requiresTwoShapes: false, requiresValue: true },
  { type: "concentric", label: "Concentric", glyph: "◎", requiresTwoShapes: true },
  { type: "equal_radius", label: "Equal Radius", glyph: "≅", requiresTwoShapes: true },
  { type: "aspect_ratio", label: "Aspect Ratio", glyph: "▱", requiresTwoShapes: false, requiresValue: true },
  { type: "coincident", label: "Coincident Endpoints", glyph: "•", requiresTwoShapes: true },
];

export const ConstraintsPanel: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [selectedType, setSelectedType] = useState<ConstraintType>("horizontal");
  const [shape1Id, setShape1Id] = useState<string>(state.selectedIds[0] ?? state.shapes[0]?.id ?? "");
  const [shape2Id, setShape2Id] = useState<string>(state.selectedIds[1] ?? state.shapes[1]?.id ?? "");
  const [targetValue, setTargetValue] = useState<string>("100");

  const currentOpt = CONSTRAINT_OPTIONS.find((c) => c.type === selectedType) ?? CONSTRAINT_OPTIONS[0];

  const handleAddConstraint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shape1Id) return;
    if (currentOpt.requiresTwoShapes && !shape2Id) return;

    const constraint: GeometricConstraint = {
      id: "c_" + Math.random().toString(36).substring(2, 9),
      type: selectedType,
      shapeIds: currentOpt.requiresTwoShapes ? [shape1Id, shape2Id] : [shape1Id],
      value: currentOpt.requiresValue ? parseFloat(targetValue) || 100 : undefined,
      enabled: true,
    };

    dispatch({ type: "ADD_CONSTRAINT", constraint });
  };

  const handleToggle = (id: string) => {
    dispatch({ type: "TOGGLE_CONSTRAINT", id });
  };

  const handleDelete = (id: string) => {
    dispatch({ type: "DELETE_CONSTRAINT", id });
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-[var(--accent-draw)]">⟂</span>
          <span className="font-semibold text-[var(--text-primary)]">Geometric Constraints</span>
        </div>
        <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {state.constraints.length} Active
        </span>
      </div>

      {/* Add Constraint Form */}
      <form onSubmit={handleAddConstraint} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2.5 flex flex-col gap-2">
        <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Add Constraint</div>

        {/* Constraint Type */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as ConstraintType)}
          className="rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
        >
          {CONSTRAINT_OPTIONS.map((opt) => (
            <option key={opt.type} value={opt.type}>
              {opt.glyph} {opt.label}
            </option>
          ))}
        </select>

        {/* Shape Selectors */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Primary Shape</label>
            <select
              value={shape1Id}
              onChange={(e) => setShape1Id(e.target.value)}
              className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-1.5 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
            >
              {state.shapes.map((s, idx) => (
                <option key={s.id} value={s.id}>
                  {ParametricModel.getShapeName(s, idx)} ({s.type})
                </option>
              ))}
            </select>
          </div>

          {currentOpt.requiresTwoShapes && (
            <div>
              <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Target Shape</label>
              <select
                value={shape2Id}
                onChange={(e) => setShape2Id(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-1.5 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
              >
                {state.shapes.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    {ParametricModel.getShapeName(s, idx)} ({s.type})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Optional Target Value */}
        {currentOpt.requiresValue && (
          <div>
            <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Target Value</label>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={state.shapes.length === 0}
          className="mt-1 rounded bg-[var(--accent-draw)] py-1 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          + Add Constraint
        </button>
      </form>

      {/* Constraints List */}
      <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
        {state.constraints.length === 0 ? (
          <div className="py-6 text-center text-[var(--text-muted)]">
            No geometric constraints applied yet.<br />
            Add horizontal, parallel, or concentric constraints to bind shapes together.
          </div>
        ) : (
          state.constraints.map((c) => {
            const opt = CONSTRAINT_OPTIONS.find((o) => o.type === c.type);
            const shape1 = state.shapes.find((s) => s.id === c.shapeIds[0]);
            const shape2 = state.shapes.find((s) => s.id === c.shapeIds[1]);
            const s1Name = shape1 ? ParametricModel.getShapeName(shape1, state.shapes.indexOf(shape1)) : c.shapeIds[0];
            const s2Name = shape2 ? ParametricModel.getShapeName(shape2, state.shapes.indexOf(shape2)) : c.shapeIds[1];

            return (
              <div
                key={c.id}
                className={`group flex items-center justify-between rounded border p-2 transition-colors ${
                  c.enabled
                    ? "border-[var(--border-subtle)] bg-[var(--surface-base)]"
                    : "border-[var(--border-subtle)]/40 bg-[var(--surface-sunken)] opacity-60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[var(--accent-draw)]">
                    {opt?.glyph ?? "•"}
                  </span>
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">
                      {opt?.label ?? c.type}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">
                      {s1Name}
                      {s2Name ? ` ↔ ${s2Name}` : ""}
                      {c.value !== undefined ? ` (${c.value})` : ""}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggle(c.id)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      c.enabled
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-[var(--surface-sunken)] text-[var(--text-muted)]"
                    }`}
                  >
                    {c.enabled ? "Active" : "Off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
