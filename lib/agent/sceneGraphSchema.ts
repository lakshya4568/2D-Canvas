/**
 * CAD Agent v2 — Scene Graph IR Schema & Validator
 * Canonical JSON schema and verification helper for the Scene Graph Intermediate Representation.
 */

import type { SceneGraphIR } from "./types";

export const SCENE_GRAPH_IR_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "SceneGraphIR",
  type: "object",
  properties: {
    schemaVersion: { type: "string", const: "2.0" },
    metadata: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        scale: { type: "string" },
        units: { type: "string", enum: ["mm"] },
        createdAt: { type: "string" },
        author: { type: "string" },
        engineVersion: { type: "string" },
      },
      required: ["title", "units", "createdAt", "engineVersion"],
    },
    parameters: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "number" },
          unit: { type: "string" },
          role: { type: "string", enum: ["DRIVING", "DERIVED", "FIXED", "MEASURED"] },
          expr: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "value", "unit", "role"],
      },
    },
    formulas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target: { type: "string" },
          expression: { type: "string" },
          dependencies: { type: "array", items: { type: "string" } },
        },
        required: ["target", "expression", "dependencies"],
      },
    },
    constraints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          entityA: { type: "string" },
          entityB: { type: "string" },
          value: { type: "number" },
        },
        required: ["id", "type", "entityA"],
      },
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          entityA: { type: "string" },
          entityB: { type: "string" },
          relation: { type: "string" },
        },
        required: ["id", "entityA", "entityB", "relation"],
      },
    },
    layers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          color: { type: "string" },
          lineType: { type: "string" },
        },
        required: ["name", "color"],
      },
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          layer: { type: "string" },
          symbolic: { type: "object" },
          evaluated: { type: "object" },
        },
        required: ["id", "type", "layer", "symbolic", "evaluated"],
      },
    },
    bounds: {
      type: "object",
      properties: {
        minX: { type: "number" },
        minY: { type: "number" },
        maxX: { type: "number" },
        maxY: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["minX", "minY", "maxX", "maxY", "width", "height"],
    },
    validation: {
      type: "object",
      properties: {
        isValid: { type: "boolean" },
        checks: { type: "array" },
      },
      required: ["isValid", "checks"],
    },
  },
  required: [
    "schemaVersion",
    "metadata",
    "parameters",
    "formulas",
    "constraints",
    "layers",
    "nodes",
    "bounds",
    "validation",
  ],
};

/**
 * Validates whether an object conforms to the SceneGraphIR contract.
 */
export function validateSceneGraphIR(ir: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!ir || typeof ir !== "object") {
    return { valid: false, errors: ["IR must be a non-null object"] };
  }

  const obj = ir as Partial<SceneGraphIR>;

  if (obj.schemaVersion !== "2.0") {
    errors.push(`Invalid schemaVersion: expected "2.0", received "${obj.schemaVersion}"`);
  }

  if (!obj.metadata || typeof obj.metadata !== "object") {
    errors.push("Missing required metadata object");
  } else {
    if (!obj.metadata.title) errors.push("Missing metadata.title");
    if (obj.metadata.units !== "mm") errors.push(`Units must be "mm", received "${obj.metadata.units}"`);
  }

  if (!obj.parameters || typeof obj.parameters !== "object") {
    errors.push("Missing required parameters dictionary");
  }

  if (!Array.isArray(obj.nodes)) {
    errors.push("Missing required nodes array");
  } else {
    for (let i = 0; i < obj.nodes.length; i++) {
      const node = obj.nodes[i];
      if (!node.id) errors.push(`Node[${i}] missing required id`);
      if (!node.type) errors.push(`Node[${i}] missing required type`);
      if (!node.layer) errors.push(`Node[${i}] missing required layer`);
      if (!node.evaluated) errors.push(`Node[${i}] missing evaluated coordinate metrics`);
    }
  }

  if (!obj.bounds) {
    errors.push("Missing required bounds object");
  } else {
    if (typeof obj.bounds.width !== "number" || typeof obj.bounds.height !== "number") {
      errors.push("Bounds must specify numeric width and height");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
