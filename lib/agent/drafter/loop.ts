/**
 * The drafting agent's loop: observe → plan → act → observe → verify → fix.
 *
 * The loop is deliberately thin. The model decides what to do; the tools do it
 * against the kernel; the loop only carries the conversation, reports every
 * step as it happens, and refuses to call the job done until `finish` — which
 * runs the kernel's own verification — says it is.
 *
 * Three rules it keeps that the previous agent did not:
 *
 *   THE MODEL'S TURN IS STORED AS RECEIVED. Gemini 3 function calls carry
 *   thought signatures that must go back verbatim (see `geminiChat.ts`).
 *
 *   STOPPING IS NOT FINISHING. A model that stops calling tools has not proven
 *   anything. It is shown the current verification and asked to continue, a
 *   bounded number of times, and if it still will not finish the run ends as
 *   "incomplete" — with the drawing kept, and the reason on screen.
 *
 *   A FAILURE IS REPORTED AS A FAILURE. If the model cannot be reached the run
 *   ends with that message. It never substitutes a scripted drawing and it
 *   never labels anything as the model's work that the model did not do.
 */

import {
  AgentModelOption,
  ChatTransport,
  GeminiContent,
  GeminiPart,
  ModelCallError,
} from "../../ai/geminiChat";
import { DraftingWorkspace, DrafterState } from "./workspace";
import { BASE_TOOLS, ToolContext, ToolStage, checkReport, lookReport, macroDeclarations, runTool, stageOf } from "./tools";
import { DRAFTER_SYSTEM_PROMPT, initialMessage, nudgeMessage } from "./prompt";
import type { TemplateManifest } from "../../upce/template";
import type { Shape } from "../../geometry/types";
import type { AuthoringSketch } from "../../upce/types";
import {
  CostMeter,
  CacheManager,
  RequestAssembler,
  SessionCache,
} from "../../ai/geminiCache";

export type DrafterEvent =
  | { type: "start"; model: string; thinkingLevel: string; label: string }
  | { type: "thinking"; turn: number; text: string }
  | { type: "message"; turn: number; text: string }
  | { type: "tool"; turn: number; id: string; name: string; args: Record<string, unknown>; stage: ToolStage }
  | { type: "result"; turn: number; id: string; name: string; ok: boolean; text: string; stage: ToolStage; image?: string }
  | {
      type: "snapshot";
      shapes: Shape[];
      sketch?: AuthoringSketch;
      dof: number;
      values: {
        name: string;
        value: number;
        role: string;
        unit: string;
        expr?: string;
        dependencies?: string[];
        origin?: string;
        description?: string;
      }[];
    }
  | { type: "retry"; attempt: number; waitSeconds: number; reason: string }
  | {
      type: "usage";
      turn: number;
      latencyMs: number;
      promptTokens: number;
      outputTokens: number;
      thoughtTokens: number;
      cachedTokens?: number;
      savedUsd?: number;
      cacheHitRate?: number;
    }
  | { type: "sources"; turn: number; sources: { title: string; uri: string }[] }
  | {
      type: "done";
      status: "finished" | "incomplete" | "stopped" | "failed";
      message: string;
      summary?: string;
      state: DrafterState;
      manifest?: TemplateManifest;
      check: string;
      turns: number;
      toolCalls: number;
      elapsedMs: number;
      dxf?: string;
    };

export interface DrafterOptions {
  prompt: string;
  images?: { data: string; mimeType: string }[];
  state?: Partial<DrafterState>;
  model: AgentModelOption;
  transport: ChatTransport;
  onEvent: (e: DrafterEvent) => void;
  signal?: AbortSignal;
  maxTurns?: number;
  maxToolCalls?: number;
  /** How often to push the model to keep going before giving up. */
  maxNudges?: number;
}



function snapshot(ws: DraftingWorkspace): Extract<DrafterEvent, { type: "snapshot" }> {
  return {
    type: "snapshot",
    shapes: ws.displayShapes(),
    sketch: ws.sketch,
    dof: ws.dof().dof,
    values: Object.values(ws.sketch.parameters).map((p) => ({
      name: p.name,
      value: p.value,
      role: p.role,
      unit: p.unit,
      expr: p.expr,
      dependencies: p.dependencies,
      origin: p.provenance?.origin,
      description: p.description ?? p.provenance?.detail,
    })),
  };
}

