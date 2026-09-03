"use client";

import React, { useState, useRef, useEffect } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ParametricModel } from "@/lib/parametric/model";
import { detectGADAssemblies } from "@/lib/geometry/gadAssemblyEngine";

export const BottomFormulaBar: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [inputVal, setInputVal] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Active single selected shape
  const selectedShape =
    state.selectedIds.length === 1
      ? state.shapes.find((s) => s.id === state.selectedIds[0])
      : null;

  const shapeIndex = selectedShape ? state.shapes.indexOf(selectedShape) : -1;
  const selectedVarName = selectedShape
    ? selectedShape.name || ParametricModel.getShapeName(selectedShape, shapeIndex)
    : null;

  const selectedVar = selectedVarName
    ? (selectedShape?.name && state.variables[selectedShape.name]) || state.variables[selectedVarName]
    : null;

  // Whenever user clicks on a line/shape, automatically show its constant in the formula bar!
  useEffect(() => {
    if (!selectedShape) return;

    if (selectedVar) {
      setInputVal(`${selectedVar.name} = ${selectedVar.formula ? selectedVar.formula : selectedVar.value}`);
    } else if (selectedShape.type === "line" || selectedShape.type === "arrow") {
      const len = Math.round(Math.hypot(selectedShape.x2 - selectedShape.x1, selectedShape.y2 - selectedShape.y1));
      setInputVal(`${selectedVarName} = ${len}`);
    } else if (selectedShape.type === "rectangle") {
      setInputVal(`${selectedVarName}.width = ${Math.round(selectedShape.width)}`);
    }
  }, [selectedShape?.id, selectedShape?.name, selectedVar?.value, selectedVar?.formula]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputVal.trim();
    if (!raw) return;

    const eqIndex = raw.indexOf("=");
    let varName = selectedVarName || "W";
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

    const num = Number(expr);
    if (!isNaN(num) && num > 0) {
      const assemblies = detectGADAssemblies(state.shapes);
      if (assemblies.length > 0) {
        const selectedShape = state.shapes.find((s) => s.id === state.selectedId);
        if (selectedShape?.type === "circle") {
          dispatch({
            type: "ADJUST_GAD_ASSEMBLY",
            target: {
              shapeId: state.selectedId ?? undefined,
              newRadius: num,
            },
          });
        } else {
          dispatch({
            type: "ADJUST_GAD_ASSEMBLY",
            target: {
              shapeId: state.selectedId ?? undefined,
              newSpan: num,
            },
          });
        }
      }
    }

    setFeedback(`✓ ${cleanVarName} = ${expr}`);
    setTimeout(() => setFeedback(null), 3000);
  };

  const allVars = Object.values(state.variables);
  const constants = allVars.filter((v) => !v.formula);
  const formulas = allVars.filter((v) => Boolean(v.formula));

  const handlePillClick = (name: string, valueOrFormula: string | number) => {
    setInputVal(`${name} = ${valueOrFormula}`);
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  return (
    <div className="flex flex-col border-t border-[var(--border-subtle)] bg-[var(--surface-base)] text-xs shadow-lg shrink-0 z-20">
      {/* Top Row: Quick Formula Input & Controls */}
      <div className="flex items-center gap-2.5 px-4 py-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[var(--accent-draw)] font-bold shrink-0">
          <span>ƒ(x)</span>
          <span className="text-[11px] text-[var(--text-secondary)] font-sans font-medium">Quick Formula:</span>
        </div>

        {selectedVar && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/40 font-mono text-[11px] text-blue-400 shrink-0 shadow-sm animate-fadeIn">
            <span className="text-[9px] uppercase tracking-wider text-blue-300/80 font-sans font-semibold">Active Line:</span>
            <span className="font-bold text-[var(--text-primary)]">{selectedVar.name}</span>
            <span className="text-[var(--text-muted)]">=</span>
            <span className="text-amber-400 font-bold">{selectedVar.value.toFixed(0)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="e.g. clear_span = 500, wall_thickness = 30, Span_1 = 400"
            className="flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs text-[var(--text-primary)] focus:border-[var(--accent-draw)] focus:outline-none transition-colors"
          />
          <button
            type="submit"
            className="rounded bg-[var(--surface-sunken)] px-3 py-1 font-mono text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-draw)] hover:text-white transition-colors border border-[var(--border-subtle)] shrink-0 cursor-pointer"
          >
            Execute ↵
          </button>
        </form>

        <div className="flex items-center gap-1.5 shrink-0 border-l border-[var(--border-subtle)] pl-2">
          <button
            type="button"
            onClick={() => dispatch({ type: "INSTANTIATE_TEMPLATE", templateId: "single_cell_box_culvert" })}
            className="rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-1 font-mono text-[11px] font-semibold transition-colors cursor-pointer"
            title="Load Single-Cell Box Culvert Benchmark"
          >
            Culvert (1-Cell)
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "INSTANTIATE_TEMPLATE", templateId: "two_span_box_culvert" })}
            className="rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-1 font-mono text-[11px] font-semibold transition-colors cursor-pointer"
            title="Load Two-Span Box Culvert Benchmark"
          >
            Culvert (2-Span)
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "INSTANTIATE_TEMPLATE", templateId: "rcc_bridge" })}
            className="rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 font-mono text-[11px] font-semibold transition-colors cursor-pointer"
            title="Load Parametric RCC Box Girder Bridge Benchmark"
          >
            RCC Bridge
          </button>
        </div>

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
              {constants.map((v) => {
                const isActive = selectedVarName === v.name;
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => handlePillClick(v.name, v.value)}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] border cursor-pointer transition-all ${
                      isActive
                        ? "bg-blue-500/25 border-blue-400 text-white font-bold ring-1 ring-blue-400"
                        : "bg-[var(--surface-base)] hover:bg-blue-500/15 hover:border-blue-500/40 text-[var(--text-secondary)] border-[var(--border-subtle)]"
                    }`}
                    title={`Click to edit constant ${v.name}`}
                  >
                    <span className={isActive ? "text-blue-300 font-bold" : "font-bold text-[var(--text-primary)]"}>
                      {v.name}:
                    </span>
                    <span className="text-amber-400 font-semibold">{v.value.toFixed(0)}</span>
                  </button>
                );
              })}
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
              {formulas.map((v) => {
                const isActive = selectedVarName === v.name;
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => handlePillClick(v.name, v.formula || v.value)}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] border cursor-pointer transition-all ${
                      isActive
                        ? "bg-emerald-500/25 border-emerald-400 text-white font-bold ring-1 ring-emerald-400"
                        : "bg-[var(--surface-base)] hover:bg-emerald-500/15 hover:border-emerald-500/40 text-[var(--text-secondary)] border-[var(--border-subtle)]"
                    }`}
                    title={`Click to edit formula: ${v.name} = ${v.formula}`}
                  >
                    <span className={isActive ? "text-emerald-300 font-bold" : "font-bold text-[var(--text-primary)]"}>
                      {v.name}
                    </span>
                    <span className="text-[var(--text-muted)]">=</span>
                    <span className="text-[var(--text-secondary)] max-w-48 truncate">{v.formula}</span>
                    <span className="text-emerald-400 font-bold">({v.value.toFixed(0)})</span>
                  </button>
                );
              })}
              {formulas.length === 0 && <span className="text-[var(--text-muted)] italic">none</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
