/**
 * AI layer contract types.
 * UPCE-MASTER-1.0 §53–§57.
 *
 * The single most important type in this file is `NamingPatch`. §56 requires the
 * LLM's zero geometric authority to be "enforced by the type of the apply
 * function, not by convention" — so a patch can carry ONLY a name, a semantic
 * tag, a UI group, and explanation text. There is no field here through which a
 * coordinate, a value, a constraint, or a topology change could travel.
 */

export type ParameterRole = "DRIVING" | "DERIVED" | "FIXED";
export type ParameterValueType = "LENGTH" | "ANGLE" | "COUNT" | "RATIO";
export type ParameterUnit = "mm" | "m" | "deg" | "count" | "ratio";

/** The ONLY fields any namer — LLM or deterministic — may write. */
export interface NamingPatch {
  readonly candidateId: string;
  readonly name: string;
  readonly role: ParameterRole;
  readonly type?: ParameterValueType;
  readonly unit: ParameterUnit;
  readonly uiGroup?: string;
  readonly semanticTag?: string;
  readonly confidence: number;
  readonly explanation?: string;
}

export interface NamingResult {
  structureType?: string;
  names: NamingPatch[];
  source: "llm" | "deterministic-fallback" | "cache";
  /** Populated when the LLM path was attempted and did not produce the result. */
  fallbackReason?: string;
  elapsedMs: number;
}

/**
 * The abstracted descriptor sent to the model. §56 privacy guardrail: "Never send
 * full drawings, coordinate clouds, or binary CAD files. Send cluster statistics,
 * adjacency, orientation, and topology role only."
 *
 * There is deliberately no `points`, `x`, `y`, `coordinates`, or `geometry` field.
 */
export interface AbstractedCluster {
  rawId: string;
  kind: "offset_cluster" | "span" | "chamfer" | "repeat" | "radius" | "angle";
  nominalValue: number;
  members?: number;
  orientation?: string;
  adjacency?: string;
  encloses?: string;
}

export interface AbstractedFace {
  type: "VOID" | "SOLID";
  width?: number;
  height?: number;
  count?: number;
  bounds?: string;
}

export interface AbstractedDescriptor {
  drawingType: string;
  units: "mm";
  structureBoundingBox: { width: number; height: number };
  detectedFaces: AbstractedFace[];
  clusters: AbstractedCluster[];
  inferredFormulas: string[];
}

export interface Namer {
  name(descriptor: AbstractedDescriptor): Promise<NamingResult>;
}
