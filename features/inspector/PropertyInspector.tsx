"use client";

import React, { useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape } from "@/lib/geometry/types";
import { lineMetrics, rectMetrics, circleMetrics } from "@/lib/geometry/metrics";
import {
  Sliders,
  Layers,
  ArrowUpToLine,
  ArrowDownToLine,
  Copy,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Eye,
  Info,
} from "lucide-react";

const PRESET_COLORS = [
  "#3b82f6", // Blue
  "#22c55e", // Green
  "#ef4444", // Red
  "#f59e0b", // Amber
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f8fafc", // White/Light
  "#0f172a", // Dark
];

export function PropertyInspector() {
  const {
    state,
    dispatch,
    selectedShape,
    deleteSelected,
  } = useDrawing();

  const [isCollapsed, setIsCollapsed] = useState(false);

  // Update selected shape
  const handleUpdate = (updates: Partial<Shape>) => {
    if (!state.selectedId) return;
    dispatch({
      type: "UPDATE_SHAPE",
      id: state.selectedId,
      updates,
    });
  };

  // Duplicate selected shape
  const handleDuplicate = () => {
    if (!selectedShape) return;
    const newId = "shape_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    let duplicated: Shape;
    switch (selectedShape.type) {
      case "line":
        duplicated = {
          ...selectedShape,
          id: newId,
          x1: selectedShape.x1 + 20,
          y1: selectedShape.y1 + 20,
          x2: selectedShape.x2 + 20,
          y2: selectedShape.y2 + 20,
        };
        break;
      case "rectangle":
        duplicated = {
          ...selectedShape,
          id: newId,
          x: selectedShape.x + 20,
          y: selectedShape.y + 20,
        };
        break;
      case "circle":
        duplicated = {
          ...selectedShape,
          id: newId,
          cx: selectedShape.cx + 20,
          cy: selectedShape.cy + 20,
        };
        break;
    }
    dispatch({ type: "START_DRAFT", shape: duplicated });
    dispatch({ type: "COMMIT_DRAFT" });
  };

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed right-4 top-20 p-2.5 rounded-2xl glass-panel shadow-xl text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-all z-40 active:scale-95"
        title="Open Inspector"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    );
  }

  // Count shape types on canvas
  const lineCount = state.shapes.filter((s) => s.type === "line").length;
  const rectCount = state.shapes.filter((s) => s.type === "rectangle").length;
  const circCount = state.shapes.filter((s) => s.type === "circle").length;

  return (
    <aside className="fixed right-4 top-20 w-72 max-h-[calc(100vh-120px)] overflow-y-auto rounded-3xl glass-panel shadow-2xl p-4 z-40 flex flex-col gap-4 text-xs select-none border border-[var(--border-subtle)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-500" />
          <span className="font-bold text-sm tracking-tight text-[var(--fg-primary)]">
            {selectedShape ? "Inspector" : "Canvas Properties"}
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors"
          title="Collapse Panel"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {selectedShape ? (
        <>
          {/* Shape Type Badge */}
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)]">
            <span className="text-[var(--fg-muted)] font-medium">Selected Type</span>
            <span className="font-mono font-bold capitalize text-blue-500">
              {selectedShape.type}
            </span>
          </div>

          {/* Geometry Inputs */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
              Geometry & Position
            </span>

            {selectedShape.type === "line" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">X1</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.x1)}
                    onChange={(e) => handleUpdate({ x1: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Y1</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.y1)}
                    onChange={(e) => handleUpdate({ y1: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">X2</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.x2)}
                    onChange={(e) => handleUpdate({ x2: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Y2</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.y2)}
                    onChange={(e) => handleUpdate({ y2: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Computed line metrics */}
                <div className="col-span-2 p-2 rounded-xl bg-[var(--bg-panel-subtle)] flex justify-between font-mono text-[11px] text-[var(--fg-secondary)]">
                  <span>Length: {lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).length.toFixed(1)} px</span>
                  <span>Angle: {lineMetrics({ x: selectedShape.x1, y: selectedShape.y1 }, { x: selectedShape.x2, y: selectedShape.y2 }).angleDeg.toFixed(1)}°</span>
                </div>
              </div>
            )}

            {selectedShape.type === "rectangle" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">X</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.x)}
                    onChange={(e) => handleUpdate({ x: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Y</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.y)}
                    onChange={(e) => handleUpdate({ y: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Width</label>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(selectedShape.width)}
                    onChange={(e) => handleUpdate({ width: Math.max(1, Number(e.target.value)) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Height</label>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(selectedShape.height)}
                    onChange={(e) => handleUpdate({ height: Math.max(1, Number(e.target.value)) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="col-span-2 p-2 rounded-xl bg-[var(--bg-panel-subtle)] flex justify-between font-mono text-[11px] text-[var(--fg-secondary)]">
                  <span>Area: {rectMetrics(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height).area.toFixed(0)} px²</span>
                  <span>Perimeter: {rectMetrics(selectedShape.x, selectedShape.y, selectedShape.width, selectedShape.height).perimeter.toFixed(0)} px</span>
                </div>
              </div>
            )}

            {selectedShape.type === "circle" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Center X</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.cx)}
                    onChange={(e) => handleUpdate({ cx: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Center Y</label>
                  <input
                    type="number"
                    value={Math.round(selectedShape.cy)}
                    onChange={(e) => handleUpdate({ cy: Number(e.target.value) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-[10px] text-[var(--fg-muted)] font-mono">Radius (R)</label>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(selectedShape.r)}
                    onChange={(e) => handleUpdate({ r: Math.max(1, Number(e.target.value)) })}
                    className="px-2 py-1.5 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] font-mono text-center focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="col-span-2 p-2 rounded-xl bg-[var(--bg-panel-subtle)] flex justify-between font-mono text-[11px] text-[var(--fg-secondary)]">
                  <span>Diameter: {circleMetrics(selectedShape.cx, selectedShape.cy, selectedShape.r).diameter.toFixed(1)} px</span>
                  <span>Area: {circleMetrics(selectedShape.cx, selectedShape.cy, selectedShape.r).area.toFixed(0)} px²</span>
                </div>
              </div>
            )}
          </div>

          {/* Stroke & Fill Styling */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
              Stroke & Appearance
            </span>

            {/* Stroke Color presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => handleUpdate({ strokeColor: c })}
                  className={`w-5 h-5 rounded-full border border-black/20 shadow-sm transition-transform active:scale-90 ${
                    (selectedShape.strokeColor || "#3b82f6") === c ? "ring-2 ring-blue-500 scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                  title={`Set stroke color ${c}`}
                />
              ))}
            </div>

            {/* Stroke width */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-[var(--fg-muted)]">Stroke Width</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 5, 8].map((w) => (
                  <button
                    key={w}
                    onClick={() => handleUpdate({ strokeWidth: w })}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-colors ${
                      (selectedShape.strokeWidth || 2) === w
                        ? "bg-blue-600 text-white"
                        : "bg-[var(--bg-panel-subtle)] text-[var(--fg-secondary)] hover:bg-[var(--border-subtle)]"
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            {/* Stroke Dash Style */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-[var(--fg-muted)]">Stroke Style</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleUpdate({ strokeDasharray: undefined })}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                    !selectedShape.strokeDasharray
                      ? "bg-blue-600 text-white"
                      : "bg-[var(--bg-panel-subtle)] text-[var(--fg-secondary)]"
                  }`}
                >
                  Solid
                </button>
                <button
                  onClick={() => handleUpdate({ strokeDasharray: "6, 4" })}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                    selectedShape.strokeDasharray
                      ? "bg-blue-600 text-white"
                      : "bg-[var(--bg-panel-subtle)] text-[var(--fg-secondary)]"
                  }`}
                >
                  Dashed
                </button>
              </div>
            </div>
          </div>

          {/* Layering & Quick Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-[11px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
              Layering & Actions
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => dispatch({ type: "BRING_TO_FRONT", id: selectedShape.id })}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-[var(--bg-panel-subtle)] hover:bg-[var(--border-subtle)] text-[var(--fg-primary)] transition-all font-medium"
              >
                <ArrowUpToLine className="w-3.5 h-3.5" />
                <span>Bring Front</span>
              </button>
              <button
                onClick={() => dispatch({ type: "SEND_TO_BACK", id: selectedShape.id })}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-[var(--bg-panel-subtle)] hover:bg-[var(--border-subtle)] text-[var(--fg-primary)] transition-all font-medium"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>Send Back</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={handleDuplicate}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-[var(--bg-panel-subtle)] hover:bg-[var(--border-subtle)] text-[var(--fg-primary)] transition-all font-medium"
              >
                <Copy className="w-3.5 h-3.5 text-blue-500" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={deleteSelected}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-all font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Empty selection summary */
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)]">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-[11px] text-[var(--fg-secondary)] leading-relaxed">
              Click any shape on the canvas with the <b className="text-[var(--fg-primary)]">Select tool (V)</b> to inspect, edit dimensions, change colors, or transform.
            </span>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            <span className="text-[11px] font-semibold text-[var(--fg-secondary)] uppercase tracking-wider">
              Canvas Overview
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] flex flex-col">
                <span className="text-base font-bold font-mono text-[var(--fg-primary)]">{lineCount}</span>
                <span className="text-[10px] text-[var(--fg-muted)]">Lines</span>
              </div>
              <div className="p-2 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] flex flex-col">
                <span className="text-base font-bold font-mono text-[var(--fg-primary)]">{rectCount}</span>
                <span className="text-[10px] text-[var(--fg-muted)]">Rects</span>
              </div>
              <div className="p-2 rounded-xl bg-[var(--bg-panel-subtle)] border border-[var(--border-subtle)] flex flex-col">
                <span className="text-base font-bold font-mono text-[var(--fg-primary)]">{circCount}</span>
                <span className="text-[10px] text-[var(--fg-muted)]">Circles</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
