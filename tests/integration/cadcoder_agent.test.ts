import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { importDxfToShapes } from "../../lib/io/dxfImporter";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";
import {
  DEFAULT_OLLAMA_ENDPOINT,
  DEFAULT_OLLAMA_MODEL,
  getCadCoderStatus,
  executeCadCodeViaUv,
  RCC_BRIDGE_CADQUERY_REFERENCE,
} from "../../lib/ai/cadcoderService";

describe("CadCoder AI Agent & CadQuery uv Pipeline", () => {
  it("should verify uv and python 3.11 environment is available", () => {
    const uvVersion = execSync("uv --version", { encoding: "utf8" });
    expect(uvVersion).toContain("uv");

    const pyVersion = execSync("uv run --python 3.11 python --version", { encoding: "utf8" });
    expect(pyVersion).toContain("Python 3.11");
  });

  it("should check CadCoder service status", async () => {
    const status = await getCadCoderStatus();
    expect(status.uvAvailable).toBe(true);
    expect(status.model).toBe(DEFAULT_OLLAMA_MODEL);
    expect(status.ollamaEndpoint).toBe(DEFAULT_OLLAMA_ENDPOINT);
  });

  it("should generate RCC Bridge Half Section DXF using uv runner and parse into UPCE shapes", async () => {
    const tmpDxf = path.join(os.tmpdir(), `test_rcc_bridge_${Date.now()}.dxf`);
    try {
      execSync(
        `uv run --python 3.11 --with cadquery --with ezdxf python services/cad_coder/runner.py --preset rcc_half_section --out "${tmpDxf}"`,
        { cwd: process.cwd() }
      );

      expect(fs.existsSync(tmpDxf)).toBe(true);
      const dxfContent = fs.readFileSync(tmpDxf, "utf8");
      expect(dxfContent.length).toBeGreaterThan(500);

      const shapes = importDxfToShapes(dxfContent);
      expect(shapes.length).toBeGreaterThan(50);

      // Verify that the drawing contains essential bridge components
      const hasLines = shapes.some((s) => s.type === "line");
      const hasCircles = shapes.some((s) => s.type === "circle");
      expect(hasLines).toBe(true);
      expect(hasCircles).toBe(true);

      // Verify dimensions span & height exist in geometry bounds
      const minX = Math.min(...shapes.map((s: any) => s.x1 ?? s.cx ?? s.x ?? 0));
      const maxX = Math.max(...shapes.map((s: any) => s.x2 ?? s.cx ?? s.x ?? 0));
      const spanRange = maxX - minX;
      // Culvert + cushion + wings span is roughly 15000 to 25000 mm
      expect(spanRange).toBeGreaterThan(10700);

      // Verify LOAD_SHAPES reducer transition
      const stateAfterLoad = drawingReducer(initialDrawingState, {
        type: "LOAD_SHAPES",
        shapes,
      });

      expect(stateAfterLoad.shapes.length).toBe(shapes.length);
      expect(stateAfterLoad.viewport.scale).toBeGreaterThan(0);
      expect(stateAfterLoad.history.past.length).toBeGreaterThan(0);
    } finally {
      if (fs.existsSync(tmpDxf)) fs.unlinkSync(tmpDxf);
    }
  }, 30000);

  it("should execute CadQuery reference script through executeCadCodeViaUv", async () => {
    const result = await executeCadCodeViaUv(RCC_BRIDGE_CADQUERY_REFERENCE, { isPreset: true });
    expect(result.shapes.length).toBeGreaterThan(50);
    expect(result.dxf).toContain("SECTION");
  }, 30000);
});
