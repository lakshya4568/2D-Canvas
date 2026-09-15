/**
 * The one place the assistant is allowed to do arithmetic, and the fence there.
 *
 * Everywhere else the guarantee is "the model supplies no numbers". A formula
 * cannot honour that — `OverallWidth - 2 * WallThickness` needs its 2 — so the
 * guarantee changes shape: the arithmetic is CHECKED against the drawing rather
 * than trusted. These test the check, mostly by trying to get past it.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { startAuthoring, namesOf } from "../../lib/upce/document";
import { verifyProposedFormula } from "../../lib/upce/formulaCheck";
import { evaluateParameters } from "../../lib/upce/parameters";
import {
  AdvisorResponseSchema, abstractSketch, resolveSuggestions, planSuggestion,
} from "../../lib/ai/constraintAdvisor";
import type { AuthoringSketch, SketchParameter } from "../../lib/upce/types";

function param(p: Partial<SketchParameter> & { name: string; value: number }): SketchParameter {
  return {
    role: "DRIVING", type: "LENGTH", unit: "mm", boundConstraints: [], published: true,
    provenance: { origin: "user", detail: "t", createdAt: 0 }, ...p,
  } as SketchParameter;
}

/** A real single-cell box: 2100 outside, 1400 opening, 350 walls. */
function culvert(): AuthoringSketch {
  const shapes: Shape[] = [
    { id: "R1", name: "R1", type: "rectangle", x: 0, y: 0, width: 2100, height: 2100 } as Shape,
    { id: "R2", name: "R2", type: "rectangle", x: 350, y: 350, width: 1400, height: 1400 } as Shape,
  ];
  const sketch = startAuthoring(shapes).sketch;
  sketch.parameters = {
    OverallWidth: param({ name: "OverallWidth", value: 2100 }),
    WallThickness: param({ name: "WallThickness", value: 350 }),
    ClearSpan: param({ name: "ClearSpan", value: 1400 }),
  };
  return sketch;
}

describe("Checking a formula against the drawing", () => {
  it("accepts one that describes this structure", () => {
    const v = verifyProposedFormula(culvert(), "ClearSpan", "OverallWidth - 2 * WallThickness");
    expect(v.ok).toBe(true);
    expect(v.predicted).toBeCloseTo(1400, 9);
    expect(v.agreement).toBe("matches the drawing exactly");
    expect(v.dependencies.sort()).toEqual(["OverallWidth", "WallThickness"]);
  });

  it("refuses the plausible-but-wrong one, in millimetres", () => {
    // The classic: right shape, forgets a box has two walls.
    const v = verifyProposedFormula(culvert(), "ClearSpan", "OverallWidth - WallThickness");
    expect(v.ok).toBe(false);
    expect(v.errorMm).toBeCloseTo(350, 6);
    expect(v.reason).toMatch(/gives 1750.0 where ClearSpan measures 1400.0/);
    expect(v.reason).toMatch(/out by 350.0 mm/);
  });

  it("refuses a formula that reads something that does not exist", () => {
    const v = verifyProposedFormula(culvert(), "ClearSpan", "OverallWidth - 2 * HaunchLeg");
    expect(v.ok).toBe(false);
    expect(v.reason).toBeTruthy();
  });

  it("refuses a value worked out from itself", () => {
    const v = verifyProposedFormula(culvert(), "ClearSpan", "ClearSpan * 1");
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/itself|[Cc]ircular/);
  });

  it("refuses a cycle through another value", () => {
    const s = culvert();
    s.parameters.OverallWidth = param({
      name: "OverallWidth", value: 2100, role: "DERIVED", expr: "ClearSpan + 2 * WallThickness",
    });
    const v = verifyProposedFormula(s, "ClearSpan", "OverallWidth - 2 * WallThickness");
    expect(v.ok).toBe(false);
  });

  it("refuses a constant dressed up as a relationship", () => {
    const v = verifyProposedFormula(culvert(), "ClearSpan", "1400");
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/constant rather than a relationship/);
  });

  it("leaves the sketch untouched whether it passes or fails", () => {
    const s = culvert();
    const before = JSON.stringify(s.parameters);
    verifyProposedFormula(s, "ClearSpan", "OverallWidth - 2 * WallThickness");
    verifyProposedFormula(s, "ClearSpan", "OverallWidth * 99");
    expect(JSON.stringify(s.parameters)).toBe(before);
  });

  it("scales its tolerance to the size of the thing", () => {
    const s = culvert();
    s.parameters.Span = param({ name: "Span", value: 40000 });
    s.parameters.Half = param({ name: "Half", value: 20000 });
    // A hundredth of a millimetre out on a forty-metre span is agreement.
    s.parameters.Half.value = 20000.005;
    const v = verifyProposedFormula(s, "Half", "Span / 2");
    expect(v.ok).toBe(true);
  });
});

