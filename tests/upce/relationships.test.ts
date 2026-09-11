/**
 * Relationships the drawing shows no evidence for.
 *
 * The detectors and the assistant only ever speak about things they can see —
 * two edges already parallel, a profile sitting inside another. A draftsman
 * routinely wants the opposite: two shapes that share nothing, tied together
 * because the engineering says so. These tests drive that path through the same
 * public API the panel calls.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { regenerate, namesOf, startAuthoring } from "../../lib/upce/document";
import { measurablesIn, nameMeasurement, linkParameter, unlinkParameter } from "../../lib/upce/link";
import { suggestCompletion, applyAction } from "../../lib/upce/completion";
import type { AuthoringSketch } from "../../lib/upce/types";

const MM = 1;

/** Two rectangles with nothing whatsoever between them. */
function twoStrangers(): Shape[] {
  return [
    { id: "R1", name: "Pier", type: "rectangle", x: 0, y: 0, width: 200, height: 500 } as Shape,
    { id: "R2", name: "Abutment", type: "rectangle", x: 900, y: 0, width: 300, height: 500 } as Shape,
  ];
}

/** Same shapes drawn as loose lines, to prove nothing here depends on primitives. */
function twoStrangersAsLines(): Shape[] {
  const box = (p: string, x: number, y: number, w: number, h: number): Shape[] => [
    { id: `${p}_b`, name: `${p} bottom`, type: "line", x1: x, y1: y, x2: x + w, y2: y } as Shape,
    { id: `${p}_r`, name: `${p} right`, type: "line", x1: x + w, y1: y, x2: x + w, y2: y + h } as Shape,
    { id: `${p}_t`, name: `${p} top`, type: "line", x1: x + w, y1: y + h, x2: x, y2: y + h } as Shape,
    { id: `${p}_l`, name: `${p} left`, type: "line", x1: x, y1: y + h, x2: x, y2: y } as Shape,
  ];
  return [...box("P", 0, 0, 200, 500), ...box("A", 900, 0, 300, 500)];
}

function session(shapes: Shape[]) {
  const names = namesOf(shapes);
  let sketch = startAuthoring(shapes).sketch;
  const go = (next: AuthoringSketch, why = "edit") => {
    const r = regenerate(shapes, next, { shapeNames: names });
    if (r.rejection) throw new Error(`${why}: ${r.rejection}`);
    sketch = r.sketch;
    return r;
  };
  go(sketch, "baseline");

  // Level and anchor first, exactly as the assistant's quick fixes do. Without
  // it a rectangle is still free to spin, and an axis span is then a different
  // quantity from the edge it looks like — the kernel is right about that, so
  // the test has to draw the way a draftsman would rather than assume it away.
  for (let round = 0; round < 8; round++) {
    const report = suggestCompletion(sketch, names);
    const next = report.quickFixes.find((q) => q.dofRemoved > 0);
    const level = report.groups
      .flatMap((g) => g.options)
      .find((o) => o.title.includes("horizontal") && o.dofRemoved > 0);
    const pick = next ?? level;
    if (!pick) break;
    go(applyAction(sketch, pick), pick.title);
  }

  return { shapes, names, get sketch() { return sketch; }, go };
}

