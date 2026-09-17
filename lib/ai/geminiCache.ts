/**
 * Token caching & cost metering for Gemini 3.8 Flash on Vertex AI.
 *
 * Implicit caching is on by default for Gemini 3.8 Flash on Vertex AI, giving
 * a 90% discount on cached input tokens when requests share a byte-identical
 * prefix >= 6,144 tokens.
 *
 * Two pillars make this work in an agentic loop:
 *   1. Stable-Prefix Request Architecture (RequestAssembler):
 *      [system_instruction] + [tools] + [static context] + [append-only history] + [new suffix]
 *      Past turns are NEVER mutated in place; prefix order is strictly preserved.
 *
 *   2. Cost Metering & Promotion (CostMeter, CacheManager):
 *      Extracts `usageMetadata.cachedContentTokenCount`, calculates savings at
 *      $0.75/1M input, $3.75/1M output, $0.075/1M cached reads.
 *      Optionally promotes long-lived large prefixes to explicit CachedContent,
 *      with TTL management and guaranteed session teardown.
 */

import { createHash } from "node:crypto";
import type {
  ChatRequest,
  ChatUsage,
  FunctionDeclaration,
  GeminiContent,
  ThinkingLevel,
} from "./geminiChat";

export const MODEL = "gemini-3.8-flash";
export const MIN_CACHE_TOKENS = 6144; // Minimum prefix length for 3.8 Flash implicit caching

// Per-1M-token standard rates on Vertex AI
export const PRICE_INPUT = 0.75;
export const PRICE_OUTPUT = 3.75;
export const PRICE_CACHE_READ = 0.075; // 90% off input price

// ---------------------------------------------------------------------------
// Cost Metering
// ---------------------------------------------------------------------------

export interface TurnCost {
  turn: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  uncachedInputCost: number;
  actualInputCost: number;
  saved: number;
}

export interface CostSummary {
  turns: number;
  totalInputTokens: number;
  totalCachedTokens: number;
  totalOutputTokens: number;
  totalThoughtTokens: number;
  cacheHitRate: number;
  inputSavedUsd: number;
  actualCostUsd: number;
  uncachedCostUsd: number;
}

export class CostMeter {
  readonly turns: TurnCost[] = [];

  record(
    usage: { promptTokens?: number; cachedTokens?: number; outputTokens?: number; thoughtTokens?: number },
    turnNumber: number = this.turns.length + 1
  ): TurnCost {
    const totalIn = usage.promptTokens ?? 0;
    const cached = usage.cachedTokens ?? 0;
    const billableIn = Math.max(0, totalIn - cached);
    const thoughtTokens = usage.thoughtTokens ?? 0;
    const outputTokens = (usage.outputTokens ?? 0) + thoughtTokens;

    const uncached = (totalIn / 1e6) * PRICE_INPUT;
    const actualInputCost =
      (billableIn / 1e6) * PRICE_INPUT + (cached / 1e6) * PRICE_CACHE_READ;
    const saved = Math.max(0, uncached - actualInputCost);

    const tc: TurnCost = {
      turn: turnNumber,
      inputTokens: totalIn,
      cachedTokens: cached,
      outputTokens,
      thoughtTokens,
      uncachedInputCost: uncached,
      actualInputCost,
      saved,
    };
    this.turns.push(tc);
    return tc;
  }

  summary(): CostSummary {
    const n = this.turns.length;
    if (!n) {
      return {
        turns: 0,
        totalInputTokens: 0,
        totalCachedTokens: 0,
        totalOutputTokens: 0,
        totalThoughtTokens: 0,
        cacheHitRate: 0,
        inputSavedUsd: 0,
        actualCostUsd: 0,
        uncachedCostUsd: 0,
      };
    }

    const totalInput = this.turns.reduce((acc, t) => acc + t.inputTokens, 0);
    const totalCached = this.turns.reduce((acc, t) => acc + t.cachedTokens, 0);
    const totalOutput = this.turns.reduce((acc, t) => acc + t.outputTokens, 0);
    const totalThought = this.turns.reduce((acc, t) => acc + t.thoughtTokens, 0);
    const totalSaved = this.turns.reduce((acc, t) => acc + t.saved, 0);
    const totalActual =
      this.turns.reduce((acc, t) => acc + t.actualInputCost, 0) +
      (totalOutput / 1e6) * PRICE_OUTPUT;
    const totalUncached =
      this.turns.reduce((acc, t) => acc + t.uncachedInputCost, 0) +
      (totalOutput / 1e6) * PRICE_OUTPUT;

    return {
      turns: n,
      totalInputTokens: totalInput,
      totalCachedTokens: totalCached,
      totalOutputTokens: totalOutput,
      totalThoughtTokens: totalThought,
      cacheHitRate: totalInput > 0 ? Math.round((totalCached / totalInput) * 1000) / 1000 : 0,
      inputSavedUsd: Math.round(totalSaved * 1e6) / 1e6,
      actualCostUsd: Math.round(totalActual * 1e6) / 1e6,
      uncachedCostUsd: Math.round(totalUncached * 1e6) / 1e6,
    };
  }
}

// ---------------------------------------------------------------------------
// Cache Management & Stable-Prefix Assembler
// ---------------------------------------------------------------------------

export interface CachePolicy {
  /** Promote to explicit cache after this many identical-prefix turns. */
  promoteAfterTurns: number;
  /** Only promote if prefix token count >= this threshold. */
  promoteMinTokens: number;
  /** Time-to-live for explicit cached content in seconds. */
  ttlSeconds: number;
}

