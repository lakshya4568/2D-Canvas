/**
 * The assistant, and the fence around it.
 *
 * Most of these test the FENCE rather than the feature, because that is where
 * the risk is. An LLM that suggests a poor constraint costs the author a click;
 * an LLM that can move geometry costs them a drawing, silently. §56 asks for the
 * guardrail to be structural, so the tests here try to get past it on purpose.
 */

import { describe, it, expect } from "vitest";
import type { Shape } from "../../lib/geometry/types";
import { startAuthoring, namesOf } from "../../lib/upce/document";
import {
  abstractSketch,
  adviseOnSketch,
  resolveSuggestions,
  AdvisorResponseSchema,
  ADVISOR_SYSTEM_PROMPT,
  type AdvisorTransport,
} from "../../lib/ai/constraintAdvisor";
import { vertexStatus, readVertexConfig, hostForLocation } from "../../lib/ai/vertexTransport";

/** An outline with an opening inside it — the shape the advisor is for. */
function hollowUnit(): Shape[] {
  return [
    { id: "OUT", name: "Outline", type: "rectangle", x: 0, y: 0, width: 2100, height: 2100 } as Shape,
    { id: "VOID", name: "Opening", type: "rectangle", x: 350, y: 350, width: 1400, height: 1400 } as Shape,
  ];
}

function sketchOf(shapes: Shape[]) {
  return { sketch: startAuthoring(shapes).sketch, names: namesOf(shapes) };
}

function transportReturning(json: unknown): AdvisorTransport {
  return { generate: async () => JSON.stringify(json) };
}

describe("What the advisor is allowed to see", () => {
  it("sends sizes and nesting, and no coordinates at all", () => {
    const { sketch, names } = sketchOf(hollowUnit());
    const { payload } = abstractSketch(sketch, names, "box culvert");

    expect(payload.entities).toHaveLength(2);
    const serialised = JSON.stringify(payload);

    // The giveaway would be the outline's origin or the opening's offset.
    expect(serialised).not.toMatch(/"x"\s*:/);
    expect(serialised).not.toMatch(/"y"\s*:/);
    expect(serialised).not.toMatch(/coordinate/i);
    expect(serialised).not.toMatch(/points?"\s*:/);

    // Sizes and nesting DO go, because that is what makes the advice possible.
    const outer = payload.entities.find((e) => e.encloses > 0)!;
    const inner = payload.entities.find((e) => e.enclosed)!;
    expect(outer.extent.width).toBeCloseTo(2100, 6);
    expect(inner.extent.width).toBeCloseTo(1400, 6);
  });

  it("tells the model what is already named, so it does not repeat it", () => {
    const { sketch, names } = sketchOf(hollowUnit());
    sketch.parameters.ClearSpan = {
      name: "ClearSpan", role: "DRIVING", type: "LENGTH", unit: "mm", value: 1400,
      boundConstraints: [], published: true,
      provenance: { origin: "user", detail: "t", createdAt: 0 },
    };
    const { payload } = abstractSketch(sketch, names);
    expect(payload.existingParameters.map((p) => p.name)).toContain("ClearSpan");
  });

  it("forbids inventing numbers in the prompt it is given", () => {
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/never receive coordinates/i);
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/Never output a coordinate/i);
    expect(ADVISOR_SYSTEM_PROMPT).toMatch(/The system measures values itself/i);
  });
});

