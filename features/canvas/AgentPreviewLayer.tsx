"use client";

/**
 * The agent's pen, drawn live over the sheet.
 *
 * Lines the agent has placed are drawn in the pen colour; the ones it touched in
 * its latest step are emphasised and carry a tip marker, so the author can
 * follow what is being done rather than watch a finished drawing appear.
 */

import React from "react";
import { useAgentPreview } from "../agent/agentPreview";

export const AgentPreviewLayer: React.FC<{ scale: number }> = ({ scale }) => {
  const preview = useAgentPreview();
  const [reducedMotion, setReducedMotion] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (!preview || preview.shapes.length === 0) return null;
  const recent = new Set(preview.lastIds);
  const stroke = "var(--pen)";
  const w = (hot: boolean) => (hot ? 2.4 : 1.4) / scale;

  let tip: { x: number; y: number } | null = null;

  return (
    <g id="agent-preview-layer" className="pointer-events-none">
      {preview.shapes.map((s) => {
        if (s.isVisible === false) return null;
        const hot = recent.has(s.id) || recent.has(s.groupId ?? "");
        const dash = s.isReference ? `${10 / scale} ${6 / scale}` : undefined;
        const opacity = s.isReference ? 0.55 : hot ? 1 : 0.85;
        if (s.type === "line" || s.type === "arrow") {
          if (hot) tip = { x: s.x2, y: s.y2 };
          return (
            <line
              key={s.id}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={stroke}
              strokeWidth={w(hot)}
              strokeDasharray={dash}
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        }
        if (s.type === "rectangle") {
          if (hot) tip = { x: s.x + s.width, y: s.y };
          const cx = s.x + s.width / 2;
          const cy = s.y + s.height / 2;
          return (
            <rect
              key={s.id}
              x={s.x}
              y={s.y}
              width={s.width}
              height={s.height}
              fill="none"
              stroke={stroke}
              strokeWidth={w(hot)}
              opacity={opacity}
              transform={s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined}
            />
          );
        }
        if (s.type === "circle") {
          if (hot) tip = { x: s.cx + s.r, y: s.cy };
          return <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={stroke} strokeWidth={w(hot)} opacity={opacity} />;
        }
        return null;
      })}
      {preview.running && tip && (
        <g transform={`translate(${(tip as { x: number }).x} ${(tip as { y: number }).y})`}>
          <circle r={9 / scale} fill="var(--pen)" opacity={0.18}>
            {!reducedMotion && (
              <animate attributeName="r" values={`${6 / scale};${12 / scale};${6 / scale}`} dur="1.4s" repeatCount="indefinite" />
            )}
          </circle>
          <circle r={3.2 / scale} fill="var(--pen)" />
        </g>
      )}
    </g>
  );
};