export async function runDrafter(options: DrafterOptions): Promise<Extract<DrafterEvent, { type: "done" }>> {
  const started = Date.now();
  const ws = new DraftingWorkspace(options.state);
  const emit = options.onEvent;
  const maxTurns = options.maxTurns ?? 90;
  const maxToolCalls = options.maxToolCalls ?? 220;
  const maxNudges = options.maxNudges ?? 3;
  const { model, transport, signal } = options;

  const research = async (question: string) => {
    const res = await transport.generate({
      model: model.model,
      thinkingLevel: model.thinkingLevel,
      system:
        "Answer the engineering or geometry question briefly and precisely, citing the standard or source you rely on. Say plainly when sources disagree or when you are not sure.",
      contents: [{ role: "user", parts: [{ text: question }] }],
      googleSearch: true,
      maxOutputTokens: 4096,
      signal,
    });
    const text = res.content.parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();
    return { text: text || "No answer was found.", sources: res.sources ?? [] };
  };

  const ctx: ToolContext = {
    ws,
    hasReference: (options.images?.length ?? 0) > 0,
    viewedRevision: -1,
    suggestions: { revision: -1, byId: new Map() },
    research,
    macroDepth: 0,
  };

  emit({ type: "start", model: model.model, thinkingLevel: model.thinkingLevel, label: model.label });
  if (ws.shapes.length) emit(snapshot(ws));

  const firstParts: GeminiPart[] = [
    {
      text: initialMessage({
        prompt: options.prompt,
        hasImages: ctx.hasReference,
        existing: ws.shapes.length ? lookReport(ws, "all") : null,
      }),
    },
    ...(options.images ?? []).map((img) => ({
      inlineData: { mimeType: img.mimeType || "image/png", data: img.data.replace(/^data:[^;]+;base64,/, "") },
    })),
  ];
  const tools = [...BASE_TOOLS, ...macroDeclarations(ws.macros)];
  const meter = new CostMeter();
  const cacheManager = new CacheManager(transport as any);
  const session: SessionCache = {
    cacheKey: CacheManager.makeCacheKey(DRAFTER_SYSTEM_PROMPT, tools, [{ role: "user", parts: firstParts }]),
    systemInstruction: DRAFTER_SYSTEM_PROMPT,
    tools,
    staticContents: [{ role: "user", parts: firstParts }],
    history: [],
    prefixTokens: 0,
  };
  session.prefixTokens = await cacheManager.countPrefixTokens(session, model.model);

  let turns = 0;
  let toolCalls = 0;
  let nudges = 0;
  let finishRefused = false;
  let summary: string | undefined;

  const done = (status: "finished" | "incomplete" | "stopped" | "failed", message: string) => {
    const event: Extract<DrafterEvent, { type: "done" }> = {
      type: "done",
      status,
      message,
      summary,
      state: ws.toState(),
      manifest: ws.sketch.meta.publishedAt ? ws.manifest() : undefined,
      check: checkReport(ws).text,
      turns,
      toolCalls,
      elapsedMs: Date.now() - started,
    };
    emit(event);
    return event;
  };

  try {
    while (turns < maxTurns) {
      if (signal?.aborted) return done("stopped", "Stopped by the author.");
      turns++;

      session.tools = [...BASE_TOOLS, ...macroDeclarations(ws.macros)];

      const req = RequestAssembler.buildRequest(session, [], {
        model: model.model,
        thinkingLevel: model.thinkingLevel,
        signal,
      });

      const res = await transport.generate(req);
      session.history.push(res.content);

      const turnCost = meter.record(
        {
          promptTokens: res.usage.promptTokens,
          outputTokens: res.usage.outputTokens,
          thoughtTokens: res.usage.thoughtTokens,
          cachedTokens: res.usage.cachedTokens,
        },
        turns
      );
      const costSummary = meter.summary();

      emit({
        type: "usage",
        turn: turns,
        latencyMs: res.latencyMs,
        ...res.usage,
        cachedTokens: res.usage.cachedTokens ?? 0,
        savedUsd: turnCost.saved,
        cacheHitRate: costSummary.cacheHitRate,
      });

      for (const part of res.content.parts) {
        if (part.text && part.thought) emit({ type: "thinking", turn: turns, text: part.text });
        else if (part.text?.trim()) emit({ type: "message", turn: turns, text: part.text.trim() });
      }

      const calls = res.content.parts.filter((p) => p.functionCall);
      if (calls.length === 0) {
        if (res.finishReason === "MAX_TOKENS") {
          session.history.push({
            role: "user",
            parts: [{ text: "Your reply was cut off. Continue with the next tool call." }],
          });
          continue;
        }
        if (nudges >= maxNudges) {
          return done(
            "incomplete",
            "The model stopped before the drawing passed verification. The drawing so far is kept."
          );
        }
        nudges++;
        session.history.push({
          role: "user",
          parts: [{ text: nudgeMessage(checkReport(ws).text, finishRefused) }],
        });
        continue;
      }

      const responses: GeminiPart[] = [];
      let finished = false;
      for (const part of calls) {
        const call = part.functionCall!;
        const id = `${turns}.${responses.length + 1}`;
        const args = call.args ?? {};
        toolCalls++;
        // Announced before it runs, so a slow check or sweep shows as in progress.
        emit({ type: "tool", turn: turns, id, name: call.name, args, stage: stageOf(call.name) });
        const outcome = await runTool(ctx, call.name, args);
        emit({
          type: "result",
          turn: turns,
          id,
          name: call.name,
          ok: outcome.ok,
          text: outcome.text,
          stage: outcome.stage,
          image: outcome.image?.data,
        });
        if (outcome.sources?.length) emit({ type: "sources", turn: turns, sources: outcome.sources });
        if (outcome.mutated) emit(snapshot(ws));
        if (call.name === "finish") {
          if (outcome.finished) {
            finished = true;
            summary = typeof args.summary === "string" ? args.summary : undefined;
          } else {
            finishRefused = true;
          }
        }
        responses.push({
          functionResponse: {
            name: call.name,
            ...(call.id ? { id: call.id } : {}),
            response: { ok: outcome.ok, result: outcome.text },
            ...(outcome.image ? { parts: [{ inlineData: outcome.image }] } : {}),
          },
        });
        if (signal?.aborted) break;
      }
      session.history.push({ role: "user", parts: responses });

      if (finished) return done("finished", "Verified and published.");
      if (signal?.aborted) return done("stopped", "Stopped by the author.");
      if (toolCalls >= maxToolCalls) {
        return done(
          "incomplete",
          `Stopped after ${toolCalls} tool calls without passing verification. The drawing so far is kept.`
        );
      }

      await cacheManager.maybePromote(session, model.model);
      await cacheManager.refreshTtl(session);
    }
    return done(
      "incomplete",
      `Stopped after ${turns} model turns without passing verification. The drawing so far is kept.`
    );
  } catch (err) {
    if (signal?.aborted) return done("stopped", "Stopped by the author.");
    const message = err instanceof ModelCallError || err instanceof Error ? err.message : String(err);
    return done("failed", message);
  } finally {
    await cacheManager.teardown(session);
  }
}
