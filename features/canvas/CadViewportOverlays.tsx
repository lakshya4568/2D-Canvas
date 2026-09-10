"use client";

import React from "react";
import { Maximize, Plus, X } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";

export function CadViewportOverlays() {
  const { state, dispatch } = useDrawing();

  const handleZoomExtents = () => {
    dispatch({ type: "RESET_VIEWPORT" });
  };

  return (
    <>
      {/* 1. AutoCAD Drawing Document Tab Bar (Top of Viewport) */}
      <div className="absolute top-0 left-0 right-0 h-[26px] bg-(--ink-app) border-b border-(--rule) flex items-center px-2 select-none z-10">
        <div className="flex items-center h-full">
          {/* Active DWG Tab */}
          <div className="h-full px-3 bg-(--paper) border-t-2 border-t-(--pen) border-r border-l border-(--rule) flex items-center gap-2 text-[11px] font-medium text-(--fg-primary) shadow-xs">
            <span className="w-2 h-2 rounded-full bg-(--pen)" />
            <span>Drawing1.dwg*</span>
            <button
              className="w-3.5 h-3.5 rounded hover:bg-(--ink-sunken) grid place-items-center text-(--fg-muted) hover:text-(--fg-primary)"
              title="Close Tab"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
          {/* New Tab '+' */}
          <button
            className="w-6 h-full grid place-items-center hover:bg-(--ink-panel) text-(--fg-muted) hover:text-(--fg-primary) transition-colors"
            title="New Drawing Tab"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 2. AutoCAD In-Canvas Viewport Controls (Top-Left) */}
      <div className="absolute top-[34px] left-3 pointer-events-none select-none flex items-center gap-1 font-mono text-[10.5px] text-(--fg-muted) bg-(--ink-panel)/80 px-2.5 py-0.5 rounded border border-(--rule)/60 z-10 backdrop-blur-xs">
        <span className="hover:text-(--pen) cursor-pointer pointer-events-auto">[-]</span>
        <span>[</span>
        <span className="text-(--fg-secondary) hover:text-(--pen) cursor-pointer pointer-events-auto font-medium">Top</span>
        <span>]</span>
        <span>[</span>
        <span className="text-(--fg-secondary) hover:text-(--pen) cursor-pointer pointer-events-auto font-medium">2D Wireframe</span>
        <span>]</span>
      </div>

      {/* 3. AutoCAD ViewCube (Top-Right) */}
      <div className="absolute top-[34px] right-3 pointer-events-auto select-none flex flex-col items-center z-10">
        <div className="w-[68px] h-[68px] rounded-full border border-(--rule) bg-(--ink-panel)/90 shadow-md flex items-center justify-center relative backdrop-blur-xs">
          {/* Compass cardinal points */}
          <span className="absolute top-1 text-[8.5px] font-bold text-red-500 font-mono">N</span>
          <span className="absolute right-1.5 text-[8.5px] font-bold text-(--fg-muted) font-mono">E</span>
          <span className="absolute bottom-1 text-[8.5px] font-bold text-(--fg-muted) font-mono">S</span>
          <span className="absolute left-1.5 text-[8.5px] font-bold text-(--fg-muted) font-mono">W</span>

          {/* Central Cube Face */}
          <div
            onClick={handleZoomExtents}
            className="w-[34px] h-[34px] bg-(--ink-raised) border border-(--rule-strong) rounded flex items-center justify-center text-[9px] font-bold text-(--fg-primary) font-mono shadow-xs hover:border-(--pen) hover:text-(--pen) cursor-pointer transition-colors"
            title="ViewCube: Top View (Click for Zoom Extents)"
          >
            TOP
          </div>
        </div>

        {/* Viewport Nav Mini-Bar */}
        <div className="mt-1 flex items-center gap-1 bg-(--ink-panel)/90 border border-(--rule) rounded px-1.5 py-0.5 shadow-xs">
          <button
            onClick={handleZoomExtents}
            title="Zoom Extents (Z)"
            className="p-1 rounded hover:bg-(--ink-raised) text-(--fg-muted) hover:text-(--pen) transition-colors"
          >
            <Maximize className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 4. AutoCAD WCS Coordinate Triad Icon (Bottom-Left of Viewport) */}
      <div className="absolute left-4 bottom-4 pointer-events-none select-none z-10 flex flex-col items-start font-mono">
        <div className="relative w-[50px] h-[50px]">
          {/* Y Axis Arrow (Vertical) */}
          <div className="absolute left-[8px] bottom-[8px] w-[2px] h-[34px] bg-emerald-500 flex flex-col items-center justify-start">
            <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px] border-b-emerald-500 -mt-[4px]" />
            <span className="text-[9px] font-bold text-emerald-500 absolute -top-[14px] left-[4px]">Y</span>
          </div>

          {/* X Axis Arrow (Horizontal) */}
          <div className="absolute left-[8px] bottom-[8px] h-[2px] w-[34px] bg-rose-500 flex items-center justify-end">
            <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-rose-500 -mr-[4px]" />
            <span className="text-[9px] font-bold text-rose-500 absolute -right-[12px] -top-[6px]">X</span>
          </div>

          {/* Origin square */}
          <div className="absolute left-[5px] bottom-[5px] w-[8px] h-[8px] border border-amber-400 bg-amber-400/20" />
        </div>
        <span className="text-[9px] text-(--fg-muted) font-semibold tracking-wider ml-1 -mt-1">WCS</span>
      </div>
    </>
  );
}