export const DEFAULT_CACHE_POLICY: CachePolicy = {
  promoteAfterTurns: 3,
  promoteMinTokens: 20_000,
  ttlSeconds: 3600,
};

export interface SessionCache {
  cacheKey: string;
  systemInstruction: string;
  tools: FunctionDeclaration[];
  staticContents: GeminiContent[];
  history: GeminiContent[];
  cachedContentName?: string;
  prefixTokens: number;
}

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJsonStringify).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJsonStringify((obj as Record<string, unknown>)[k])}`
  );
  return `{${pairs.join(",")}}`;
}

export interface CacheClient {
  createCachedContent?(params: {
    model: string;
    systemInstruction?: string;
    tools?: FunctionDeclaration[];
    contents?: GeminiContent[];
    ttlSeconds: number;
    displayName?: string;
  }): Promise<{ name: string; expireTime?: string }>;
  updateCachedContent?(name: string, ttlSeconds: number): Promise<void>;
  deleteCachedContent?(name: string): Promise<void>;
  countTokens?(params: {
    model: string;
    systemInstruction?: string;
    tools?: FunctionDeclaration[];
    contents: GeminiContent[];
  }): Promise<number>;
}

export class CacheManager {
  private readonly reuseCount = new Map<string, number>();
  readonly policy: CachePolicy;

  constructor(
    private readonly client?: CacheClient,
    policy?: Partial<CachePolicy>
  ) {
    this.policy = { ...DEFAULT_CACHE_POLICY, ...policy };
  }

  static makeCacheKey(
    systemInstruction: string,
    tools: FunctionDeclaration[],
    staticContents: GeminiContent[]
  ): string {
    const payload = canonicalJsonStringify({
      si: systemInstruction,
      tools,
      static: staticContents,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  async countPrefixTokens(
    session: SessionCache,
    modelName: string = MODEL
  ): Promise<number> {
    if (!this.client?.countTokens) return 0;
    try {
      return await this.client.countTokens({
        model: modelName,
        systemInstruction: session.systemInstruction,
        tools: session.tools,
        contents: session.staticContents,
      });
    } catch {
      return 0;
    }
  }

  async maybePromote(
    session: SessionCache,
    modelName: string = MODEL
  ): Promise<boolean> {
    if (session.cachedContentName) return true;
    if (!this.client?.createCachedContent) return false;

    const count = (this.reuseCount.get(session.cacheKey) ?? 0) + 1;
    this.reuseCount.set(session.cacheKey, count);

    if (count < this.policy.promoteAfterTurns) return false;
    if (session.prefixTokens < this.policy.promoteMinTokens) return false;
    if (session.prefixTokens < MIN_CACHE_TOKENS) return false;

    try {
      const res = await this.client.createCachedContent({
        model: modelName,
        systemInstruction: session.systemInstruction,
        tools: session.tools,
        contents: session.staticContents,
        displayName: `harness-${session.cacheKey.slice(0, 12)}`,
        ttlSeconds: this.policy.ttlSeconds,
      });
      session.cachedContentName = res.name;
      return true;
    } catch (err) {
      console.warn("Explicit cache creation failed, continuing with implicit caching:", err);
      return false;
    }
  }

  async refreshTtl(session: SessionCache): Promise<void> {
    if (!session.cachedContentName || !this.client?.updateCachedContent) return;
    try {
      await this.client.updateCachedContent(session.cachedContentName, this.policy.ttlSeconds);
    } catch {
      // Best-effort TTL refresh
    }
  }

  async teardown(session: SessionCache): Promise<void> {
    if (!session.cachedContentName) return;
    const name = session.cachedContentName;
    session.cachedContentName = undefined;
    if (this.client?.deleteCachedContent) {
      try {
        await this.client.deleteCachedContent(name);
      } catch (err) {
        console.warn(`Failed to delete cached content ${name}:`, err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Request Assembler (Stable-Prefix Guarantee)
// ---------------------------------------------------------------------------

export class RequestAssembler {
  /**
   * Canonical request layout:
   *   [cached: SI + tools + static docs] + [append-only history] + [new turn]
   *
   * Rules:
   * 1. Never reorder contents.
   * 2. Never edit past history in place.
   * 3. When explicit cachedContent is active, DO NOT resend systemInstruction or tools.
   */
  static buildRequest(
    session: SessionCache,
    newContents: GeminiContent[],
    options: {
      model: string;
      thinkingLevel?: ThinkingLevel;
      temperature?: number;
      maxOutputTokens?: number;
      signal?: AbortSignal;
      googleSearch?: boolean;
    }
  ): ChatRequest {
    if (session.cachedContentName) {
      // Explicit mode: prefix is already stored server-side.
      return {
        model: options.model,
        thinkingLevel: options.thinkingLevel,
        cachedContent: session.cachedContentName,
        contents: [...session.history, ...newContents],
        googleSearch: options.googleSearch,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        signal: options.signal,
      };
    }

    // Implicit mode: send stable byte-identical prefix every turn.
    return {
      model: options.model,
      thinkingLevel: options.thinkingLevel,
      system: session.systemInstruction,
      functions: session.tools.length ? session.tools : undefined,
      contents: [...session.staticContents, ...session.history, ...newContents],
      googleSearch: options.googleSearch,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      signal: options.signal,
    };
  }
}
