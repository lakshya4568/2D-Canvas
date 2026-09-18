import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CadAgent } from "../../lib/agent/cadAgent";
import { validateSceneGraphIR } from "../../lib/agent/sceneGraphSchema";
import type { LlmProvider, ModelRequest, ModelResponse } from "../../lib/agent/types";

const REPO_IMAGE_PATH = path.resolve(__dirname, "../../image.png");

describe("Autonomous Agentic Loop (gemini-3.8-flash) & Reference Image Suite", () => {
  const agent = new CadAgent();

  // -------------------------------------------------------------------------
  // Test 1: Full Autonomous Loop (Observe -> Reason -> Act -> Inspect -> Verify)
  // -------------------------------------------------------------------------
  it("Test 1: should execute full autonomous loop for gemini-3.8-flash with progressTrace", async () => {
    const res = await agent.execute({
      prompt: "Draw the half-section of an RCC box culvert with span 10700 mm, height 4100 mm, 800 mm slabs, 850 mm walls, 600 mm haunches, and 4000 mm cushion",
      modelOverride: "gemini-3.8-flash",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.selectedModel).toBe("gemini-3.8-flash");

    // Verify progress trace existence and structure
    expect(res.progressTrace).toBeDefined();
    expect(res.progressTrace!.length).toBeGreaterThanOrEqual(4);

    const phases = res.progressTrace!.map((s) => s.phase);
    expect(phases).toContain("observe");
    expect(phases).toContain("reason");
    expect(phases).toContain("act");
    expect(phases).toContain("inspect");
    expect(phases).toContain("verify");

    // Verify observation & reasoning
    const observeStep = res.progressTrace!.find((s) => s.phase === "observe");
    expect(observeStep?.observation).toBeDefined();

    const reasonStep = res.progressTrace!.find((s) => s.phase === "reason");
    expect(reasonStep?.thought).toContain("Zero Conformal Scaling");
    expect(reasonStep?.thought).toContain("Planar Rigid-Body Anchor");

    // Verify inspection steps: inspect_geometry and dof_analysis
    const inspectSteps = res.progressTrace!.filter((s) => s.phase === "inspect");
    expect(inspectSteps.some((s) => s.toolCall?.tool === "inspect_geometry")).toBe(true);
    expect(inspectSteps.some((s) => s.toolCall?.tool === "dof_analysis")).toBe(true);

    // Verify goal verification
    const verifyStep = res.progressTrace!.find((s) => s.phase === "verify");
    expect(verifyStep?.toolCall?.tool).toBe("verify_goal");
    expect(verifyStep?.verification?.passed).toBe(true);
    expect(verifyStep?.verification?.checks?.length).toBeGreaterThan(0);

    // Verify SceneGraph validity
    expect(res.sceneGraph.validation.isValid).toBe(true);
    expect(res.sceneGraph.parameters.span.value).toBe(10700);
    expect(res.sceneGraph.parameters.height.value).toBe(4100);
    expect(res.sceneGraph.parameters.wall_thk.value).toBe(850);
  });

  // -------------------------------------------------------------------------
  // Test 2: Reference Image (image.png) End-to-End Reconstruction with Span 25 m
  // -------------------------------------------------------------------------
  it("Test 2: should autonomously reconstruct clean 2D CAD geometry from image.png with span 25 m", async () => {
    expect(fs.existsSync(REPO_IMAGE_PATH)).toBe(true);
    const base64Img = fs.readFileSync(REPO_IMAGE_PATH).toString("base64");

    const res = await agent.execute({
      prompt: "Reconstruct clean 2D CAD geometry from reference diagram with span 25 m",
      image: {
        path: REPO_IMAGE_PATH,
        base64: base64Img,
        mimeType: "image/png",
      },
      modelOverride: "gemini-3.8-flash",
    });

    expect(res.success).toBe(true);
    expect(res.routerDecision.inputMode).toBe("text+image");
    expect(res.routerDecision.selectedModel).toBe("gemini-3.8-flash");

    // Verify clear span scaled to 25 m (25000 mm)
    expect(res.sceneGraph.parameters.span.value).toBe(25000);

    // CRITICAL INVARIANT: Zero Conformal Scaling (§8, §29.4, §81)
    // Wall thickness, slab thickness, haunches, and cushion MUST remain unscaled!
    expect(res.sceneGraph.parameters.wall_thk.value).toBe(850);
    expect(res.sceneGraph.parameters.top_slab.value).toBe(800);
    expect(res.sceneGraph.parameters.bot_slab.value).toBe(800);
    expect(res.sceneGraph.parameters.haunch.value).toBe(600);
    expect(res.sceneGraph.parameters.cushion_thk.value).toBe(4000);

    // Outer width updated: 25000 + 2 * 850 = 26700 mm
    expect(res.sceneGraph.parameters.outer_w.value).toBe(26700);

    // Water flow area updated: 25.0 m * 4.1 m = 102.50 m²
    expect(res.sceneGraph.derivedMetrics?.waterFlowAreaM2).toBe(102.5);

    // Verify Planar Rigid Anchor rule (§18)
    expect(
      res.sceneGraph.validation.checks.some(
        (c) => c.code === "UPCE-SEC-18-RIGID-ANCHOR" && c.status === "PASS"
      )
    ).toBe(true);

    // Verify progress trace contains goal verification
    const vStep = res.progressTrace?.find((s) => s.phase === "verify");
    expect(vStep?.verification?.passed).toBe(true);
    const checks = vStep?.verification?.checks || [];
    expect(checks.some((c: any) => c.name.includes("Rigid-Body Anchor") && c.status === "PASS")).toBe(true);
    expect(checks.some((c: any) => c.name.includes("Clear Span") && c.status === "PASS")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3: Parametric Responsiveness After Autonomous Loop
  // -------------------------------------------------------------------------
  it("Test 3: should cascade parameter modifications via DAG without conformal distortion", async () => {
    // Initial execution with reference image
    const base64Img = fs.readFileSync(REPO_IMAGE_PATH).toString("base64");
    await agent.execute({
      prompt: "Reconstruct clean 2D CAD geometry from reference diagram with span 25 m",
      image: { base64: base64Img, mimeType: "image/png" },
      modelOverride: "gemini-3.8-flash",
    });

    // Cascade modification: update span to 30000 mm
    const updated = agent.updateParameter("span", 30000);
    expect(updated.success).toBe(true);
    expect(updated.sceneGraph.parameters.span.value).toBe(30000);

    // Derived outer width: 30000 + 2 * 850 = 31700 mm
    expect(updated.sceneGraph.parameters.outer_w.value).toBe(31700);

    // INVARIANT: Undriven members MUST remain strictly constant
    expect(updated.sceneGraph.parameters.wall_thk.value).toBe(850);
    expect(updated.sceneGraph.parameters.top_slab.value).toBe(800);
    expect(updated.sceneGraph.parameters.haunch.value).toBe(600);
    expect(updated.sceneGraph.parameters.cushion_thk.value).toBe(4000);
  });

  // -------------------------------------------------------------------------
  // Test 4: Realtime Streaming Progress Callback
  // -------------------------------------------------------------------------
  it("Test 4: should stream progressTrace steps sequentially via onProgress callback", async () => {
    const streamedSteps: any[] = [];

    const res = await agent.execute({
      prompt: "Draw a rectangle 500x300 at origin",
      modelOverride: "gemini-3.8-flash",
      onProgress: (step) => {
        streamedSteps.push(step);
      },
    });

    expect(res.success).toBe(true);
    expect(streamedSteps.length).toBeGreaterThanOrEqual(4);
    expect(streamedSteps.map((s) => s.phase)).toEqual(
      expect.arrayContaining(["observe", "reason", "act", "inspect", "verify"])
    );
    expect(streamedSteps.length).toBe(res.progressTrace?.length);
  });

  // -------------------------------------------------------------------------
  // Test 5: Multi-Turn LLM Provider with Mock Gemini Function Calling
  // -------------------------------------------------------------------------
  it("Test 5: should handle multi-turn LLM functionCalling loop with mock provider", async () => {
    let callCount = 0;

    const mockProvider: LlmProvider = {
      id: "vertex",
      name: "Mock Vertex Gemini 3.8 Flash",
      async isAvailable() {
        return true;
      },
      supportsTools() {
        return true;
      },
      supportsVision() {
        return true;
      },
      async generate(request: ModelRequest): Promise<ModelResponse> {
        callCount++;
        if (callCount === 1) {
          return {
            content: "I will declare parameter and draw box culvert centerline.",
            thinking: "Declaring span=12000 mm and drafting reference centerline.",
            toolCalls: [
              {
                id: "c1",
                tool: "create_parameter",
                args: { name: "span", value: 12000, unit: "mm", role: "DRIVING" },
              },
              {
                id: "c2",
                tool: "draw_line",
                args: { id: "centerline", x1: "0", y1: "0", x2: "0", y2: "6000", isReference: true, layer: "CENTERLINE" },
              },
            ],
            modelUsed: "gemini-3.8-flash",
            latencyMs: 12,
          };
        } else if (callCount === 2) {
          return {
            content: "Inspecting geometric state and DOF status.",
            thinking: "Checking constraints and rigid anchor.",
            toolCalls: [
              {
                id: "c3",
                tool: "inspect_geometry",
                args: {},
              },
              {
                id: "c4",
                tool: "dof_analysis",
                args: {},
              },
            ],
            modelUsed: "gemini-3.8-flash",
            latencyMs: 10,
          };
        } else if (callCount === 3) {
          return {
            content: "Anchor centerline and verify goal.",
            thinking: "Anchoring 3 DOF per §18 and running goal verification.",
            toolCalls: [
              {
                id: "c5",
                tool: "add_constraint",
                args: { id: "anchor_cl", type: "rigid_anchor", entityA: "centerline", value: 0 },
              },
              {
                id: "c6",
                tool: "verify_goal",
                args: { expectedSpan: 12000, checkRigidAnchor: true },
              },
            ],
            modelUsed: "gemini-3.8-flash",
            latencyMs: 11,
          };
        } else {
          return {
            content: "All design criteria satisfied.",
            thinking: "Finalizing drawing.",
            toolCalls: [
              {
                id: "c7",
                tool: "complete_drawing",
                args: { status: "GOAL_SATISFIED", summary: "Mock autonomous loop verified." },
              },
            ],
            modelUsed: "gemini-3.8-flash",
            latencyMs: 9,
          };
        }
      },
    };

    const res = await agent.execute({
      prompt: "Draw culvert with span 12000 mm",
      modelOverride: "gemini-3.8-flash",
      providerOverride: mockProvider,
    });

    expect(res.success).toBe(true);
    expect(callCount).toBe(4);
    expect(res.progressTrace).toBeDefined();
    expect(res.progressTrace!.some((s) => s.toolCall?.tool === "complete_drawing")).toBe(true);
    expect(res.sceneGraph.parameters.span.value).toBe(12000);
    // Crucial Bug Fix Verification: The agent's custom centerline MUST be preserved in res.shapes and sceneGraph
    expect(res.shapes.some((s) => s.id === "centerline")).toBe(true);
    expect(res.sceneGraph.nodes.some((n) => n.id === "centerline")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 6: Error Recovery & Tool Failure Handling
  // -------------------------------------------------------------------------
  it("Test 6: should safely handle tool errors, record error status, and recover", async () => {
    let callCount = 0;

    const mockProviderWithError: LlmProvider = {
      id: "vertex",
      name: "Mock Provider with Tool Error",
      async isAvailable() {
        return true;
      },
      supportsTools() {
        return true;
      },
      supportsVision() {
        return true;
      },
      async generate(request: ModelRequest): Promise<ModelResponse> {
        callCount++;
        if (callCount === 1) {
          // Intentionally issue a tool call that triggers an error
          return {
            content: "Trimming non-existent entity to test error recovery.",
            toolCalls: [
              {
                id: "c_err",
                tool: "trim",
                args: { entityId: "non_existent_entity_404", endpoint: "start", targetX: 100, targetY: 100 },
              },
            ],
            modelUsed: "gemini-3.8-flash",
            latencyMs: 15,
          };
        } else {
          // Recovers by drawing valid line and completing
          return {
            content: "Recovered from trim error: drafting valid line and completing.",
            toolCalls: [
              {
                id: "c_rec",
                tool: "draw_line",
                args: { id: "recovered_line", x1: "0", y1: "0", x2: "500", y2: "500" },
              },
              {
                id: "c_comp",
                tool: "complete_drawing",
                args: { status: "GOAL_SATISFIED" },
              },
            ],
            modelUsed: "gemini-3.8-flash",
            latencyMs: 10,
          };
        }
      },
    };

    const res = await agent.execute({
      prompt: "Test error recovery",
      modelOverride: "gemini-3.8-flash",
      providerOverride: mockProviderWithError,
    });

    expect(res.success).toBe(true);
    const errStep = res.progressTrace?.find((s) => s.toolCall?.tool === "trim");
    expect(errStep).toBeDefined();
    expect(errStep?.toolResult?.success).toBe(false);
    expect(errStep?.toolResult?.error).toContain("not found");

    // Verify recovery occurred
    const completeStep = res.progressTrace?.find((s) => s.toolCall?.tool === "complete_drawing");
    expect(completeStep?.toolResult?.success).toBe(true);

    // Verify recovered geometry is present in final canvas shapes
    expect(res.shapes.some((s) => s.id === "recovered_line")).toBe(true);
    expect(res.shapes.every((s) => s.id !== "non_existent_entity_404")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 7: Model Restriction Isolation
  // -------------------------------------------------------------------------
  it("Test 7: should preserve non-agentic behavior for models other than gemini-3.8-flash", async () => {
    // Model 'deterministic'
    const detRes = await agent.execute({
      prompt: "Draw a circle at (100, 100) with radius 40",
      modelOverride: "deterministic-engine",
    });
    expect(detRes.success).toBe(true);
    expect(detRes.routerDecision.selectedModel).toBe("deterministic-engine");
    // Progress trace is only generated for gemini-3.8-flash autonomous loop
    expect(detRes.progressTrace).toBeUndefined();

    // Model 'gemini-3.5-flash-lite'
    const fastRes = await agent.execute({
      prompt: "Draw a rectangle 200x100",
      modelOverride: "gemini-3.5-flash-lite",
    });
    expect(fastRes.success).toBe(true);
    expect(fastRes.routerDecision.selectedModel).toBe("gemini-3.5-flash-lite");
    expect(fastRes.progressTrace).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 8: Universal Rigid-Body Anchor Self-Correction (§18 Invariant)
  // -------------------------------------------------------------------------
  it("Test 8: should perform automatic rigid-body anchor self-correction (§18) when omitted by agent", async () => {
    const unanchoredProvider: LlmProvider = {
      id: "vertex",
      name: "Mock Provider Omission of Rigid Anchor",
      async isAvailable() {
        return true;
      },
      supportsTools() {
        return true;
      },
      supportsVision() {
        return true;
      },
      async generate(): Promise<ModelResponse> {
        return {
          modelUsed: "gemini-3.8-flash",
          latencyMs: 0,
          content: "Drawing line without fixing rigid anchor.",
          toolCalls: [
            {
              id: "c_line",
              tool: "draw_line",
              args: { id: "custom_unanchored_line", x1: "0", y1: "0", x2: "2000", y2: "0" },
            },
            {
              id: "c_comp",
              tool: "complete_drawing",
              args: { status: "GOAL_SATISFIED" },
            },
          ],
        };
      },
    };

    const res = await agent.execute({
      prompt: "Draw custom unanchored line",
      modelOverride: "gemini-3.8-flash",
      providerOverride: unanchoredProvider,
    });

    expect(res.success).toBe(true);
    expect(res.shapes.some((s) => s.id === "custom_unanchored_line")).toBe(true);

    // Planar Rigid-Body Anchor Rule Invariant (§18) must pass
    expect(res.sceneGraph.validation.isValid).toBe(true);
    expect(
      res.sceneGraph.validation.checks.some(
        (c) => c.code === "UPCE-SEC-18-RIGID-ANCHOR" && c.status === "PASS"
      )
    ).toBe(true);

    // Trace must record self-correction phase
    const correctStep = res.progressTrace?.find((s) => s.phase === "correct");
    expect(correctStep).toBeDefined();
    expect(correctStep?.toolCall?.tool).toBe("add_constraint");
    expect(correctStep?.toolCall?.args.type).toBe("rigid_anchor");
  });

  // -------------------------------------------------------------------------
  // Test 9: Server-Sent Events (SSE) Realtime Streaming API Endpoint
  // -------------------------------------------------------------------------
  it("Test 9: should stream progress steps sequentially using Server-Sent Events (SSE) via POST /api/ai/agent route", async () => {
    const { POST } = await import("../../app/api/ai/agent/route");

    const req = new Request("http://localhost:3000/api/ai/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        prompt: "Draw the half-section of an RCC box culvert with span 10700 mm, height 4100 mm",
        modelOverride: "gemini-3.8-flash",
        stream: true,
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const rawText = await response.text();
    expect(rawText).toContain("data: {\"type\":\"step\"");
    expect(rawText).toContain("data: {\"type\":\"result\"");

    // Parse streaming steps from raw SSE text
    const lines = rawText.split("\n").filter((l) => l.startsWith("data: "));
    const events = lines.map((l) => JSON.parse(l.slice(6)));

    const steps = events.filter((e) => e.type === "step").map((e) => e.step);
    expect(steps.length).toBeGreaterThanOrEqual(4);

    const resultEvent = events.find((e) => e.type === "result");
    expect(resultEvent?.result?.success).toBe(true);
    expect(resultEvent?.result?.shapes?.length).toBeGreaterThan(0);
    expect(resultEvent?.result?.sceneGraph?.parameters?.span?.value).toBe(10700);
  });
});
