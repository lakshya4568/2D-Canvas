"use client";

import React from "react";
import { Point } from "@/lib/geometry/types";
import { useDrawing } from "@/lib/state/drawingContext";
import { Keyboard, Target, Magnet } from "lucide-react";

interface StatusBarProps {
  cursorPos: Point | null;
  onOpenShortcuts: () => void;
}

export function StatusBar({ cursorPos, onOpenShortcuts }: StatusBarProps) {
  const { state } = useDrawing();

  const formattedX = cursorPos ? cursorPos.x.toFixed(1) : "—";
  const formattedY = cursorPos ? cursorPos.y.toFixed(1) : "—";

  return (
    <footer className="fixed bottom-3 left-4 right-4 h-9 px-4 rounded-2xl glass-panel shadow-md z-30 flex items-center justify-between text-xs font-mono text-[var(--fg-secondary)] pointer-events-auto select-none border border-[var(--border-subtle)]">
      {/* Coordinates & Selection status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 font-medium">
          <span className="text-[var(--fg-muted)]">X:</span>
          <span className="w-16 text-[var(--fg-primary)] font-bold">{formattedX}</span>
          <span className="text-[var(--fg-muted)]">Y:</span>
          <span className="w-16 text-[var(--fg-primary)] font-bold">{formattedY}</span>
        </div>

        <div className="hidden sm:flex items-center gap-3 border-l border-[var(--border-subtle)] pl-4 text-[11px]">
          <span>
            Shapes: <b className="text-[var(--fg-primary)]">{state.shapes.length}</b>
          </span>
          {state.selectedId && (
            <span className="text-blue-500 font-semibold">
              (1 selected)
            </span>
          )}
        </div>
      </div>

      {/* Snap state & Shortcut hints */}
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 text-[11px]">
          {state.gridSnapEnabled && (
            <span className="flex items-center gap-1 text-blue-500 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-md">
              <Magnet className="w-3 h-3" />
              <span>Grid Snap</span>
            </span>
          )}
          {state.objectSnapEnabled && (
            <span className="flex items-center gap-1 text-amber-500 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md">
              <Target className="w-3 h-3" />
              <span>Vertex Snap</span>
            </span>
          )}
        </div>

        <button
          onClick={onOpenShortcuts}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-all font-sans font-medium text-[11px] cursor-pointer"
          title="Keyboard Shortcuts (?)"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Shortcuts</span>
          <span className="text-[10px] font-mono bg-[var(--border-subtle)] px-1 rounded">?</span>
        </button>
      </div>
    </footer>
  );
}
