/**
 * The native file: a drawing saved, closed and opened again is the same
 * parametric model — geometry, values, formulas, constraints, annotations and
 * the definitions behind them — not a picture of one.
 *
 * The tests that matter most here are the last two kinds: a file that is
 * damaged must be refused whole rather than half-loaded over somebody's work,
 * and a reload must never quietly drop what the draftsman had on screen.
 */

import { describe, it, expect } from "vitest";
import {
  CAD_FILE_FORMAT,
  CAD_FILE_VERSION,
  cadFileName,
  checksumOf,
  documentToSave,
  newCadDocument,
  readCadFile,
  titleFromFileName,
  writeCadFile,
  type CadFileDocument,
} from "@/lib/io/cadFile";
import { drawingReducer, initialDrawingState, type DrawingState } from "@/lib/state/drawingReducer";
import { emptyCadDoc } from "@/lib/cad/document";
import { evaluateComponent } from "@/lib/components/evaluate";
import { makeRegistry } from "@/lib/components/instantiate";
import { emptySketch } from "@/lib/upce/types";
import { layerIdFor } from "@/lib/cad/layers";
import type { ComponentDefinition } from "@/lib/components/types";
import type { Shape } from "@/lib/geometry/types";

// ---------------------------------------------------------------------------
// A drawing with something of everything in it
// ---------------------------------------------------------------------------

/**
 * A steel plate with bolt holes, made parametric: the hole spacing FOLLOWS the
 * plate length instead of repeating its number. That relationship is the thing
 * a save has to carry — coordinates alone would reopen as a dead drawing.
 */
const PLATE: ComponentDefinition = {
  id: "drawing.plate-1",
  name: "Gusset plate",
  category: "component",
  semanticType: "plate",
  view: "elevation",
  description: "A rectangular plate with two bolt holes.",
  version: "1",
  parameters: [
    { name: "PlateLength", label: "Plate length", kind: "length", default: 2000, unit: "mm", description: "written: 2000" },
    { name: "PlateWidth", label: "Plate width", kind: "length", default: 600, unit: "mm" },
    { name: "HoleDia", label: "Bolt hole diameter", kind: "length", default: 22, unit: "mm" },
  ],
  formulas: [
    { name: "HoleSpacing", expr: "PlateLength / 4", label: "Hole spacing", unit: "mm" },
    { name: "HoleRadius", expr: "HoleDia / 2", unit: "mm" },
  ],
  primitives: [
    { id: "outline", kind: "loop", role: "plate", layer: "outline", points: [["0", "0"], ["PlateLength", "0"], ["PlateLength", "PlateWidth"], ["0", "PlateWidth"]] },
    { id: "hole", kind: "circle", role: "hole", layer: "outline", center: ["HoleSpacing", "PlateWidth / 2"], r: "HoleRadius" },
  ],
  dimensions: [{ id: "len", kind: "horizontal", from: ["0", "0"], to: ["PlateLength", "0"], offset: "-200", drives: "PlateLength" }],
  invariants: [{ id: "holes-fit", expr: "PlateWidth", op: ">", than: "HoleDia * 2", message: "The holes do not fit across the plate.", severity: "error" }],
  origin: { kind: "drawn" },
};

function richDocument(): CadFileDocument {
  const cad = emptyCadDoc();
  const outline = layerIdFor(cad.layers, "outline");
  const shapes: Shape[] = [
    { id: "s1", type: "line", x1: 0, y1: 0, x2: 2000, y2: 0, layerId: outline } as unknown as Shape,
    { id: "s2", type: "rectangle", x: 0, y: 0, width: 2000, height: 600, layerId: outline } as unknown as Shape,
    { id: "s3", type: "circle", cx: 500, cy: 300, r: 11, layerId: outline, componentInstanceId: "PLATE-1" } as unknown as Shape,
  ];
  const doc: CadFileDocument = {
    ...newCadDocument(),
    shapes,
    cad: {
      ...cad,
      definitions: [PLATE],
      components: [{ id: "PLATE-1", definitionId: "drawing.plate-1", name: "Gusset plate", at: { x: 0, y: 0 }, values: { PlateLength: 2400 }, relations: [{ name: "PlateWidth", expr: "PlateLength / 4" }] } as never],
      annotations: [
        { id: "a1", kind: "dimension", layerId: layerIdFor(cad.layers, "dimension"), a: { shapeId: "s2", vertex: 0 }, b: { shapeId: "s2", vertex: 1 }, offset: 200 } as never,
        { id: "a2", kind: "text", layerId: layerIdFor(cad.layers, "text"), at: { x: 100, y: 800 }, text: "PLATE 20 THK" } as never,
      ],
      revisions: [{ rev: "A", description: "Issued for approval", date: "2026-09-20" }],
    },
    sketch: {
      ...emptySketch(),
      constraints: [{ id: "c1", kind: "horizontal", entities: ["s1:e0"], source: "accepted", at: 1 } as never],
      parameters: { Length: { name: "Length", value: 2000, role: "driving" } as never },
      meta: { ...emptySketch().meta, name: "Gusset plate", freedomIsIntentional: true, version: 2 },
    },
  };
  return doc;
}

