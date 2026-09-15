/**
 * Asking the drawing a question (UPCE-MASTER-1.0 §56).
 *
 * The advisor makes a structured pass and comes back with things to accept. This
 * is the other half a draftsman wants: "why can't I move this?", "what is
 * ClearSpan worked out from?", "what is still free?". Those are questions about
 * the MODEL, not about the geometry, and the model is something the kernel can
 * describe exactly.
 *
 *
 * GROUNDING, WHICH IS THE WHOLE DESIGN
 *
 * An answer here changes nothing — it is prose on a screen, and no accept button
 * turns it into a constraint. So the risk is not corruption, it is CONFIDENT
 * MISINFORMATION: a plausible sentence about a rule that does not exist, which a
 * draftsman then acts on by hand.
 *
 * The defence is that the model is never asked to work anything out. Every fact
 * it could need is computed here, by the same code the panel renders from, and
 * handed over as a sheet:
 *
 *     the named values, their roles, their formulas, what reads them
 *     every rule in force, in the words the panel uses
 *     what is still free, and the movements that remain
 *     the profiles, their sizes, what encloses what
 *     the units, what is held rigid, what repeats
 *     which solids overlap
 *
 * The model's job is to find the answer in that sheet and say it in a sentence.
 * It is told, in the strongest terms the prompt can manage, that a number not in
 * the sheet is not to be written down, and that "the drawing does not say" is a
 * complete and acceptable answer.
 *
 * Two structural supports under the prompt, because a prompt is not a guarantee:
 *
 *   The sheet is the same data the panel shows, so a claim that contradicts it
 *   is contradicted on screen, in front of the reader, immediately.
 *
 *   `citedValues` reports which named values appear in the answer, so the UI can
 *   show them with the figures the kernel holds — the answer's numbers and the
 *   drawing's numbers side by side.
 *
 * Coordinates are absent here exactly as they are from the advisor.
 */

import { AuthoringSketch } from "../upce/types";
import { DofReport } from "../upce/dof";
import { findProfiles, profileLoop } from "../upce/profile";
import { dependentsOf } from "../upce/parameters";
import { OverlapPair } from "../upce/fusion";

