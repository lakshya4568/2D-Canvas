import { describe, it, expect } from "vitest";
import {
  CostMeter,
  CacheManager,
  RequestAssembler,
  SessionCache,
  canonicalJsonStringify,
  PRICE_INPUT,
  PRICE_OUTPUT,
  PRICE_CACHE_READ,
  MIN_CACHE_TOKENS,
} from "@/lib/ai/geminiCache";
import type { GeminiContent, FunctionDeclaration } from "@/lib/ai/geminiChat";

describe("geminiCache - CostMeter", () => {
  it("computes zero savings when no tokens are cached", () => {
    const meter = new CostMeter();
    const cost = meter.record({
      promptTokens: 10_000,
      cachedTokens: 0,
      outputTokens: 500,
      thoughtTokens: 200,
    });

    expect(cost.inputTokens).toBe(10_000);
    expect(cost.cachedTokens).toBe(0);
    expect(cost.outputTokens).toBe(700);
    expect(cost.thoughtTokens).toBe(200);

    const expectedUncached = (10_000 / 1e6) * PRICE_INPUT; // 0.0075
    expect(cost.uncachedInputCost).toBeCloseTo(expectedUncached, 6);
    expect(cost.actualInputCost).toBeCloseTo(expectedUncached, 6);
    expect(cost.saved).toBe(0);

    const summary = meter.summary();
    expect(summary.turns).toBe(1);
    expect(summary.cacheHitRate).toBe(0);
    expect(summary.inputSavedUsd).toBe(0);
    expect(summary.totalInputTokens).toBe(10_000);
    expect(summary.totalOutputTokens).toBe(700);
  });

  it("applies 90% discount on cached tokens", () => {
    const meter = new CostMeter();
    // 20,000 prompt tokens, 15,000 cached, 5,000 billable uncached
    const cost = meter.record({
      promptTokens: 20_000,
      cachedTokens: 15_000,
      outputTokens: 1_000,
      thoughtTokens: 0,
    });

    const expectedUncached = (20_000 / 1e6) * PRICE_INPUT; // $0.015
    const expectedActual =
      (5_000 / 1e6) * PRICE_INPUT + (15_000 / 1e6) * PRICE_CACHE_READ; // 0.00375 + 0.001125 = 0.004875
    const expectedSaved = expectedUncached - expectedActual; // 0.010125

    expect(cost.uncachedInputCost).toBeCloseTo(expectedUncached, 6);
    expect(cost.actualInputCost).toBeCloseTo(expectedActual, 6);
    expect(cost.saved).toBeCloseTo(expectedSaved, 6);

    const summary = meter.summary();
    expect(summary.cacheHitRate).toBe(0.75); // 15k / 20k
    expect(summary.inputSavedUsd).toBeCloseTo(expectedSaved, 6);
  });

  it("accumulates multi-turn savings and metrics", () => {
    const meter = new CostMeter();
    // Turn 1: cold start (0 cached)
    meter.record({ promptTokens: 10_000, cachedTokens: 0, outputTokens: 200 });
    // Turn 2: hit (8,000 cached out of 12,000)
    meter.record({ promptTokens: 12_000, cachedTokens: 8_000, outputTokens: 300 });
    // Turn 3: hit (10,000 cached out of 14,000)
    meter.record({ promptTokens: 14_000, cachedTokens: 10_000, outputTokens: 400 });

    const summary = meter.summary();
    expect(summary.turns).toBe(3);
    expect(summary.totalInputTokens).toBe(36_000);
    expect(summary.totalCachedTokens).toBe(18_000);
    expect(summary.cacheHitRate).toBe(0.5);
    expect(summary.inputSavedUsd).toBeGreaterThan(0.01);
  });
});

describe("geminiCache - Stable-Prefix Hashing", () => {
  it("produces identical SHA-256 keys regardless of object property insertion order", () => {
    const objA = { b: 2, a: 1, nested: { y: "bar", x: "foo" } };
    const objB = { a: 1, b: 2, nested: { x: "foo", y: "bar" } };

    expect(canonicalJsonStringify(objA)).toBe(canonicalJsonStringify(objB));

    const tools: FunctionDeclaration[] = [
      {
        name: "draw_line",
        description: "Draw a line",
        parameters: { type: "object", properties: { x1: { type: "number" } } },
      },
    ];
    const staticContents: GeminiContent[] = [
      { role: "user", parts: [{ text: "Prompt text" }] },
    ];

    const key1 = CacheManager.makeCacheKey("SI", tools, staticContents);
    const key2 = CacheManager.makeCacheKey("SI", tools, staticContents);
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64);
  });
});

