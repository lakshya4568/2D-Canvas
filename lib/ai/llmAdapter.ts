/**
 * The LLM naming adapter — inference only, zero geometric authority.
 * UPCE-MASTER-1.0 §53, §54, §55, §56.
 *
 *   LLM DOES                          LLM NEVER DOES
 *   Param_3 -> "WallThickness"        Emit or modify coordinates
 *   Explain a candidate               Decide constraint correctness
 *   Rank semantic hypotheses          Touch topology
 *   Suggest a UI grouping             Change a measured value
 *   Write user-facing help text       Write to the sketch, ever
 *
 * The pipeline shape (§53) is enforced structurally here:
 *
 *   LLM -> schema validation -> semantic validation -> geometry validation
 *       -> AUTHOR APPROVAL -> template
 *
 * Never: LLM -> CAD database.
 *
 * NO MODEL IS TRAINED, FINE-TUNED, OR POST-TRAINED. This adapter only calls an
 * off-the-shelf inference endpoint, and the whole system passes its tests with
 * that endpoint disabled (§57).
 */

import {
  AbstractedDescriptor,
  NamingPatch,
  NamingResult,
  Namer,
  ParameterRole,
  ParameterUnit,
  ParameterValueType,
} from "./types";
import { DeterministicFallbackNamer, isValidParameterName } from "./fallbackNamer";
import { NAMING_RESPONSE_SCHEMA, NAMING_SYSTEM_PROMPT } from "./prompts";

/** A transport is injected, so the adapter never owns a network client. */
export interface NamingTransport {
  /**
   * Sends the request and returns the model's raw JSON text. Implementations
   * live server-side behind a proxy so API keys never reach the client (§56).
   */
  complete(request: {
    systemPrompt: string;
    payload: AbstractedDescriptor;
    schema: unknown;
    signal?: AbortSignal;
  }): Promise<string>;
}

export interface NamingCache {
  get(key: string): NamingResult | undefined;
  set(key: string, value: NamingResult): void;
}

/** In-memory cache keyed by descriptor hash, 24 h TTL (§56). */
export class InMemoryNamingCache implements NamingCache {
  private entries = new Map<string, { value: NamingResult; expiresAt: number }>();

  constructor(
    private ttlMs: number = 24 * 60 * 60 * 1000,
    private now: () => number = Date.now
  ) {}

  public get(key: string): NamingResult | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (this.now() > hit.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return { ...hit.value, source: "cache" };
  }

  public set(key: string, value: NamingResult): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  public size(): number {
    return this.entries.size;
  }
}

