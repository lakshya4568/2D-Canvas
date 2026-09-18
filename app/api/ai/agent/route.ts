/**
 * CAD Agent v2 — API Route Handler (UPCE-MASTER-1.0 §56, §69)
 *
 * REST Endpoint for CAD Agent v2:
 * POST /api/ai/agent
 * Body:
 * {
 *   prompt: string;
 *   image?: { base64?: string; mimeType?: string; path?: string };
 *   modelOverride?: string;
 *   activeParameters?: Record<string, number>;
 * }
 */

import { NextResponse } from "next/server";
import { CadAgent } from "@/lib/agent/cadAgent";

export const runtime = "nodejs";

const agent = new CadAgent();

export async function POST(request: Request) {
  const t0 = Date.now();
  let body: {
    prompt?: string;
    image?: { base64?: string; mimeType?: string; path?: string };
    modelOverride?: string;
    activeParameters?: Record<string, number>;
    operations?: Array<{ tool: string; args?: Record<string, any>; [key: string]: any }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const prompt = body.prompt?.trim() || "";
  const hasOperations = Array.isArray(body.operations) && body.operations.length > 0;
  if (!prompt && !body.image && !hasOperations) {
    return NextResponse.json(
      { error: "Either prompt, image, or operations must be provided." },
      { status: 400 }
    );
  }

  const wantsStream =
    (body as any).stream === true ||
    request.headers.get("accept") === "text/event-stream";

  if (wantsStream) {
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        try {
          const result = await agent.execute({
            prompt,
            image: body.image,
            modelOverride: body.modelOverride,
            activeParameters: body.activeParameters,
            operations: body.operations,
            onProgress: (step) => {
              const payload = JSON.stringify({ type: "step", step });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            },
          });

          const finalPayload = JSON.stringify({
            type: "result",
            result: {
              success: true,
              prompt: result.prompt,
              routerDecision: result.routerDecision,
              plan: result.plan,
              toolResults: result.toolResults,
              sceneGraph: result.sceneGraph,
              shapes: result.shapes,
              dxf: result.dxf,
              svg: result.svg,
              previewPng: result.previewPng,
              logs: result.logs,
              progressTrace: result.progressTrace,
              response: result.response,
              explanation: result.explanation,
              thinking: result.thinking,
              executionTimeMs: result.executionTimeMs,
            },
          });
          controller.enqueue(encoder.encode(`data: ${finalPayload}\n\n`));
          controller.close();
        } catch (err: any) {
          const errPayload = JSON.stringify({
            type: "error",
            error: err?.message || String(err),
          });
          controller.enqueue(encoder.encode(`data: ${errPayload}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const result = await agent.execute({
      prompt,
      image: body.image,
      modelOverride: body.modelOverride,
      activeParameters: body.activeParameters,
      operations: body.operations,
    });

    return NextResponse.json({
      success: true,
      prompt: result.prompt,
      routerDecision: result.routerDecision,
      plan: result.plan,
      toolResults: result.toolResults,
      sceneGraph: result.sceneGraph,
      shapes: result.shapes,
      dxf: result.dxf,
      svg: result.svg,
      previewPng: result.previewPng,
      logs: result.logs,
      progressTrace: result.progressTrace,
      response: result.response,
      explanation: result.explanation,
      thinking: result.thinking,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || String(err),
        executionTimeMs: Date.now() - t0,
      },
      { status: 500 }
    );
  }
}

import { readVertexConfig, vertexStatus } from "@/lib/ai/vertexTransport";

export async function GET() {
  const vConfig = readVertexConfig();
  const vStatus = vertexStatus(vConfig);

  return NextResponse.json({
    models: [
      {
        id: "gemini-3.8-flash",
        name: "Google Gemini 3.8 Flash",
        tier: "strong",
        provider: "vertex",
        configured: vStatus.configured,
        details: vStatus.configured
          ? "Vertex AI reasoning, thinking trace & UPCE CAD tools"
          : vStatus.detail,
        supportsVision: true,
        supportsThinking: true,
        supportsTools: true,
      },
      {
        id: "auto",
        name: "Auto Router",
        tier: "adaptive",
        provider: "router",
        configured: true,
        details: "Adaptive routing based on prompt intent, mode, and engineering complexity",
        supportsVision: true,
        supportsThinking: true,
        supportsTools: true,
      },
      {
        id: "deterministic",
        name: "UPCE Local Solver (§57)",
        tier: "offline_fallback",
        provider: "local",
        configured: true,
        details: "Instant offline parametric engineering solver",
        supportsVision: true,
        supportsThinking: false,
        supportsTools: true,
      },
    ],
    cadBackend: {
      name: "UPCE Native Kernel",
      status: "active",
      toolsCount: 15,
    },
    defaultModel: vStatus.configured ? "gemini-3.8-flash" : "auto",
  });
}
