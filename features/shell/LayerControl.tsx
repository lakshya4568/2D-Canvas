"use client";

/**
 * The ribbon's layer drop-down: shows the current layer, lets the draftsman
 * make another layer current, and toggles visibility, freeze and lock in place
 * — the four things AutoCAD's layer control is used for a hundred times a day.
 * With a selection, picking a layer moves the selection onto it (LAYMCH).
 */

import React from "react";
import { ChevronDown, Eye, EyeOff, Lock, Unlock, Snowflake, Sun } from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { layerInk } from "@/features/canvas/ShapeRenderer";

export function LayerControl() {
  const { state, dispatch } = useDrawing();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const cad = state.cad;
  const current = cad.layers.find((l) => l.id === cad.currentLayerId) ?? cad.layers[0];
  const theme = state.themeMode;
  const movable = state.selectedIds.filter((id) => {
    const s = state.shapes.find((x) => x.id === id);
    return (s && !s.componentInstanceId) || cad.annotations.some((a) => a.id === id && !a.componentInstanceId);
  });

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={movable.length ? `Current layer — pick one to move ${movable.length} selected onto it` : "Current layer"}
        className="h-[28px] min-w-[150px] max-w-[190px] px-2 flex items-center gap-1.5 rounded-[5px] bg-(--ink-app) border border-(--rule) hover:border-(--pen) text-[10.5px] cursor-pointer"
      >
        <span className="w-2.5 h-2.5 rounded-full border border-(--rule-strong) shrink-0" style={{ background: current ? layerInk(current.color, theme) : undefined }} />
        <span className="font-mono font-semibold truncate text-(--fg-primary)">{current?.name ?? "0"}</span>
        <span className="flex-1" />
        <ChevronDown className="w-3 h-3 text-(--fg-muted)" />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 top-[30px] z-50 w-[300px] max-h-[360px] overflow-y-auto rounded-[7px] bg-(--ink-panel) border border-(--rule-strong) shadow-xl py-1">
          {movable.length > 0 && <p className="px-2.5 py-1 text-[10px] text-(--fg-muted)">Click a layer name to move {movable.length} selected onto it.</p>}
          {cad.layers.map((l) => (
            <div key={l.id} className={`flex items-center gap-1 px-1.5 h-[26px] ${l.id === cad.currentLayerId ? "bg-(--pen-soft)" : "hover:bg-(--ink-raised)"}`}>
              <button
                title={l.visible ? "Turn off" : "Turn on"}
                aria-label={`${l.name} ${l.visible ? "on" : "off"}`}
                onClick={() => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { visible: !l.visible } })}
                className="w-[20px] h-[20px] grid place-items-center rounded text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
              >
                {l.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button
                title={l.frozen ? "Thaw" : "Freeze"}
                aria-label={`${l.name} ${l.frozen ? "frozen" : "thawed"}`}
                onClick={() => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { frozen: !l.frozen } })}
                className="w-[20px] h-[20px] grid place-items-center rounded text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
              >
                {l.frozen ? <Snowflake className="w-3 h-3 text-sky-400" /> : <Sun className="w-3 h-3" />}
              </button>
              <button
                title={l.locked ? "Unlock" : "Lock"}
                aria-label={`${l.name} ${l.locked ? "locked" : "unlocked"}`}
                onClick={() => dispatch({ type: "CAD_UPDATE_LAYER", id: l.id, patch: { locked: !l.locked } })}
                className="w-[20px] h-[20px] grid place-items-center rounded text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
              >
                {l.locked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3" />}
              </button>
              <span className="w-2.5 h-2.5 rounded-full border border-(--rule-strong) shrink-0 mx-0.5" style={{ background: layerInk(l.color, theme) }} />
              <button
                onClick={() => {
                  if (movable.length) dispatch({ type: "CAD_SET_ENTITY_LAYER", ids: movable, layerId: l.id });
                  else dispatch({ type: "CAD_SET_CURRENT_LAYER", id: l.id });
                  setOpen(false);
                }}
                className="flex-1 min-w-0 text-left font-mono text-[10.5px] truncate text-(--fg-primary) cursor-pointer"
                title={l.description}
              >
                {l.name}
              </button>
              {!l.plot && <span className="text-[9px] text-(--fg-muted)">no plot</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
