"use client";

import React from "react";
import {
  MousePointer2,
  Minus,
  Spline,
  Square,
  Circle,
  Hexagon,
  Slash,
  Crosshair,
  Ruler,
  Hand,
  Move,
  Triangle,
} from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { ToolId } from "@/lib/geometry/types";

/**
 * The tool rail — a vertical icon strip, the arrangement every draftsman already
 * knows from AutoCAD, SolveSpace and FreeCAD Sketcher.
 *
 * UPCE-MASTER-1.0 §59 lists the tool set: line, arc, rectangle, circle, polyline,
 * point, fillet/haunch, dimension, mirror, offset, trim, extend, move, stretch,
 * array. Tools are grouped by what they produce, with a rule between groups —
 * the grouping is information, not decoration.
 */

interface RailTool {
  id: ToolId;
  label: string;
  icon: typeof MousePointer2;
  key: string;
}

const GROUPS: { name: string; tools: RailTool[] }[] = [
  {
    name: "Select",
    tools: [
      { id: "select", label: "Select", icon: MousePointer2, key: "V" },
      { id: "move", label: "Move", icon: Move, key: "M" },
      { id: "pan", label: "Pan", icon: Hand, key: "H" },
    ],
  },
  {
    name: "Draw",
    tools: [
      { id: "line", label: "Line", icon: Minus, key: "L" },
      { id: "polyline", label: "Polyline", icon: Spline, key: "P" },
      { id: "rectangle", label: "Rectangle", icon: Square, key: "R" },
      { id: "circle", label: "Circle", icon: Circle, key: "C" },
      { id: "polygon", label: "Polygon", icon: Hexagon, key: "G" },
      { id: "star", label: "Star", icon: Triangle, key: "S" },
    ],
  },
  {
    name: "Detail",
    tools: [
      { id: "chamfer", label: "Chamfer / haunch", icon: Slash, key: "F" },
      { id: "construction", label: "Construction line", icon: Crosshair, key: "X" },
      { id: "dimension", label: "Dimension", icon: Ruler, key: "D" },
    ],
  },
];

export function ToolRail() {
  const { state, setTool } = useDrawing();
  // §3: in Run mode the geometry is read-only, so drawing tools are withheld
  // rather than shown-and-disabled. The persona simply does not have them.
  const readOnly = state.userMode === "user";

  return (
    <nav
      aria-label="Drawing tools"
      className="w-[46px] shrink-0 h-full bg-(--ink-panel) border-r border-(--rule) flex flex-col items-center py-2 gap-1 z-20"
    >
      {GROUPS.map((group, gi) => (
        <React.Fragment key={group.name}>
          {gi > 0 && <div className="w-5 h-px bg-(--rule) my-1.5" aria-hidden="true" />}
          {group.tools.map((tool) => {
            const active = state.tool === tool.id;
            const disabled = readOnly && group.name !== "Select";
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                title={`${tool.label}  ·  ${tool.key}`}
                aria-label={tool.label}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => setTool(tool.id)}
                className={[
                  "w-[32px] h-[30px] rounded-[5px] grid place-items-center relative",
                  "transition-colors duration-100",
                  disabled
                    ? "opacity-25 cursor-not-allowed"
                    : active
                      ? "bg-(--pen-soft) text-(--pen) cursor-pointer"
                      : "text-(--fg-muted) hover:bg-(--ink-raised) hover:text-(--fg-primary) cursor-pointer",
                ].join(" ")}
              >
                <Icon className="w-[15px] h-[15px]" strokeWidth={1.9} />
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[2px] h-[14px] rounded-r bg-(--pen)"
                  />
                )}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}
