/**
 * Interactive CAD tools as small state machines: annotation tools (TEXT,
 * LEADER, DIMLINEAR, DIMALIGNED, DIMRADIUS, DIMANGULAR, LEVEL, HATCH, NORTH,
 * FLOW, KILOMETRAGE, SECTION, REVCLOUD) and pick-driven modify tools (OFFSET,
 * TRIM, EXTEND, MIRROR, ARRAY, COPY, ROTATE, SCALE, BREAK, FILLET, JOIN,
 * EXPLODE).
 *
 * Each tool asks for one thing at a time — a point, a pick, a number or a
 * word — the way AutoCAD's command line does, and says what it wants in plain
 * words. No tool writes geometry until it has everything it needs, and each
 * finished operation is a single undoable action.
 *
 * Framework-free: the canvas feeds clicks and typed input; the tool dispatches
 * reducer actions and returns preview primitives for the rubber band.
 */

import { termFromText } from "@/lib/bridge/glossary";
import type { LineShape, Point, Shape } from "@/lib/geometry/types";
import type { AnchorRef, Annotation, HatchMaterial } from "@/lib/cad/types";
import type { DrawPrim } from "@/lib/cad/drawList";
import type { CadDocState } from "@/lib/cad/document";
import { nearestHandle, polygonBounds } from "@/lib/cad/geometry";
import {
  ModifyError,
  arrayPolar,
  arrayRectangular,
  breakLine,
  copyShapes,
  explodeShape,
  extendLine,
  filletCorner,
  joinLines,
  mirrorShapes,
  offsetShape,
  rotateShapes,
  scaleShapes,
  trimLine,
} from "@/lib/cad/modify";
import { measureDimension } from "@/lib/cad/annotationPrims";
import { indexShapes } from "@/lib/cad/geometry";

export interface ToolEnv {
  shapes: Shape[];
  cad: CadDocState;
  selectedIds: string[];
  /** Viewport zoom (px per mm), for pick tolerances in screen terms. */
  scale: number;
  hatchMaterial: HatchMaterial;
  dispatch: (action: unknown) => void;
  notify: (text: string, tone: "ok" | "error" | "info") => void;
}

export interface Pick {
  /** Snapped point. */
  point: Point;
  raw: Point;
  /** The shape under the cursor, if any. */
  hit: Shape | null;
  /** True when the point came from an object snap. */
  snapped: boolean;
}

export interface ToolInput {
  kind: "number" | "text";
  label: string;
  placeholder?: string;
  initial?: string;
}

export interface ToolSession {
  prompt: () => string;
  input: () => ToolInput | null;
  click: (p: Pick, env: ToolEnv) => void;
  move: (p: Pick, env: ToolEnv) => void;
  submit: (value: string, env: ToolEnv) => void;
  preview: (env: ToolEnv) => DrawPrim[];
  /** True when the tool has finished and the canvas should return to select. */
  finished: () => boolean;
}

const PREVIEW = "__preview__";

function anchorFor(p: Pick, env: ToolEnv): AnchorRef {
  if (p.snapped) {
    const h = nearestHandle(env.shapes, p.point, 1e-3 + 2 / env.scale);
    if (h) return { kind: "shape", shapeId: h.shapeId, handle: h.handle };
  }
  return { kind: "point", x: p.point.x, y: p.point.y };
}

function line(a: Point, b: Point): DrawPrim {
  return { k: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, layerId: PREVIEW, dash: "hidden" };
}

/** An annotation without its id — distributive, so each kind keeps its own fields. */
type NewAnnotation = Annotation extends infer A ? (A extends Annotation ? Omit<A, "id"> & { id?: string } : never) : never;

function addAnnotation(env: ToolEnv, a: NewAnnotation) {
  env.dispatch({ type: "CAD_ADD_ANNOTATION", annotation: { id: "", ...a } as Annotation });
}

function selectedShapes(env: ToolEnv): Shape[] {
  const ids = new Set(env.selectedIds);
  return env.shapes.filter((s) => ids.has(s.id) && !s.componentInstanceId);
}

