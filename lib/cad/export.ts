/**
 * Whole-drawing output: model space to DXF/SVG, sheets to PDF/SVG.
 *
 * Every writer reads the same draw list (shapes + annotations → primitives),
 * so the file on disk is the drawing on screen. The sheet's title block reads
 * the project record; its status banner is the drawing's status, and the
 * audit decides whether "APPROVED" may be printed at all.
 */

import type { Shape } from "@/lib/geometry/types";
import type { DrawPrim } from "./drawList";
import { primsBounds } from "./drawList";
import { annotationPrims, shapePrims } from "./annotationPrims";
import { indexShapes } from "./geometry";
import type { CadDocState } from "./document";
import { drawListToDxf } from "./dxf";
import { drawListToSvg } from "./svgRender";
import { pagesToPdf } from "./pdf";
import { autoSheet, composeSheet, PAPER_SIZES, sheetScaleText, type PaperSize, type Sheet, type TitleBlockData } from "./sheet";
import { findLayer } from "./layers";
import { BUILTIN_SOURCES, citation } from "@/lib/bridge/sources";

/** All model-space primitives of the drawing, honouring layer visibility. */
export function drawingPrims(shapes: Shape[], cad: CadDocState): DrawPrim[] {
  const ctx = { shapes: indexShapes(shapes), settings: cad.settings };
  const visible = (layerId: string | undefined) => {
    const l = findLayer(cad.layers, layerId);
    return !l || (l.visible && !l.frozen);
  };
  const out: DrawPrim[] = [];
  for (const s of shapes) if (visible(s.layerId)) out.push(...shapePrims(s, s.layerId ?? "0"));
  for (const a of cad.annotations) if (visible(a.layerId)) out.push(...annotationPrims(a, ctx));
  return out;
}

export function exportDrawingDxf(shapes: Shape[], cad: CadDocState): string {
  return drawListToDxf(drawingPrims(shapes, cad), cad.layers, { ltscale: cad.settings.annotationScale * 0.6 });
}

export function exportDrawingSvg(shapes: Shape[], cad: CadDocState, background: "white" | "dark" = "white"): string {
  const prims = drawingPrims(shapes, cad);
  const b = primsBounds(prims) ?? { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.03;
  return drawListToSvg(prims, cad.layers, {
    background,
    modelPerPaper: cad.settings.annotationScale,
    viewBox: { x: b.minX - pad, y: b.minY - pad, width: b.maxX - b.minX + 2 * pad, height: b.maxY - b.minY + 2 * pad },
    title: cad.project.identity.drawingTitle,
  });
}

/** Codes and manuals the drawing cites, for the title block's reference list. */
export function referencesFor(cad: CadDocState): string[] {
  const used = new Set<string>();
  for (const s of cad.project.sources) used.add(citation(s));
  for (const id of ["irbm-1103-3", "ircm-t403", "irs-substructure"]) {
    const s = BUILTIN_SOURCES.find((x) => x.id === id);
    if (s) used.add(s.title + (s.revision ? ` (${s.revision.split(" (")[0]})` : ""));
  }
  return [...used].slice(0, 6);
}

export function titleBlockData(cad: CadDocState, sheet: Sheet): TitleBlockData {
  const id = cad.project.identity;
  return {
    railway: id.railway,
    division: id.division,
    projectName: id.projectName,
    drawingTitle: sheet.name || id.drawingTitle,
    drawingNumber: id.drawingNumber,
    revision: id.revision,
    bridgeNumber: id.bridgeNumber,
    chainage: id.chainage,
    scaleText: sheetScaleText(sheet),
    date: new Date().toISOString().slice(0, 10),
    status: cad.project.drawingStatus,
    approvals: cad.project.approvals,
    sanctionReference: id.sanctionReference,
    references: referencesFor(cad),
    revisions: cad.revisions.length ? cad.revisions : [{ rev: id.revision || "0", description: "First issue", date: new Date().toISOString().slice(0, 10) }],
  };
}

/** A sheet that shows the whole drawing, at the largest standard scale that fits. */
export function defaultSheet(shapes: Shape[], cad: CadDocState, size: PaperSize = "A1"): Sheet {
  const n = cad.sheets.length + 1;
  return autoSheet(`sheet-${n}`, cad.project.identity.drawingTitle || `Sheet ${n}`, size, drawingPrims(shapes, cad));
}

export function sheetPrims(sheet: Sheet, shapes: Shape[], cad: CadDocState): DrawPrim[] {
  const notes = [...cad.project.notes, ...sheet.notes];
  return composeSheet(sheet, drawingPrims(shapes, cad), titleBlockData(cad, sheet), notes);
}

export function exportSheetsPdf(shapes: Shape[], cad: CadDocState, sheets: Sheet[] = cad.sheets): Uint8Array {
  const list = sheets.length ? sheets : [defaultSheet(shapes, cad)];
  return pagesToPdf(
    list.map((s) => ({ widthMm: PAPER_SIZES[s.size].width, heightMm: PAPER_SIZES[s.size].height, prims: sheetPrims(s, shapes, cad) })),
    cad.layers,
    { title: cad.project.identity.drawingTitle }
  );
}

export function exportSheetSvg(sheet: Sheet, shapes: Shape[], cad: CadDocState): string {
  const p = PAPER_SIZES[sheet.size];
  return drawListToSvg(sheetPrims(sheet, shapes, cad), cad.layers, {
    background: "white",
    modelPerPaper: 1,
    viewBox: { x: 0, y: 0, width: p.width, height: p.height },
    width: `${p.width}mm`,
    height: `${p.height}mm`,
    title: sheet.name,
  });
}

/** Browser download helper (no-op outside a browser). */
export function download(filename: string, data: string | Uint8Array, mime: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileStem(cad: CadDocState): string {
  const id = cad.project.identity;
  const stem = [id.drawingNumber, id.bridgeNumber && `BR${id.bridgeNumber}`, id.drawingTitle].filter(Boolean).join("_") || "drawing";
  return stem.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80);
}
