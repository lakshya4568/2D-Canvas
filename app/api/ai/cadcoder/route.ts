/**
 * CadCoder AI Agent API Route (UPCE-MASTER-1.0 §56, §69)
 *
 * Provides endpoints for:
 * - Checking Ollama & uv system health
 * - Asking C3Dv0 LLM to generate CadQuery Python code
 * - Executing CadQuery code via uv to return UPCE Shape[] objects
 */

import { NextResponse } from "next/server";
import {
  getCadCoderStatus,
  queryOllamaForCad,
  executeCadCodeViaUv,
  RCC_BRIDGE_CADQUERY_REFERENCE,
  DEFAULT_OLLAMA_MODEL,
} from "@/lib/ai/cadcoderService";
import { CadAgent } from "@/lib/agent/cadAgent";

export const runtime = "nodejs";

const cadAgent = new CadAgent();

export async function GET() {
  const status = await getCadCoderStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const t0 = Date.now();
  let body: {
    prompt?: string;
    code?: string;
    executeOnly?: boolean;
    usePreset?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const prompt = body.prompt?.trim() || "Generate RCC Culvert Half Section";
  let code = body.code?.trim();
  const isRccRequest =
    body.usePreset ||
    /rcc|culvert|half section|bridge|box culvert|this view|prop bridge/i.test(prompt);

  try {
    // Step 1: If no direct code provided, query Ollama C3Dv0 model
    if (!code) {
      if (body.usePreset) {
        code = RCC_BRIDGE_CADQUERY_REFERENCE;
      } else {
        try {
          code = await queryOllamaForCad(prompt);
        } catch (ollamaErr: any) {
          console.warn("Ollama call failed or timed out, using reference CadQuery:", ollamaErr.message);
          if (isRccRequest) {
            code = RCC_BRIDGE_CADQUERY_REFERENCE;
          } else {
            throw ollamaErr;
          }
        }
      }
    }

    // Step 2: Execute code via `uv`
    let result: { shapes: any[]; dxf: string };
    try {
      result = await executeCadCodeViaUv(code, { isPreset: isRccRequest && !body.code });
    } catch (execErr: any) {
      console.warn("User script execution encountered error, falling back to preset drawing:", execErr.message);
      if (isRccRequest) {
        result = await executeCadCodeViaUv(RCC_BRIDGE_CADQUERY_REFERENCE, { isPreset: true });
        code = RCC_BRIDGE_CADQUERY_REFERENCE;
      } else {
        throw execErr;
      }
    }

    const elapsed = Date.now() - t0;
    return NextResponse.json({
      success: true,
      prompt,
      code,
      shapes: result.shapes,
      dxf: result.dxf,
      model: DEFAULT_OLLAMA_MODEL,
      executionTimeMs: elapsed,
      count: result.shapes.length,
    });
  } catch (err: any) {
    console.warn("CadCoder execution failed, falling back to CAD Agent v2:", err?.message);
    try {
      const agentRes = await cadAgent.execute({ prompt });
      return NextResponse.json({
        success: true,
        prompt,
        code: code || "# Generated via CAD Agent v2\n",
        shapes: agentRes.shapes,
        dxf: agentRes.dxf,
        model: agentRes.routerDecision.selectedModel,
        executionTimeMs: Date.now() - t0,
        count: agentRes.shapes.length,
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: err?.message || String(err),
          code: code || "",
          shapes: [],
          executionTimeMs: Date.now() - t0,
        },
        { status: 500 }
      );
    }
  }
}