describe("A formula suggestion, end to end", () => {
  const shapes: Shape[] = [
    { id: "R1", name: "R1", type: "rectangle", x: 0, y: 0, width: 2100, height: 2100 } as Shape,
    { id: "R2", name: "R2", type: "rectangle", x: 350, y: 350, width: 1400, height: 1400 } as Shape,
  ];

  function reviewed(raw: unknown, sketch: AuthoringSketch) {
    const names = namesOf(shapes);
    const { entityIds, measurements } = abstractSketch(sketch, names);
    return {
      ...resolveSuggestions(
        AdvisorResponseSchema.parse(raw),
        entityIds,
        measurements,
        new Set(Object.keys(sketch.parameters))
      ),
      entityIds,
    };
  }

  const good = {
    suggestions: [{
      id: "f1", kind: "derive_formula", entities: [],
      parameter: "ClearSpan", expression: "OverallWidth - 2 * WallThickness",
      confidence: 0.92,
      engineeringRationale: "The waterway opening is the overall width less both side walls.",
    }],
  };

  it("plans it as a formula once the arithmetic checks out", () => {
    const sketch = culvert();
    const { suggestions, entityIds } = reviewed(good, sketch);
    expect(suggestions).toHaveLength(1);

    const plan = planSuggestion(suggestions[0], entityIds, [], (t, e) =>
      verifyProposedFormula(sketch, t, e)
    );
    expect(plan.kind).toBe("formula");
    expect(plan.agreement).toBe("matches the drawing exactly");
    expect(plan.summary).toMatch(/ClearSpan follow OverallWidth - 2 \* WallThickness/);
  });

  it("blocks it, with the discrepancy, when the arithmetic is wrong", () => {
    const sketch = culvert();
    const { suggestions, entityIds } = reviewed(
      { suggestions: [{ ...good.suggestions[0], expression: "OverallWidth - WallThickness" }] },
      sketch
    );
    const plan = planSuggestion(suggestions[0], entityIds, [], (t, e) =>
      verifyProposedFormula(sketch, t, e)
    );
    expect(plan.kind).toBe("unavailable");
    expect(plan.blocked).toMatch(/out by 350.0 mm/);
  });

  it("drops a formula naming a parameter that does not exist", () => {
    const sketch = culvert();
    const { suggestions, rejected } = reviewed(
      { suggestions: [{ ...good.suggestions[0], parameter: "Imaginary" }] },
      sketch
    );
    expect(suggestions).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/does not exist/);
  });

  it("refuses an expression with characters a formula has no use for", () => {
    // Anything that is not a name, a number or an operator is out before it
    // reaches the parser.
    for (const expr of ["OverallWidth; DROP", "fetch('http://x')", "a[0]", "`x`"]) {
      expect(() =>
        AdvisorResponseSchema.parse({
          suggestions: [{ ...good.suggestions[0], expression: expr }],
        })
      ).toThrow();
    }
  });

  it("produces the right number once applied", () => {
    const sketch = culvert();
    const applied: AuthoringSketch = {
      ...sketch,
      parameters: {
        ...sketch.parameters,
        ClearSpan: { ...sketch.parameters.ClearSpan, role: "DERIVED", expr: "OverallWidth - 2 * WallThickness" },
      },
    };
    expect(evaluateParameters(applied.parameters).values.ClearSpan).toBeCloseTo(1400, 9);

    // And it now follows: widen the box, the opening follows.
    applied.parameters.OverallWidth = { ...applied.parameters.OverallWidth, value: 2500 };
    expect(evaluateParameters(applied.parameters).values.ClearSpan).toBeCloseTo(1800, 9);
  });
});
