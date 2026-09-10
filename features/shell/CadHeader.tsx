"use client";

import React, { useState } from "react";
import {
  FilePlus,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  Minus,
  Spline,
  Square,
  Circle,
  Hexagon,
  Move,
  Copy,
  RotateCw,
  Scissors,
  Trash2,
  Ruler,
  Layers,
  Search,
  HelpCircle,
  Sun,
  Moon,
  FileCode,
  FileText,
  ChevronDown,
  LayoutTemplate,
  Crosshair,
  Lock,
  MousePointer2,
  Hand,
  Slash,
} from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ModeSwitch } from "./ModeSwitch";
import { CadCommandRegistry } from "@/lib/commands/CommandRegistry";
import { exportDxf } from "@/lib/io/dxfExporter";
import { exportPdfSheet } from "@/lib/io/pdfSheetExporter";
import { shapesToParametricSketch } from "@/lib/serialization/shapesToSketch";

interface CadHeaderProps {
  onOpenTemplates: () => void;
  onOpenHelp: () => void;
}

type RibbonTab = "home" | "draw" | "modify" | "parametric" | "annotate" | "output";

export function CadHeader({ onOpenTemplates, onOpenHelp }: CadHeaderProps) {
  const {
    state,
    dispatch,
    setTool,
    undo,
    redo,
    canUndo,
    canRedo,
    toggleGrid,
    toggleGridSnap,
    toggleObjectSnap,
    setThemeMode,
    clearAll,
  } = useDrawing();

  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>("home");
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isDark = state.themeMode !== "light";

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      e.preventDefault();
      CadCommandRegistry.execute(searchQuery, {
        state,
        shapes: state.shapes,
        selectedIds: state.selectedIds,
        lastPoint: null,
        cursorPos: null,
        dispatch,
        setTool,
        undo,
        redo,
        clearAll,
        openHelp: onOpenHelp,
        openTemplates: onOpenTemplates,
      });
      setSearchQuery("");
    }
  };

  const handleExportDxf = () => {
    const sketch = shapesToParametricSketch(state.shapes, undefined, "Exported AutoCAD Drawing");
    const dxfString = exportDxf(sketch);
    const blob = new Blob([dxfString], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawing_${Date.now()}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const sketch = shapesToParametricSketch(state.shapes, undefined, "Engineering Drawing Sheet");
    const pdfBytes = exportPdfSheet(sketch, {
      size: "A3",
      titleBlock: {
        projectName: "Civil Structure",
        drawingTitle: "UPCE Engineering Drawing",
        drawnBy: "Draftsman",
        scale: "1:100",
      },
    });
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sheet_${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="shrink-0 bg-(--ink-panel) border-b border-(--rule) flex flex-col z-30 select-none shadow-xs">
      {/* 1. AutoCAD Title & Quick Access Bar */}
      <div className="h-[32px] px-2 flex items-center gap-2 border-b border-(--rule) bg-(--ink-app)/80 text-[11px]">
        {/* Red AutoCAD 'A' Application Button */}
        <div className="relative">
          <button
            onClick={() => setAppMenuOpen(!appMenuOpen)}
            className="w-[26px] h-[24px] bg-[#d32f2f] hover:bg-[#b71c1c] text-white font-bold rounded flex items-center justify-center text-[13px] shadow-sm transition-transform active:scale-95 cursor-pointer"
            title="AutoCAD Application Menu"
          >
            A
          </button>

          {/* Application Menu Dropdown */}
          {appMenuOpen && (
            <div
              className="absolute left-0 top-[28px] w-[240px] bg-(--ink-panel) border border-(--rule-strong) rounded shadow-2xl py-1 z-50 text-[12px]"
              onMouseLeave={() => setAppMenuOpen(false)}
            >
              <div className="px-3 py-1.5 border-b border-(--rule) font-semibold text-(--fg-primary) flex items-center justify-between">
                <span>AutoCAD / UPCE</span>
                <span className="text-[10px] text-(--fg-muted)">v2024</span>
              </div>
              <button
                onClick={() => {
                  clearAll();
                  setAppMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-(--pen-soft) flex items-center gap-2 text-(--fg-primary)"
              >
                <FilePlus className="w-3.5 h-3.5 text-(--pen)" />
                <span>New Drawing (Ctrl+N)</span>
              </button>
              <button
                onClick={() => {
                  onOpenTemplates();
                  setAppMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-(--pen-soft) flex items-center gap-2 text-(--fg-primary)"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                <span>Open Template Catalog</span>
              </button>
              <div className="my-1 border-t border-(--rule)" />
              <button
                onClick={() => {
                  handleExportDxf();
                  setAppMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-(--pen-soft) flex items-center gap-2 text-(--fg-primary)"
              >
                <FileCode className="w-3.5 h-3.5 text-blue-500" />
                <span>Export AutoCAD DXF (AC1024)</span>
              </button>
              <button
                onClick={() => {
                  handleExportPdf();
                  setAppMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-(--pen-soft) flex items-center gap-2 text-(--fg-primary)"
              >
                <FileText className="w-3.5 h-3.5 text-red-500" />
                <span>Export PDF Drawing Sheet (A3)</span>
              </button>
              <div className="my-1 border-t border-(--rule)" />
              <button
                onClick={() => {
                  onOpenHelp();
                  setAppMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-(--pen-soft) flex items-center gap-2 text-(--fg-primary)"
              >
                <HelpCircle className="w-3.5 h-3.5 text-cyan-500" />
                <span>Instruction Manual (F1)</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Access Toolbar */}
        <div className="flex items-center gap-0.5 pr-2 border-r border-(--rule)">
          <button
            onClick={clearAll}
            title="New Drawing"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenTemplates}
            title="Open Template"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleExportDxf}
            title="Save / Export DXF"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary) disabled:opacity-30"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary) disabled:opacity-30"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* AutoCAD Workspace Switcher */}
        <div className="flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded bg-(--ink-panel) border border-(--rule) text-(--fg-secondary) font-medium">
          <span>2D Drafting & Annotation</span>
          <ChevronDown className="w-3 h-3 text-(--fg-muted)" />
        </div>

        {/* Document Title */}
        <div className="flex-1 text-center font-mono text-[11px] text-(--fg-muted) hidden md:block">
          AutoCAD Web Studio · <span className="text-(--fg-primary) font-semibold">Drawing1.dwg*</span>
        </div>

        {/* Quick Command Search Bar */}
        <div className="relative w-[180px] lg:w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2 top-[6px] text-(--fg-muted)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Type a command (e.g. LINE)..."
            className="w-full h-[24px] pl-7 pr-2 rounded bg-(--ink-panel) border border-(--rule) text-[10.5px] text-(--fg-primary) placeholder:text-(--fg-muted) outline-none focus:border-(--pen) transition-colors"
          />
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1 pl-2 border-l border-(--rule)">
          <button
            onClick={onOpenHelp}
            title="Instruction Manual & Shortcuts (F1)"
            className="h-[22px] px-2 rounded bg-(--pen-soft) text-(--pen) text-[10.5px] font-medium flex items-center gap-1 hover:bg-(--pen) hover:text-white transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Guide (F1)</span>
          </button>
          <button
            onClick={() => setThemeMode(isDark ? "light" : "dark")}
            title={isDark ? "Light mode" : "Dark mode"}
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. AutoCAD Ribbon Tab Headers & Persona Switcher */}
      <div className="h-[28px] px-3 flex items-center justify-between border-b border-(--rule) bg-(--ink-panel) text-[11.5px]">
        <div className="flex items-center gap-1">
          {[
            { id: "home", label: "Home" },
            { id: "draw", label: "Draw" },
            { id: "modify", label: "Modify" },
            { id: "parametric", label: "Parametric" },
            { id: "annotate", label: "Annotate" },
            { id: "output", label: "Output" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveRibbonTab(tab.id as RibbonTab)}
              className={`h-[28px] px-3 font-medium transition-colors border-b-2 cursor-pointer ${
                activeRibbonTab === tab.id
                  ? "border-(--pen) text-(--pen) font-semibold bg-(--ink-app)/40"
                  : "border-transparent text-(--fg-secondary) hover:text-(--fg-primary) hover:bg-(--ink-app)/20"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Persona Mode Switcher (Draftsman vs Author vs Run) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-(--fg-muted) uppercase tracking-wider font-semibold">
            Persona:
          </span>
          <ModeSwitch />
        </div>
      </div>

      {/* 3. AutoCAD Ribbon Action Bar (Active Panels) */}
      <div className="h-[64px] px-3 flex items-center gap-4 bg-(--ink-panel) overflow-x-auto overflow-y-hidden text-[11px]">
        {/* Select & Navigate Panel */}
        <div className="flex flex-col items-center justify-between h-[54px] pr-3 border-r border-(--rule)">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool("select")}
              className={`flex flex-col items-center justify-center w-[46px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "select" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Select (V) - Selects geometry entities"
            >
              <MousePointer2 className="w-4 h-4" />
              <span className="text-[9.5px]">Select</span>
            </button>
            <button
              onClick={() => setTool("pan")}
              className={`flex flex-col items-center justify-center w-[46px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "pan" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Pan (H / Space) - Pans the viewport"
            >
              <Hand className="w-4 h-4" />
              <span className="text-[9.5px]">Pan</span>
            </button>
          </div>
          <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider uppercase">Select</span>
        </div>

        {/* Draw Panel */}
        <div className="flex flex-col items-center justify-between h-[54px] pr-3 border-r border-(--rule)">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool("line")}
              className={`flex flex-col items-center justify-center w-[44px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "line" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Line (L) - Creates straight line segments"
            >
              <Minus className="w-4 h-4" />
              <span className="text-[9.5px]">Line</span>
            </button>
            <button
              onClick={() => setTool("polyline")}
              className={`flex flex-col items-center justify-center w-[44px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "polyline" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Polyline (PL) - Creates connected segments"
            >
              <Spline className="w-4 h-4" />
              <span className="text-[9.5px]">Pline</span>
            </button>
            <button
              onClick={() => setTool("rectangle")}
              className={`flex flex-col items-center justify-center w-[44px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "rectangle" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Rectangle (REC) - Creates rectangular polyline"
            >
              <Square className="w-4 h-4" />
              <span className="text-[9.5px]">Rect</span>
            </button>
            <button
              onClick={() => setTool("circle")}
              className={`flex flex-col items-center justify-center w-[44px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "circle" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Circle (C) - Creates circle with center & radius"
            >
              <Circle className="w-4 h-4" />
              <span className="text-[9.5px]">Circle</span>
            </button>
            <button
              onClick={() => setTool("polygon")}
              className={`flex flex-col items-center justify-center w-[44px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "polygon" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Polygon (POL) - Creates regular polygon"
            >
              <Hexagon className="w-4 h-4" />
              <span className="text-[9.5px]">Polygon</span>
            </button>
            <button
              onClick={() => setTool("construction")}
              className={`flex flex-col items-center justify-center w-[44px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "construction" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Construction Line (X) - Creates reference geometry"
            >
              <Crosshair className="w-4 h-4" />
              <span className="text-[9.5px]">Xline</span>
            </button>
          </div>
          <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider uppercase">Draw</span>
        </div>

        {/* Modify Panel */}
        <div className="flex flex-col items-center justify-between h-[54px] pr-3 border-r border-(--rule)">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool("move")}
              className={`flex flex-col items-center justify-center w-[40px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "move" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Move (M) - Displaces objects"
            >
              <Move className="w-4 h-4" />
              <span className="text-[9.5px]">Move</span>
            </button>
            <button
              onClick={() => dispatch({ type: "DUPLICATE_SELECTED" })}
              className="flex flex-col items-center justify-center w-[40px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer text-(--fg-secondary)"
              title="Copy (CO) - Duplicate selected objects"
            >
              <Copy className="w-4 h-4" />
              <span className="text-[9.5px]">Copy</span>
            </button>
            <button
              onClick={() => setTool("rotate")}
              className={`flex flex-col items-center justify-center w-[40px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "rotate" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Rotate (RO) - Rotates objects around center"
            >
              <RotateCw className="w-4 h-4" />
              <span className="text-[9.5px]">Rotate</span>
            </button>
            <button
              onClick={() => setTool("trim")}
              className={`flex flex-col items-center justify-center w-[40px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "trim" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Trim (TR) - Trims intersecting segment"
            >
              <Scissors className="w-4 h-4" />
              <span className="text-[9.5px]">Trim</span>
            </button>
            <button
              onClick={() => setTool("chamfer")}
              className={`flex flex-col items-center justify-center w-[40px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "chamfer" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Chamfer / Haunch (CHA / F) - Creates chamfer corner"
            >
              <Slash className="w-4 h-4" />
              <span className="text-[9.5px]">Chamfer</span>
            </button>
            <button
              onClick={() => dispatch({ type: "DELETE_SELECTED" })}
              className="flex flex-col items-center justify-center w-[40px] h-[36px] rounded hover:bg-(--crit-soft) hover:text-(--crit) transition-colors cursor-pointer text-(--fg-secondary)"
              title="Erase (E / Del) - Removes selected objects"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-[9.5px]">Erase</span>
            </button>
          </div>
          <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider uppercase">Modify</span>
        </div>

        {/* Annotation & Measure Panel */}
        <div className="flex flex-col items-center justify-between h-[54px] pr-3 border-r border-(--rule)">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool("dimension")}
              className={`flex flex-col items-center justify-center w-[46px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "dimension" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Linear Dimension (DIM) - Add dimension constraint"
            >
              <Ruler className="w-4 h-4" />
              <span className="text-[9.5px]">Dimension</span>
            </button>
            <button
              onClick={() => setTool("measure")}
              className={`flex flex-col items-center justify-center w-[46px] h-[36px] rounded hover:bg-(--ink-raised) transition-colors cursor-pointer ${
                state.tool === "measure" ? "bg-(--pen-soft) text-(--pen) font-bold" : "text-(--fg-secondary)"
              }`}
              title="Measure Distance (DI)"
            >
              <Crosshair className="w-4 h-4" />
              <span className="text-[9.5px]">Measure</span>
            </button>
          </div>
          <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider uppercase">Annotation</span>
        </div>

        {/* Layers & Standards */}
        <div className="flex flex-col items-center justify-between h-[54px] pr-3 border-r border-(--rule)">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-(--ink-app) border border-(--rule) text-[10.5px]">
              <Layers className="w-3.5 h-3.5 text-(--pen)" />
              <span className="font-mono font-semibold">Layer 0</span>
              <div className="w-2.5 h-2.5 rounded-full bg-white border border-slate-500" />
            </div>
            <button
              onClick={onOpenTemplates}
              className="px-2 py-1 rounded bg-(--ink-raised) border border-(--rule) text-[10.5px] font-medium text-(--fg-secondary) hover:text-(--fg-primary) flex items-center gap-1"
              title="Open Civil Parametric Templates"
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-amber-500" />
              <span>Catalog</span>
            </button>
          </div>
          <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider uppercase">Layers & Templates</span>
        </div>

        {/* Exporters Panel */}
        <div className="flex flex-col items-center justify-between h-[54px]">
          <div className="flex items-center gap-1">
            <button
              onClick={handleExportDxf}
              className="flex items-center gap-1 h-[32px] px-2.5 rounded bg-(--ink-raised) border border-(--rule) hover:border-(--pen) text-[10.5px] font-medium text-(--fg-primary) transition-colors cursor-pointer"
              title="Export AutoCAD R2010 DXF (AC1024)"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-500" />
              <span>DXF</span>
            </button>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1 h-[32px] px-2.5 rounded bg-(--ink-raised) border border-(--rule) hover:border-(--pen) text-[10.5px] font-medium text-(--fg-primary) transition-colors cursor-pointer"
              title="Export ISO 32000-1 A3 PDF Sheet"
            >
              <FileText className="w-3.5 h-3.5 text-red-500" />
              <span>PDF Sheet</span>
            </button>
          </div>
          <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider uppercase">Output</span>
        </div>
      </div>
    </header>
  );
}
