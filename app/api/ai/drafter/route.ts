/**
 * The drafting agent, over Server-Sent Events.
 *
 *   GET   which models are offered and whether Google Cloud is configured
 *   POST  { prompt, images?, state?, model? }  ->  a stream of DrafterEvents
 *
 * Credentials never leave this process: the transport reads the gcloud login
 * and project from the server's environment (the shell profile, or gcloud's own
 * config when the server was not started from a shell). The browser only ever
 * receives events.
 *
 * Closing the connection stops the run: the request's abort signal reaches the
 * model call and the loop, so a run the author walked away from does not keep
 * spending tokens.
 */

import { NextResponse } from "next/server";
import { runDrafter, DrafterEvent } from "@/lib/agent/drafter/loop";
import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL,
  VertexChatTransport,
  agentModel,
} from "@/lib/ai/geminiChat";
import { readVertexConfig, vertexStatus } from "@/lib/ai/vertexTransport";
import type { DrafterState } from "@/lib/agent/drafter/workspace";

export const runtime = "nodejs";
export const maxDuration = 3600;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export async function GET() {
  const config = readVertexConfig();
  const status = vertexStatus(config);
  return NextResponse.json({
    configured: status.configured,
    detail: status.detail,
    project: status.project ?? null,
    location: status.location,
    models: AGENT_MODELS,
    defaultModel: DEFAULT_AGENT_MODEL,
  });
}

export async function POST(request: Request) {
  let body: {
    prompt?: string;
    images?: { data: string; mimeType?: string }[];
    state?: Partial<DrafterState>;
    model?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  const images = (body.images ?? []).filter((i) => typeof i?.data === "string" && i.data.length > 0);
  if (!prompt && images.length === 0) {
    return NextResponse.json({ error: "Describe the drawing or attach a reference image." }, { status: 400 });
  }
  const bytes = images.reduce((n, i) => n + i.data.length * 0.75, 0);
  if (bytes > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "The attached images are larger than 12 MB together." }, { status: 413 });
  }

  const config = readVertexConfig();
  const status = vertexStatus(config);
  if (!status.configured) {
    return NextResponse.json({ error: status.detail }, { status: 503 });
  }

  const model = agentModel(body.model);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: DrafterEvent | { type: "error"; message: string }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      // Keeps proxies from closing an idle stream while the model thinks.
      const heartbeat = setInterval(() => {
        if (open) {
          try {
            controller.enqueue(encoder.encode(`: thinking\n\n`));
          } catch {
            open = false;
          }
        }
      }, 15000);

      const transport = new VertexChatTransport(config, {
        onRetry: (n) =>
          send({ type: "retry", attempt: n.attempt, waitSeconds: Math.round(n.waitMs / 1000), reason: n.reason }),
      });

      try {
        await runDrafter({
          prompt,
          images: images.map((i) => ({ data: i.data, mimeType: i.mimeType ?? "image/png" })),
          state: body.state,
          model,
          transport,
          onEvent: send,
          signal: request.signal,
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        clearInterval(heartbeat);
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