function fail(env: ToolEnv, e: unknown) {
  env.notify(e instanceof ModifyError ? e.message : `That did not work: ${(e as Error).message}`, "error");
}

function nextSectionLetter(env: ToolEnv): string {
  const used = new Set(env.cad.annotations.filter((a) => a.type === "marker" && a.kind === "section").map((a) => (a.type === "marker" ? a.label : "")));
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  return "Z";
}

export { regionAt } from "@/lib/cad/region";
import { regionAt } from "@/lib/cad/region";

// ---------------------------------------------------------------------------

type Factory = () => ToolSession;

function simple(opts: {
  prompts: string[];
  onPoint: (pts: Pick[], env: ToolEnv) => boolean | void;
  preview?: (pts: Pick[], hover: Pick | null, env: ToolEnv) => DrawPrim[];
  input?: (pts: Pick[]) => ToolInput | null;
  submit?: (value: string, pts: Pick[], env: ToolEnv) => boolean | void;
  repeat?: boolean;
}): Factory {
  return () => {
    let pts: Pick[] = [];
    let hover: Pick | null = null;
    let done = false;
    return {
      prompt: () => opts.prompts[Math.min(pts.length, opts.prompts.length - 1)],
      input: () => opts.input?.(pts) ?? null,
      click: (p, env) => {
        pts.push(p);
        const finished = opts.onPoint(pts, env);
        if (finished) {
          if (opts.repeat) pts = [];
          else done = true;
        }
      },
      move: (p) => {
        hover = p;
      },
      submit: (v, env) => {
        const finished = opts.submit?.(v, pts, env);
        if (finished) {
          if (opts.repeat) pts = [];
          else done = true;
        }
      },
      preview: (env) => (opts.preview ? opts.preview(pts, hover, env) : []),
      finished: () => done,
    };
  };
}

// --------------------------------------------------------------- annotation

const textTool: Factory = () => {
  let at: Pick | null = null;
  return {
    prompt: () => (at ? "Type the text and press Enter" : "Pick where the text starts"),
    input: () => (at ? { kind: "text", label: "Text", placeholder: "e.g. RCC M30" } : null),
    click: (p) => {
      at = p;
    },
    move: () => {},
    submit: (v, env) => {
      if (!at || !v.trim()) return;
      addAnnotation(env, { type: "text", at: anchorFor(at, env), text: v.replace(/\\n/g, "\n"), height: env.cad.settings.textHeight });
      at = null;
    },
    preview: () => [],
    finished: () => false,
  };
};

const leaderTool: Factory = () => {
  const pts: Pick[] = [];
  let hover: Pick | null = null;
  return {
    prompt: () => (pts.length === 0 ? "Pick the arrow point" : pts.length === 1 ? "Pick where the note sits" : "Type the note and press Enter"),
    input: () => (pts.length >= 2 ? { kind: "text", label: "Note", placeholder: "e.g. WEEP HOLES 100 Ø @ 1 m c/c" } : null),
    click: (p) => {
      if (pts.length < 2) pts.push(p);
    },
    move: (p) => {
      hover = p;
    },
    submit: (v, env) => {
      if (pts.length < 2 || !v.trim()) return;
      addAnnotation(env, { type: "leader", points: [anchorFor(pts[0], env), { kind: "point", x: pts[1].point.x, y: pts[1].point.y }], text: v, height: env.cad.settings.textHeight });
      pts.length = 0;
    },
    preview: () => (pts.length === 1 && hover ? [line(pts[0].point, hover.point)] : []),
    finished: () => false,
  };
};

