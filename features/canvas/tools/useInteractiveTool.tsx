"use client";

/**
 * Canvas glue for the interactive tools: owns the running session, turns
 * pointer events into picks (snapped point + shape under the cursor), shows
 * the prompt bar with its input box, and renders the rubber-band preview.
 */

import React from "react";
import type { Point, Shape, ToolId } from "@/lib/geometry/types";
import type { HatchMaterial } from "@/lib/cad/types";
import type { DrawingState } from "@/lib/state/drawingReducer";
import { applySnapping } from "@/lib/geometry/snapping";
import { hitTestShapes } from "@/lib/geometry/hitTest";
import { HATCH_MATERIALS } from "@/lib/cad/hatch";
import { INTERACTIVE_TOOLS, isInteractiveTool, runImmediate, type Pick, type ToolEnv, type ToolSession } from "./interactiveTools";

export interface InteractiveToolApi {
  active: boolean;
  onPointerDown: (world: Point, e: React.PointerEvent) => boolean;
  onPointerMove: (world: Point) => void;
  preview: React.ReactNode;
  promptBar: React.ReactNode;
}

const TOOL_TITLE: Partial<Record<ToolId, string>> = {
  text: "TEXT",
  leader: "LEADER",
  dimlinear: "DIMLINEAR",
  dimaligned: "DIMALIGNED",
  dimradius: "DIMRADIUS",
  dimangular: "DIMANGULAR",
  level: "LEVEL",
  hatch: "HATCH",
  north: "NORTH ARROW",
  flow: "FLOW ARROW",
  kilometrage: "KM DIRECTION",
  section: "SECTION MARK",
  revcloud: "REVCLOUD",
  offset: "OFFSET",
  trim: "TRIM",
  extend: "EXTEND",
  break: "BREAK",
  fillet: "FILLET",
  mirror: "MIRROR",
  copy: "COPY",
  rotate: "ROTATE",
  scale: "SCALE",
  array: "ARRAY",
};

