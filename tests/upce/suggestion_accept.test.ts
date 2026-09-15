/**
 * Accepting what the assistant suggests, and renaming what the drawing already has.
 *
 * The question behind these is "does accepting a model's idea go through the
 * same gates as accepting anybody's?". It must, or the assistant becomes a way
 * around the rules rather than a way to find them.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { startAuthoring, namesOf, regenerate } from "../../lib/upce/document";
import { detectCandidates } from "../../lib/upce/detect";
import { abstractSketch, planSuggestion, AdvisorResponseSchema, resolveSuggestions } from "../../lib/ai/constraintAdvisor";
import { renameParameters, evaluateParameters } from "../../lib/upce/parameters";
import type { AuthoringSketch, SketchParameter } from "../../lib/upce/types";

function hollowUnit(): Shape[] {
  return [
    { id: "ENV", name: "Envelope", type: "rectangle", x: 0, y: 0, width: 2100, height: 2100 } as Shape,
    { id: "OPEN", name: "Opening", type: "rectangle", x: 350, y: 350, width: 1400, height: 1400 } as Shape,
  ];
}

function reviewed(raw: unknown, sketch: AuthoringSketch, names: Record<string, string>) {
  const { entityIds, measurements } = abstractSketch(sketch, names);
  return resolveSuggestions(
    AdvisorResponseSchema.parse(raw),
    entityIds,
    measurements,
    new Set(Object.keys(sketch.parameters))
  );
}

function param(p: Partial<SketchParameter> & { name: string; value: number }): SketchParameter {
  return {
    role: "DRIVING", type: "LENGTH", unit: "mm", boundConstraints: [], published: true,
    provenance: { origin: "user", detail: "t", createdAt: 0 }, ...p,
  } as SketchParameter;
}

describe("Planning what an Accept would do", () => {
  it("applies a name directly, because a name moves nothing", () => {
    const shapes = hollowUnit();
    const sketch = startAuthoring(shapes).sketch;
    const names = namesOf(shapes);
    const { measurements, entityIds } = abstractSketch(sketch, names);
    const mid = [...measurements.keys()][0];

    const { suggestions } = reviewed(
      { suggestions: [{ id: "s", kind: "name_measurement", entities: ["e0"], measurements: [mid],
        suggestedName: "ClearSpan", confidence: 0.9, engineeringRationale: "waterway" }] },
      sketch, names
    );
    const plan = planSuggestion(suggestions[0], entityIds, []);
    expect(plan.kind).toBe("name");
    expect(plan.summary).toMatch(/ClearSpan/);
  });

  it("routes a geometric idea through the detector's own candidates", () => {
    const shapes = hollowUnit();
    const sketch = startAuthoring(shapes).sketch;
    const names = namesOf(shapes);
    const candidates = detectCandidates(sketch, { shapeNames: names });
    const { entityIds } = abstractSketch(sketch, names);

    const { suggestions } = reviewed(
      { suggestions: [{ id: "s", kind: "parallel", entities: ["e0", "e1"],
        confidence: 0.9, engineeringRationale: "uniform wall" }] },
      sketch, names
    );
    const plan = planSuggestion(suggestions[0], entityIds, candidates);

    expect(plan.kind).toBe("candidates");
    expect(plan.candidateIds.length).toBeGreaterThan(0);
    // Every id it chose is a real, admissible candidate of the right kind
    // between exactly those shapes — never a pairing the model invented.
    for (const id of plan.candidateIds) {
      const c = candidates.find((x) => x.id === id)!;
      expect(c.admissible).toBe(true);
      expect(c.constraint.kind).toBe("parallel");
      expect(c.affectedShapeIds.every((s) => ["ENV", "OPEN"].includes(s))).toBe(true);
    }
  });

  it("refuses to invent a pairing the drawing does not show", () => {
    const shapes = hollowUnit();
    const sketch = startAuthoring(shapes).sketch;
    const names = namesOf(shapes);
    const { entityIds } = abstractSketch(sketch, names);

    const { suggestions } = reviewed(
      { suggestions: [{ id: "s", kind: "perpendicular", entities: ["e0", "e1"],
        confidence: 0.9, engineeringRationale: "made up" }] },
      sketch, names
    );
    // Two concentric squares have no perpendicular pair between them.
    const plan = planSuggestion(suggestions[0], entityIds, detectCandidates(sketch, { shapeNames: names }));
    expect(plan.kind).toBe("unavailable");
    expect(plan.blocked).toMatch(/does not currently show/);
  });
});

describe("Renaming what is already there", () => {
  const base = (): AuthoringSketch => {
    const shapes = hollowUnit();
    const sketch = startAuthoring(shapes).sketch;
    sketch.parameters = {
      R1Width: param({ name: "R1Width", value: 1400 }),
      R1Height: param({ name: "R1Height", value: 1400 }),
      Total: param({ name: "Total", value: 0, role: "DERIVED", expr: "R1Width + R1Height" }),
    };
    return sketch;
  };

  it("renames several at once and keeps every formula working", () => {
    const { sketch, applied } = renameParameters(base(), {
      R1Width: "ClearSpan",
      R1Height: "ClearHeight",
    });
    expect(applied).toHaveLength(2);
    expect(sketch.parameters.ClearSpan.value).toBe(1400);
    expect(sketch.parameters.R1Width).toBeUndefined();
    expect(sketch.parameters.Total.expr).toBe("ClearSpan + ClearHeight");
    expect(evaluateParameters(sketch.parameters).values.Total).toBe(2800);
  });

  it("does not cascade when one new name is another old one", () => {
    // {A -> B, B -> C} must not turn A into C by applying both rules in turn.
    const s: AuthoringSketch = base();
    s.parameters = {
      A: param({ name: "A", value: 1 }),
      B: param({ name: "B", value: 2 }),
      Sum: param({ name: "Sum", value: 0, role: "DERIVED", expr: "A + B" }),
    };
    const { sketch } = renameParameters(s, { A: "B", B: "C" });
    const names = Object.keys(sketch.parameters).sort();
    expect(names).toHaveLength(3);
    // A took a name B was vacating, so it was made unique rather than collided.
    expect(sketch.parameters.Sum.expr).not.toBe("B + B");
    expect(evaluateParameters(sketch.parameters).values.Sum).toBe(3);
  });

  it("carries the new name onto the constraint that reads it", () => {
    const shapes = hollowUnit();
    let sketch = startAuthoring(shapes).sketch;
    sketch.parameters = { R1Width: param({ name: "R1Width", value: 1400 }) };
    sketch.constraints = [
      ...sketch.constraints,
      {
        id: "c1", kind: "distance", points: ["OPEN:v0", "OPEN:v1"], segments: [],
        paramRef: "R1Width", strength: "hard", driving: true, state: "active",
        label: "Opening width = R1Width",
        provenance: { origin: "user", detail: "t", createdAt: 0 },
      },
    ];
    const { sketch: next } = renameParameters(sketch, { R1Width: "ClearSpan" });
    const c = next.constraints.find((x) => x.id === "c1")!;
    expect(c.paramRef).toBe("ClearSpan");
    expect(c.label).toBe("Opening width = ClearSpan");

    // And the drawing still solves with the renamed value driving it.
    const r = regenerate(shapes, next, { shapeNames: namesOf(shapes) });
    expect(r.rejection).toBeUndefined();
  });

  it("leaves a rename to the same name alone", () => {
    const { applied } = renameParameters(base(), { R1Width: "R1Width" });
    expect(applied).toHaveLength(0);
  });

  it("ignores a rename of something that does not exist", () => {
    const { applied } = renameParameters(base(), { Nope: "Something" });
    expect(applied).toHaveLength(0);
  });
});
