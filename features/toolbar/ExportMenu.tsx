"use client";

import React, { useRef, useState } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { exportJson } from "@/lib/serialization/exportJson";
import { importJsonFile } from "@/lib/serialization/importJson";
import { exportSvgToPng } from "@/lib/serialization/exportPng";
import {
  Download,
  Upload,
  FileJson,
  Image as ImageIcon,
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

  const handleExportPng = async () => {
    try {
      const svg = document.querySelector("svg");
      if (!svg) throw new Error("Canvas SVG element not found");
      await exportSvgToPng(svg, {
        filename: "drawing.png",
        scale: 2,
        backgroundColor: document.documentElement.classList.contains("dark") ? "#0f1015" : "#ffffff",
      });
      onNotification?.({ text: "Exported high-resolution drawing.png", type: "success" });
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
      {/* Hidden file input for JSON import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json,application/json"
        className="hidden"
      />

      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl glass-panel shadow-lg">
        {/* Direct JSON Export Trigger */}
        <button
          onClick={handleExportJson}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold shadow transition-all cursor-pointer"
          title="Export JSON File"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export JSON</span>
        </button>

        {/* Dropdown toggle for more options */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-xl text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-all cursor-pointer"
          aria-expanded={isOpen}
          title="More Export & Import Options"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 p-1.5 rounded-2xl glass-panel shadow-2xl z-50 flex flex-col gap-1 border border-[var(--border-subtle)] text-xs">
          <button
            onClick={handleExportJson}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors text-left cursor-pointer"
          >
            <FileJson className="w-4 h-4 text-blue-500" />
            <div className="flex flex-col">
              <span className="font-semibold">Export JSON</span>
              <span className="text-[10px] text-[var(--fg-muted)]">Specification vector format</span>
            </div>
          </button>

          <button
            onClick={handleExportPng}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors text-left cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col">
              <span className="font-semibold">Export PNG Image</span>
              <span className="text-[10px] text-[var(--fg-muted)]">2x high-resolution raster</span>
            </div>
          </button>

          <div className="w-full h-[1px] bg-[var(--border-subtle)] my-1" />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] transition-colors text-left cursor-pointer"
          >
            <Upload className="w-4 h-4 text-amber-500" />
            <div className="flex flex-col">
              <span className="font-semibold">Import JSON</span>
              <span className="text-[10px] text-[var(--fg-muted)]">Load and validate file</span>
            </div>
          </button>

          <div className="w-full h-[1px] bg-[var(--border-subtle)] my-1" />

          <button
            onClick={() => {
              if (confirm("Are you sure you want to clear all shapes from the canvas?")) {
                clearAll();
                onNotification?.({ text: "Canvas cleared", type: "success" });
                setIsOpen(false);
              }
            }}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-500 hover:bg-red-500/10 transition-colors text-left cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-semibold">Clear Canvas</span>
          </button>
        </div>
      )}
    </div>
  );
}
