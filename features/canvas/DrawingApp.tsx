"use client";

import React, { useState } from "react";
import { Point } from "@/lib/geometry/types";
import { DrawingCanvas } from "./DrawingCanvas";
import { SidebarTools } from "../toolbar/SidebarTools";
import { MainToolbar } from "../toolbar/MainToolbar";
import { ExportMenu } from "../toolbar/ExportMenu";
import { PropertyInspector } from "../inspector/PropertyInspector";
import { StatusBar } from "../statusbar/StatusBar";
import { ShortcutsModal } from "../shortcuts/ShortcutsModal";
import { BottomFormulaBar } from "../parametric/BottomFormulaBar";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ToastNotification {
  id: string;
  text: string;
  type: "success" | "error";
}

export function DrawingApp() {
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [inspectorWidth, setInspectorWidth] = useState(380);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(48);

  const addNotification = (notif: { text: string; type: "success" | "error" }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, ...notif }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  return (
    <div className="w-screen h-screen relative flex flex-col overflow-hidden select-none bg-[var(--bg-app)]">
      {/* Top Header (Height 56px, Stitch Specification) */}
      <header className="h-[56px] w-full bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] px-4 flex items-center justify-between shrink-0 relative z-30">
        {/* Left: Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm tracking-tight text-blue-500">
              VectorPrecision
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-500/15 text-blue-400">
              CAD
            </span>
          </div>
          <span className="text-[11px] font-mono text-[var(--fg-muted)] hidden sm:inline">
            / 2D Drawing Surface
          </span>
        </div>

        {/* Right: Header Utilities (Undo/Redo, Grid/Snap Toggles, Theme) */}
        <div className="flex items-center gap-3">
          <MainToolbar />
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 w-full flex relative overflow-hidden pb-[28px]">
        {/* Collapsible & Resizable Left Sidebar CAD Tools */}
        <SidebarTools width={sidebarWidth} onWidthChange={setSidebarWidth} />

        {/* Primary Interactive SVG Canvas with Quick Parametric Formula Bar */}
        <main
          className="flex-1 h-full relative overflow-hidden bg-[var(--bg-canvas)] flex flex-col"
          style={{
            marginRight: isInspectorCollapsed ? 0 : `${inspectorWidth}px`,
          }}
        >
          <div className="flex-1 min-h-0 w-full relative overflow-hidden">
            <DrawingCanvas onCursorChange={setCursorPos} />
          </div>
          <BottomFormulaBar />
        </main>

        {/* Right Docked Resizable Property Inspector */}
        <PropertyInspector
          width={inspectorWidth}
          onWidthChange={setInspectorWidth}
          isCollapsed={isInspectorCollapsed}
          onCollapseChange={setIsInspectorCollapsed}
        />
      </div>

      {/* Fixed Footer Status Bar (Height 28px) */}
      <StatusBar
        cursorPos={cursorPos}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onNotification={addNotification}
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
