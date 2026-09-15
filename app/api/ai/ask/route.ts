/**
 * Questions about the drawing (UPCE-MASTER-1.0 §56).
 *
 * Separate from `/api/ai/suggest` because the two are different in kind, not
 * just in shape. A suggestion becomes something the author can accept, so it is
 * decoded against a schema and passed through the admissibility gate. An answer
 * becomes words on a screen and changes nothing — so it is prose, and its
 * safeguard is that every fact it can use was computed by the kernel and sent
 * with the question.
 *
 * Server-side for the same reason as the other route: the credentials stay here.
 */

import { NextResponse } from "next/server";
import { askAboutDrawing, type DrawingFacts, type QaTurn } from "@/lib/ai/drawingQa";
import { generateJson, readVertexConfig, vertexStatus } from "@/lib/ai/vertexTransport";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = readVertexConfig();
  const status = vertexStatus(config);

  let body: { question?: string; facts?: DrawingFacts; history?: QaTurn[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.question || !body.facts) {
    return NextResponse.json({ error: "Send a question and the drawing facts." }, { status: 400 });
  }

  if (!status.configured) {
    return NextResponse.json({
      answer: "",
      citedValues: [],
      source: "unavailable",
      unavailableReason: status.detail,
      elapsedMs: 0,
    });
  }

  const result = await askAboutDrawing(
    body.question,
    body.facts,
    {
      // No schema: a prose answer, not a structured one.
      generate: (req) => generateJson({ ...req, schema: undefined }, config),
    },
    body.history ?? []
  );

  return NextResponse.json(result);
}
