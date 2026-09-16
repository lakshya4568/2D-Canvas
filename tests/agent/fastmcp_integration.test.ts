/**
 * FastMCP CAD Server Integration Test Suite
 * UPCE-MASTER-1.0 §56, §69
 *
 * Verifies:
 * 1. FastMcpProvider connectivity & Python bridge execution via `uv run`
 * 2. CadExecutor mapping FastMCP DXF output to native UPCE Shape[] models
 * 3. CadAgent orchestrator execution with modelOverride: "fastmcp"
 * 4. Visual self-verification preview PNG generation
 * 5. State dispatch compatibility with LOAD_SHAPES in drawing reducer
 */

import { describe, it, expect } from "vitest";
import { FastMcpProvider } from "../../lib/agent/models/fastMcpProvider";
import { CadAgent } from "../../lib/agent/cadAgent";
import { CadExecutor } from "../../lib/agent/executor";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";
import { GET as getAgentModels, POST as postAgent } from "../../app/api/ai/agent/route";

describe("FastMCP Server (ezdxf) — CAD Engine & Canvas Integration", () => {
  const fastMcp = new FastMcpProvider();
  const executor = new CadExecutor();
  const agent = new CadAgent();

  it("should verify FastMcpProvider is available via uv run", async () => {
    const available = await fastMcp.isAvailable();
    expect(available).toBe(true);
    expect(fastMcp.id).toBe("fastmcp");
    expect(fastMcp.supportsTools()).toBe(true);
    expect(fastMcp.supportsVision()).toBe(true);
  });

  it("should execute bridge with direct draw_entities and return DXF + preview PNG", async () => {
    const res = await fastMcp.executeBridge({
      operations: [
        {
          tool: "draw_entities",
          args: {
            entities: [
              {
                entity_type: "circle",
                params: { center: [200, 150], radius: 50 },
                layer: "OUTLINE",
              },
              {
                entity_type: "rectangle",
                params: { origin: [0, 0], width: 400, height: 250 },
                layer: "OUTLINE",
              },
            ],
          },
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.entityCount).toBe(2);
    expect(res.dxf).toContain("SECTION");
    expect(res.dxf).toContain("CIRCLE");
    expect(res.previewPng).toBeTruthy();
    expect(res.previewPng.length).toBeGreaterThan(100);

    // Map DXF to native UPCE Shape[]
    const shapes = executor.mapDxfToShapes(res.dxf);
    expect(shapes.length).toBe(2);

    const circle = shapes.find((s) => s.type === "circle");
    expect(circle).toBeDefined();
    if (circle && circle.type === "circle") {
      expect(circle.cx).toBe(200);
      expect(circle.cy).toBe(150);
      expect(circle.r).toBe(50);
    }

    const rect = shapes.find((s) => s.type === "rectangle");
    expect(rect).toBeDefined();
    if (rect && rect.type === "rectangle") {
      expect(rect.width).toBe(400);
      expect(rect.height).toBe(250);
    }
  });

  it("should execute CadAgent with modelOverride: 'fastmcp' for natural-language prompt", async () => {
    const result = await agent.execute({
      prompt: "Draw a circle at (200, 150) with radius 50",
      modelOverride: "fastmcp",
    });

    expect(result.success).toBe(true);
    expect(result.routerDecision.selectedModel).toBe("fastmcp");
    expect(result.shapes.length).toBeGreaterThanOrEqual(1);

    // Verify visual self-verification preview PNG is returned
    expect(result.previewPng).toBeDefined();
    expect(result.previewPng!.length).toBeGreaterThan(100);

    // Verify DXF string
    expect(result.dxf).toContain("CIRCLE");

    // Verify shapes have correct geometry
    const circleShape = result.shapes.find((s) => s.type === "circle");
    expect(circleShape).toBeDefined();
    if (circleShape && circleShape.type === "circle") {
      expect(circleShape.cx).toBe(200);
      expect(circleShape.cy).toBe(150);
      expect(circleShape.r).toBe(50);
    }

    // Verify state dispatch to DrawingContext LOAD_SHAPES
    const nextState = drawingReducer(initialDrawingState, {
      type: "LOAD_SHAPES",
      shapes: result.shapes,
    });
    expect(nextState.shapes.length).toBe(result.shapes.length);
    expect(nextState.shapes.some((s) => s.type === "circle")).toBe(true);
  });

  it("should execute complex steel plate prompt with FastMCP and produce multiple shapes", async () => {
    const result = await agent.execute({
      prompt: "Draw a rectangular steel plate 400x250 with 4 corner bolt holes r=15 and centerlines",
      modelOverride: "fastmcp",
    });

    expect(result.success).toBe(true);
    expect(result.shapes.length).toBeGreaterThanOrEqual(5);
    expect(result.previewPng).toBeDefined();

    // Verify circles (bolt holes) and lines (centerlines) or rectangle
    const circles = result.shapes.filter((s) => s.type === "circle");
    expect(circles.length).toBe(4);

    // Dispatch to drawing reducer
    const nextState = drawingReducer(initialDrawingState, {
      type: "LOAD_SHAPES",
      shapes: result.shapes,
    });
    expect(nextState.shapes.length).toBe(result.shapes.length);
  });

  it("should register 'fastmcp' as CAD execution backend in GET /api/ai/agent endpoint", async () => {
    const res = await getAgentModels();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.cadBackend).toBeDefined();
    expect(data.cadBackend.name).toContain("FastMCP");
    expect(data.cadBackend.status).toBe("active");
    expect(data.cadBackend.toolsCount).toBe(7);

    // Models list should contain actual reasoning LLMs
    const gemini = data.models.find((m: any) => m.id === "gemini-3.8-flash");
    expect(gemini).toBeDefined();
  });

  it("should forward explicit operations array through CadAgent to FastMCP bridge", async () => {
    const result = await agent.execute({
      prompt: "",
      operations: [
        {
          tool: "draw_entities",
          args: {
            entities: [
              { entity_type: "circle", params: { center: [50, 50], radius: 25 }, layer: "OUTLINE" },
              { entity_type: "line", params: { start: [0, 0], end: [100, 0] }, layer: "OUTLINE" },
            ],
          },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.routerDecision.selectedModel).toBe("fastmcp");
    expect(result.shapes.length).toBeGreaterThanOrEqual(2);
    expect(result.dxf).toContain("CIRCLE");
    expect(result.dxf).toContain("LINE");
    expect(result.previewPng).toBeTruthy();
  });

  it("should handle operations-only payload in POST /api/ai/agent route and return shapes", async () => {
    const req = new Request("http://localhost:3000/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operations: [
          {
            tool: "draw_entities",
            args: {
              entities: [
                { entity_type: "rectangle", params: { origin: [10, 20], width: 300, height: 150 }, layer: "OUTLINE" },
              ],
            },
          },
        ],
      }),
    });

    const res = await postAgent(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.shapes.length).toBe(1);
    expect(data.shapes[0].type).toBe("rectangle");
    expect(data.shapes[0].width).toBe(300);
    expect(data.shapes[0].height).toBe(150);
    expect(data.previewPng).toBeTruthy();
  });

  it("should execute arc prompt with FastMCP and convert into UPCE canvas shapes", async () => {
    const result = await agent.execute({
      prompt: "Draw an arc at (100, 100) with radius 75 from 0 to 180",
      modelOverride: "fastmcp",
    });

    expect(result.success).toBe(true);
    expect(result.shapes.length).toBeGreaterThanOrEqual(1);
    expect(result.dxf).toContain("ARC");
    expect(result.previewPng).toBeTruthy();
  });

  it("should execute text annotation prompt with FastMCP and produce valid DXF", async () => {
    const result = await agent.execute({
      prompt: "Draw text 'FOUNDATION A1' at (50, 100) height 20",
      modelOverride: "fastmcp",
    });

    expect(result.success).toBe(true);
    expect(result.dxf).toContain("TEXT");
    expect(result.dxf).toContain("FOUNDATION A1");
    expect(result.previewPng).toBeTruthy();
  });
});