function dimTool(kind: "linear" | "aligned"): Factory {
  return simple({
    prompts: ["Pick the first point to dimension", "Pick the second point", "Pick where the dimension line goes"],
    repeat: true,
    onPoint: (pts, env) => {
      if (pts.length < 3) return false;
      const [a, b, c] = pts;
      let axis: "x" | "y" | undefined;
      let offset: number;
      if (kind === "linear") {
        const minX = Math.min(a.point.x, b.point.x);
        const maxX = Math.max(a.point.x, b.point.x);
        const outsideX = c.point.x < minX || c.point.x > maxX;
        const minY = Math.min(a.point.y, b.point.y);
        const maxY = Math.max(a.point.y, b.point.y);
        const outsideY = c.point.y < minY || c.point.y > maxY;
        axis = outsideY && !outsideX ? "x" : outsideX && !outsideY ? "y" : Math.abs(b.point.x - a.point.x) >= Math.abs(b.point.y - a.point.y) ? "x" : "y";
        offset = axis === "x" ? (c.point.y < minY ? c.point.y - minY : c.point.y - maxY) : c.point.x < minX ? c.point.x - minX : c.point.x - maxX;
      } else {
        const dx = b.point.x - a.point.x;
        const dy = b.point.y - a.point.y;
        const l = Math.hypot(dx, dy) || 1;
        offset = (c.point.x - a.point.x) * (-dy / l) + (c.point.y - a.point.y) * (dx / l);
      }
      addAnnotation(env, { type: "dimension", kind, axis, p1: anchorFor(a, env), p2: anchorFor(b, env), offset, mode: "reference" });
      return true;
    },
    preview: (pts, hover) => {
      if (!hover) return [];
      if (pts.length === 1) return [line(pts[0].point, hover.point)];
      if (pts.length === 2) return [line(pts[0].point, pts[1].point), line(pts[1].point, hover.point)];
      return [];
    },
  });
}

const dimRadius: Factory = simple({
  prompts: ["Pick a circle to dimension its radius (Shift: diameter)"],
  repeat: true,
  onPoint: (pts, env) => {
    const p = pts[0];
    const c = p.hit && p.hit.type === "circle" ? p.hit : null;
    if (!c) {
      env.notify("Pick on a circle.", "error");
      return true;
    }
    const ang = Math.atan2(p.raw.y - c.cy, p.raw.x - c.cx);
    addAnnotation(env, {
      type: "dimension",
      kind: "radius",
      p1: { kind: "shape", shapeId: c.id, handle: "center" },
      p2: { kind: "point", x: c.cx + c.r * Math.cos(ang), y: c.cy + c.r * Math.sin(ang) },
      offset: 0,
      mode: "reference",
    });
    return true;
  },
});

const dimAngular: Factory = simple({
  prompts: ["Pick the vertex of the angle", "Pick a point on the first side", "Pick a point on the second side", "Pick where the arc goes"],
  repeat: true,
  onPoint: (pts, env) => {
    if (pts.length < 4) return false;
    const [v, a, b, c] = pts;
    addAnnotation(env, { type: "dimension", kind: "angular", p1: anchorFor(a, env), p2: anchorFor(b, env), p3: anchorFor(v, env), offset: Math.hypot(c.point.x - v.point.x, c.point.y - v.point.y), mode: "reference" });
    return true;
  },
  preview: (pts, hover) => (hover && pts.length ? pts.map((p) => line(pts[0].point, p.point)).concat([line(pts[0].point, hover.point)]) : []),
});

const levelTool: Factory = () => {
  let at: Pick | null = null;
  return {
    prompt: () => (at ? "Label for this level — end it with = to write it on the line (BED LEVEL = 96.100M.)" : "Pick the point whose level to mark"),
    input: () => (at ? { kind: "text", label: "Label", placeholder: "HFL, BED LEVEL =, TOP OF SLAB =…", initial: "" } : null),
    click: (p) => {
      at = p;
    },
    move: () => {},
    submit: (v, env) => {
      if (!at) return;
      const raw = v.trim().toUpperCase();
      // "BED LEVEL =" asks for the GAD callout written on the level line.
      const gad = raw.endsWith("=");
      const label = raw.replace(/=\s*$/, "").trim();
      const role = termFromText(label)?.role;
      const water = role === "HFL" || role === "LWL" || role === "danger_level";
      addAnnotation(env, {
        type: "level",
        at: anchorFor(at, env),
        label,
        ...(gad ? { style: "gad" as const, format: water ? "{label} = {rl}M" : undefined } : {}),
        symbol: water ? "water" : role === "bed_level" ? "ground" : undefined,
      });
      at = null;
    },
    preview: () => [],
    finished: () => false,
  };
};

