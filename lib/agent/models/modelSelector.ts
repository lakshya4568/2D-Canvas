/**
 * CAD Agent v2 — Unified LLM Interface & Model Selector
 * Pluggable provider architecture supporting:
 * 1. Google Vertex AI / Gemini API (e.g. gemini-3.8-flash with thinking, gemini-3.1-flash-lite)
 * 2. Ollama C3Dv0 endpoint (http://103.100.217.50:11434, joshuaokolo/C3Dv0:latest)
 * 3. Deterministic Local Provider (offline fallback engine per UPCE-MASTER-1.0 §57)
 */

import type {
  LlmProvider,
  ModelRequest,
  ModelResponse,
  McpToolSchema,
  ToolCall,
} from "../types";
import {
  readVertexConfig,
  vertexStatus,
  hostForLocation,
  resolveAccessToken,
  type VertexConfig,
} from "../../ai/vertexTransport";
import { DEFAULT_OLLAMA_ENDPOINT, DEFAULT_OLLAMA_MODEL } from "../../ai/cadcoderService";
import { FastMcpProvider } from "./fastMcpProvider";

// ---------------------------------------------------------------------------
// 1. Vertex AI / Gemini Provider
// ---------------------------------------------------------------------------

export class VertexLlmProvider implements LlmProvider {
  readonly id = "vertex";
  readonly name = "Google Vertex AI / Gemini";

  constructor(private configOverride?: Partial<VertexConfig>) {}

  private getConfig(): VertexConfig {
    const base = readVertexConfig();
    return { ...base, ...(this.configOverride || {}) };
  }

  async isAvailable(): Promise<boolean> {
    const status = vertexStatus(this.getConfig());
    return status.configured;
  }

