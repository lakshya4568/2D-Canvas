"use client";

/**
 * The drafting agent, as the author sees it.
 *
 * One column: what the agent is doing now at the top, what it has done below
 * that as it happens, and the brief at the bottom where a chat box sits. The
 * pen itself is on the canvas — the preview layer draws each step as it lands —
 * so this panel is the commentary, not the drawing.
 *
 * Three things it is careful to show, because each was hidden before:
 *
 *   REFUSALS. When the kernel refuses a rule or `finish` refuses the drawing,
 *   that is the agent being corrected, and the correction is the interesting
 *   part. Refused steps stay visible in amber with the reason.
 *
 *   WAITING. A 429 from Google is a wait, not a hang; the retry and its reason
 *   are shown in place.
 *
 *   THE OUTCOME, HONESTLY. "Verified and published" only when `finish`
 *   succeeded. Anything else says what is still wrong, and the drawing is kept
 *   so the next instruction can continue from it.
 */

import React from "react";
import {
  ArrowUp, Brain, Check, CircleAlert, Eye, Hourglass, ImagePlus, Loader2, PenLine,
  Ruler, Search, ShieldCheck, Sigma, Square, Undo2, Wrench, X, SlidersHorizontal, Link2, Zap,
} from "lucide-react";
import { useDrawing } from "@/lib/state/drawingContext";
import { useUpce } from "../parametric/upceContext";
import { setAgentPreview } from "../agent/agentPreview";
import { authoredOnly } from "@/lib/upce/document";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";
import { fitViewportToBounds } from "@/lib/geometry/transform";
import type { Shape } from "@/lib/geometry/types";
import type { AuthoringSketch } from "@/lib/upce/types";
import type { TemplateManifest } from "@/lib/upce/template";
import { Pill } from "./ui/Disclosure";

type Stage = "observe" | "draw" | "constrain" | "parametrize" | "meta";

interface ModelOption {
  id: string;
  label: string;
  typicalTurn: string;
}

interface Status {
  configured: boolean;
  detail: string;
  project: string | null;
  models: ModelOption[];
  defaultModel: string;
}

type Item =
  | { kind: "message"; key: string; text: string }
  | { kind: "thinking"; key: string; text: string }
  | {
      kind: "tool";
      key: string;
      name: string;
      args: Record<string, unknown>;
      stage: Stage;
      result?: { ok: boolean; text: string; image?: string };
    }
  | { kind: "retry"; key: string; text: string }
  | { kind: "sources"; key: string; sources: { title: string; uri: string }[] };

interface DoneEvent {
  status: "finished" | "incomplete" | "stopped" | "failed";
  message: string;
  summary?: string;
  state: { shapes: Shape[]; sketch: AuthoringSketch };
  manifest?: TemplateManifest;
  check: string;
  turns: number;
  toolCalls: number;
  elapsedMs: number;
}

const PHASES: { id: string; label: string }[] = [
  { id: "understand", label: "Understand" },
  { id: "draw", label: "Draw" },
  { id: "constrain", label: "Constrain" },
  { id: "parametrize", label: "Parametrize" },
  { id: "verify", label: "Verify" },
];

function phaseOf(name: string, stage: Stage): string {
  if (name === "check" || name === "flex_test" || name === "finish") return "verify";
  if (stage === "draw") return "draw";
  if (stage === "constrain") return "constrain";
  if (stage === "parametrize") return "parametrize";
  return "";
}

