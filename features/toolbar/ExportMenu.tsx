"use client";

import React, { useRef, useState, useEffect } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { exportJson } from "@/lib/serialization/exportJson";
import { importJsonFile } from "@/lib/serialization/importJson";
import { exportPng } from "@/lib/serialization/exportPng";
import { exportSvg } from "@/lib/serialization/exportSvg";
import { shapesToParametricSketch } from "@/lib/serialization/shapesToSketch";
import { exportDxf } from "@/lib/io/dxfExporter";
import { exportPdfSheet } from "@/lib/io/pdfSheetExporter";
import {
  Download,
  Upload,
  FileJson,
  Image as ImageIcon,
  FileCode2,
  FileText,
  Layers,
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

  const handleExportDxf = () => {
    try {
      const sketch = shapesToParametricSketch(state.shapes, state.variables);
      const dxfContent = exportDxf(sketch, { version: "R2010" });
      const blob = new Blob([dxfContent], { type: "application/dxf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "drawing.dxf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onNotification?.({ text: "Exported AutoCAD DXF (R2010) successfully", type: "success" });
      setIsOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      onNotification?.({ text: `Failed to export DXF: ${message}`, type: "error" });
    }
  };

  const handleExportPdf = () => {
    try {
      const sketch = shapesToParametricSketch(state.shapes, state.variables);
      const pdfBytes = exportPdfSheet(sketch, {
        size: "A3",
        titleBlock: {
          projectName: "UPCE CAD Drawing",
          drawingTitle: "Parametric Engineering Assembly",
          revision: "1.0",
          drawnBy: "UPCE-MASTER-1.0",
          date: new Date().toISOString().split("T")[0],
        },
        includeScaleBar: true,
      });
      const blob = new Blob([pdfBytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "drawing_sheet.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onNotification?.({ text: "Exported vector PDF Drawing Sheet (A3) successfully", type: "success" });
      setIsOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      onNotification?.({ text: `Failed to export PDF: ${message}`, type: "error" });
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
          className="h-[26px] px-2.5 flex items-center gap-1.5 bg-(--pen) hover:opacity-90 text-white rounded-[5px] text-[11px] font-medium transition-opacity cursor-pointer"
          aria-expanded={isOpen}
          title="Export / Import Drawing"
        >
          <Download className="w-3 h-3" />
          <span>Export</span>
          {direction === "up" ? (
            <ChevronUp className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          ) : (
            <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
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
          {/* AutoCAD DXF Export */}
          <button
            onClick={handleExportDxf}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer group"
          >
            <div className="p-1.5 rounded bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Export AutoCAD DXF</span>
              <span className="text-[10px] text-[var(--fg-muted)]">R2010 AC1024 vector exchange</span>
            </div>
          </button>

          {/* PDF Drawing Sheet Export */}
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-[var(--bg-panel-subtle)] text-[var(--fg-primary)] transition-colors text-left cursor-pointer group"
          >
            <div className="p-1.5 rounded bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold">Export PDF Sheet</span>
              <span className="text-[10px] text-[var(--fg-muted)]">A3 drawing with formal title block</span>
            </div>
          </button>

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
            <div className="p-1.5 rounded bg-(--pen-soft) text-(--pen)">
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
            <div className="p-1.5 rounded bg-(--pen-soft) text-(--pen)">
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
