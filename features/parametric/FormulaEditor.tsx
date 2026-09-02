"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { parseFormula, evaluateFormula } from "@/lib/parametric/expression";
import { ParametricModel } from "@/lib/parametric/model";

export const FormulaEditor: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [targetVar, setTargetVar] = useState("W");
  const [expression, setExpression] = useState("200");
  const [feedback, setFeedback] = useState<{ isValid: boolean; message: string } | null>(null);

  const model = new ParametricModel();
  for (const [name, v] of Object.entries(state.variables)) {
    model.setVariable(name, v.formula ?? v.value);
  }
  const symbols = model.buildSymbolTable(state.shapes);

  const handleTestExpression = (expr: string) => {
    setExpression(expr);
    if (!expr.trim()) {
      setFeedback(null);
      return;
    }

    const parseRes = parseFormula(expr);
    if (parseRes.error) {
      setFeedback({ isValid: false, message: `Syntax Error: ${parseRes.error}` });
      return;
    }

    const evalRes = evaluateFormula(expr, symbols);
    if (evalRes.error) {
      setFeedback({ isValid: false, message: `Evaluation Error: ${evalRes.error}` });
    } else {
      setFeedback({
        isValid: true,
        message: `Result = ${evalRes.value.toFixed(2)}${parseRes.dependencies.length > 0 ? ` (depends on: ${parseRes.dependencies.join(", ")})` : ""}`,
      });
    }
  };

  const handleApplyFormula = () => {
    const cleanTarget = targetVar.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!cleanTarget) return;

    dispatch({
      type: "SET_VARIABLE",
      name: cleanTarget,
      valueOrFormula: expression.trim(),
    });
  };

  const insertFunction = (fn: string) => {
    const nextExpr = expression ? `${expression} * ${fn}` : fn;
    handleTestExpression(nextExpr);
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-[var(--accent-draw)]">Σ</span>
          <span className="font-semibold text-[var(--text-primary)]">Formula & Expression Editor</span>
        </div>
      </div>

      {/* Target variable picker */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-[var(--text-secondary)]">Target Variable</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={targetVar}
            onChange={(e) => setTargetVar(e.target.value)}
            placeholder="e.g. Height, InnerWidth"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-sunken)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
          />
          <span className="font-mono text-base font-bold text-[var(--text-muted)]">=</span>
        </div>
      </div>

      {/* Expression input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-[var(--text-secondary)]">Mathematical Formula</label>
        <textarea
          rows={3}
          value={expression}
          onChange={(e) => handleTestExpression(e.target.value)}
          placeholder="e.g. Width * 0.8 + sqrt(16) or hypot(dx, dy)"
          className="w-full resize-none rounded border border-[var(--border-default)] bg-[var(--surface-sunken)] p-2 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none"
        />
      </div>

      {/* Live Validation Feedback */}
      {feedback && (
        <div
          className={`rounded border p-2 text-[11px] font-mono ${
            feedback.isValid
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/40 bg-red-500/10 text-red-400"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Math function shortcuts */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] text-[var(--text-muted)]">Quick Functions:</div>
        <div className="flex flex-wrap gap-1">
          {["sqrt(x)", "sin(deg)", "cos(deg)", "tan(deg)", "hypot(a,b)", "abs(x)", "min(a,b)", "max(a,b)"].map(
            (fn) => (
              <button
                key={fn}
                type="button"
                onClick={() => insertFunction(fn)}
                className="rounded bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
              >
                {fn}
              </button>
            )
          )}
        </div>
      </div>

      {/* Apply Button */}
      <button
        type="button"
        onClick={handleApplyFormula}
        disabled={!expression.trim() || feedback?.isValid === false}
        className="w-full rounded bg-[var(--accent-draw)] py-1.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Apply Formula to Model
      </button>

      {/* Active Symbol Table Reference */}
      <div className="rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-2 flex flex-col gap-1">
        <div className="text-[11px] font-medium text-[var(--text-secondary)]">Available Variables</div>
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
          {Object.entries(symbols).map(([sym, val]) => (
            <button
              key={sym}
              type="button"
              onClick={() => handleTestExpression(expression ? `${expression} + ${sym}` : sym)}
              className="rounded border border-[var(--border-subtle)] bg-[var(--surface-base)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--accent-draw)] hover:border-[var(--accent-draw)]"
            >
              {sym}: {val.toFixed(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
