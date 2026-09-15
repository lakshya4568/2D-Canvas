/**
 * Answering questions about the drawing.
 *
 * An answer here changes nothing, so the risk is not corruption — it is a
 * confident sentence about a rule that does not exist, which the draftsman then
 * acts on by hand. The defence is grounding: the model is never asked to work
 * anything out, only to find the answer in a fact sheet the kernel computed.
 * These check the sheet is complete, truthful, and free of coordinates.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { startAuthoring, namesOf, addConstraint } from "../../lib/upce/document";
import { analyseDof } from "../../lib/upce/dof";
import { describeDrawing, askAboutDrawing, QA_SYSTEM_PROMPT, type QaTransport } from "../../lib/ai/drawingQa";
import type { AuthoringSketch, SketchParameter } from "../../lib/upce/types";

function param(p: Partial<SketchParameter> & { name: string; value: number }): SketchParameter {
  return {
    role: "DRIVING", type: "LENGTH", unit: "mm", boundConstraints: [], published: true,
    provenance: { origin: "user", detail: "t", createdAt: 0 }, ...p,
  } as SketchParameter;
}

function culvert(): { sketch: AuthoringSketch; shapes: Shape[]; names: Record<string, string> } {
  const shapes: Shape[] = [
    { id: "R1", name: "Envelope", type: "rectangle", x: 0, y: 0, width: 2100, height: 2100 } as Shape,
    { id: "R2", name: "Opening", type: "rectangle", x: 350, y: 350, width: 1400, height: 1400 } as Shape,
  ];
  let sketch = startAuthoring(shapes).sketch;
  sketch.parameters = {
    OverallWidth: param({ name: "OverallWidth", value: 2100 }),
    WallThickness: param({ name: "WallThickness", value: 350 }),
    ClearSpan: param({
      name: "ClearSpan", value: 1400, role: "DERIVED", expr: "OverallWidth - 2 * WallThickness",
    }),
  };
  sketch = addConstraint(sketch, {
    kind: "distance", points: ["R1:v0", "R1:v1"], segments: [],
    paramRef: "OverallWidth", strength: "hard", driving: true, state: "active",
    label: "Envelope width = OverallWidth",
    provenance: { origin: "user", detail: "t", createdAt: 0 },
  });
  return { sketch, shapes, names: namesOf(shapes) };
}

describe("The fact sheet", () => {
  it("carries no coordinates", () => {
    const { sketch, names } = culvert();
    const facts = describeDrawing(sketch, { names });
    const json = JSON.stringify(facts);

    // Sizes are fine — a size is not a position. A position is not sent.
    expect(json).not.toMatch(/"x"\s*:/);
    expect(json).not.toMatch(/"y"\s*:/);
    expect(json).not.toMatch(/points?"\s*:/);
    expect(json).not.toMatch(/coordinate/i);
  });

  it("states the values, their roles, their formulas and what reads them", () => {
    const { sketch, names } = culvert();
    const facts = describeDrawing(sketch, { names });

    const span = facts.values.find((v) => v.name === "ClearSpan")!;
    expect(span.role).toBe("DERIVED");
    expect(span.formula).toBe("OverallWidth - 2 * WallThickness");
    expect(span.value).toBe(1400);

    const width = facts.values.find((v) => v.name === "OverallWidth")!;
    expect(width.role).toBe("DRIVING");
    // The reverse edge: who depends on it. This is what answers "what happens
    // if I change this?" without the model having to work it out.
    expect(width.readBy).toContain("ClearSpan");
  });

  it("states the rules in the words the panel uses", () => {
    const { sketch, names } = culvert();
    const facts = describeDrawing(sketch, { names });
    const rule = facts.rules.find((r) => r.drivenBy === "OverallWidth")!;
    expect(rule.label).toBe("Envelope width = OverallWidth");
    expect(rule.kind).toBe("distance");
  });

  it("leaves out rules that are switched off", () => {
    const { sketch, names } = culvert();
    const off: AuthoringSketch = {
      ...sketch,
      constraints: sketch.constraints.map((c) => ({ ...c, state: "suppressed" as const })),
    };
    expect(describeDrawing(off, { names }).rules).toHaveLength(0);
  });

  it("states the freedom left, in the same sentences the panel shows", () => {
    const { sketch, names } = culvert();
    const dof = analyseDof(sketch, names);
    const facts = describeDrawing(sketch, { names, dof });

    expect(facts.summary.freedomRemaining).toBe(dof.dof);
    expect(facts.freedom.map((f) => f.description)).toEqual(dof.motions.map((m) => m.description));
    expect(facts.summary.state).toMatch(dof.status === "well" ? /fully defined/ : /under-defined|over-defined/);
  });

  it("states the units and whether they move as one piece", () => {
    const { sketch, names } = culvert();
    const withUnit: AuthoringSketch = {
      ...sketch,
      components: [
        { id: "c1", name: "Cell", shapeIds: ["R1", "R2"], ports: [], createdAt: 0, localShapes: [], rigid: true },
      ],
    };
    const facts = describeDrawing(withUnit, { names });
    expect(facts.units_).toEqual([{ name: "Cell", shapes: 2, movesAsOnePiece: true }]);
  });

  it("states overlaps when solids meet", () => {
    const { sketch, names } = culvert();
    const facts = describeDrawing(sketch, {
      names,
      overlaps: [{ a: "R1", b: "R2", labelA: "Envelope", labelB: "Opening", crossedCorners: 2, depthMm: 19.5 }],
    });
    expect(facts.overlaps).toEqual([{ a: "Envelope", b: "Opening", depthMm: 19.5 }]);
  });
});

describe("What the assistant is told", () => {
  it("is forbidden from inventing a number", () => {
    expect(QA_SYSTEM_PROMPT).toMatch(/NEVER state a number that is not in the fact sheet/);
    expect(QA_SYSTEM_PROMPT).toMatch(/not a typical value for this kind of structure/);
  });

  it("is told not to mention the scaffolding", () => {
    // It leaked once: "the fact sheet does not specify". That is how it was told
    // about the drawing, not something the draftsman has in front of them.
    expect(QA_SYSTEM_PROMPT).toMatch(/Never mention the fact sheet/);
  });

  it("is told that not knowing is a good answer", () => {
    expect(QA_SYSTEM_PROMPT).toMatch(/That is a good answer, not a failure/);
  });

  it("is told it cannot change anything", () => {
    expect(QA_SYSTEM_PROMPT).toMatch(/NEVER tell them you have changed something/);
  });
});

describe("Asking", () => {
  const facts = () => {
    const { sketch, names } = culvert();
    return describeDrawing(sketch, { names, dof: analyseDof(sketch, names) });
  };

  it("reports rather than throws with no model configured", async () => {
    const r = await askAboutDrawing("what is this?", facts(), null);
    expect(r.source).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/No model is configured/);
  });

  it("refuses an empty question", async () => {
    const t: QaTransport = { generate: async () => "should not be called" };
    const r = await askAboutDrawing("   ", facts(), t);
    expect(r.source).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/Ask a question first/);
  });

  it("survives a transport that fails", async () => {
    const t: QaTransport = { generate: async () => { throw new Error("Vertex returned 503"); } };
    const r = await askAboutDrawing("why?", facts(), t);
    expect(r.source).toBe("unavailable");
    expect(r.unavailableReason).toMatch(/503/);
  });

  it("pulls out the values an answer mentions, with the drawing's own figures", async () => {
    const t: QaTransport = {
      generate: async () =>
        "ClearSpan is worked out from OverallWidth less two walls, so you cannot type into it.",
    };
    const r = await askAboutDrawing("why can't I type ClearSpan?", facts(), t);

    expect(r.source).toBe("llm");
    const cited = r.citedValues.map((v) => v.name).sort();
    expect(cited).toEqual(["ClearSpan", "OverallWidth"]);
    // The figures come from the kernel, so a drifting sentence is contradicted
    // on the same screen.
    expect(r.citedValues.find((v) => v.name === "ClearSpan")!.value).toBe(1400);
    expect(r.citedValues.find((v) => v.name === "ClearSpan")!.role).toBe("DERIVED");
    // WallThickness was not named in the answer, so it is not cited.
    expect(cited).not.toContain("WallThickness");
  });

  it("sends the question, the facts and a bounded slice of the conversation", async () => {
    let seen: { payload?: Record<string, unknown> } = {};
    const t: QaTransport = {
      generate: async (req) => {
        seen = req as typeof seen;
        return "ok";
      },
    };
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 ? "answer" : "question") as "answer" | "question",
      text: `turn ${i}`,
    }));
    await askAboutDrawing("and now?", facts(), t, history);

    const payload = seen.payload as { question: string; recentConversation: unknown[]; facts: unknown };
    expect(payload.question).toBe("and now?");
    expect(payload.facts).toBeTruthy();
    // Bounded: an unbounded transcript quietly becomes the largest thing sent,
    // and the FACTS are what the answer should depend on.
    expect(payload.recentConversation).toHaveLength(6);
  });

  it("asks for prose, not a schema-constrained reply", async () => {
    let sawSchema: unknown = "unset";
    const t: QaTransport = {
      generate: async (req) => {
        sawSchema = (req as { schema?: unknown }).schema;
        return "an answer";
      },
    };
    await askAboutDrawing("what?", facts(), t);
    expect(sawSchema).toBeUndefined();
  });
});
