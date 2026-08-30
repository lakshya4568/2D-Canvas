"use client";

import React, { useState } from "react";
import { Point } from "@/lib/geometry/types";
import { DrawingCanvas } from "./DrawingCanvas";
import { MainToolbar } from "../toolbar/MainToolbar";
import { ViewportControls } from "../toolbar/ViewportControls";
import { ExportMenu } from "../toolbar/ExportMenu";
import { PropertyInspector } from "../inspector/PropertyInspector";
import { StatusBar } from "../statusbar/StatusBar";
import { ThemeToggle } from "../theme/ThemeToggle";
import { ShortcutsModal } from "../shortcuts/ShortcutsModal";
import { Shapes, CheckCircle2, AlertCircle } from "lucide-react";
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

  const addNotification = (notif: { text: string; type: "success" | "error" }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, ...notif }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  return (
    <div className="w-screen h-screen relative flex flex-col overflow-hidden select-none bg-[var(--bg-app)]">
      {/* Top Navigation Bar / Studio Header */}
      <header className="fixed top-3 left-4 right-4 z-30 flex items-center justify-between pointer-events-none">
        {/* Brand & Logo */}
        <div className="flex items-center gap-3 p-1.5 pl-3 pr-4 rounded-2xl glass-panel shadow-lg pointer-events-auto">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
            <Shapes className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xs tracking-tight text-[var(--fg-primary)] flex items-center gap-1.5">
              2D Canvas Studio
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-blue-500/15 text-blue-500">
                PRO
              </span>
            </span>
            <span className="text-[10px] text-[var(--fg-muted)] font-mono">Vector CAD Engine</span>
          </div>
        </div>

        {/* Center: Main Tool Palette */}
        <div className="pointer-events-auto">
          <MainToolbar />
        </div>

        {/* Right: Export & Theme Toggle */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <ExportMenu onNotification={addNotification} />
          <ThemeToggle />
        </div>
      </header>

      {/* Primary SVG Vector Canvas */}
      <main className="flex-1 w-full h-full relative">
        <DrawingCanvas onCursorChange={setCursorPos} />
      </main>

      {/* Floating Bottom Left: Viewport Controls */}
      <div className="fixed bottom-14 left-4 z-30 pointer-events-auto">
        <ViewportControls />
      </div>

      {/* Collapsible Property Inspector on Right */}
      <PropertyInspector />

      {/* Fixed Footer Status Bar */}
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
      <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={`pointer-events-auto px-4 py-2.5 rounded-2xl glass-panel shadow-2xl flex items-center gap-2.5 text-xs font-medium border ${
                toast.type === "success"
                  ? "border-emerald-500/40 text-emerald-500"
                  : "border-red-500/40 text-red-500"
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
