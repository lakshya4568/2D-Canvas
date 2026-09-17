/**
 * The agent loop against a scripted transport.
 *
 * What is pinned here is the protocol and the honesty of the outcome, not what
 * any particular model would draw:
 *   - the model's turn goes back verbatim, thought signature included;
 *   - a model that stops early is pushed to continue, and a run that never
 *     verifies ends "incomplete", not "finished";
 *   - a model that cannot be reached ends "failed" with Google's reason, and no
 *     drawing is invented in its place;
 *   - a view is sent back to the model as an image.
 */

import { describe, it, expect } from "vitest";
import { runDrafter, DrafterEvent } from "@/lib/agent/drafter/loop";
import { AGENT_MODELS, ChatRequest, ChatResponse, ChatTransport, GeminiPart, ModelCallError } from "@/lib/ai/geminiChat";

const model = AGENT_MODELS[0];

function call(name: string, args: Record<string, unknown>, signature?: string): GeminiPart {
  return { functionCall: { name, args }, ...(signature ? { thoughtSignature: signature } : {}) };
}

class Scripted implements ChatTransport {
  requests: ChatRequest[] = [];
  constructor(private turns: GeminiPart[][]) {}
  async generate(request: ChatRequest): Promise<ChatResponse> {
    // Snapshot: the loop keeps appending to the same array.
    this.requests.push(JSON.parse(JSON.stringify(request)));
    const parts = this.turns.shift() ?? [{ text: "I am done." }];
    return {
      content: { role: "model", parts },
      usage: { promptTokens: 1, outputTokens: 1, thoughtTokens: 0 },
      latencyMs: 1,
      model: request.model,
    };
  }
}

const square: GeminiPart[][] = [
  [
    { text: "**Plan** a 1000 square", thought: true },
    { text: "I will draw the plate outline first." },
    call("draw_rectangle", { name: "Plate", x: 0, y: 0, width: 1000, height: 1000 }, "sig-1"),
  ],
  [call("rule", { kind: "anchor", a: "Plate.bottom_left" }, "sig-2")],
  [
    call("dimension", { name: "Width", what: "length", a: "Plate.bottom" }, "sig-3"),
    call("dimension", { name: "Height", what: "length", a: "Plate.left" }),
  ],
  [call("view", {}, "sig-4")],
  [call("finish", { title: "Plate", summary: "A 1000 mm square plate; Width and Height drive it." }, "sig-5")],
];

describe("drafting agent loop", () => {
  it("round-trips thought signatures and finishes only through finish", async () => {
    const transport = new Scripted(structuredClone(square));
    const events: DrafterEvent[] = [];
    const done = await runDrafter({ prompt: "A 1000 mm square plate", model, transport, onEvent: (e) => events.push(e) });

    expect(done.status).toBe("finished");
    expect(done.manifest?.driving.map((d) => d.name).sort()).toEqual(["Height", "Width"]);
    expect(done.summary).toMatch(/1000 mm square/);

    // Request 2 carries turn 1 exactly as the model sent it.
    const second = transport.requests[1].contents;
    const echoed = second[1];
    expect(echoed.role).toBe("model");
    expect(echoed.parts.find((p) => p.functionCall)?.thoughtSignature).toBe("sig-1");
    expect(echoed.parts.some((p) => p.thought)).toBe(true);
    // ...followed by the tool result in a user turn.
    expect(second[2].role).toBe("user");
    expect(second[2].parts[0].functionResponse?.name).toBe("draw_rectangle");

    // Two calls in one turn produce two responses in one turn, in order.
    const fourth = transport.requests[3].contents;
    const responses = fourth[fourth.length - 1].parts.map((p) => p.functionResponse?.name);
    expect(responses).toEqual(["dimension", "dimension"]);

    // The view went back as an image the model can look at.
    const fifth = transport.requests[4].contents;
    const viewResponse = fifth[fifth.length - 1].parts[0].functionResponse;
    expect(viewResponse?.parts?.[0].inlineData.mimeType).toBe("image/png");

    // The author saw each step as it happened.
    expect(events.filter((e) => e.type === "tool").map((e) => (e as { name: string }).name)).toEqual([
      "draw_rectangle", "rule", "dimension", "dimension", "view", "finish",
    ]);
    expect(events.some((e) => e.type === "snapshot")).toBe(true);
    expect(events.some((e) => e.type === "thinking")).toBe(true);
    expect(events[events.length - 1].type).toBe("done");
  });

  it("pushes a model that stops early, then reports incomplete", async () => {
    const transport = new Scripted([
      [call("draw_rectangle", { name: "Plate", x: 0, y: 0, width: 400, height: 250 }, "s")],
      [{ text: "Done!" }],
      [{ text: "Really done." }],
    ]);
    const done = await runDrafter({ prompt: "plate", model, transport, onEvent: () => {}, maxNudges: 2 });
    expect(done.status).toBe("incomplete");
    expect(done.state.shapes).toHaveLength(1);
    // The nudge carried the verification, so the model was told what was wrong.
    const nudge = transport.requests[2].contents.at(-1)!.parts[0].text ?? "";
    expect(nudge).toMatch(/You stopped without calling finish/);
    expect(nudge).toMatch(/anchors the drawing/);
  });

  it("keeps going after finish is refused", async () => {
    const transport = new Scripted([
      [call("draw_rectangle", { name: "Plate", x: 0, y: 0, width: 400, height: 250 }, "s")],
      [call("finish", { title: "Plate", summary: "early" }, "s")],
      ...structuredClone(square).slice(1).map((turn) =>
        turn.map((p) =>
          p.functionCall?.name === "dimension"
            ? { ...p, functionCall: { ...p.functionCall, args: { ...p.functionCall.args } } }
            : p
        )
      ),
    ]);
    const events: DrafterEvent[] = [];
    const done = await runDrafter({ prompt: "plate", model, transport, onEvent: (e) => events.push(e) });
    const finishes = events.filter((e) => e.type === "result" && e.name === "finish") as { ok: boolean }[];
    expect(finishes.map((f) => f.ok)).toEqual([false, true]);
    expect(done.status).toBe("finished");
  });

  it("fails honestly when the model cannot be reached", async () => {
    const transport: ChatTransport = {
      async generate() {
        throw new ModelCallError("gemini-3.8-flash answered 429 RESOURCE_EXHAUSTED.", 429, false);
      },
    };
    const done = await runDrafter({ prompt: "anything", model, transport, onEvent: () => {} });
    expect(done.status).toBe("failed");
    expect(done.message).toMatch(/429/);
    expect(done.state.shapes).toEqual([]);
  });

  it("continues from a drawing it was handed", async () => {
    const first = await runDrafter({ prompt: "plate", model, transport: new Scripted(structuredClone(square)), onEvent: () => {} });
    const transport = new Scripted([[call("set_value", { name: "Width", value: 1500 }, "s")]]);
    const done = await runDrafter({ prompt: "make it 1500 wide", model, transport, state: first.state, onEvent: () => {}, maxNudges: 0 });
    // The existing drawing was described to the model before it acted.
    expect(transport.requests[0].contents[0].parts[0].text).toMatch(/CURRENT DRAWING/);
    expect(transport.requests[0].contents[0].parts[0].text).toMatch(/Width = 1000/);
    const plate = done.state.shapes.find((s) => s.id === "Plate");
    expect(plate?.type === "rectangle" && plate.width).toBeCloseTo(1500, 6);
  });
});
