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
  Grid3X3,
  Magnet,
  Crosshair,
  Ruler,
  Sun,
  Moon,
  Compass,
} from "lucide-react";

interface ToolItem {
  id: ToolId;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: ToolItem[] = [
  { id: "select", label: "Select", shortcut: "V", icon: MousePointer },
  { id: "line", label: "Line", shortcut: "L", icon: Minus },
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "circle", label: "Circle", shortcut: "C", icon: Circle },
  { id: "pan", label: "Pan", shortcut: "H", icon: Hand },
];

export function MainToolbar() {
  const {
    state,
    setTool,
    undo,
    redo,
    canUndo,
    canRedo,
    toggleGrid,
    toggleGridSnap,
    toggleObjectSnap,
    toggleDimensions,
    setThemeMode,
  } = useDrawing();

  const handleNextTheme = () => {
    if (state.themeMode === "dark") {
      setThemeMode("light");
      document.documentElement.classList.remove("dark", "blueprint");
      document.documentElement.classList.add("light");
    } else if (state.themeMode === "light") {
      setThemeMode("blueprint");
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add("blueprint");
    } else {
      setThemeMode("dark");
      document.documentElement.classList.remove("light", "blueprint");
      document.documentElement.classList.add("dark");
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Tool items */}
      <div className="flex items-center gap-1">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = state.tool === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id)}
              className={`h-8 px-3 rounded text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? "text-blue-500 bg-[var(--bg-panel-subtle)] border-b-2 border-blue-500"
                  : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)]"
              }`}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={tool.label}
              aria-pressed={isActive}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-2" />

      {/* Undo & Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            canUndo
              ? "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] cursor-pointer"
              : "text-[var(--fg-muted)] opacity-30 cursor-not-allowed"
          }`}
          title="Undo (Ctrl/Cmd + Z)"
          aria-label="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            canRedo
              ? "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] cursor-pointer"
              : "text-[var(--fg-muted)] opacity-30 cursor-not-allowed"
          }`}
          title="Redo (Ctrl/Cmd + Shift + Z)"
          aria-label="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

      {/* Grid, Snap, & Dimension Toggles */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleGrid}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            state.showGrid
              ? "text-blue-500 bg-blue-500/10 font-bold"
              : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
          }`}
          title={`Grid: ${state.showGrid ? "ON" : "OFF"}`}
        >
          <Grid3X3 className="w-4 h-4" />
        </button>

        <button
          onClick={toggleGridSnap}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            state.gridSnapEnabled
              ? "text-blue-500 bg-blue-500/10 font-bold"
              : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
          }`}
          title={`Grid Snap: ${state.gridSnapEnabled ? "ON" : "OFF"}`}
        >
          <Magnet className="w-4 h-4" />
        </button>

        <button
          onClick={toggleObjectSnap}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            state.objectSnapEnabled
              ? "text-amber-500 bg-amber-500/10 font-bold"
              : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
          }`}
          title={`Vertex Snap: ${state.objectSnapEnabled ? "ON" : "OFF"}`}
        >
          <Crosshair className="w-4 h-4" />
        </button>

        <button
          onClick={toggleDimensions}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            state.showDimensions
              ? "text-emerald-500 bg-emerald-500/10 font-bold"
              : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
          }`}
          title={`Dimension Badges: ${state.showDimensions ? "ON" : "OFF"}`}
        >
          <Ruler className="w-4 h-4" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

      {/* Theme Switcher (Dark -> Light -> Blueprint) */}
      <button
        onClick={handleNextTheme}
        className="h-8 px-2.5 rounded bg-[var(--bg-panel-subtle)] hover:bg-[var(--border-subtle)] text-[var(--fg-primary)] flex items-center gap-1.5 text-xs font-mono font-medium transition-all"
        title={`Theme: ${state.themeMode.toUpperCase()} (Click to switch)`}
      >
        {state.themeMode === "dark" && <Moon className="w-3.5 h-3.5 text-indigo-400" />}
        {state.themeMode === "light" && <Sun className="w-3.5 h-3.5 text-amber-500" />}
        {state.themeMode === "blueprint" && <Compass className="w-3.5 h-3.5 text-sky-400" />}
        <span className="capitalize">{state.themeMode}</span>
      </button>
    </div>
  );
}
