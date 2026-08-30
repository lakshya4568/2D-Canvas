import { describe, it, expect } from "vitest";
import { serializeShapesToJson } from "@/lib/serialization/exportJson";
import { parseAndValidateJson } from "@/lib/serialization/importJson";
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
    expect(result.shapes![0].id).toBeDefined(); // Assigned new unique ID
  });

  it("rejects malformed or invalid schemas gracefully with an informative error", () => {
    // Malformed JSON
    const malformed = "{ this is not json }";
    const result1 = parseAndValidateJson(malformed);
    expect(result1.success).toBe(false);
    expect(result1.error).toContain("Failed to parse JSON");

    // Invalid schema (negative width)
    const invalidSchema = JSON.stringify({
      shapes: [{ type: "rectangle", x: 10, y: 10, width: -50, height: 20 }],
    });
    const result2 = parseAndValidateJson(invalidSchema);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("Validation error");
  });
});
