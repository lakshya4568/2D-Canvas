"use client";

import React, { useState, useRef } from "react";
import { useDrawing } from "@/lib/state/drawingContext";

export const BottomFormulaBar: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [inputVal, setInputVal] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputVal.trim();
    if (!raw) return;

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

    setFeedback(`✓ ${cleanVarName} = ${expr}`);
    setInputVal("");
    setTimeout(() => setFeedback(null), 3000);
  };

  const allVars = Object.values(state.variables);
  const constants = allVars.filter((v) => !v.formula);
  const formulas = allVars.filter((v) => Boolean(v.formula));

  const handlePillClick = (name: string, valueOrFormula: string | number) => {
    setInputVal(`${name} = ${valueOrFormula}`);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col border-t border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs shadow-lg shrink-0 z-20">
      {/* Top Row: Quick Formula Input & Controls */}
      <div className="flex items-center gap-3 px-4 py-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[var(--accent-draw)] font-bold shrink-0">
          <span>ƒ(x)</span>
          <span className="text-[11px] text-[var(--text-secondary)] font-sans font-medium">Quick Formula:</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="e.g. top_outer_rect = 450, wall_thickness = 25, top_inner_rect = top_outer_rect - 50"
            className="flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none transition-colors"
          />
          <button
            type="submit"
            className="rounded bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-draw)] hover:text-white transition-colors border border-[var(--border-subtle)] shrink-0 cursor-pointer"
          >
            Execute ↵
          </button>
        </form>

        {feedback && (
          <span className="font-mono text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded animate-pulse shrink-0">
            {feedback}
          </span>
        )}
      </div>

      {/* Bottom Row: Clearly Separated Constants & Formulas */}
      {allVars.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-t border-[var(--border-subtle)]/60 bg-[var(--surface-sunken)]/50 text-[10px] overflow-x-auto">
          {/* Constants Group */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono uppercase font-bold text-amber-500/90 text-[9px] tracking-wider shrink-0">
              Constants ({constants.length}):
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {constants.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => handlePillClick(v.name, v.value)}
                  className="flex items-center gap-1 rounded bg-[var(--surface-base)] hover:bg-blue-500/15 hover:border-blue-500/40 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
                  title={`Click to edit constant ${v.name}`}
                >
                  <span className="font-bold text-[var(--text-primary)]">{v.name}:</span>
                  <span className="text-amber-400 font-semibold">{v.value.toFixed(0)}</span>
                </button>
              ))}
              {constants.length === 0 && <span className="text-[var(--text-muted)] italic">none</span>}
            </div>
          </div>

          <div className="h-3 w-[1px] bg-[var(--border-subtle)] shrink-0" />

          {/* Formulas Group */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono uppercase font-bold text-emerald-500/90 text-[9px] tracking-wider shrink-0">
              Formulas ({formulas.length}):
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {formulas.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => handlePillClick(v.name, v.formula || v.value)}
                  className="flex items-center gap-1 rounded bg-[var(--surface-base)] hover:bg-emerald-500/15 hover:border-emerald-500/40 px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
                  title={`Click to edit formula: ${v.name} = ${v.formula}`}
                >
                  <span className="font-bold text-[var(--text-primary)]">{v.name}</span>
                  <span className="text-[var(--text-muted)]">=</span>
                  <span className="text-[var(--text-secondary)] max-w-48 truncate">{v.formula}</span>
                  <span className="text-emerald-400 font-bold">({v.value.toFixed(0)})</span>
                </button>
              ))}
              {formulas.length === 0 && <span className="text-[var(--text-muted)] italic">none</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
