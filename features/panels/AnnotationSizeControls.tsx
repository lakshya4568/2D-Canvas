"use client";

/**
 * How big text, dimensions and arrows are — and whether they can be read.
 *
 * Sizes are paper millimetres at the annotation scale, as on a drafted sheet:
 * text on the drawing is `height × scale` model mm. The readout says what that
 * comes to against the drawing itself, and "Fit to drawing" picks the standard
 * scale at which text reads comfortably when the drawing is seen whole (about
 * 1/100 of its larger side). Every change regenerates component annotation, so
 * dimension rows respace with it.
 */

import React from "react";
import { Maximize2, TriangleAlert } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { ANNOTATION_SCALES, ILLEGIBLE_TEXT_FRACTION, readableAnnotationScale } from "@/lib/cad/sheet";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";

function useExtent() {
  const { state } = useDrawing();
  return React.useMemo(() => {
    const b = computeMultiShapeBounds(state.shapes);
    return b ? { w: b.width, h: b.height } : null;
  }, [state.shapes]);
}

function PaperMm({ label, value, placeholder, onCommit, compact }: { label: string; value: number | undefined; placeholder?: string; onCommit: (v: number | undefined) => void; compact?: boolean }) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    setDraft(null);
    if (!t) return onCommit(undefined);
    const v = Number(t);
    if (Number.isFinite(v) && v > 0) onCommit(v);
  };
  return (
    <label className={`flex ${compact ? "flex-col items-center gap-0.5 text-[9.5px]" : "flex-col gap-1 text-[11px]"} text-(--fg-muted)`}>
      <input
        type="number"
        step={0.5}
        min={0.5}
        value={draft ?? (value ?? "")}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-label={`${label} (paper mm)`}
        className={`${compact ? "w-[46px] h-[24px] text-[11px]" : "h-[26px]"} rounded-[5px] bg-(--ink-app) border border-(--rule) px-1.5 text-(--fg-primary) num`}
      />
      {label}
    </label>
  );
}

export function AnnotationSizeControls({ compact }: { compact?: boolean }) {
  const { state, dispatch } = useDrawing();
  const settings = state.cad.settings;
  const extent = useExtent();
  const set = (patch: Partial<typeof settings>) => dispatch({ type: "CAD_SET_SETTINGS", patch });
  const scales = ANNOTATION_SCALES.includes(settings.annotationScale) ? ANNOTATION_SCALES : [...ANNOTATION_SCALES, settings.annotationScale].sort((a, b) => a - b);
  const textModel = settings.textHeight * settings.annotationScale;
  const dimModel = (settings.dimTextHeight ?? settings.textHeight) * settings.annotationScale;
  const side = extent ? Math.max(extent.w, extent.h) : 0;
  const tooSmall = side > 0 && Math.min(textModel, dimModel) < side * ILLEGIBLE_TEXT_FRACTION;
  const fit = () => extent && set({ annotationScale: readableAnnotationScale(extent.w, extent.h, Math.min(settings.textHeight, settings.dimTextHeight ?? settings.textHeight)) });
  const fmt = (v: number) => (v >= 100 ? String(Math.round(v)) : String(Number(v.toFixed(1))));

  const scaleSelect = (
    <select
      aria-label="Annotation scale"
      value={settings.annotationScale}
      onChange={(e) => set({ annotationScale: Number(e.target.value) })}
      className={`${compact ? "h-[24px] text-[11px]" : "h-[26px]"} rounded-[5px] bg-(--ink-app) border border-(--rule) px-1 text-(--fg-primary) font-mono`}
    >
      {scales.map((s) => (
        <option key={s} value={s}>
          1:{s}
        </option>
      ))}
    </select>
  );
  const fitButton = (
    <button
      type="button"
      onClick={fit}
      disabled={!extent}
      title="Size text, dimensions and arrows to read well against this drawing"
      className={`${compact ? "h-[24px] px-1.5 text-[10px]" : "h-[26px] px-2 text-[11px]"} rounded-[5px] border border-(--rule) text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer inline-flex items-center gap-1 disabled:opacity-50`}
    >
      <Maximize2 className="w-3 h-3" /> Fit to drawing
    </button>
  );

  if (compact) {
    return (
      <div className="flex items-end gap-1.5" title={extent ? `Text is ${fmt(textModel)} mm on a ${fmt(side)} mm drawing` : undefined}>
        <label className="flex flex-col items-center gap-0.5 text-[9.5px] text-(--fg-secondary)">
          {scaleSelect}
          Scale
        </label>
        <PaperMm compact label="Text" value={settings.textHeight} onCommit={(v) => v && set({ textHeight: v })} />
        <PaperMm compact label="Dim text" value={settings.dimTextHeight} placeholder={String(settings.textHeight)} onCommit={(v) => set({ dimTextHeight: v })} />
        <PaperMm compact label="Arrow" value={settings.arrowSize} placeholder="2.5" onCommit={(v) => set({ arrowSize: v })} />
        <div className="flex flex-col items-center gap-0.5">
          {fitButton}
          <span className={`text-[9.5px] ${tooSmall ? "text-(--warn)" : "text-(--fg-secondary)"}`}>{tooSmall ? "too small to read" : extent ? `${fmt(textModel)} mm on drawing` : "no drawing"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <label className="flex flex-col gap-1 text-(--fg-muted)">
          Annotation scale
          {scaleSelect}
        </label>
        <PaperMm label="Text height (paper mm)" value={settings.textHeight} onCommit={(v) => v && set({ textHeight: v })} />
        <PaperMm label="Dimension text (paper mm)" value={settings.dimTextHeight} placeholder={`${settings.textHeight} (as text)`} onCommit={(v) => set({ dimTextHeight: v })} />
        <PaperMm label="Arrow size (paper mm)" value={settings.arrowSize} placeholder="2.5" onCommit={(v) => set({ arrowSize: v })} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10.5px] leading-snug inline-flex items-center gap-1 ${tooSmall ? "text-(--warn)" : "text-(--fg-muted)"}`}>
          {tooSmall && <TriangleAlert className="w-3 h-3 shrink-0" />}
          {extent ? `Text ${fmt(textModel)} mm, dimensions ${fmt(dimModel)} mm on a ${fmt(side)} mm drawing${tooSmall ? " — too small to read" : ""}.` : "Nothing drawn yet."}
        </span>
        {fitButton}
      </div>
    </div>
  );
}