const hatchTool: Factory = simple({
  prompts: ["Click inside a closed area to hatch it"],
  repeat: true,
  onPoint: (pts, env) => {
    const r = regionAt(env.shapes, pts[0].raw);
    if (!r) {
      env.notify("No closed boundary around that point — close the outline first (a hatch must not leak).", "error");
      return true;
    }
    const assoc = r.shapeIds.every((id) => !env.shapes.find((s) => s.id === id)?.componentInstanceId);
    addAnnotation(env, {
      type: "hatch",
      material: env.hatchMaterial,
      boundary: assoc ? { kind: "shapes", shapeIds: r.shapeIds, holeShapeIds: r.holeIds.flat() } : { kind: "polygon", outer: r.outer, holes: r.holes },
    });
    env.notify(`Hatched with ${env.hatchMaterial}${r.holes.length ? `, ${r.holes.length} opening(s) left clear` : ""}.`, "ok");
    return true;
  },
});

const northTool: Factory = simple({
  prompts: ["Pick where the north arrow goes"],
  onPoint: (pts, env) => {
    addAnnotation(env, { type: "marker", kind: "north", at: { kind: "point", x: pts[0].point.x, y: pts[0].point.y } });
    return true;
  },
});

function arrowMarker(kind: "flow" | "kilometrage", label: string): Factory {
  return () => {
    const pts: Pick[] = [];
    let hover: Pick | null = null;
    let done = false;
    return {
      prompt: () => (pts.length === 0 ? `Pick the start of the ${kind === "flow" ? "flow" : "kilometrage"} arrow` : pts.length === 1 ? "Pick the arrow head" : "Label (Enter to accept)"),
      input: () => (pts.length === 2 ? { kind: "text", label: "Label", initial: label } : null),
      click: (p) => {
        if (pts.length < 2) pts.push(p);
      },
      move: (p) => {
        hover = p;
      },
      submit: (v, env) => {
        if (pts.length < 2) return;
        addAnnotation(env, { type: "marker", kind, at: { kind: "point", ...pts[0].point }, to: { kind: "point", ...pts[1].point }, label: v.trim() || label });
        done = true;
      },
      preview: () => (pts.length === 1 && hover ? [line(pts[0].point, hover.point)] : []),
      finished: () => done,
    };
  };
}

const sectionTool: Factory = simple({
  prompts: ["Pick the start of the section cut", "Pick the end of the section cut"],
  onPoint: (pts, env) => {
    if (pts.length < 2) return false;
    addAnnotation(env, { type: "marker", kind: "section", at: { kind: "point", ...pts[0].point }, to: { kind: "point", ...pts[1].point }, label: nextSectionLetter(env) });
    return true;
  },
  preview: (pts, hover) => (pts.length === 1 && hover ? [line(pts[0].point, hover.point)] : []),
});

const revcloudTool: Factory = () => {
  const pts: Pick[] = [];
  let hover: Pick | null = null;
  let done = false;
  return {
    prompt: () => (pts.length === 0 ? "Pick one corner of the revised area" : pts.length === 1 ? "Pick the opposite corner" : "Revision note (Enter to skip)"),
    input: () => (pts.length === 2 ? { kind: "text", label: "Note", initial: "" } : null),
    click: (p) => {
      if (pts.length < 2) pts.push(p);
    },
    move: (p) => {
      hover = p;
    },
    submit: (v, env) => {
      if (pts.length < 2) return;
      const [a, b] = [pts[0].point, pts[1].point];
      addAnnotation(env, { type: "revcloud", points: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], label: v.trim() || undefined });
      done = true;
    },
    preview: () => {
      if (pts.length !== 1 || !hover) return [];
      const a = pts[0].point;
      const b = hover.point;
      return [line(a, { x: b.x, y: a.y }), line({ x: b.x, y: a.y }, b), line(b, { x: a.x, y: b.y }), line({ x: a.x, y: b.y }, a)];
    },
    finished: () => done,
  };
};