const EXAMPLES = [
  "Reconstruct the attached drawing as a clean parametric model",
  "RCC box culvert: clear span 10700, clear height 4000, walls 350, top and bottom slabs 800, 600×600 haunches, 4000 mm earth cushion above",
  "Two-cell box culvert, each cell 3000 wide × 2500 high, walls and slabs 300, 150 haunches",
  "Steel base plate 400 × 250 with four 22 mm holes 50 mm in from each edge",
];

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** A tool call in the author's words. */
function describe(name: string, a: Record<string, unknown>): string {
  switch (name) {
    case "look": return "Read the drawing";
    case "view": return "Looked at the drawing";
    case "draw_line": return `Drew ${a.construction ? "construction line" : "line"} ${s(a.name)}`;
    case "draw_polyline": return `Drew outline ${s(a.name)}`;
    case "draw_rectangle": return `Drew rectangle ${s(a.name)}`;
    case "draw_circle": return `Drew circle ${s(a.name)}`;
    case "chamfer": return `Cut corner ${s(a.corner)} (${s(a.leg)}${a.leg2 ? ` × ${s(a.leg2)}` : ""})`;
    case "offset": return `Offset ${s(a.target)} ${s(a.distance)} ${s(a.side)}`;
    case "trim": return `Trimmed ${s(a.line)} to ${s(a.to)}`;
    case "split": return `Split ${s(a.line)}`;
    case "move": return `Moved ${(a.targets as string[] | undefined)?.join(", ") ?? ""}`;
    case "copy": return `Copied ${(a.targets as string[] | undefined)?.join(", ") ?? ""}`;
    case "mirror": return `Mirrored ${(a.targets as string[] | undefined)?.join(", ") ?? ""}`;
    case "rotate": return `Rotated ${(a.targets as string[] | undefined)?.join(", ") ?? ""} ${s(a.angle)}°`;
    case "delete": return `Deleted ${(a.targets as string[] | undefined)?.join(", ") ?? ""}`;
    case "explode": return `Exploded ${s(a.target)}`;
    case "rename": return `Renamed ${s(a.target)}`;
    case "rule": return `Rule: ${s(a.kind)} ${s(a.a)}${a.b ? ` · ${s(a.b)}` : ""}${a.about ? ` about ${s(a.about)}` : ""}`;
    case "auto_rules": return `Accepted detected ${((a.kinds as string[] | undefined) ?? []).join(", ")}`;
    case "remove_rule": return "Removed a rule";
    case "dimension": return `Named ${s(a.name)} — ${s(a.what)}${a.value !== undefined ? ` = ${s(a.value)}` : ""}`;
    case "formula": return `${s(a.name)} = ${s(a.expression)}`;
    case "set_value": return `Set ${s(a.name)} = ${s(a.value)}`;
    case "describe_value": return `Described ${s(a.name)}`;
    case "rename_value": return `Renamed ${s(a.from)} → ${s(a.to)}`;
    case "suggestions": return "Asked the kernel what is still free";
    case "accept_suggestion": return "Accepted a kernel suggestion";
    case "unit": return `Grouped unit ${s(a.name)}`;
    case "repeat": return `Repeated ${s(a.unit)} × ${s(a.count)}`;
    case "check": return "Verified the drawing";
    case "flex_test": return `Stress-tested ${a.name ? s(a.name) : "every value"}`;
    case "calculate": return `Calculated ${s(a.expression)}`;
    case "research": return `Searched: ${s(a.question)}`;
    case "define_tool": return `Created tool ${s(a.name)}`;
    case "finish": return "Asked to finish";
    default: return name.startsWith("macro_") ? `Used its tool ${name.slice(6)}` : name;
  }
}

function StageIcon({ stage, name }: { stage: Stage; name: string }) {
  const cls = "w-[11px] h-[11px] shrink-0";
  if (name === "view") return <Eye className={cls} strokeWidth={2.2} />;
  if (name === "research") return <Search className={cls} strokeWidth={2.2} />;
  if (name === "check" || name === "flex_test" || name === "finish") return <ShieldCheck className={cls} strokeWidth={2.2} />;
  if (stage === "draw") return <PenLine className={cls} strokeWidth={2.2} />;
  if (stage === "constrain") return <Link2 className={cls} strokeWidth={2.2} />;
  if (stage === "parametrize") return name === "formula" ? <Sigma className={cls} strokeWidth={2.2} /> : <Ruler className={cls} strokeWidth={2.2} />;
  return <Wrench className={cls} strokeWidth={2.2} />;
}

/** Thought summaries arrive as light markdown; show them as plain text. */
const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "").trim();

