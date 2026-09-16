/**
 * CAD Agent v2 — Type Definitions & Contracts
 * Compliant with UPCE-MASTER-1.0 §56, UPCE-ADDENDUM-2.0, and doc2.md
 */

import type { Shape } from "../geometry/types";
import type { TolerancePolicy } from "../geometry/tolerance";

// ---------------------------------------------------------------------------
// 1. Router Types
// ---------------------------------------------------------------------------

export type AgentIntent =
  | "create"      // Generate new geometry / drawing from scratch
  | "modify"      // Adjust existing parameters, dimensions, or geometry
  | "query"       // Inspect dimensions, clearances, volume, or properties
  | "dimension"   // Add dimensions or annotations
  | "explain";    // Provide engineering or structural explanation

export type InputMode = "text-only" | "image-only" | "text+image";

export type ModelTier = "fast" | "strong" | "vision";

export interface ExtractedEntities {
  /** CAD Primitives detected: line, circle, arc, rectangle, polyline, text */
  primitives: string[];
  /** Structural / Civil engineering components detected */
  civilElements: string[];
  /** Named engineering parameters: span, depth, height, thickness, haunch, cushion, etc. */
  parameters: Record<string, { value: number; unit: string; rawText?: string }>;
  /** Raw numbers extracted with possible units */
  quantities: Array<{ value: number; unit: string; context?: string }>;
  /** Target coordinates if specified: (x, y) */
  targetCoordinates?: Array<{ x: number; y: number }>;
  /** Chamber / Cell count for multi-cell culverts (e.g. 1, 2, 3) */
  cellCount?: number;
}

export interface RouterDecision {
  intent: AgentIntent;
  inputMode: InputMode;
  modelTier: ModelTier;
  selectedModel: string;
  extractedEntities: ExtractedEntities;
  confidence: number;
  reasoning: string;
  suggestedPipeline: "parametric_drawing" | "image_reconstruction" | "dimension_addition" | "query_inspection" | "modification" | "explain";
}

// ---------------------------------------------------------------------------
// 2. Tool Layer & MCP Schema Types
// ---------------------------------------------------------------------------

export type SymbolicValue = number | string;

export interface ToolParameterSchema {
  type?: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  default?: unknown;
  anyOf?: ToolParameterSchema[];
}

export interface McpToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  description?: string;
}

export interface ToolResult {
  callId: string;
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// 3. Model Selector & Unified LLM Interface
// ---------------------------------------------------------------------------

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: Array<{
    mimeType: string;
    data: string; // Base64 or URL
  }>;
}

export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  tools?: McpToolSchema[];
  temperature?: number;
  thinkingBudget?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  modelUsed: string;
  thinking?: string;
  finishReason?: string;
  latencyMs: number;
}

export interface LlmProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generate(request: ModelRequest): Promise<ModelResponse>;
  supportsTools(): boolean;
  supportsVision(): boolean;
}

// ---------------------------------------------------------------------------
// 4. Planner Types
// ---------------------------------------------------------------------------

export interface ParameterSpec {
  name: string;
  value: number;
  unit: "mm" | "m" | "deg" | "rad" | "count" | "ratio";
  role: "DRIVING" | "DERIVED" | "FIXED" | "MEASURED";
  expr?: string;
  description?: string;
  minValue?: number;
  maxValue?: number;
}

export interface FormulaSpec {
  target: string;
  expression: string;
  dependencies: string[];
  description?: string;
}

export interface ConstraintSpec {
  id: string;
  type:
    | "parallel"
    | "perpendicular"
    | "tangent"
    | "equal"
    | "horizontal"
    | "vertical"
    | "coincident"
    | "distance"
    | "rigid_anchor";
  entityA: string;
  entityB?: string;
  value?: number;
  params?: Record<string, unknown>;
}

export interface RelationSpec {
  id: string;
  entityA: string;
  entityB: string;
  relation:
    | "slab_tied_to_spacing"
    | "haunch_symmetric"
    | "aligned_centers"
    | "rigid_component"
    | "relative_offset";
  params?: Record<string, unknown>;
}

export interface Plan {
  id: string;
  intent: AgentIntent;
  description: string;
  parameters: ParameterSpec[];
  formulas: FormulaSpec[];
  constraints: ConstraintSpec[];
  relations: RelationSpec[];
  steps: ToolCall[];
  metadata: {
    engineeringDomain: "civil_bridge" | "structural_box" | "mechanical_2d" | "general_geometry";
    standardsApplied?: string[]; // e.g. ["IRC:SP:13", "IRC:112"]
    rigidAnchorFixed: boolean;   // §18 Planar Rigid-Body Anchor Rule satisfied
  };
}

