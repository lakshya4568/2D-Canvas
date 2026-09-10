/**
 * Exporters, the render service, the CLI, and the REST contract.
 * UPCE-MASTER-1.0 §69, §26 (compliance metadata), §84 (no AGPL dependency).
 */
import { describe, it, expect } from "vitest";
import { exportDxf, DXF_LAYERS, layerForCategory } from "../../lib/io/dxfExporter";
import { exportPdfSheet, SHEET_SIZES } from "../../lib/io/pdfSheetExporter";
import { exportCanonicalSvg } from "../../lib/io/svgExporter";
import { RenderService } from "../../lib/io/renderService";
import { TemplateRenderHost } from "../../lib/io/templateRenderHost";
import { TemplateRegistry } from "../../lib/parametric/templates/templateRegistry";
import { StandardsProfileRegistry } from "../../lib/validation/standardsProfile";
import {
  handleListTemplates,
  handleInstantiate,
  handleRender,
  setRenderService,
} from "../../lib/io/restHandlers";
import { parseArgs, run } from "../../scripts/gad-render";
import { ParametricSketch } from "../../lib/parametric/schemaTypes";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";

/** A minimal but complete canonical sketch: a square with a circle and an arc. */
function sampleSketch(): ParametricSketch {
  return {
    sketchId: "sample",
    schemaVersion: "1.0",
    name: "Sample Culvert",
    units: { length: "mm", angle: "rad" },
    tolerances: { ...DEFAULT_TOLERANCE_POLICY },
    parameters: {},
    formulas: [],
    primitives: {
      points: {
        p0: { id: "p0", x: 0, y: 0 },
        p1: { id: "p1", x: 2000, y: 0 },
        p2: { id: "p2", x: 2000, y: 1500 },
        p3: { id: "p3", x: 0, y: 1500 },
        c0: { id: "c0", x: 1000, y: 750 },
        d0: { id: "d0", x: 0, y: 750, isConstruction: true },
        d1: { id: "d1", x: 2000, y: 750, isConstruction: true },
      },
      lines: {
        l0: { id: "l0", startPointId: "p0", endPointId: "p1", semanticRole: "BOTTOM_SLAB" },
        l1: { id: "l1", startPointId: "p1", endPointId: "p2", semanticRole: "OUTER_WALL" },
        l2: { id: "l2", startPointId: "p2", endPointId: "p3", semanticRole: "TOP_SLAB" },
        l3: { id: "l3", startPointId: "p3", endPointId: "p0", semanticRole: "OUTER_WALL" },
        cl: { id: "cl", startPointId: "d0", endPointId: "d1", isConstruction: true },
      },
      arcs: {
        a0: { id: "a0", centerPointId: "c0", radius: 200, startAngle: 0, endAngle: Math.PI / 2 },
      },
      circles: { ci0: { id: "ci0", centerPointId: "c0", radius: 100 } },
      polylines: {
        pl0: { id: "pl0", vertices: ["p0", "p1", "p2", "p3"], closed: true },
      },
    },
    topology: { halfEdges: {}, faces: {} },
    constraints: {},
  };
}

