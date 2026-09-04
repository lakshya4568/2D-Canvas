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
  RotateCcw,
  RotateCw,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  Link2,
  CheckCircle2,
  Edit3,
  Boxes,
  Folder,
  FolderTree,
  Square,
  Circle,
  Minus,
} from "lucide-react";
import { VariablesPanel } from "../parametric/VariablesPanel";
import { FormulaEditor } from "../parametric/FormulaEditor";
import { ConstraintsPanel } from "../parametric/ConstraintsPanel";
import { TemplateModal } from "../parametric/TemplateModal";
import { ParametricModel } from "@/lib/parametric/model";
import { detectClosedLoops } from "@/lib/parametric/closedGeometry";
import { computePolygonMoments } from "@/lib/geometry/metrics/polygonMoments";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";
import { isShapeInGADAssembly, detectGADAssemblies } from "@/lib/geometry/gadAssemblyEngine";

const PRESET_COLORS = [
  "#f8fafc", // White (Dark Mode default)
  "#0f172a", // Black (Light Mode default)
  "#0066ff", // Primary Blue
  "#22c55e", // Secondary Green
  "#ff9500", // Tertiary Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
];

export interface PropertyInspectorProps {
  width?: number;
  onWidthChange?: (width: number) => void;
  isCollapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

export function PropertyInspector({
  width: controlledWidth,
  onWidthChange,
  isCollapsed: controlledCollapsed,
  onCollapseChange,
}: PropertyInspectorProps = {}) {
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

  const [internalWidth, setInternalWidth] = useState(380);
  const width = controlledWidth ?? internalWidth;
  const setWidth = (w: number) => {
    setInternalWidth(w);
    onWidthChange?.(w);
  };

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const setIsCollapsed = (c: boolean) => {
    setInternalCollapsed(c);
    onCollapseChange?.(c);
  };

  const [activeTab, setActiveTab] = useState<
    "transform" | "autoformula" | "parametric" | "style" | "layers" | "history"
  >("autoformula");
  const [paramSubTab, setParamSubTab] = useState<"variables" | "formulas" | "constraints">("variables");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;

    const onPointerMove = (ev: PointerEvent) => {
      const deltaX = startX - ev.clientX; // dragging left increases width
      const nextW = Math.max(300, Math.min(850, Math.round(startW + deltaX)));
      setWidth(nextW);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
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

  const gadRole = React.useMemo(() => {
    if (!selectedShape) return { inAssembly: false };
    return isShapeInGADAssembly(state.shapes, selectedShape.id);
  }, [state.shapes, selectedShape]);

  const gadAssembly = gadRole.assembly;
  const currentFeature =
    gadAssembly && gadRole.featureIndex !== undefined
      ? gadAssembly.features[gadRole.featureIndex]
      : undefined;

  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [editFormulaExpr, setEditFormulaExpr] = useState<string>("");

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameInput, setGroupNameInput] = useState<string>("");

  const activeBoundaryEval = React.useMemo(() => {
    if (!selectedShape) return null;
    return state.boundaryEvaluations?.find((b) => b.shapeId === selectedShape.id) || null;
  }, [state.boundaryEvaluations, selectedShape]);

  const relevantFormulas = React.useMemo(() => {
    if (!selectedShape) return [];
    return state.inferredFormulas?.filter((f) => f.targetShapeId === selectedShape.id) || [];
  }, [state.inferredFormulas, selectedShape]);

  const handleLineLengthChange = (newL: number) => {
    if (!selectedShape || (selectedShape.type !== "line" && selectedShape.type !== "arrow")) return;
    const curLen = lineMetrics(
      { x: selectedShape.x1, y: selectedShape.y1 },
      { x: selectedShape.x2, y: selectedShape.y2 }
    ).length;
    if (curLen <= 0) return;

    if (gadRole.inAssembly && gadRole.role === "inner") {
      dispatch({
        type: "ADJUST_GAD_ASSEMBLY",
        target: {
          shapeId: selectedShape.id,
          assemblyId: gadAssembly?.id,
          featureIndex: gadRole.featureIndex ?? 0,
          deltaSpan: newL - curLen,
        },
      });
    } else {
      const angle = Math.atan2(selectedShape.y2 - selectedShape.y1, selectedShape.x2 - selectedShape.x1);
      handleUpdate({
        x2: selectedShape.x1 + Math.cos(angle) * newL,
        y2: selectedShape.y1 + Math.sin(angle) * newL,
      });
    }
  };

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed right-0 top-14 p-2 bg-[var(--bg-panel)] border-l border-b border-t border-[var(--border-subtle)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-all z-40 rounded-l-md"
        title="Open Inspector"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    );
  }

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

