"use client";

import React, { useRef, useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { exportJson } from "@/lib/serialization/exportJson";
import { importJsonFile } from "@/lib/serialization/importJson";
import { exportPng } from "@/lib/serialization/exportPng";
import { exportSvg } from "@/lib/serialization/exportSvg";
import {
  Download,
  Upload,
  FileJson,
  Image as ImageIcon,
  FileCode2,
  ChevronDown,
  Trash2,
} from "lucide-react";

interface ExportMenuProps {
  onNotification?: (msg: { text: string; type: "success" | "error" }) => void;
}

export function ExportMenu({ onNotification }: ExportMenuProps) {
  const { state, dispatch, clearAll } = useDrawing();
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getCanvasBg = () => {
    return state.themeMode === "light" ? "#ffffff" : "#121316";
  };

  const handleExportJson = () => {
    try {
      exportJson(state.shapes);
      onNotification?.({ text: "Exported drawing.json successfully", type: "success" });
      setIsOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      onNotification?.({ text: `Failed to export JSON: ${message}`, type: "error" });
    }
  };

  const handleExportSvg = () => {
    try {
      exportSvg(state.shapes, {
        filename: "drawing.svg",
        backgroundColor: getCanvasBg(),
        showDimensions: state.showDimensions,
      });
      onNotification?.({ text: "Exported vector drawing.svg successfully", type: "success" });
      setIsOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      onNotification?.({ text: `Failed to export SVG: ${message}`, type: "error" });
    }
  };

  const handleExportPng = async () => {
    try {
      await exportPng(state.shapes, {
        filename: "drawing.png",
        scale: 2,
        backgroundColor: getCanvasBg(),
        showDimensions: state.showDimensions,
      });
      onNotification?.({ text: "Exported high-resolution drawing.png (2x retina)", type: "success" });
      setIsOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      onNotification?.({ text: `Failed to export PNG: ${message}`, type: "error" });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await importJsonFile(file);
    if (result.success && result.shapes) {
      dispatch({ type: "LOAD_SHAPES", shapes: result.shapes });
      onNotification?.({
        text: `Successfully imported ${result.shapes.length} shapes`,
        type: "success",
      });
    } else {
      onNotification?.({
        text: result.error || "Failed to import JSON file",
        type: "error",
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json,application/json"
        className="hidden"
      />

      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="h-8 px-3 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer"
          aria-expanded={isOpen}
          title="Export / Import Drawing"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-56 p-1.5 rounded-md bg-[var(--bg-panel)] shadow-2xl z-50 flex flex-col gap-1 border border-[var(--border-subtle)] text-xs">
          {/* PNG Export */}
          <button
            onClick={handleExportPng}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col">
              <span className="font-semibold">Export PNG Image</span>
              <span className="text-[9px] text-[var(--fg-muted)]">2x High-DPI raster image</span>
            </div>
          </button>

          {/* SVG Export */}
          <button
            onClick={handleExportSvg}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer"
          >
            <FileCode2 className="w-4 h-4 text-purple-400" />
            <div className="flex flex-col">
              <span className="font-semibold">Export SVG Vector</span>
              <span className="text-[9px] text-[var(--fg-muted)]">Scalable standalone vector</span>
            </div>
          </button>

          {/* JSON Export */}
          <button
            onClick={handleExportJson}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer"
          >
            <FileJson className="w-4 h-4 text-blue-500" />
            <div className="flex flex-col">
              <span className="font-semibold">Export JSON Schema</span>
              <span className="text-[9px] text-[var(--fg-muted)]">Specification vector data</span>
            </div>
          </button>

          <div className="w-full h-[1px] bg-[var(--border-subtle)] my-0.5" />

          {/* JSON Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer"
          >
            <Upload className="w-4 h-4 text-amber-500" />
            <div className="flex flex-col">
              <span className="font-semibold">Import JSON</span>
              <span className="text-[9px] text-[var(--fg-muted)]">Load & validate drawing file</span>
            </div>
          </button>

          <div className="w-full h-[1px] bg-[var(--border-subtle)] my-0.5" />

          {/* Clear Canvas */}
          <button
            onClick={() => {
              if (confirm("Are you sure you want to clear the entire canvas?")) {
                clearAll();
                onNotification?.({ text: "Canvas cleared", type: "success" });
                setIsOpen(false);
              }
            }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-red-500 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-semibold">Clear Canvas</span>
          </button>
        </div>
      )}
    </div>
  );
}