const roundTrip = (doc: CadFileDocument) => {
  const read = readCadFile(writeCadFile(doc, { title: "Gusset plate" }));
  if (!read.ok) throw new Error(`refused: ${read.reason}`);
  return read;
};

// ---------------------------------------------------------------------------

describe("saving and opening the native file", () => {
  it("writes an envelope that says what it is, which version, and when", () => {
    const text = writeCadFile(richDocument(), { title: "Gusset plate" });
    const raw = JSON.parse(text);
    expect(raw.format).toBe(CAD_FILE_FORMAT);
    expect(raw.version).toBe(CAD_FILE_VERSION);
    expect(raw.units).toBe("mm");
    expect(raw.title).toBe("Gusset plate");
    expect(Date.parse(raw.savedAt)).toBeGreaterThan(0);
    expect(raw.checksum).toBe(checksumOf(JSON.stringify(raw.document)));
  });

  it("gives back the same model it was handed — geometry, annotations, definitions, rules and view", () => {
    const doc = richDocument();
    const read = roundTrip(doc);
    expect(read.file.document).toEqual(doc);
    expect(read.problems).toEqual([]);
  });

  it("keeps entity ids and the references between entities", () => {
    const read = roundTrip(richDocument());
    const d = read.file.document;
    expect(d.shapes.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    // The annotation still measures the rectangle it was drawn against, and the
    // generated circle still belongs to its component instance.
    expect((d.cad.annotations[0] as unknown as { a: { shapeId: string } }).a.shapeId).toBe("s2");
    expect((d.shapes[2] as Shape & { componentInstanceId?: string }).componentInstanceId).toBe("PLATE-1");
    expect(d.cad.components[0].definitionId).toBe(d.cad.definitions![0].id);
  });

  it("keeps the formula, not the number it worked out to", () => {
    const read = roundTrip(richDocument());
    const def = read.file.document.cad.definitions![0];
    const reg = makeRegistry([def]);

    // As saved: 2000 / 4.
    const asSaved = evaluateComponent(def, { PlateLength: 2000 }, reg);
    expect(asSaved.scope.HoleSpacing).toBe(500);

    // Change the plate after reopening and the spacing follows it, which is
    // only possible if the relationship survived the file.
    const longer = evaluateComponent(def, { PlateLength: 2400 }, reg);
    expect(longer.scope.HoleSpacing).toBe(600);
    expect(longer.scope.HoleRadius).toBe(11);
    expect(longer.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("keeps the instance's own values and relationships", () => {
    const inst = roundTrip(richDocument()).file.document.cad.components[0];
    expect(inst.values).toEqual({ PlateLength: 2400 });
    expect(inst.relations).toEqual([{ name: "PlateWidth", expr: "PlateLength / 4" }]);
  });

  it("keeps the authoring session's constraints and named values", () => {
    const sketch = roundTrip(richDocument()).file.document.sketch!;
    expect(sketch.constraints).toHaveLength(1);
    expect(sketch.parameters.Length.value).toBe(2000);
    expect(sketch.meta.freedomIsIntentional).toBe(true);
  });

  it("names the file after the drawing, and reads the name back", () => {
    expect(cadFileName("Box culvert 3 x 2000")).toBe("Box_culvert_3_x_2000.mycad");
    expect(cadFileName("")).toBe("drawing.mycad");
    expect(titleFromFileName("Box_culvert.mycad")).toBe("Box_culvert");
  });
});

describe("a file that cannot be trusted", () => {
  const refusal = (text: string) => {
    const read = readCadFile(text);
    expect(read.ok).toBe(false);
    return read.ok ? "" : read.reason;
  };

  it("refuses text that is not a file at all", () => {
    expect(refusal("not json{{")).toMatch(/damaged|not readable/i);
  });

  it("refuses a file truncated halfway through a save", () => {
    const text = writeCadFile(richDocument(), { title: "Gusset plate" });
    expect(refusal(text.slice(0, Math.floor(text.length / 2)))).toMatch(/damaged|not readable/i);
  });

  it("refuses somebody else's JSON", () => {
    expect(refusal(JSON.stringify({ shapes: [], version: 1 }))).toMatch(/not a mycad drawing/i);
  });

  it("refuses a drawing from a newer version of the application, and says what to do", () => {
    const raw = JSON.parse(writeCadFile(richDocument(), { title: "Gusset plate" }));
    raw.version = CAD_FILE_VERSION + 4;
    expect(refusal(JSON.stringify(raw))).toMatch(/newer version|Update the application/i);
  });

  it("refuses a document with no geometry list or no layers rather than loading half a drawing", () => {
    const raw = JSON.parse(writeCadFile(richDocument(), { title: "Gusset plate" }));
    const without = (fn: (d: Record<string, unknown>) => void) => {
      const copy = JSON.parse(JSON.stringify(raw));
      fn(copy.document);
      return JSON.stringify(copy);
    };
    expect(refusal(without((d) => delete d.shapes))).toMatch(/no geometry/i);
    expect(refusal(without((d) => delete d.cad))).toMatch(/no CAD document/i);
    expect(refusal(without((d) => ((d.cad as { layers: unknown[] }).layers = [])))).toMatch(/no layers/i);
  });

  it("refuses entities that share an id, because references would stop meaning one thing", () => {
    const raw = JSON.parse(writeCadFile(richDocument(), { title: "Gusset plate" }));
    raw.document.shapes[1].id = "s1";
    expect(refusal(JSON.stringify(raw))).toMatch(/share the id/i);
  });

  it("opens a file whose checksum disagrees, and says so instead of drawing it silently", () => {
    const text = writeCadFile(richDocument(), { title: "Gusset plate" });
    // A number changed in storage or by hand: still valid JSON, no longer the
    // drawing that was saved.
    const read = readCadFile(text.replace('"width": 2000', '"width": 2600'));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.problems.some((p) => /checksum/i.test(p.message))).toBe(true);
  });
});

describe("what a file names but does not carry", () => {
  const raw = () => JSON.parse(writeCadFile(richDocument(), { title: "Gusset plate" }));

  it("repairs a current layer that is not in the drawing, and reports the repair", () => {
    const r = raw();
    r.document.cad.currentLayerId = "GONE";
    const read = readCadFile(JSON.stringify(r));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.file.document.cad.layers.some((l) => l.id === read.file.document.cad.currentLayerId)).toBe(true);
    expect(read.problems.some((p) => p.level === "repair" && /current layer/i.test(p.message))).toBe(true);
  });

  it("warns about entities on a layer the file does not hold", () => {
    const r = raw();
    r.document.shapes[0].layerId = "MISSING-LAYER";
    const read = readCadFile(JSON.stringify(r));
    expect(read.ok && read.problems.some((p) => /MISSING-LAYER/.test(p.message))).toBe(true);
  });

  it("warns about a component whose definition this build does not have", () => {
    const r = raw();
    r.document.cad.definitions = [];
    const read = readCadFile(JSON.stringify(r));
    expect(read.ok && read.problems.some((p) => /drawing\.plate-1/.test(p.message))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unsaved changes
// ---------------------------------------------------------------------------

describe("knowing what is unsaved", () => {
  const dirty = (s: DrawingState) => s.file.revision !== s.file.savedRevision;
  const withShape = (s: DrawingState) =>
    drawingReducer(s, { type: "ADD_SHAPE", shape: { id: "n1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 } as unknown as Shape });

  it("starts clean and counts any change to the drawing", () => {
    expect(dirty(initialDrawingState)).toBe(false);
    const edited = withShape(initialDrawingState);
    expect(dirty(edited)).toBe(true);
  });

  it("counts a change to the CAD document too, not only to the geometry", () => {
    const edited = drawingReducer(initialDrawingState, { type: "CAD_UPDATE_LAYER", id: initialDrawingState.cad.layers[1].id, patch: { visible: false } } as never);
    expect(dirty(edited)).toBe(true);
  });

  it("does not count looking around: panning and zooming leave nothing to save", () => {
    const moved = drawingReducer(initialDrawingState, { type: "SET_VIEWPORT", viewport: { x: 10, y: 20, scale: 2 } });
    expect(dirty(moved)).toBe(false);
  });

  it("counts a rule accepted in the authoring session, which lives outside this reducer", () => {
    expect(dirty(drawingReducer(initialDrawingState, { type: "DOC_TOUCH" }))).toBe(true);
  });

  it("does not count the solver rebuilding a drawing it has just opened", () => {
    const opened = drawingReducer(initialDrawingState, { type: "DOC_LOAD", document: richDocument(), name: "Gusset plate" });
    const rebuilt = drawingReducer(opened, { type: "APPLY_SOLVED_SHAPES", shapes: [...opened.shapes].reverse(), description: "Rebuilt from the rules" });
    expect(rebuilt.shapes).not.toBe(opened.shapes);
    expect(dirty(rebuilt)).toBe(false);
  });

  it("is clean again once the drawing has been written to a file", () => {
    const saved = drawingReducer(withShape(initialDrawingState), { type: "DOC_SAVED", name: "Plate", at: 1_700_000_000_000 });
    expect(dirty(saved)).toBe(false);
    expect(saved.file.name).toBe("Plate");
    expect(saved.file.savedAt).toBe(1_700_000_000_000);
    // And an edit after the save is unsaved again.
    expect(dirty(withShape(saved))).toBe(true);
  });
});

describe("opening a drawing into the editor", () => {
  const doc = richDocument();

  it("puts back the geometry, the CAD document and the view it was left in", () => {
    const opened = drawingReducer(withEdits(), { type: "DOC_LOAD", document: doc, name: "Gusset plate" });
    expect(opened.shapes).toEqual(doc.shapes);
    expect(opened.cad.definitions).toEqual(doc.cad.definitions);
    expect(opened.viewport).toEqual(doc.view.viewport);
    expect(opened.file.name).toBe("Gusset plate");
    expect(opened.file.revision).toBe(opened.file.savedRevision);
  });

  it("does not offer to undo back into the drawing that was open before", () => {
    const opened = drawingReducer(withEdits(), { type: "DOC_LOAD", document: doc, name: "Gusset plate" });
    expect(opened.history.past).toEqual([]);
    expect(opened.history.future).toEqual([]);
    expect(opened.selectedIds).toEqual([]);
    expect(opened.draft).toBeNull();
  });

  it("marks a recovered drawing as still unsaved, because its file never got those changes", () => {
    const recovered = drawingReducer(initialDrawingState, { type: "DOC_LOAD", document: doc, name: "Gusset plate", unsaved: true });
    expect(recovered.file.revision).not.toBe(recovered.file.savedRevision);
  });

  it("starts a new drawing empty and clean", () => {
    const fresh = drawingReducer(withEdits(), { type: "DOC_NEW" });
    expect(fresh.shapes).toEqual([]);
    expect(fresh.cad.components).toEqual([]);
    expect(fresh.file.name).toBe("Untitled");
    expect(fresh.file.revision).toBe(fresh.file.savedRevision);
  });

  it("round-trips through the file: edit, save, reopen, same model", () => {
    const edited = withEdits();
    const text = writeCadFile(documentToSave(edited, emptySketch()), { title: edited.file.name });
    const read = readCadFile(text);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const reopened = drawingReducer(initialDrawingState, { type: "DOC_LOAD", document: read.file.document, name: "Untitled" });
    expect(reopened.shapes).toEqual(edited.shapes);
    expect(reopened.cad).toEqual(edited.cad);
  });
});

function withEdits(): DrawingState {
  return drawingReducer(initialDrawingState, {
    type: "ADD_SHAPE",
    shape: { id: "e1", type: "rectangle", x: 0, y: 0, width: 500, height: 200 } as unknown as Shape,
  });
}
