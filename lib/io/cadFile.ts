/**
 * The native file: the whole CAD model, not a picture of it.
 *
 * A drawing in this application is a parametric model — values, formulas,
 * constraints, component definitions, annotations that measure real geometry —
 * and only the model can be reopened and carried on with. DXF, SVG and PDF are
 * *exports*: they carry coordinates to somebody else's software and lose the
 * relationships that produced them. So the native file is the source of truth
 * and the exports are derived from it, never the other way round.
 *
 * What is written:
 *   - `shapes`   every entity, with its own id, so references stay valid;
 *   - `cad`      layers, annotations, component instances AND the drawing's own
 *                component definitions (values, formulas, invariants, repeats),
 *                the project record, sheets, settings, revisions;
 *   - `sketch`   the authoring session for the sketch route: constraints,
 *                named parameters, repeat rules;
 *   - `view`     viewport, drafting aids, persona, current style.
 *
 * What is NOT written: undo history, selection, the live draft, and anything
 * else the application derives when it loads (boundary evaluations, snaps,
 * canvas pixel size). A file records the model, not the session around it.
 *
 * Integrity. The envelope carries a format tag, a version and a checksum of the
 * document text. A truncated or garbled file fails to parse and is refused
 * whole — nothing is half-loaded over the open drawing. A file whose checksum
 * disagrees still opens, loudly: the checksum catches storage damage, but it
 * also fires on a deliberate hand edit, and refusing to open somebody's own
 * data because they fixed a typo in it would be the worse failure. Structural
 * damage — no shape list, no layers — is a refusal.
 */

import type { Shape, Viewport } from "@/lib/geometry/types";
import type { CadDocState } from "@/lib/cad/document";
import { emptyCadDoc } from "@/lib/cad/document";
import type { AuthoringSketch } from "@/lib/upce/types";
import type { ShapeStyleConfig, ThemeMode, UserMode } from "@/lib/state/drawingReducer";
import { COMPONENT_LIBRARY } from "@/lib/components/library";

export const CAD_FILE_FORMAT = "aagento-cad";
/** Bump when the written structure changes, and add a migration for the step. */
export const CAD_FILE_VERSION = 1;
export const CAD_FILE_EXTENSION = "mycad";
export const CAD_FILE_MIME = "application/x-aagento-cad+json";

/** The view the drawing was left in. Restored on open; never affects geometry. */
export interface CadFileView {
  viewport: Viewport;
  showGrid: boolean;
  showDimensions: boolean;
  gridSnapEnabled: boolean;
  objectSnapEnabled: boolean;
  orthoEnabled: boolean;
  polarTrackingEnabled: boolean;
  dynamicInputEnabled: boolean;
  themeMode: ThemeMode;
  userMode: UserMode;
  currentStyle: ShapeStyleConfig;
}

export interface CadFileDocument {
  shapes: Shape[];
  cad: CadDocState;
  /** The authoring session, when the drawing has one. */
  sketch: AuthoringSketch | null;
  view: CadFileView;
}

export interface CadFile {
  format: typeof CAD_FILE_FORMAT;
  version: number;
  /** Which build wrote it — the first thing to know when a file misbehaves. */
  writtenBy: string;
  savedAt: string;
  title: string;
  units: "mm";
  checksum: string;
  document: CadFileDocument;
}

/** Something the file layer noticed but recovered from. Always reported. */
export interface FileProblem {
  level: "warning" | "repair";
  message: string;
}

export type ReadCadFile =
  | { ok: true; file: CadFile; problems: FileProblem[] }
  | { ok: false; reason: string; problems: FileProblem[] };

// ---------------------------------------------------------------------------
// Checksum
// ---------------------------------------------------------------------------

/**
 * FNV-1a, two passes with different offsets, as 16 hex characters.
 *
 * This is a damage detector, not a signature: it exists so a bit flipped in a
 * string or a digit — which JSON parsing would accept without complaint — is
 * noticed and reported rather than silently drawn.
 */
