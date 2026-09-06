import { describe, it, expect } from "vitest";
import { computeEntityGrips } from "../../lib/geometry/grips";
import { RectangleShape, LineShape, CircleShape } from "../../lib/geometry/types";
import { generateRDSOBridgeAssembly } from "../../lib/parametric/templates/rdsoBridgeTemplate";
import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";
import { ComponentPortAssemblySolver } from "../../lib/parametric/component/portSolver";
import { UniversalComponentDefinition, ComponentAssemblyNode } from "../../lib/parametric/component/types";

describe("AutoCAD 3-State Grips & Universal Port Assembly", () => {
  it("should generate 4 corner vertex grips, 4 edge midpoint grips, and 1 center grip for a rectangle", () => {
    const rect: RectangleShape = {
      id: "rect_1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 400,
      height: 200,
    };

    const grips = computeEntityGrips(rect);
    expect(grips).toHaveLength(9);

    const vertexGrips = grips.filter((g) => g.type === "vertex");
    const midpointGrips = grips.filter((g) => g.type === "midpoint");
    const centerGrip = grips.find((g) => g.type === "center");

    expect(vertexGrips).toHaveLength(4);
    expect(midpointGrips).toHaveLength(4);
    expect(centerGrip).toBeDefined();

    expect(vertexGrips[0]).toMatchObject({ x: 100, y: 100 });
    expect(vertexGrips[1]).toMatchObject({ x: 500, y: 100 });
    expect(vertexGrips[2]).toMatchObject({ x: 500, y: 300 });
    expect(vertexGrips[3]).toMatchObject({ x: 100, y: 300 });

    expect(midpointGrips[0]).toMatchObject({ x: 300, y: 100 }); // Top edge midpoint
    expect(midpointGrips[1]).toMatchObject({ x: 500, y: 200 }); // Right edge midpoint
    expect(midpointGrips[2]).toMatchObject({ x: 300, y: 300 }); // Bottom edge midpoint
    expect(midpointGrips[3]).toMatchObject({ x: 100, y: 200 }); // Left edge midpoint

    expect(centerGrip).toMatchObject({ x: 300, y: 200 });
  });

  it("should generate 2 endpoint vertex grips and 1 midpoint grip for a line", () => {
    const line: LineShape = {
      id: "line_1",
      type: "line",
      x1: 50,
      y1: 50,
      x2: 250,
      y2: 150,
    };

    const grips = computeEntityGrips(line);
    expect(grips).toHaveLength(3);

    expect(grips[0]).toMatchObject({ type: "vertex", x: 50, y: 50 });
    expect(grips[1]).toMatchObject({ type: "vertex", x: 250, y: 150 });
    expect(grips[2]).toMatchObject({ type: "midpoint", x: 150, y: 100 });
  });

  it("should instantiate the RDSO Standard Multi-Cell Box Bridge matching the civil GAD drawing", () => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === "rdso_box_bridge");
    expect(template).toBeDefined();

    const instance = template!.generator({
      cellCount: 3,
      clearSpan: 2000,
      wallThickness: 350,
      barrelLength: 6850,
    });

    expect(instance.shapes.length).toBeGreaterThanOrEqual(10);

    const clBridge = instance.shapes.find((s) => s.id === "rdso_cl_bridge");
    const clUpTrack = instance.shapes.find((s) => s.id === "rdso_cl_up_track");
    const box1 = instance.shapes.find((s) => s.id === "rdso_box_outer_0") as RectangleShape;
    const box2 = instance.shapes.find((s) => s.id === "rdso_box_outer_1") as RectangleShape;
    const box3 = instance.shapes.find((s) => s.id === "rdso_box_outer_2") as RectangleShape;

    expect(clBridge).toBeDefined();
    expect(clUpTrack).toBeDefined();
    expect(box1).toBeDefined();
    expect(box2).toBeDefined();
    expect(box3).toBeDefined();

    expect(box1.width).toBe(2000 + 2 * 350); // 2700
    expect(box2.width).toBe(2700);
    expect(box3.width).toBe(2700);

    const gap = box2.x - (box1.x + box1.width);
    expect(gap).toBe(10);
  });

  it("should resolve Universal Port component assemblies with O(1) affine transformations", () => {
    const registry = new Map<string, UniversalComponentDefinition>();

    const boxCellDef: UniversalComponentDefinition = {
      id: "box_cell",
      name: "Box Cell Unit",
      category: "culvert",
      parameters: [
        { name: "span", label: "Span", defaultValue: 2000, role: "DRIVING" },
        { name: "height", label: "Height", defaultValue: 1800, role: "DRIVING" },
      ],
      ports: [
        { id: "left_wall", label: "Left Wall", kind: "edge", localOrigin: { x: "0", y: "0" }, localAngleDeg: "0", compatiblePortKinds: ["cell_wall"] },
        { id: "right_wall", label: "Right Wall", kind: "edge", localOrigin: { x: "2000", y: "0" }, localAngleDeg: "0", compatiblePortKinds: ["cell_wall"] },
      ],
      generator: (params, origin = { x: 0, y: 0 }) => {
        const s: RectangleShape = {
          id: "cell_box",
          type: "rectangle",
          x: origin.x,
          y: origin.y,
          width: params.span,
          height: params.height,
        };
        return {
          shapes: [s],
          ports: {
            left_wall: { x: origin.x, y: origin.y, angleDeg: 0 },
            right_wall: { x: origin.x + params.span, y: origin.y, angleDeg: 0 },
          },
        };
      },
    };
    registry.set("box_cell", boxCellDef);

    const nodes: ComponentAssemblyNode[] = [
      {
        instanceId: "cell_1",
        componentDefId: "box_cell",
        parameterOverrides: { span: 2000, height: 1800 },
      },
      {
        instanceId: "cell_2",
        componentDefId: "box_cell",
        parameterOverrides: { span: 2000, height: 1800 },
        attachedVia: {
          parentInstanceId: "cell_1",
          parentPortId: "right_wall",
          ownPortId: "left_wall",
          offsetExpr: { dx: "10", dy: "0" }, // 10mm gap
        },
      },
    ];

    const resolved = ComponentPortAssemblySolver.solveAssembly(registry, nodes, { x: 100, y: 100 });
    expect(resolved.shapes).toHaveLength(2);

    const s1 = resolved.shapes.find((s) => s.id === "cell_1_cell_box") as RectangleShape;
    const s2 = resolved.shapes.find((s) => s.id === "cell_2_cell_box") as RectangleShape;

    expect(s1.x).toBe(100);
    expect(s2.x).toBe(100 + 2000 + 10); // 2110
  });
});
