import { describe, it, expect } from "vitest";
import { serializeShapesToJson } from "@/lib/serialization/exportJson";
import { parseAndValidateJson } from "@/lib/serialization/importJson";
import { generateSvgString } from "@/lib/serialization/exportSvg";
import { Shape } from "@/lib/geometry/types";

describe("JSON Serialization & Validation", () => {
  it("serializes shapes and strips internal IDs conforming to the specification schema", () => {
    const shapes: Shape[] = [
      { id: "internal_1", type: "line", x1: 40, y1: 60, x2: 220, y2: 140 },
      { id: "internal_2", type: "rectangle", x: 80, y: 200, width: 150, height: 90 },
      { id: "internal_3", type: "circle", cx: 400, cy: 150, r: 60 },
    ];

    const serialized = serializeShapesToJson(shapes);

    expect(serialized).toEqual({
      shapes: [
        { type: "line", x1: 40, y1: 60, x2: 220, y2: 140 },
        { type: "rectangle", x: 80, y: 200, width: 150, height: 90 },
        { type: "circle", cx: 400, cy: 150, r: 60 },
      ],
    });

    // Ensure IDs are stripped
    expect((serialized.shapes[0] as any).id).toBeUndefined();
  });

  it("validates and parses valid specification JSON document", () => {
    const rawJson = JSON.stringify({
      shapes: [
        { type: "line", x1: 40, y1: 60, x2: 220, y2: 140 },
        { type: "rectangle", x: 80, y: 200, width: 150, height: 90 },
        { type: "circle", cx: 400, cy: 150, r: 60 },
      ],
    });

    const result = parseAndValidateJson(rawJson);
    expect(result.success).toBe(true);
    expect(result.shapes).toHaveLength(3);
    expect(result.shapes![0].id).toBeDefined();
  });

  it("rejects malformed or invalid schemas gracefully with an informative error", () => {
    const malformed = "{ this is not json }";
    const result1 = parseAndValidateJson(malformed);
    expect(result1.success).toBe(false);
    expect(result1.error).toContain("Failed to parse JSON");

    const invalidSchema = JSON.stringify({
      shapes: [{ type: "rectangle", x: 10, y: 10, width: -50, height: 20 }],
    });
    const result2 = parseAndValidateJson(invalidSchema);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("Validation error");
  });
});

describe("SVG Generation & Export", () => {
  it("generates valid standalone SVG markup containing all shapes and dimensions", () => {
    const shapes: Shape[] = [
      { id: "1", type: "line", x1: 10, y1: 10, x2: 100, y2: 10 },
      { id: "2", type: "rectangle", x: 50, y: 50, width: 80, height: 40 },
      { id: "3", type: "circle", cx: 200, cy: 200, r: 30 },
    ];

    const svgXml = generateSvgString(shapes, { backgroundColor: "#121316", showDimensions: true });

    expect(svgXml).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svgXml).toContain('<line x1="10" y1="10" x2="100" y2="10"');
    expect(svgXml).toContain('<rect x="50" y="50" width="80" height="40"');
    expect(svgXml).toContain('<circle cx="200" cy="200" r="30"');
    expect(svgXml).toContain('fill="#121316"');
  });
});
