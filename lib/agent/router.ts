/**
 * CAD Agent v2 — Router
 * Entry point for every user request.
 *
 * Responsibilities:
 * 1. Classifies intent: create | modify | query | dimension | explain
 * 2. Extracts entities (primitives, civil components, parameters, quantities, units)
 * 3. Detects input mode: text-only | image-only | text+image
 * 4. Decides model tier: fast | strong | vision
 * 5. Routes to downstream model or handles explicit user override
 * 6. Logs decisions for full observability
 */

import type {
  AgentRequest,
  RouterDecision,
  AgentIntent,
  InputMode,
  ModelTier,
  ExtractedEntities,
} from "./types";

export class CadRouter {
  /**
   * Evaluates incoming request and produces a deterministic routing decision.
   */
  public route(request: AgentRequest): RouterDecision {
    const prompt = request.prompt?.trim() || "";
    const hasImage = Boolean(request.image?.path || request.image?.base64);

    // 1. Detect Input Mode
    const inputMode: InputMode = hasImage
      ? prompt.length > 0
        ? "text+image"
        : "image-only"
      : "text-only";

    // 2. Classify Intent
    const intent = this.classifyIntent(prompt, hasImage);

    // 3. Extract Entities & Parameters
    const extractedEntities = this.extractEntities(prompt);

    // 4. Determine Model Tier
    const modelTier = this.selectModelTier(intent, inputMode, extractedEntities, prompt);

    // 5. Select Model (accounting for user overrides)
    const hasOperations = Boolean(request.operations && request.operations.length > 0);
    const selectedModel = this.resolveModel(request.modelOverride, modelTier, prompt, hasOperations);

    // 6. Suggest Pipeline
    const suggestedPipeline = this.determinePipeline(intent, inputMode);

    // 7. Calculate Confidence & Reasoning
    const { confidence, reasoning } = this.buildReasoning(
      intent,
      inputMode,
      modelTier,
      selectedModel,
      extractedEntities,
      request.modelOverride
    );

    return {
      intent,
      inputMode,
      modelTier,
      selectedModel,
      extractedEntities,
      confidence,
      reasoning,
      suggestedPipeline,
    };
  }

  private classifyIntent(prompt: string, hasImage: boolean): AgentIntent {
    const lower = prompt.toLowerCase();

    // Query intent
    if (
      /^(what|show|get|query|inspect|measure|read|find|list|calculate\s+(?:the\s+)?(?:area|volume|weight|clearance))\b/i.test(lower) ||
      /\b(?:how\s+(?:long|wide|high|deep|thick)|what\s+is\s+the\s+(?:span|depth|height|dimension|area))\b/i.test(lower)
    ) {
      return "query";
    }

    // Explain intent
    if (
      /^(explain|why|describe|rationale|standard|code\s+reference|clause)\b/i.test(lower) ||
      /\b(?:explain\s+(?:why|the|how)|why\s+is\s+the)\b/i.test(lower)
    ) {
      return "explain";
    }

    // Dimension intent
    if (
      /^(dimension|add\s+(?:[a-z]+\s+)?dimension|add\s+dim|annotate|label|witness|show\s+dimension)\b/i.test(lower) ||
      /\b(?:add\s+(?:a\s+|[a-z]+\s+)?dimension|dimension\s+line|linear\s+dimension|radial\s+dimension)\b/i.test(lower)
    ) {
      return "dimension";
    }

    // Modify intent
    if (
      /^(modify|change|update|set|scale|resize|increase|decrease|move|offset|mirror|edit|adjust)\b/i.test(lower) ||
      /\b(?:set\s+[a-z_]+\s+to|change\s+[a-z_]+\s+to|update\s+[a-z_]+)\b/i.test(lower)
    ) {
      return "modify";
    }

    // Default to create (e.g. "draw...", "generate...", "recreate...", or pure image)
    return "create";
  }