export interface DrawingFacts {
  units: "mm";
  summary: {
    entities: number;
    profiles: number;
    namedValues: number;
    rulesInForce: number;
    freedomRemaining: number;
    state: string;
  };
  values: {
    name: string;
    role: string;
    value: number;
    unit: string;
    formula?: string;
    /** Values whose formulas read this one. */
    readBy: string[];
    published: boolean;
  }[];
  rules: { label: string; kind: string; state: string; drivenBy?: string }[];
  freedom: { description: string }[];
  profiles: {
    label: string;
    closed: boolean;
    edges: number;
    widthMm: number;
    heightMm: number;
    enclosed: boolean;
  }[];
  units_: { name: string; shapes: number; movesAsOnePiece: boolean }[];
  repeats: { unit: string; countValue: number; spacingParam: string; mode: string }[];
  overlaps: { a: string; b: string; depthMm: number }[];
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Everything the kernel can say about the model, truthfully.
 *
 * Deliberately built from the same calls the panel uses. If this ever disagreed
 * with what is on screen, the answer would be grounded in a second, invisible
 * version of the drawing — which is worse than not grounding it at all.
 */
export function describeDrawing(
  sketch: AuthoringSketch,
  options: {
    names?: Record<string, string>;
    dof?: DofReport | null;
    overlaps?: OverlapPair[];
    entityCount?: number;
  } = {}
): DrawingFacts {
  const names = options.names ?? {};
  const profiles = findProfiles(sketch, names);

  const values = Object.values(sketch.parameters).map((p) => ({
    name: p.name,
    role: p.role,
    value: round(p.value),
    unit: p.unit,
    formula: p.expr,
    readBy: dependentsOf(p.name, sketch.parameters),
    published: p.published,
  }));

  const rules = sketch.constraints
    .filter((c) => c.state !== "suppressed")
    .map((c) => ({
      label: c.label,
      kind: c.kind,
      state: c.state,
      drivenBy: c.paramRef,
    }));

  return {
    units: "mm",
    summary: {
      entities: options.entityCount ?? 0,
      profiles: profiles.length,
      namedValues: values.length,
      rulesInForce: rules.length,
      freedomRemaining: options.dof?.dof ?? 0,
      state:
        options.dof?.status === "well"
          ? "fully defined — nothing can move on its own"
          : options.dof?.status === "over"
            ? "over-defined — some requirements disagree"
            : `under-defined — ${options.dof?.dof ?? 0} movements remain`,
    },
    values,
    rules,
    freedom: (options.dof?.motions ?? []).map((m) => ({ description: m.description })),
    profiles: profiles.map((p) => {
      const loop = profileLoop(sketch, p);
      const pts = loop ?? p.pointIds.map((id) => sketch.points[id]).filter(Boolean);
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      return {
        label: p.label,
        closed: p.closed,
        edges: p.segmentIds.length,
        widthMm: round(Math.max(...xs) - Math.min(...xs)),
        heightMm: round(Math.max(...ys) - Math.min(...ys)),
        enclosed: false,
      };
    }),
    units_: sketch.components.map((c) => ({
      name: c.name,
      shapes: c.shapeIds.length,
      movesAsOnePiece: Boolean(c.rigid),
    })),
    repeats: sketch.repeats.map((r) => ({
      unit: sketch.components.find((c) => c.id === r.componentId)?.name ?? r.componentId,
      countValue: sketch.parameters[r.countParam]?.value ?? 0,
      spacingParam: r.spacingParam,
      mode: r.spacingMode,
    })),
    overlaps: (options.overlaps ?? []).map((o) => ({
      a: o.labelA,
      b: o.labelB,
      depthMm: round(o.depthMm),
    })),
  };
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

export interface QaTurn {
  role: "question" | "answer";
  text: string;
}

export interface QaResult {
  answer: string;
  /** Named values the answer mentions, so the UI can show what they really are. */
  citedValues: { name: string; value: number; unit: string; role: string }[];
  source: "llm" | "unavailable";
  unavailableReason?: string;
  elapsedMs: number;
}

export const QA_SYSTEM_PROMPT = `You explain a parametric CAD model to the draftsman who drew it.

You are given a FACT SHEET describing their drawing: the named values and their formulas, the
rules in force, what freedom is left, the profiles, the units and repeats, and any overlaps.
You are also given their question.

HOW TO ANSWER
- Answer from the fact sheet and from nothing else.
- Be brief. Two or three sentences is usually the whole answer. Never pad.
- Use the draftsman's vocabulary: "rule", "value", "unit", "held", "free". Not "constraint
  graph", "DOF vector", "solver".
- Never mention the fact sheet. It is how you were told about the drawing, not something the
  draftsman has. Say "the drawing does not say", never "the fact sheet does not specify".
- Quote the exact names and numbers from the fact sheet when they answer the question.
- Plain prose. No markdown headings, no bullet lists unless the answer really is a list of
  three or more things, no code fences.

WHAT YOU MUST NOT DO
- NEVER state a number that is not in the fact sheet. Not an estimate, not a calculation you
  performed, not a typical value for this kind of structure. If a number is not there, the
  answer is that the drawing does not say.
- NEVER describe a rule, value or relationship that is not in the fact sheet, even if it
  would be normal for this kind of drawing. The draftsman is asking about THIS drawing.
- NEVER tell them you have changed something. You cannot. If they want a change, say which
  control does it: the Author panel's Values, Relationships, or Units and repeats sections.
- If the fact sheet does not answer the question, say so plainly in one sentence and say what
  would. That is a good answer, not a failure.`;

export interface QaTransport {
  generate(request: { systemPrompt: string; payload: unknown; schema?: unknown }): Promise<string>;
}

/** Named values the answer actually mentions, matched whole-word. */
function citedIn(answer: string, facts: DrawingFacts): QaResult["citedValues"] {
  return facts.values
    .filter((v) => new RegExp(`\\b${v.name}\\b`).test(answer))
    .map((v) => ({ name: v.name, value: v.value, unit: v.unit, role: v.role }));
}

/**
 * Answers one question about the drawing.
 *
 * `history` carries a few previous turns so a follow-up like "why?" means
 * something. It is bounded because an unbounded transcript quietly becomes the
 * largest thing in the request, and the FACTS are what the answer should depend
 * on — not on what was said three questions ago.
 */
export async function askAboutDrawing(
  question: string,
  facts: DrawingFacts,
  transport: QaTransport | null,
  history: QaTurn[] = []
): Promise<QaResult> {
  const started = Date.now();
  const empty: QaResult = { answer: "", citedValues: [], source: "unavailable", elapsedMs: 0 };

  if (!transport) {
    return { ...empty, unavailableReason: "No model is configured." };
  }
  if (!question.trim()) {
    return { ...empty, unavailableReason: "Ask a question first." };
  }

  const payload = {
    facts,
    recentConversation: history.slice(-6),
    question: question.trim(),
  };

  let raw: string;
  try {
    raw = await transport.generate({ systemPrompt: QA_SYSTEM_PROMPT, payload });
  } catch (err) {
    return {
      ...empty,
      unavailableReason: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
    };
  }

  const answer = raw.trim();
  if (!answer) {
    return {
      ...empty,
      unavailableReason: "The model returned nothing.",
      elapsedMs: Date.now() - started,
    };
  }

  return {
    answer,
    citedValues: citedIn(answer, facts),
    source: "llm",
    elapsedMs: Date.now() - started,
  };
}
