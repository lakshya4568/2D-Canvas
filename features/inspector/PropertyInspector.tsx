"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape } from "@/lib/geometry/types";
import { lineMetrics, rectMetrics, circleMetrics } from "@/lib/geometry/metrics";
import {
  Sliders,
  Layers,
  Palette,
  History,
  Move,
  Group,
  Ungroup,
  ArrowUpToLine,
  ArrowDownToLine,
  Copy,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  Check,
  Edit2,
  X,
  RotateCcw,
  RotateCw,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { VariablesPanel } from "../parametric/VariablesPanel";
import { FormulaEditor } from "../parametric/FormulaEditor";
import { ConstraintsPanel } from "../parametric/ConstraintsPanel";
import { TemplateModal } from "../parametric/TemplateModal";
import { ParametricModel } from "@/lib/parametric/model";
import { detectClosedLoops } from "@/lib/parametric/closedGeometry";
import { computePolygonMoments } from "@/lib/geometry/metrics/polygonMoments";
import { detectGADAssemblies } from "@/lib/geometry/gadAssemblyEngine";

const PRESET_COLORS = [
  "#f8fafc", // White (Dark Mode default)
  "#0f172a", // Black (Light Mode default)
  "#f59e0b", // Precision CAD Amber
  "#10b981", // CAD Emerald
  "#ff9500", // Tertiary Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
];

export interface PropertyInspectorProps {
  width?: number;
  onWidthChange?: (w: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function PropertyInspector({
  width = 360,
  onWidthChange,
  isCollapsed = false,
  onToggleCollapse,
}: PropertyInspectorProps) {
  const {
    state,
    dispatch,
    selectedShape,
    selectedShapes,
    isGroupSelected,
    groupSelected,
    ungroupSelected,
    duplicateSelected,
    deleteSelected,
    selectShape,
    jumpToHistory,
  } = useDrawing();

  const [activeTab, setActiveTab] = useState<"transform" | "autoformula" | "parametric" | "style" | "layers" | "history">("autoformula");
  const [paramSubTab, setParamSubTab] = useState<"variables" | "formulas" | "constraints">("variables");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [editingFormulaExpr, setEditingFormulaExpr] = useState<string>("");
  const [editingVarName, setEditingVarName] = useState<string | null>(null);
  const [editingVarVal, setEditingVarVal] = useState<string>("");

  const activeGADAssembly = React.useMemo(() => {
    const assemblies = detectGADAssemblies(state.shapes);
    if (assemblies.length === 0) return null;
    if (selectedShape) {
      const match = assemblies.find(
        (a) => a.outer.id === selectedShape.id || a.features.some((f) => f.id === selectedShape.id)
      );
      if (match) return match;
    }
    return assemblies[0];
  }, [state.shapes, selectedShape]);

  const primaryFeature = activeGADAssembly?.features[0];
  const defaultSpan = primaryFeature ? Math.round(primaryFeature.span) : 0;
  const defaultHeight = primaryFeature?.bounds ? Math.round(primaryFeature.bounds.height) : 0;
  const defaultWallT = activeGADAssembly ? Math.round(activeGADAssembly.clearances.left || activeGADAssembly.clearances.right || 30) : 30;
  const defaultSlabT = activeGADAssembly ? Math.round(activeGADAssembly.clearances.top || activeGADAssembly.clearances.bottom || 30) : 30;

  const [inputSpan, setInputSpan] = useState<number>(300);
  const [inputHeight, setInputHeight] = useState<number>(200);

  React.useEffect(() => {
    if (defaultSpan > 0) setInputSpan(defaultSpan);
    if (defaultHeight > 0) setInputHeight(defaultHeight);
  }, [defaultSpan, defaultHeight]);

  const handleApplyClearSpan = () => {
    if (!primaryFeature) return;
    dispatch({
      type: "UPDATE_SHAPE",
      id: primaryFeature.id,
      updates: {
        width: inputSpan,
        height: inputHeight,
      },
    });
  };

  const activeLoop = React.useMemo(() => {
    if (!selectedShape) return null;
    const loops = detectClosedLoops(state.shapes);
    for (const loop of loops) {
      if (loop.shapes.some((s) => s.id === selectedShape.id)) {
        return loop;
      }
    }
    return null;
  }, [state.shapes, selectedShape]);

  const moments = React.useMemo(() => {
    if (!activeLoop?.vertices || activeLoop.vertices.length < 3) return null;
    return computePolygonMoments(activeLoop.vertices);
  }, [activeLoop]);

  const systemDof = React.useMemo(() => {
    const vCount = state.shapes.length * 2;
    const cCount = state.constraints.filter((c) => c.enabled).length;
    return Math.max(0, vCount - cCount - 3);
  }, [state.shapes.length, state.constraints]);

  const handleUpdate = (updates: Partial<Shape>) => {
    if (!state.selectedId) return;
    dispatch({
      type: "UPDATE_SHAPE",
      id: state.selectedId,
      updates,
    });
  };

  // Count shape types
  const lineCount = state.shapes.filter((s) => s.type === "line").length;
  const rectCount = state.shapes.filter((s) => s.type === "rectangle").length;
  const circCount = state.shapes.filter((s) => s.type === "circle").length;

  // Grouped shapes summary
  const groupMap = new Map<string, Shape[]>();
  const ungroupedShapes: Shape[] = [];
  state.shapes.forEach((s) => {
    if (s.groupId) {
      if (!groupMap.has(s.groupId)) groupMap.set(s.groupId, []);
      groupMap.get(s.groupId)!.push(s);
    } else {
      ungroupedShapes.push(s);
    }
  });

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = Math.max(260, Math.min(650, startWidth + delta));
      onWidthChange?.(nextWidth);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="fixed right-0 top-16 h-12 px-2.5 bg-[var(--bg-panel)] border-l border-y border-[var(--border-subtle)] text-amber-500 hover:text-amber-400 z-40 rounded-l-md flex items-center gap-1.5 shadow-lg cursor-pointer transition-colors"
        title="Expand Inspector Sidebar"
      >
        <PanelRightOpen className="w-4 h-4" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Properties</span>
      </button>
    );
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className="fixed right-0 top-14 bottom-7 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] z-40 flex flex-col select-none text-xs font-sans shadow-xl"
    >
      <div
        onPointerDown={handleResizeStart}
        className="absolute left-0 top-0 bottom-0 w-2 hover:w-2.5 -translate-x-1 cursor-ew-resize transition-all z-50 group flex items-center justify-center"
        title="Drag horizontally to resize panel (min: 260px, max: 650px)"
      >
        <div className="w-[2px] h-12 rounded-full bg-[var(--border-strong)] group-hover:bg-amber-500 transition-colors" />
      </div>
      {/* 4 Tabs matching Stitch Specification */}
      <div className="flex border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-panel-subtle)]">
        <button
          onClick={() => setActiveTab("transform")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "transform"
              ? "bg-[var(--bg-panel)] text-amber-500 font-semibold border-b-2 border-amber-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="Transform & Geometry"
        >
          <Move className="w-3.5 h-3.5" />
          <span className="text-[10px]">Transform</span>
        </button>

        <button
          onClick={() => setActiveTab("autoformula")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors relative ${
            activeTab === "autoformula"
              ? "bg-[var(--bg-panel)] text-amber-500 font-semibold border-b-2 border-amber-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="AutoFormula & Clear Span Inferences"
        >
          <div className="relative">
            <Sparkles className="w-3.5 h-3.5" />
            {state.inferredFormulas && state.inferredFormulas.length > 0 && (
              <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </div>
          <span className="text-[10px]">AutoFormula</span>
        </button>

        {state.userMode === "author" && (
          <button
            onClick={() => setActiveTab("parametric")}
            className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
              activeTab === "parametric"
                ? "bg-[var(--bg-panel)] text-amber-500 font-semibold border-b-2 border-amber-500"
                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
            }`}
            title="Parametric Variables & Constraints"
          >
            <span className="font-mono text-xs font-bold leading-none">ƒ(x)</span>
            <span className="text-[10px]">Params</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab("style")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "style"
              ? "bg-[var(--bg-panel)] text-amber-500 font-semibold border-b-2 border-amber-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="Stroke & Fill Style"
        >
          <Palette className="w-3.5 h-3.5" />
          <span className="text-[10px]">Style</span>
        </button>

        <button
          onClick={() => setActiveTab("layers")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "layers"
              ? "bg-[var(--bg-panel)] text-amber-500 font-semibold border-b-2 border-amber-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="Layers & Groups"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="text-[10px]">Layers</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "history"
              ? "bg-[var(--bg-panel)] text-amber-500 font-semibold border-b-2 border-amber-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="History Timeline"
        >
          <History className="w-3.5 h-3.5" />
          <span className="text-[10px]">History</span>
        </button>
      </div>

      {/* Header bar */}
      <div className="p-2 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--bg-panel-subtle)]">
        <div>
          <div className="font-semibold text-[11px] text-[var(--fg-primary)]">
            {selectedShapes.length > 1
              ? isGroupSelected
                ? `Group (${selectedShapes.length} objects)`
                : `Selection (${selectedShapes.length} objects)`
              : selectedShape
              ? `${selectedShape.type.toUpperCase()}`
              : "Canvas Overview"}
          </div>
          <div className="text-[9px] font-mono text-[var(--fg-muted)]">
            {selectedShapes.length > 0 ? "Properties & Grouping" : "Precision Vector Logic"}
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded text-[var(--fg-muted)] hover:text-amber-400 hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
          title="Collapse Panel"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 custom-scrollbar">
        {activeTab === "autoformula" && (
          <div className="flex flex-col gap-3">
            {activeGADAssembly ? (
              <div className="p-3 rounded-lg bg-[var(--bg-app)] border border-amber-500/40 flex flex-col gap-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Clear Span & Component Sizing
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30">
                    Live Active
                  </span>
                </div>

                <div className="text-[10px] text-[var(--fg-secondary)]">
                  Adjust the clear span or height below. The solver will automatically expand the outer walls while locking wall thickness:
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-[var(--fg-muted)] uppercase">Clear Span (Inner W)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={inputSpan}
                        onChange={(e) => setInputSpan(Number(e.target.value))}
                        className="w-full h-7 bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] rounded px-2 text-[11px] font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-[var(--fg-muted)]">mm</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-[var(--fg-muted)] uppercase">Clear Height (Inner H)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={inputHeight}
                        onChange={(e) => setInputHeight(Number(e.target.value))}
                        className="w-full h-7 bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] rounded px-2 text-[11px] font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-[var(--fg-muted)]">mm</span>
                    </div>
                  </div>

                  <div className="p-1.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] flex justify-between items-center text-[10px]">
                    <span className="text-[var(--fg-muted)]">Wall Thickness:</span>
                    <b className="text-[var(--fg-primary)]">{defaultWallT} mm</b>
                  </div>

                  <div className="p-1.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] flex justify-between items-center text-[10px]">
                    <span className="text-[var(--fg-muted)]">Slab Thickness:</span>
                    <b className="text-[var(--fg-primary)]">{defaultSlabT} mm</b>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplyClearSpan}
                  className="w-full h-7 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[11px] transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-1.5 mt-1"
                >
                  <span>Apply & Stretch Structure</span>
                  <span>↵</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] text-center text-[11px] text-[var(--fg-muted)]">
                Draw an outer shape and an inner opening using the Rectangle or Line tools to detect structural spans and clearances.
              </div>
            )}

            {state.inferredFormulas && state.inferredFormulas.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--fg-secondary)] uppercase tracking-wider">
                    Inferred Mathematical Invariants ({state.inferredFormulas.length})
                  </span>
                  {state.userMode === "author" && (
                    <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Author Mode Active
                    </span>
                  )}
                </div>

                {state.inferredFormulas.map((f) => {
                  const matchingVar = state.variables[f.targetProperty]
                    ?? Object.entries(state.variables).find(([k]) => k.replace(/[._]/g, "").toLowerCase() === f.targetProperty.replace(/[._]/g, "").toLowerCase())?.[1];
                  const isAccepted = f.status === "accepted" || Boolean(matchingVar?.formula);
                  const liveVal = matchingVar?.value ?? f.evaluatedValue;
                  const isSelected = selectedFormulaId === f.id || (selectedShape && selectedShape.id === f.targetShapeId);
                  const isEditingThisFormula = editingFormulaId === f.id;

                  return (
                    <div
                      key={f.id}
                      onClick={() => {
                        setSelectedFormulaId(f.id);
                        if (f.targetShapeId) {
                          selectShape(f.targetShapeId);
                        }
                      }}
                      className={`p-2.5 rounded border flex flex-col gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? "ring-2 ring-amber-500/80 border-amber-500 shadow-md " + (isAccepted ? "bg-emerald-500/15" : "bg-amber-500/10")
                          : isAccepted
                          ? "bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-500/60"
                          : "bg-[var(--bg-panel-subtle)] border-[var(--border-subtle)] hover:border-amber-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-[var(--fg-primary)] flex items-center gap-1.5">
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                          {f.displayTarget}
                        </span>
                        <span className="font-mono text-emerald-400 font-bold text-xs">
                          {Math.round(liveVal)} mm
                        </span>
                      </div>

                      {/* Formula Expression (Editable in Author Mode) */}
                      {isEditingThisFormula ? (
                        <div
                          className="flex items-center gap-1 bg-[var(--bg-app)] p-1 rounded border border-amber-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-mono text-[10px] text-amber-400 font-semibold pl-1">
                            {f.targetProperty} =
                          </span>
                          <input
                            type="text"
                            value={editingFormulaExpr}
                            onChange={(e) => setEditingFormulaExpr(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                dispatch({
                                  type: "UPDATE_INFERRED_FORMULA",
                                  id: f.id,
                                  expression: editingFormulaExpr,
                                });
                                setEditingFormulaId(null);
                              } else if (e.key === "Escape") {
                                setEditingFormulaId(null);
                              }
                            }}
                            className="flex-1 bg-transparent font-mono text-[10px] text-[var(--fg-primary)] focus:outline-none px-1"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              dispatch({
                                type: "UPDATE_INFERRED_FORMULA",
                                id: f.id,
                                expression: editingFormulaExpr,
                              });
                              setEditingFormulaId(null);
                            }}
                            className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[9px] cursor-pointer"
                            title="Save formula"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFormulaId(null)}
                            className="p-1 rounded bg-[var(--bg-panel)] hover:bg-[var(--border-subtle)] text-[var(--fg-muted)] text-[9px] cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between font-mono text-[10px] text-[var(--fg-secondary)] bg-[var(--bg-app)] px-2 py-1 rounded border border-[var(--border-subtle)]">
                          <span className="truncate">
                            {f.targetProperty} = {f.expression}
                          </span>
                          {state.userMode === "author" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFormulaId(f.id);
                                setEditingFormulaExpr(f.expression);
                              }}
                              className="ml-1 text-[var(--fg-muted)] hover:text-amber-400 p-0.5 rounded cursor-pointer transition-colors"
                              title="Edit formula in Author Mode"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Variables list & In-place parameter tweaking */}
                      {f.variables && f.variables.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-mono text-[var(--fg-muted)]">
                          {f.variables.map((v) => {
                            const varMatch = state.variables[v.name]
                              ?? Object.entries(state.variables).find(([k]) => k.replace(/[._]/g, "").toLowerCase() === v.name.replace(/[._]/g, "").toLowerCase())?.[1];
                            const currentVal = varMatch?.value ?? v.value;
                            const isEditingThisVar = editingVarName === `${f.id}_${v.name}`;

                            if (isEditingThisVar) {
                              return (
                                <div
                                  key={v.name}
                                  className="flex items-center gap-1 bg-[var(--bg-app)] px-1.5 py-0.5 rounded border border-amber-500"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>{v.name}:</span>
                                  <input
                                    type="number"
                                    value={editingVarVal}
                                    onChange={(e) => setEditingVarVal(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const num = Number(editingVarVal);
                                        if (!isNaN(num)) {
                                          dispatch({ type: "SET_VARIABLE", name: v.name, valueOrFormula: num });
                                        }
                                        setEditingVarName(null);
                                      } else if (e.key === "Escape") {
                                        setEditingVarName(null);
                                      }
                                    }}
                                    className="w-12 bg-transparent text-[9px] font-bold text-amber-400 focus:outline-none"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const num = Number(editingVarVal);
                                      if (!isNaN(num)) {
                                        dispatch({ type: "SET_VARIABLE", name: v.name, valueOrFormula: num });
                                      }
                                      setEditingVarName(null);
                                    }}
                                    className="text-amber-400 hover:text-amber-300 font-bold"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingVarName(null)}
                                    className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <button
                                key={v.name}
                                type="button"
                                onClick={(e) => {
                                  if (state.userMode === "author") {
                                    e.stopPropagation();
                                    setEditingVarName(`${f.id}_${v.name}`);
                                    setEditingVarVal(String(Math.round(currentVal)));
                                  }
                                }}
                                className={`bg-[var(--bg-app)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] flex items-center gap-1 transition-colors ${
                                  state.userMode === "author"
                                    ? "hover:border-amber-500/60 hover:text-amber-300 cursor-pointer"
                                    : ""
                                }`}
                                title={state.userMode === "author" ? `Click to adjust ${v.name}` : undefined}
                              >
                                <span>{v.name}:</span>
                                <b className="text-[var(--fg-primary)]">{Math.round(currentVal)} mm</b>
                                {state.userMode === "author" && (
                                  <span className="text-[8px] text-[var(--fg-muted)]">✎</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]/40 mt-0.5">
                        <span className="text-[9px] text-[var(--fg-muted)] font-mono">
                          Confidence: {Math.round(f.confidence * 100)}%
                        </span>
                        {!isAccepted ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({ type: "ACCEPT_INFERRED_FORMULA", id: f.id });
                            }}
                            className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[10px] transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                          >
                            <span>+ Bind to Model</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                              ✓ Bound to Model
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: "UNBIND_INFERRED_FORMULA", id: f.id });
                              }}
                              className="px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-mono font-semibold transition-colors cursor-pointer"
                              title="Unbind parameter from model"
                            >
                              ✕ Unbind
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TRANSFORM TAB ================= */}
        {activeTab === "transform" && (
          <>
            {/* Grouping Quick Actions */}
            {selectedShapes.length > 1 && (
              <div className="p-2 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] flex flex-col gap-2">
                <span className="text-[10px] font-semibold text-[var(--fg-secondary)] uppercase">
                  Grouping Property
                </span>
                <div className="flex items-center gap-2">
                  {!isGroupSelected ? (
                    <button
                      onClick={groupSelected}
                      className="flex-1 h-6 px-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 font-bold rounded text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <Group className="w-3 h-3" />
                      <span>Group Objects</span>
                    </button>
                  ) : (
                    <button
                      onClick={ungroupSelected}
                      className="flex-1 h-6 px-2 bg-[var(--bg-panel)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--fg-primary)] rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Ungroup className="w-3 h-3 text-amber-500" />
                      <span>Ungroup</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedShape ? (
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
                  Geometry
                </span>

                {/* Line Inputs */}
                {selectedShape.type === "line" && (
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">X1</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.x1)}
                        onChange={(e) => handleUpdate({ x1: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y1</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y1)}
                        onChange={(e) => handleUpdate({ y1: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">X2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.x2)}
                        onChange={(e) => handleUpdate({ x2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y2)}
                        onChange={(e) => handleUpdate({ y2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2 p-2 rounded bg-[var(--bg-panel-subtle)] flex justify-between text-[10px] text-[var(--fg-secondary)]">
                      <span>Length: {lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).length.toFixed(1)} px</span>
                      <span>Angle: {lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).angleDeg.toFixed(1)}°</span>
                    </div>
                  </div>
                )}

                {/* Rectangle Inputs */}
                {selectedShape.type === "rectangle" && (
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">X</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.x)}
                        onChange={(e) => handleUpdate({ x: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y)}
                        onChange={(e) => handleUpdate({ y: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">W</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.width)}
                        onChange={(e) => handleUpdate({ width: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">H</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.height)}
                        onChange={(e) => handleUpdate({ height: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2 p-2 rounded bg-[var(--bg-panel-subtle)] flex justify-between text-[10px] text-[var(--fg-secondary)]">
                      <span>Area: {rectMetrics(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height).area.toFixed(0)} px²</span>
                      <span>Perimeter: {rectMetrics(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height).perimeter.toFixed(0)} px</span>
                    </div>
                  </div>
                )}

                {/* Circle Inputs */}
                {selectedShape.type === "circle" && (
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CX</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cx)}
                        onChange={(e) => handleUpdate({ cx: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">R</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.r)}
                        onChange={(e) => handleUpdate({ r: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2 p-2 rounded bg-[var(--bg-panel-subtle)] flex justify-between text-[10px] text-[var(--fg-secondary)]">
                      <span>Diameter: {circleMetrics(selectedShape.cx, selectedShape.cy, selectedShape.r).diameter.toFixed(1)} px</span>
                      <span>Area: {circleMetrics(selectedShape.cx, selectedShape.cy, selectedShape.r).area.toFixed(0)} px²</span>
                    </div>
                  </div>
                )}

                {/* Arrow Inputs */}
                {selectedShape.type === "arrow" && (
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">X1</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.x1)}
                        onChange={(e) => handleUpdate({ x1: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y1</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y1)}
                        onChange={(e) => handleUpdate({ y1: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">X2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.x2)}
                        onChange={(e) => handleUpdate({ x2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y2)}
                        onChange={(e) => handleUpdate({ y2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2 p-2 rounded bg-[var(--bg-panel-subtle)] flex justify-between text-[10px] text-[var(--fg-secondary)]">
                      <span>Length: {lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).length.toFixed(1)} px</span>
                      <span>Angle: {lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).angleDeg.toFixed(1)}°</span>
                    </div>
                  </div>
                )}

                {/* Ellipse Inputs */}
                {selectedShape.type === "ellipse" && (
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CX</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cx)}
                        onChange={(e) => handleUpdate({ cx: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Rx</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.rx)}
                        onChange={(e) => handleUpdate({ rx: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Ry</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.ry)}
                        onChange={(e) => handleUpdate({ ry: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Polygon / Triangle Inputs */}
                {selectedShape.type === "polygon" && (
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CX</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cx)}
                        onChange={(e) => handleUpdate({ cx: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">R</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.r)}
                        onChange={(e) => handleUpdate({ r: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Sides</span>
                      <input
                        type="number"
                        min={3}
                        max={12}
                        value={selectedShape.sides}
                        onChange={(e) => handleUpdate({ sides: Math.max(3, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Star Inputs */}
                {selectedShape.type === "star" && (
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CX</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cx)}
                        onChange={(e) => handleUpdate({ cx: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Inner</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.innerR)}
                        onChange={(e) => handleUpdate({ innerR: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Outer</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.outerR)}
                        onChange={(e) => handleUpdate({ outerR: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Rotation Controls */}
                <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider font-semibold">Rotation</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => dispatch({ type: "ROTATE_SELECTED_BY_ANGLE", deltaDeg: -90 })}
                        className="p-1 rounded bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors cursor-pointer"
                        title="Rotate 90° CCW"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => dispatch({ type: "ROTATE_SELECTED_BY_ANGLE", deltaDeg: 90 })}
                        className="p-1 rounded bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors cursor-pointer"
                        title="Rotate 90° CW"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <input
                      type="number"
                      min={0}
                      max={360}
                      value={Math.round(selectedShape.rotation || 0)}
                      onChange={(e) => handleUpdate({ rotation: (Number(e.target.value) % 360 + 360) % 360 })}
                      className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-[var(--fg-muted)]">deg</span>
                  </div>
                </div>

                {/* Closed Shape & Mathematical Analysis Card */}
                {activeLoop && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-amber-500/30 flex flex-col gap-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Closed Shape Analysis
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                        {activeLoop.analysis.vertexCount} Edges (Closed)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Shoelace Area</span>
                        <span className="text-[11px] font-bold text-[var(--fg-primary)]">
                          {activeLoop.analysis.area.toLocaleString()} px²
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Perimeter</span>
                        <span className="text-[11px] font-bold text-[var(--fg-primary)]">
                          {activeLoop.analysis.perimeter.toFixed(1)} px
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Inertia Ixx</span>
                        <span className="text-[10px] font-semibold text-zinc-200">
                          {moments?.IxxCentroid ? moments.IxxCentroid.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/A"}
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Inertia Iyy</span>
                        <span className="text-[10px] font-semibold text-zinc-200">
                          {moments?.IyyCentroid ? moments.IyyCentroid.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/A"}
                        </span>
                      </div>
                      <div className="col-span-2 p-1.5 rounded bg-[var(--bg-app)] flex justify-between items-center">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Centroid (Cx, Cy)</span>
                        <span className="text-[10px] font-semibold text-amber-400">
                          ({activeLoop.analysis.centroid.x}, {activeLoop.analysis.centroid.y})
                        </span>
                      </div>
                      <div className="col-span-2 p-1.5 rounded bg-[var(--bg-app)] flex justify-between items-center">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">System Mobility (DOF)</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          systemDof === 0
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}>
                          {systemDof === 0 ? "Well-Constrained (0 DOF)" : `Under-Constrained (${systemDof} DOFs)`}
                        </span>
                      </div>
                      <div className="col-span-2 p-1.5 rounded bg-[var(--bg-app)] flex justify-between items-center">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Bounding Box</span>
                        <span className="text-[10px] text-[var(--fg-secondary)]">
                          {activeLoop.analysis.boundingBox.width} × {activeLoop.analysis.boundingBox.height} px
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] text-[var(--fg-secondary)] flex flex-col gap-2">
                <span className="font-semibold text-[11px] text-[var(--fg-primary)]">Tip: Multi-Selection & Grouping</span>
                <p className="text-[10px] leading-relaxed">
                  Hold <kbd className="px-1 py-0.5 bg-[var(--bg-app)] rounded border font-mono">Shift</kbd> while clicking multiple shapes to select them together. Click <b>Group Objects</b> (or press <kbd className="px-1 py-0.5 bg-[var(--bg-app)] rounded border font-mono">Ctrl+G</kbd>) to link them as a unified movable entity.
                </p>
              </div>
            )}
          </>
        )}

        {/* ================= PARAMETRIC TAB ================= */}
        {activeTab === "parametric" && (
          <div className="flex flex-col gap-3">
            {/* Template Library Trigger */}
            <button
              onClick={() => setIsTemplateModalOpen(true)}
              className="w-full h-8 rounded bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--fg-primary)] flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer transition-all shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Parametric CAD Templates</span>
            </button>

            {/* Selected Shape Parameters Binding */}
            {selectedShape && (
              <div className="p-2.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-amber-500 text-xs">
                    {selectedShape.name || ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape))}
                  </span>
                  <span className="rounded bg-[var(--bg-panel-subtle)] px-1.5 py-0.5 text-[9px] text-[var(--fg-muted)] uppercase font-mono">
                    {selectedShape.type}
                  </span>
                </div>

                {/* Editable Shape Name / Identifier */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--fg-muted)] w-10">Name:</span>
                  <input
                    type="text"
                    value={selectedShape.name || ""}
                    placeholder={ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape))}
                    onChange={(e) => handleUpdate({ name: e.target.value.trim() })}
                    className="flex-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[11px] font-mono text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                    title="Set variable identifier for this shape (e.g. top_outer_rect)"
                  />
                </div>

                {/* Dedicated Line Length & Formula Control */}
                {(selectedShape.type === "line" || selectedShape.type === "arrow") && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[10px] text-amber-400">Line Length & Formula</span>
                      <span className="font-mono text-[10px] text-emerald-400 font-bold">
                        L: {Math.hypot(selectedShape.x2 - selectedShape.x1, selectedShape.y2 - selectedShape.y1).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        placeholder="e.g. 300 or top_outer - 40"
                        defaultValue={
                          state.variables[selectedShape.name ?? ""]?.formula ??
                          state.variables[selectedShape.name ?? ""]?.value ??
                          ""
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = (e.target as HTMLInputElement).value.trim();
                            const varName = selectedShape.name || ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape));
                            if (val) {
                              dispatch({ type: "SET_VARIABLE", name: varName, valueOrFormula: val });
                              if (!selectedShape.name) handleUpdate({ name: varName });
                            }
                          }
                        }}
                        className="flex-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[11px] font-mono text-[var(--fg-primary)] focus:border-amber-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                          const val = input.value.trim();
                          const varName = selectedShape.name || ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape));
                          if (val) {
                            dispatch({ type: "SET_VARIABLE", name: varName, valueOrFormula: val });
                            if (!selectedShape.name) handleUpdate({ name: varName });
                          }
                        }}
                        className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-zinc-950 hover:bg-amber-400 cursor-pointer"
                      >
                        Set ↵
                      </button>
                    </div>
                    {state.variables[selectedShape.name ?? ""] && (
                      <div className="flex items-center gap-1 text-[9px] font-mono text-emerald-400">
                        <span>●</span>
                        <span>
                          Bound to <b>{selectedShape.name}</b> ={" "}
                          {state.variables[selectedShape.name!].formula
                            ? state.variables[selectedShape.name!].formula
                            : state.variables[selectedShape.name!].value}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Expose Shape Parameters */}
                <div className="space-y-1 font-mono text-[11px]">
                  {ParametricModel.getShapeParameters(selectedShape).map((p) => {
                    const shapeName = selectedShape.name || ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape));
                    const varName = `${shapeName}_${p.key}`;
                    const dotVarName = `${shapeName}.${p.key}`;
                    const normKey = `${shapeName}${p.key}`.toLowerCase();
                    const boundVar = state.variables[varName]
                      || state.variables[dotVarName]
                      || (selectedShape.name ? (state.variables[`${selectedShape.name}_${p.key}`] || state.variables[`${selectedShape.name}.${p.key}`]) : undefined)
                      || Object.entries(state.variables).find(([k]) => k.replace(/[._]/g, "").toLowerCase() === normKey)?.[1];

                    return (
                      <div key={p.key} className="flex flex-col py-1 border-b border-[var(--border-subtle)]/40 last:border-0 gap-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[var(--fg-muted)]">{p.label}:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[var(--fg-primary)]">{p.value}</span>
                            {!p.readOnly && !boundVar && (
                              <button
                                type="button"
                                onClick={() => {
                                  dispatch({
                                    type: "SET_VARIABLE",
                                    name: varName,
                                    valueOrFormula: p.value,
                                  });
                                }}
                                className="rounded px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-bold cursor-pointer"
                                title="Bind parameter to new variable"
                              >
                                +Var
                              </button>
                            )}
                          </div>
                        </div>
                        {boundVar && (
                          <div className="flex items-center justify-between bg-[var(--bg-panel-subtle)] px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-400 border border-emerald-500/20">
                            <span className="truncate">
                              {boundVar.name} = {boundVar.formula ? boundVar.formula : boundVar.value}
                            </span>
                            <button
                              type="button"
                              onClick={() => dispatch({ type: "DELETE_VARIABLE", name: boundVar.name })}
                              className="text-red-400 hover:text-red-300 ml-1 cursor-pointer"
                              title="Delete / unbind variable"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-tab switcher */}
            <div className="flex rounded bg-[var(--bg-panel-subtle)] p-0.5 border border-[var(--border-subtle)]">
              {(["variables", "formulas", "constraints"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setParamSubTab(tab)}
                  className={`flex-1 py-1 rounded text-[10px] font-semibold capitalize transition-all ${
                    paramSubTab === tab
                      ? "bg-[var(--bg-panel)] text-amber-500 shadow-xs"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Sub-tab view */}
            {paramSubTab === "variables" && <VariablesPanel />}
            {paramSubTab === "formulas" && <FormulaEditor />}
            {paramSubTab === "constraints" && <ConstraintsPanel />}
          </div>
        )}

        {/* ================= STYLE TAB ================= */}
        {activeTab === "style" && (
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
              Stroke & Appearance
            </span>

            {/* Stroke Color */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(() => {
                const defaultColor = state.themeMode === "light" ? "#0f172a" : "#f8fafc";
                const currentStroke = selectedShape?.strokeColor || state.currentStyle.strokeColor || defaultColor;
                return PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleUpdate({ strokeColor: c })}
                    className={`w-5 h-5 rounded border border-black/20 transition-transform ${
                      currentStroke.toLowerCase() === c.toLowerCase() ? "ring-2 ring-amber-500 scale-110" : ""
                    }`}
                    style={{ backgroundColor: c }}
                    title={`Stroke ${c}`}
                  />
                ));
              })()}
            </div>

            {/* Stroke Width */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-[var(--fg-muted)]">Stroke Width</span>
              <div className="flex items-center gap-1">
                {[1, 1.5, 2, 3, 5].map((w) => (
                  <button
                    key={w}
                    onClick={() => handleUpdate({ strokeWidth: w })}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                      (selectedShape?.strokeWidth || 1.5) === w
                        ? "bg-amber-500 text-zinc-950 font-bold"
                        : "bg-[var(--bg-app)] text-[var(--fg-secondary)] border border-[var(--border-subtle)]"
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            {/* Stroke Style */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-[var(--fg-muted)]">Stroke Style</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleUpdate({ strokeDasharray: undefined })}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    !selectedShape?.strokeDasharray
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "bg-[var(--bg-app)] text-[var(--fg-secondary)] border border-[var(--border-subtle)]"
                  }`}
                >
                  Solid
                </button>
                <button
                  onClick={() => handleUpdate({ strokeDasharray: "4, 4" })}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    selectedShape?.strokeDasharray
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "bg-[var(--bg-app)] text-[var(--fg-secondary)] border border-[var(--border-subtle)]"
                  }`}
                >
                  Dashed
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= LAYERS & GROUPS TAB ================= */}
        {activeTab === "layers" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
                Layers & Groups ({state.shapes.length})
              </span>
              {selectedShapes.length > 1 && (
                <button
                  onClick={isGroupSelected ? ungroupSelected : groupSelected}
                  className="text-[10px] text-amber-500 font-semibold hover:underline"
                >
                  {isGroupSelected ? "Ungroup" : "Group"}
                </button>
              )}
            </div>

            {/* Groups list */}
            {Array.from(groupMap.entries()).map(([gId, gShapes]) => (
              <div key={gId} className="p-2 rounded bg-[var(--bg-panel-subtle)] border border-amber-500/30 flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono text-[10px] font-bold text-amber-500">
                  <span className="flex items-center gap-1">
                    <Group className="w-3 h-3" />
                    <span>Group ({gShapes.length} shapes)</span>
                  </span>
                  <button
                    onClick={() => {
                      dispatch({ type: "SELECT_MULTIPLE", ids: gShapes.map((s) => s.id) });
                    }}
                    className="text-[9px] text-[var(--fg-secondary)] hover:text-white"
                  >
                    Select All
                  </button>
                </div>
                <div className="flex flex-col gap-1 pl-2 border-l border-amber-500/20">
                  {gShapes.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => selectShape(s.id)}
                      className={`flex items-center justify-between p-1 rounded text-[10px] cursor-pointer ${
                        state.selectedIds.includes(s.id)
                          ? "bg-amber-500/20 text-amber-400 font-semibold"
                          : "hover:bg-[var(--bg-app)] text-[var(--fg-secondary)]"
                      }`}
                    >
                      <span className="capitalize">{s.type}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: "TOGGLE_SHAPE_VISIBILITY", id: s.id });
                          }}
                        >
                          {s.isVisible !== false ? <Eye className="w-3 h-3 text-[var(--fg-muted)]" /> : <EyeOff className="w-3 h-3 text-red-400" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Ungrouped shapes */}
            {ungroupedShapes.map((s) => (
              <div
                key={s.id}
                onClick={() => selectShape(s.id)}
                className={`flex items-center justify-between p-1.5 rounded text-[10px] cursor-pointer border ${
                  state.selectedIds.includes(s.id)
                    ? "bg-amber-500/20 border-amber-500 text-amber-400 font-semibold"
                    : "bg-[var(--bg-app)] border-[var(--border-subtle)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
                }`}
              >
                <span className="capitalize">{s.type}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "TOGGLE_SHAPE_VISIBILITY", id: s.id });
                    }}
                  >
                    {s.isVisible !== false ? <Eye className="w-3 h-3 text-[var(--fg-muted)]" /> : <EyeOff className="w-3 h-3 text-red-400" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "TOGGLE_SHAPE_LOCK", id: s.id });
                    }}
                  >
                    {s.isLocked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3 text-[var(--fg-muted)]" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================= HISTORY TAB ================= */}
        {activeTab === "history" && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
              Recorded History Stack ({state.history.past.length} steps)
            </span>

            {state.history.past.length === 0 ? (
              <div className="p-3 text-center text-[10px] text-[var(--fg-muted)] font-mono">
                No past actions yet. Draw or edit shapes to populate history.
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
                {state.history.past.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    onClick={() => jumpToHistory(idx)}
                    className="p-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-between text-[10px] hover:border-amber-500 cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] text-[var(--fg-muted)]">#{idx + 1}</span>
                      <span className="font-medium text-[var(--fg-primary)] group-hover:text-amber-400">
                        {item.description}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-[var(--fg-muted)]">
                      {item.shapes.length} shapes
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Layering & Quick Action Footer */}
      {selectedShapes.length > 0 && (
        <div className="p-2 border-t border-[var(--border-subtle)] bg-[var(--bg-panel-subtle)] flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                if (state.selectedId) dispatch({ type: "BRING_TO_FRONT", id: state.selectedId });
              }}
              className="h-6 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-[var(--fg-primary)] flex items-center justify-center gap-1 text-[10px] font-semibold"
            >
              <ArrowUpToLine className="w-3 h-3" />
              <span>Bring Front</span>
            </button>
            <button
              onClick={() => {
                if (state.selectedId) dispatch({ type: "SEND_TO_BACK", id: state.selectedId });
              }}
              className="h-6 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-[var(--fg-primary)] flex items-center justify-center gap-1 text-[10px] font-semibold"
            >
              <ArrowDownToLine className="w-3 h-3" />
              <span>Send Back</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={duplicateSelected}
              className="h-6 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-amber-500 flex items-center justify-center gap-1 text-[10px] font-semibold"
            >
              <Copy className="w-3 h-3" />
              <span>Duplicate</span>
            </button>
            <button
              onClick={deleteSelected}
              className="h-6 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center gap-1 text-[10px] font-semibold"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Reusable Parametric CAD Template Modal */}
      <TemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
      />
    </aside>
  );
}