  private extractEntities(prompt: string): ExtractedEntities {
    const lower = prompt.toLowerCase();

    // Primitives
    const primitivePatterns = [
      { name: "circle", regex: /\b(circle|radius|diameter)\b/g },
      { name: "line", regex: /\b(line|segment)\b/g },
      { name: "arc", regex: /\b(arc|curve)\b/g },
      { name: "rectangle", regex: /\b(rectangle|rect|box)\b/g },
      { name: "polyline", regex: /\b(polyline|contour|profile|path)\b/g },
      { name: "text", regex: /\b(text|label|annotation|title)\b/g },
    ];
    const primitives: string[] = [];
    for (const p of primitivePatterns) {
      if (p.regex.test(lower)) {
        primitives.push(p.name);
      }
    }

    // Civil / Structural Elements
    const civilPatterns = [
      { name: "t_beam", regex: /\b(t-beam|t\s+beam|tee\s+beam)\b/g },
      { name: "box_culvert", regex: /\b(box\s+culvert|culvert|cell\s+culvert|barrel)\b/g },
      { name: "bridge", regex: /\b(bridge|deck|superstructure|substructure)\b/g },
      { name: "slab", regex: /\b(slab|top\s+slab|bottom\s+slab|deck\s+slab|apron)\b/g },
      { name: "haunch", regex: /\b(haunch|chamfer|fillet)\b/g },
      { name: "pier", regex: /\b(pier|pier\s+cap|column|shaft)\b/g },
      { name: "abutment", regex: /\b(abutment|wing\s+wall|retaining\s+wall)\b/g },
      { name: "footing", regex: /\b(footing|foundation|base\s+slab|pile\s+cap)\b/g },
      { name: "rebar", regex: /\b(rebar|reinforcement|stirrup|tie|mesh|t12|t16|t20|t25|t32)\b/g },
      { name: "cushion", regex: /\b(earth\s+cushion|cushion|embankment)\b/g },
      { name: "backfill", regex: /\b(backfill|boulder|slope)\b/g },
    ];
    const civilElements: string[] = [];
    for (const c of civilPatterns) {
      if (c.regex.test(lower)) {
        civilElements.push(c.name);
      }
    }

    // Parameters & Numeric Quantities
    const parameters: Record<string, { value: number; unit: string; rawText?: string }> = {};
    const quantities: Array<{ value: number; unit: string; context?: string }> = [];

    // Extract numbers with units: e.g. "20 m", "20000 mm", "850 mm", "4100 mm", "500"
    const numberUnitRegex = /([a-zA-Z_]+)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|m|cm|deg|rad)?/gi;
    let match: RegExpExecArray | null;

