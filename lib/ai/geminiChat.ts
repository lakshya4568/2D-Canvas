/**
 * Multi-turn Gemini with tools, server-side only.
 *
 * `vertexTransport.generateJson` answers one question. An agent holds a
 * conversation: the model calls a tool, reads the result, calls another. Three
 * things make that conversation work on the Gemini 3 family, and getting any of
 * them wrong fails in a way that looks like something else:
 *
 *   THOUGHT SIGNATURES GO BACK VERBATIM. Every function call a Gemini 3 model
 *   makes carries an opaque `thoughtSignature`. The next request must send the
 *   model's turn back exactly as it came, signature included, or Google answers
 *   400 "function call ... is missing a thought_signature". The first agent in
 *   this repo rebuilt the model turn from the call names and arguments, so every
 *   live run died on its second turn — and its catch-all then ran a scripted
 *   plan and labelled the result as the model's. Here the model's `content` is
 *   stored as received and never reconstructed.
 *
 *   A 429 IS CAPACITY, NOT A BUG. On-demand Gemini traffic on Vertex shares
 *   capacity with everyone else calling that model; when the pool is busy the
 *   answer is `429 RESOURCE_EXHAUSTED`, and the documented response is to wait
 *   and retry with backoff. So it is retried here, and every wait is reported to
 *   the caller, because a run that goes quiet for thirty seconds with no
 *   explanation looks hung.
 *
 *   REASONING TAKES TIME. At `thinkingLevel: "high"` a Gemini 3.8 Flash turn
 *   with an image measured around two minutes. The per-call timeout is sized for
 *   that rather than for a chat reply.
 *
 * Only two models are offered, by the author's choice: Gemini 3.8 Flash (medium
 * or high reasoning) and Gemini 3.5 Flash Lite (high reasoning). Both read
 * images and both call tools.
 */

import { readVertexConfig, resolveAccessToken, hostForLocation, vertexStatus, VertexConfig } from "./vertexTransport";

export type ThinkingLevel = "low" | "medium" | "high";

export interface AgentModelOption {
  /** What the UI and the API send. */
  id: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  label: string;
  /** Measured, one turn with an image attached. For the picker, not for logic. */
  typicalTurn: string;
}

export const AGENT_MODELS: AgentModelOption[] = [
  {
    id: "gemini-3.8-flash@medium",
    model: "gemini-3.8-flash",
    thinkingLevel: "medium",
    label: "Gemini 3.8 Flash · medium reasoning",
    typicalTurn: "about 20 s a step",
  },
  {
    id: "gemini-3.8-flash@high",
    model: "gemini-3.8-flash",
    thinkingLevel: "high",
    label: "Gemini 3.8 Flash · high reasoning",
    typicalTurn: "about 2 min a step",
  },
  {
    id: "gemini-3.5-flash-lite@high",
    model: "gemini-3.5-flash-lite",
    thinkingLevel: "high",
    label: "Gemini 3.5 Flash Lite · high reasoning",
    typicalTurn: "about 8 s a step",
  },
];

export const DEFAULT_AGENT_MODEL = "gemini-3.8-flash@medium";

export function agentModel(id: string | undefined): AgentModelOption {
  const found = AGENT_MODELS.find((m) => m.id === id);
  if (found) return found;
  // A bare model name picks that model's first listed setting.
  const byModel = AGENT_MODELS.find((m) => m.model === id);
  return byModel ?? AGENT_MODELS.find((m) => m.id === DEFAULT_AGENT_MODEL)!;
}

// ---------------------------------------------------------------------------
// Wire types — the Gemini `contents` format, kept as-is.
// ---------------------------------------------------------------------------

export interface InlineData {
  mimeType: string;
  data: string;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
    parts?: { inlineData: InlineData }[];
    id?: string;
  };
  inlineData?: InlineData;
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  thinkingLevel?: ThinkingLevel;
  system: string;
  contents: GeminiContent[];
  functions?: FunctionDeclaration[];
  /** Google Search grounding, for the research tool. */
  googleSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface ChatUsage {
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

export interface ChatResponse {
  content: GeminiContent;
  finishReason?: string;
  usage: ChatUsage;
  latencyMs: number;
  model: string;
  /** Web pages the answer was grounded on, when search was used. */
  sources?: { title: string; uri: string }[];
}

export interface RetryNotice {
  attempt: number;
  status: number | "network";
  waitMs: number;
  reason: string;
}

export interface ChatTransport {
  generate(request: ChatRequest): Promise<ChatResponse>;
}

export class ModelCallError extends Error {
  constructor(
    message: string,
    readonly status: number | "network" | "timeout",
    readonly retryable: boolean
  ) {
    super(message);
  }
}

/** What a 429 means, in one paragraph the author can act on. */
export function explainRateLimit(model: string, project?: string): string {
  return (
    `${model} answered 429 RESOURCE_EXHAUSTED. Standard pay-as-you-go Gemini on Vertex AI is served from a shared pool: ` +
    `each organisation gets a baseline throughput (tokens per minute) set by its Usage Tier, which follows its past spend, ` +
    `and anything above that baseline is best effort${project ? ` (project ${project})` : ""}. A project with little spend ` +
    `history has a low baseline, and a high-reasoning turn with an image uses about 16,000 tokens, so bursts get refused. ` +
    `Retrying with backoff is Google's documented remedy and was already tried. If it keeps happening: use medium reasoning ` +
    `or Gemini 3.5 Flash Lite (far fewer tokens a turn), or buy Priority pay-as-you-go / Provisioned Throughput for the project.`
  );
}

const RETRY_DELAYS_MS = [3000, 6000, 12000, 24000, 45000];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ModelCallError("Stopped.", "network", false));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ModelCallError("Stopped.", "network", false));
      },
      { once: true }
    );
  });
}

