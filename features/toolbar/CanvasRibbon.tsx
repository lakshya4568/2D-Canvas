"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ToolId } from "@/lib/geometry/types";
import {
  MousePointer,
  Move,
  RotateCw,
  Copy,
  Trash2,
  Minus,
  Spline,
  Square,
  Circle,
  CircleDot,
  Triangle,
  Star,
  ArrowUpRight,
  Ruler,
  CornerUpRight,
  Crosshair,
  Hand,
  Group,
  Ungroup,
} from "lucide-react";

interface RibbonTool {
  id: ToolId;
  name: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DRAW_TOOLS: RibbonTool[] = [
  { id: "line", name: "Line", shortcut: "L", icon: Minus },
  { id: "polyline", name: "Polyline", shortcut: "P", icon: Spline },
  { id: "rectangle", name: "Rectangle", shortcut: "R", icon: Square },
  { id: "circle", name: "Circle", shortcut: "C", icon: Circle },
  { id: "ellipse", name: "Ellipse", shortcut: "E", icon: CircleDot },
  { id: "polygon", name: "Polygon", shortcut: "G", icon: Triangle },
  { id: "star", name: "Star", shortcut: "S", icon: Star },
  { id: "arrow", name: "Arrow", shortcut: "A", icon: ArrowUpRight },
];

const ANNOTATE_TOOLS: RibbonTool[] = [
  { id: "dimension", name: "Dimension", shortcut: "D", icon: Ruler },
  { id: "chamfer", name: "Chamfer / Haunch", shortcut: "C", icon: CornerUpRight },
  { id: "construction", name: "Construction Datum", shortcut: "X", icon: Crosshair },
];

export function CanvasRibbon() {
  const {
    state,
    dispatch,
    setTool,
    selectedShapes,
    duplicateSelected,
    deleteSelected,
    groupSelected,
    ungroupSelected,
    isGroupSelected,
  } = useDrawing();

  const hasSelection = selectedShapes.length > 0;

  const handleRotateQuarter = () => {
    if (!hasSelection) return;
    dispatch({
      type: "ROTATE_SELECTED_BY_ANGLE",
      deltaDeg: 90,
    });
  };

  return (
    <div className="h-10 w-full bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-3 flex items-center gap-2 shrink-0 z-20 select-none overflow-x-auto custom-scrollbar">
      {/* Modify Group */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setTool("select")}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            state.tool === "select"
              ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
          }`}
          title="Select (V) - Select objects only"
          aria-label="Select tool"
        >
          <MousePointer className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setTool("move")}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            state.tool === "move"
              ? "bg-amber-500 text-zinc-950 font-bold shadow-xs ring-1 ring-amber-400"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
          }`}
          title="Move (M) - AutoCAD Move: Base point & displacement"
          aria-label="Move tool"
        >
          <Move className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleRotateQuarter}
          disabled={!hasSelection}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            hasSelection
              ? "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] cursor-pointer"
              : "text-[var(--fg-muted)] opacity-25 cursor-not-allowed"
          }`}
          title="Rotate 90°"
          aria-label="Rotate 90 degrees"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={duplicateSelected}
          disabled={!hasSelection}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            hasSelection
              ? "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] cursor-pointer"
              : "text-[var(--fg-muted)] opacity-25 cursor-not-allowed"
          }`}
          title="Duplicate (Ctrl+D)"
          aria-label="Duplicate selected"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={deleteSelected}
          disabled={!hasSelection}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            hasSelection
              ? "text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
              : "text-[var(--fg-muted)] opacity-25 cursor-not-allowed"
          }`}
          title="Delete (Del)"
          aria-label="Delete selected"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1 shrink-0" />

      {/* Draw Primitives Group */}
      <div className="flex items-center gap-0.5">
        {DRAW_TOOLS.map((t) => {
          const Icon = t.icon;
          const isActive = state.tool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                isActive
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
              }`}
              title={`${t.name} (${t.shortcut})`}
              aria-label={t.name}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>

      <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1 shrink-0" />

      {/* Annotate Group */}
      <div className="flex items-center gap-0.5">
        {ANNOTATE_TOOLS.map((t) => {
          const Icon = t.icon;
          const isActive = state.tool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                isActive
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
              }`}
              title={`${t.name} (${t.shortcut})`}
              aria-label={t.name}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>

      <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1 shrink-0" />

      {/* Navigate & Organize */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setTool("pan")}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            state.tool === "pan"
              ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
          }`}
          title="Pan Canvas (H)"
          aria-label="Pan tool"
        >
          <Hand className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={isGroupSelected ? ungroupSelected : groupSelected}
          disabled={selectedShapes.length < 2 && !isGroupSelected}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            selectedShapes.length >= 2 || isGroupSelected
              ? "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] cursor-pointer"
              : "text-[var(--fg-muted)] opacity-25 cursor-not-allowed"
          }`}
          title={isGroupSelected ? "Ungroup (Ctrl+Shift+G)" : "Group (Ctrl+G)"}
          aria-label={isGroupSelected ? "Ungroup" : "Group"}
        >
          {isGroupSelected ? (
            <Ungroup className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <Group className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