    // Specific parameter recognition:
    // Span
    const spanMatch = lower.match(/\bspan\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (spanMatch) {
      const rawVal = parseFloat(spanMatch[1]);
      const unit = spanMatch[2]?.toLowerCase() || (rawVal < 100 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.span = { value: valMm, unit: "mm", rawText: spanMatch[0] };
    }

    // Height / Clear height
    const heightMatch = lower.match(/\b(?:clear\s+)?height\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (heightMatch) {
      const rawVal = parseFloat(heightMatch[1]);
      const unit = heightMatch[2]?.toLowerCase() || (rawVal < 50 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.height = { value: valMm, unit: "mm", rawText: heightMatch[0] };
    }

    // Depth
    const depthMatch = lower.match(/\b(?:effective\s+)?depth\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (depthMatch) {
      const rawVal = parseFloat(depthMatch[1]);
      const unit = depthMatch[2]?.toLowerCase() || (rawVal < 50 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.depth = { value: valMm, unit: "mm", rawText: depthMatch[0] };
    }

    // Width
    const widthMatch = lower.match(/\bwidth\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (widthMatch) {
      const rawVal = parseFloat(widthMatch[1]);
      const unit = widthMatch[2]?.toLowerCase() || (rawVal < 50 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.width = { value: valMm, unit: "mm", rawText: widthMatch[0] };
    }

    // Radius
    const radiusMatch = lower.match(/\bradius\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (radiusMatch) {
      const rawVal = parseFloat(radiusMatch[1]);
      const unit = radiusMatch[2]?.toLowerCase() || "mm";
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.radius = { value: valMm, unit: "mm", rawText: radiusMatch[0] };
    }

    // Haunch
    const haunchMatch = lower.match(/\bhaunch(?:es)?\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)(?:\s*[xX]\s*(\d+(?:\.\d+)?))?\s*(mm|m)?\b/i);
    if (haunchMatch) {
      const rawVal = parseFloat(haunchMatch[1]);
      const unit = haunchMatch[3]?.toLowerCase() || (rawVal < 10 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : rawVal;
      parameters.haunch = { value: valMm, unit: "mm", rawText: haunchMatch[0] };
    }

    // Wall thickness
    const wallMatch = lower.match(/\b(?:outer\s+)?wall(?:s)?(?:\s+thickness|\s+thk)?\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (wallMatch) {
      const rawVal = parseFloat(wallMatch[1]);
      const unit = wallMatch[2]?.toLowerCase() || (rawVal < 10 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.wall_thk = { value: valMm, unit: "mm", rawText: wallMatch[0] };
    }

    // Slab thickness
    const slabMatch = lower.match(/\b(?:top\s+|deck\s+)?slab(?:s)?(?:\s+thickness|\s+thk)?\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (slabMatch) {
      const rawVal = parseFloat(slabMatch[1]);
      const unit = slabMatch[2]?.toLowerCase() || (rawVal < 10 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.top_slab = { value: valMm, unit: "mm", rawText: slabMatch[0] };
    }

    // Cushion
    const cushionMatch = lower.match(/\bcushion\s*(?:depth|thickness|thk)?\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(m|mm|cm)?\b/i);
    if (cushionMatch) {
      const rawVal = parseFloat(cushionMatch[1]);
      const unit = cushionMatch[2]?.toLowerCase() || (rawVal < 20 ? "m" : "mm");
      const valMm = unit === "m" ? rawVal * 1000 : unit === "cm" ? rawVal * 10 : rawVal;
      parameters.cushion = { value: valMm, unit: "mm", rawText: cushionMatch[0] };
    }

    // Cell / Chamber count
    let cellCount: number | undefined;
    if (/\b(?:twin-cell|twin\s+barrel|double-cell|2-cell|two-cell|two\s+cell|twin\s+cell)\b/i.test(lower)) {
      cellCount = 2;
    } else if (/\b(?:triple-cell|3-cell|three-cell|three\s+cell)\b/i.test(lower)) {
      cellCount = 3;
    } else if (/\b(?:single-cell|1-cell|one-cell|single\s+cell)\b/i.test(lower)) {
      cellCount = 1;
    } else {
      const cm = lower.match(/\b(\d+)\s*-?\s*cell\b/i);
      if (cm) cellCount = parseInt(cm[1], 10);
    }

    // Extract target coordinate pairs: e.g. "(200, 150)" or "at 200, 150"
    const coordMatches = lower.matchAll(/(?:\bat\s+)?\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/g);
    const targetCoordinates: Array<{ x: number; y: number }> = [];
    for (const cm of coordMatches) {
      targetCoordinates.push({
        x: parseFloat(cm[1]),
        y: parseFloat(cm[2]),
      });
    }

    return {
      primitives,
      civilElements,
      parameters,
      quantities,
      targetCoordinates: targetCoordinates.length > 0 ? targetCoordinates : undefined,
      cellCount,
    };
  }

  private selectModelTier(
    intent: AgentIntent,
    inputMode: InputMode,
    entities: ExtractedEntities,
    prompt: string
  ): ModelTier {
    // If an image is provided, vision tier is mandatory
    if (inputMode === "text+image" || inputMode === "image-only") {
      return "vision";
    }

    // If complex civil/bridge/RCC structure or multi-formula engineering reasoning is required
    const isComplexEngineering =
      entities.civilElements.length > 0 ||
      /t-beam|bridge|culvert|pier|abutment|reinforcement|section|elevation|haunch/i.test(prompt);

    if (isComplexEngineering || intent === "explain") {
      return "strong";
    }

    // For simple primitive drawing or queries, fast tier is optimal
    return "fast";
  }

  private resolveModel(
    override: string | undefined,
    tier: ModelTier,
    prompt: string,
    hasOperations?: boolean
  ): string {
    // Check for explicit user overrides in prompt or option
    const lowerPrompt = prompt.toLowerCase();

    if (override) {
      return override;
    }

    if (hasOperations) {
      return "fastmcp";
    }

    if (/use\s+(?:gemini\s+)?(?:3\.8|flash)\b/i.test(lowerPrompt)) {
      return "gemini-3.8-flash";
    }
    if (/use\s+(?:gemini\s+)?3\.1\b/i.test(lowerPrompt)) {
      return "gemini-3.5-flash-lite";
    }
    if (/use\s+ollama\b|use\s+c3d\b/i.test(lowerPrompt)) {
      return "joshuaokolo/C3Dv0:latest";
    }
    if (/use\s+(?:fastmcp|ezdxf)\b/i.test(lowerPrompt)) {
      return "fastmcp";
    }
    if (/use\s+(?:local|deterministic)\b/i.test(lowerPrompt)) {
      return "deterministic-engine";
    }

    // Default model mapping per tier
    switch (tier) {
      case "vision":
        // Gemini 3.8 Flash or Gemini 2.5 Flash for vision
        return "gemini-3.8-flash";
      case "strong":
        return "gemini-3.8-flash";
      case "fast":
      default:
        return "gemini-3.5-flash-lite";
    }
  }

  private determinePipeline(
    intent: AgentIntent,
    inputMode: InputMode
  ): "parametric_drawing" | "image_reconstruction" | "dimension_addition" | "query_inspection" | "modification" | "explain" {
    if (inputMode === "text+image" || inputMode === "image-only") {
      return "image_reconstruction";
    }
    if (intent === "explain") {
      return "explain";
    }
    if (intent === "dimension") {
      return "dimension_addition";
    }
    if (intent === "query") {
      return "query_inspection";
    }
    if (intent === "modify") {
      return "modification";
    }
    return "parametric_drawing";
  }

  private buildReasoning(
    intent: AgentIntent,
    inputMode: InputMode,
    modelTier: ModelTier,
    selectedModel: string,
    entities: ExtractedEntities,
    override?: string
  ): { confidence: number; reasoning: string } {
    let conf = 0.95;
    const reasons: string[] = [];

    reasons.push(`Input mode "${inputMode}" detected.`);
    reasons.push(`Intent classified as "${intent}".`);

    if (override) {
      reasons.push(`Model "${selectedModel}" explicitly specified by user override.`);
    } else {
      reasons.push(`Model tier "${modelTier}" selected -> routed to "${selectedModel}".`);
    }

    if (entities.civilElements.length > 0) {
      reasons.push(`Civil components identified: [${entities.civilElements.join(", ")}].`);
    }
    if (entities.primitives.length > 0) {
      reasons.push(`Geometric primitives identified: [${entities.primitives.join(", ")}].`);
    }
    if (Object.keys(entities.parameters).length > 0) {
      const pList = Object.entries(entities.parameters).map(([k, v]) => `${k}=${v.value}${v.unit}`);
      reasons.push(`Parameters extracted: [${pList.join(", ")}].`);
    }

    return {
      confidence: conf,
      reasoning: reasons.join(" "),
    };
  }
}
