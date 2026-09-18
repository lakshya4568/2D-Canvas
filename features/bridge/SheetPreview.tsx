"use client";

/**
 * Sheet preview and plot: paper size, locked viewport scale, title block, and
 * export. What is shown is exactly what the PDF will contain.
 */

import React from "react";
import { X, FileText, Image as ImageIcon, Trash2, FilePlus2, Lock, Unlock, ShieldAlert } from "lucide-react";
import { useCad } from "./useCad";
import { PAPER_SIZES, STANDARD_SCALES, sheetLayout, type PaperSize, type Sheet } from "@/lib/cad/sheet";
import { drawingPrims, exportSheetSvg } from "@/lib/cad/export";
import { primsBounds } from "@/lib/cad/drawList";

export function SheetPreview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, cad, dispatch, newSheet, exportPdf, exportSheetSvgFile, audit } = useCad();
  const [idx, setIdx] = React.useState(0);
  const sheets = cad.sheets;
  const sheet: Sheet | undefined = sheets[Math.min(idx, sheets.length - 1)];

  React.useEffect(() => {
    if (open && sheets.length === 0) newSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const svg = React.useMemo(() => (open && sheet ? exportSheetSvg(sheet, state.shapes, cad) : ""), [open, sheet, state.shapes, cad]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const update = (patch: Partial<Sheet>) => {
    if (!sheet) return;
    dispatch({ type: "CAD_SET_SHEETS", sheets: sheets.map((s) => (s.id === sheet.id ? { ...s, ...patch } : s)) });
  };

  const setScale = (scale: number) => {
    if (!sheet) return;
    const vp = sheet.viewports[0];
    const L = sheetLayout(sheet.size);
    const b = primsBounds(drawingPrims(state.shapes, cad));
    const cx = b ? (b.minX + b.maxX) / 2 : vp.window.x + vp.window.width / 2;
    const cy = b ? (b.minY + b.maxY) / 2 : vp.window.y + vp.window.height / 2;
    const w = L.drawArea.width * scale;
    const h = (L.drawArea.height - 16) * scale;
    update({ viewports: [{ ...vp, scale, window: { x: cx - w / 2, y: cy - h / 2, width: w, height: h }, paperX: L.drawArea.x, paperY: L.drawArea.y }] });
  };

  const setSize = (size: PaperSize) => {
    if (!sheet) return;
    const scale = sheet.viewports[0]?.scale ?? 100;
    const L = sheetLayout(size);
    const vp = sheet.viewports[0];
    const cx = vp.window.x + vp.window.width / 2;
    const cy = vp.window.y + vp.window.height / 2;
    const w = L.drawArea.width * scale;
    const h = (L.drawArea.height - 16) * scale;
    update({ size, viewports: [{ ...vp, window: { x: cx - w / 2, y: cy - h / 2, width: w, height: h }, paperX: L.drawArea.x, paperY: L.drawArea.y }] });
  };

  const vp = sheet?.viewports[0];
  const paper = sheet ? PAPER_SIZES[sheet.size] : PAPER_SIZES.A1;

  return (
    <div className="fixed inset-0 z-50 bg-black/55 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Sheet preview">
      <div className="w-[min(1320px,97vw)] h-[min(880px,94vh)] rounded-[10px] bg-(--ink-panel) border border-(--rule-strong) shadow-2xl flex flex-col overflow-hidden">
        <div className="h-[46px] px-4 flex items-center gap-2 border-b border-(--rule)">
          <FileText className="w-4 h-4 text-(--pen)" />
          <h2 className="text-[13px] font-semibold text-(--fg-primary)">Sheets</h2>
          <div className="flex items-center gap-1 ml-3">
            {sheets.map((s, i) => (
              <button key={s.id} onClick={() => setIdx(i)} className={`h-[26px] px-2 rounded-[5px] text-[11px] cursor-pointer ${i === idx ? "bg-(--pen-soft) text-(--pen) font-semibold" : "text-(--fg-secondary) hover:bg-(--ink-raised)"}`}>
                {s.size} · {i + 1}
              </button>
            ))}
            <button onClick={() => { newSheet(); setIdx(sheets.length); }} className="h-[26px] px-2 rounded-[5px] text-[11px] text-(--fg-secondary) hover:bg-(--ink-raised) inline-flex items-center gap-1 cursor-pointer">
              <FilePlus2 className="w-3.5 h-3.5" /> New
            </button>
          </div>
          <span className="flex-1" />
          {audit.issueBlocked && (
            <span className="text-[11px] text-(--crit) inline-flex items-center gap-1 mr-2" title="The audit has blocking findings — the sheet prints with its status banner">
              <ShieldAlert className="w-3.5 h-3.5" /> {audit.counts.blocker + audit.counts.error} blocking finding(s)
            </span>
          )}
          <button onClick={exportPdf} className="h-[30px] px-3 rounded-[6px] bg-(--pen) text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            <FileText className="w-3.5 h-3.5" /> Plot PDF
          </button>
          <button onClick={() => exportSheetSvgFile(idx)} className="h-[30px] px-3 rounded-[6px] border border-(--rule) text-[12px] text-(--fg-secondary) hover:bg-(--ink-raised) inline-flex items-center gap-1.5 cursor-pointer">
            <ImageIcon className="w-3.5 h-3.5" /> SVG
          </button>
          <button onClick={onClose} aria-label="Close" className="w-[28px] h-[28px] grid place-items-center rounded hover:bg-(--ink-raised) text-(--fg-muted) cursor-pointer ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        {sheet && vp ? (
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 p-4 bg-(--ink-sunken) grid place-items-center overflow-auto">
              <div className="bg-white shadow-xl" style={{ aspectRatio: `${paper.width} / ${paper.height}`, width: "100%", maxHeight: "100%" }} dangerouslySetInnerHTML={{ __html: svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" height="100%"') }} />
            </div>
            <div className="w-[250px] shrink-0 border-l border-(--rule) p-3 flex flex-col gap-3 text-[11px]">
              <label className="flex flex-col gap-1 text-(--fg-muted)">
                Sheet name
                <input defaultValue={sheet.name} onBlur={(e) => update({ name: e.target.value })} className="h-[26px] rounded-[5px] bg-(--ink-raised) border border-(--rule) px-2 text-(--fg-primary)" />
              </label>
              <label className="flex flex-col gap-1 text-(--fg-muted)">
                Paper
                <select value={sheet.size} onChange={(e) => setSize(e.target.value as PaperSize)} className="h-[26px] rounded-[5px] bg-(--ink-raised) border border-(--rule) px-1.5 text-(--fg-primary)">
                  {(Object.keys(PAPER_SIZES) as PaperSize[]).map((s) => (
                    <option key={s} value={s}>
                      {s} — {PAPER_SIZES[s].width} × {PAPER_SIZES[s].height} mm
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-(--fg-muted)">
                Viewport scale
                <select value={vp.scale} disabled={vp.locked} onChange={(e) => setScale(Number(e.target.value))} className="h-[26px] rounded-[5px] bg-(--ink-raised) border border-(--rule) px-1.5 text-(--fg-primary) font-mono disabled:opacity-60">
                  {STANDARD_SCALES.map((s) => (
                    <option key={s} value={s}>
                      1:{s}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => update({ viewports: [{ ...vp, locked: !vp.locked }] })}
                className="h-[26px] rounded-[5px] border border-(--rule) text-(--fg-secondary) hover:bg-(--ink-raised) inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                {vp.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {vp.locked ? "Scale locked" : "Scale unlocked — lock before issue"}
              </button>
              <button onClick={() => setScale(vp.scale)} className="h-[26px] rounded-[5px] border border-(--rule) text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer">
                Re-centre on drawing
              </button>
              <p className="text-[10.5px] text-(--fg-muted) leading-relaxed">
                Title block, notes and status come from Bridge › Project. RDSO checklist: important and major bridge GADs on A0, others on A1.
              </p>
              <span className="flex-1" />
              <button
                onClick={() => {
                  dispatch({ type: "CAD_SET_SHEETS", sheets: sheets.filter((s) => s.id !== sheet.id) });
                  setIdx(0);
                }}
                className="h-[26px] rounded-[5px] border border-(--rule) text-(--crit) hover:bg-(--crit-soft) inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Delete sheet
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 grid place-items-center text-(--fg-muted) text-[12px]">Laying out a sheet…</div>
        )}
      </div>
    </div>
  );
}
