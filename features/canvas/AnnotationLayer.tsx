"use client";

/**
 * Annotations on the canvas: dimensions, levels, text, leaders, hatches,
 * markers, tables and revision clouds.
 *
 * Geometry comes from `lib/cad/annotationPrims` — the same primitives the SVG,
 * DXF and PDF writers use — so what is on screen is what will plot. Only the
 * styling differs: on screen, lineweights are held at a constant pixel width
 * (as AutoCAD's lineweight display does) while text and arrowheads scale with
 * the drawing, because they are paper sizes at the annotation scale.
 *
 * Primitive computation is memoised on the annotation list, the shapes and the
 * layer table, so pointer movement (snap feedback, the crosshair) never
 * re-hatches a bridge.
 */

import React from "react";
import type { Shape } from "@/lib/geometry/types";
import type { Annotation, DrawingSettings, Layer } from "@/lib/cad/types";
import type { DrawPrim } from "@/lib/cad/drawList";
import { annotationPrims } from "@/lib/cad/annotationPrims";
import { indexShapes } from "@/lib/cad/geometry";
import { dashPattern } from "@/lib/cad/layers";
import { layerInk } from "./ShapeRenderer";

interface Props {
  annotations: Annotation[];
  shapes: Shape[];
  settings: DrawingSettings;
  layers: Layer[];
  scale: number;
  themeMode: "dark" | "light";
  selectedIds: string[];
  isSelectTool: boolean;
  onSelect: (id: string, e: React.PointerEvent) => void;
  /** Double-click on a dimension that drives a component value: edit that value. */
  onEditDrivingDimension?: (a: Annotation) => void;
}

const PX_PER_LW_MM = 3.2;

function renderPrim(p: DrawPrim, key: string, color: string, width: number, dash: string | undefined, bold: boolean): React.ReactNode {
  switch (p.k) {
    case "line":
      return <line key={key} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />;
    case "polyline": {
      const pts = p.points.map((q) => `${q.x},${q.y}`).join(" ");
      return p.closed ? (
        <polygon key={key} points={pts} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" />
      ) : (
        <polyline key={key} points={pts} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinejoin="round" />
      );
    }
    case "circle":
      return <circle key={key} cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} />;
    case "arc": {
      const x0 = p.cx + p.r * Math.cos(p.start);
      const y0 = p.cy + p.r * Math.sin(p.start);
      const x1 = p.cx + p.r * Math.cos(p.end);
      const y1 = p.cy + p.r * Math.sin(p.end);
      return <path key={key} d={`M${x0} ${y0} A${p.r} ${p.r} 0 ${Math.abs(p.end - p.start) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={width} />;
    }
    case "fill": {
      const rings = [p.points, ...(p.holes ?? [])];
      return <path key={key} d={rings.map((r) => `M${r.map((q) => `${q.x} ${q.y}`).join(" L")} Z`).join(" ")} fill={color} fillRule="evenodd" stroke="none" />;
    }
    case "dots": {
      if (p.points.length === 0) return null;
      let d = "";
      for (const q of p.points) d += `M${q.x.toFixed(1)} ${q.y.toFixed(1)}h0`;
      return <path key={key} d={d} stroke={color} strokeWidth={Math.max(p.r * 2, width * 1.6)} strokeLinecap="round" fill="none" />;
    }
    case "segments": {
      if (p.segs.length === 0) return null;
      let d = "";
      for (let i = 0; i + 3 < p.segs.length; i += 4) d += `M${p.segs[i].toFixed(1)} ${p.segs[i + 1].toFixed(1)}L${p.segs[i + 2].toFixed(1)} ${p.segs[i + 3].toFixed(1)}`;
      return <path key={key} d={d} stroke={color} strokeWidth={width} fill="none" strokeDasharray={dash} />;
    }
    case "text": {
      const lines = p.text.split("\n");
      const lh = p.height * 1.35;
      const base = p.baseline === "top" ? p.height : p.baseline === "middle" ? p.height * 0.35 - ((lines.length - 1) * lh) / 2 : -(lines.length - 1) * lh;
      const anchor = p.align === "center" ? "middle" : p.align === "right" ? "end" : "start";
      return (
        <text
          key={key}
          fill={color}
          fontSize={p.height}
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight={p.bold || bold ? 700 : 400}
          textAnchor={anchor}
          transform={p.rotation ? `rotate(${-p.rotation} ${p.x} ${p.y})` : undefined}
          style={{ userSelect: "none" }}
        >
          {lines.map((l, i) => (
            <tspan key={i} x={p.x} y={p.y + base + i * lh}>
              {l}
            </tspan>
          ))}
        </text>
      );
    }
  }
}

export const AnnotationLayer = React.memo(function AnnotationLayer({
  annotations,
  shapes,
  settings,
  layers,
  scale,
  themeMode,
  selectedIds,
  isSelectTool,
  onSelect,
  onEditDrivingDimension,
}: Props) {
  const layerMap = React.useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const index = React.useMemo(() => indexShapes(shapes), [shapes]);
  const groups = React.useMemo(() => {
    const ctx = { shapes: index, settings };
    return annotations.map((a) => ({ a, prims: annotationPrims(a, ctx) }));
  }, [annotations, index, settings]);

  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  // A component's dimensions and hatches highlight with it.
  const selectedInstances = React.useMemo(() => {
    const out = new Set<string>();
    for (const id of selectedIds) {
      const s = index.get(id);
      if (s?.componentInstanceId) out.add(s.componentInstanceId);
    }
    return out;
  }, [selectedIds, index]);
  const selColor = "#38bdf8";

  return (
    <g id="annotation-layer">
      {groups.map(({ a, prims }) => {
        if (prims.length === 0) return null;
        const layer = layerMap.get(a.layerId ?? "");
        if (layer && (!layer.visible || layer.frozen)) return null;
        const isSel = selected.has(a.id) || (a.componentInstanceId !== undefined && selectedInstances.has(a.componentInstanceId));
        const pickable = isSelectTool && !(layer?.locked) && !a.isLocked;
        const hatch = a.type === "hatch";
        const driving = a.type === "dimension" && Boolean(a.drives) && Boolean(a.componentInstanceId) && onEditDrivingDimension;
        return (
          <g
            key={a.id}
            data-annotation-id={a.id}
            onPointerDown={
              pickable
                ? (e) => {
                    e.stopPropagation();
                    onSelect(a.id, e);
                  }
                : undefined
            }
            onDoubleClick={
              driving
                ? (e) => {
                    e.stopPropagation();
                    onEditDrivingDimension!(a);
                  }
                : undefined
            }
            style={{ pointerEvents: pickable && !hatch ? "visiblePainted" : "none", cursor: pickable ? (driving ? "text" : "pointer") : undefined }}
            opacity={hatch ? 0.85 : 1}
          >
            {driving && <title>{`Double-click to change ${(a as { drives?: string }).drives}`}</title>}
            {prims.map((p, i) => {
              const pl = layerMap.get(p.layerId) ?? layer;
              const base = p.color ?? (pl ? layerInk(pl.color, themeMode) : themeMode === "light" ? "#0f172a" : "#f8fafc");
              const color = isSel ? selColor : base;
              const lw = p.weight ?? pl?.lineWeight ?? 0.18;
              const width = Math.max(1, lw * PX_PER_LW_MM) / scale;
              const pat = dashPattern(p.dash ?? pl?.lineType ?? "continuous");
              const dash = pat ? pat.map((d) => (d * 2.2) / scale).join(" ") : undefined;
              return renderPrim(p, `${a.id}:${i}`, color, width, dash, false);
            })}
          </g>
        );
      })}
    </g>
  );
});
