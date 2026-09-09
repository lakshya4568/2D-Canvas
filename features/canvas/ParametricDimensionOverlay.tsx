"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape } from "@/lib/geometry/types";
import { lineMetrics } from "@/lib/geometry/metrics";
import { ParametricModel } from "@/lib/parametric/model";
import { DimensionBadge, BadgeVisualState } from "./DimensionBadge";
import { ParameterManager } from "@/lib/parametric/parameterManager";

interface ParametricDimensionOverlayProps {
  scale: number;
}

export const ParametricDimensionOverlay: React.FC<ParametricDimensionOverlayProps> = ({ scale }) => {
  const { state, dispatch } = useDrawing();

  const handleCommitBadge = (shape: Shape, newValue: string, paramName?: string) => {
    const trimmed = newValue.trim();
    if (!trimmed) return;

    const parsedNum = Number(trimmed);
    const shapeIdx = state.shapes.indexOf(shape);
    const defName = ParametricModel.getShapeName(shape, shapeIdx);
    const boundVarW =
      (shape.name && (state.variables[`${shape.name}_Width`] || state.variables[`${shape.name}.width`] || state.variables[`${shape.name}_width`])) ||
      state.variables[`${defName}_Width`] ||
      state.variables[`${defName}.width`] ||
      state.variables[`${defName}_width`] ||
      state.variables.W ||
      state.variables.Width;

    const targetVarName =
      paramName ??
      boundVarW?.name ??
      (shape.type === "rectangle"
        ? `${shape.name || defName}_Width`
        : `${shape.name || defName}_Length`);

    const paramMgr = new ParameterManager();
    if (!isNaN(parsedNum) && parsedNum > 0) {
      // UPCE-MASTER-1.0 §61, §2 Constraint 14:
      // Badge commits route through ParameterManager.setDriving() + constraint node + re-solve.
      // NEVER mutate shape.width or shape.x2 directly!
      paramMgr.setDriving(targetVarName, parsedNum);
      dispatch({
        type: "SET_VARIABLE",
        name: targetVarName,
        valueOrFormula: parsedNum,
      });
    } else {
      const eqIdx = trimmed.indexOf("=");
      let varName = targetVarName;
      let expr = trimmed;

      if (eqIdx !== -1) {
        varName = trimmed.substring(0, eqIdx).trim();
        expr = trimmed.substring(eqIdx + 1).trim();
      }

      dispatch({
        type: "SET_VARIABLE",
        name: varName,
        valueOrFormula: expr,
      });
    }
  };

  return (
    <g id="parametric-dimensions-layer">
      {state.shapes.map((shape, index) => {
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
        let targetVarName = "";

        if (shape.type === "line" || shape.type === "arrow") {
          const metrics = lineMetrics({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
          const len = metrics.length;
          if (len < 8) return null;

          const dx = Math.abs(shape.x2 - shape.x1);
          const dy = Math.abs(shape.y2 - shape.y1);
          const isHorizontal = dx >= dy;
          const name = shape.name || "";

          // Calculate directional non-colliding offsets with clearance for selection handles
          if (isHorizontal) {
            badgeX = metrics.midpoint.x;
            const isTop = name.includes("top");
            const isBottom = name.includes("bot");
            const isInner = name.includes("inner");

            if (isTop) {
              // 38px clearance above the selection box rotation handle
              badgeY = metrics.midpoint.y - (isInner ? -16 : (isSelected ? 38 : 16)) / scale;
            } else if (isBottom) {
              badgeY = metrics.midpoint.y + (isInner ? -16 : (isSelected ? 26 : 16)) / scale;
            } else {
              badgeY = metrics.midpoint.y - (isSelected ? 38 : 14) / scale;
            }
          } else {
            // Vertical lines: clearance for handles
            const isLeft = name.includes("left");
            const isRight = name.includes("right");
            const isInner = name.includes("inner");

            badgeY = metrics.midpoint.y + (isInner ? 28 : -28) / scale;

            if (isLeft) {
              badgeX = metrics.midpoint.x - (isInner ? -40 : (isSelected ? 52 : 44)) / scale;
            } else if (isRight) {
              badgeX = metrics.midpoint.x + (isInner ? -40 : (isSelected ? 52 : 44)) / scale;
            } else {
              badgeX = metrics.midpoint.x + (isSelected ? 44 : 30) / scale;
            }
          }

          const shapeIdx = state.shapes.indexOf(shape);
          const defName = ParametricModel.getShapeName(shape, shapeIdx);
          const boundVar =
            (shape.name && state.variables[shape.name]) ||
            state.variables[defName] ||
            state.variables[`L${shapeIdx + 1}`] ||
            state.variables[`Line_${shapeIdx + 1}`];

          targetVarName = boundVar?.name ?? (shape.name || defName);

          if (state.userMode === "draftsman") {
            displayLabel = `${Math.round(len)} mm`;
            rawExpr = String(Math.round(len));
          } else if (boundVar) {
            isFormulaDriven = Boolean(boundVar.formula);
            rawExpr = boundVar.formula ? boundVar.formula : String(Math.round(len));
            displayLabel = `${boundVar.name}: ${Math.round(len)}`;
          } else {
            rawExpr = String(Math.round(len));
            displayLabel = `${shape.name || defName}: ${Math.round(len)}`;
          }
        } else if (shape.type === "rectangle") {
          badgeX = shape.x + shape.width / 2;
          badgeY = shape.y - 10 / scale;
          const shapeIdx = state.shapes.indexOf(shape);
          const defName = ParametricModel.getShapeName(shape, shapeIdx);
          const boundVarW =
            (shape.name && (state.variables[`${shape.name}_Width`] || state.variables[`${shape.name}.width`] || state.variables[`${shape.name}_width`])) ||
            state.variables[`${defName}_Width`] ||
            state.variables[`${defName}.width`] ||
            state.variables[`${defName}_width`] ||
            state.variables.W ||
            state.variables.Width;

          targetVarName = boundVarW?.name ?? (shape.name ? `${shape.name}_Width` : `${defName}_Width`);

          if (state.userMode === "draftsman") {
            displayLabel = `${Math.round(shape.width)} × ${Math.round(shape.height)} mm`;
            rawExpr = String(Math.round(shape.width));
          } else if (boundVarW) {
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

        const visualState: BadgeVisualState = isFormulaDriven ? "derived" : "driving";
        const isEditable = !isFormulaDriven;

        return (
          <DimensionBadge
            key={`param-badge-${shape.id}-${index}`}
            shape={shape}
            scale={scale}
            x={badgeX}
            y={badgeY}
            label={displayLabel}
            value={rawExpr}
            paramName={targetVarName}
            visualState={visualState}
            isEditable={isEditable}
            onCommit={(val, pName) => handleCommitBadge(shape, val, pName)}
          />
        );
      })}
    </g>
  );
};
