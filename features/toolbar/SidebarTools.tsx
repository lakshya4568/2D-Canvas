"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ToolId } from "@/lib/geometry/types";
import {
  MousePointer,
  Minus,
  ArrowUpRight,
  Square,
  Circle,
  CircleDot,
  Triangle,
  Star,
  Hand,
  Group,
  Ungroup,
  PanelLeftClose,
  PanelLeftOpen,
  Copy,
  Trash2,
  Spline,
  CornerUpRight,
  Crosshair,
  Ruler,
  Move,
} from "lucide-react";
import { motion } from "motion/react";

interface ToolItem {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: ToolItem[] = [
  { id: "select", label: "Select", shortcut: "V", icon: MousePointer },
  { id: "move", label: "Move", shortcut: "M", icon: Move },
  { id: "line", label: "Line", shortcut: "L", icon: Minus },
  { id: "polyline", label: "Polyline", shortcut: "P", icon: Spline },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "polygon", label: "Polygon / N-gon", shortcut: "G", icon: Triangle },
  { id: "chamfer", label: "Chamfer / Haunch", shortcut: "C", icon: CornerUpRight },
  { id: "construction", label: "Construction Datum", shortcut: "X", icon: Crosshair },
  { id: "dimension", label: "Dimension Tool", shortcut: "D", icon: Ruler },
  { id: "arrow", label: "Arrow", shortcut: "A", icon: ArrowUpRight },
  { id: "circle", label: "Circle", shortcut: "O", icon: Circle },
  { id: "ellipse", label: "Ellipse", shortcut: "E", icon: CircleDot },
  { id: "star", label: "Star", shortcut: "S", icon: Star },
  { id: "pan", label: "Pan Canvas", shortcut: "H", icon: Hand },
];

export function SidebarTools() {
  const {
    state,
    setTool,
    groupSelected,
    ungroupSelected,
    duplicateSelected,
    deleteSelected,
    isGroupSelected,
    selectedShapes,
  } = useDrawing();

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.aside
      animate={{ width: isExpanded ? 172 : 44 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] py-2 px-1.5 flex flex-col justify-between shrink-0 z-20 select-none overflow-hidden"
    >
      {/* Top Tools List */}
      <div className="flex flex-col gap-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* Expand / Collapse toggle button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full h-8 px-2 rounded flex items-center justify-between text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors cursor-pointer"
          title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          aria-label="Toggle Sidebar Expansion"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <PanelLeftClose className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <PanelLeftOpen className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />
            )}
            {isExpanded && (
              <span className="text-[11px] font-semibold text-[var(--fg-primary)] truncate">
                CAD Tools
              </span>
            )}
          </div>
          {isExpanded && (
            <span className="text-[9px] font-mono text-[var(--fg-muted)]">Hide</span>
          )}
        </button>

        <div className="w-full h-[1px] bg-[var(--border-subtle)] my-1" />

        {/* Primary Shape & CAD Tools */}
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = state.tool === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id)}
              className={`w-full h-8 px-2 rounded flex items-center justify-between transition-all duration-150 cursor-pointer ${
                isActive
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
              }`}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={tool.label}
              aria-pressed={isActive}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                {isExpanded && (
                  <span className="text-[11px] font-medium truncate">
                    {tool.label}
                  </span>
                )}
              </div>
              {isExpanded && (
                <span
                  className={`text-[9px] font-mono px-1 py-0.2 rounded shrink-0 ${
                    isActive ? "bg-amber-600 text-amber-950 font-bold" : "bg-[var(--border-subtle)] text-[var(--fg-muted)]"
                  }`}
                >
                  {tool.shortcut}
                </span>
              )}
            </button>
          );
        })}

        <div className="w-full h-[1px] bg-[var(--border-subtle)] my-1" />

        {/* Group / Ungroup Action */}
        <button
          onClick={isGroupSelected ? ungroupSelected : groupSelected}
          disabled={selectedShapes.length < 2 && !isGroupSelected}
          className={`w-full h-8 px-2 rounded flex items-center justify-between transition-all duration-150 ${
            selectedShapes.length >= 2 || isGroupSelected
              ? "text-amber-400 hover:bg-amber-500/10 cursor-pointer"
              : "text-[var(--fg-muted)] opacity-30 cursor-not-allowed"
          }`}
          title={isGroupSelected ? "Ungroup (Ctrl+Shift+G)" : "Group Selected (Ctrl+G)"}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {isGroupSelected ? (
              <Ungroup className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Group className="w-4 h-4 shrink-0" />
            )}
            {isExpanded && (
              <span className="text-[11px] font-medium truncate">
                {isGroupSelected ? "Ungroup" : "Group"}
              </span>
            )}
          </div>
          {isExpanded && (
            <span className="text-[9px] font-mono bg-[var(--border-subtle)] text-[var(--fg-muted)] px-1 rounded shrink-0">
              ^G
            </span>
          )}
        </button>
      </div>

      {/* Bottom Context Actions if shapes selected */}
      {selectedShapes.length > 0 && (
        <div className="flex flex-col gap-1 w-full pt-2 border-t border-[var(--border-subtle)] shrink-0">
          <button
            onClick={duplicateSelected}
            className="w-full h-7 px-2 rounded text-amber-400 hover:bg-amber-500/10 flex items-center justify-between transition-colors text-[10px] cursor-pointer"
            title="Duplicate Selected (Ctrl+D)"
          >
            <div className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 shrink-0" />
              {isExpanded && <span>Duplicate</span>}
            </div>
            {isExpanded && <span className="font-mono text-[9px] text-[var(--fg-muted)]">^D</span>}
          </button>

          <button
            onClick={deleteSelected}
            className="w-full h-7 px-2 rounded text-red-500 hover:bg-red-500/10 flex items-center justify-between transition-colors text-[10px] cursor-pointer"
            title="Delete Selected (Del)"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              {isExpanded && <span>Delete</span>}
            </div>
            {isExpanded && <span className="font-mono text-[9px] text-[var(--fg-muted)]">Del</span>}
          </button>
        </div>
      )}
    </motion.aside>
  );
}
