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
