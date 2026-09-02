"use client";

import React, { useState, useRef, useEffect } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape } from "@/lib/geometry/types";
import { lineMetrics } from "@/lib/geometry/metrics";
import { ParametricModel } from "@/lib/parametric/model";

interface ParametricDimensionOverlayProps {
  scale: number;
}

export const ParametricDimensionOverlay: React.FC<ParametricDimensionOverlayProps> = ({ scale }) => {
  const { state, dispatch } = useDrawing();
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
      const eqIdx = trimmed.indexOf("=");
      let varName = shape.name || ParametricModel.getShapeName(shape, state.shapes.indexOf(shape));
      let expr = trimmed;

      if (eqIdx !== -1) {
        varName = trimmed.substring(0, eqIdx).trim();
        expr = trimmed.substring(eqIdx + 1).trim();
      }

      if (varName && varName !== shape.name) {
        dispatch({
          type: "UPDATE_SHAPE",
          id: shape.id,
          updates: { name: varName },
        });
      }

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

        // Only show badge when the shape is specifically clicked / selected
        if (!isSelected) {
          return null;
        }

        let badgeX = 0;
        let badgeY = 0;
        let displayLabel = "";
        let rawExpr = "";
        let isFormulaDriven = false;

        if (shape.type === "line" || shape.type === "arrow") {
          const metrics = lineMetrics({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
          const len = metrics.length;
          if (len < 8) return null;

          const dx = Math.abs(shape.x2 - shape.x1);
          const dy = Math.abs(shape.y2 - shape.y1);
          const isHorizontal = dx >= dy;
          const name = shape.name || "";

          // Calculate directional non-colliding offsets
          if (isHorizontal) {
            // Horizontal lines: offset above or below
            badgeX = metrics.midpoint.x;
            const isTop = name.includes("top");
            const isBottom = name.includes("bot");
            const isInner = name.includes("inner");

            if (isTop) {
              badgeY = metrics.midpoint.y - (isInner ? -13 : 14) / scale;
            } else if (isBottom) {
              badgeY = metrics.midpoint.y + (isInner ? -13 : 14) / scale;
            } else {
              badgeY = metrics.midpoint.y - 12 / scale;
            }
          } else {
            // Vertical lines: offset left/right AND stagger vertically for zero collision
            const isLeft = name.includes("left");
            const isRight = name.includes("right");
            const isInner = name.includes("inner");

            // Stagger vertically by 28px so inner and outer vertical badges never collide
            badgeY = metrics.midpoint.y + (isInner ? 28 : -28) / scale;

            if (isLeft) {
              badgeX = metrics.midpoint.x - (isInner ? -36 : 44) / scale;
            } else if (isRight) {
              badgeX = metrics.midpoint.x + (isInner ? -36 : 44) / scale;
            } else {
              badgeX = metrics.midpoint.x + 30 / scale;
            }
          }

          const boundVar = (shape.name && state.variables[shape.name]) || state.variables[`Line_${state.shapes.indexOf(shape) + 1}`];

          if (boundVar) {
            isFormulaDriven = Boolean(boundVar.formula);
            rawExpr = boundVar.formula ? boundVar.formula : String(Math.round(len));
            displayLabel = `${boundVar.name}: ${Math.round(len)}`;
          } else if (shape.name) {
            rawExpr = String(Math.round(len));
            displayLabel = `${shape.name}: ${Math.round(len)}`;
          } else {
            rawExpr = String(Math.round(len));
            displayLabel = `${Math.round(len)}`;
          }
        } else if (shape.type === "rectangle") {
          badgeX = shape.x + shape.width / 2;
          badgeY = shape.y - 10 / scale;
          const boundVarW = (shape.name && state.variables[`${shape.name}.width`]) || state.variables.W || state.variables.Width;
          if (boundVarW) {
            isFormulaDriven = Boolean(boundVarW.formula);
            rawExpr = boundVarW.formula ? boundVarW.formula : String(Math.round(shape.width));
            displayLabel = `${boundVarW.name}: ${Math.round(shape.width)} × ${Math.round(shape.height)}`;
          } else {
            rawExpr = String(Math.round(shape.width));
            displayLabel = `${shape.name ? `${shape.name}: ` : ""}${Math.round(shape.width)} × ${Math.round(shape.height)}`;
          }
        } else {
          return null;
        }

        const isEditing = editingShapeId === shape.id;
        const fontSize = Math.max(9, Math.min(10.5, 9.5 / Math.sqrt(scale)));
        const badgeWidth = Math.max(30, (displayLabel.length + 1.5) * (fontSize * 0.58)) / scale;
        const badgeHeight = 15 / scale;
        const isDark = state.themeMode !== "light";

        return (
          <g
            key={`param-badge-${shape.id}`}
            transform={`translate(${badgeX}, ${badgeY})`}
            className="select-none"
          >
            {isEditing ? (
              <foreignObject
                x={-60 / scale}
                y={-10 / scale}
                width={120 / scale}
                height={22 / scale}
                className="overflow-visible"
              >
                <div
                  className="flex items-center gap-1 rounded bg-slate-900/95 border border-blue-500/80 px-1 py-0.5 shadow-sm"
                  style={{
                    transformOrigin: "center center",
                    transform: `scale(${1 / scale})`,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, shape)}
                    onBlur={() => handleCommitEdit(shape)}
                    className="w-full bg-transparent px-0.5 font-mono text-[10px] text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleCommitEdit(shape);
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 px-0.5 cursor-pointer font-bold"
                  >
                    ↵
                  </button>
                </div>
              </foreignObject>
            ) : (
              <g
                className="cursor-pointer group"
                onPointerDown={(e) => handleStartEdit(shape, rawExpr, e)}
              >
                <title>{isFormulaDriven ? `Formula: ${rawExpr} (Click to edit)` : "Click to edit dimension"}</title>

                {/* Minimalist Flat Backdrop */}
                <rect
                  x={-badgeWidth / 2}
                  y={-badgeHeight / 2}
                  width={badgeWidth}
                  height={badgeHeight}
                  rx={2 / scale}
                  fill={isDark ? "rgba(13, 14, 17, 0.85)" : "rgba(255, 255, 255, 0.95)"}
                  stroke={
                    isSelected
                      ? "#0066ff"
                      : isFormulaDriven
                      ? "rgba(34, 197, 94, 0.5)"
                      : isDark
                      ? "rgba(255, 255, 255, 0.12)"
                      : "rgba(0, 0, 0, 0.15)"
                  }
                  strokeWidth={0.8 / scale}
                  className="transition-colors group-hover:border-blue-400"
                />

                {/* Formula indicator dot */}
                {isFormulaDriven && (
                  <circle
                    cx={-badgeWidth / 2 + 4 / scale}
                    cy={0}
                    r={1.4 / scale}
                    fill="#22c55e"
                  />
                )}

                {/* Crisp Minimalist Monospace Text */}
                <text
                  x={isFormulaDriven ? 2.5 / scale : 0}
                  y={0.5 / scale}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isDark ? "#e2e8f0" : "#0f172a"}
                  fontSize={fontSize}
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                  fontWeight="500"
                  letterSpacing="-0.01em"
                  className="group-hover:fill-blue-400"
                >
                  {displayLabel}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};