describe("The fence around what comes back", () => {
  it("has nowhere in the schema for a geometric number to travel", () => {
    // The structural guarantee: a suggestion carrying a value is not merely
    // ignored, it fails to parse.
    const withValue = {
      suggestions: [
        {
          id: "s1",
          kind: "equal_length",
          entities: ["e0"],
          confidence: 0.9,
          engineeringRationale: "x",
          nominalValue: 350,
          coordinates: [{ x: 0, y: 0 }],
        },
      ],
    };
    const parsed = AdvisorResponseSchema.parse(withValue);
    const keys = Object.keys(parsed.suggestions[0]);
    expect(keys).not.toContain("nominalValue");
    expect(keys).not.toContain("coordinates");
  });

  it("drops a suggestion that refers to an entity we never sent", () => {
    const { sketch, names } = sketchOf(hollowUnit());
    const { entityIds, measurements } = abstractSketch(sketch, names);

    const { suggestions, rejected } = resolveSuggestions(
      AdvisorResponseSchema.parse({
        suggestions: [
          { id: "good", kind: "parallel", entities: ["e0", "e1"], confidence: 0.8, engineeringRationale: "ok" },
          { id: "bad", kind: "parallel", entities: ["e0", "e99"], confidence: 0.9, engineeringRationale: "nope" },
        ],
      }),
      entityIds,
      measurements
    );

    expect(suggestions.map((s) => s.id)).toEqual(["good"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/never sent/);
  });

  it("takes the value from the drawing, not from the model", () => {
    const { sketch, names } = sketchOf(hollowUnit());
    const { entityIds, measurements } = abstractSketch(sketch, names);
    const firstMeasurement = [...measurements.entries()][0];

    const { suggestions } = resolveSuggestions(
      AdvisorResponseSchema.parse({
        suggestions: [
          {
            id: "name_it",
            kind: "name_measurement",
            entities: ["e0"],
            measurements: [firstMeasurement[0]],
            suggestedName: "ClearSpan",
            confidence: 0.9,
            engineeringRationale: "the waterway opening",
          },
        ],
      }),
      entityIds,
      measurements
    );

    // Whatever the model said, the number is ours.
    expect(suggestions[0].measuredValueMm).toBeCloseTo(firstMeasurement[1].value, 9);
  });

  it("refuses a name that is not a usable identifier", () => {
    expect(() =>
      AdvisorResponseSchema.parse({
        suggestions: [
          {
            id: "s", kind: "name_measurement", entities: ["e0"],
            suggestedName: "2; DROP TABLE", confidence: 0.5, engineeringRationale: "x",
          },
        ],
      })
    ).toThrow();
  });

  it("refuses a kind that is not one of ours", () => {
    expect(() =>
      AdvisorResponseSchema.parse({
        suggestions: [
          { id: "s", kind: "move_everything", entities: ["e0"], confidence: 1, engineeringRationale: "x" },
        ],
      })
    ).toThrow();
  });
});

describe("Failing quietly", () => {
  it("says so, rather than throwing, when no model is configured", async () => {
    const { sketch, names } = sketchOf(hollowUnit());
    const result = await adviseOnSketch(sketch, null, { names });
    expect(result.source).toBe("unavailable");
    expect(result.suggestions).toHaveLength(0);
    expect(result.unavailableReason).toBeTruthy();
  });

  it("survives a model that returns nonsense", async () => {
    const { sketch, names } = sketchOf(hollowUnit());
    const result = await adviseOnSketch(sketch, transportReturning("not json at all"), { names });
    expect(result.source).toBe("unavailable");
    expect(result.unavailableReason).toMatch(/schema/i);
  });

  it("survives a model that times out", async () => {
    const { sketch, names } = sketchOf(hollowUnit());
    const failing: AdvisorTransport = {
      generate: async () => {
        throw new Error("Vertex returned 504: deadline exceeded");
      },
    };
    const result = await adviseOnSketch(sketch, failing, { names });
    expect(result.source).toBe("unavailable");
    expect(result.unavailableReason).toMatch(/504/);
  });

  it("says there is nothing to read on an empty sheet", async () => {
    const { sketch } = sketchOf([]);
    const result = await adviseOnSketch(sketch, transportReturning({ suggestions: [] }));
    expect(result.source).toBe("unavailable");
    expect(result.unavailableReason).toMatch(/nothing on the sheet/i);
  });

  it("returns usable advice when the model behaves", async () => {
    const { sketch, names } = sketchOf(hollowUnit());
    const { measurements } = abstractSketch(sketch, names);
    const mid = [...measurements.keys()][0];

    const result = await adviseOnSketch(
      sketch,
      transportReturning({
        structureType: "Single-cell box culvert",
        suggestions: [
          {
            id: "s1",
            kind: "name_measurement",
            entities: ["e1"],
            measurements: [mid],
            suggestedName: "ClearSpan",
            role: "DRIVING",
            confidence: 0.92,
            engineeringRationale: "The opening is the waterway; its span is what the hydrology fixes.",
          },
        ],
      }),
      { names }
    );

    expect(result.source).toBe("llm");
    expect(result.structureType).toBe("Single-cell box culvert");
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestedName).toBe("ClearSpan");
    expect(result.suggestions[0].affectedLabels.length).toBeGreaterThan(0);
  });
});

describe("Configuration", () => {
  it("reports precisely what is missing rather than just failing", () => {
    const status = vertexStatus(
      readVertexConfig({ })
    );
    expect(status.configured).toBe(false);
    expect(status.mode).toBe("none");
    expect(status.detail).toMatch(/gcloud auth application-default login/);
    expect(status.detail).toMatch(/GEMINI_API_KEY/);
    // And it says the drawing still works, because it does.
    expect(status.detail).toMatch(/deterministic/i);
  });

  it("recognises each of the three ways this gets set up", () => {
    expect(vertexStatus(readVertexConfig({ GEMINI_API_KEY: "k", HOME: "/nonexistent" })).mode).toBe("api-key");
    expect(
      vertexStatus(
        readVertexConfig({ GOOGLE_CLOUD_PROJECT: "p", VERTEX_ACCESS_TOKEN: "t", HOME: "/nonexistent" })
      ).mode
    ).toBe("vertex");
    expect(
      vertexStatus(
        readVertexConfig({
          GOOGLE_CLOUD_PROJECT: "p",
          GOOGLE_APPLICATION_CREDENTIALS: "/tmp/sa.json",
          HOME: "/nonexistent",
        })
      ).mode
    ).toBe("vertex");
  });

  it("sends global to the unprefixed host, and a region to its own", () => {
    // `global-aiplatform.googleapis.com` does not exist; the reply is an HTML
    // 404 that does not look like a Vertex error while you are reading it.
    expect(hostForLocation("global")).toBe("aiplatform.googleapis.com");
    expect(hostForLocation("us-central1")).toBe("us-central1-aiplatform.googleapis.com");
  });

  it("finds the project and the login this machine already has", () => {
    // No Google variables at all: everything comes from gcloud's own files.
    const cfg = readVertexConfig({ HOME: process.env.HOME });
    if (!cfg.credentialsPath) return; // machine is not logged in; nothing to assert
    expect(cfg.project).toBeTruthy();
    expect(vertexStatus(cfg).configured).toBe(true);
  });

  it("takes the model and region from the environment", () => {
    const cfg = readVertexConfig({
      GOOGLE_CLOUD_PROJECT: "p",
      VERTEX_ACCESS_TOKEN: "t",
      VERTEX_MODEL: "gemini-3.8-flash",
      VERTEX_LOCATION: "europe-west4",
      HOME: "/nonexistent",
    });
    expect(cfg.model).toBe("gemini-3.8-flash");
    expect(cfg.location).toBe("europe-west4");
  });
});
