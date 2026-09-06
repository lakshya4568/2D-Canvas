"use client";

import React from "react";
import { Point } from "@/lib/geometry/types";
import { useDrawing } from "@/lib/state/drawingContext";
import { Keyboard } from "lucide-react";
import { ExportMenu } from "../toolbar/ExportMenu";

interface StatusBarProps {
  cursorPos: Point | null;
  onOpenShortcuts: () => void;
  onNotification?: (msg: { text: string; type: "success" | "error" }) => void;
}

export function StatusBar({ cursorPos, onOpenShortcuts, onNotification }: StatusBarProps) {
  const { state } = useDrawing();

  const formattedX = cursorPos ? Math.round(cursorPos.x) : "—";
  const formattedY = cursorPos ? Math.round(cursorPos.y) : "—";

  const groupCount = new Set(state.shapes.map((s) => s.groupId).filter(Boolean)).size;

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-[28px] px-3 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] z-50 flex items-center justify-between text-[11px] font-mono text-[var(--fg-secondary)] select-none">
      {/* Left status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span>X: <b className="text-[var(--fg-primary)]">{formattedX}</b></span>
          <span>Y: <b className="text-[var(--fg-primary)]">{formattedY}</b></span>
        </div>

        <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

        <span className="capitalize font-semibold text-amber-500">
          Tool: {state.tool}
        </span>

        <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

        <span>
          Zoom: <b className="text-[var(--fg-primary)]">{Math.round(state.viewport.scale * 100)}%</b>
        </span>
      </div>

      {/* Right status & Export in footer */}
      <div className="flex items-center gap-2.5">
        <span>
          <b className="text-[var(--fg-primary)]">{state.shapes.length}</b> shapes
          {groupCount > 0 && <span className="text-amber-400 font-bold ml-1">({groupCount} groups)</span>}
        </span>

        <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

        <button
          onClick={onOpenShortcuts}
          className="flex items-center gap-1 hover:text-[var(--fg-primary)] cursor-pointer transition-colors"
        >
          <Keyboard className="w-3 h-3" />
          <span>Shortcuts</span>
        </button>

        <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

        <span className="text-[10px] text-[var(--fg-muted)]">v1.0.4-cad</span>

        <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

        {/* Embedded Footer Export Button */}
        <ExportMenu direction="up" onNotification={onNotification} />
      </div>
    </footer>
  );
}
