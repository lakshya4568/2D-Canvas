import { describe, it, expect } from "vitest";
import { CAD_TOOL_SCHEMAS, getAllToolSchemas, getToolSchema } from "../../lib/agent/tools/toolSchemas";
import { ToolRegistry } from "../../lib/agent/tools/toolRegistry";
import type { SceneGraphNode } from "../../lib/agent/types";

describe("CAD Agent v2 — Tool Schemas (MCP-Compatible)", () => {
  it("should declare all required CAD primitives and parametric operations", () => {
    const requiredTools = [
      "draw_line",
      "draw_circle",
      "draw_arc",
      "draw_rectangle",
      "draw_polyline",
      "draw_text",
      "set_position",
      "move",
      "offset",
      "mirror",
      "add_dimension",
      "add_constraint",
      "create_parameter",
      "bind_formula",
      "add_relation",
    ];

    for (const toolName of requiredTools) {
      const schema = getToolSchema(toolName);
      expect(schema).toBeDefined();
      expect(schema?.name).toBe(toolName);
      expect(schema?.description.length).toBeGreaterThan(10);
      expect(schema?.parameters.type).toBe("object");
      expect(Object.keys(schema?.parameters.properties || {}).length).toBeGreaterThan(0);
    }
  });

  it("should provide valid MCP JSON schema definitions for all tools", () => {
    const allSchemas = getAllToolSchemas();
    expect(allSchemas.length).toBeGreaterThanOrEqual(15);

    for (const tool of allSchemas) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.description).toBe("string");
      expect(tool.parameters).toBeDefined();
      expect(Array.isArray(tool.parameters.required)).toBe(true);

      // Verify that every required parameter exists in properties
      for (const req of tool.parameters.required) {
        expect(tool.parameters.properties[req]).toBeDefined();
      }
    }
  });

  it("should support symbolic parameter strings in tool parameters", () => {
    const registry = new ToolRegistry();

    // 1. Create parameters
    registry.execute({
      id: "call_1",
      tool: "create_parameter",
      args: { name: "span", value: 20000, unit: "mm" },
    });
    registry.execute({
      id: "call_2",
      tool: "create_parameter",
      args: { name: "wall", value: 850, unit: "mm" },
    });

    // 2. Bind formula: outer_w = span + 2 * wall
    registry.execute({
      id: "call_3",
      tool: "bind_formula",
      args: { property: "outer_w", expression: "span + 2 * wall" },
    });

    // 3. Draw rectangle using symbolic expression "outer_w"
    const rectRes = registry.execute({
      id: "call_4",
      tool: "draw_rectangle",
      args: {
        id: "rect_outer",
        x: "0",
        y: "0",
        width: "outer_w",
        height: "span / 10",
      },
    });

    expect(rectRes.success).toBe(true);
    const ctx = registry.getContext();
    const node = ctx.nodes.get("rect_outer");
    expect(node).toBeDefined();
    // outer_w = 20000 + 2 * 850 = 21700 mm
    expect(node?.evaluated.width).toBe(21700);
    // span / 10 = 2000 mm
    expect(node?.evaluated.height).toBe(2000);
  });

  it("should handle geometric transforms: move, offset, mirror", () => {
    const registry = new ToolRegistry();

    // Draw initial line
    registry.execute({
      id: "1",
      tool: "draw_line",
      args: { id: "l1", x1: "100", y1: "200", x2: "300", y2: "200" },
    });

    // Move
    const moveRes = registry.execute({
      id: "2",
      tool: "move",
      args: { entityId: "l1", dx: "50", dy: "100" },
    });
    expect(moveRes.success).toBe(true);
    const moved = registry.getContext().nodes.get("l1");
    expect(moved?.evaluated.x1).toBe(150);
    expect(moved?.evaluated.y1).toBe(300);

    // Mirror across vertical line X=500
    const mirrorRes = registry.execute({
      id: "3",
      tool: "mirror",
      args: {
        entityId: "l1",
        axisP1: { x: "500", y: "0" },
        axisP2: { x: "500", y: "1000" },
      },
    });
    expect(mirrorRes.success).toBe(true);
    const mirrored = registry.getContext().nodes.get("l1_mirrored");
    expect(mirrored).toBeDefined();
    // 500 - (150 - 500) = 850
    expect(mirrored?.evaluated.x1).toBe(850);
  });

  it("should handle set_position on circle, arc, line, rectangle, and polyline", () => {
    const registry = new ToolRegistry();

    // 1. Circle
    registry.execute({
      id: "c1_draw",
      tool: "draw_circle",
      args: { id: "c1", cx: "100", cy: "200", r: "50" },
    });
    registry.execute({
      id: "c1_setpos",
      tool: "set_position",
      args: { entityId: "c1", x: "300", y: "400" },
    });
    const c1 = registry.getContext().nodes.get("c1");
    expect(c1?.evaluated.cx).toBe(300);
    expect(c1?.evaluated.cy).toBe(400);

    // 2. Arc
    registry.execute({
      id: "a1_draw",
      tool: "draw_arc",
      args: { id: "a1", cx: "10", cy: "20", radius: "30", startAngle: "0", endAngle: "90" },
    });
    registry.execute({
      id: "a1_setpos",
      tool: "set_position",
      args: { entityId: "a1", x: "150", y: "250" },
    });
    const a1 = registry.getContext().nodes.get("a1");
    expect(a1?.evaluated.cx).toBe(150);
    expect(a1?.evaluated.cy).toBe(250);

    // 3. Line (should shift x1,y1 and displace x2,y2 rigidly)
    registry.execute({
      id: "l1_draw",
      tool: "draw_line",
      args: { id: "l1", x1: "0", y1: "0", x2: "200", y2: "100" },
    });
    registry.execute({
      id: "l1_setpos",
      tool: "set_position",
      args: { entityId: "l1", x: "500", y: "600" },
    });
    const l1 = registry.getContext().nodes.get("l1");
    expect(l1?.evaluated.x1).toBe(500);
    expect(l1?.evaluated.y1).toBe(600);
    expect(l1?.evaluated.x2).toBe(700);
    expect(l1?.evaluated.y2).toBe(700);

    // 4. Polyline (should shift all points by delta to bounding box min)
    registry.execute({
      id: "poly_draw",
      tool: "draw_polyline",
      args: {
        id: "p1",
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
          { x: 30, y: 50 },
        ],
      },
    });
    registry.execute({
      id: "poly_setpos",
      tool: "set_position",
      args: { entityId: "p1", x: "100", y: "200" },
    });
    const p1 = registry.getContext().nodes.get("p1");
    expect(p1?.points?.[0].x).toBe(100);
    expect(p1?.points?.[0].y).toBe(200);
    expect(p1?.points?.[1].x).toBe(120);
    expect(p1?.points?.[1].y).toBe(200);
  });

  it("should handle perpendicular offset on line segments and radius offset on arcs", () => {
    const registry = new ToolRegistry();

    // Horizontal line: (0, 100) -> (400, 100). Normal is (0, 1)
    registry.execute({
      id: "l_draw",
      tool: "draw_line",
      args: { id: "l_horiz", x1: "0", y1: "100", x2: "400", y2: "100" },
    });
    const offsetLineRes = registry.execute({
      id: "l_off",
      tool: "offset",
      args: { entityId: "l_horiz", distance: "50", side: "outside" },
    });
    expect(offsetLineRes.success).toBe(true);
    const offsetLine = (offsetLineRes.result as any)?.node as SceneGraphNode;
    expect(offsetLine.evaluated.x1).toBe(0);
    expect(offsetLine.evaluated.y1).toBe(150);
    expect(offsetLine.evaluated.x2).toBe(400);
    expect(offsetLine.evaluated.y2).toBe(150);

    // Arc offset
    registry.execute({
      id: "arc_draw",
      tool: "draw_arc",
      args: { id: "arc1", cx: "0", cy: "0", radius: "100", startAngle: "0", endAngle: "180" },
    });
    const offsetArcRes = registry.execute({
      id: "arc_off",
      tool: "offset",
      args: { entityId: "arc1", distance: "25", side: "outside" },
    });
    expect(offsetArcRes.success).toBe(true);
    const offsetArc = (offsetArcRes.result as any)?.node as SceneGraphNode;
    expect(offsetArc.evaluated.radius).toBe(125);
  });

  it("should handle rectangle reflection across vertical and horizontal mirror axes", () => {
    const registry = new ToolRegistry();

    // Rectangle from (100, 200) to (300, 400) [width=200, height=200]
    registry.execute({
      id: "r_draw",
      tool: "draw_rectangle",
      args: { id: "rect1", x: "100", y: "200", width: "200", height: "200" },
    });

    // Mirror across vertical line X = 500
    const mirRes = registry.execute({
      id: "r_mir",
      tool: "mirror",
      args: {
        entityId: "rect1",
        axisP1: { x: "500", y: "0" },
        axisP2: { x: "500", y: "1000" },
      },
    });

    expect(mirRes.success).toBe(true);
    const mirRect = registry.getContext().nodes.get("rect1_mirrored");
    expect(mirRect).toBeDefined();
    // Reflected X: 100 -> 900, 300 -> 700. Bounding box minX = 700, width = 200
    expect(mirRect?.evaluated.x).toBe(700);
    expect(mirRect?.evaluated.y).toBe(200);
    expect(mirRect?.evaluated.width).toBe(200);
    expect(mirRect?.evaluated.height).toBe(200);
  });

  it("should resolve multi-pass formula DAGs declared in reverse topological order", () => {
    const registry = new ToolRegistry();

    // 1. Declare c = b * 2 (depends on b)
    registry.execute({
      id: "f_c",
      tool: "bind_formula",
      args: { property: "c", expression: "b * 2" },
    });

    // 2. Declare b = a + 10 (depends on a)
    registry.execute({
      id: "f_b",
      tool: "bind_formula",
      args: { property: "b", expression: "a + 10" },
    });

    // 3. Declare a = 50 (leaf parameter)
    registry.execute({
      id: "p_a",
      tool: "create_parameter",
      args: { name: "a", value: 50, unit: "mm" },
    });

    // Evaluate
    registry.evaluateAllFormulas();

    const symbols = registry.getSymbolTable();
    expect(symbols.a).toBe(50);
    expect(symbols.b).toBe(60); // 50 + 10
    expect(symbols.c).toBe(120); // 60 * 2
  });
});