export function useInteractiveTool(
  state: DrawingState,
  dispatch: (a: unknown) => void,
  setTool: (t: ToolId) => void
): InteractiveToolApi {
  const sessionRef = React.useRef<ToolSession | null>(null);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const [toast, setToast] = React.useState<{ text: string; tone: "ok" | "error" | "info" } | null>(null);
  const [hatchMaterial, setHatchMaterial] = React.useState<HatchMaterial>("concrete");
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const env: ToolEnv = React.useMemo(
    () => ({
      shapes: state.shapes,
      cad: state.cad,
      selectedIds: state.selectedIds,
      scale: state.viewport.scale,
      hatchMaterial,
      dispatch,
      notify: (text, tone) => setToast({ text, tone }),
    }),
    [state.shapes, state.cad, state.selectedIds, state.viewport.scale, hatchMaterial, dispatch]
  );

  // Start or stop a session as the tool changes.
  React.useEffect(() => {
    if (state.tool === "join" || state.tool === "explode") {
      runImmediate(state.tool, env);
      setTool("select");
      return;
    }
    if (isInteractiveTool(state.tool)) {
      sessionRef.current = INTERACTIVE_TOOLS[state.tool]();
      setValue(sessionRef.current.input()?.initial ?? "");
    } else {
      sessionRef.current = null;
    }
    bump();
    // env intentionally excluded: a new session per tool, not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tool]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sessionRef.current) {
        sessionRef.current = null;
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTool]);

  const makePick = React.useCallback(
    (world: Point): Pick => {
      const snap = applySnapping(world, {
        gridSnapEnabled: state.gridSnapEnabled,
        objectSnapEnabled: state.objectSnapEnabled,
        shapes: state.shapes,
        zoomScale: state.viewport.scale,
        vertexThresholdPx: 16,
      });
      const hit = hitTestShapes(state.shapes, world, 8 / state.viewport.scale) as Shape | null;
      return { point: snap.point, raw: world, hit, snapped: snap.snapped };
    },
    [state.gridSnapEnabled, state.objectSnapEnabled, state.shapes, state.viewport.scale]
  );

  const finishIfDone = () => {
    const s = sessionRef.current;
    if (s?.finished()) {
      sessionRef.current = null;
      setTool("select");
    }
  };

  const onPointerDown = React.useCallback(
    (world: Point, e: React.PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.button !== 0) return false;
      s.click(makePick(world), env);
      const inp = s.input();
      setValue(inp?.initial ?? "");
      finishIfDone();
      bump();
      if (inp) setTimeout(() => inputRef.current?.focus(), 0);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [env, makePick]
  );

  const onPointerMove = React.useCallback(
    (world: Point) => {
      const s = sessionRef.current;
      if (!s) return;
      s.move(makePick(world), env);
      bump();
    },
    [env, makePick]
  );

  const session = sessionRef.current;
  const scale = state.viewport.scale;
  const preview = session ? (
    <g pointerEvents="none">
      {session.preview(env).map((p, i) =>
        p.k === "line" ? (
          <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#38bdf8" strokeWidth={1.2 / scale} strokeDasharray={`${6 / scale} ${4 / scale}`} />
        ) : null
      )}
    </g>
  ) : null;

  const input = session?.input() ?? null;
  const submit = () => {
    if (!session) return;
    session.submit(value, env);
    const next = session.input();
    setValue(next?.initial ?? "");
    finishIfDone();
    bump();
  };

  const promptBar =
    session || toast ? (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none">
        {session && (
          <div className="pointer-events-auto flex items-center gap-2 h-[34px] pl-2.5 pr-1.5 rounded-[7px] bg-(--ink-panel)/95 border border-(--rule-strong) shadow-lg backdrop-blur-sm text-[11.5px]">
            <span className="font-mono text-[10.5px] font-semibold text-(--pen) tracking-wide">{TOOL_TITLE[state.tool] ?? state.tool.toUpperCase()}</span>
            <span className="text-(--fg-secondary)">{session.prompt()}</span>
            {state.tool === "hatch" && (
              <select
                aria-label="Hatch material"
                value={hatchMaterial}
                onChange={(e) => setHatchMaterial(e.target.value as HatchMaterial)}
                className="h-[24px] rounded-[5px] bg-(--ink-raised) border border-(--rule) text-[11px] px-1 text-(--fg-primary)"
              >
                {(Object.keys(HATCH_MATERIALS) as HatchMaterial[]).map((m) => (
                  <option key={m} value={m}>
                    {HATCH_MATERIALS[m].label}
                  </option>
                ))}
              </select>
            )}
            {input && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="flex items-center gap-1"
              >
                <input
                  ref={inputRef}
                  autoFocus
                  aria-label={input.label}
                  value={value}
                  placeholder={input.placeholder ?? input.label}
                  inputMode={input.kind === "number" ? "decimal" : "text"}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      sessionRef.current = null;
                      setTool("select");
                    }
                    e.stopPropagation();
                  }}
                  className="h-[24px] w-[180px] rounded-[5px] bg-(--ink-raised) border border-(--rule) focus:border-(--pen) outline-none px-2 text-[11.5px] text-(--fg-primary)"
                />
                <button type="submit" className="h-[24px] px-2 rounded-[5px] bg-(--pen) text-white text-[11px] font-medium cursor-pointer">
                  Enter
                </button>
              </form>
            )}
            <button
              onClick={() => {
                sessionRef.current = null;
                setTool("select");
              }}
              className="h-[24px] px-2 rounded-[5px] text-(--fg-muted) hover:text-(--fg-primary) hover:bg-(--ink-raised) text-[11px] cursor-pointer"
              title="Finish (Esc)"
            >
              Done
            </button>
          </div>
        )}
        {toast && (
          <div
            role="status"
            className={`pointer-events-auto max-w-[560px] px-3 py-1.5 rounded-[6px] text-[11.5px] shadow-md border ${
              toast.tone === "error" ? "bg-(--crit-soft) border-(--crit) text-(--crit)" : toast.tone === "ok" ? "bg-(--ok-soft) border-(--ok) text-(--ok)" : "bg-(--ink-panel) border-(--rule) text-(--fg-secondary)"
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>
    ) : null;

  return { active: !!session, onPointerDown, onPointerMove, preview, promptBar };
}
