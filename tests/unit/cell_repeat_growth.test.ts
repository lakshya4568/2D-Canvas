import { describe, it, expect } from "vitest";
import { DraftingWorkspace } from "@/lib/agent/drafter/workspace";

describe("Cell Unit, Repeat Array & Outer Shell Enclosure Growth", () => {
  it("creates a cell, keeps it as a unit, and grows the outer shell as cells are added", () => {
    const ws = new DraftingWorkspace();

    // 1. Draw outer frame (initially 4800 x 3800 for 1 cell)
    ws.drawRectangle("Outer", 0, 0, 4800, 3800);

    // 2. Draw 1 opening (cell) of 4000 x 3000 at (400, 400)
    ws.drawRectangle("Opening", 400, 400, 4000, 3000);

    // 3. Anchor outer frame to origin
    ws.addRule("anchor", "Outer.bottom_left");

    // 4. Dimension the cell span, height, and wall thickness
    ws.dimension({
      name: "ClearSpan",
      what: "horizontal",
      a: "Opening.bottom_left",
      b: "Opening.bottom_right",
      value: 4000,
      resize: false,
      reference: true,
    });
    ws.dimension({
      name: "ClearHeight",
      what: "vertical",
      a: "Opening.bottom_left",
      b: "Opening.top_left",
      value: 3000,
      resize: false,
      reference: true,
    });
    ws.dimension({
      name: "WallThickness",
      what: "horizontal",
      a: "Outer.bottom_left",
      b: "Opening.bottom_left",
      value: 400,
      resize: false,
      reference: true,
    });

    // 5. Group the Opening as a cell unit
    const unitId = ws.makeUnit("Cell", ["Opening"], true);
    expect(unitId).toBeDefined();
    expect(ws.sketch.components).toHaveLength(1);
    expect(ws.sketch.components[0].name).toBe("Cell");

    // 6. Add parametric repeat rule for the Cell
    ws.repeat({
      unit: "Cell",
      count: 1,
      direction: "right",
      mode: "gap",
      spacing: 400,
      countName: "CellCount",
      spacingName: "IntermediateWall",
    });

    expect(ws.sketch.repeats).toHaveLength(1);
    expect(ws.sketch.parameters["CellCount"]).toBeDefined();
    expect(ws.sketch.parameters["CellCount"].value).toBe(1);
    expect(ws.sketch.parameters["IntermediateWall"]).toBeDefined();
    expect(ws.sketch.parameters["IntermediateWall"].value).toBe(400);

    // 7. Define formula so Outer shell width grows to fit the cells
    // OverallWidth = (CellCount - 1) * IntermediateWall + CellCount * ClearSpan + 2 * WallThickness
    const formulaResult = ws.formula(
      "OverallWidth",
      "(CellCount - 1) * IntermediateWall + CellCount * ClearSpan + 2 * WallThickness",
      "Outer frame width grows to fit all cells"
    );
    expect(formulaResult).toContain("OverallWidth");
    expect(ws.sketch.parameters["OverallWidth"].role).toBe("DERIVED");
    expect(ws.sketch.parameters["OverallWidth"].value).toBe(4800);

    // 8. Increase CellCount to 2: outer shell width grows to 9200 mm
    const msg2 = ws.setValue("CellCount", 2);
    expect(msg2).toContain("OverallWidth = 9200");
    expect(ws.sketch.parameters["OverallWidth"].value).toBe(9200);

    // Increase CellCount to 3: outer shell width grows to 13600 mm
    const msg3 = ws.setValue("CellCount", 3);
    expect(msg3).toContain("OverallWidth = 13600");
    expect(ws.sketch.parameters["OverallWidth"].value).toBe(13600);

    // Increase CellCount to 4: outer shell width grows to 18000 mm
    const msg4 = ws.setValue("CellCount", 4);
    expect(msg4).toContain("OverallWidth = 18000");
    expect(ws.sketch.parameters["OverallWidth"].value).toBe(18000);

    // Verify all generated cell openings exist on displayShapes()
    const displayedCells = ws.displayShapes().filter((s) => s.id === "Opening" || s.id.includes("#"));
    expect(displayedCells.length).toBe(4);
  });
});
