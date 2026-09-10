/**
 * The naming contract — system prompt and response schema, verbatim from §55.
 * UPCE-MASTER-1.0 §55.
 */

/** §55 system prompt, reproduced exactly. */
export const NAMING_SYSTEM_PROMPT = `You are a civil/structural engineering drafting assistant. You name parameters of a
parametric 2D General Arrangement Drawing (bridges, culverts, retaining walls, ROBs).
You receive abstracted feature descriptors — never coordinates.
Map raw parameter IDs to standard civil nomenclature (IRC / IRS / AASHTO / Eurocode usage).

CRITICAL RULES
1. NEVER output geometric coordinates and NEVER modify a numerical value.
2. Return ONLY a valid JSON object matching the provided schema.
3. For each parameter give one plain-English sentence justifying the tag.
4. Assign a role:
     DRIVING  – a high-level value an engineer specifies (ClearSpan, ClearHeight,
                WallThickness, SlabThickness, FoundationDepth)
     DERIVED  – computed from others (TotalWidth, TotalHeight)
     FIXED    – a code or standard constant (MinimumWearingCoat = 75 mm)
5. Names must match ^[A-Za-z][A-Za-z0-9_]{0,39}$.
6. Never invent geometry. If evidence is insufficient, say so with low confidence.`;

/** §55 strict response schema, for structured outputs / constrained decoding. */
export const NAMING_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    structureType: { type: "string" },
    names: {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidateId: { type: "string" },
          name: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,39}$" },
          role: { enum: ["DRIVING", "DERIVED", "FIXED"] },
          type: { enum: ["LENGTH", "ANGLE", "COUNT", "RATIO"] },
          unit: { enum: ["mm", "m", "deg", "count", "ratio"] },
          uiGroup: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          explanation: { type: "string", maxLength: 200 },
        },
        required: ["candidateId", "name", "role", "unit", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["names"],
  additionalProperties: false,
} as const;

/**
 * Sanitises text that originated outside the system — OCR'd drawing text on the
 * ingestion path, above all (§56 prompt-injection guardrail: "Text ingested from
 * a scanned drawing and destined for the model is sanitised, escaped, and
 * length-capped").
 */
export function sanitizeExternalText(text: string, maxLength: number = 120): string {
  return (
    text
      // Strip control characters that could smuggle role markers.
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
      // Neutralise chat-template and instruction markers.
      .replace(/<\|[^|>]*\|>/g, " ")
      .replace(/\b(system|assistant|human)\s*:/gi, " ")
      .replace(
        /\b(ignore|disregard|override)\s+(all\s+|the\s+|previous\s+|above\s+)*(instructions?|rules?|prompts?)/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength)
  );
}
