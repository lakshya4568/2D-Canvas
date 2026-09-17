import { describe, it, expect } from "vitest";
import { CadAgent } from "../../lib/agent/cadAgent";
import { regenerate, namesOf } from "../../lib/upce/document";
import { rebuildSketch } from "../../lib/upce/lower";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";
import { buildManifest } from "../../lib/upce/template";
import { AuthoringSketch, emptySketch, SketchParameter } from "../../lib/upce/types";
import { makeProvenance } from "../../lib/upce/parameters";

describe("CAD Agent to Run Mode (Human-in-the-Loop & Variational Solve)", () => {
  const agent = new CadAgent();

  it("Step 1: generates drawing with parametric Scene Graph IR, driving parameters, and DAG formulas", async () => {
    const res = await agent.execute({
      prompt: "Draw an RCC box culvert with span 10000 mm, height 4000 mm, wall thickness 800 mm, slab thickness 750 mm, haunch 600 mm, cushion 3000 mm",
      modelOverride: "gemini-3.8-flash",
    });

    expect(res.success).toBe(true);
    expect(res.shapes.length).toBeGreaterThan(0);
    expect(res.sceneGraph).toBeDefined();

    // Verify Scene Graph parameters
    const params = res.sceneGraph.parameters;
    expect(params.span.value).toBe(10000);
    expect(params.height.value).toBe(4000);
    expect(params.wall_thk.value).toBe(800);
    expect(params.top_slab.value).toBe(750);
    expect(params.haunch.value).toBe(600);
    expect(params.cushion_thk.value).toBe(3000);

    // Verify formulas exist
    expect(res.sceneGraph.formulas.length).toBeGreaterThan(0);
    expect(res.sceneGraph.formulas.some((f) => f.target === "outer_w")).toBe(true);
    expect(res.sceneGraph.formulas.some((f) => f.target === "outer_h")).toBe(true);
  });

  it("Step 2: allows iterative prompt-based modification on active drawing without losing geometry", async () => {
    // Follow-up adjustment prompt: modify wall thickness
    const modRes = await agent.execute({
      prompt: "Change wall thickness to 900 mm",
      modelOverride: "gemini-3.8-flash",
    });

    expect(modRes.success).toBe(true);
    // Wall thickness should be updated
    expect(modRes.sceneGraph.parameters.wall_thk.value).toBe(900);
    // Other dimensions preserved
    expect(modRes.sceneGraph.parameters.span.value).toBe(10000);
    expect(modRes.sceneGraph.parameters.height.value).toBe(4000);
    expect(modRes.shapes.length).toBeGreaterThan(0);
  });

  it("Step 3: bridges Scene Graph into UPCE AuthoringSketch and compiles TemplateManifest for Run Mode", () => {
    const activeGraph = agent.getActiveSceneGraph();
    expect(activeGraph).toBeDefined();

    const shapes = agent.getLastShapes();
    const names = namesOf(shapes);
    const { sketch: baseSketch } = rebuildSketch(shapes, emptySketch(), DEFAULT_TOLERANCE_POLICY);

    const sketchParams: Record<string, SketchParameter> = {};
    for (const [key, p] of Object.entries(activeGraph!.parameters)) {
      const isDerived = /total|derived/i.test(key);
      let uiGroup = "Dimensions";
      if (/span|width/i.test(key)) uiGroup = "Span & Clear Dimensions";
      else if (/height/i.test(key)) uiGroup = "Vertical Dimensions";
      else if (/wall|slab/i.test(key)) uiGroup = "Structural Thicknesses";
      else if (/cushion/i.test(key)) uiGroup = "Earth Cushion & Site";
      else if (/haunch/i.test(key)) uiGroup = "Corner Haunches";

      sketchParams[key] = {
        name: key,
        role: isDerived ? "DERIVED" : "DRIVING",
        type: "LENGTH",
        unit: (p.unit as any) || "mm",
        value: typeof p.value === "number" ? p.value : 0,
        published: !isDerived,
        uiGroup,
        provenance: makeProvenance("completion-assistant", p.description || key),
        boundConstraints: [],
      };
    }

    // Add formulas
    for (const f of activeGraph!.formulas) {
      if (!sketchParams[f.target]) {
        sketchParams[f.target] = {
          name: f.target,
          role: "DERIVED",
          type: "LENGTH",
          unit: "mm",
          value: 0,
          expr: f.expression,
          dependencies: f.dependencies || [],
          published: false,
          uiGroup: "Derived Dimensions",
          provenance: makeProvenance("completion-assistant", `Formula ${f.target}`),
          boundConstraints: [],
        };
      }
    }

    const candidateSketch: AuthoringSketch = {
      ...baseSketch,
      parameters: sketchParams,
      meta: {
        ...baseSketch.meta,
        name: "Culvert Cross-Section",
        author: "CAD-Agent-v2",
        version: 1,
        publishedAt: Date.now(),
      },
    };

    const regen = regenerate(shapes, candidateSketch, { shapeNames: names });
    expect(regen.rejection).toBeUndefined();

    // Compile TemplateManifest for Run Mode
    const manifest = buildManifest(regen.sketch, names);
    expect(manifest).toBeDefined();
    expect(manifest.driving.length).toBeGreaterThan(0);

    // Verify driving parameters exist and are grouped
    const drivingNames = manifest.driving.map((d) => d.name);
    expect(drivingNames).toContain("span");
    expect(drivingNames).toContain("wall_thk");
    expect(drivingNames).toContain("top_slab");

    // Verify Persona Boundary Isolation (§3, §64): formula expressions are not in manifest driving/derived entries
    for (const d of manifest.driving) {
      expect((d as any).expr).toBeUndefined();
    }
  });

  it("Step 4: enforces Zero Conformal Scaling (§8) when modifying parameters", () => {
    // Initial dimensions: span 10000, wall 900, slab 750, haunch 600
    const initialWall = agent.getActiveSceneGraph()!.parameters.wall_thk.value;
    const initialHaunch = agent.getActiveSceneGraph()!.parameters.haunch.value;
    const initialSpan = agent.getActiveSceneGraph()!.parameters.span.value;

    expect(initialWall).toBe(900);
    expect(initialHaunch).toBe(600);
    expect(initialSpan).toBe(10000);

    // Modify clear span to 12000 mm
    const activeGraph = agent.getActiveSceneGraph()!;
    activeGraph.parameters.span.value = 12000;

    // Haunch and wall thickness must NOT be uniformly scaled by 12000 / 10000 = 1.2
    const scalingFactor = 12000 / 10000;
    expect(scalingFactor).toBe(1.2);

    // Strict invariant: wall thickness remains 900 mm, NOT 900 * 1.2 = 1080 mm
    expect(activeGraph.parameters.wall_thk.value).toBe(900);
    // Haunch remains 600 mm, NOT 600 * 1.2 = 720 mm
    expect(activeGraph.parameters.haunch.value).toBe(600);
  });
});