describe("author-asserted relationships", () => {
  it("offers each shape's own spans and the gap between two of them", () => {
    const s = session(twoStrangers());
    const found = measurablesIn(s.sketch, ["R1", "R2"], s.names);
    const labels = found.map((m) => m.label);

    expect(labels).toContain("Pier width");
    expect(labels).toContain("Pier height");
    expect(labels).toContain("Abutment width");
    // The one the assistant can never propose, because nothing relates them.
    expect(labels.some((l) => l.includes("gap between"))).toBe(true);

    const gap = found.find((m) => m.label.includes("gap between") && m.label.includes("across"))!;
    expect(gap.value).toBeCloseTo(700, MM); // 900 - 200
  });

  it("drives one shape's width from another's, with no constraint between them", () => {
    const s = session(twoStrangers());
    const found = measurablesIn(s.sketch, ["R1", "R2"], s.names);

    let sketch = nameMeasurement(s.sketch, found.find((m) => m.label === "Pier width")!, "PierWidth").sketch;
    sketch = nameMeasurement(sketch, found.find((m) => m.label === "Abutment width")!, "AbutmentWidth").sketch;
    s.go(sketch, "naming");
    expect(s.sketch.parameters.PierWidth.value).toBeCloseTo(200, MM);
    expect(s.sketch.parameters.AbutmentWidth.value).toBeCloseTo(300, MM);

    // The assertion: the abutment is always half again the pier.
    const linked = linkParameter(s.sketch, "AbutmentWidth", "PierWidth * 1.5");
    expect(linked.refused).toBeUndefined();
    s.go(linked.sketch, "linking");
    expect(s.sketch.parameters.AbutmentWidth.role).toBe("DERIVED");

    // Driving the pier moves the abutment, though they share no constraint.
    for (const width of [200, 260, 400]) {
      const next: AuthoringSketch = {
        ...s.sketch,
        parameters: { ...s.sketch.parameters, PierWidth: { ...s.sketch.parameters.PierWidth, value: width } },
      };
      const r = s.go(next, `PierWidth=${width}`);
      const abutment = r.shapes.find((sh) => sh.id === "R2") as any;
      const pier = r.shapes.find((sh) => sh.id === "R1") as any;
      expect(pier.width).toBeCloseTo(width, MM);
      expect(abutment.width).toBeCloseTo(width * 1.5, MM);
    }
  });

  it("works identically when both shapes are drawn as loose lines", () => {
    const s = session(twoStrangersAsLines());
    const found = measurablesIn(s.sketch, s.shapes.map((sh) => sh.id), s.names);

    // Four welded lines read as one profile, so there are two things here, not
    // eight: two widths and two heights, not sixteen span measurements.
    const spans = found.filter((m) => !m.label.includes("gap"));
    const widths = spans.filter((m) => m.label.endsWith("width"));
    expect(widths).toHaveLength(2);

    const [first, second] = widths;

    let sketch = nameMeasurement(s.sketch, first, "SpanA").sketch;
    sketch = nameMeasurement(sketch, second, "SpanB").sketch;
    s.go(sketch, "naming");

    const linked = linkParameter(s.sketch, "SpanB", "SpanA");
    expect(linked.refused).toBeUndefined();
    s.go(linked.sketch, "linking");

    const before = s.sketch.parameters.SpanA.value;
    const next: AuthoringSketch = {
      ...s.sketch,
      parameters: { ...s.sketch.parameters, SpanA: { ...s.sketch.parameters.SpanA, value: before + 120 } },
    };
    s.go(next, "drive");
    expect(s.sketch.parameters.SpanB.value).toBeCloseTo(before + 120, MM);
  });

  it("refuses a circular link before it can be saved", () => {
    const s = session(twoStrangers());
    const found = measurablesIn(s.sketch, ["R1", "R2"], s.names);
    let sketch = nameMeasurement(s.sketch, found.find((m) => m.label === "Pier width")!, "A").sketch;
    sketch = nameMeasurement(sketch, found.find((m) => m.label === "Abutment width")!, "B").sketch;
    s.go(sketch, "naming");

    s.go(linkParameter(s.sketch, "B", "A * 2").sketch, "first link");
    const cycle = linkParameter(s.sketch, "A", "B / 2");
    expect(cycle.refused).toBeTruthy();
    expect(s.sketch.parameters.A.role).toBe("DRIVING");
  });

  it("records a report-only measurement that tracks the drawing and holds nothing", () => {
    const s = session(twoStrangers());
    const found = measurablesIn(s.sketch, ["R1", "R2"], s.names);
    const gap = found.find((m) => m.label.includes("gap between") && m.label.includes("across"))!;

    const before = s.go(s.sketch).dof.dof;
    s.go(nameMeasurement(s.sketch, gap, "ClearGap", "reference").sketch, "measuring");

    // It reports the gap...
    expect(s.sketch.parameters.ClearGap.role).toBe("MEASURED");
    expect(s.sketch.parameters.ClearGap.value).toBeCloseTo(700, MM);
    // ...and holds nothing, so the drawing is exactly as free as it was.
    expect(s.go(s.sketch).dof.dof).toBe(before);

    // And it follows the geometry rather than reporting the day it was created.
    // The pier is the unpinned one, so it is the one free to be dragged.
    const moved = s.shapes.map((sh) => (sh.id === "R1" ? ({ ...sh, x: -200 } as Shape) : sh));
    const r = regenerate(moved, s.sketch, { shapeNames: s.names, source: "geometry" });
    expect(r.rejection).toBeUndefined();
    expect(r.sketch.parameters.ClearGap.value).toBeCloseTo(900, MM);
  });

  it("gives a value back to manual control without disturbing the geometry", () => {
    const s = session(twoStrangers());
    const found = measurablesIn(s.sketch, ["R1", "R2"], s.names);
    let sketch = nameMeasurement(s.sketch, found.find((m) => m.label === "Pier width")!, "PierWidth").sketch;
    sketch = nameMeasurement(sketch, found.find((m) => m.label === "Abutment width")!, "AbutmentWidth").sketch;
    s.go(sketch, "naming");
    s.go(linkParameter(s.sketch, "AbutmentWidth", "PierWidth * 1.5").sketch, "link");

    const widthWhileLinked = (s.go(s.sketch).shapes.find((sh) => sh.id === "R2") as any).width;
    s.go(unlinkParameter(s.sketch, "AbutmentWidth").sketch, "unlink");

    expect(s.sketch.parameters.AbutmentWidth.role).toBe("DRIVING");
    expect(s.sketch.parameters.AbutmentWidth.expr).toBeUndefined();
    const after = (s.go(s.sketch).shapes.find((sh) => sh.id === "R2") as any).width;
    expect(after).toBeCloseTo(widthWhileLinked, MM);
  });
});
