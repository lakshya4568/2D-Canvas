"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { parseFormula, evaluateFormula } from "@/lib/parametric/expression";

export const BottomFormulaBar: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [inputVal, setInputVal] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputVal.trim();
    if (!raw) return;

    // Check if format is "VarName = Expression" or just "Expression"
    const eqIndex = raw.indexOf("=");
    let varName = "W";
    let expr = raw;

    if (eqIndex !== -1) {
      varName = raw.substring(0, eqIndex).trim();
      expr = raw.substring(eqIndex + 1).trim();
    }

    const cleanVarName = varName.replace(/[^a-zA-Z0-9_.]/g, "");
    if (!cleanVarName) {
      setFeedback("Invalid variable name");
      return;
    }

    dispatch({
      type: "SET_VARIABLE",
      name: cleanVarName,
      valueOrFormula: expr,
    });

    setFeedback(`Updated ${cleanVarName} = ${expr}`);
    setInputVal("");
    setTimeout(() => setFeedback(null), 3000);
  };

  const activeVariables = Object.values(state.variables);

  return (
    <div className="flex items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-2 text-xs shadow-lg shrink-0 z-20">
      <div className="flex items-center gap-1.5 font-mono text-[var(--accent-draw)] font-bold">
        <span>ƒ(x)</span>
        <span className="text-[11px] text-[var(--text-secondary)] font-sans font-medium">Quick Formula:</span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="e.g. W = 400, H = W * 0.5, L2 = L1 * 2, InnerW = Width * 0.8"
          className="flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none transition-colors"
        />
        <button
          type="submit"
          className="rounded bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-draw)] hover:text-white transition-colors border border-[var(--border-subtle)]"
        >
          Execute ↵
        </button>
      </form>

      {/* Quick feedback status chip */}
      {feedback && (
        <span className="font-mono text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded animate-pulse">
          {feedback}
        </span>
      )}

      {/* Active variables preview pills */}
      {activeVariables.length > 0 && (
        <div className="hidden md:flex items-center gap-1.5 border-l border-[var(--border-subtle)] pl-3">
          {activeVariables.slice(0, 3).map((v) => (
            <div
              key={v.name}
              className="flex items-center gap-1 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              title={v.formula ? `${v.name} = ${v.formula}` : undefined}
            >
              <span className="text-[var(--accent-draw)] font-bold">{v.name}:</span>
              <span>{v.value.toFixed(1)}</span>
            </div>
          ))}
          {activeVariables.length > 3 && (
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              +{activeVariables.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
};
