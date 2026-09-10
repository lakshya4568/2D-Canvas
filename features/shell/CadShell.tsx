"use client";

import React from "react";
import { Point } from "@/lib/geometry/types";
import { useDrawing } from "@/lib/state/drawingContext";
import { DrawingCanvas } from "../canvas/DrawingCanvas";
import { CadHeader } from "./CadHeader";
import { CommandLine } from "./CommandLine";
import { StatusStrip } from "./StatusStrip";
import { PersonaDock } from "./PersonaDock";
import { TemplateModal } from "../parametric/TemplateModal";
import { InstructionManualModal } from "../manual/InstructionManualModal";
import { importDxfToShapes } from "@/lib/io/dxfImporter";

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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleTriggerDxfImport = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDxfFileSelected = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) {
          try {
            const shapes = importDxfToShapes(text);
            if (shapes.length > 0) {
              dispatch({ type: "LOAD_SHAPES", shapes });
            }
          } catch (err) {
            console.error("Failed to import DXF file:", err);
          }
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [dispatch]
  );

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
      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf"
        onChange={handleDxfFileSelected}
        className="hidden"
      />

      <CadHeader
        onOpenTemplates={() => setTemplatesOpen(true)}
        onOpenHelp={() => setShortcutsOpen(true)}
        onImportDxf={handleTriggerDxfImport}
      />

      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 relative bg-(--paper)">
          <DrawingCanvas onCursorChange={setCursorPos} />

          {/* Floating AutoCAD Command Line centered over canvas */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[700px] max-w-[92%] z-30 pointer-events-auto">
            <CommandLine
              cursorPos={cursorPos}
              onOpenTemplates={() => setTemplatesOpen(true)}
              onOpenHelp={() => setShortcutsOpen(true)}
              onImportDxf={handleTriggerDxfImport}
            />
          </div>

          {/* Sheet identity, bottom-left of the drawing area — the drafting
              equivalent of a sheet stamp. Sits over the canvas without
              intercepting the pointer. */}
          <div className="absolute left-16 bottom-3 pointer-events-none select-none z-10">
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

      <StatusStrip cursorPos={cursorPos} />

      <TemplateModal isOpen={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <InstructionManualModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
