"use client";

/**
 * Layer properties manager: name, colour, line type, lineweight, on/off,
 * freeze, lock, plot — plus how many entities each layer holds, and the
 * drawing settings that go with plotting (annotation scale, datum).
 */

import React from "react";
import { Plus, Trash2, Printer, Eye, EyeOff, Lock, Unlock, Snowflake, Sun, Check } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import type { LineType } from "@/lib/cad/types";
import { layerInk } from "@/features/canvas/ShapeRenderer";
import { PanelBody } from "./DraftPanel";

const LINE_TYPES: LineType[] = ["continuous", "hidden", "center", "phantom", "dashdot", "dotted"];
const WEIGHTS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0];

export function LayerPanel() {
  const { state, dispatch } = useDrawing();
  const cad = state.cad;
  const [name, setName] = React.useState("");

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of state.shapes) m.set(s.layerId ?? "0", (m.get(s.layerId ?? "0") ?? 0) + 1);
    for (const a of cad.annotations) m.set(a.layerId ?? "0", (m.get(a.layerId ?? "0") ?? 0) + 1);
    return m;
  }, [state.shapes, cad.annotations]);

  const iconBtn = "w-[22px] h-[22px] grid place-items-center rounded text-(--fg-muted) hover:text-(--fg-primary) hover:bg-(--ink-raised) cursor-pointer";

  return (
    <PanelBody>
      <section className="flex flex-col gap-2">
        <h3 className="label">Drawing</h3>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex flex-col gap-1 text-(--fg-muted)">
            Annotation scale
            <select
              value={cad.settings.annotationScale}
              onChange={(e) => dispatch({ type: "CAD_SET_SETTINGS", patch: { annotationScale: Number(e.target.value) } })}
              className="h-[26px] rounded-[5px] bg-(--ink-raised) border border-(--rule) px-1.5 text-(--fg-primary) font-mono"
            >
              {[20, 25, 50, 75, 100, 150, 200, 250, 500].map((s) => (
                <option key={s} value={s}>
                  1:{s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-(--fg-muted)">
            Text height (paper mm)
            <input
              type="number"
              step={0.5}
              min={1}
              value={cad.settings.textHeight}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) dispatch({ type: "CAD_SET_SETTINGS", patch: { textHeight: v } });
              }}
              className="h-[26px] rounded-[5px] bg-(--ink-raised) border border-(--rule) px-1.5 text-(--fg-primary) num"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h3 className="label">Layers</h3>
          <span className="text-[10px] text-(--fg-muted)">{cad.layers.length} layers</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            dispatch({ type: "CAD_ADD_LAYER", layer: { name }, makeCurrent: true });
            setName("");
          }}
          className="flex items-center gap-1.5"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New layer name"
            aria-label="New layer name"
            className="flex-1 h-[26px] rounded-[5px] bg-(--ink-raised) border border-(--rule) focus:border-(--pen) outline-none px-2 text-[11px] text-(--fg-primary) font-mono"
          />
          <button type="submit" className="h-[26px] px-2 rounded-[5px] bg-(--pen) text-white text-[11px] inline-flex items-center gap-1 cursor-pointer">
            <Plus className="w-3 h-3" /> Add
          </button>
        </form>
        <div className="rounded-[6px] border border-(--rule) overflow-hidden">
          {cad.layers.map((l, i) => {
            const current = l.id === cad.currentLayerId;
            return (
              <div key={l.id} className={`px-2 py-1.5 flex flex-col gap-1 ${i > 0 ? "border-t border-(--rule)" : ""} ${current ? "bg-(--pen-soft)" : ""}`}>
                <div className="flex items-center gap-1">
                  <button className={iconBtn} title="Make current" aria-label={`Make ${l.name} current`} onClick={() => dispatch({ type: "CAD_SET_CURRENT_LAYER", id: l.id })}>
                    {current ? <Check className="w-3 h-3 text-(--pen)" /> : <span className="w-2 h-2 rounded-full border border-(--rule-strong)" />}
                  </button>
                  <input
                    type="color"
                    aria-label={`${l.name} colour`}
                    value={layerInk(l.color, "dark")}
                    onChange={(e) => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { color: e.target.value } })}
                    className="w-[18px] h-[18px] rounded border-0 bg-transparent cursor-pointer p-0"
                  />
                  <span className="flex-1 min-w-0 font-mono text-[10.5px] truncate text-(--fg-primary)" title={l.description}>
                    {l.name}
                  </span>
                  <span className="num text-[9.5px] text-(--fg-muted) w-[26px] text-right">{counts.get(l.id) ?? 0}</span>
                  <button className={iconBtn} title={l.visible ? "Turn off" : "Turn on"} onClick={() => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { visible: !l.visible } })}>
                    {l.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  <button className={iconBtn} title={l.frozen ? "Thaw" : "Freeze"} onClick={() => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { frozen: !l.frozen } })}>
                    {l.frozen ? <Snowflake className="w-3 h-3 text-sky-400" /> : <Sun className="w-3 h-3" />}
                  </button>
                  <button className={iconBtn} title={l.locked ? "Unlock" : "Lock"} onClick={() => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { locked: !l.locked } })}>
                    {l.locked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  <button className={iconBtn} title={l.plot ? "Plots" : "Does not plot"} onClick={() => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { plot: !l.plot } })}>
                    <Printer className={`w-3 h-3 ${l.plot ? "" : "opacity-30"}`} />
                  </button>
                  <button
                    className={iconBtn}
                    title={l.id === "0" ? "Layer 0 cannot be deleted" : "Delete (entities move to 0)"}
                    disabled={l.id === "0"}
                    onClick={() => dispatch({ type: "CAD_DELETE_LAYER", id: l.id })}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pl-[26px]">
                  <select
                    aria-label={`${l.name} line type`}
                    value={l.lineType}
                    onChange={(e) => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { lineType: e.target.value as LineType } })}
                    className="h-[20px] rounded-[4px] bg-(--ink-raised) border border-(--rule) text-[10px] px-1 text-(--fg-secondary)"
                  >
                    {LINE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${l.name} lineweight`}
                    value={l.lineWeight}
                    onChange={(e) => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { lineWeight: Number(e.target.value) } })}
                    className="h-[20px] rounded-[4px] bg-(--ink-raised) border border-(--rule) text-[10px] px-1 text-(--fg-secondary) num"
                  >
                    {WEIGHTS.map((w) => (
                      <option key={w} value={w}>
                        {w.toFixed(2)} mm
                      </option>
                    ))}
                  </select>
                  <span className="text-[9.5px] text-(--fg-muted) truncate">{l.category}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </PanelBody>
  );
}
