"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { useTheme } from "next-themes";
import {
  Undo2,
  Redo2,
  Grid3X3,
  Magnet,
  Crosshair,
  Ruler,
  Sun,
  Moon,
  Compass,
  PenTool,
  Settings2,
} from "lucide-react";

export function MainToolbar() {
  const { theme, setTheme } = useTheme();
  const {
    state,
    dispatch,
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

  const handleToggleTheme = () => {
    const nextMode = state.themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextMode);
    try {
      setTheme(nextMode);
    } catch {
      // fallback
    }
    if (nextMode === "light") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Undo & Redo */}
      <div className="flex items-center gap-0.5">
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

      <div className="flex items-center rounded bg-[var(--bg-panel-subtle)] p-0.5 border border-[var(--border-subtle)] text-[10px] font-mono">
        <button
          onClick={() => dispatch({ type: "SET_USER_MODE", mode: "draftsman" })}
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer ${
            state.userMode === "draftsman"
              ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="Draftsman Mode: Pure CAD drafting without formulas"
        >
          <PenTool className="w-3 h-3" />
          <span>Draftsman</span>
        </button>

        <button
          onClick={() => dispatch({ type: "SET_USER_MODE", mode: "author" })}
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer ${
            state.userMode === "author"
              ? "bg-amber-500 text-zinc-950 font-bold shadow-xs"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="Author Mode: Define templates, ports, and review AutoFormula invariants"
        >
          <Settings2 className="w-3 h-3" />
          <span>Author Mode</span>
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1" />

      {/* Grid, Snap, & Dimension Toggles */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={toggleGrid}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
            state.showGrid
              ? "text-amber-400 bg-amber-500/15 font-bold border border-amber-500/30"
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
              ? "text-amber-400 bg-amber-500/15 font-bold border border-amber-500/30"
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

      {/* Theme Switcher (Dark <-> Light) */}
      <button
        onClick={handleToggleTheme}
        className="h-8 px-2.5 rounded bg-[var(--bg-panel-subtle)] hover:bg-[var(--border-subtle)] text-[var(--fg-primary)] flex items-center gap-1.5 text-xs font-mono font-medium transition-all cursor-pointer"
        title={`Switch to ${state.themeMode === "dark" ? "Light" : "Dark"} Mode`}
      >
        {state.themeMode === "dark" ? (
          <Moon className="w-3.5 h-3.5 text-indigo-400" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-amber-500" />
        )}
        <span className="capitalize text-[11px]">{state.themeMode}</span>
      </button>
    </div>
  );
}
