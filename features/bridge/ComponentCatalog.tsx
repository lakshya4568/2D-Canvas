"use client";

/**
 * The component library: pick a bridge, culvert, pier, abutment, pile group,
 * well or wall, set its values with a live preview, insert it.
 *
 * The preview is the real engine output — the same geometry, dimensions and
 * hatches the drawing will get — so what you see here is what lands on the
 * sheet, and a refused combination of values is refused here too, with the
 * reason, before anything is inserted.
 */

import React from "react";
import { X, Landmark, Search, TriangleAlert } from "lucide-react";
import { COMPONENT_LIBRARY } from "@/lib/components/library";
import { registryFor } from "@/lib/cad/document";
import type { ComponentDefinition } from "@/lib/components/types";
import { instantiateComponent } from "@/lib/components/instantiate";
import { useDrawing } from "@/lib/state/drawingContext";
import { useCad } from "./useCad";
import { annotationPrims, shapePrims } from "@/lib/cad/annotationPrims";
import { indexShapes } from "@/lib/cad/geometry";
import { primsBounds } from "@/lib/cad/drawList";
import { drawListToSvg } from "@/lib/cad/svgRender";

const CATEGORY_ORDER = ["bridge", "box_culvert", "pipe_culvert", "pier", "abutment", "span", "deck_section", "girder_deck", "pile_group", "well_foundation", "wing_wall", "level_set", "bridge_plan", "railing", "post"];

function Preview({ def, values }: { def: ComponentDefinition; values: Record<string, number> }) {
  const { state } = useDrawing();
  const { svg, issues } = React.useMemo(() => {
    // A view drawn for a set scale previews at that scale, so its text reads as it will print.
    const settings = { ...state.cad.settings, annotationScale: def.drawingScale ?? state.cad.settings.annotationScale };
    const out = instantiateComponent({ id: "PREVIEW", definitionId: def.id, name: def.name, values, x: 0, y: 0, absoluteElevation: def.parameters.some((p) => p.kind === "level") }, def, registryFor(state.cad), state.cad.layers, settings);
    const ctx = { shapes: indexShapes(out.shapes), settings };
    const prims = [...out.shapes.flatMap((s) => shapePrims(s)), ...out.annotations.flatMap((a) => annotationPrims(a, ctx))];
    const b = primsBounds(prims);
    if (!b) return { svg: "", issues: out.evaluation.issues };
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.04;
    return {
      svg: drawListToSvg(prims, state.cad.layers, {
        background: state.themeMode === "light" ? "white" : "dark",
        modelPerPaper: settings.annotationScale,
        viewBox: { x: b.minX - pad, y: b.minY - pad, width: b.maxX - b.minX + 2 * pad, height: b.maxY - b.minY + 2 * pad },
        width: "100%",
        height: "100%",
      }),
      issues: out.evaluation.issues,
    };
  }, [def, values, state.cad, state.themeMode]);
  const errs = issues.filter((i) => i.severity === "error");
  return (
    <div className="flex flex-col gap-2 min-h-0 flex-1">
      <div className="flex-1 min-h-[260px] rounded-[6px] border border-(--rule) overflow-hidden bg-(--paper)" dangerouslySetInnerHTML={{ __html: svg }} />
      {errs.length > 0 && (
        <div className="rounded-[6px] border border-(--crit) bg-(--crit-soft) p-2 flex items-start gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 text-(--crit) shrink-0 mt-0.5" />
          <p className="text-[11px] text-(--crit) leading-snug">{errs.map((e) => e.message).join(" ")}</p>
        </div>
      )}
    </div>
  );
}

