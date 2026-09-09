/**
 * Canonical Export / Import Round-Trip Serialization Engine
 * UPCE-MASTER-1.0 §86, §35–§38, §82, Appendix B, Gate G7 (§76)
 *
 * Implements strict serialization to/from canonical JSON schemas:
 * - parametric-sketch.schema.json
 * - template.schema.json
 * with 100% round-trip fidelity verification.
 */

import { ParametricSketch, TemplateDefinition } from "../parametric/schemaTypes";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";
import { DcelPlanarMap } from "../geometry/topology/dcel";
import { CURRENT_SCHEMA_VERSION, CURRENT_ENGINE_VERSION, migrateSketch, migrateTemplate } from "../parametric/templates/templateMigration";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a sketch object against the canonical parametric-sketch schema requirements.
 */
export function validateSketchSchema(data: any): SchemaValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Data is not a valid object."] };
  }

  // Required top-level fields
  const requiredTop = [
    "sketchId",
    "schemaVersion",
    "units",
    "tolerances",
    "parameters",
    "formulas",
    "primitives",
    "topology",
    "constraints",
  ];

  for (const field of requiredTop) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`Missing required top-level property '${field}'.`);
    }
  }

  if (data.schemaVersion !== "1.0") {
    errors.push(`schemaVersion must be '1.0', received '${data.schemaVersion}'.`);
  }

  // Units
  if (data.units) {
    if (!["mm", "m", "in", "ft"].includes(data.units.length)) {
      errors.push(`Invalid length unit '${data.units.length}'.`);
    }
    if (!["deg", "rad"].includes(data.units.angle)) {
      errors.push(`Invalid angle unit '${data.units.angle}'.`);
    }
  }

  // Tolerances
  if (data.tolerances) {
    const reqTol = [
      "units",
      "weld_mm",
      "geometry_mm",
      "cluster_mm",
      "angle_rad",
      "solver_residual",
      "singular_value_eps",
      "independence_eps",
    ];
    for (const t of reqTol) {
      if (data.tolerances[t] === undefined) {
        errors.push(`Missing tolerance property '${t}'.`);
      }
    }
  }

  // Parameters
  if (data.parameters) {
    if (typeof data.parameters !== "object" || Array.isArray(data.parameters)) {
      errors.push("sketch.parameters must be an object dictionary keyed by parameter ID.");
    }
  }

  // Primitives
  if (data.primitives) {
    if (!data.primitives.points || typeof data.primitives.points !== "object" || Array.isArray(data.primitives.points)) {
      errors.push("Missing or invalid primitives.points (must be a dictionary).");
    }
    if (!data.primitives.lines || typeof data.primitives.lines !== "object" || Array.isArray(data.primitives.lines)) {
      errors.push("Missing or invalid primitives.lines (must be a dictionary).");
    }
    if (!data.primitives.arcs || typeof data.primitives.arcs !== "object" || Array.isArray(data.primitives.arcs)) {
      errors.push("Missing or invalid primitives.arcs (must be a dictionary).");
    }
    if (!data.primitives.circles || typeof data.primitives.circles !== "object" || Array.isArray(data.primitives.circles)) {
      errors.push("Missing or invalid primitives.circles (must be a dictionary).");
    }
  }

  // Topology
  if (data.topology) {
    if (!data.topology.halfEdges || typeof data.topology.halfEdges !== "object" || Array.isArray(data.topology.halfEdges)) {
      errors.push("Missing or invalid topology.halfEdges (must be a dictionary).");
    }
    if (!data.topology.faces || typeof data.topology.faces !== "object" || Array.isArray(data.topology.faces)) {
      errors.push("Missing or invalid topology.faces (must be a dictionary).");
    }
  }

  // Constraints
  if (data.constraints) {
    if (typeof data.constraints !== "object" || Array.isArray(data.constraints)) {
      errors.push("sketch.constraints must be an object dictionary keyed by constraint ID.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a template object against the canonical template schema requirements.
 */
export function validateTemplateSchema(data: any): SchemaValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Data is not a valid object."] };
  }

  const requiredTop = [
    "id",
    "name",
    "category",
    "schemaVersion",
    "engineVersion",
    "parameters",
    "expressions",
    "geometry",
    "constraints",
    "ports",
    "semantics",
    "validation",
    "provenance",
  ];

  for (const field of requiredTop) {
    if (data[field] === undefined || data[field] === null) {
      errors.push(`Missing required template property '${field}'.`);
    }
  }

  if (data.schemaVersion !== "1.0") {
    errors.push(`Template schemaVersion must be '1.0', received '${data.schemaVersion}'.`);
  }

  if (data.category && !["component", "bridge", "detail", "assembly"].includes(data.category)) {
    errors.push(`Invalid template category '${data.category}'.`);
  }

  if (data.parameters && !Array.isArray(data.parameters)) {
    errors.push("template.parameters must be an array.");
  }
  if (data.expressions && !Array.isArray(data.expressions)) {
    errors.push("template.expressions must be an array.");
  }
  if (data.constraints && !Array.isArray(data.constraints)) {
    errors.push("template.constraints must be an array.");
  }
  if (data.ports && !Array.isArray(data.ports)) {
    errors.push("template.ports must be an array.");
  }
  if (data.semantics && !Array.isArray(data.semantics)) {
    errors.push("template.semantics must be an array.");
  }
  if (data.validation && !Array.isArray(data.validation)) {
    errors.push("template.validation must be an array.");
  }
  if (data.provenance && !Array.isArray(data.provenance)) {
    errors.push("template.provenance must be an array.");
  }

  if (data.geometry) {
    if (!Array.isArray(data.geometry.points)) errors.push("geometry.points must be an array.");
    if (!Array.isArray(data.geometry.lines)) errors.push("geometry.lines must be an array.");
    if (!Array.isArray(data.geometry.arcs)) errors.push("geometry.arcs must be an array.");
    if (!Array.isArray(data.geometry.circles)) errors.push("geometry.circles must be an array.");
    if (!Array.isArray(data.geometry.polylines)) errors.push("geometry.polylines must be an array.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Serializes a ParametricSketch to canonical formatted JSON string.
 */
export function serializeSketch(sketch: ParametricSketch, indent: number = 2): string {
  const validation = validateSketchSchema(sketch);
  if (!validation.valid) {
    throw new Error(`[SketchSerializer] Invalid sketch schema: ${validation.errors.join("; ")}`);
  }
  return JSON.stringify(sketch, null, indent);
}

/**
 * Deserializes a ParametricSketch from JSON string or object, performing auto-migration if needed.
 */
export function deserializeSketch(jsonStrOrObj: string | object): ParametricSketch {
  let parsed: any;
  if (typeof jsonStrOrObj === "string") {
    try {
      parsed = JSON.parse(jsonStrOrObj);
    } catch (e: any) {
      throw new Error(`[SketchSerializer] JSON parse error: ${e.message}`);
    }
  } else {
    parsed = jsonStrOrObj;
  }

  const val = validateSketchSchema(parsed);
  if (!val.valid) {
    // Attempt backward-compatible migration
    const migration = migrateSketch(parsed);
    const postVal = validateSketchSchema(migration.result);
    if (!postVal.valid) {
      throw new Error(
        `[SketchSerializer] Failed to deserialize sketch even after migration: ${postVal.errors.join("; ")}`
      );
    }
    return migration.result;
  }

  return parsed as ParametricSketch;
}

/**
 * Serializes a TemplateDefinition to canonical formatted JSON string.
 */
export function serializeTemplate(template: TemplateDefinition, indent: number = 2): string {
  const validation = validateTemplateSchema(template);
  if (!validation.valid) {
    throw new Error(`[SketchSerializer] Invalid template schema: ${validation.errors.join("; ")}`);
  }
  return JSON.stringify(template, null, indent);
}

/**
 * Deserializes a TemplateDefinition from JSON string or object, migrating if necessary.
 */
export function deserializeTemplate(jsonStrOrObj: string | object): TemplateDefinition {
  let parsed: any;
  if (typeof jsonStrOrObj === "string") {
    try {
      parsed = JSON.parse(jsonStrOrObj);
    } catch (e: any) {
      throw new Error(`[SketchSerializer] JSON parse error: ${e.message}`);
    }
  } else {
    parsed = jsonStrOrObj;
  }

  const val = validateTemplateSchema(parsed);
  if (!val.valid) {
    const migration = migrateTemplate(parsed);
    const postVal = validateTemplateSchema(migration.result);
    if (!postVal.valid) {
      throw new Error(
        `[SketchSerializer] Failed to deserialize template after migration: ${postVal.errors.join("; ")}`
      );
    }
    return migration.result;
  }

  return parsed as TemplateDefinition;
}

export interface RoundTripResult {
  matches: boolean;
  differences: string[];
}

/**
 * Validates lossless round-trip serialization/deserialization fidelity.
 */
export function verifyRoundTripSketch(original: ParametricSketch): RoundTripResult {
  const differences: string[] = [];

  const json1 = serializeSketch(original);
  const deserialized = deserializeSketch(json1);
  const json2 = serializeSketch(deserialized);

  if (json1 !== json2) {
    differences.push("Serialized JSON string mismatch after round-trip.");
  }

  // Deep comparison of keys
  if (original.sketchId !== deserialized.sketchId) {
    differences.push(`sketchId mismatch: ${original.sketchId} !== ${deserialized.sketchId}`);
  }
  if (Object.keys(original.parameters).length !== Object.keys(deserialized.parameters).length) {
    differences.push("Parameters count mismatch after round-trip.");
  }
  if (Object.keys(original.primitives.points).length !== Object.keys(deserialized.primitives.points).length) {
    differences.push("Points count mismatch after round-trip.");
  }
  if (Object.keys(original.constraints).length !== Object.keys(deserialized.constraints).length) {
    differences.push("Constraints count mismatch after round-trip.");
  }

  return {
    matches: differences.length === 0,
    differences,
  };
}

/**
 * Validates lossless round-trip serialization/deserialization for TemplateDefinition.
 */
export function verifyRoundTripTemplate(original: TemplateDefinition): RoundTripResult {
  const differences: string[] = [];

  const json1 = serializeTemplate(original);
  const deserialized = deserializeTemplate(json1);
  const json2 = serializeTemplate(deserialized);

  if (json1 !== json2) {
    differences.push("Serialized Template JSON mismatch after round-trip.");
  }

  if (original.id !== deserialized.id) {
    differences.push(`Template id mismatch: ${original.id} !== ${deserialized.id}`);
  }
  if (original.parameters.length !== deserialized.parameters.length) {
    differences.push("Template parameters length mismatch.");
  }
  if (original.geometry.points.length !== deserialized.geometry.points.length) {
    differences.push("Template geometry points length mismatch.");
  }

  return {
    matches: differences.length === 0,
    differences,
  };
}

/**
 * Synthesizes a valid canonical ParametricSketch from a DCEL planar map and constraints.
 */
export function createParametricSketchFromDcel(options: {
  sketchId: string;
  name?: string;
  map: DcelPlanarMap;
  parameters?: Record<string, any>;
  constraints?: Record<string, any>;
  policy?: TolerancePolicy;
}): ParametricSketch {
  const policy = options.policy ?? DEFAULT_TOLERANCE_POLICY;
  const { map } = options;

  const points: ParametricSketch["primitives"]["points"] = {};
  for (const [vId, v] of map.vertices.entries()) {
    points[vId] = {
      id: vId,
      x: v.point.x,
      y: v.point.y,
      isConstruction: false,
      fixed: false,
      dofStatus: "FREE",
    };
  }

  const lines: ParametricSketch["primitives"]["lines"] = {};
  for (const [eId, edge] of map.edges.entries()) {
    const he = map.halfEdges.get(edge.halfEdge);
    if (he) {
      lines[eId] = {
        id: eId,
        startPointId: he.origin,
        endPointId: he.target,
        isConstruction: false,
      };
    }
  }

  const halfEdges: ParametricSketch["topology"]["halfEdges"] = {};
  for (const [heId, he] of map.halfEdges.entries()) {
    halfEdges[heId] = {
      id: heId,
      originPointId: he.origin,
      twinHalfEdgeId: he.twin,
      nextHalfEdgeId: he.next,
      prevHalfEdgeId: he.prev,
      faceId: he.face || "f_ext",
      primitiveId: he.edge,
    };
  }

  const faces: ParametricSketch["topology"]["faces"] = {};
  for (const [fId, face] of map.faces.entries()) {
    let cat: any = face.semanticCategory || "UNCLASSIFIED";
    if (![
      "VOID",
      "TOP_SLAB",
      "BOTTOM_SLAB",
      "OUTER_WALL",
      "INTERNAL_WEB",
      "HAUNCH",
      "FOOTING",
      "BARRIER",
      "DECK",
      "PIER",
      "UNCLASSIFIED",
    ].includes(cat)) {
      cat = "UNCLASSIFIED";
    }

    faces[fId] = {
      id: fId,
      outerHalfEdgeId: face.outerBoundary || "",
      innerHoles: face.innerHoles,
      nestingDepth: face.nestingDepth,
      semanticCategory: cat,
      tags: face.tags,
    };
  }

  const sketch: ParametricSketch = {
    sketchId: options.sketchId,
    schemaVersion: "1.0",
    engineVersion: CURRENT_ENGINE_VERSION,
    name: options.name || options.sketchId,
    units: {
      length: "mm",
      angle: "deg",
    },
    tolerances: {
      units: "mm",
      weld_mm: policy.weld_mm,
      geometry_mm: policy.geometry_mm,
      cluster_mm: policy.cluster_mm,
      angle_rad: policy.angle_rad,
      solver_residual: policy.solver_residual,
      singular_value_eps: policy.singular_value_eps,
      independence_eps: policy.independence_eps,
    },
    parameters: options.parameters || {},
    formulas: [],
    primitives: {
      points,
      lines,
      arcs: {},
      circles: {},
      polylines: {},
    },
    topology: {
      halfEdges,
      faces,
    },
    constraints: (options.constraints as any) || {},
  };

  return sketch;
}