// --------------------------------------------------------------- modify

const offsetTool: Factory = () => {
  let distance: number | null = null;
  let target: Shape | null = null;
  return {
    prompt: () => (distance === null ? "Offset distance (mm)" : target ? "Pick the side to offset towards" : `Pick the object to offset by ${distance} mm`),
    input: () => (distance === null ? { kind: "number", label: "Distance", placeholder: "mm" } : null),
    click: (p, env) => {
      if (distance === null) return;
      if (!target) {
        if (!p.hit) return env.notify("Pick a line, circle, rectangle or polyline.", "error");
        target = p.hit;
        return;
      }
      try {
        const add = offsetShape(env.shapes, target, distance, p.raw);
        env.dispatch({ type: "EDIT_SHAPES", add, description: `Offset ${distance} mm` });
      } catch (e) {
        fail(env, e);
      }
      target = null;
    },
    move: () => {},
    submit: (v, env) => {
      const d = Number(v);
      if (!(d > 0)) return env.notify("Type a positive distance in mm.", "error");
      distance = d;
    },
    preview: () => [],
    finished: () => false,
  };
};

const trimTool: Factory = simple({
  prompts: ["Pick the part of a line to trim away (it is cut at the nearest crossings)"],
  repeat: true,
  onPoint: (pts, env) => {
    const hit = pts[0].hit;
    if (!hit || hit.type !== "line") {
      env.notify("TRIM works on lines — pick the piece to remove.", "error");
      return true;
    }
    try {
      const pieces = trimLine(env.shapes, hit, pts[0].raw);
      env.dispatch({ type: "EDIT_SHAPES", remove: [hit.id], add: pieces.filter((p) => p.id !== hit.id), update: pieces.filter((p) => p.id === hit.id), description: "Trim" });
    } catch (e) {
      fail(env, e);
    }
    return true;
  },
});

const extendTool: Factory = simple({
  prompts: ["Pick a line near the end to extend"],
  repeat: true,
  onPoint: (pts, env) => {
    const hit = pts[0].hit;
    if (!hit || hit.type !== "line") {
      env.notify("EXTEND works on lines.", "error");
      return true;
    }
    try {
      env.dispatch({ type: "EDIT_SHAPES", update: [extendLine(env.shapes, hit, pts[0].raw)], description: "Extend" });
    } catch (e) {
      fail(env, e);
    }
    return true;
  },
});

const breakTool: Factory = simple({
  prompts: ["Pick the point on a line to break it"],
  repeat: true,
  onPoint: (pts, env) => {
    const hit = pts[0].hit;
    if (!hit || hit.type !== "line") {
      env.notify("BREAK works on lines.", "error");
      return true;
    }
    try {
      const [a, b] = breakLine(hit, pts[0].point);
      env.dispatch({ type: "EDIT_SHAPES", update: [a], add: [b], description: "Break" });
    } catch (e) {
      fail(env, e);
    }
    return true;
  },
});

const filletTool: Factory = simple({
  prompts: ["Pick the first line (on the side to keep)", "Pick the second line (on the side to keep)"],
  repeat: true,
  onPoint: (pts, env) => {
    if (pts.length < 2) {
      if (!pts[0].hit || pts[0].hit.type !== "line") {
        env.notify("Pick a line.", "error");
        pts.length = 0;
      }
      return false;
    }
    const [a, b] = pts;
    if (!b.hit || b.hit.type !== "line" || b.hit.id === a.hit!.id) {
      env.notify("Pick a second, different line.", "error");
      return true;
    }
    try {
      const [l1, l2] = filletCorner(a.hit as LineShape, a.raw, b.hit, b.raw);
      env.dispatch({ type: "EDIT_SHAPES", update: [l1, l2], description: "Fillet (corner)" });
    } catch (e) {
      fail(env, e);
    }
    return true;
  },
});

