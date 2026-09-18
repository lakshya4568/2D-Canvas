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
  FolderUp,
  Boxes,
  Ungroup,
  Bot,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { useUpce } from "@/features/parametric/upceContext";
import { useAgentPreview } from "@/features/agent/agentPreview";
import { ModeSwitch } from "./ModeSwitch";
import { useCad } from "@/features/bridge/useCad";
import { CadCommandRegistry } from "@/lib/commands/CommandRegistry";
import { exportDxf } from "@/lib/io/dxfExporter";
import { exportPdfSheet } from "@/lib/io/pdfSheetExporter";
import { importDxfToShapes } from "@/lib/io/dxfImporter";
import { shapesToParametricSketch } from "@/lib/serialization/shapesToSketch";

interface CadHeaderProps {
  onOpenTemplates: () => void;
  onOpenHelp: () => void;
  onImportDxf?: () => void;
  cadAgentOpen?: boolean;
  onToggleCadAgent?: () => void;
  personaDockOpen?: boolean;
  onTogglePersonaDock?: () => void;
  onOpenPersonaDock?: () => void;
  onOpenCatalog?: () => void;
  onOpenSheets?: () => void;
  onOpenDock?: (tab: "layers" | "bridge") => void;
}

import { Ribbon, RIBBON_TABS, type RibbonTab } from "./Ribbon";

export function CadHeader({
  onOpenTemplates,
  onOpenHelp,
  onImportDxf,
  cadAgentOpen,
  onToggleCadAgent,
  personaDockOpen,
  onTogglePersonaDock,
  onOpenPersonaDock,
  onOpenCatalog,
  onOpenSheets,
  onOpenDock,
}: CadHeaderProps) {
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

  const upce = useUpce();
  const cadOps = useCad();
  const agentPreview = useAgentPreview();
  const agentRunning = Boolean(agentPreview?.running);

  const selection = state.selectedIds.length > 0
    ? state.selectedIds
    : state.selectedId
      ? [state.selectedId]
      : [];

  const rigidUnits = upce.sketch.components.filter((c) => c.rigid);

  const groupRigid = () => upce.groupSelectionRigid(selection);
  const releaseRigid = () => upce.releaseAllRigid();

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
        openDxfImport: onImportDxf,
      });
      setSearchQuery("");
    }
  };

  // Exports read the whole CAD document: layers, annotations, hatches, sheets.
  const handleExportDxf = () => cadOps.exportDxf();
  const handleExportPdf = () => cadOps.exportPdf();
  const exportRef = React.useRef(cadOps);
  exportRef.current = cadOps;
  React.useEffect(() => {
    const onExport = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === "dxf") exportRef.current.exportDxf();
      if (what === "pdf") exportRef.current.exportPdf();
      if (what === "svg") exportRef.current.exportSvg();
    };
    window.addEventListener("cad:export", onExport);
    return () => window.removeEventListener("cad:export", onExport);
  }, []);

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
                  onImportDxf?.();
                  setAppMenuOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-(--pen-soft) flex items-center gap-2 text-(--fg-primary)"
              >
                <FolderUp className="w-3.5 h-3.5 text-blue-500" />
                <span>Import AutoCAD DXF... (DXFIN)</span>
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
                <span>Plot PDF sheets</span>
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
            title="New Drawing (Ctrl+N)"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onImportDxf}
            title="Open / Import DXF Drawing (DXFIN / OPEN)"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
          >
            <FolderUp className="w-3.5 h-3.5 text-blue-500" />
          </button>
          <button
            onClick={onOpenTemplates}
            title="Open Template Catalog"
            className="w-[24px] h-[22px] rounded hover:bg-(--ink-raised) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
          </button>
          <button
            onClick={handleExportDxf}
            title="Save / Export DXF (DXFOUT / QSAVE)"
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
        {/* Left Side: CAD Agent Toggle (Left Top) & Ribbon Tabs */}
        <div className="flex items-center gap-2.5">
          {onToggleCadAgent && (
            <button
              onClick={onToggleCadAgent}
              className={`h-[22px] px-2 rounded-[4px] text-[11px] font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer border ${
                cadAgentOpen
                  ? "bg-(--pen) text-white border-(--pen) shadow-xs"
                  : "bg-(--ink-sunken) text-(--fg-secondary) hover:text-(--fg-primary) border-(--rule) hover:border-(--pen)"
              }`}
              title={cadAgentOpen ? "Collapse CAD Agent (Left panel)" : "Open CAD Agent (Left top)"}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>CAD Agent</span>
              {agentRunning && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
          )}

          <div className="h-3.5 w-px bg-(--rule)" />

          <div className="flex items-center gap-1">
            {RIBBON_TABS.map((tab) => (
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
        </div>

        {/* Right Side: Persona Mode Switcher & Persona Dock Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-(--fg-muted) uppercase tracking-wider font-semibold">
              Persona:
            </span>
            <ModeSwitch onSelect={onOpenPersonaDock} />
          </div>

          {onTogglePersonaDock && (
            <button
              onClick={onTogglePersonaDock}
              className={`h-[22px] px-2 rounded-[4px] text-[11px] font-medium inline-flex items-center gap-1 transition-all cursor-pointer border ${
                personaDockOpen
                  ? "bg-(--ink-raised) text-(--fg-primary) border-(--rule-strong) shadow-xs"
                  : "bg-(--ink-sunken) text-(--fg-muted) hover:text-(--fg-primary) border-(--rule)"
              }`}
              title={personaDockOpen ? "Hide Persona & Properties dock" : "Show Persona & Properties dock"}
            >
              {personaDockOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
              <span className="text-[10px] font-medium">Panel</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Ribbon — each tab shows its own command panels */}
      <Ribbon
        tab={activeRibbonTab}
        onOpenCatalog={() => onOpenCatalog?.()}
        onOpenSheets={() => onOpenSheets?.()}
        onOpenTemplates={onOpenTemplates}
        onImportDxf={onImportDxf}
        onOpenDock={(t) => onOpenDock?.(t)}
        groupRigid={groupRigid}
        releaseRigid={releaseRigid}
        canGroupRigid={selection.length > 0}
        canReleaseRigid={rigidUnits.length > 0}
      />
    </header>
  );
}
