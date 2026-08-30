"use client";

import React, { useRef, useState, useEffect } from "react";
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
  ChevronUp,
  Trash2,
} from "lucide-react";

interface ExportMenuProps {
  direction?: "up" | "down";
  onNotification?: (msg: { text: string; type: "success" | "error" }) => void;
}

export function ExportMenu({ direction = "up", onNotification }: ExportMenuProps) {
  const { state, dispatch, clearAll } = useDrawing();
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const getCanvasBg = () => {
    return state.themeMode === "light" ? "#ffffff" : "#121316";
  };

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

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
    <div ref={menuRef} className="relative">
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
          className="h-9 px-3.5 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-lg text-xs font-semibold shadow-lg transition-all cursor-pointer border border-blue-400/30"
          aria-expanded={isOpen}
          title="Export / Import Drawing"
        >
          <Download className="w-4 h-4" />
          <span>Export</span>
          {direction === "up" ? (
            <ChevronUp className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          ) : (
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          )}
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute right-0 ${
            direction === "up" ? "bottom-full mb-2" : "top-full mt-2"
          } w-60 p-1.5 rounded-lg bg-[var(--bg-panel)] shadow-2xl z-50 flex flex-col gap-1 border border-[var(--border-subtle)] text-xs backdrop-blur-md`}
        >
          {/* PNG Export */}
          <button
            onClick={handleExportPng}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer group"
          >
            <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Export PNG Image</span>
              <span className="text-[10px] text-[var(--fg-muted)]">2x High-DPI raster image</span>
            </div>
          </button>

          {/* SVG Export */}
          <button
            onClick={handleExportSvg}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer group"
          >
            <div className="p-1.5 rounded bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20">
              <FileCode2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Export SVG Vector</span>
              <span className="text-[10px] text-[var(--fg-muted)]">Scalable standalone vector</span>
            </div>
          </button>

          {/* JSON Export */}
          <button
            onClick={handleExportJson}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer group"
          >
            <div className="p-1.5 rounded bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20">
              <FileJson className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Export JSON Schema</span>
              <span className="text-[10px] text-[var(--fg-muted)]">Specification vector data</span>
            </div>
          </button>

          <div className="w-full h-[1px] bg-[var(--border-subtle)] my-0.5" />

          {/* JSON Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer group"
          >
            <div className="p-1.5 rounded bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20">
              <Upload className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Import JSON File</span>
              <span className="text-[10px] text-[var(--fg-muted)]">Load & validate drawing file</span>
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
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-red-500 hover:bg-red-500/10 transition-colors text-left cursor-pointer group"
          >
            <div className="p-1.5 rounded bg-red-500/10 text-red-500 group-hover:bg-red-500/20">
              <Trash2 className="w-4 h-4" />
            </div>
            <span className="font-semibold">Clear Canvas</span>
          </button>
        </div>
      )}
    </div>
  );
}