export function checksumOf(text: string): string {
  const pass = (offset: number): number => {
    let h = offset;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  const a = pass(0x811c9dc5);
  const b = pass(0x9dc5811c);
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** The parts of the editor's state a file keeps. Everything else is derived. */
export function documentToSave(
  state: {
    shapes: Shape[];
    cad: CadDocState;
    viewport: Viewport;
    showGrid: boolean;
    showDimensions: boolean;
    gridSnapEnabled: boolean;
    objectSnapEnabled: boolean;
    orthoEnabled: boolean;
    polarTrackingEnabled: boolean;
    dynamicInputEnabled: boolean;
    themeMode: ThemeMode;
    userMode: UserMode;
    currentStyle: ShapeStyleConfig;
  },
  sketch: AuthoringSketch | null
): CadFileDocument {
  return {
    shapes: state.shapes,
    cad: state.cad,
    sketch,
    view: {
      viewport: state.viewport,
      showGrid: state.showGrid,
      showDimensions: state.showDimensions,
      gridSnapEnabled: state.gridSnapEnabled,
      objectSnapEnabled: state.objectSnapEnabled,
      orthoEnabled: state.orthoEnabled,
      polarTrackingEnabled: state.polarTrackingEnabled,
      dynamicInputEnabled: state.dynamicInputEnabled,
      themeMode: state.themeMode,
      userMode: state.userMode,
      currentStyle: state.currentStyle,
    },
  };
}

export function writeCadFile(document: CadFileDocument, meta: { title: string; writtenBy?: string; savedAt?: Date }): string {
  const body = JSON.stringify(document);
  const file: CadFile = {
    format: CAD_FILE_FORMAT,
    version: CAD_FILE_VERSION,
    writtenBy: meta.writtenBy ?? "Aagento UPCE",
    savedAt: (meta.savedAt ?? new Date()).toISOString(),
    title: meta.title,
    units: "mm",
    checksum: checksumOf(body),
    document,
  };
  // The envelope is written key by key so the document text this checksum was
  // taken over is the same text that is read back and hashed again.
  return JSON.stringify(file, null, 2);
}

/** An empty drawing — File > New. */
export function newCadDocument(): CadFileDocument {
  return {
    shapes: [],
    cad: emptyCadDoc(),
    sketch: null,
    view: {
      viewport: { x: 0, y: 0, scale: 1 },
      showGrid: true,
      showDimensions: false,
      gridSnapEnabled: false,
      objectSnapEnabled: true,
      orthoEnabled: false,
      polarTrackingEnabled: false,
      dynamicInputEnabled: true,
      themeMode: "dark",
      userMode: "draftsman",
      currentStyle: { strokeColor: "#f8fafc", strokeWidth: 1.5, fillColor: "transparent", opacity: 1 },
    },
  };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

type RawDocument = Record<string, unknown>;

/**
 * One step per format version, applied in order: a file written by version N is
 * carried up to the current version by running steps N+1 … CAD_FILE_VERSION.
 *
 * There is nothing here yet because version 1 is the first published format.
 * The chain exists so the next change has an obvious place to go, and so an
 * older file can never be opened by guessing at its shape.
 */
const MIGRATIONS: Record<number, (doc: RawDocument, problems: FileProblem[]) => RawDocument> = {};

function migrate(doc: RawDocument, from: number, problems: FileProblem[]): RawDocument | null {
  let out = doc;
  for (let v = from + 1; v <= CAD_FILE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    out = step(out, problems);
    problems.push({ level: "repair", message: `Updated the drawing from file format v${v - 1} to v${v}.` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Checks what a drawing cannot do without, repairs what can be repaired, and
 * reports everything it touched. A fatal problem is returned as a reason: the
 * caller refuses the file whole rather than loading part of a drawing.
 */
function validateDocument(raw: RawDocument, problems: FileProblem[]): { doc: CadFileDocument } | { reason: string } {
  if (!Array.isArray(raw.shapes)) return { reason: "This file has no geometry list — it is not a drawing this application wrote." };
  if (!isObject(raw.cad)) return { reason: "This file has no CAD document (layers, annotations, components)." };

  const cad = raw.cad as unknown as CadDocState;
  if (!Array.isArray(cad.layers) || cad.layers.length === 0) return { reason: "This file has no layers — its CAD document is damaged." };
  if (!isObject(cad.settings)) return { reason: "This file has no drawing settings — its CAD document is damaged." };

  const shapes = raw.shapes as Shape[];
  const seen = new Set<string>();
  for (const s of shapes) {
    if (!isObject(s) || typeof (s as Shape).id !== "string") return { reason: "An entity in this file has no id — the file is damaged." };
    if (seen.has(s.id)) return { reason: `Two entities in this file share the id "${s.id}" — the file is damaged.` };
    seen.add(s.id);
  }

  for (const list of [cad.annotations, cad.components, cad.sheets] as { id?: string }[][]) {
    if (list !== undefined && !Array.isArray(list)) return { reason: "This file's CAD document is damaged (annotations, components or sheets are not lists)." };
  }
  cad.annotations ??= [];
  cad.components ??= [];
  cad.sheets ??= [];
  cad.revisions ??= [];
  cad.componentNotice = null;

  // Entity references. None of these is worth refusing a file over — the
  // drawing still opens and the draftsman can see what is wrong — but silence
  // is not an option either.
  const layerIds = new Set(cad.layers.map((l) => l.id));
  if (!layerIds.has(cad.currentLayerId)) {
    problems.push({ level: "repair", message: `The current layer "${cad.currentLayerId}" is not in this drawing; drawing on "${cad.layers[0].name}" instead.` });
    cad.currentLayerId = cad.layers[0].id;
  }
  const strayLayers = new Set<string>();
  for (const s of shapes) {
    const id = (s as Shape & { layerId?: string }).layerId;
    if (id && !layerIds.has(id)) strayLayers.add(id);
  }
  for (const a of cad.annotations) {
    const id = (a as { layerId?: string }).layerId;
    if (id && !layerIds.has(id)) strayLayers.add(id);
  }
  if (strayLayers.size > 0) {
    problems.push({ level: "warning", message: `${strayLayers.size} layer(s) named by entities are missing from this file: ${[...strayLayers].join(", ")}.` });
  }

  const known = new Set([...COMPONENT_LIBRARY.map((d) => d.id), ...(cad.definitions ?? []).map((d) => d.id)]);
  const missing = cad.components.filter((c) => !known.has(c.definitionId)).map((c) => c.definitionId);
  if (missing.length > 0) {
    problems.push({
      level: "warning",
      message: `${missing.length} component(s) refer to a definition this build does not have: ${[...new Set(missing)].join(", ")}. Their geometry is kept, but they cannot be regenerated.`,
    });
  }

  const view = isObject(raw.view) ? (raw.view as unknown as CadFileView) : null;
  if (!view) problems.push({ level: "repair", message: "This file records no view; opened with the default view." });

  const sketch = isObject(raw.sketch) ? (raw.sketch as unknown as AuthoringSketch) : null;
  if (raw.sketch !== null && raw.sketch !== undefined && !sketch) {
    problems.push({ level: "warning", message: "This file's authoring session could not be read; constraints and named values may be missing." });
  }

  const blank = newCadDocument();
  return { doc: { shapes, cad, sketch, view: { ...blank.view, ...(view ?? {}) } } };
}

export function readCadFile(text: string): ReadCadFile {
  const problems: FileProblem[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "This file is not readable — it is damaged or was not written by this application.", problems };
  }
  if (!isObject(parsed)) return { ok: false, reason: "This file does not contain a drawing.", problems };

  if (parsed.format !== CAD_FILE_FORMAT) {
    return { ok: false, reason: `This is not a ${CAD_FILE_EXTENSION} drawing (its format says "${String(parsed.format ?? "none")}").`, problems };
  }
  const version = typeof parsed.version === "number" ? parsed.version : NaN;
  if (!Number.isFinite(version)) return { ok: false, reason: "This file does not say which format version it was written in.", problems };
  if (version > CAD_FILE_VERSION) {
    return {
      ok: false,
      reason: `This drawing was saved by a newer version of the application (file format v${version}; this build reads up to v${CAD_FILE_VERSION}). Update the application to open it.`,
      problems,
    };
  }
  if (!isObject(parsed.document)) return { ok: false, reason: "This file carries no document.", problems };

  // Checked before migration, against exactly the text that was hashed.
  if (typeof parsed.checksum === "string" && parsed.checksum !== checksumOf(JSON.stringify(parsed.document))) {
    problems.push({
      level: "warning",
      message: "This file's checksum does not match its contents — it was edited outside the application or damaged in storage. Check the drawing before working on it.",
    });
  }

  let raw = parsed.document as RawDocument;
  if (version < CAD_FILE_VERSION) {
    const migrated = migrate(raw, version, problems);
    if (!migrated) {
      return { ok: false, reason: `This drawing is in file format v${version}, which this build cannot update. Open it with the version that wrote it and save it again.`, problems };
    }
    raw = migrated;
  }

  const checked = validateDocument(raw, problems);
  if ("reason" in checked) return { ok: false, reason: checked.reason, problems };

  const file: CadFile = {
    format: CAD_FILE_FORMAT,
    version: CAD_FILE_VERSION,
    writtenBy: typeof parsed.writtenBy === "string" ? parsed.writtenBy : "unknown",
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : "Untitled",
    units: "mm",
    checksum: typeof parsed.checksum === "string" ? parsed.checksum : "",
    document: checked.doc,
  };
  return { ok: true, file, problems };
}

/** A file name for a drawing: "Box culvert" -> "Box_culvert.mycad". */
export function cadFileName(title: string): string {
  const stem = title.replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9 _.-]+/g, "_").trim().replace(/\s+/g, "_").slice(0, 80) || "drawing";
  return `${stem}.${CAD_FILE_EXTENSION}`;
}

/** The title a drawing should carry, given a file name. */
export function titleFromFileName(name: string): string {
  return name.replace(new RegExp(`\\.${CAD_FILE_EXTENSION}$`, "i"), "").replace(/\.json$/i, "") || "Untitled";
}
