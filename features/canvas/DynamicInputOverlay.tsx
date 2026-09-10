"use client";

import React, { useState } from "react";
import { Lock } from "lucide-react";
import { Point } from "@/lib/geometry/types";

interface DynamicInputOverlayProps {
  cursorPos: Point | null;
  basePoint: Point | null;
  active: boolean;
  scale: number;
  onCommitValues?: (length: number, angleDeg: number) => void;
}

export const DynamicInputOverlay: React.FC<DynamicInputOverlayProps> = ({
  cursorPos,
  basePoint,
  active,
  scale,
}) => {
  const [activeField, setActiveField] = useState<"length" | "angle">("length");
  const [lockedLength, setLockedLength] = useState<number | null>(null);
  const [lockedAngle, setLockedAngle] = useState<number | null>(null);

  if (!active || !cursorPos) return null;

  const origin = basePoint || { x: 0, y: 0 };
  const dx = cursorPos.x - origin.x;
  const dy = cursorPos.y - origin.y;

  const currentDist = lockedLength ?? Math.hypot(dx, dy);
  const currentAngle =
    lockedAngle ?? ((Math.atan2(-dy, dx) * (180 / Math.PI) + 360) % 360);

  // Position HUD slightly to bottom-right of cursor in world coordinates
  const hudX = cursorPos.x + 18 / scale;
  const hudY = cursorPos.y + 18 / scale;

  return (
    <g className="pointer-events-none select-none">
      {/* Dynamic HUD Container */}
      <g transform={`translate(${hudX}, ${hudY})`}>
        {/* Metric 1: Distance / Length */}
        <g transform="translate(0, 0)">
          <rect
            x={0}
            y={0}
            width={72 / scale}
            height={20 / scale}
            rx={3 / scale}
            fill="rgba(15, 23, 42, 0.88)"
            stroke={activeField === "length" ? "#38bdf8" : "rgba(255, 255, 255, 0.2)"}
            strokeWidth={1 / scale}
          />
          {lockedLength !== null && (
            <text
              x={4 / scale}
              y={14 / scale}
              fill="#38bdf8"
              fontSize={9 / scale}
              fontFamily="monospace"
            >
              🔒
            </text>
          )}
          <text
            x={lockedLength !== null ? 18 / scale : 6 / scale}
            y={14 / scale}
            fill="#f8fafc"
            fontSize={10 / scale}
            fontFamily="monospace"
            fontWeight="bold"
          >
            {currentDist.toFixed(1)}
          </text>
          <text
            x={56 / scale}
            y={14 / scale}
            fill="#94a3b8"
            fontSize={8 / scale}
            fontFamily="sans-serif"
          >
            mm
          </text>
        </g>

        {/* Metric 2: Angle */}
        <g transform={`translate(${78 / scale}, 0)`}>
          <rect
            x={0}
            y={0}
            width={54 / scale}
            height={20 / scale}
            rx={3 / scale}
            fill="rgba(15, 23, 42, 0.88)"
            stroke={activeField === "angle" ? "#38bdf8" : "rgba(255, 255, 255, 0.2)"}
            strokeWidth={1 / scale}
          />
          {lockedAngle !== null && (
            <text
              x={4 / scale}
              y={14 / scale}
              fill="#38bdf8"
              fontSize={9 / scale}
              fontFamily="monospace"
            >
              🔒
            </text>
          )}
          <text
            x={lockedAngle !== null ? 16 / scale : 6 / scale}
            y={14 / scale}
            fill="#f8fafc"
            fontSize={10 / scale}
            fontFamily="monospace"
            fontWeight="bold"
          >
            {currentAngle.toFixed(0)}°
          </text>
        </g>
      </g>
    </g>
  );
};
