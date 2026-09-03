import { describe, it, expect } from "vitest";
import { BUILTIN_TEMPLATES } from "../../lib/parametric/templates";
import { ParametricModel } from "../../lib/parametric/model";
import { RectangleShape } from "../../lib/geometry/types";

describe("RCC Bridge Parametric Benchmark Template", () => {
  it("should instantiate RCC Bridge template and scale span symmetrically around centerline", () => {
    const template = BUILTIN_TEMPLATES.find((t) => t.id === "rcc_bridge");
    expect(template).toBeDefined();

    const instance = template!.generator({
      span: 600,
      deck_width: 700,
      deck_thickness: 60,
      pier_spacing: 340,
      pier_width: 60,
      wall_thickness: 30,
    });

    expect(instance.shapes).toHaveLength(8);

    const deck = instance.shapes.find((s) => s.id === "bridge_deck_slab") as RectangleShape;
    const pierLeft = instance.shapes.find((s) => s.id === "bridge_pier_left") as RectangleShape;
    const pierRight = instance.shapes.find((s) => s.id === "bridge_pier_right") as RectangleShape;
    const centerline = instance.shapes.find((s) => s.id === "bridge_centerline") as any;

    expect(deck.width).toBe(700);
    expect(deck.x).toBe(500 - 350); // 150
    expect(centerline.x1).toBe(500);

    // Verify piers are placed symmetrically about centerline at X = 500:
    // Left Pier: 500 - 340/2 - 60/2 = 500 - 170 - 30 = 300
    // Right Pier: 500 + 340/2 - 60/2 = 500 + 170 - 30 = 640
    expect(pierLeft.x).toBe(300);
    expect(pierRight.x).toBe(640);

    // Center of left pier: 300 + 30 = 330 (distance to centerline: 500 - 330 = 170)
    // Center of right pier: 640 + 30 = 670 (distance to centerline: 670 - 500 = 170)
    expect(500 - (pierLeft.x + pierLeft.width / 2)).toBe(170);
    expect((pierRight.x + pierRight.width / 2) - 500).toBe(170);

    // Instantiate with expanded deck width to 900 and pier spacing to 440
    const scaledInstance = template!.generator({
      span: 800,
      deck_width: 900,
      deck_thickness: 60,
      pier_spacing: 440,
      pier_width: 60,
      wall_thickness: 30,
    });

    const scaledDeck = scaledInstance.shapes.find((s) => s.id === "bridge_deck_slab") as RectangleShape;
    const scaledPierLeft = scaledInstance.shapes.find((s) => s.id === "bridge_pier_left") as RectangleShape;
    const scaledPierRight = scaledInstance.shapes.find((s) => s.id === "bridge_pier_right") as RectangleShape;

    expect(scaledDeck.width).toBe(900);
    expect(scaledDeck.x).toBe(500 - 450); // 50

    // Pier spacing 440 -> 220 each side
    expect(500 - (scaledPierLeft.x + scaledPierLeft.width / 2)).toBe(220);
    expect((scaledPierRight.x + scaledPierRight.width / 2) - 500).toBe(220);
  });
});