export function ComponentCatalog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { insertComponent } = useCad();
  const { state } = useDrawing();
  const [q, setQ] = React.useState("");
  const [selId, setSelId] = React.useState<string>("ir.rcc_box.half_section");
  const [values, setValues] = React.useState<Record<string, number>>({});
  const def = registryFor(state.cad).get(selId);

  React.useEffect(() => setValues({}), [selId]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const list = [...(state.cad.definitions ?? []), ...COMPONENT_LIBRARY].filter((d) => {
    const s = q.trim().toLowerCase();
    return !s || d.name.toLowerCase().includes(s) || d.tags?.some((t) => t.toLowerCase().includes(s)) || d.description.toLowerCase().includes(s);
  }).sort((a, b) => CATEGORY_ORDER.indexOf(a.semanticType) - CATEGORY_ORDER.indexOf(b.semanticType) || a.name.localeCompare(b.name));
  const blocked = def ? instantiateBlocked(def, values, registryFor(state.cad)) : true;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Component library">
      <div className="w-[min(1180px,96vw)] h-[min(780px,92vh)] rounded-[10px] bg-(--ink-panel) border border-(--rule-strong) shadow-2xl flex flex-col overflow-hidden">
        <div className="h-[44px] px-4 flex items-center gap-2 border-b border-(--rule)">
          <Landmark className="w-4 h-4 text-(--pen)" />
          <h2 className="text-[13px] font-semibold text-(--fg-primary)">Component library</h2>
          <p className="text-[11px] text-(--fg-muted) ml-2 truncate">Every coordinate is written from named values — a component is fully defined by construction.</p>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close" className="w-[26px] h-[26px] grid place-items-center rounded hover:bg-(--ink-raised) text-(--fg-muted) cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="w-[270px] shrink-0 border-r border-(--rule) flex flex-col min-h-0">
            <div className="p-2 border-b border-(--rule)">
              <label className="flex items-center gap-1.5 h-[28px] px-2 rounded-[6px] bg-(--ink-raised) border border-(--rule)">
                <Search className="w-3.5 h-3.5 text-(--fg-muted)" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: pier, pile, culvert…" aria-label="Search components" className="flex-1 bg-transparent outline-none text-[11.5px] text-(--fg-primary)" />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
              {list.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelId(d.id)}
                  className={`text-left rounded-[6px] px-2.5 py-2 cursor-pointer ${d.id === selId ? "bg-(--pen-soft)" : "hover:bg-(--ink-raised)"}`}
                >
                  <p className={`text-[12px] font-medium ${d.id === selId ? "text-(--pen)" : "text-(--fg-primary)"}`}>{d.name}</p>
                  <p className="text-[10px] text-(--fg-muted)">
                    {d.category === "assembly" ? "Assembly" : "Component"} · {d.view} · {d.parameters.length} values
                  </p>
                </button>
              ))}
            </div>
          </div>
          {def && (
            <div className="flex-1 min-w-0 flex">
              <div className="flex-1 min-w-0 p-3 flex flex-col gap-2">
                <p className="text-[11.5px] text-(--fg-secondary) leading-relaxed">{def.description}</p>
                <Preview def={def} values={values} />
              </div>
              <div className="w-[300px] shrink-0 border-l border-(--rule) flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                  {groupParams(def).map(([g, ps]) => (
                    <section key={g} className="flex flex-col gap-1.5">
                      <h4 className="label">{g}</h4>
                      {ps.map((p) => (
                        <label key={p.name} className="flex items-center justify-between gap-2 text-[11px] text-(--fg-secondary)">
                          <span className="truncate" title={p.description ?? p.name}>
                            {p.label ?? p.name}
                          </span>
                          {p.options ? (
                            <select
                              value={values[p.name] ?? p.default}
                              onChange={(e) => setValues((v) => ({ ...v, [p.name]: Number(e.target.value) }))}
                              className="h-[24px] max-w-[140px] rounded-[5px] bg-(--ink-raised) border border-(--rule) text-[11px] px-1 text-(--fg-primary)"
                            >
                              {p.options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="flex items-center gap-1">
                              <input
                                type="number"
                                step={p.step ?? (p.kind === "level" ? 0.001 : 1)}
                                value={values[p.name] ?? p.default}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (Number.isFinite(n)) setValues((v) => ({ ...v, [p.name]: n }));
                                }}
                                className="num w-[86px] h-[24px] px-1.5 text-right text-[11.5px] rounded-[5px] bg-(--ink-raised) border border-(--rule) text-(--fg-primary)"
                              />
                              <span className="text-[9.5px] text-(--fg-muted) w-[22px]">{p.unit === "-" ? "" : p.unit}</span>
                            </span>
                          )}
                        </label>
                      ))}
                    </section>
                  ))}
                </div>
                <div className="p-3 border-t border-(--rule) flex items-center gap-2">
                  <button onClick={() => setValues({})} className="h-[30px] px-3 rounded-[6px] border border-(--rule) text-[11.5px] text-(--fg-secondary) hover:bg-(--ink-raised) cursor-pointer">
                    Defaults
                  </button>
                  <button
                    disabled={blocked}
                    onClick={() => {
                      insertComponent(def.id, values);
                      onClose();
                    }}
                    className="flex-1 h-[30px] rounded-[6px] bg-(--pen) text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Insert
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function groupParams(def: ComponentDefinition) {
  const m = new Map<string, ComponentDefinition["parameters"]>();
  for (const p of def.parameters) m.set(p.group ?? "Values", [...(m.get(p.group ?? "Values") ?? []), p]);
  return [...m.entries()];
}

function instantiateBlocked(def: ComponentDefinition, values: Record<string, number>, registry: ReturnType<typeof registryFor>): boolean {
  try {
    const out = instantiateComponent({ id: "CHK", definitionId: def.id, name: def.name, values, x: 0, y: 0 }, def, registry, [], {
      units: "mm",
      annotationScale: 50,
      datumRL: 0,
      textHeight: 2.5,
      dimensionPrecision: 0,
      layerStandardId: "ir-bridge-gad",
    });
    return out.blocked;
  } catch {
    return true;
  }
}