function needSelection(env: ToolEnv, verb: string): Shape[] | null {
  const sel = selectedShapes(env);
  if (sel.length === 0) {
    env.notify(`Select what to ${verb} first (component geometry changes through its values).`, "error");
    return null;
  }
  return sel;
}

const mirrorTool: Factory = simple({
  prompts: ["Pick the first point of the mirror line", "Pick the second point of the mirror line"],
  onPoint: (pts, env) => {
    if (pts.length < 2) return false;
    const sel = needSelection(env, "mirror");
    if (!sel) return true;
    try {
      const add = mirrorShapes(sel, pts[0].point, pts[1].point);
      env.dispatch({ type: "EDIT_SHAPES", add, description: `Mirror ${sel.length}`, select: add.map((s) => s.id) });
    } catch (e) {
      fail(env, e);
    }
    return true;
  },
  preview: (pts, hover) => (pts.length === 1 && hover ? [line(pts[0].point, hover.point)] : []),
});

const copyTool: Factory = simple({
  prompts: ["Pick the base point", "Pick the destination (keeps copying; Esc to stop)"],
  onPoint: (pts, env) => {
    if (pts.length < 2) return false;
    const sel = needSelection(env, "copy");
    if (!sel) return true;
    try {
      const add = copyShapes(sel, pts[pts.length - 1].point.x - pts[0].point.x, pts[pts.length - 1].point.y - pts[0].point.y);
      env.dispatch({ type: "EDIT_SHAPES", add, description: `Copy ${sel.length}` });
    } catch (e) {
      fail(env, e);
    }
    pts.splice(1);
    return false;
  },
  preview: (pts, hover) => (pts.length >= 1 && hover ? [line(pts[0].point, hover.point)] : []),
});

const rotateTool: Factory = () => {
  let base: Pick | null = null;
  let done = false;
  return {
    prompt: () => (base ? "Rotation angle in degrees (counter-clockwise)" : "Pick the base point to rotate about"),
    input: () => (base ? { kind: "number", label: "Angle", placeholder: "deg" } : null),
    click: (p) => {
      base = p;
    },
    move: () => {},
    submit: (v, env) => {
      if (!base) return;
      const sel = needSelection(env, "rotate");
      const a = Number(v);
      if (!sel || !Number.isFinite(a)) return;
      try {
        env.dispatch({ type: "EDIT_SHAPES", update: rotateShapes(sel, base.point, a), description: `Rotate ${a}°` });
        done = true;
      } catch (e) {
        fail(env, e);
      }
    },
    preview: () => [],
    finished: () => done,
  };
};

const scaleTool: Factory = () => {
  let base: Pick | null = null;
  let done = false;
  let confirm = false;
  return {
    prompt: () => (base ? (confirm ? "That changes structural sizes. Type the factor again to confirm" : "Scale factor") : "Pick the base point"),
    input: () => (base ? { kind: "number", label: "Factor" } : null),
    click: (p) => {
      base = p;
    },
    move: () => {},
    submit: (v, env) => {
      if (!base) return;
      const sel = needSelection(env, "scale");
      const k = Number(v);
      if (!sel || !(k > 0)) return;
      try {
        env.dispatch({ type: "EDIT_SHAPES", update: scaleShapes(sel, base.point, k, confirm), description: `Scale ×${k}` });
        done = true;
      } catch (e) {
        if (e instanceof ModifyError && !confirm) {
          confirm = true;
          env.notify(e.message, "info");
        } else fail(env, e);
      }
    },
    preview: () => [],
    finished: () => done,
  };
};