/** Stable FNV-1a hash of the abstracted descriptor: identical geometry, cached name. */
export function descriptorHash(descriptor: AbstractedDescriptor): string {
  const canonical = JSON.stringify(descriptor, Object.keys(descriptor).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface LlmNamerOptions {
  /** §56 - 3.0 s hard timeout; on expiry, fall back without blocking. */
  timeoutMs?: number;
  /** One retry on schema failure, then fallback (§56). */
  maxRetries?: number;
  cache?: NamingCache;
  fallback?: DeterministicFallbackNamer;
}

export interface ValidationOutcome {
  patches: NamingPatch[];
  rejected: { candidateId: string; reason: string }[];
}

const VALID_ROLES: ParameterRole[] = ["DRIVING", "DERIVED", "FIXED"];
const VALID_UNITS: ParameterUnit[] = ["mm", "m", "deg", "count", "ratio"];
const VALID_TYPES: ParameterValueType[] = ["LENGTH", "ANGLE", "COUNT", "RATIO"];

/**
 * §56 - schema + semantic + geometry validation of a model response.
 *
 * `knownCandidateIds` is the geometry validator: a patch naming an entity that
 * does not exist is discarded, so a hallucinated ID can never enter the template.
 * Every field not on `NamingPatch` is dropped, which is the structural guarantee
 * that a coordinate cannot travel through this function.
 */
export function validateNamingResponse(
  raw: unknown,
  knownCandidateIds: Set<string>
): ValidationOutcome {
  const rejected: { candidateId: string; reason: string }[] = [];
  const patches: NamingPatch[] = [];

  if (typeof raw !== "object" || raw === null) {
    return { patches, rejected: [{ candidateId: "*", reason: "response is not an object" }] };
  }
  const names = (raw as Record<string, unknown>).names;
  if (!Array.isArray(names)) {
    return { patches, rejected: [{ candidateId: "*", reason: "missing 'names' array" }] };
  }

  const seenNames = new Set<string>();

  for (const item of names) {
    if (typeof item !== "object" || item === null) {
      rejected.push({ candidateId: "?", reason: "entry is not an object" });
      continue;
    }
    const o = item as Record<string, unknown>;
    const candidateId = typeof o.candidateId === "string" ? o.candidateId : "?";

    if (!knownCandidateIds.has(candidateId)) {
      rejected.push({ candidateId, reason: "references an entity that does not exist" });
      continue;
    }
    if (typeof o.name !== "string" || !isValidParameterName(o.name)) {
      rejected.push({ candidateId, reason: `invalid or reserved name '${String(o.name)}'` });
      continue;
    }
    if (seenNames.has(o.name)) {
      rejected.push({ candidateId, reason: `duplicate name '${o.name}'` });
      continue;
    }
    if (typeof o.role !== "string" || !VALID_ROLES.includes(o.role as ParameterRole)) {
      rejected.push({ candidateId, reason: `invalid role '${String(o.role)}'` });
      continue;
    }
    if (typeof o.unit !== "string" || !VALID_UNITS.includes(o.unit as ParameterUnit)) {
      rejected.push({ candidateId, reason: `invalid unit '${String(o.unit)}'` });
      continue;
    }
    const confidence = typeof o.confidence === "number" ? o.confidence : Number.NaN;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      rejected.push({ candidateId, reason: "confidence outside [0, 1]" });
      continue;
    }

    seenNames.add(o.name);

    // Reconstructed field by field - NOT spread. Anything the model invented
    // (a coordinate, a value, a constraint) is structurally unable to survive.
    patches.push({
      candidateId,
      name: o.name,
      role: o.role as ParameterRole,
      type:
        typeof o.type === "string" && VALID_TYPES.includes(o.type as ParameterValueType)
          ? (o.type as ParameterValueType)
          : undefined,
      unit: o.unit as ParameterUnit,
      uiGroup: typeof o.uiGroup === "string" ? o.uiGroup.slice(0, 60) : undefined,
      semanticTag: typeof o.semanticTag === "string" ? o.semanticTag.slice(0, 60) : undefined,
      confidence,
      explanation: typeof o.explanation === "string" ? o.explanation.slice(0, 200) : undefined,
    });
  }

  return { patches, rejected };
}

/**
 * The LLM namer. Batches all candidates of one sketch into a single call (§56
 * cost guardrail), caches by descriptor hash, and falls back deterministically
 * on timeout, transport error, invalid JSON, or an empty validated result.
 */
export class LlmNamer implements Namer {
  private readonly fallback: DeterministicFallbackNamer;
  private readonly cache: NamingCache | null;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    private transport: NamingTransport,
    options: LlmNamerOptions = {}
  ) {
    this.fallback = options.fallback ?? new DeterministicFallbackNamer();
    this.cache = options.cache ?? null;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.maxRetries = options.maxRetries ?? 1;
  }

  public async name(descriptor: AbstractedDescriptor): Promise<NamingResult> {
    const t0 = Date.now();
    const key = descriptorHash(descriptor);

    const cached = this.cache?.get(key);
    if (cached) return cached;

    const knownIds = new Set(descriptor.clusters.map((c) => c.rawId));
    // A repeat cluster also legitimately produces a "<id>_count" candidate.
    for (const c of descriptor.clusters) {
      if (c.kind === "repeat") knownIds.add(`${c.rawId}_count`);
    }

    let lastReason = "unknown";

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const text = await this.withTimeout(
          (signal) =>
            this.transport.complete({
              systemPrompt: NAMING_SYSTEM_PROMPT,
              payload: descriptor,
              schema: NAMING_RESPONSE_SCHEMA,
              signal,
            }),
          this.timeoutMs
        );

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          lastReason = "response was not valid JSON";
          continue;
        }

        const { patches } = validateNamingResponse(parsed, knownIds);
        if (patches.length === 0) {
          lastReason = "no patch survived schema and semantic validation";
          continue;
        }

        const structureType =
          typeof (parsed as Record<string, unknown>).structureType === "string"
            ? ((parsed as Record<string, unknown>).structureType as string)
            : descriptor.drawingType;

        const result: NamingResult = {
          structureType,
          names: patches,
          source: "llm",
          elapsedMs: Date.now() - t0,
        };
        this.cache?.set(key, result);
        return result;
      } catch (error) {
        lastReason =
          error instanceof Error && error.message === "naming-timeout"
            ? `timed out after ${this.timeoutMs} ms`
            : `transport error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    // §57 - the fallback ladder. The workflow is never blocked.
    const fallbackResult = this.fallback.nameSync(descriptor);
    return {
      ...fallbackResult,
      fallbackReason: lastReason,
      elapsedMs: Date.now() - t0,
    };
  }

  private withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error("naming-timeout"));
      }, ms);
      fn(controller.signal).then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }
}

/**
 * The apply target. §56: "The LLM may write only Parameter.name,
 * Parameter.semanticTag, uiGroup, and explanation text. Nothing else. Enforced
 * by the type of the apply function, not by convention."
 *
 * This type IS the enforcement point: it exposes only the four writable fields,
 * so no caller can route a value, coordinate, or constraint through it.
 */
export type NameableParameter = {
  id: string;
  name: string;
  semanticTag?: string;
  uiGroup?: string;
  explanation?: string;
};

export function applyNamingPatches<T extends NameableParameter>(
  parameters: T[],
  patches: NamingPatch[],
  options: { requireApproval?: boolean; approved?: Set<string> } = {}
): { applied: T[]; skipped: { candidateId: string; reason: string }[] } {
  const skipped: { candidateId: string; reason: string }[] = [];
  const known = new Set(parameters.map((p) => p.id));
  const applied: T[] = parameters.map((p) => ({ ...p }));
  const appliedById = new Map(applied.map((p) => [p.id, p]));

  for (const patch of patches) {
    if (!known.has(patch.candidateId)) {
      skipped.push({ candidateId: patch.candidateId, reason: "no such parameter" });
      continue;
    }
    // §56 human-in-the-loop: names arrive as editable suggestions; nothing
    // commits without author accept.
    if (options.requireApproval !== false && !options.approved?.has(patch.candidateId)) {
      skipped.push({ candidateId: patch.candidateId, reason: "awaiting author approval" });
      continue;
    }

    const target = appliedById.get(patch.candidateId)!;
    target.name = patch.name;
    if (patch.semanticTag !== undefined) target.semanticTag = patch.semanticTag;
    if (patch.uiGroup !== undefined) target.uiGroup = patch.uiGroup;
    if (patch.explanation !== undefined) target.explanation = patch.explanation;
  }

  return { applied, skipped };
}