  return (
    <aside
      style={{ width: `${width}px` }}
      className="fixed right-0 top-14 bottom-7 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] z-40 flex flex-col select-none text-xs font-sans shadow-xl"
    >
      {/* Draggable Left Resize Handle */}
      <div
        onPointerDown={handleResizeStart}
        className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-blue-500/40 active:bg-blue-500/60 z-50 transition-colors group flex items-center justify-center"
        title="Drag left/right to resize inspector pane"
      >
        <div className="w-[2px] h-10 bg-[var(--border-subtle)] rounded group-hover:bg-blue-400 group-active:bg-blue-400 transition-colors" />
      </div>

      {/* 4 Tabs matching Stitch Specification */}
      <div className="flex border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-panel-subtle)]">
        <button
          onClick={() => setActiveTab("transform")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "transform"
              ? "bg-[var(--bg-panel)] text-blue-500 font-semibold border-b-2 border-blue-500"
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
              ? "bg-[var(--bg-panel)] text-blue-500 font-semibold border-b-2 border-blue-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="AutoFormula Synthesis & Chain Rule"
        >
          <div className="relative">
            <Link2 className="w-3.5 h-3.5" />
            {state.inferredFormulas && state.inferredFormulas.length > 0 && (
              <span className="absolute -top-1 -right-2 px-1 py-0.2 bg-blue-500 text-white rounded-full text-[7.5px] font-bold leading-none">
                {state.inferredFormulas.length}
              </span>
            )}
          </div>
          <span className="text-[10px]">AutoFormula</span>
        </button>

        <button
          onClick={() => setActiveTab("parametric")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "parametric"
              ? "bg-[var(--bg-panel)] text-blue-500 font-semibold border-b-2 border-blue-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="Parametric Variables & Constraints"
        >
          <span className="font-mono text-xs font-bold leading-none">ƒ(x)</span>
          <span className="text-[10px]">Params</span>
        </button>

        <button
          onClick={() => setActiveTab("style")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "style"
              ? "bg-[var(--bg-panel)] text-blue-500 font-semibold border-b-2 border-blue-500"
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
              ? "bg-[var(--bg-panel)] text-blue-500 font-semibold border-b-2 border-blue-500"
              : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]"
          }`}
          title="Hierarchy & Groups"
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span className="text-[10px]">Hierarchy</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
            activeTab === "history"
              ? "bg-[var(--bg-panel)] text-blue-500 font-semibold border-b-2 border-blue-500"
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
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--border-subtle)] transition-colors"
          title="Collapse Panel"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
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
                      className="flex-1 h-6 px-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y1</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y1)}
                        onChange={(e) => handleUpdate({ y1: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">X2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.x2)}
                        onChange={(e) => handleUpdate({ x2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y2)}
                        onChange={(e) => handleUpdate({ y2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2 p-2 rounded bg-[var(--bg-panel-subtle)] flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-[10px] text-[var(--fg-muted)] w-10">Length</span>
                        <input
                          type="number"
                          value={Math.round(lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).length)}
                          onChange={(e) => handleLineLengthChange(Number(e.target.value))}
                          className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                        />
                        <span className="text-[10px] text-[var(--fg-muted)]">px</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-[var(--fg-secondary)]">
                        <span>Angle: {lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).angleDeg.toFixed(1)}°</span>
                      </div>
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y)}
                        onChange={(e) => handleUpdate({ y: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">W</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.width)}
                        onChange={(e) => handleUpdate({ width: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">H</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.height)}
                        onChange={(e) => handleUpdate({ height: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">R</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.r)}
                        onChange={(e) => handleUpdate({ r: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y1</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y1)}
                        onChange={(e) => handleUpdate({ y1: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">X2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.x2)}
                        onChange={(e) => handleUpdate({ x2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Y2</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.y2)}
                        onChange={(e) => handleUpdate({ y2: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Rx</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.rx)}
                        onChange={(e) => handleUpdate({ rx: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Ry</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.ry)}
                        onChange={(e) => handleUpdate({ ry: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">R</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.r)}
                        onChange={(e) => handleUpdate({ r: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
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
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">CY</span>
                      <input
                        type="number"
                        value={Math.round(selectedShape.cy)}
                        onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Inner</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.innerR)}
                        onChange={(e) => handleUpdate({ innerR: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--fg-muted)] w-4">Outer</span>
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.outerR)}
                        onChange={(e) => handleUpdate({ outerR: Math.max(1, Number(e.target.value)) })}
                        className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* GAD Assembly Intelligence Card */}
                {gadAssembly && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-blue-500/30 flex flex-col gap-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        GAD Assembly Intelligence
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">
                        {gadRole.role === "inner"
                          ? gadRole.depth && gadRole.depth > 1
                            ? `Embedded (Level ${gadRole.depth})`
                            : "Internal Opening"
                          : "Boundary Frame"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[8px] text-[var(--fg-muted)] uppercase">Clearance (L / R)</span>
                        <span className="text-[10px] font-bold text-[var(--fg-primary)]">
                          {(gadRole.clearancesToParent?.left ?? gadAssembly.clearances.left)}px / {(gadRole.clearancesToParent?.right ?? gadAssembly.clearances.right)}px
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[8px] text-[var(--fg-muted)] uppercase">Clearance (Top / Bot)</span>
                        <span className="text-[10px] font-bold text-[var(--fg-primary)]">
                          {(gadRole.clearancesToParent?.top ?? gadAssembly.clearances.top)}px / {(gadRole.clearancesToParent?.bottom ?? gadAssembly.clearances.bottom)}px
                        </span>
                      </div>
                      {gadAssembly.clearances.radial !== undefined && (
                        <div className="col-span-2 p-1.5 rounded bg-[var(--bg-app)] flex justify-between items-center">
                          <span className="text-[8px] text-[var(--fg-muted)] uppercase">Radial Clearance</span>
                          <span className="text-[10px] font-bold text-blue-400">{gadAssembly.clearances.radial} px</span>
                        </div>
                      )}
                      {gadAssembly.clearances.mid !== undefined && (
                        <div className="col-span-2 p-1.5 rounded bg-[var(--bg-app)] flex justify-between items-center">
                          <span className="text-[8px] text-[var(--fg-muted)] uppercase">Intermediate Partition</span>
                          <span className="text-[10px] font-bold text-amber-400">{gadAssembly.clearances.mid} px</span>
                        </div>
                      )}
                    </div>

                    {selectedShape.type === "circle" ? (
                      <div className="flex flex-col gap-1 pt-1.5 border-t border-[var(--border-subtle)]">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase font-semibold">
                          Auto-Calculate Radius (No Formula):
                        </span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-[10px] text-blue-400 font-bold w-10">Radius</span>
                          <input
                            type="number"
                            value={Math.round(selectedShape.r)}
                            onChange={(e) => {
                              const newR = Number(e.target.value);
                              if (newR > 0) {
                                dispatch({
                                  type: "ADJUST_GAD_ASSEMBLY",
                                  target: {
                                    shapeId: selectedShape.id,
                                    assemblyId: gadAssembly.id,
                                    featureIndex: gadRole.featureIndex ?? 0,
                                    newRadius: newR,
                                  },
                                });
                              }
                            }}
                            className="w-full h-6 bg-[var(--bg-app)] border border-blue-500/40 rounded px-1.5 text-[11px] text-[var(--fg-primary)] font-bold focus:border-blue-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-[var(--fg-muted)]">px</span>
                        </div>
                      </div>
                    ) : currentFeature ? (
                      <div className="flex flex-col gap-1 pt-1.5 border-t border-[var(--border-subtle)]">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase font-semibold">
                          Auto-Calculate Span (No Formula):
                        </span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-[10px] text-blue-400 font-bold w-10">Span</span>
                          <input
                            type="number"
                            value={Math.round(currentFeature.span)}
                            onChange={(e) => {
                              const newSpan = Number(e.target.value);
                              if (newSpan > 0 && selectedShape) {
                                dispatch({
                                  type: "ADJUST_GAD_ASSEMBLY",
                                  target: {
                                    shapeId: selectedShape.id,
                                    assemblyId: gadAssembly.id,
                                    featureIndex: gadRole.featureIndex ?? 0,
                                    newSpan,
                                  },
                                });
                              }
                            }}
                            className="w-full h-6 bg-[var(--bg-app)] border border-blue-500/40 rounded px-1.5 text-[11px] text-[var(--fg-primary)] font-bold focus:border-blue-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-[var(--fg-muted)]">px</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Boundary & Span Limits Card */}
                {activeBoundaryEval && (
                  <div
                    className={`mt-2 p-2.5 rounded-lg border flex flex-col gap-2 shadow-xs transition-colors ${
                      activeBoundaryEval.state === "Exceeded"
                        ? "bg-rose-500/10 border-rose-500/40 text-rose-300"
                        : activeBoundaryEval.state === "Approaching Limit"
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                        : "bg-[var(--bg-panel-subtle)] border-blue-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Boundary & Span Limits
                      </span>
                      <span
                        className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
                          activeBoundaryEval.state === "Exceeded"
                            ? "bg-rose-500/25 text-rose-300 border-rose-500/50 animate-pulse"
                            : activeBoundaryEval.state === "Approaching Limit"
                            ? "bg-amber-500/25 text-amber-300 border-amber-500/50"
                            : activeBoundaryEval.state === "At Limit"
                            ? "bg-blue-500/25 text-blue-300 border-blue-500/50"
                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        }`}
                      >
                        {activeBoundaryEval.state}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[8px] text-[var(--fg-muted)] uppercase">Max Span</span>
                        <span className="text-[10px] font-bold text-[var(--fg-primary)]">
                          {activeBoundaryEval.maximumSpan}px
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[8px] text-[var(--fg-muted)] uppercase">Current</span>
                        <span className="text-[10px] font-bold text-[var(--fg-primary)]">
                          {activeBoundaryEval.currentSpan}px
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[8px] text-[var(--fg-muted)] uppercase">Remaining</span>
                        <span
                          className={`text-[10px] font-bold ${
                            activeBoundaryEval.remainingUnits < 0
                              ? "text-rose-400 font-extrabold"
                              : activeBoundaryEval.remainingUnits < 40
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {activeBoundaryEval.remainingUnits}px
                        </span>
                      </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[9px]">
                      <span className="text-[var(--fg-muted)] uppercase font-semibold">Limit Mode:</span>
                      <div className="flex items-center gap-1">
                        {(["warning", "constraint", "adaptive"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => dispatch({ type: "SET_BOUNDARY_MODE", mode: m })}
                            className={`px-1.5 py-0.5 rounded uppercase font-bold transition-colors cursor-pointer ${
                              state.boundaryMode === m
                                ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                                : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Alert Message Banner */}
                    {activeBoundaryEval.state === "Exceeded" && (
                      <div className="p-1.5 rounded bg-rose-500/20 border border-rose-500/40 text-[10px] font-medium text-rose-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                        <span>{activeBoundaryEval.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* AutoFormula Quick Slab Banner */}
                {relevantFormulas && relevantFormulas.length > 0 && (
                  <div
                    onClick={() => setActiveTab("autoformula")}
                    className="mt-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 flex items-center justify-between cursor-pointer transition-all shadow-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-blue-400" />
                      <div>
                        <div className="text-[11px] font-bold text-blue-300">
                          {relevantFormulas.length} AutoFormula{relevantFormulas.length > 1 ? "s" : ""} Inferred
                        </div>
                        <div className="text-[9px] text-[var(--fg-muted)]">
                          Atomic chain-rule equations ready
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-blue-400 hover:underline flex items-center gap-0.5">
                      Open Slab →
                    </span>
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
                      className="w-full h-6 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 text-[11px] text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-[var(--fg-muted)]">deg</span>
                  </div>
                </div>

                {/* Closed Shape & Mathematical Analysis Card */}
                {activeLoop && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-panel-subtle)] border border-blue-500/25 flex flex-col gap-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        Closed Shape Analysis
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">
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
                        <span className="text-[10px] font-semibold text-sky-400">
                          {moments?.IxxCentroid ? moments.IxxCentroid.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/A"}
                        </span>
                      </div>
                      <div className="p-1.5 rounded bg-[var(--bg-app)] flex flex-col">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Inertia Iyy</span>
                        <span className="text-[10px] font-semibold text-sky-400">
                          {moments?.IyyCentroid ? moments.IyyCentroid.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "N/A"}
                        </span>
                      </div>
                      <div className="col-span-2 p-1.5 rounded bg-[var(--bg-app)] flex justify-between items-center">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">Centroid (Cx, Cy)</span>
                        <span className="text-[10px] font-semibold text-blue-400">
                          ({activeLoop.analysis.centroid.x}, {activeLoop.analysis.centroid.y})
                        </span>
                      </div>
                      <div className="col-span-2 p-1.5 rounded bg-[var(--bg-app)] flex justify-between items-center">
                        <span className="text-[9px] text-[var(--fg-muted)] uppercase">System Mobility (DOF)</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          systemDof === 0
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-blue-500/20 text-blue-300"
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

        {/* ================= AUTOFORMULA TAB ================= */}
        {activeTab === "autoformula" && (
          <div className="flex flex-col gap-3">
            {/* Header Slab */}
            <div className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] border border-blue-500/30 flex flex-col gap-1.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  AutoFormula Synthesis
                </span>
                <span className="text-[8.5px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                  Chain-Rule Ready
                </span>
              </div>
              <p className="text-[10px] text-[var(--fg-secondary)] leading-relaxed">
                Atomic formulas inferred from geometric insets, clearances, and alignments. Store formulas as variables to compose higher-order parametric equations.
              </p>
            </div>

            {/* List of Inferred Formulas */}
            {state.inferredFormulas && state.inferredFormulas.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {state.inferredFormulas.map((f) => {
                  const isAccepted = f.status === "accepted";
                  return (
                    <div
                      key={f.id}
                      className={`p-3 rounded-lg border flex flex-col gap-2 transition-all ${
                        isAccepted
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : "bg-[var(--bg-app)] border-blue-500/20 hover:border-blue-500/40"
                      }`}
                    >
                      {/* Target & Confidence */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[11px] text-[var(--fg-primary)]">
                            {f.displayTarget}
                          </span>
                          {isAccepted && (
                            <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Stored
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-semibold">
                          {Math.round(f.confidence * 100)}% Confidence
                        </span>
                      </div>

                      {/* Monospace Formula Display / Inline Editor */}
                      {editingFormulaId === f.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editFormulaExpr}
                            onChange={(e) => setEditFormulaExpr(e.target.value)}
                            className="w-full h-7 bg-[var(--bg-panel-subtle)] border border-blue-500 rounded px-2 text-[11px] font-mono text-sky-200 font-bold focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              dispatch({
                                type: "UPDATE_INFERRED_FORMULA",
                                id: f.id,
                                expression: editFormulaExpr,
                              });
                              setEditingFormulaId(null);
                            }}
                            className="p-1.5 rounded bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 cursor-pointer"
                            title="Save equation"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="font-mono text-xs text-sky-300 font-bold bg-slate-900/70 p-2.5 rounded-md border border-sky-500/25 flex items-start justify-between gap-2 shadow-inner">
                          <span className="break-words whitespace-pre-wrap leading-relaxed select-text flex-1">
                            {f.targetProperty} = {f.expression}
                          </span>
                          <button
                            onClick={() => {
                              setEditingFormulaId(f.id);
                              setEditFormulaExpr(f.expression);
                            }}
                            className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-1 rounded hover:bg-white/5 cursor-pointer shrink-0"
                            title="Edit formula equation"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Live Evaluation Breakdown */}
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px]">
                        {f.variables.map((v) => {
                          const valDisplay = typeof v.value === "number"
                            ? (Number.isInteger(v.value) ? v.value : Number(v.value.toFixed(1)))
                            : v.value;
                          return (
                            <span
                              key={v.name}
                              className="px-1.5 py-0.5 rounded bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)]"
                            >
                              <span className="text-blue-400 font-semibold">{v.name}</span>: {valDisplay}
                            </span>
                          );
                        })}
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                          = {typeof f.evaluatedValue === "number"
                            ? (Number.isInteger(f.evaluatedValue) ? f.evaluatedValue : Number(f.evaluatedValue.toFixed(1)))
                            : f.evaluatedValue} mm
                        </span>
                      </div>

                      {/* Inference Reason */}
                      <span className="text-[9px] text-[var(--fg-muted)] italic leading-tight">
                        {f.reason}
                      </span>

                      {/* Action Slab Buttons */}
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]/60">
                        <span className="text-[8px] text-[var(--fg-muted)] uppercase tracking-wider font-semibold">
                          Atomic Chain Rule
                        </span>
                        <div className="flex items-center gap-1.5">
                          {!isAccepted ? (
                            <button
                              onClick={() => dispatch({ type: "ACCEPT_INFERRED_FORMULA", id: f.id })}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                            >
                              <Check className="w-3 h-3" />
                              <span>Store in Variable</span>
                            </button>
                          ) : (
                            <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Active in DAG
                            </span>
                          )}
                          <button
                            onClick={() => dispatch({ type: "REJECT_INFERRED_FORMULA", id: f.id })}
                            className="px-2 py-1 rounded text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 text-[9px] cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] flex flex-col items-center justify-center text-center gap-2 py-8">
                <Sparkles className="w-7 h-7 text-blue-400/60" />
                <span className="font-bold text-[11px] text-[var(--fg-primary)]">
                  AutoFormula Engine Ready
                </span>
                <p className="text-[10px] text-[var(--fg-muted)] max-w-[200px] leading-relaxed">
                  Draw an inner rectangle, circle, or partition on the canvas. The engine will instantly detect insets, clearances, and centers to generate atomic formulas here.
                </p>
              </div>
            )}

            {/* Chained Variables Pool */}
            <div className="p-3 rounded-lg bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] flex flex-col gap-2">
              <span className="text-[10px] font-bold text-[var(--fg-secondary)] uppercase tracking-wider">
                Chained Variables Pool
              </span>
              <p className="text-[9px] text-[var(--fg-muted)] leading-normal">
                Accepted atomic formulas are stored in the parameter symbol table. You can chain them into composite equations (e.g. in the Quick Formula Bar below):
              </p>
              <div className="flex flex-col gap-1 font-mono text-[9.5px]">
                {Object.entries(state.variables).slice(0, 6).map(([k, v]) => (
                  <div
                    key={k}
                    className="p-1 px-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-between"
                  >
                    <span className="text-blue-300 font-bold truncate">{k}</span>
                    <span className="text-[var(--fg-muted)]">
                      {v.formula ? (
                        <span className="text-sky-300">{v.formula}</span>
                      ) : (
                        <span>{v.value} mm</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= PARAMETRIC TAB ================= */}
        {activeTab === "parametric" && (
          <div className="flex flex-col gap-3">
            {/* Template Library Trigger */}
            <button
              onClick={() => setIsTemplateModalOpen(true)}
              className="w-full h-8 rounded bg-[var(--bg-app)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--fg-primary)] flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer transition-all shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>Parametric CAD Templates</span>
            </button>

            {/* Selected Shape Parameters Binding */}
            {selectedShape && (
              <div className="p-2.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-500 text-xs">
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
                    className="flex-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[11px] font-mono text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
                    title="Set variable identifier for this shape (e.g. top_outer_rect)"
                  />
                </div>

                {/* Dedicated Line Length & Formula Control */}
                {(selectedShape.type === "line" || selectedShape.type === "arrow") && (
                  <div className="rounded border border-blue-500/20 bg-blue-500/5 p-2 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[10px] text-blue-400">Line Length & Formula</span>
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
                        className="flex-1 bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[11px] font-mono text-[var(--fg-primary)] focus:border-blue-500 focus:outline-none"
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
                        className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-500"
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
                  {ParametricModel.getShapeParameters(selectedShape).map((p) => (
                    <div key={p.key} className="flex items-center justify-between text-[11px] py-0.5 border-b border-[var(--border-subtle)]/40 last:border-0">
                      <span className="text-[var(--fg-muted)]">{p.label}:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[var(--fg-primary)]">{p.value}</span>
                        {!p.readOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              const shapeName = selectedShape.name || ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape));
                              const varName = `${shapeName}_${p.key}`;
                              dispatch({
                                type: "SET_VARIABLE",
                                name: varName,
                                valueOrFormula: p.value,
                              });
                            }}
                            className="rounded px-1 text-[9px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                            title="Bind parameter to new variable"
                          >
                            +Var
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
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
                      ? "bg-[var(--bg-panel)] text-blue-500 shadow-xs"
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
                      currentStroke.toLowerCase() === c.toLowerCase() ? "ring-2 ring-blue-500 scale-110" : ""
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
                        ? "bg-blue-600 text-white"
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
                      ? "bg-blue-600 text-white"
                      : "bg-[var(--bg-app)] text-[var(--fg-secondary)] border border-[var(--border-subtle)]"
                  }`}
                >
                  Solid
                </button>
                <button
                  onClick={() => handleUpdate({ strokeDasharray: "4, 4" })}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    selectedShape?.strokeDasharray
                      ? "bg-blue-600 text-white"
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
                  className="text-[10px] text-blue-500 font-semibold hover:underline"
                >
                  {isGroupSelected ? "Ungroup" : "Group"}
                </button>
              )}
            </div>

            {/* Groups list */}
            {Array.from(groupMap.entries()).map(([gId, gShapes]) => {
              const bounds = computeMultiShapeBounds(gShapes);
              const groupName = gShapes[0]?.groupName || `Group (${gShapes.length} items)`;
              const isGroupAllSelected = gShapes.every((s) => state.selectedIds.includes(s.id));
              const isGroupAnyLocked = gShapes.some((s) => s.isLocked);
              const isGroupAllVisible = gShapes.every((s) => s.isVisible !== false);

              return (
                <div
                  key={gId}
                  className={`p-2.5 rounded-lg border flex flex-col gap-2 transition-all ${
                    isGroupAllSelected
                      ? "bg-blue-500/10 border-blue-500/50 shadow-xs"
                      : "bg-[var(--bg-panel-subtle)] border-[var(--border-subtle)]"
                  }`}
                >
                  {/* Group Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <Boxes className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      {editingGroupId === gId ? (
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="text"
                            value={groupNameInput}
                            onChange={(e) => setGroupNameInput(e.target.value)}
                            className="w-full h-5 px-1 bg-[var(--bg-app)] border border-blue-500 rounded text-[10px] text-[var(--fg-primary)] font-bold font-mono"
                          />
                          <button
                            onClick={() => {
                              if (groupNameInput.trim()) {
                                dispatch({
                                  type: "RENAME_GROUP",
                                  groupId: gId,
                                  newName: groupNameInput.trim(),
                                });
                              }
                              setEditingGroupId(null);
                            }}
                            className="p-0.5 rounded text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            onClick={() => {
                              dispatch({ type: "SELECT_GROUP", groupId: gId });
                            }}
                            className="text-[11px] font-bold text-blue-300 truncate cursor-pointer hover:underline"
                            title="Click to select entire group"
                          >
                            {groupName}
                          </span>
                          <button
                            onClick={() => {
                              setEditingGroupId(gId);
                              setGroupNameInput(groupName);
                            }}
                            className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] p-0.5 cursor-pointer"
                            title="Rename group"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => dispatch({ type: "TOGGLE_GROUP_LOCK", groupId: gId })}
                        className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer"
                        title={isGroupAnyLocked ? "Unlock Group" : "Lock Group"}
                      >
                        {isGroupAnyLocked ? (
                          <Lock className="w-3 h-3 text-amber-400" />
                        ) : (
                          <Unlock className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        onClick={() => dispatch({ type: "TOGGLE_GROUP_VISIBILITY", groupId: gId })}
                        className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] cursor-pointer"
                        title={isGroupAllVisible ? "Hide Group" : "Show Group"}
                      >
                        {isGroupAllVisible ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-rose-400" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          dispatch({ type: "SELECT_GROUP", groupId: gId });
                          dispatch({ type: "UNGROUP_SELECTED" });
                        }}
                        className="text-[9px] px-1 py-0.5 rounded text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        title="Ungroup assembly"
                      >
                        Ungroup
                      </button>
                    </div>
                  </div>

                  {/* Structural Rigidity & Assembly Span Card */}
                  {bounds && (
                    <div className="grid grid-cols-2 gap-1 font-mono text-[9px] bg-[var(--bg-app)] p-1.5 rounded border border-[var(--border-subtle)]/50">
                      <div className="flex flex-col">
                        <span className="text-[7.5px] text-[var(--fg-muted)] uppercase">Group Origin</span>
                        <span className="font-bold text-[var(--fg-primary)]">
                          ({Math.round(bounds.minX)}, {Math.round(bounds.minY)})
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[7.5px] text-[var(--fg-muted)] uppercase">Total Span</span>
                        <span className="font-bold text-blue-400">
                          {Math.round(bounds.width)} × {Math.round(bounds.height)} px
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Child Elements in this Group */}
                  <div className="flex flex-col gap-1 pl-2 border-l-2 border-blue-500/30">
                    {gShapes.map((s) => {
                      const isChildSelected = state.selectedIds.includes(s.id);
                      const hasFormula = state.inferredFormulas?.some(
                        (f) => f.targetShapeId === s.id && f.status === "accepted"
                      );
                      const boundaryEval = state.boundaryEvaluations?.find((b) => b.shapeId === s.id);

                      return (
                        <div
                          key={s.id}
                          onClick={() => selectShape(s.id)}
                          className={`flex items-center justify-between p-1.5 rounded text-[10px] cursor-pointer transition-colors ${
                            isChildSelected
                              ? "bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30"
                              : "hover:bg-[var(--bg-app)] text-[var(--fg-secondary)]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {s.type === "rectangle" ? (
                              <Square className="w-3 h-3 text-sky-400 shrink-0" />
                            ) : s.type === "circle" ? (
                              <Circle className="w-3 h-3 text-emerald-400 shrink-0" />
                            ) : (
                              <Minus className="w-3 h-3 text-amber-400 shrink-0" />
                            )}
                            <span className="truncate font-mono">
                              {s.name || `${s.type.toUpperCase()}_${s.id.slice(-4)}`}
                            </span>
                            {hasFormula && (
                              <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 font-bold">
                                🔗 fx
                              </span>
                            )}
                            {boundaryEval && (
                              <span
                                className={`text-[7.5px] font-mono px-1 py-0.2 rounded font-bold uppercase ${
                                  boundaryEval.state === "Exceeded"
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-emerald-500/20 text-emerald-300"
                                }`}
                              >
                                {boundaryEval.state === "Exceeded" ? "⚠ Exceeded" : "Safe"}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[9px] font-mono text-[var(--fg-muted)]">
                              {s.type === "rectangle"
                                ? `${Math.round(s.width)}×${Math.round(s.height)}`
                                : s.type === "circle"
                                ? `R${Math.round(s.r)}`
                                : s.type === "line" || s.type === "arrow"
                                ? `L${Math.round(Math.hypot((s as any).x2 - (s as any).x1, (s as any).y2 - (s as any).y1))}`
                                : ""}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: "TOGGLE_SHAPE_VISIBILITY", id: s.id });
                              }}
                              className="p-0.5 rounded text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                            >
                              {s.isVisible !== false ? (
                                <Eye className="w-2.5 h-2.5" />
                              ) : (
                                <EyeOff className="w-2.5 h-2.5 text-rose-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Ungrouped shapes */}
            {ungroupedShapes.map((s) => (
              <div
                key={s.id}
                onClick={() => selectShape(s.id)}
                className={`flex items-center justify-between p-1.5 rounded text-[10px] cursor-pointer border ${
                  state.selectedIds.includes(s.id)
                    ? "bg-blue-600/20 border-blue-500 text-blue-400 font-semibold"
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
                    className="p-1.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-between text-[10px] hover:border-blue-500 cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[9px] text-[var(--fg-muted)]">#{idx + 1}</span>
                      <span className="font-medium text-[var(--fg-primary)] group-hover:text-blue-400">
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
              className="h-6 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] text-blue-500 flex items-center justify-center gap-1 text-[10px] font-semibold"
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
