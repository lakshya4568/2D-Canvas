"use client";

import React, { useState, useRef, useEffect } from "react";
import { Shape } from "@/lib/geometry/types";
import { lineMetrics, formatDimension } from "@/lib/geometry/metrics";

export type BadgeVisualState = "driving" | "derived" | "conflicting";
export type BadgeStateMachine = "DISPLAY" | "EDITING" | "COMMIT";

export interface DimensionBadgeProps {
  shape?: Shape;
  isDraft?: boolean;
  scale?: number;
  x?: number;
  y?: number;
  label?: string;
  subText?: string | null;
  value?: number | string;
  paramName?: string;
  visualState?: BadgeVisualState;
  diagnosticMessage?: string;
  isEditable?: boolean;
  onCommit?: (newValue: string, paramName?: string) => void;
  onCancel?: () => void;
  onChangeState?: (nextState: BadgeStateMachine) => void;
}

export const DimensionBadge: React.FC<DimensionBadgeProps> = React.memo(({
  shape,
  isDraft = false,
  scale = 1,
  x: explicitX,
  y: explicitY,
  label: explicitLabel,
  subText: explicitSubText,
  value: explicitValue,
  paramName,
  visualState = "driving",
  diagnosticMessage,
  isEditable = false,
  onCommit,
  onCancel,
  onChangeState,
}) => {
  const [state, setState] = useState<BadgeStateMachine>("DISPLAY");
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute coordinates & label from shape if not explicitly provided
  let badgeX = explicitX ?? 0;
  let badgeY = explicitY ?? 0;
  let labelText = explicitLabel ?? "";
  let subText: string | null = explicitSubText ?? null;

  if (shape && explicitX === undefined && explicitY === undefined) {
    switch (shape.type) {
      case "line":
      case "arrow": {
        const metrics = lineMetrics({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
        badgeX = metrics.midpoint.x;
        badgeY = metrics.midpoint.y - 14 / scale;
        labelText = explicitLabel ?? `L: ${formatDimension(metrics.length)}`;
        subText = explicitSubText !== undefined ? explicitSubText : `${metrics.angleDeg.toFixed(1)}°`;
        break;
      }
      case "rectangle": {
        badgeX = shape.x + shape.width / 2;
        badgeY = shape.y - 14 / scale;
        labelText = explicitLabel ?? `${formatDimension(shape.width)} × ${formatDimension(shape.height)}`;
        break;
      }
      case "circle": {
        badgeX = shape.cx;
        badgeY = shape.cy - shape.r - 14 / scale;
        labelText = explicitLabel ?? `R: ${formatDimension(shape.r)}`;
        subText = explicitSubText !== undefined ? explicitSubText : `Ø: ${formatDimension(shape.r * 2)}`;
        break;
      }
      case "ellipse": {
        badgeX = shape.cx;
        badgeY = shape.cy - shape.ry - 14 / scale;
        labelText = explicitLabel ?? `Rx: ${formatDimension(shape.rx)} Ry: ${formatDimension(shape.ry)}`;
        break;
      }
      case "polygon": {
        badgeX = shape.cx;
        badgeY = shape.cy - shape.r - 14 / scale;
        labelText = explicitLabel ?? `${shape.sides === 3 ? "Triangle" : `${shape.sides}-gon`}`;
        subText = explicitSubText !== undefined ? explicitSubText : `R: ${formatDimension(shape.r)}`;
        break;
      }
      case "star": {
        badgeX = shape.cx;
        badgeY = shape.cy - shape.outerR - 14 / scale;
        labelText = explicitLabel ?? `${shape.points}-Star`;
        subText = explicitSubText !== undefined ? explicitSubText : `R: ${formatDimension(shape.outerR)}`;
        break;
      }
    }
  }

  // Focus input on entering EDITING state
  useEffect(() => {
    if (state === "EDITING" && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [state]);

  const handleStartEdit = (e: React.MouseEvent | React.PointerEvent) => {
    if (!isEditable || visualState === "derived") return;
    e.stopPropagation();
    e.preventDefault();
    const initialVal = explicitValue !== undefined ? String(explicitValue) : labelText.replace(/[^0-9.]/g, "");
    setEditValue(initialVal);
    setState("EDITING");
    onChangeState?.("EDITING");
  };

  const handleCommit = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    const trimmed = editValue.trim();
    if (trimmed && onCommit) {
      setState("COMMIT");
      onChangeState?.("COMMIT");
      onCommit(trimmed, paramName);
    }
    setState("DISPLAY");
    onChangeState?.("DISPLAY");
  };

  const handleCancel = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    setState("DISPLAY");
    onChangeState?.("DISPLAY");
    onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleCommit(e);
    } else if (e.key === "Escape") {
      handleCancel(e);
    }
  };

  const fontSize = Math.max(10, Math.min(14, 12 / Math.sqrt(scale)));
  const paddingX = 6 / scale;
  const paddingY = 3 / scale;
  const borderRadius = 4 / scale;

  // Visual state styling per UPCE-MASTER-1.0 §61:
  // 1. Driving: Graphite background (#27272a)
  // 2. Derived: Locked grey (#52525b) with lock glyph
  // 3. Conflicting: Red background (#dc2626) with diagnostic message
  let fillColor = "rgba(39, 39, 42, 0.95)";
  let strokeColor = "var(--border-strong, #52525b)";
  let textColor = "#f8fafc";

  if (isDraft) {
    fillColor = "rgba(15, 23, 42, 0.88)";
    strokeColor = "var(--accent-draw, #38bdf8)";
  } else if (visualState === "derived") {
    fillColor = "rgba(82, 82, 91, 0.92)"; // Locked grey
    strokeColor = "#71717a";
    textColor = "#e4e4e7";
  } else if (visualState === "conflicting") {
    fillColor = "rgba(220, 38, 38, 0.95)"; // Conflicting red
    strokeColor = "#fca5a5";
    textColor = "#ffffff";
  }

  const iconWidth = visualState === "derived" || visualState === "conflicting" ? 14 / scale : 0;
  const totalLength = labelText.length + (subText ? subText.length + 2 : 0);
  const badgeWidth = totalLength * (fontSize * 0.64) + paddingX * 2 + iconWidth;
  const badgeHeight = fontSize + paddingY * 2;

  if (state === "EDITING") {
    const editWidth = Math.max(100 / scale, badgeWidth + 24 / scale);
    return (
      <g
        className="dimension-badge editing select-none"
        transform={`translate(${badgeX}, ${badgeY})`}
      >
        <foreignObject
          x={-editWidth / 2}
          y={-fontSize - paddingY}
          width={editWidth}
          height={badgeHeight + 10 / scale}
          className="overflow-visible"
        >
          <div
            className="flex items-center gap-1 rounded bg-zinc-900 border border-amber-500 px-1 py-0.5 shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-amber-200 text-xs font-mono font-bold outline-none px-1"
              placeholder="Value..."
            />
            <button
              onClick={handleCommit}
              className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold px-1"
              title="Commit (Enter)"
            >
              ✓
            </button>
            <button
              onClick={handleCancel}
              className="text-zinc-400 hover:text-zinc-200 text-[10px] font-bold px-1"
              title="Cancel (Esc)"
            >
              ✕
            </button>
          </div>
        </foreignObject>
      </g>
    );
  }

  return (
    <g
      className={`dimension-badge transition-opacity duration-150 ${
        isDraft ? "opacity-100 pointer-events-none" : isEditable ? "cursor-pointer opacity-95 hover:opacity-100" : "pointer-events-none opacity-90"
      }`}
      transform={`translate(${badgeX}, ${badgeY})`}
      onClick={isEditable ? handleStartEdit : undefined}
    >
      <rect
        x={-badgeWidth / 2}
        y={-fontSize - paddingY / 2}
        width={badgeWidth}
        height={badgeHeight}
        rx={borderRadius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1 / scale}
        style={{
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))",
        }}
      />

      {/* Lock Icon for Derived State */}
      {visualState === "derived" && (
        <g transform={`translate(${-badgeWidth / 2 + paddingX}, ${-fontSize / 2}) scale(${1 / scale})`}>
          <path
            d="M3 5V4a2 2 0 114 0v1m-5 0h6a1 1 0 011 1v4a1 1 0 01-1 1H2a1 1 0 01-1-1V6a1 1 0 011-1z"
            fill="none"
            stroke="#e4e4e7"
            strokeWidth="1.2"
          />
        </g>
      )}

      {/* Warning/Conflict Icon for Conflicting State */}
      {visualState === "conflicting" && (
        <g transform={`translate(${-badgeWidth / 2 + paddingX}, ${-fontSize / 2}) scale(${1 / scale})`}>
          <circle cx="5" cy="5" r="4" fill="#ffffff" />
          <path d="M5 2.5v3M5 7v.5" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}

      <text
        x={iconWidth / 2}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={textColor}
        fontSize={fontSize}
        fontFamily="JetBrains Mono, monospace"
        fontWeight="600"
        letterSpacing="0.02em"
      >
        {labelText}
        {subText && <tspan fill={visualState === "conflicting" ? "#fee2e2" : "#94a3b8"} fontSize={fontSize * 0.85}> · {subText}</tspan>}
      </text>

      {/* Plain-Language Parameter Diagnostic Tooltip for Conflicting State */}
      {visualState === "conflicting" && diagnosticMessage && (
        <title>{diagnosticMessage}</title>
      )}
    </g>
  );
});

DimensionBadge.displayName = "DimensionBadge";