function ToolRow({ item }: { item: Extract<Item, { kind: "tool" }> }) {
  const [open, setOpen] = React.useState(false);
  const pending = !item.result;
  const refused = item.result && !item.result.ok;
  const firstLine = item.result?.text.split("\n")[0] ?? "";
  return (
    <div
      className={`rounded-[6px] border px-2 py-1.5 ${
        refused ? "border-(--warn) bg-(--warn-soft)" : "border-(--rule) bg-(--ink-raised)"
      }`}
    >
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-1.5 text-left cursor-pointer" aria-expanded={open}>
        <span className={refused ? "text-(--warn)" : "text-(--pen)"}>
          <StageIcon stage={item.stage} name={item.name} />
        </span>
        <span className="flex-1 min-w-0 text-[11px] text-(--fg-primary) truncate">{describe(item.name, item.args)}</span>
        {pending ? (
          <Loader2 className="w-[11px] h-[11px] text-(--fg-muted) animate-spin motion-reduce:animate-none" strokeWidth={2.2} />
        ) : refused ? (
          <CircleAlert className="w-[11px] h-[11px] text-(--warn)" strokeWidth={2.2} />
        ) : (
          <Check className="w-[11px] h-[11px] text-(--ok)" strokeWidth={2.6} />
        )}
      </button>
      {item.result && (refused || open || item.name === "finish") && (
        <p className="mt-1 text-[10.5px] leading-[1.5] text-(--fg-secondary) whitespace-pre-wrap">
          {open ? item.result.text : refused ? item.result.text : firstLine}
        </p>
      )}
      {item.result && !refused && !open && item.name !== "finish" && firstLine && item.name !== "view" && (
        <p className="mt-0.5 text-[10px] leading-[1.45] text-(--fg-muted) truncate">{firstLine}</p>
      )}
      {item.result?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${item.result.image}`}
          alt="What the agent saw when it looked at the drawing"
          className="mt-1.5 w-full rounded-[4px] border border-(--rule) bg-white"
        />
      )}
      {open && (
        <pre className="mt-1 max-h-[160px] overflow-auto text-[9.5px] leading-[1.4] text-(--fg-muted) bg-(--ink-sunken) rounded-[4px] p-1.5 whitespace-pre-wrap">
          {JSON.stringify(item.args, null, 1)}
        </pre>
      )}
    </div>
  );
}

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  const clean = plain(text);
  const title = clean.split("\n")[0].slice(0, 80);
  return (
    <div className="rounded-[6px] border border-dashed border-(--rule) px-2 py-1">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-1.5 text-left cursor-pointer" aria-expanded={open}>
        <Brain className="w-[11px] h-[11px] text-(--fg-muted) shrink-0" strokeWidth={2.2} />
        <span className="flex-1 min-w-0 text-[10.5px] text-(--fg-muted) truncate">{title || "Reasoning"}</span>
      </button>
      {open && <p className="mt-1 text-[10.5px] leading-[1.55] text-(--fg-secondary) whitespace-pre-wrap">{clean}</p>}
    </div>
  );
}

function PhaseTrack({ reached, current, running }: { reached: Set<string>; current: string; running: boolean }) {
  return (
    <div className="flex items-center gap-1" aria-label="Progress">
      {PHASES.map((p, i) => {
        const on = reached.has(p.id);
        const now = running && current === p.id;
        return (
          <React.Fragment key={p.id}>
            {i > 0 && <span className={`h-px flex-1 min-w-[4px] ${on ? "bg-(--pen)" : "bg-(--rule)"}`} />}
            <span
              className={`text-[9.5px] px-1.5 h-[18px] inline-flex items-center rounded-[4px] whitespace-nowrap ${
                now
                  ? "bg-(--pen) text-white"
                  : on
                    ? "bg-(--pen-soft) text-(--pen)"
                    : "text-(--fg-muted)"
              }`}
            >
              {p.label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

async function readImage(file: File): Promise<{ name: string; data: string; mimeType: string }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  // Very large scans cost tokens and add nothing a 2400 px image does not show.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
  const MAX = 2400;
  if (Math.max(img.width, img.height) <= MAX) {
    return { name: file.name, data: url.split(",")[1], mimeType: file.type || "image/png" };
  }
  const k = MAX / Math.max(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k);
  canvas.height = Math.round(img.height * k);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { name: file.name, data: canvas.toDataURL("image/png").split(",")[1], mimeType: "image/png" };
}

const MODEL_KEY = "drafter.model";

export function DrafterPanel({ onViewFormulas }: { onViewFormulas?: () => void } = {}) {
  const { state, dispatch } = useDrawing();
  const upce = useUpce();
  const [status, setStatus] = React.useState<Status | null>(null);
  const [model, setModel] = React.useState<string>("");
  const [prompt, setPrompt] = React.useState("");
  const [images, setImages] = React.useState<{ name: string; data: string; mimeType: string }[]>([]);
  const [items, setItems] = React.useState<Item[]>([]);
  const [running, setRunning] = React.useState(false);
  const [phase, setPhase] = React.useState("understand");
  const [reached, setReached] = React.useState<Set<string>>(new Set());
  const [values, setValues] = React.useState<{ name: string; value: number; role: string; unit: string }[]>([]);
  const [dof, setDof] = React.useState<number | null>(null);
  const [done, setDone] = React.useState<DoneEvent | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [cacheStats, setCacheStats] = React.useState<{
    cachedTokens: number;
    promptTokens: number;
    savedUsd: number;
    cacheHitRate: number;
  } | null>(null);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [dragOver, setDragOver] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const lastShapes = React.useRef<Map<string, string>>(new Map());
  // What the sheet held before the run, so the run can be taken back whole.
  const before = React.useRef<{ shapes: Shape[]; sketch: AuthoringSketch } | null>(null);
  const latestSnapshotRef = React.useRef<{ shapes: Shape[]; sketch?: AuthoringSketch } | null>(null);
  const fitted = React.useRef<string>("");

  const authored = React.useMemo(() => authoredOnly(state.shapes), [state.shapes]);
  const hasDrawing = authored.length > 0;

  React.useEffect(() => {
    fetch("/api/ai/drafter")
      .then((r) => r.json())
      .then((j: Status) => {
        setStatus(j);
        let saved = "";
        try {
          saved = window.localStorage.getItem(MODEL_KEY) ?? "";
        } catch {
          /* preference only */
        }
        setModel(j.models.some((m) => m.id === saved) ? saved : j.defaultModel);
      })
      .catch(() => setStatus({ configured: false, detail: "Could not reach the server.", project: null, models: [], defaultModel: "" }));
  }, []);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, done]);

  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  React.useEffect(() => () => {
    if (abortRef.current) {
      abortRef.current.abort();
      setAgentPreview(null);
    }
  }, []);

  const chooseModel = (id: string) => {
    setModel(id);
    try {
      window.localStorage.setItem(MODEL_KEY, id);
    } catch {
      /* preference only */
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    const read = await Promise.all(list.map(readImage));
    setImages((prev) => [...prev, ...read].slice(0, 4));
  };

  const frame = React.useCallback(
    (shapes: Shape[]) => {
      const b = computeMultiShapeBounds(shapes);
      if (!b) return;
      const key = [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v / 500)).join(",");
      if (key === fitted.current) return;
      fitted.current = key;
      dispatch({ type: "SET_VIEWPORT", viewport: fitViewportToBounds(b, state.canvasSize.width, state.canvasSize.height, 0.12) });
    },
    [dispatch, state.canvasSize.width, state.canvasSize.height]
  );

  const handle = React.useCallback(
    (e: Record<string, unknown> & { type: string }, mutatedRef: { current: boolean }) => {
      switch (e.type) {
        case "thinking":
          setItems((p) => [...p, { kind: "thinking", key: `th${p.length}`, text: String(e.text) }]);
          break;
        case "message":
          setItems((p) => [...p, { kind: "message", key: `m${p.length}`, text: String(e.text) }]);
          break;
        case "tool": {
          const stage = e.stage as Stage;
          const ph = phaseOf(String(e.name), stage);
          if (ph) {
            setPhase(ph);
            setReached((r) => new Set([...r, "understand", ph]));
          } else {
            setReached((r) => new Set([...r, "understand"]));
          }
          setItems((p) => [
            ...p,
            { kind: "tool", key: String(e.id), name: String(e.name), args: (e.args as Record<string, unknown>) ?? {}, stage },
          ]);
          break;
        }
        case "result":
          setItems((p) =>
            p.map((it) =>
              it.kind === "tool" && it.key === e.id
                ? { ...it, result: { ok: Boolean(e.ok), text: String(e.text), image: e.image as string | undefined } }
                : it
            )
          );
          break;
        case "retry":
          setItems((p) => [
            ...p,
            { kind: "retry", key: `r${p.length}`, text: `${String(e.reason)} — waiting ${e.waitSeconds} s, then retrying (attempt ${e.attempt}).` },
          ]);
          break;
        case "sources":
          setItems((p) => [...p, { kind: "sources", key: `s${p.length}`, sources: e.sources as { title: string; uri: string }[] }]);
          break;
        case "snapshot": {
          mutatedRef.current = true;
          const shapes = e.shapes as Shape[];
          const next = new Map(shapes.map((sh) => [sh.id, JSON.stringify(sh)]));
          const changed = shapes.filter((sh) => lastShapes.current.get(sh.id) !== next.get(sh.id)).map((sh) => sh.id);
          lastShapes.current = next;
          latestSnapshotRef.current = { shapes, sketch: e.sketch as AuthoringSketch | undefined };
          setAgentPreview({ shapes, lastIds: changed, running: true });
          setValues(e.values as typeof values);
          setDof(e.dof as number);
          frame(shapes);
          break;
        }
        case "usage": {
          const cached = Number(e.cachedTokens ?? 0);
          const prompt = Number(e.promptTokens ?? 0);
          const saved = Number(e.savedUsd ?? 0);
          const hitRate = Number(e.cacheHitRate ?? 0);
          if (cached > 0 || saved > 0 || hitRate > 0) {
            setCacheStats((prev) => ({
              cachedTokens: (prev?.cachedTokens ?? 0) + cached,
              promptTokens: (prev?.promptTokens ?? 0) + prompt,
              savedUsd: (prev?.savedUsd ?? 0) + saved,
              cacheHitRate: hitRate > 0 ? hitRate : prev?.cacheHitRate ?? 0,
            }));
          }
          break;
        }
        case "done":
          setDone(e as unknown as DoneEvent);
          break;
        case "error":
          setError(String(e.message));
          break;
      }
    },
    [frame]
  );

  const run = async (text?: string) => {
    const brief = (text ?? prompt).trim();
    if ((!brief && images.length === 0) || running) return;
    setItems([]);
    setDone(null);
    setError(null);
    setCacheStats(null);
    setValues([]);
    setDof(null);
    setPhase("understand");
    setReached(new Set(["understand"]));
    setRunning(true);
    setStartedAt(Date.now());
    lastShapes.current = new Map(authored.map((sh) => [sh.id, JSON.stringify(sh)]));
    latestSnapshotRef.current = null;
    fitted.current = "";
    before.current = { shapes: authored, sketch: upce.sketch };
    if (hasDrawing) setAgentPreview({ shapes: authored, lastIds: [], running: true });

    const controller = new AbortController();
    abortRef.current = controller;
    const mutated = { current: false };
    let finalEvent: DoneEvent | null = null;

    try {
      const res = await fetch("/api/ai/drafter", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          prompt: brief,
          images: images.map((i) => ({ data: i.data, mimeType: i.mimeType })),
          model,
          state: hasDrawing
            ? { shapes: authored, sketch: upce.started ? upce.sketch : undefined, title: upce.sketch.meta.name }
            : undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `The server answered ${res.status}.`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "done") finalEvent = event;
          handle(event, mutated);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      abortRef.current = null;
      setAgentPreview(null);
      const fallbackSnap = latestSnapshotRef.current as { shapes: Shape[]; sketch?: AuthoringSketch } | null;
      if (finalEvent && mutated.current && finalEvent.state.shapes.length > 0) {
        upce.adoptDrawing(finalEvent.state.shapes, finalEvent.state.sketch);
        setTimeout(() => dispatch({ type: "ZOOM_EXTENTS" }), 60);
      } else if (!finalEvent && mutated.current && fallbackSnap && fallbackSnap.shapes.length > 0) {
        upce.adoptDrawing(fallbackSnap.shapes, fallbackSnap.sketch ?? upce.sketch);
        setTimeout(() => dispatch({ type: "ZOOM_EXTENTS" }), 60);
      }
      if (!text) setPrompt("");
      setImages([]);
    }
  };

  const stop = () => abortRef.current?.abort();

  const configured = status?.configured ?? false;
  const elapsed = startedAt ? Math.round(((running ? now : done ? startedAt + done.elapsedMs : now) - startedAt) / 1000) : 0;
  const driving = values.filter((v) => v.role === "DRIVING");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Model and connection */}
      <div className="px-3 py-2 border-b border-(--rule) flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <label htmlFor="drafter-model" className="text-[10px] text-(--fg-muted) shrink-0">
            Model
          </label>
          <select
            id="drafter-model"
            value={model}
            onChange={(e) => chooseModel(e.target.value)}
            disabled={running || !status}
            className="flex-1 min-w-0 h-[24px] px-1.5 text-[11px] rounded-[5px] bg-(--ink-raised) border border-(--rule) text-(--fg-primary) outline-none focus:border-(--pen) disabled:opacity-60"
          >
            {(status?.models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.typicalTurn})
              </option>
            ))}
          </select>
          {status && (configured ? <Pill tone="good">ready</Pill> : <Pill tone="attention">off</Pill>)}
        </div>
        {status && !configured && <p className="text-[10px] leading-[1.45] text-(--warn)">{status.detail}</p>}
        {status?.project && configured && (
          <p className="text-[9.5px] text-(--fg-muted) truncate" title={status.detail}>
            Google Cloud project {status.project}
          </p>
        )}
      </div>

      {/* Now */}
      {(running || done) && (
        <div className="px-3 py-2 border-b border-(--rule) flex flex-col gap-1.5">
          <PhaseTrack reached={reached} current={phase} running={running} />
          <div className="flex items-center gap-2 text-[10px] text-(--fg-muted)">
            {running ? (
              <span className="inline-flex items-center gap-1 text-(--pen)">
                <Loader2 className="w-[10px] h-[10px] animate-spin motion-reduce:animate-none" strokeWidth={2.4} />
                working
              </span>
            ) : (
              <span>done</span>
            )}
            <span className="num tabular-nums">{elapsed}s</span>
            <span className="num tabular-nums">{items.filter((i) => i.kind === "tool").length} steps</span>
            {dof !== null && (
              <span className={`num tabular-nums ${dof === 0 ? "text-(--ok)" : ""}`}>
                {dof === 0 ? "fully defined" : `${dof} free`}
              </span>
            )}
            {cacheStats && cacheStats.cachedTokens > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[9px]"
                title={`Prompt caching: ${cacheStats.cachedTokens.toLocaleString()} tokens cached (${Math.round(cacheStats.cacheHitRate * 100)}% hit rate), saved $${cacheStats.savedUsd.toFixed(4)}`}
              >
                <Zap className="w-[9px] h-[9px]" />
                {cacheStats.cachedTokens >= 1000 ? `${(cacheStats.cachedTokens / 1000).toFixed(1)}k` : cacheStats.cachedTokens} cached ({Math.round(cacheStats.cacheHitRate * 100)}%) · saved ${cacheStats.savedUsd >= 0.01 ? cacheStats.savedUsd.toFixed(3) : cacheStats.savedUsd.toFixed(4)}
              </span>
            )}
            <span className="flex-1" />
            {running && (
              <button
                onClick={stop}
                className="h-[20px] px-1.5 rounded-[4px] border border-(--rule) text-(--fg-secondary) hover:border-(--crit) hover:text-(--crit) inline-flex items-center gap-1 cursor-pointer"
              >
                <Square className="w-[9px] h-[9px]" strokeWidth={2.4} />
                Stop
              </button>
            )}
          </div>
          {driving.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {driving.slice(0, 12).map((v) => (
                <span key={v.name} className="text-[9.5px] px-1.5 py-0.5 rounded-[3px] bg-(--pen-soft) text-(--pen) font-mono">
                  {v.name} {Math.round(v.value * 10) / 10}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 flex flex-col gap-1.5">
        {items.length === 0 && !running && !done && !error && (
          <div className="flex flex-col gap-2">
            <p className="text-[10.5px] leading-[1.55] text-(--fg-muted)">
              Describe a drawing, or attach a reference image. The agent draws it on the sheet, adds the rules and named
              values, checks that it holds when the values change, and fixes what does not. Finished drawings open in Run
              Mode.{hasDrawing ? " It will continue from the drawing on the sheet." : ""}
            </p>
            <div className="flex flex-col gap-1">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  onClick={() => setPrompt(q)}
                  className="text-left px-2 py-1.5 rounded-[5px] border border-(--rule) text-[10.5px] leading-[1.4] text-(--fg-secondary) hover:border-(--pen) hover:text-(--fg-primary) cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((it) => {
          if (it.kind === "tool") return <ToolRow key={it.key} item={it} />;
          if (it.kind === "thinking") return <Thinking key={it.key} text={it.text} />;
          if (it.kind === "retry")
            return (
              <div key={it.key} className="rounded-[6px] border border-(--warn) bg-(--warn-soft) px-2 py-1.5 flex gap-1.5">
                <Hourglass className="w-[11px] h-[11px] mt-[2px] text-(--warn) shrink-0" strokeWidth={2.2} />
                <p className="text-[10.5px] leading-[1.45] text-(--fg-primary)">{it.text}</p>
              </div>
            );
          if (it.kind === "sources")
            return (
              <div key={it.key} className="pl-4 flex flex-col gap-0.5">
                {it.sources.slice(0, 4).map((src) => (
                  <a key={src.uri} href={src.uri} target="_blank" rel="noreferrer" className="text-[10px] text-(--pen) truncate hover:underline">
                    {src.title || src.uri}
                  </a>
                ))}
              </div>
            );
          return (
            <p key={it.key} className="text-[11px] leading-[1.55] text-(--fg-primary) whitespace-pre-wrap">
              {plain(it.text)}
            </p>
          );
        })}

        {running && items.length === 0 && (
          <p className="text-[10.5px] text-(--fg-muted) inline-flex items-center gap-1.5">
            <Loader2 className="w-[11px] h-[11px] animate-spin motion-reduce:animate-none" strokeWidth={2.2} />
            Reading the brief{images.length ? " and the reference" : ""}…
          </p>
        )}

        {done && (
          <Outcome
            done={done}
            onContinue={(t) => setPrompt(t)}
            onViewFormulas={onViewFormulas}
            onUndo={
              before.current && done.state.shapes.length > 0
                ? () => {
                    const prev = before.current!;
                    upce.adoptDrawing(prev.shapes, prev.sketch);
                    setDone(null);
                    setItems([]);
                  }
                : undefined
            }
          />
        )}

        {error && (
          <div className="rounded-[6px] border border-(--crit) bg-(--crit-soft) px-2.5 py-2">
            <p className="text-[10.5px] leading-[1.5] text-(--fg-primary)">{error}</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Brief */}
      <div
        className={`border-t px-3 py-2 flex flex-col gap-1.5 ${dragOver ? "border-(--pen) bg-(--pen-soft)" : "border-(--rule)"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        {images.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name}
                  className="h-[44px] w-[64px] object-cover rounded-[4px] border border-(--rule)"
                />
                <button
                  onClick={() => setImages((p) => p.filter((_, k) => k !== i))}
                  aria-label={`Remove ${img.name}`}
                  className="absolute -top-1.5 -right-1.5 w-[16px] h-[16px] rounded-full bg-(--ink-panel) border border-(--rule) grid place-items-center text-(--fg-muted) hover:text-(--crit) cursor-pointer"
                >
                  <X className="w-[9px] h-[9px]" strokeWidth={2.6} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
          rows={3}
          disabled={!configured}
          placeholder={
            !configured
              ? "Google Cloud is not configured"
              : hasDrawing
                ? "What should change? e.g. make the walls 450 and add a second cell"
                : "Describe the drawing, or paste / drop a reference image"
          }
          className="w-full resize-none px-2 py-1.5 text-[11px] leading-[1.45] rounded-[5px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary) disabled:opacity-50"
        />
        <div className="flex items-center gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={running}
            className="h-[26px] px-2 rounded-[5px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:border-(--pen) hover:text-(--fg-primary) inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <ImagePlus className="w-[12px] h-[12px]" strokeWidth={2} />
            Reference
          </button>
          <span className="flex-1 text-[9.5px] text-(--fg-muted) truncate">
            {hasDrawing ? `continues from ${authored.length} shapes on the sheet` : "starts on an empty sheet"}
          </span>
          <button
            onClick={() => void run()}
            disabled={running || !configured || (!prompt.trim() && images.length === 0)}
            aria-label="Start drawing"
            className="h-[26px] px-2.5 rounded-[5px] bg-(--pen) text-white text-[10.5px] font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowUp className="w-[12px] h-[12px]" strokeWidth={2.4} />
            Draw
          </button>
        </div>
      </div>
    </div>
  );
}

function Outcome({
  done,
  onContinue,
  onViewFormulas,
  onUndo,
}: {
  done: DoneEvent;
  onContinue: (text: string) => void;
  onViewFormulas?: () => void;
  onUndo?: () => void;
}) {
  const { dispatch } = useDrawing();
  const upce = useUpce();
  const finished = done.status === "finished";
  const tone =
    finished ? "border-(--ok) bg-(--ok-soft)" : done.status === "failed" ? "border-(--crit) bg-(--crit-soft)" : "border-(--warn) bg-(--warn-soft)";
  const title = finished
    ? "Verified and published"
    : done.status === "incomplete"
      ? "Not finished yet"
      : done.status === "stopped"
        ? "Stopped"
        : "The agent could not continue";
  const manifest = done.manifest;

  return (
    <div className={`rounded-[7px] border px-2.5 py-2 flex flex-col gap-1.5 ${tone}`}>
      <div className="flex items-center gap-1.5">
        {finished ? (
          <ShieldCheck className="w-[13px] h-[13px] text-(--ok)" strokeWidth={2.2} />
        ) : (
          <CircleAlert className="w-[13px] h-[13px] text-(--warn)" strokeWidth={2.2} />
        )}
        <span className="text-[11.5px] font-medium text-(--fg-primary)">{title}</span>
        <span className="flex-1" />
        <span className="text-[9.5px] text-(--fg-muted) num tabular-nums">
          {done.toolCalls} steps · {Math.round(done.elapsedMs / 1000)}s
        </span>
      </div>
      <p className="text-[10.5px] leading-[1.5] text-(--fg-secondary)">{done.summary ? plain(done.summary) : done.message}</p>

      {manifest && manifest.driving.length > 0 && (
        <div className="rounded-[5px] border border-(--rule) bg-(--ink-raised) overflow-hidden">
          {[...manifest.driving, ...manifest.derived].map((d, i) => (
            <div key={d.name} className={`flex items-center justify-between gap-2 px-2 h-[24px] ${i ? "border-t border-(--rule)" : ""}`}>
              <span className="text-[10.5px] text-(--fg-secondary) truncate">{d.name}</span>
              <span className="text-[10.5px] num tabular-nums text-(--fg-primary)">
                {Math.round(d.value * 10) / 10}
                <span className="text-(--fg-muted) ml-1">{manifest.derived.includes(d) ? "worked out" : d.unit}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!finished && done.check && (
        <details>
          <summary className="text-[10px] text-(--fg-muted) cursor-pointer">What is still wrong</summary>
          <pre className="mt-1 text-[9.5px] leading-[1.45] whitespace-pre-wrap text-(--fg-secondary)">{done.check}</pre>
        </details>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {finished && (
          <button
            onClick={() => dispatch({ type: "SET_USER_MODE", mode: "user" })}
            className="h-[24px] px-2 rounded-[5px] bg-(--ok) text-white text-[10.5px] font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="w-[11px] h-[11px]" strokeWidth={2.2} />
            Try it in Run Mode
          </button>
        )}
        <button
          onClick={() => dispatch({ type: "SET_USER_MODE", mode: "author" })}
          className="h-[24px] px-2 rounded-[5px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:text-(--fg-primary) cursor-pointer"
        >
          See rules in Author
        </button>
        {onViewFormulas && (
          <button
            onClick={onViewFormulas}
            className="h-[24px] px-2 rounded-[5px] border border-(--pen)/40 bg-(--pen-soft) text-[10.5px] text-(--pen) font-medium hover:bg-(--pen) hover:text-white inline-flex items-center gap-1 cursor-pointer transition-colors"
            title="Inspect formulas created in this drawing"
          >
            <Sigma className="w-[11px] h-[11px]" strokeWidth={2.2} />
            <span>
              Formulas
              {Object.values(upce.sketch.parameters).filter(
                (p) => p.role === "DERIVED" || (p.expr && p.expr.trim().length > 0)
              ).length > 0
                ? ` (${
                    Object.values(upce.sketch.parameters).filter(
                      (p) => p.role === "DERIVED" || (p.expr && p.expr.trim().length > 0)
                    ).length
                  })`
                : ""}
            </span>
          </button>
        )}
        {!finished && done.status !== "failed" && (
          <button
            onClick={() => onContinue("Continue: fix what is still wrong, verify, and finish.")}
            className="h-[24px] px-2 rounded-[5px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:text-(--fg-primary) cursor-pointer"
          >
            Keep working
          </button>
        )}
        {onUndo && (
          <button
            onClick={onUndo}
            title="Put the sheet back as it was before this run"
            className="h-[24px] px-2 rounded-[5px] text-[10.5px] text-(--fg-muted) hover:text-(--crit) inline-flex items-center gap-1 cursor-pointer"
          >
            <Undo2 className="w-[11px] h-[11px]" strokeWidth={2.2} />
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
