"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ToolId } from "@/lib/geometry/types";
import {
  MousePointer,
  Minus,
  Square,
  Circle,
  Hand,
  Undo2,
  Redo2,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";

interface ToolItem {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: ToolItem[] = [
  { id: "select", label: "Select & Move", shortcut: "V", icon: MousePointer },
  { id: "line", label: "Line", shortcut: "L", icon: Minus },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "circle", label: "Circle", shortcut: "C", icon: Circle },
  { id: "pan", label: "Pan Canvas", shortcut: "H / Space", icon: Hand },
];

export function MainToolbar() {
  const {
    state,
    setTool,
    undo,
    redo,
    canUndo,
    canRedo,
    deleteSelected,
    selectedShape,
  } = useDrawing();

  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-2xl glass-panel shadow-xl">
      {/* Tool items with sliding active background */}
      <div className="flex items-center gap-1 relative">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = state.tool === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id)}
              className={`relative px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-150 flex items-center gap-2 group ${
                isActive
                  ? "text-white dark:text-white"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
              }`}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={tool.label}
              aria-pressed={isActive}
            >
              {isActive && (
                <motion.div
                  layoutId="active-tool-pill"
                  className="absolute inset-0 bg-blue-600 rounded-xl z-0 shadow-md"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-semibold">{tool.label}</span>
              </span>
              <span
                className={`relative z-10 text-[10px] px-1 py-0.2 rounded font-mono hidden md:inline ${
                  isActive ? "bg-blue-700/60 text-blue-100" : "bg-[var(--border-subtle)] text-[var(--fg-muted)]"
                }`}
              >
                {tool.shortcut.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="w-[1px] h-6 bg-[var(--border-subtle)] mx-1" />

      {/* Undo & Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`p-2 rounded-xl transition-all duration-150 ${
            canUndo
              ? "text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] active:scale-95 cursor-pointer"
              : "text-[var(--fg-muted)] opacity-40 cursor-not-allowed"
          }`}
          title="Undo (Ctrl/Cmd + Z)"
          aria-label="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className={`p-2 rounded-xl transition-all duration-150 ${
            canRedo
              ? "text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] active:scale-95 cursor-pointer"
              : "text-[var(--fg-muted)] opacity-40 cursor-not-allowed"
          }`}
          title="Redo (Ctrl/Cmd + Shift + Z)"
          aria-label="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Delete selected if any */}
      {selectedShape && (
        <>
          <div className="w-[1px] h-6 bg-[var(--border-subtle)] mx-1" />
          <button
            onClick={deleteSelected}
            className="p-2 rounded-xl text-red-500 hover:bg-red-500/10 active:scale-95 transition-all duration-150 cursor-pointer"
            title="Delete Selected Shape (Delete / Backspace)"
            aria-label="Delete Selected Shape"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