describe("geminiCache - RequestAssembler", () => {
  const tools: FunctionDeclaration[] = [
    { name: "test_tool", description: "test", parameters: {} },
  ];
  const staticContents: GeminiContent[] = [
    { role: "user", parts: [{ text: "Initial reference context" }] },
  ];
  const historyTurn1: GeminiContent = {
    role: "model",
    parts: [{ functionCall: { name: "test_tool", args: {} } }],
  };
  const historyTurn2: GeminiContent = {
    role: "user",
    parts: [{ functionResponse: { name: "test_tool", response: { ok: true } } }],
  };

  it("builds implicit caching requests with full stable prefix and tool definitions", () => {
    const session: SessionCache = {
      cacheKey: "key-123",
      systemInstruction: "System Instruction",
      tools,
      staticContents,
      history: [historyTurn1, historyTurn2],
      prefixTokens: 8000,
    };

    const req = RequestAssembler.buildRequest(session, [], {
      model: "gemini-3.8-flash",
      thinkingLevel: "medium",
    });

    expect(req.cachedContent).toBeUndefined();
    expect(req.system).toBe("System Instruction");
    expect(req.functions).toEqual(tools);
    expect(req.contents).toHaveLength(3);
    expect(req.contents[0]).toEqual(staticContents[0]);
    expect(req.contents[1]).toEqual(historyTurn1);
    expect(req.contents[2]).toEqual(historyTurn2);
  });

  it("builds explicit caching requests omitting system instructions and tools", () => {
    const session: SessionCache = {
      cacheKey: "key-123",
      systemInstruction: "System Instruction",
      tools,
      staticContents,
      history: [historyTurn1, historyTurn2],
      cachedContentName: "projects/123/locations/us-central1/cachedContents/c-456",
      prefixTokens: 25000,
    };

    const req = RequestAssembler.buildRequest(session, [], {
      model: "gemini-3.8-flash",
      thinkingLevel: "high",
    });

    expect(req.cachedContent).toBe(session.cachedContentName);
    expect(req.system).toBeUndefined();
    expect(req.functions).toBeUndefined();
    // In explicit mode, staticContents is stored inside the CachedContent on Vertex AI
    expect(req.contents).toEqual([historyTurn1, historyTurn2]);
  });
});

describe("geminiCache - CacheManager Promotion & Lifecycle", () => {
  it("does not promote before reaching promoteAfterTurns", async () => {
    let created = false;
    const mockClient = {
      async createCachedContent() {
        created = true;
        return { name: "cache-res-1" };
      },
    };

    const manager = new CacheManager(mockClient, {
      promoteAfterTurns: 3,
      promoteMinTokens: 10_000,
      ttlSeconds: 3600,
    });

    const session: SessionCache = {
      cacheKey: "test-hash",
      systemInstruction: "SI",
      tools: [],
      staticContents: [],
      history: [],
      prefixTokens: 15_000,
    };

    // Turn 1
    let promoted = await manager.maybePromote(session);
    expect(promoted).toBe(false);
    expect(created).toBe(false);

    // Turn 2
    promoted = await manager.maybePromote(session);
    expect(promoted).toBe(false);
    expect(created).toBe(false);

    // Turn 3: threshold reached
    promoted = await manager.maybePromote(session);
    expect(promoted).toBe(true);
    expect(created).toBe(true);
    expect(session.cachedContentName).toBe("cache-res-1");
  });

  it("does not promote if prefixTokens is below promoteMinTokens or MIN_CACHE_TOKENS", async () => {
    let created = false;
    const mockClient = {
      async createCachedContent() {
        created = true;
        return { name: "cache-res-2" };
      },
    };

    const manager = new CacheManager(mockClient, {
      promoteAfterTurns: 1,
      promoteMinTokens: 20_000,
      ttlSeconds: 3600,
    });

    const session: SessionCache = {
      cacheKey: "small-hash",
      systemInstruction: "SI",
      tools: [],
      staticContents: [],
      history: [],
      prefixTokens: 5_000, // < MIN_CACHE_TOKENS (6144)
    };

    const promoted = await manager.maybePromote(session);
    expect(promoted).toBe(false);
    expect(created).toBe(false);
  });

  it("cleans up explicit cache on teardown", async () => {
    let deletedName = "";
    const mockClient = {
      async deleteCachedContent(name: string) {
        deletedName = name;
      },
    };

    const manager = new CacheManager(mockClient);
    const session: SessionCache = {
      cacheKey: "del-hash",
      systemInstruction: "SI",
      tools: [],
      staticContents: [],
      history: [],
      cachedContentName: "cached-to-delete",
      prefixTokens: 25_000,
    };

    await manager.teardown(session);
    expect(deletedName).toBe("cached-to-delete");
    expect(session.cachedContentName).toBeUndefined();
  });
});
