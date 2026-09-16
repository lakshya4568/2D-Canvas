import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CadAgent } from "../../lib/agent/cadAgent";
import { validateSceneGraphIR } from "../../lib/agent/sceneGraphSchema";
import { importDxfToShapes } from "../../lib/io/dxfImporter";

const REFERENCE_IMAGE_PATH =
  "/Users/proximus/.gemini/antigravity/brain/2e538d38-35b2-4cdb-8176-53d9fe4d62b7/.user_uploaded/media_1789474913164.png";

describe("CAD Agent v2 — Comprehensive Evaluation Harness (10+ Test Prompts)", () => {
  const agent = new CadAgent();

  // -------------------------------------------------------------------------
  // Test 1: Simple Geometric Primitive (Circle)
  // -------------------------------------------------------------------------
  it("Test 1: 'Draw a circle at (200, 150) with radius 50'", async () => {
    const res = await agent.execute({
      prompt: "Draw a circle at (200, 150) with radius 50",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("create");
    expect(res.routerDecision.inputMode).toBe("text-only");
    expect(res.routerDecision.modelTier).toBe("fast");
    expect(res.routerDecision.extractedEntities.primitives).toContain("circle");
    expect(res.routerDecision.extractedEntities.parameters.radius?.value).toBe(50);

    // Verify Scene Graph
    const validation = validateSceneGraphIR(res.sceneGraph);
    expect(validation.valid).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.type === "circle")).toBe(true);

    const circleNode = res.sceneGraph.nodes.find((n) => n.type === "circle");
    expect(circleNode?.evaluated.cx).toBe(200);
    expect(circleNode?.evaluated.cy).toBe(150);
    expect(circleNode?.evaluated.r).toBe(50);

    // Verify Shapes
    expect(res.shapes.length).toBeGreaterThanOrEqual(1);
    expect(res.dxf).toContain("CIRCLE");
    expect(res.svg).toContain("<circle");
  });

  // -------------------------------------------------------------------------
  // Test 2: Rectangle with Parameters
  // -------------------------------------------------------------------------
  it("Test 2: 'Draw a rectangle with width 500 and height 300 at origin'", async () => {
    const res = await agent.execute({
      prompt: "Draw a rectangle with width 500 and height 300 at origin",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("create");
    expect(res.routerDecision.extractedEntities.parameters.width?.value).toBe(500);
    expect(res.routerDecision.extractedEntities.parameters.height?.value).toBe(300);

    const rectNode = res.sceneGraph.nodes.find((n) => n.type === "rectangle");
    expect(rectNode).toBeDefined();
    expect(rectNode?.evaluated.width).toBe(500);
    expect(rectNode?.evaluated.height).toBe(300);
  });

  // -------------------------------------------------------------------------
  // Test 3: Line Segment
  // -------------------------------------------------------------------------
  it("Test 3: 'Draw a line from (0,0) of length 1200 mm'", async () => {
    const res = await agent.execute({
      prompt: "Draw a line from (0,0) of length 1200 mm",
    });

    expect(res.success).toBe(true);
    const lineNode = res.sceneGraph.nodes.find((n) => n.type === "line");
    expect(lineNode).toBeDefined();
    expect(lineNode?.evaluated.x1).toBe(0);
    expect(lineNode?.evaluated.y1).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 4: RCC T-Beam Bridge Cross-Section with Formulas
  // -------------------------------------------------------------------------
  it("Test 4: 'Draw the cross-section of an RCC T-beam bridge, span 20 m'", async () => {
    const res = await agent.execute({
      prompt: "Draw the cross-section of an RCC T-beam bridge, span 20 m",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("create");
    expect(res.routerDecision.modelTier).toBe("strong");
    expect(res.routerDecision.extractedEntities.civilElements).toContain("t_beam");
    expect(res.routerDecision.extractedEntities.parameters.span?.value).toBe(20000);

    // Verify parametric parameters and formulas
    expect(res.sceneGraph.parameters.span.value).toBe(20000);
    expect(res.sceneGraph.parameters.depth.expr).toBe("span / 12");
    expect(Math.round(res.sceneGraph.parameters.depth.value)).toBe(1667); // 20000 / 12 = 1666.67 mm -> 1667 mm
    expect(res.sceneGraph.parameters.slab_thk.expr).toBe("span / 25");

    // Verify structural components
    expect(res.sceneGraph.nodes.some((n) => n.id === "deck_slab")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "beam_web")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id.includes("haunch"))).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id.includes("rebar"))).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.layer === "CENTERLINE")).toBe(true);

    // Verify rigid-body anchor (§18)
    expect(res.sceneGraph.validation.checks.some((c) => c.code === "UPCE-SEC-18-RIGID-ANCHOR" && c.status === "PASS")).toBe(true);

    // Verify BoQ metrics
    expect(res.sceneGraph.derivedMetrics?.totalConcreteVolumeM3PerM).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 5: RCC Box Culvert Half Section Matching Reference Drawing
  // -------------------------------------------------------------------------
  it("Test 5: 'Draw the half-section of an RCC box culvert with span 10700 mm, height 4100 mm, 800 mm slabs, 850 mm walls, 600 mm haunches, and 4000 mm cushion'", async () => {
    const res = await agent.execute({
      prompt: "Draw the half-section of an RCC box culvert with span 10700 mm, height 4100 mm, 800 mm slabs, 850 mm walls, 600 mm haunches, and 4000 mm cushion",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("create");
    expect(res.sceneGraph.parameters.span.value).toBe(10700);
    expect(res.sceneGraph.parameters.height.value).toBe(4100);
    expect(res.sceneGraph.parameters.wall_thk.value).toBe(850);
    expect(res.sceneGraph.parameters.haunch.value).toBe(600);
    expect(res.sceneGraph.parameters.cushion_thk.value).toBe(4000);

    // Derived outer envelope: outer_w = 10700 + 2 * 850 = 12400 mm
    expect(res.sceneGraph.parameters.outer_w.value).toBe(12400);
    // outer_h = 4100 + 800 + 800 = 5700 mm
    expect(res.sceneGraph.parameters.outer_h.value).toBe(5700);

    // Verify layers
    const layerNames = res.sceneGraph.layers.map((l) => l.name);
    expect(layerNames).toContain("CONCRETE_OUTLINE");
    expect(layerNames).toContain("CONCRETE_SECTION");
    expect(layerNames).toContain("CENTERLINE");
    expect(layerNames).toContain("EARTH_CUSHION");
    expect(layerNames).toContain("LEVELS");

    // Verify IRC Standards validation
    expect(res.sceneGraph.validation.isValid).toBe(true);
    expect(res.sceneGraph.validation.checks.every((c) => c.status === "PASS")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 6: Beam Reinforcement Details
  // -------------------------------------------------------------------------
  it("Test 6: 'Draw beam longitudinal section with top 3-T20 rebars, bottom 4-T25 rebars, and stirrups at 150 c/c'", async () => {
    const res = await agent.execute({
      prompt: "Draw beam longitudinal section with top 3-T20 rebars, bottom 4-T25 rebars, and stirrups at 150 c/c",
    });

    expect(res.success).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "top_rebar")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "bot_rebar")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id.startsWith("stirrup_"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 7: Bridge Pier Substructure
  // -------------------------------------------------------------------------
  it("Test 7: 'Draw an RCC bridge pier with cap beam 8500 mm wide, pier column diameter 1800 mm, and pile cap footing'", async () => {
    const res = await agent.execute({
      prompt: "Draw an RCC bridge pier with cap beam 8500 mm wide, pier column diameter 1800 mm, and pile cap footing",
    });

    expect(res.success).toBe(true);
    expect(res.sceneGraph.parameters.cap_w.value).toBe(8500);
    expect(res.sceneGraph.parameters.col_dia.value).toBe(1800);
    expect(res.sceneGraph.nodes.some((n) => n.id === "pier_cap")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "pier_column")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "pile_cap")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 8: Multimodal Image + Text: Reference Image Recreation with Span 25 m
  // -------------------------------------------------------------------------
  it("Test 8: Image of bridge diagram + 'recreate this with span 25 m'", async () => {
    expect(fs.existsSync(REFERENCE_IMAGE_PATH)).toBe(true);

    const base64Img = fs.readFileSync(REFERENCE_IMAGE_PATH).toString("base64");

    const res = await agent.execute({
      prompt: "recreate this with span 25 m",
      image: {
        path: REFERENCE_IMAGE_PATH,
        base64: base64Img,
        mimeType: "image/png",
      },
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.inputMode).toBe("text+image");
    expect(res.routerDecision.modelTier).toBe("vision");
    expect(res.routerDecision.selectedModel).toBe("gemini-3.8-flash");

    // Verify clear span scaled to 25 m (25000 mm)
    expect(res.sceneGraph.parameters.span.value).toBe(25000);

    // CRITICAL INVARIANT: Zero Conformal Scaling (§8, §29.4, §81)
    // Wall thickness, slab thickness, haunches, and cushion MUST remain unscaled!
    expect(res.sceneGraph.parameters.wall_thk.value).toBe(850);
    expect(res.sceneGraph.parameters.top_slab.value).toBe(800);
    expect(res.sceneGraph.parameters.haunch.value).toBe(600);
    expect(res.sceneGraph.parameters.cushion_thk.value).toBe(4000);

    // Outer width updated: 25000 + 2 * 850 = 26700 mm
    expect(res.sceneGraph.parameters.outer_w.value).toBe(26700);

    // Water flow area updated: 25.0 m * 4.1 m = 102.50 m²
    expect(res.sceneGraph.derivedMetrics?.waterFlowAreaM2).toBe(102.5);
  });

  // -------------------------------------------------------------------------
  // Test 9: Invariant Verification: Zero Conformal Scaling on Update
  // -------------------------------------------------------------------------
  it("Test 9: Invariant Verification — Zero Conformal Scaling on updateParameter()", async () => {
    // Start with 20 m T-beam bridge
    const initialRes = await agent.execute({
      prompt: "Draw the cross-section of an RCC T-beam bridge, span 20 m",
    });

    expect(initialRes.sceneGraph.parameters.span.value).toBe(20000);
    expect(Math.round(initialRes.sceneGraph.parameters.depth.value)).toBe(1667); // 20000 / 12
    expect(initialRes.sceneGraph.parameters.web_thk.value).toBe(350);

    // Update span from 20 m (20000 mm) to 25 m (25000 mm)
    const updatedRes = agent.updateParameter("span", 25000);

    expect(updatedRes.success).toBe(true);
    expect(updatedRes.sceneGraph.parameters.span.value).toBe(25000);
    // Depth derived via bound formula: 25000 / 12 = 2083 mm
    expect(Math.round(updatedRes.sceneGraph.parameters.depth.value)).toBe(2083);
    // INVARIANT: Web thickness MUST stay exactly 350 mm (no proportional stretching!)
    expect(updatedRes.sceneGraph.parameters.web_thk.value).toBe(350);
    // Flange width remains unchanged
    expect(updatedRes.sceneGraph.parameters.flange_w.value).toBe(2200);
  });

  // -------------------------------------------------------------------------
  // Test 10: Query Intent Classification
  // -------------------------------------------------------------------------
  it("Test 10: 'Query dimensions and clear height of current culvert'", async () => {
    const res = await agent.execute({
      prompt: "Query dimensions and clear height of current culvert",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("query");
    expect(res.routerDecision.suggestedPipeline).toBe("query_inspection");
  });

  // -------------------------------------------------------------------------
  // Test 11: Dimension Intent Classification
  // -------------------------------------------------------------------------
  it("Test 11: 'Add linear dimension for clear span between inner walls'", async () => {
    const res = await agent.execute({
      prompt: "Add linear dimension for clear span between inner walls",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("dimension");
    expect(res.routerDecision.suggestedPipeline).toBe("dimension_addition");
    expect(res.sceneGraph.nodes.some((n) => n.type === "dimension")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 12: Explain Intent Classification
  // -------------------------------------------------------------------------
  it("Test 12: 'Explain why effective depth is span/12 under IRC:112'", async () => {
    const res = await agent.execute({
      prompt: "Explain why effective depth is span/12 under IRC:112",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("explain");
    expect(res.routerDecision.modelTier).toBe("strong");
  });

  // -------------------------------------------------------------------------
  // Test 13: Model Selection Override ("use flash for this one")
  // -------------------------------------------------------------------------
  it("Test 13: Model override via prompt — 'use flash for this one'", async () => {
    const res = await agent.execute({
      prompt: "Draw a circle at (100, 100) with radius 40, use flash for this one",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.selectedModel).toBe("gemini-3.8-flash");
  });

  // -------------------------------------------------------------------------
  // Test 14: AutoCAD DXF Ingestion & Round-Trip Compatibility
  // -------------------------------------------------------------------------
  it("Test 14: Generated DXF can be parsed by UPCE DXF Importer into Shape[]", async () => {
    const res = await agent.execute({
      prompt: "Draw the cross-section of an RCC T-beam bridge, span 20 m",
    });

    expect(res.dxf).toContain("SECTION");
    expect(res.dxf).toContain("ENTITIES");

    // Ingest generated DXF through our engine's importDxfToShapes
    const importedShapes = importDxfToShapes(res.dxf);
    expect(importedShapes.length).toBeGreaterThan(5);
    expect(importedShapes.some((s) => s.type === "line")).toBe(true);
    expect(importedShapes.some((s) => s.type === "circle")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 15: Twin-Cell RCC Box Culvert with Parametric Intermediate Web
  // -------------------------------------------------------------------------
  it("Test 15: 'Draw a twin-cell RCC box culvert with span 4000 mm, height 3000 mm'", async () => {
    const res = await agent.execute({
      prompt: "Draw a twin-cell RCC box culvert with span 4000 mm, height 3000 mm",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.extractedEntities.cellCount).toBe(2);
    expect(res.sceneGraph.parameters.cells.value).toBe(2);
    expect(res.sceneGraph.parameters.span.value).toBe(4000);
    expect(res.sceneGraph.parameters.height.value).toBe(3000);
    expect(res.sceneGraph.parameters.web_mid.value).toBe(400);

    // 2 chambers + 1 intermediate web
    expect(res.sceneGraph.nodes.some((n) => n.id === "inner_chamber_1")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "inner_chamber_2")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "intermediate_web_1")).toBe(true);

    // Water flow area for 2 cells = 2 * (4.0 * 3.0) = 24.0 m²
    expect(res.sceneGraph.derivedMetrics?.waterFlowAreaM2).toBe(24);

    // INVARIANT TEST: Zero Conformal Scaling on updateParameter
    // Update span from 4000 mm to 5000 mm
    const updatedRes = agent.updateParameter("span", 5000);
    expect(updatedRes.success).toBe(true);
    expect(updatedRes.sceneGraph.parameters.span.value).toBe(5000);

    // Web thickness, wall thickness, haunches MUST remain strictly unscaled!
    expect(updatedRes.sceneGraph.parameters.web_mid.value).toBe(400);
    expect(updatedRes.sceneGraph.parameters.wall_thk.value).toBe(450);
    expect(updatedRes.sceneGraph.parameters.haunch.value).toBe(300);

    // Water flow area updates to 2 * (5.0 * 3.0) = 30.0 m²
    expect(updatedRes.sceneGraph.derivedMetrics?.waterFlowAreaM2).toBe(30);
  });

  // -------------------------------------------------------------------------
  // Test 16: Engineering Dimension Lines Rendered Across All Output Formats
  // -------------------------------------------------------------------------
  it("Test 16: Dimension rendering in UPCE Shape[], DXF string, and SVG string", async () => {
    // 1. Create a drawing with explicit dimensions
    const res = await agent.execute({
      prompt: "Draw the half-section of an RCC box culvert with span 10700 mm, height 4100 mm",
    });

    expect(res.success).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.type === "dimension")).toBe(true);

    // 2. UPCE Shape[] contains dimension lines and witness ticks
    const hasDimLine = res.shapes.some((s) => s.id.includes("_dim_line"));
    const hasWitnessTick = res.shapes.some((s) => s.id.includes("_tick_"));
    expect(hasDimLine).toBe(true);
    expect(hasWitnessTick).toBe(true);

    // 3. DXF R2010 contains DIMENSIONS layer and text
    expect(res.dxf).toContain("DIMENSIONS");
    expect(res.dxf).toContain("10700 mm");

    // 4. SVG contains white witness lines and dimension text
    expect(res.svg).toContain(`fill="#FFFFFF" text-anchor="middle"`);
    expect(res.svg).toContain("10700 mm");
  });

  // -------------------------------------------------------------------------
  // Test 17: Query Inspection Response Text & State Preservation
  // -------------------------------------------------------------------------
  it("Test 17: Query inspection produces detailed text and preserves active drawing", async () => {
    // Current culvert from Test 16 is active with span 10700 mm, height 4100 mm
    const res = await agent.execute({
      prompt: "Query dimensions and clear height of current culvert",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("query");
    expect(res.response).toBeDefined();
    expect(res.response).toContain("Active CAD Drawing Inspection Report");
    expect(res.response).toContain("span: 10700 mm");
    expect(res.response).toContain("height: 4100 mm");
    expect(res.response).toContain("Waterway Flow Area");
    expect(res.response).toContain("Estimated Project Cost");

    // CRITICAL: Active drawing geometry must NOT be wiped out by a query
    expect(res.sceneGraph.nodes.length).toBeGreaterThan(5);
    expect(res.shapes.length).toBeGreaterThan(5);
  });

  // -------------------------------------------------------------------------
  // Test 18: Engineering Explanation Synthesis (IRC:112 Standards)
  // -------------------------------------------------------------------------
  it("Test 18: Engineering explanation produces IRC:112 technical rationale", async () => {
    const res = await agent.execute({
      prompt: "Explain why effective depth is span/12 under IRC:112",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.intent).toBe("explain");
    expect(res.explanation).toBeDefined();
    expect(res.explanation).toContain("IRC:112 Clause 5.3.2.1");
    expect(res.explanation).toContain("L/800");
    expect(res.explanation).toContain("z ≈ 0.9d");
    expect(res.explanation).toContain("0.2 mm");
    expect(res.response).toBe(res.explanation);
  });

  // -------------------------------------------------------------------------
  // Test 19: Itemized Measurements, PWD BoQ & Cost Estimation Output
  // -------------------------------------------------------------------------
  it("Test 19: Itemized Measurements, PWD BoQ and Cost Estimation per doc2.md Part A §5", async () => {
    const res = await agent.execute({
      prompt: "Draw the half-section of an RCC box culvert with span 10700 mm, height 4100 mm, 800 mm slabs, 850 mm walls, 600 mm haunches, and 4000 mm cushion",
    });

    const metrics = res.sceneGraph.derivedMetrics;
    expect(metrics).toBeDefined();

    // Measurements (Item 1.1 Earthwork, 1.2 PCC, 1.3 RCC)
    expect(metrics?.measurements?.length).toBeGreaterThanOrEqual(3);
    const mExcav = metrics?.measurements?.find((m) => m.item === "1.1");
    const mPcc = metrics?.measurements?.find((m) => m.item === "1.2");
    const mRcc = metrics?.measurements?.find((m) => m.item === "1.3");
    expect(mExcav?.quantity).toBeGreaterThan(0);
    expect(mPcc?.quantity).toBeGreaterThan(0);
    expect(mRcc?.quantity).toBeGreaterThan(0);

    // Bill of Quantities (Line items with rates & amounts)
    expect(metrics?.billOfQuantities?.length).toBeGreaterThanOrEqual(4);
    const boqTotal = metrics?.billOfQuantities?.reduce((sum, item) => sum + item.amountInr, 0) ?? 0;
    expect(boqTotal).toBeGreaterThan(100000);

    // Estimated Cost (Base, Contingency 2%, TPQA 0.3%, GST 18%, Grand Total per doc2.md Part A §5)
    const cost = metrics?.estimatedCost;
    expect(cost).toBeDefined();
    expect(cost?.baseCost).toBe(boqTotal);
    expect(cost?.contingency).toBe(parseFloat((boqTotal * 0.02).toFixed(2)));
    expect(cost?.tpqa).toBe(parseFloat((boqTotal * 0.003).toFixed(2)));
    expect(cost?.gst).toBe(parseFloat((boqTotal * 0.18).toFixed(2)));
    expect(cost?.grandTotal).toBe(
      parseFloat(((cost?.baseCost ?? 0) + (cost?.contingency ?? 0) + (cost?.tpqa ?? 0) + (cost?.gst ?? 0)).toFixed(2))
    );
  });
});
