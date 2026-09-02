"use client";

import React, { useState, useRef, useEffect } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape } from "@/lib/geometry/types";
import { lineMetrics, formatDimension } from "@/lib/geometry/metrics";
import { ParametricModel } from "@/lib/parametric/model";

interface ParametricDimensionOverlayProps {
  scale: number;
}

export const ParametricDimensionOverlay: React.FC<ParametricDimensionOverlayProps> = ({ scale }) => {
  const { state, dispatch } = useDrawing();
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (editingShapeId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingShapeId]);

  const handleStartEdit = (shape: Shape, currentExpr: string, e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingShapeId(shape.id);
    setEditValue(currentExpr);
  };

  const handleCommitEdit = (shape: Shape) => {
    if (!editingShapeId) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      // Determine variable name and expression
      // Supports formats: "top_outer_rect = 350", "350", or "top_outer_rect - 40"
      const eqIdx = trimmed.indexOf("=");
      let varName = shape.name || ParametricModel.getShapeName(shape, state.shapes.indexOf(shape));
      let expr = trimmed;

      if (eqIdx !== -1) {
        varName = trimmed.substring(0, eqIdx).trim();
        expr = trimmed.substring(eqIdx + 1).trim();
      }

      // Update shape name if newly specified
      if (varName && varName !== shape.name) {
        dispatch({
          type: "UPDATE_SHAPE",
          id: shape.id,
          updates: { name: varName },
        });
      }

      // Dispatch variable update which runs dependency graph and re-solves model
      dispatch({
        type: "SET_VARIABLE",
        name: varName,
        valueOrFormula: expr,
      });
    }

    setEditingShapeId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, shape: Shape) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      handleCommitEdit(shape);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setEditingShapeId(null);
    }
  };

  return (
    <g id="parametric-dimensions-layer">
      {state.shapes.map((shape) => {
        if (shape.isVisible === false) return null;

        const isSelected = state.selectedIds.includes(shape.id);
        const hasVariable = Boolean(
          (shape.name && state.variables[shape.name]) ||
          state.variables[ParametricModel.getShapeName(shape, state.shapes.indexOf(shape))]
        );

        // Always show for selected shapes or shapes with variables, or when showDimensions is on
        if (!state.showDimensions && !isSelected && !hasVariable) {
          return null;
        }

        let badgeX = 0;
        let badgeY = 0;
        let currentValueStr = "";
        let rawExpr = "";

        if (shape.type === "line" || shape.type === "arrow") {
          const metrics = lineMetrics({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
          badgeX = metrics.midpoint.x;
          badgeY = metrics.midpoint.y - 18 / scale;
          const currentL = metrics.length;
          const boundVar = (shape.name && state.variables[shape.name]) || state.variables[`Line_${state.shapes.indexOf(shape) + 1}`];

          if (boundVar) {
            rawExpr = boundVar.formula ? boundVar.formula : String(boundVar.value);
            currentValueStr = boundVar.formula
              ? `${boundVar.name} = ${boundVar.formula} (${currentL.toFixed(1)})`
              : `${boundVar.name} = ${currentL.toFixed(1)}`;
          } else if (shape.name) {
            rawExpr = currentL.toFixed(1);
            currentValueStr = `${shape.name} = ${currentL.toFixed(1)}`;
          } else {
            rawExpr = currentL.toFixed(1);
            currentValueStr = `L: ${formatDimension(currentL)}`;
          }
        } else if (shape.type === "rectangle") {
          badgeX = shape.x + shape.width / 2;
          badgeY = shape.y - 18 / scale;
          const boundVarW = (shape.name && state.variables[`${shape.name}.width`]) || state.variables.W || state.variables.Width;
          if (boundVarW) {
            rawExpr = boundVarW.formula ? boundVarW.formula : String(boundVarW.value);
            currentValueStr = `${boundVarW.name} = ${shape.width.toFixed(1)} × ${shape.height.toFixed(1)}`;
          } else {
            rawExpr = `${shape.width.toFixed(1)}`;
            currentValueStr = `${shape.name ? `${shape.name}: ` : ""}${formatDimension(shape.width)} × ${formatDimension(shape.height)}`;
          }
        } else {
          return null;
        }

        const isEditing = editingShapeId === shape.id;
        const fontSize = Math.max(10, Math.min(13, 11 / Math.sqrt(scale)));
        const badgeWidth = Math.max(80, (currentValueStr.length + 4) * (fontSize * 0.62)) / scale;
        const badgeHeight = 22 / scale;

        return (
          <g
            key={`param-badge-${shape.id}`}
            transform={`translate(${badgeX}, ${badgeY})`}
            className="select-none"
          >
            {isEditing ? (
              <foreignObject
                x={-badgeWidth / 2}
                y={-badgeHeight / 2}
                width={Math.max(160 / scale, badgeWidth + 50 / scale)}
                height={badgeHeight * 2}
                className="overflow-visible"
              >
                <div
                  className="flex items-center gap-1 rounded bg-slate-900 p-1 shadow-2xl border-2 border-blue-500"
                  style={{
                    transformOrigin: "center center",
                    transform: `scale(${1 / scale})`,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-mono font-bold text-blue-400 pl-1">ƒ(x)</span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, shape)}
                    onBlur={() => handleCommitEdit(shape)}
                    placeholder="e.g. 400 or top_outer - 40"
                    className="w-36 rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleCommitEdit(shape);
                    }}
                    className="rounded bg-blue-600 px-1.5 py-0.5 font-sans text-[10px] font-bold text-white hover:bg-blue-500 cursor-pointer"
                  >
                    ✓
                  </button>
                </div>
              </foreignObject>
            ) : (
              <g
                className="cursor-pointer group"
                onPointerDown={(e) => handleStartEdit(shape, rawExpr || currentValueStr, e)}
              >
                <title>Click to edit variable / formula directly on canvas</title>
                {/* Badge Background Pill */}
                <rect
                  x={-badgeWidth / 2}
                  y={-badgeHeight / 2}
                  width={badgeWidth}
                  height={badgeHeight}
                  rx={4 / scale}
                  fill="rgba(15, 23, 42, 0.90)"
                  stroke={hasVariable ? "var(--accent-draw)" : isSelected ? "#0066ff" : "var(--border-strong)"}
                  strokeWidth={(hasVariable || isSelected ? 1.5 : 1) / scale}
                  strokeDasharray={hasVariable ? undefined : `${3 / scale}, ${2 / scale}`}
                  className="transition-all duration-150 group-hover:stroke-blue-400 group-hover:fill-slate-900"
                  style={{
                    filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                  }}
                />

                {/* Variable Symbol ƒ(x) */}
                {hasVariable && (
                  <text
                    x={-badgeWidth / 2 + 8 / scale}
                    y={1 / scale}
                    textAnchor="start"
                    dominantBaseline="middle"
                    fill="var(--accent-draw)"
                    fontSize={fontSize * 0.9}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    ƒ(x)
                  </text>
                )}

                {/* Main Label: Variable Name & Length/Value */}
                <text
                  x={hasVariable ? 4 / scale : 0}
                  y={1 / scale}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#f8fafc"
                  fontSize={fontSize}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                  letterSpacing="0.02em"
                  className="group-hover:fill-blue-300"
                >
                  {currentValueStr}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};