  supportsTools(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return true;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const t0 = Date.now();
    const config = this.getConfig();
    const status = vertexStatus(config);
    const targetModel = request.model || config.model;

    // Convert MCP tool schemas into Gemini Function Declarations format
    const geminiTools = request.tools?.length
      ? [
          {
            functionDeclarations: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ]
      : undefined;

    // Build Gemini contents
    const contents: Array<{
      role: string;
      parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
    }> = [];

    let systemInstruction: { parts: [{ text: string }] } | undefined;

    for (const msg of request.messages) {
      if (msg.role === "system") {
        if (msg.content) {
          systemInstruction = { parts: [{ text: msg.content }] };
        }
        continue;
      }

      const parts: any[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.functionCall) {
        parts.push({
          functionCall: {
            name: msg.functionCall.name,
            args: msg.functionCall.args,
          },
        });
      }

      if (msg.functionCalls?.length) {
        for (const fc of msg.functionCalls) {
          parts.push({
            functionCall: {
              name: fc.name,
              args: fc.args,
            },
          });
        }
      }

      if (msg.functionResponse) {
        parts.push({
          functionResponse: {
            name: msg.functionResponse.name,
            response: msg.functionResponse.response,
          },
        });
      }

      if (msg.functionResponses?.length) {
        for (const fr of msg.functionResponses) {
          parts.push({
            functionResponse: {
              name: fr.name,
              response: fr.response,
            },
          });
        }
      }

      if (msg.images?.length) {
        for (const img of msg.images) {
          const cleanData = img.data.replace(/^data:[^;]+;base64,/, "");
          parts.push({
            inlineData: {
              mimeType: img.mimeType || "image/png",
              data: cleanData,
            },
          });
        }
      }

      const role =
        msg.role === "assistant"
          ? "model"
          : msg.role === "function" || msg.role === "tool"
          ? "function"
          : "user";

      contents.push({
        role,
        parts,
      });
    }


    const generationConfig: Record<string, unknown> = {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxTokens ?? config.maxOutputTokens,
    };

    if (request.thinkingBudget !== undefined) {
      generationConfig.thinkingConfig = {
        thinkingBudget: request.thinkingBudget,
      };
    }

    const bodyObj: Record<string, unknown> = {
      contents,
      generationConfig,
    };

    if (systemInstruction) bodyObj.systemInstruction = systemInstruction;
    if (geminiTools) bodyObj.tools = geminiTools;

    let url: string;
    const headers: Record<string, string> = { "content-type": "application/json" };

    if (status.mode === "api-key" && config.apiKey) {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${config.apiKey}`;
    } else if (config.project) {
      const token = await resolveAccessToken(config);
      if (token) headers.authorization = `Bearer ${token}`;
      headers["x-goog-user-project"] = config.project;
      url =
        `https://${hostForLocation(config.location)}/v1/projects/${config.project}` +
        `/locations/${config.location}/publishers/google/models/${targetModel}:generateContent`;
    } else {
      throw new Error(`Vertex AI is not configured: ${status.detail}`);
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyObj),
      signal: request.signal ?? AbortSignal.timeout(config.timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Vertex AI error (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as any;
    const candidate = json.candidates?.[0];
    const candidateContent = candidate?.content?.parts || [];

    let textContent = "";
    let thinkingContent = "";
    const toolCalls: ToolCall[] = [];

    for (const part of candidateContent) {
      if (part.text) {
        if (part.thought) {
          thinkingContent += part.text;
        } else {
          textContent += part.text;
        }
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${toolCalls.length}`,
          tool: part.functionCall.name,
          args: part.functionCall.args || {},
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      thinking: thinkingContent || undefined,
      modelUsed: targetModel,
      finishReason: candidate?.finishReason,
      latencyMs: Date.now() - t0,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Ollama C3Dv0 Provider
// ---------------------------------------------------------------------------

export class OllamaLlmProvider implements LlmProvider {
  readonly id = "ollama";
  readonly name = "Ollama C3Dv0 (finetuned on Gemma 3n)";

  constructor(
    private endpoint = DEFAULT_OLLAMA_ENDPOINT,
    private model = DEFAULT_OLLAMA_MODEL
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      return (
        data.models?.some(
          (m) =>
            m.name === this.model ||
            m.name.toLowerCase().includes("c3d") ||
            m.name.toLowerCase().includes("gemma")
        ) ?? false
      );
    } catch {
      return false;
    }
  }

  supportsTools(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return false;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const t0 = Date.now();
    const targetModel = request.model || this.model;

    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.1,
        },
      }),
      signal: request.signal ?? AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    const content = data.message?.content || "";

    return {
      content,
      modelUsed: targetModel,
      latencyMs: Date.now() - t0,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. Deterministic Local Provider (§57 Invariant Fallback)
// ---------------------------------------------------------------------------

export class DeterministicLocalProvider implements LlmProvider {
  readonly id = "deterministic";
  readonly name = "UPCE Deterministic Engineering Engine (Offline Fallback)";

  async isAvailable(): Promise<boolean> {
    return true; // Always available offline
  }

  supportsTools(): boolean {
    return true;
  }

  supportsVision(): boolean {
    return true; // Uses deterministic vision heuristics
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const t0 = Date.now();
    return {
      content: "Deterministic offline execution",
      modelUsed: "deterministic-engine",
      latencyMs: Date.now() - t0,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Model Selector Orchestrator
// ---------------------------------------------------------------------------

export class ModelSelector {
  private providers: Map<string, LlmProvider> = new Map();

  constructor() {
    this.registerProvider(new FastMcpProvider());
    this.registerProvider(new VertexLlmProvider());
    this.registerProvider(new OllamaLlmProvider());
    this.registerProvider(new DeterministicLocalProvider());
  }

  public registerProvider(provider: LlmProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): LlmProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Resolves the most suitable available provider based on the model name or requested tier.
   */
  public async selectProvider(requestedModel: string): Promise<LlmProvider> {
    const lower = requestedModel.toLowerCase();

    // If FastMCP server requested explicitly
    if (lower.includes("fastmcp") || lower.includes("ezdxf")) {
      const fastmcp = this.providers.get("fastmcp");
      if (fastmcp && (await fastmcp.isAvailable())) {
        return fastmcp;
      }
      return this.providers.get("fastmcp") || this.providers.get("deterministic")!;
    }

    // If deterministic requested explicitly
    if (lower.includes("deterministic") || lower.includes("local")) {
      return this.providers.get("deterministic")!;
    }

    // If ollama / c3d requested
    if (lower.includes("ollama") || lower.includes("c3d") || lower.includes("c3dv0")) {
      const ollama = this.providers.get("ollama")!;
      if (await ollama.isAvailable()) {
        return ollama;
      }
      console.warn("Ollama requested but endpoint unreachable; falling back to Vertex/Deterministic.");
    }

    // Default to Vertex if available
    const vertex = this.providers.get("vertex")!;
    if (await vertex.isAvailable()) {
      return vertex;
    }

    // Ultimate fallback is the deterministic local engine (§57)
    return this.providers.get("deterministic")!;
  }
}