export class VertexChatTransport implements ChatTransport {
  constructor(
    private readonly config: VertexConfig = readVertexConfig(),
    private readonly options: { onRetry?: (n: RetryNotice) => void; timeoutMs?: number } = {}
  ) {}

  status() {
    return vertexStatus(this.config);
  }

  async generate(request: ChatRequest): Promise<ChatResponse> {
    if (typeof window !== "undefined") throw new Error("geminiChat is server-only.");
    const status = vertexStatus(this.config);
    if (!status.configured) throw new ModelCallError(status.detail, "network", false);

    const tools: Record<string, unknown>[] = [];
    if (request.functions?.length) tools.push({ functionDeclarations: request.functions });
    if (request.googleSearch) tools.push({ googleSearch: {} });

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: request.contents,
      ...(tools.length ? { tools } : {}),
      generationConfig: {
        temperature: request.temperature ?? 1,
        maxOutputTokens: request.maxOutputTokens ?? 32768,
        thinkingConfig: { includeThoughts: true, ...(request.thinkingLevel ? { thinkingLevel: request.thinkingLevel } : {}) },
      },
    });

    const timeoutMs = this.options.timeoutMs ?? Math.max(this.config.timeoutMs, 300_000);

    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      let res: Response;
      const headers: Record<string, string> = { "content-type": "application/json" };
      let url: string;
      if (status.mode === "api-key") {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${this.config.apiKey}`;
      } else {
        const token = await resolveAccessToken(this.config);
        if (token) headers.authorization = `Bearer ${token}`;
        if (this.config.project) headers["x-goog-user-project"] = this.config.project;
        url =
          `https://${hostForLocation(this.config.location)}/v1/projects/${this.config.project}` +
          `/locations/${this.config.location}/publishers/google/models/${request.model}:generateContent`;
      }

      const signals = [AbortSignal.timeout(timeoutMs), ...(request.signal ? [request.signal] : [])];
      try {
        res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.any(signals) });
      } catch (err) {
        if (request.signal?.aborted) throw new ModelCallError("Stopped.", "network", false);
        const timedOut = err instanceof Error && /timeout/i.test(`${err.name} ${err.message}`);
        if (timedOut) {
          throw new ModelCallError(
            `${request.model} did not answer within ${Math.round(timeoutMs / 1000)} s.`,
            "timeout",
            false
          );
        }
        if (attempt <= RETRY_DELAYS_MS.length) {
          const waitMs = RETRY_DELAYS_MS[attempt - 1];
          this.options.onRetry?.({ attempt, status: "network", waitMs, reason: String(err) });
          await sleep(waitMs, request.signal);
          continue;
        }
        throw new ModelCallError(`Could not reach Vertex AI: ${String(err)}`, "network", false);
      }

      const text = await res.text();
      if (!res.ok) {
        if (RETRYABLE.has(res.status) && attempt <= RETRY_DELAYS_MS.length) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS_MS[attempt - 1];
          const reason =
            res.status === 429
              ? `shared capacity for ${request.model} is busy (429 RESOURCE_EXHAUSTED)`
              : `Vertex answered ${res.status}`;
          this.options.onRetry?.({ attempt, status: res.status, waitMs, reason });
          await sleep(waitMs, request.signal);
          continue;
        }
        const message =
          res.status === 429
            ? `${explainRateLimit(request.model, this.config.project)} (Gave up after ${attempt} attempts.)`
            : `Vertex returned ${res.status}: ${text.slice(0, 600)}`;
        throw new ModelCallError(message, res.status, false);
      }

      const json = JSON.parse(text) as {
        candidates?: {
          content?: GeminiContent;
          finishReason?: string;
          groundingMetadata?: { groundingChunks?: { web?: { title?: string; uri?: string } }[] };
        }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
        promptFeedback?: { blockReason?: string };
      };
      const candidate = json.candidates?.[0];
      if (!candidate?.content?.parts) {
        const why = json.promptFeedback?.blockReason ?? candidate?.finishReason ?? "no content";
        throw new ModelCallError(`${request.model} returned no content (${why}).`, res.status, false);
      }
      return {
        content: { role: "model", parts: candidate.content.parts },
        finishReason: candidate.finishReason,
        usage: {
          promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
          thoughtTokens: json.usageMetadata?.thoughtsTokenCount ?? 0,
        },
        latencyMs: Date.now() - started,
        model: request.model,
        sources: (candidate.groundingMetadata?.groundingChunks ?? [])
          .map((c) => ({ title: c.web?.title ?? "", uri: c.web?.uri ?? "" }))
          .filter((s) => s.uri),
      };
    }
  }
}
