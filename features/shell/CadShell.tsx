"use client";

import React from "react";
import { Point } from "@/lib/geometry/types";
import { useDrawing } from "@/lib/state/drawingContext";
import { DrawingCanvas } from "../canvas/DrawingCanvas";
import { CommandBar } from "./CommandBar";
import { CommandLine } from "./CommandLine";
import { ToolRail } from "./ToolRail";
import { StatusStrip } from "./StatusStrip";
import { PersonaDock } from "./PersonaDock";
import { TemplateModal } from "../parametric/TemplateModal";
import { InstructionManualModal } from "../manual/InstructionManualModal";

/**
 * The application shell.
 *
 * Layout follows the arrangement every drafting tool converges on, because it
 * matches how the work is actually done: commands across the top, tools down the
 * left within thumb reach of the pointer, the sheet filling the centre, context
 * docked right, and machine state along the bottom edge where it can be read
 * without moving the eye off the drawing.
 *
 * The only unconventional part is deliberate: the right dock's contents swap
 * WHOLESALE with the persona (§3), rather than showing one panel with pieces
 * disabled. Three roles, three products, one kernel.
 */
export function CadShell() {
  const {
    state,
    dispatch,
    toggleObjectSnap,
    toggleGrid,
    toggleOrtho,
    toggleGridSnap,
    togglePolarTracking,
    toggleDynamicInput,
  } = useDrawing();
  const [cursorPos, setCursorPos] = React.useState<Point | null>(null);
  const [dockWidth, setDockWidth] = React.useState(320);
  const [dockCollapsed, setDockCollapsed] = React.useState(false);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const seeded = React.useRef(false);

  // A drafting tool should open showing what it does, not an empty sheet. Seed a
  // real parametric profile once, on first mount only, so the first look has
  // geometry, dimensions and a constraint state to read. Clearing the drawing
  // does not re-seed it.
  React.useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (state.shapes.length === 0) {
      dispatch({ type: "INSTANTIATE_TEMPLATE", templateId: "parametric_frame_cutout" });
    }
    // Intentionally first-mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme is applied at the document root so the CSS token blocks resolve.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", state.themeMode !== "light");
    root.classList.toggle("light", state.themeMode === "light");
  }, [state.themeMode]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (e.key === "F1" || e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === "F3") {
        e.preventDefault();
        toggleObjectSnap();
      } else if (e.key === "F7") {
        e.preventDefault();
        toggleGrid();
      } else if (e.key === "F8") {
        e.preventDefault();
        toggleOrtho();
      } else if (e.key === "F9") {
        e.preventDefault();
        toggleGridSnap();
      } else if (e.key === "F10") {
        e.preventDefault();
        togglePolarTracking();
      } else if (e.key === "F12") {
        e.preventDefault();
        toggleDynamicInput();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleObjectSnap, toggleGrid, toggleOrtho, toggleGridSnap, togglePolarTracking, toggleDynamicInput]);

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-(--ink-app)">
      <CommandBar onOpenTemplates={() => setTemplatesOpen(true)} />

      <div className="flex-1 min-h-0 flex">
        <ToolRail />

        <main className="flex-1 min-w-0 relative bg-(--paper)">
          <DrawingCanvas onCursorChange={setCursorPos} />

          {/* Sheet identity, bottom-left of the drawing area — the drafting
              equivalent of a sheet stamp. Sits over the canvas without
              intercepting the pointer. */}
          <div className="absolute left-3 bottom-3 pointer-events-none select-none">
            <p className="label !text-[8.5px] opacity-60">
              {state.userMode === "user" ? "Read-only" : "Model space"} · mm
            </p>
          </div>
        </main>

        <PersonaDock
          width={dockWidth}
          onWidthChange={setDockWidth}
          collapsed={dockCollapsed}
          onToggleCollapse={() => setDockCollapsed((v) => !v)}
        />
      </div>

      <CommandLine
        cursorPos={cursorPos}
        onOpenTemplates={() => setTemplatesOpen(true)}
        onOpenHelp={() => setShortcutsOpen(true)}
      />

      <StatusStrip cursorPos={cursorPos} />

      <TemplateModal isOpen={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <InstructionManualModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
