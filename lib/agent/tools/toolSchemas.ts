/**
 * CAD Agent v2 — Tool Schemas (MCP-Compatible)
 * Compliant with UPCE-MASTER-1.0 §56 and MCP standard tool declarations.
 *
 * Tools accept symbolic expressions (e.g. "span / 12", "span + 2 * wall_thk", "outer_w / 2")
 * as well as literal numbers.
 */

import type { McpToolSchema } from "../types";

export const CAD_TOOL_SCHEMAS: Record<string, McpToolSchema> = {
  draw_line: {
    name: "draw_line",
    description:
      "Draws a 2D line between two endpoints. Coordinates can be literal numbers or symbolic formulas referencing declared parameters.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for this line" },
        x1: { type: "string", description: "Start point X coordinate (number or expression, mm)" },
        y1: { type: "string", description: "Start point Y coordinate (number or expression, mm)" },
        x2: { type: "string", description: "End point X coordinate (number or expression, mm)" },
        y2: { type: "string", description: "End point Y coordinate (number or expression, mm)" },
        isReference: { type: "boolean", description: "True if centerline or datum line (construction geometry)" },
        layer: { type: "string", description: "CAD layer name (e.g. CONCRETE_OUTLINE, CENTERLINE, LEVELS)" },
        strokeColor: { type: "string", description: "Hex stroke color code" },
        strokeWidth: { type: "number", description: "Line width in mm" },
      },
      required: ["id", "x1", "y1", "x2", "y2"],
    },
  },

  draw_circle: {
    name: "draw_circle",
    description:
      "Draws a circle with center (cx, cy) and radius r. Coordinates and radius can be symbolic expressions referencing declared parameters.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for this circle" },
        cx: { type: "string", description: "Center X coordinate (number or expression, mm)" },
        cy: { type: "string", description: "Center Y coordinate (number or expression, mm)" },
        r: { type: "string", description: "Radius (number or expression, mm)" },
        layer: { type: "string", description: "CAD layer name (e.g. REBAR, DRAINAGE, CONCRETE)" },
        strokeColor: { type: "string", description: "Hex stroke color code" },
        fillColor: { type: "string", description: "Hex fill color code" },
      },
      required: ["id", "cx", "cy", "r"],
    },
  },

  draw_arc: {
    name: "draw_arc",
    description:
      "Draws a circular arc from center (cx, cy) with specified radius, start angle, and end angle.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for this arc" },
        cx: { type: "string", description: "Center X coordinate (number or expression, mm)" },
        cy: { type: "string", description: "Center Y coordinate (number or expression, mm)" },
        radius: { type: "string", description: "Radius of arc (number or expression, mm)" },
        startAngle: { type: "number", description: "Start angle in degrees (0 = +X axis)" },
        endAngle: { type: "number", description: "End angle in degrees" },
        layer: { type: "string", description: "CAD layer name" },
        strokeColor: { type: "string", description: "Hex stroke color code" },
      },
      required: ["id", "cx", "cy", "radius", "startAngle", "endAngle"],
    },
  },

  draw_rectangle: {
    name: "draw_rectangle",
    description:
      "Draws a rectangle given bottom-left (x, y), width, and height. Width and height can be symbolic expressions referencing declared parameters.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for this rectangle" },
        x: { type: "string", description: "Bottom-left X coordinate (number or expression, mm)" },
        y: { type: "string", description: "Bottom-left Y coordinate (number or expression, mm)" },
        width: { type: "string", description: "Rectangle width (number or expression, mm)" },
        height: { type: "string", description: "Rectangle height (number or expression, mm)" },
        layer: { type: "string", description: "CAD layer name (e.g. CONCRETE_OUTLINE, EARTH_CUSHION, FOUNDATION)" },
        strokeColor: { type: "string", description: "Hex stroke color code" },
        fillColor: { type: "string", description: "Hex fill color code" },
      },
      required: ["id", "x", "y", "width", "height"],
    },
  },

  draw_polyline: {
    name: "draw_polyline",
    description:
      "Draws a 2D polyline through a sequence of vertices. Coordinates can be symbolic expressions.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for this polyline" },
        points: {
          type: "array",
          description: "Ordered array of vertices { x: string|number, y: string|number }",
          items: {
            type: "object",
            properties: {
              x: { type: "string", description: "X coordinate (number or expression)" },
              y: { type: "string", description: "Y coordinate (number or expression)" },
            },
            required: ["x", "y"],
          },
        },
        closed: { type: "boolean", description: "True if polyline should close back to first vertex" },
        layer: { type: "string", description: "CAD layer name" },
        strokeColor: { type: "string", description: "Hex stroke color code" },
        fillColor: { type: "string", description: "Hex fill color code" },
      },
      required: ["id", "points"],
    },
  },

  draw_text: {
    name: "draw_text",
    description:
      "Places text or engineering annotation at (x, y).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for this text" },
        x: { type: "string", description: "Anchor X coordinate (number or expression, mm)" },
        y: { type: "string", description: "Anchor Y coordinate (number or expression, mm)" },
        text: { type: "string", description: "Text content to display" },
        height: { type: "number", description: "Font size/text height in mm (default: 250)" },
        layer: { type: "string", description: "CAD layer name (e.g. LEVELS, ANNOTATIONS, DIMENSIONS)" },
        rotation: { type: "number", description: "Rotation in degrees" },
        color: { type: "string", description: "Hex text color code" },
      },
      required: ["id", "x", "y", "text"],
    },
  },

  set_position: {
    name: "set_position",
    description:
      "Sets the position of an existing geometric entity.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Target entity ID" },
        x: { type: "string", description: "New X coordinate (number or expression, mm)" },
        y: { type: "string", description: "New Y coordinate (number or expression, mm)" },
      },
      required: ["entityId", "x", "y"],
    },
  },

  move: {
    name: "move",
    description:
      "Displaces an entity by relative offsets dx and dy.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Target entity ID" },
        dx: { type: "string", description: "Displacement along X (number or expression, mm)" },
        dy: { type: "string", description: "Displacement along Y (number or expression, mm)" },
      },
      required: ["entityId", "dx", "dy"],
    },
  },

  offset: {
    name: "offset",
    description:
      "Generates an offset entity at a specified perpendicular distance.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Target entity ID" },
        distance: { type: "string", description: "Offset distance in mm (number or expression)" },
        side: { type: "string", description: "Offset side: 'left', 'right', 'inside', or 'outside'", enum: ["left", "right", "inside", "outside"] },
      },
      required: ["entityId", "distance"],
    },
  },

  mirror: {
    name: "mirror",
    description:
      "Creates a mirrored copy of an entity across a mirror line defined by two points.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Target entity ID" },
        axisP1: {
          type: "object",
          description: "First point on the mirror line {x, y}",
          properties: {
            x: { type: "string", description: "X coordinate (number or expression)" },
            y: { type: "string", description: "Y coordinate (number or expression)" },
          },
          required: ["x", "y"],
        },
        axisP2: {
          type: "object",
          description: "Second point on the mirror line {x, y}",
          properties: {
            x: { type: "string", description: "X coordinate (number or expression)" },
            y: { type: "string", description: "Y coordinate (number or expression)" },
          },
          required: ["x", "y"],
        },
      },
      required: ["entityId", "axisP1", "axisP2"],
    },
  },

  add_dimension: {
    name: "add_dimension",
    description:
      "Adds an engineering dimension line with witness ticks and label between entities or coordinates.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for dimension" },
        type: { type: "string", description: "Dimension type", enum: ["linear", "radial", "angular", "aligned"] },
        entityA: { type: "string", description: "First reference entity or coordinate marker" },
        entityB: { type: "string", description: "Second reference entity or coordinate marker" },
        value: { type: "number", description: "Nominal value in mm" },
        expression: { type: "string", description: "Symbolic parameter name or formula (e.g. 'span')" },
        text: { type: "string", description: "Custom label text (e.g. 'CLEAR SPAN: 10700 mm')" },
        placement: { type: "string", description: "Placement hint: 'top', 'bottom', 'left', 'right', 'interior'", enum: ["top", "bottom", "left", "right", "interior"] },
        direction: { type: "string", description: "Linear direction: 'horizontal' or 'vertical'", enum: ["horizontal", "vertical"] },
      },
      required: ["id", "type", "entityA"],
    },
  },

  add_constraint: {
    name: "add_constraint",
    description:
      "Adds a geometric or kinematic constraint between entities (parallel, perpendicular, tangent, equal, horizontal, vertical, coincident, rigid_anchor).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for constraint" },
        type: {
          type: "string",
          description: "Constraint type",
          enum: [
            "parallel",
            "perpendicular",
            "tangent",
            "equal",
            "horizontal",
            "vertical",
            "coincident",
            "distance",
            "rigid_anchor",
          ],
        },
        entityA: { type: "string", description: "First constrained entity ID" },
        entityB: { type: "string", description: "Second constrained entity ID (optional for unary constraints like horizontal)" },
        value: { type: "number", description: "Target metric value (e.g. distance in mm or angle in deg)" },
        params: { type: "object", description: "Additional parameters for solver residuals" },
      },
      required: ["id", "type", "entityA"],
    },
  },

  create_parameter: {
    name: "create_parameter",
    description:
      "Declares a driving or fixed engineering parameter (e.g. span = 20000 mm, wall_thk = 850 mm).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Parameter name in camelCase or snake_case (e.g. 'span', 'clear_height')" },
        value: { type: "number", description: "Nominal numeric value" },
        unit: { type: "string", description: "Unit of measurement", enum: ["mm", "m", "deg", "rad", "count", "ratio"] },
        role: { type: "string", description: "Role in solver", enum: ["DRIVING", "DERIVED", "FIXED", "MEASURED"] },
        minValue: { type: "number", description: "Minimum admissible bound" },
        maxValue: { type: "number", description: "Maximum admissible bound" },
        description: { type: "string", description: "Engineering description of parameter" },
      },
      required: ["name", "value", "unit"],
    },
  },

  bind_formula: {
    name: "bind_formula",
    description:
      "Binds a mathematical expression to derive a property or parameter from other parameters (e.g. depth = span / 12, outer_w = span + 2 * wall_thk).",
    parameters: {
      type: "object",
      properties: {
        property: { type: "string", description: "Name of target parameter or property to bind" },
        expression: { type: "string", description: "Mathematical formula (e.g. 'span / 12', 'span + 2 * wall_thk')" },
        targetEntity: { type: "string", description: "Optional entity ID if binding directly to a shape attribute" },
        description: { type: "string", description: "Engineering rationale or standard clause reference" },
      },
      required: ["property", "expression"],
    },
  },

  add_relation: {
    name: "add_relation",
    description:
      "Establishes a high-level parametric relationship between two composite entities (e.g. haunch symmetry, slab tied to beam spacing, centroid alignment).",
    parameters: {
      type: "object",
      properties: {
        entity_a: { type: "string", description: "First entity or component ID" },
        entity_b: { type: "string", description: "Second entity or component ID" },
        relation: {
          type: "string",
          description: "Relation kind",
          enum: [
            "slab_tied_to_spacing",
            "haunch_symmetric",
            "aligned_centers",
            "rigid_component",
            "relative_offset",
          ],
        },
        params: { type: "object", description: "Relation configuration parameters" },
      },
      required: ["entity_a", "entity_b", "relation"],
    },
  },

  draw_chamfer: {
    name: "draw_chamfer",
    description:
      "Constructs a 45-degree or custom corner bevel/haunch (e.g. 600x600 mm corner haunch) between two intersecting or meeting lines/edges.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for chamfer entity" },
        x1: { type: "string", description: "First corner vertex X coordinate (number or expression, mm)" },
        y1: { type: "string", description: "First corner vertex Y coordinate (number or expression, mm)" },
        x2: { type: "string", description: "Second corner vertex X coordinate (number or expression, mm)" },
        y2: { type: "string", description: "Second corner vertex Y coordinate (number or expression, mm)" },
        distance1: { type: "string", description: "First leg distance in mm (e.g. 'haunch' or 600)" },
        distance2: { type: "string", description: "Second leg distance in mm (default: same as distance1)" },
        layer: { type: "string", description: "CAD layer name (default: CONCRETE_SECTION)" },
      },
      required: ["id", "x1", "y1", "x2", "y2"],
    },
  },

  draw_fillet: {
    name: "draw_fillet",
    description:
      "Constructs a tangent circular arc fillet with specified radius r between two meeting lines.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Unique identifier for fillet entity" },
        cx: { type: "string", description: "Fillet arc center X coordinate (number or expression, mm)" },
        cy: { type: "string", description: "Fillet arc center Y coordinate (number or expression, mm)" },
        radius: { type: "string", description: "Fillet radius in mm (number or expression)" },
        startAngle: { type: "number", description: "Fillet arc start angle in degrees" },
        endAngle: { type: "number", description: "Fillet arc end angle in degrees" },
        layer: { type: "string", description: "CAD layer name" },
      },
      required: ["id", "cx", "cy", "radius", "startAngle", "endAngle"],
    },
  },

  trim: {
    name: "trim",
    description:
      "Trims a line or curve entity at an intersection or target bound coordinate.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID to trim" },
        endpoint: { type: "string", description: "Which end to trim: 'start' or 'end'", enum: ["start", "end"] },
        targetX: { type: "string", description: "New endpoint X coordinate (number or expression, mm)" },
        targetY: { type: "string", description: "New endpoint Y coordinate (number or expression, mm)" },
      },
      required: ["entityId", "endpoint", "targetX", "targetY"],
    },
  },

  extend: {
    name: "extend",
    description:
      "Extends a line entity to a target coordinate or boundary.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID to extend" },
        endpoint: { type: "string", description: "Which end to extend: 'start' or 'end'", enum: ["start", "end"] },
        targetX: { type: "string", description: "Extended endpoint X coordinate (number or expression, mm)" },
        targetY: { type: "string", description: "Extended endpoint Y coordinate (number or expression, mm)" },
      },
      required: ["entityId", "endpoint", "targetX", "targetY"],
    },
  },

  delete_entity: {
    name: "delete_entity",
    description:
      "Deletes an entity from the active drawing (for self-correction).",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID to remove" },
      },
      required: ["entityId"],
    },
  },

  inspect_geometry: {
    name: "inspect_geometry",
    description:
      "Inspects active drawing geometry: lists entities, bounds, coordinates, lengths, and layer groupings for self-verification.",
    parameters: {
      type: "object",
      properties: {
        layer: { type: "string", description: "Optional layer filter" },
        entityId: { type: "string", description: "Optional specific entity ID to inspect" },
      },
      required: [],
    },
  },

  measure_distance: {
    name: "measure_distance",
    description:
      "Measures the Euclidean distance and horizontal/vertical clearance between two entities or coordinates in mm.",
    parameters: {
      type: "object",
      properties: {
        entityA: { type: "string", description: "First entity ID" },
        entityB: { type: "string", description: "Second entity ID" },
        x1: { type: "number", description: "First point X (if measuring raw coords)" },
        y1: { type: "number", description: "First point Y" },
        x2: { type: "number", description: "Second point X" },
        y2: { type: "number", description: "Second point Y" },
      },
      required: [],
    },
  },

  measure_angle: {
    name: "measure_angle",
    description:
      "Measures the angle in degrees between two lines or directions.",
    parameters: {
      type: "object",
      properties: {
        entityA: { type: "string", description: "First line entity ID" },
        entityB: { type: "string", description: "Second line entity ID" },
      },
      required: ["entityA", "entityB"],
    },
  },

  calculate_intersections: {
    name: "calculate_intersections",
    description:
      "Calculates geometric intersection points between two entities.",
    parameters: {
      type: "object",
      properties: {
        entityA: { type: "string", description: "First entity ID" },
        entityB: { type: "string", description: "Second entity ID" },
      },
      required: ["entityA", "entityB"],
    },
  },

  dof_analysis: {
    name: "dof_analysis",
    description:
      "Performs degrees of freedom (DOF) and constraint health analysis. Checks for 3-DOF rigid body anchoring (§18) and under/over-constrained state.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  verify_goal: {
    name: "verify_goal",
    description:
      "Verifies whether target geometric criteria (e.g. clear span == 10700 mm, clear height == 4100 mm, haunches == 600 mm, rigid anchor fixed) are satisfied by the active drawing.",
    parameters: {
      type: "object",
      properties: {
        expectedSpan: { type: "number", description: "Target clear span in mm" },
        expectedHeight: { type: "number", description: "Target clear height in mm" },
        expectedHaunch: { type: "number", description: "Target haunch dimension in mm" },
        checkRigidAnchor: { type: "boolean", description: "True to verify 3-DOF planar rigid anchor" },
      },
      required: [],
    },
  },

  complete_drawing: {
    name: "complete_drawing",
    description:
      "Signals that all geometric requirements and design intent goals are fully satisfied. Finalizes the autonomous agent loop with an engineering sign-off report.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Summary of constructed geometry and verification results" },
        status: { type: "string", enum: ["GOAL_SATISFIED", "PARTIAL", "FAILED"], description: "Final verification status" },
      },
      required: ["summary", "status"],
    },
  },

  gad_parse_drawing: {
    name: "gad_parse_drawing",
    description:
      "Parses civil General Arrangement Drawing (GAD) into canonical GADModel with civil entities, parameters, and formula DAG.",
    parameters: {
      type: "object",
      properties: {
        image_path: { type: "string", description: "Path to image or drawing file" },
        project_name: { type: "string", description: "Name of bridge/culvert project" },
      },
      required: [],
    },
  },

  gad_update_parameters: {
    name: "gad_update_parameters",
    description:
      "Updates driving parameters of active GAD drawing with zero conformal scaling (§8).",
    parameters: {
      type: "object",
      properties: {
        deltas: { type: "object", description: "Key-value dictionary of parameter updates" },
      },
      required: ["deltas"],
    },
  },

  gad_query_drawing: {
    name: "gad_query_drawing",
    description:
      "Queries hydraulic clearance, waterway area, and geometric metrics of active GAD model.",
    parameters: {
      type: "object",
      properties: {
        query_str: { type: "string", description: "Query query text" },
      },
      required: [],
    },
  },
};

/**
 * Returns all tool schemas as an array for LLM function calling registration.
 */
export function getAllToolSchemas(): McpToolSchema[] {
  return Object.values(CAD_TOOL_SCHEMAS);
}

/**
 * Returns a specific tool schema by tool name.
 */
export function getToolSchema(name: string): McpToolSchema | undefined {
  return CAD_TOOL_SCHEMAS[name];
}