describe("§69 DXF export", () => {
  it("emits a structurally valid R2010 file", () => {
    const dxf = exportDxf(sampleSketch());
    expect(dxf.startsWith("0\nSECTION")).toBe(true);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(dxf).toContain("AC1024");
    for (const section of ["HEADER", "TABLES", "ENTITIES"]) {
      expect(dxf).toContain(`\n${section}\n`);
    }
    // Group codes come in pairs.
    expect(dxf.trimEnd().split("\n").length % 2).toBe(0);
  });

  it("emits R12 (AC1009) as the maximally compatible fallback", () => {
    const dxf = exportDxf(sampleSketch(), { version: "R12" });
    expect(dxf).toContain("AC1009");
    expect(dxf).not.toContain("AcDbEntity");
    // R12 has no LWPOLYLINE; it uses POLYLINE/VERTEX/SEQEND.
    expect(dxf).not.toContain("LWPOLYLINE");
    expect(dxf).toContain("\nVERTEX\n");
    expect(dxf).toContain("\nSEQEND\n");
  });

  it("declares the full §69 layer scheme", () => {
    const dxf = exportDxf(sampleSketch());
    for (const layer of Object.values(DXF_LAYERS)) {
      expect(dxf).toContain(layer.name);
    }
  });

  it("routes geometry onto layers by semantic category, not shape type", () => {
    expect(layerForCategory("TOP_SLAB")).toBe(DXF_LAYERS.SLAB.name);
    expect(layerForCategory("OUTER_WALL")).toBe(DXF_LAYERS.WALL.name);
    expect(layerForCategory("INTERNAL_WEB")).toBe(DXF_LAYERS.WALL.name);
    expect(layerForCategory(undefined)).toBe(DXF_LAYERS.WALL.name);
  });

  it("emits native associative DIMENSION entities referencing real geometry points", () => {
    const dxf = exportDxf(sampleSketch(), {
      dimensions: [
        {
          id: "clear_span",
          kind: "linear-x",
          p1: { x: 0, y: 0 },
          p2: { x: 2000, y: 0 },
          textPosition: { x: 1000, y: -200 },
        },
      ],
    });
    expect(dxf).toContain("\nDIMENSION\n");
    expect(dxf).toContain("AcDbAlignedDimension");
    expect(dxf).toContain("GAD-METRIC");
    expect(dxf).toContain("$DIMASSOC");
    // The extension-line origins must be the real points (codes 13/14).
    const lines = dxf.split("\n");
    const i13 = lines.indexOf("13");
    expect(i13).toBeGreaterThan(-1);
    expect(Number(lines[i13 + 1])).toBeCloseTo(0, 6);
    const i14 = lines.indexOf("14");
    expect(Number(lines[i14 + 1])).toBeCloseTo(2000, 6);
  });

  it("excludes construction geometry unless asked, then puts it on the centreline layer", () => {
    const without = exportDxf(sampleSketch());
    const withIt = exportDxf(sampleSketch(), { includeConstruction: true });
    const count = (s: string, needle: string) => s.split(needle).length - 1;
    expect(count(withIt, "\nLINE\n")).toBeGreaterThan(count(without, "\nLINE\n"));
    expect(withIt).toContain(DXF_LAYERS.CENTRE.name);
  });

  it("writes coordinates at full precision, never rounded (§81 change 3)", () => {
    const s = sampleSketch();
    s.primitives.points.p1.x = 1999.987654321;
    const dxf = exportDxf(s);
    expect(dxf).toContain("1999.987654321");
  });

  it("carries metadata (incl. compliance status) into the drawing", () => {
    const dxf = exportDxf(sampleSketch(), {
      metadata: { Compliance: "NON-COMPLIANT (see notes)", Standard: "RDSO_CULVERT rev 3.0" },
    });
    expect(dxf).toContain("Compliance: NON-COMPLIANT (see notes)");
    expect(dxf).toContain(DXF_LAYERS.TITLE.name);
  });

  it("normalises arc angles into DXF's 0–360 degree convention", () => {
    const s = sampleSketch();
    s.primitives.arcs.a0.startAngle = -Math.PI / 2;
    const lines = exportDxf(s).split("\n");
    // Scope the search to the ARC entity: group code 50 also appears elsewhere.
    const arcStart = lines.indexOf("ARC");
    expect(arcStart).toBeGreaterThan(-1);
    const i50 = lines.indexOf("50", arcStart);
    expect(Number(lines[i50 + 1])).toBeCloseTo(270, 6);
    const i51 = lines.indexOf("51", arcStart);
    expect(Number(lines[i51 + 1])).toBeCloseTo(90, 6);
  });
});

