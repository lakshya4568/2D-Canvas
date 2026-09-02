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
} from "lucide-react";
import { VariablesPanel } from "../parametric/VariablesPanel";
import { FormulaEditor } from "../parametric/FormulaEditor";
import { ConstraintsPanel } from "../parametric/ConstraintsPanel";
import { TemplateModal } from "../parametric/TemplateModal";
import { ParametricModel } from "@/lib/parametric/model";

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

export function PropertyInspector() {
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

  const [activeTab, setActiveTab] = useState<"transform" | "parametric" | "style" | "layers" | "history">("transform");
  const [paramSubTab, setParamSubTab] = useState<"variables" | "formulas" | "constraints">("variables");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleUpdate = (updates: Partial<Shape>) => {
    if (!state.selectedId) return;
    dispatch({
      type: "UPDATE_SHAPE",
      id: state.selectedId,
      updates,
    });
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
    <aside className="fixed right-0 top-14 bottom-7 w-[280px] bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] z-40 flex flex-col select-none text-xs font-sans">
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
          title="Layers & Groups"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="text-[10px]">Layers</span>
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
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>Parametric CAD Templates</span>
            </button>

            {/* Selected Shape Parameters Binding */}
            {selectedShape && (
              <div className="p-2.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-500 text-xs">
                    {ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape))}
                  </span>
                  <span className="text-[10px] text-[var(--fg-muted)] uppercase">{selectedShape.type}</span>
                </div>
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
                              const shapeName = ParametricModel.getShapeName(selectedShape, state.shapes.indexOf(selectedShape));
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
            {Array.from(groupMap.entries()).map(([gId, gShapes]) => (
              <div key={gId} className="p-2 rounded bg-[var(--bg-panel-subtle)] border border-blue-500/30 flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono text-[10px] font-bold text-blue-500">
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
                <div className="flex flex-col gap-1 pl-2 border-l border-blue-500/20">
                  {gShapes.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => selectShape(s.id)}
                      className={`flex items-center justify-between p-1 rounded text-[10px] cursor-pointer ${
                        state.selectedIds.includes(s.id)
                          ? "bg-blue-600/20 text-blue-400 font-semibold"
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
