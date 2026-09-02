"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ParametricVariable } from "@/lib/parametric/model";

export const VariablesPanel: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [varName, setVarName] = useState("");
  const [varFormula, setVarFormula] = useState("");
  const [varUnit, setVarUnit] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editFormula, setEditFormula] = useState("");

  const variableList = Object.values(state.variables);

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = varName.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!cleanName) return;

    dispatch({
      type: "SET_VARIABLE",
      name: cleanName,
      valueOrFormula: varFormula.trim() || 0,
      description: varUnit ? `Unit: ${varUnit}` : undefined,
    });

    setVarName("");
    setVarFormula("");
    setVarUnit("");
  };

  const handleSaveEdit = (name: string) => {
    dispatch({
      type: "SET_VARIABLE",
      name,
      valueOrFormula: editFormula.trim() || 0,
    });
    setEditingName(null);
  };

  const handleDelete = (name: string) => {
    dispatch({ type: "DELETE_VARIABLE", name });
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-[var(--accent-draw)]">ƒ(x)</span>
          <span className="font-semibold text-[var(--text-primary)]">Variables & Parameters</span>
        </div>
        <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {variableList.length} Active
        </span>
      </div>

      {/* Errors alert if any */}
      {state.parametricErrors.length > 0 && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2.5 text-red-400">
          <div className="font-semibold flex items-center gap-1">
            <span>⚠</span> Parameter Diagnostics
          </div>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
            {state.parametricErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Add Variable Form */}
      <form onSubmit={handleAddVariable} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2.5 flex flex-col gap-2">
        <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Create Variable</div>
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Name (e.g. W)"
            value={varName}
            onChange={(e) => setVarName(e.target.value)}
            className="col-span-1 rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
          />
          <input
            type="text"
            placeholder="Value or formula (e.g. 200, W * 0.5)"
            value={varFormula}
            onChange={(e) => setVarFormula(e.target.value)}
            className="col-span-2 rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <input
            type="text"
            placeholder="Unit (e.g. mm, deg)"
            value={varUnit}
            onChange={(e) => setVarUnit(e.target.value)}
            className="w-24 rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!varName.trim()}
            className="rounded bg-[var(--accent-draw)] px-3 py-1 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            + Add Variable
          </button>
        </div>
      </form>

      {/* Variables List */}
      <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1">
        {variableList.length === 0 ? (
          <div className="py-6 text-center text-[var(--text-muted)]">
            No variables defined yet.<br />
            Define variables like <span className="font-mono text-[var(--accent-draw)]">W = 200</span> or <span className="font-mono text-[var(--accent-draw)]">H = W * 0.5</span> to control shapes dynamically.
          </div>
        ) : (
          variableList.map((v) => {
            const isEditing = editingName === v.name;

            return (
              <div
                key={v.name}
                className="group flex flex-col gap-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2 transition-colors hover:border-[var(--border-strong)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[var(--accent-draw)]">{v.name}</span>
                    {v.unit && (
                      <span className="rounded bg-[var(--surface-sunken)] px-1 py-0.2 font-mono text-[9px] text-[var(--text-muted)]">
                        {v.unit}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          handleSaveEdit(v.name);
                        } else {
                          setEditingName(v.name);
                          setEditFormula(v.formula ?? String(v.value));
                        }
                      }}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                      title={isEditing ? "Save" : "Edit Formula"}
                    >
                      {isEditing ? "✓" : "✎"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(v.name)}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="text"
                      value={editFormula}
                      onChange={(e) => setEditFormula(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(v.name);
                        if (e.key === "Escape") setEditingName(null);
                      }}
                      autoFocus
                      className="w-full rounded border border-[var(--accent-draw)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-xs text-[var(--text-primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(v.name)}
                      className="rounded bg-[var(--accent-draw)] px-2 py-0.5 text-[10px] text-white"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <div className="text-[var(--text-muted)] truncate max-w-[140px]">
                      {v.formula ? `= ${v.formula}` : "constant"}
                    </div>
                    <div className="font-bold text-[var(--text-primary)]">
                      {v.value.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