// ---------------------------------------------------------------------------
// 5. Scene Graph Intermediate Representation (IR)
// ---------------------------------------------------------------------------

export type SceneNodeType =
  | "line"
  | "rectangle"
  | "circle"
  | "arc"
  | "polyline"
  | "text"
  | "dimension"
  | "rebar"
  | "group";

export interface SceneNodeStyle {
  strokeColor?: string;
  strokeWidth?: number;
  strokeDash?: string;
  fillColor?: string;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
}

export interface SceneGraphNode {
  id: string;
  type: SceneNodeType;
  name?: string;
  layer: string;
  style: SceneNodeStyle;
  // Symbolic attributes (how the geometry is parametrically defined)
  symbolic: Record<string, SymbolicValue>;
  // Evaluated numeric values in model-space mm
  evaluated: Record<string, number>;
  // Additional points for polylines or composite elements
  points?: Array<{ x: number; y: number }>;
  // Children nodes for groups/assemblies
  children?: SceneGraphNode[];
  // References to driving parameters
  boundParameters?: string[];
}

export interface SceneGraphLayer {
  name: string;
  color: string;
  lineType?: "CONTINUOUS" | "DASHED" | "CENTER" | "PHANTOM";
  description?: string;
  visible?: boolean;
  locked?: boolean;
}

export interface SceneGraphParameter {
  name: string;
  value: number;
  unit: string;
  role: "DRIVING" | "DERIVED" | "FIXED" | "MEASURED";
  expr?: string;
  description?: string;
}

export interface SceneGraphFormula {
  target: string;
  expression: string;
  dependencies: string[];
}

export interface SceneGraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ValidationCheck {
  code: string;
  name: string;
  status: "PASS" | "WARNING" | "FAIL";
  clause?: string;
  message: string;
  actual?: number | string;
  expected?: string;
}

export interface MeasurementItem {
  item: string;
  description: string;
  quantity: number;
  unit: string;
}

export interface BoqItem {
  itemCode: string;
  description: string;
  quantity: number;
  unit: string;
  rateInr: number;
  amountInr: number;
  rate?: number;
  amount?: number;
}

export interface EstimatedCostSummary {
  baseCost: number;
  contingency: number;
  tpqa: number;
  gst: number;
  grandTotal: number;
}

export interface DerivedMetrics {
  totalConcreteAreaMm2?: number;
  totalConcreteVolumeM3PerM?: number;
  waterFlowAreaM2?: number;
  totalRebarLengthMm?: number;
  estimatedSteelWeightKgPerM?: number;
  summary: string;
  measurements?: MeasurementItem[];
  billOfQuantities?: BoqItem[];
  estimatedCost?: EstimatedCostSummary;
}

/**
 * The canonical Scene Graph Intermediate Representation (IR)
 * Contract between CAD Agent v2 and the 2D CAD Canvas / downstream viewers.
 */
export interface SceneGraphIR {
  schemaVersion: "2.0";
  metadata: {
    title: string;
    description: string;
    scale: string; // e.g. "1:100"
    units: "mm";
    createdAt: string;
    author: string;
    engineVersion: string;
  };
  parameters: Record<string, SceneGraphParameter>;
  formulas: SceneGraphFormula[];
  constraints: ConstraintSpec[];
  relations: RelationSpec[];
  layers: SceneGraphLayer[];
  nodes: SceneGraphNode[];
  bounds: SceneGraphBounds;
  derivedMetrics?: DerivedMetrics;
  validation: {
    isValid: boolean;
    checks: ValidationCheck[];
  };
}

// ---------------------------------------------------------------------------
// 6. Master Agent Request & Result
// ---------------------------------------------------------------------------

export interface AgentRequest {
  prompt: string;
  image?: {
    path?: string;
    base64?: string;
    mimeType?: string;
  };
  modelOverride?: string;
  activeParameters?: Record<string, number>;
  tolerancePolicy?: TolerancePolicy;
  operations?: Array<{ tool: string; args?: Record<string, any>; [key: string]: any }>;
}

export interface AgentLogEntry {
  stage: "router" | "model_selection" | "planning" | "tool_execution" | "evaluation" | "validation";
  timestamp: number;
  message: string;
  data?: unknown;
}

export interface AgentExecutionResult {
  success: boolean;
  prompt: string;
  routerDecision: RouterDecision;
  plan: Plan;
  toolResults: ToolResult[];
  sceneGraph: SceneGraphIR;
  shapes: Shape[];
  dxf: string;
  svg: string;
  previewPng?: string;
  logs: AgentLogEntry[];
  executionTimeMs: number;
  response?: string;
  explanation?: string;
  thinking?: string;
  error?: string;
}