const arrayTool: Factory = () => {
  let done = false;
  let polarCentre: Pick | null = null;
  return {
    prompt: () => (polarCentre ? "Polar: count[,total angle]  e.g. 6,360" : "Rectangular: rows,columns,Δx,Δy (mm)  e.g. 1,4,2500,0 — or click a centre for a polar array"),
    input: () => ({ kind: "text", label: polarCentre ? "count,angle" : "rows,cols,dx,dy" }),
    click: (p) => {
      polarCentre = p;
    },
    move: () => {},
    submit: (v, env) => {
      const sel = needSelection(env, "array");
      if (!sel) return;
      const n = v.split(/[,\s]+/).map(Number);
      try {
        let add: Shape[];
        if (polarCentre) add = arrayPolar(sel, polarCentre.point, n[0], n[1] ?? 360);
        else {
          // Canvas y is down; Δy typed as a drawing value (up positive).
          add = arrayRectangular(sel, n[0], n[1], n[2] ?? 0, -(n[3] ?? 0));
        }
        env.dispatch({ type: "EDIT_SHAPES", add, description: `Array ×${add.length + sel.length}` });
        done = true;
      } catch (e) {
        fail(env, e);
      }
    },
    preview: () => [],
    finished: () => done,
  };
};

const joinTool: Factory = () => ({
  prompt: () => "Joining the selected lines into one polyline…",
  input: () => null,
  click: () => {},
  move: () => {},
  submit: () => {},
  preview: () => [],
  finished: () => true,
});

export function runImmediate(tool: string, env: ToolEnv): boolean {
  if (tool === "join") {
    const sel = selectedShapes(env).filter((s): s is LineShape => s.type === "line");
    try {
      const { groupId, closed } = joinLines(sel);
      env.dispatch({ type: "EDIT_SHAPES", update: sel.map((s) => ({ ...s, groupId, groupPath: [groupId], groupName: closed ? "Closed polyline" : "Polyline" })), description: `Join ${sel.length} lines` });
      env.notify(`Joined ${sel.length} lines into a ${closed ? "closed " : ""}polyline.`, "ok");
    } catch (e) {
      fail(env, e);
    }
    return true;
  }
  if (tool === "explode") {
    const sel = selectedShapes(env);
    if (!sel.length) {
      env.notify("Select what to explode.", "error");
      return true;
    }
    try {
      const add: Shape[] = [];
      const remove: string[] = [];
      const update: Shape[] = [];
      for (const s of sel) {
        const parts = explodeShape(s);
        if (s.type === "line") update.push(parts[0]);
        else {
          remove.push(s.id);
          add.push(...parts);
        }
      }
      env.dispatch({ type: "EDIT_SHAPES", remove, add, update, description: `Explode ${sel.length}` });
    } catch (e) {
      fail(env, e);
    }
    return true;
  }
  return false;
}

export const INTERACTIVE_TOOLS: Record<string, Factory> = {
  text: textTool,
  leader: leaderTool,
  dimlinear: dimTool("linear"),
  dimaligned: dimTool("aligned"),
  dimradius: dimRadius,
  dimangular: dimAngular,
  level: levelTool,
  hatch: hatchTool,
  north: northTool,
  flow: arrowMarker("flow", "FLOW"),
  kilometrage: arrowMarker("kilometrage", "TO KM"),
  section: sectionTool,
  revcloud: revcloudTool,
  offset: offsetTool,
  trim: trimTool,
  extend: extendTool,
  break: breakTool,
  fillet: filletTool,
  mirror: mirrorTool,
  copy: copyTool,
  rotate: rotateTool,
  scale: scaleTool,
  array: arrayTool,
  join: joinTool,
  explode: joinTool,
};

export function isInteractiveTool(tool: string): boolean {
  return tool in INTERACTIVE_TOOLS;
}

/** Live measurement text for a preview dimension (used by the prompt bar). */
export function previewMeasure(env: ToolEnv, a: Point, b: Point): string {
  const d = measureDimension({ id: "p", type: "dimension", kind: "aligned", p1: { kind: "point", ...a }, p2: { kind: "point", ...b }, offset: 0, mode: "reference" }, { shapes: indexShapes([]), settings: env.cad.settings });
  return d?.text ?? "";
}

export { polygonBounds };