describe("§69 PDF sheet export", () => {
  it("produces a parseable PDF with a correct xref", () => {
    const bytes = exportPdfSheet(sampleSketch(), {
      titleBlock: { projectName: "Test Project", drawingTitle: "Culvert Section" },
    });
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text).toContain("xref");
    expect(text).toContain("startxref");

    // The startxref offset must point at the literal "xref" keyword.
    const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("supports A1/A2/A3/A4 at the documented point sizes", () => {
    for (const size of ["A1", "A2", "A3", "A4"] as const) {
      const text = new TextDecoder().decode(
        exportPdfSheet(sampleSketch(), {
          size,
          titleBlock: { projectName: "P", drawingTitle: "T" },
        })
      );
      expect(text).toContain(`/MediaBox [0 0 ${SHEET_SIZES[size].width} ${SHEET_SIZES[size].height}]`);
    }
  });

  it("renders the title block fields and the scale", () => {
    const text = new TextDecoder().decode(
      exportPdfSheet(sampleSketch(), {
        scaleDenominator: 50,
        titleBlock: {
          projectName: "Bridge 42",
          drawingTitle: "Box Culvert",
          drawingNumber: "BC-001",
          revision: "B",
          complianceStatus: "COMPLIANT",
        },
      })
    );
    for (const field of ["Bridge 42", "Box Culvert", "BC-001", "COMPLIANCE", "COMPLIANT", "1:50"]) {
      expect(text).toContain(field);
    }
  });

  it("draws a scale bar by default and omits it on request", () => {
    const withBar = new TextDecoder().decode(
      exportPdfSheet(sampleSketch(), { titleBlock: { projectName: "P", drawingTitle: "T" } })
    );
    const without = new TextDecoder().decode(
      exportPdfSheet(sampleSketch(), {
        includeScaleBar: false,
        titleBlock: { projectName: "P", drawingTitle: "T" },
      })
    );
    expect(withBar).toContain("SCALE");
    expect(without.length).toBeLessThan(withBar.length);
  });

  it("escapes PDF string metacharacters", () => {
    const text = new TextDecoder().decode(
      exportPdfSheet(sampleSketch(), {
        titleBlock: { projectName: "A (B) \\ C", drawingTitle: "T" },
      })
    );
    expect(text).toContain("A \\(B\\) \\\\ C");
  });
});

describe("§69 canonical SVG export", () => {
  it("emits every primitive family from the canonical model", () => {
    const svg = exportCanonicalSvg(sampleSketch());
    expect(svg).toContain("<svg");
    expect(svg).toContain("<line");
    expect(svg).toContain("<polygon");
    expect(svg).toContain("<circle");
    expect(svg).toContain("<path");
    expect(svg).toContain("viewBox=");
  });

  it("hides construction geometry unless requested", () => {
    expect(exportCanonicalSvg(sampleSketch())).not.toContain('class="construction"');
    expect(exportCanonicalSvg(sampleSketch(), { includeConstruction: true })).toContain(
      'class="construction"'
    );
  });

  it("escapes XML in the title", () => {
    const s = sampleSketch();
    s.name = "A & B <script>";
    expect(exportCanonicalSvg(s)).toContain("A &amp; B &lt;script&gt;");
  });
});

describe("§69 RenderService — one code path for client, CLI, and server", () => {
  const service = () =>
    new RenderService(
      new TemplateRenderHost({
        registry: new TemplateRegistry(),
        standards: new StandardsProfileRegistry(),
      })
    );

  it("lists the catalogue with DRIVING parameters only", () => {
    const entries = service().listTemplates();
    expect(entries.length).toBeGreaterThan(0);
    const culvert = entries.find((e) => e.id === "single_cell_box_culvert")!;
    expect(culvert.drivingParameters.map((p) => p.name)).toContain("clear_span");
  });

  it("filters the catalogue by query", () => {
    const entries = service().listTemplates("railing");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => /railing/i.test(`${e.id} ${e.name} ${e.category}`))).toBe(true);
  });

  it("instantiates a template and reports derived values and DOF", () => {
    const r = service().instantiate("single_cell_box_culvert", { clear_span: 350 });
    expect(r.sketchId).toBeTruthy();
    expect(r.dof.status).toBe("FC");
    expect(r.dof.maxResidual).toBe(0);
  });

  it("warns rather than silently ignoring an unknown or non-DRIVING override", () => {
    const r = service().instantiate("single_cell_box_culvert", { NoSuchParam: 1 });
    expect(r.warnings.join(" ")).toContain("has no parameter named 'NoSuchParam'");
  });

  it("renders every supported format with the right content type", () => {
    const s = service();
    for (const [format, type] of [
      ["dxf", "application/dxf"],
      ["pdf", "application/pdf"],
      ["svg", "image/svg+xml"],
      ["json", "application/json"],
    ] as const) {
      const out = s.render("single_cell_box_culvert", { params: {}, format });
      expect(out.contentType).toBe(type);
      expect(out.body.length).toBeGreaterThan(100);
      expect(out.filename).toContain("single_cell_box_culvert");
    }
  });

  it("honours the requested DXF version", () => {
    const r12 = service().render("single_cell_box_culvert", {
      params: {},
      format: "dxf",
      dxfVersion: "R12",
    });
    expect(new TextDecoder().decode(r12.body)).toContain("AC1009");
  });

  it("reflects a parameter change in the rendered geometry", () => {
    const s = service();
    const small = new TextDecoder().decode(
      s.render("single_cell_box_culvert", { params: { clear_span: 300 }, format: "json" }).body
    );
    const large = new TextDecoder().decode(
      s.render("single_cell_box_culvert", { params: { clear_span: 600 }, format: "json" }).body
    );
    expect(small).not.toBe(large);
  });

  it("rejects an unknown template by name", () => {
    expect(() => service().instantiate("no_such_template", {})).toThrow(/No template with id/);
  });
});

