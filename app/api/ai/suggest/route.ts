/**
 * The advisor's only door to the network (UPCE-MASTER-1.0 §56).
 *
 * Server-side so credentials stay server-side. The browser posts an authoring
 * sketch and gets back reviewable suggestions; it never learns the project id,
 * the region, or the token.
 *
 * `GET` reports whether a model is configured without calling one, so the panel
 * can say "set GOOGLE_CLOUD_PROJECT to switch this on" instead of offering a
 * button that fails.
 */

import { NextResponse } from "next/server";
import { adviseOnSketch } from "@/lib/ai/constraintAdvisor";
import { generateJson, readVertexConfig, vertexStatus } from "@/lib/ai/vertexTransport";
import type { AuthoringSketch } from "@/lib/upce/types";

export const runtime = "nodejs";

export async function GET() {
  const status = vertexStatus();
  // The token and the project id are deliberately absent from this body.
  return NextResponse.json({
    configured: status.configured,
    mode: status.mode,
    model: status.model,
    location: status.location,
    detail: status.detail,
  });
}

export async function POST(request: Request) {
  const config = readVertexConfig();
  const status = vertexStatus(config);

  let body: { sketch?: AuthoringSketch; names?: Record<string, string>; drawingHint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.sketch) {
    return NextResponse.json({ error: "No sketch in the request." }, { status: 400 });
  }

  const transport = status.configured
    ? {
        generate: (req: { systemPrompt: string; payload: unknown; schema: unknown }) =>
          generateJson(req, config),
      }
    : null;

  const result = await adviseOnSketch(body.sketch, transport, {
    names: body.names,
    drawingHint: body.drawingHint,
  });

  // Not configured is a 200 with an explanation, not an error: the drawing is
  // fine, the assistant is simply switched off.
  return NextResponse.json(
    status.configured ? result : { ...result, unavailableReason: status.detail }
  );
}
