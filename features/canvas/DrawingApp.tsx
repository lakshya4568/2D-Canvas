"use client";

import React, { useState } from "react";
import { Point } from "@/lib/geometry/types";
import { useDrawing } from "@/lib/state/drawingContext";
import { DrawingCanvas } from "./DrawingCanvas";
import { MainToolbar } from "../toolbar/MainToolbar";
import { ExportMenu } from "../toolbar/ExportMenu";
import { PropertyInspector } from "../inspector/PropertyInspector";
import { StatusBar } from "../statusbar/StatusBar";
import { ShortcutsModal } from "../shortcuts/ShortcutsModal";
import {
  MousePointer,
  Minus,
  Square,
  Circle,
  Hand,
  Group,
  Ungroup,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ToastNotification {
  id: string;
  text: string;
  type: "success" | "error";
}

export function DrawingApp() {
  const {
    state,
    setTool,
    groupSelected,
    ungroupSelected,
    isGroupSelected,
    selectedShapes,
  } = useDrawing();

  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const addNotification = (notif: { text: string; type: "success" | "error" }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, ...notif }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  return (
    <div className="w-screen h-screen relative flex flex-col overflow-hidden select-none bg-[var(--bg-app)]">
      {/* Top Navigation Bar (Height 56px, Stitch Specification) */}
      <header className="h-[56px] w-full bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-3 flex items-center justify-between shrink-0 relative z-30">
        {/* Left: Brand & Main Navigation Tools */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm tracking-tight text-blue-500">
              VectorPrecision
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-500/15 text-blue-400">
              CAD
            </span>
          </div>

          <div className="w-[1px] h-5 bg-[var(--border-subtle)]" />

          {/* Center Navigation Tool Palette */}
          <MainToolbar />
        </div>

        {/* Right: Export Menu */}
        <div className="flex items-center gap-2">
          <ExportMenu onNotification={addNotification} />
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 w-full flex relative overflow-hidden">
        {/* Left Vertical CAD Fast Toolbar (Stitch Specification) */}
        <aside className="w-[44px] bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] py-2 flex flex-col items-center gap-1.5 shrink-0 z-20">
          <button
            onClick={() => setTool("select")}
            className={`w-[32px] h-[32px] rounded flex items-center justify-center transition-colors ${
              state.tool === "select"
                ? "bg-blue-600 text-white font-bold"
                : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
            }`}
            title="Select & Move (V)"
          >
            <MousePointer className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool("line")}
            className={`w-[32px] h-[32px] rounded flex items-center justify-center transition-colors ${
              state.tool === "line"
                ? "bg-blue-600 text-white font-bold"
                : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
            }`}
            title="Line Tool (L)"
          >
            <Minus className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool("rectangle")}
            className={`w-[32px] h-[32px] rounded flex items-center justify-center transition-colors ${
              state.tool === "rectangle"
                ? "bg-blue-600 text-white font-bold"
                : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
            }`}
            title="Rectangle Tool (R)"
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool("circle")}
            className={`w-[32px] h-[32px] rounded flex items-center justify-center transition-colors ${
              state.tool === "circle"
                ? "bg-blue-600 text-white font-bold"
                : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
            }`}
            title="Circle Tool (C)"
          >
            <Circle className="w-4 h-4" />
          </button>

          <button
            onClick={() => setTool("pan")}
            className={`w-[32px] h-[32px] rounded flex items-center justify-center transition-colors ${
              state.tool === "pan"
                ? "bg-blue-600 text-white font-bold"
                : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
            }`}
            title="Pan Canvas (H)"
          >
            <Hand className="w-4 h-4" />
          </button>

          <div className="w-[24px] h-[1px] bg-[var(--border-subtle)] my-1" />

          {/* Group / Ungroup Affordance */}
          <button
            onClick={isGroupSelected ? ungroupSelected : groupSelected}
            disabled={selectedShapes.length < 2 && !isGroupSelected}
            className={`w-[32px] h-[32px] rounded flex items-center justify-center transition-colors ${
              selectedShapes.length >= 2 || isGroupSelected
                ? "text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                : "text-[var(--fg-muted)] opacity-30 cursor-not-allowed"
            }`}
            title={isGroupSelected ? "Ungroup (Ctrl+Shift+G)" : "Group Selected (Ctrl+G)"}
          >
            {isGroupSelected ? <Ungroup className="w-4 h-4 text-amber-500" /> : <Group className="w-4 h-4" />}
          </button>
        </aside>

        {/* Primary Interactive SVG Canvas */}
        <main className="flex-1 h-full relative overflow-hidden bg-[var(--bg-canvas)]">
          <DrawingCanvas onCursorChange={setCursorPos} />
        </main>

        {/* Right Docked Property Inspector (Width 280px) */}
        <PropertyInspector />
      </div>

      {/* Fixed Footer Status Bar (Height 28px) */}
      <StatusBar
        cursorPos={cursorPos}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Toast Notifications */}
      <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={`pointer-events-auto px-3.5 py-2 rounded bg-[var(--bg-panel)] shadow-2xl flex items-center gap-2.5 text-xs font-medium border ${
                toast.type === "success"
                  ? "border-emerald-500/40 text-emerald-400"
                  : "border-red-500/40 text-red-400"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              )}
              <span className="text-[var(--fg-primary)]">{toast.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