describe("§69 REST contract", () => {
  it("GET /v1/templates returns the catalogue", () => {
    setRenderService(null);
    const r = handleListTemplates();
    expect(r.status).toBe(200);
    expect(Array.isArray((r.body as { templates: unknown[] }).templates)).toBe(true);
  });

  it("POST instantiate returns the documented shape", () => {
    const r = handleInstantiate("single_cell_box_culvert", { params: { clear_span: 320 } });
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    for (const key of ["sketchId", "derived", "dof", "warnings"]) {
      expect(body[key]).toBeDefined();
    }
  });

  it("POST render returns binary with a filename and compliance headers", () => {
    const r = handleRender("single_cell_box_culvert", { params: {}, format: "dxf" });
    expect(r.status).toBe(200);
    expect(r.body).toBeInstanceOf(Uint8Array);
    expect(r.headers["content-disposition"]).toContain(".dxf");
  });

  it("returns 404 for an unknown template", () => {
    expect(handleInstantiate("nope", {}).status).toBe(404);
    expect(handleRender("nope", { params: {}, format: "dxf" }).status).toBe(404);
  });

  it("returns 400 for a malformed params object or format", () => {
    expect(handleInstantiate("single_cell_box_culvert", { params: { a: "big" } }).status).toBe(400);
    expect(handleInstantiate("single_cell_box_culvert", { params: [] }).status).toBe(400);
    expect(
      handleRender("single_cell_box_culvert", { params: {}, format: "dwg" }).status
    ).toBe(400);
  });

  it("treats an absent body as 'instantiate at declared defaults'", () => {
    expect(handleInstantiate("single_cell_box_culvert", undefined).status).toBe(200);
  });
});

describe("§69 gad-render CLI", () => {
  /** The CLI writes to the real streams; capture them so tests stay quiet. */
  function silently<T>(fn: () => T): T {
    const outWrite = process.stdout.write.bind(process.stdout);
    const errWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      return fn();
    } finally {
      process.stdout.write = outWrite;
      process.stderr.write = errWrite;
    }
  }

  it("parses the spec's documented invocation", () => {
    const args = parseArgs([
      "--template", "culvert.json",
      "--set", "ClearSpan=5000",
      "--set", "CellCount=3",
      "--format", "dxf",
      "--dxf-version", "R2010",
      "--out", "out.dxf",
    ]);
    expect(args.template).toBe("culvert.json");
    expect(args.set).toEqual({ ClearSpan: 5000, CellCount: 3 });
    expect(args.format).toBe("dxf");
    expect(args.dxfVersion).toBe("R2010");
    expect(args.out).toBe("out.dxf");
  });

  it("rejects malformed arguments instead of guessing", () => {
    expect(() => parseArgs(["--set", "NoEquals"])).toThrow(/NAME=VALUE/);
    expect(() => parseArgs(["--set", "A=notanumber"])).toThrow(/not a number/);
    expect(() => parseArgs(["--format", "dwg"])).toThrow(/Unsupported --format/);
    expect(() => parseArgs(["--dxf-version", "R2018"])).toThrow(/R2010 or R12/);
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["--template"])).toThrow(/requires a value/);
  });

  it("exits 0 on --help and --list", () => {
    expect(silently(() => run(["--help"]))).toBe(0);
    expect(silently(() => run(["--list"]))).toBe(0);
  });

  it("exits 2 when no template is given", () => {
    expect(silently(() => run([]))).toBe(2);
  });

  it("exits 1 for an unknown template", () => {
    expect(silently(() => run(["--template", "no_such_template", "--format", "svg"]))).toBe(1);
  });

  it("renders a real template end to end", () => {
    expect(
      silently(() =>
        run(["--template", "single_cell_box_culvert", "--set", "clear_span=350", "--format", "svg"])
      )
    ).toBe(0);
  });
});

describe("§84 No AGPL dependency reaches the exporters", () => {
  it("the exporters are dependency-free TypeScript", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["dxfExporter.ts", "pdfSheetExporter.ts", "svgExporter.ts"]) {
      const src = readFileSync(`lib/io/${file}`, "utf8");
      const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      // Only relative, in-repo imports — no PyMuPDF-equivalent, no npm runtime.
      expect(imports.every((i) => i.startsWith("."))).toBe(true);
    }
  });
});
