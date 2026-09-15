/**
 * The constraint advisor — an agent that reads a drawing and suggests intent.
 *
 * The existing namer answers "what should this parameter be CALLED". This
 * answers the harder question in front of it: "what should be held at all". A
 * draftsman looking at a box culvert section knows instantly that the three
 * clearances measuring 350 are one wall thickness repeated, that the two
 * haunches are meant to match, and that the opening is meant to stay centred.
 * The geometric detectors find some of that; the rest is engineering convention,
 * which is knowledge about the world rather than about the drawing.
 *
 *
 * ZERO GEOMETRIC AUTHORITY — AND HOW IT IS ENFORCED
 *
 * §56 requires the guardrail to be structural rather than a promise, and the
 * naming layer does that by making `NamingPatch` carry nothing but a name. The
 * same discipline is harder here, because a constraint has a TARGET VALUE and a
 * value is a number, and a number from a model is exactly what must never reach
 * the geometry.
 *
 * The resolution is that the model never supplies one. `ConstraintSuggestion`
 * has no numeric field at all beyond a confidence. It may only say:
 *
 *     these two entities, which you told me about, are related in this way,
 *     and here is what I would call it and why
 *
 * The VALUE is then measured off the drawing by the kernel, exactly as it is for
 * a suggestion the author makes by hand. So the worst a confused or adversarial
 * model can do is propose a relationship that is already true of the geometry —
 * which is proposed at its current measurement, changes nothing on acceptance,
 * and is reviewed by a human first. It cannot move a millimetre of anything.
 *
 * Three further gates sit behind that, in order:
 *
 *     schema        Google constrains decoding; we validate again, because a
 *                   schema the model is asked to honour is not the same thing
 *                   as a schema the parser has checked.
 *     reference     every entity id must be one WE sent. A hallucinated id is
 *                   dropped rather than resolved to something nearby.
 *     admissibility the SVD row-space test every candidate goes through. A
 *                   suggestion already implied by the rules in force is not
 *                   shown, whoever proposed it.
 *
 * And the whole path is optional. With no model configured the deterministic
 * reader runs alone and every test passes (§57).
 */

import { z } from "zod";
import { AuthoringSketch } from "../upce/types";
import { findProfiles, profileLoop, Profile } from "../upce/profile";
import { measurablesIn, Measurable } from "../upce/link";

// ---------------------------------------------------------------------------
// What we send. No coordinates, ever.
// ---------------------------------------------------------------------------

export interface AbstractedEntity {
  /** A handle we mint, and the only thing the model may refer back to. */
  id: string;
  kind: "closed-profile" | "open-profile" | "line";
  edgeCount: number;
  /** Overall size along each axis, in mm. A size is not a position. */
  extent: { width: number; height: number };
  /** True when this profile sits inside another one. */
  enclosed: boolean;
  /** How many profiles this one encloses. */
  encloses: number;
}

export interface AbstractedMeasurement {
  id: string;
  /** What it measures, in the kernel's own vocabulary. */
  kind: string;
  label: string;
  valueMm: number;
  entity: string;
}

export interface AdvisorPayload {
  units: "mm";
  /** What the author says they are drawing, if they said. Free text, optional. */
  drawingHint?: string;
  entities: AbstractedEntity[];
  measurements: AbstractedMeasurement[];
  /** Values already named, so the model does not propose them again. */
  existingParameters: { name: string; role: string; valueMm: number }[];
}

// ---------------------------------------------------------------------------
// What we accept back. Note the absence of any geometric number.
// ---------------------------------------------------------------------------

export const SUGGESTION_KINDS = [
  "equal_length",
  "parallel",
  "perpendicular",
  "horizontal",
  "vertical",
  "symmetric",
  "name_measurement",
  /**
   * Give a value that already exists a better name.
   *
   * The deterministic namer produces `R1Width` and `L2Height` — correct, unique,
   * and meaningless to anyone reading the drawing. A name is the whole interface
   * a project engineer sees once the template is published, so "ClearSpan" and
   * "R1Width" are not stylistic variants of each other; one of them can be
   * handed over and the other cannot.
   */
  "rename_parameter",
  /**
   * One value worked out from others.
   *
   * The only kind that carries arithmetic from the model, and therefore the only
   * one whose guarantee is different: the expression is CHECKED against the
   * drawing rather than trusted. See `lib/upce/formulaCheck.ts` — a formula that
   * does not reproduce what the target already measures is refused with the
   * discrepancy in millimetres, so a literal the model invented can only survive
   * if the geometry agrees with it.
   */
  "derive_formula",
] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const ConstraintSuggestionSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(SUGGESTION_KINDS),
  /** Ids from the payload. Empty only for a rename, which names no geometry. */
  entities: z.array(z.string().min(1)).max(4),
  /** Measurement ids from the payload, for `name_measurement`. */
  measurements: z.array(z.string().min(1)).max(4).optional(),
  /** An existing parameter's name, for `rename_parameter` and `derive_formula`. */
  parameter: z.string().max(64).optional(),
  /**
   * An arithmetic expression over existing parameter names, for
   * `derive_formula`. Bounded in length and character set so a reviewer can read
   * it at a glance and nothing exotic reaches the parser.
   */
  expression: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_+\-*/(). ]+$/)
    .optional(),
  suggestedName: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/)
    .optional(),
  role: z.enum(["DRIVING", "DERIVED", "FIXED"]).optional(),
  confidence: z.number().min(0).max(1),
  engineeringRationale: z.string().min(1).max(400),
});

export const AdvisorResponseSchema = z.object({
  structureType: z.string().max(80).optional(),
  suggestions: z.array(ConstraintSuggestionSchema).max(24),
});

export type ConstraintSuggestion = z.infer<typeof ConstraintSuggestionSchema>;
export type AdvisorResponse = z.infer<typeof AdvisorResponseSchema>;

/** A suggestion that survived every gate, with the value measured by us. */
export interface ReviewedSuggestion extends ConstraintSuggestion {
  /** Measured off the drawing, never supplied by the model. */
  measuredValueMm?: number;
  /** Plain-language target for the review card. */
  affectedLabels: string[];
}

export interface AdvisorResult {
  structureType?: string;
  suggestions: ReviewedSuggestion[];
  source: "llm" | "unavailable";
  /** Present when the model was not reached. Never an error to the user. */
  unavailableReason?: string;
  elapsedMs: number;
  /** Suggestions dropped by a gate, and which gate. For the log, not the panel. */
  rejected: { id: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Abstraction
// ---------------------------------------------------------------------------

function extentOf(loop: { x: number; y: number }[]): { width: number; height: number } {
  const xs = loop.map((p) => p.x);
  const ys = loop.map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function inLoop(loop: { x: number; y: number }[], p: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Turns the sketch into something safe to send.
 *
 * The `entityIds` map is the reference gate's evidence: only ids in it can be
 * resolved back to geometry afterwards, so a model that invents `loop_99` gets
 * its suggestion dropped rather than silently matched to something.
 */
export function abstractSketch(
  sketch: AuthoringSketch,
  names: Record<string, string> = {},
  drawingHint?: string
): { payload: AdvisorPayload; entityIds: Map<string, Profile>; measurements: Map<string, Measurable> } {
  const profiles = findProfiles(sketch, names);
  const loops = new Map<string, { x: number; y: number }[]>();
  for (const p of profiles) {
    const loop = profileLoop(sketch, p);
    if (loop) loops.set(p.id, loop);
  }

  const entityIds = new Map<string, Profile>();
  const entities: AbstractedEntity[] = [];

  profiles.forEach((p, i) => {
    const handle = `e${i}`;
    entityIds.set(handle, p);
    const loop = loops.get(p.id);

    let enclosed = false;
    let encloses = 0;
    if (loop) {
      for (const [otherId, otherLoop] of loops) {
        if (otherId === p.id) continue;
        if (inLoop(otherLoop, loop[0])) enclosed = true;
        if (inLoop(loop, otherLoop[0])) encloses++;
      }
    }

    const pts = p.pointIds.map((id) => sketch.points[id]).filter(Boolean);
    const extent = loop
      ? extentOf(loop)
      : extentOf(pts.map((q) => ({ x: q.x, y: q.y })));

    entities.push({
      id: handle,
      kind: p.closed ? "closed-profile" : p.segmentIds.length === 1 ? "line" : "open-profile",
      edgeCount: p.segmentIds.length,
      extent: { width: round(extent.width), height: round(extent.height) },
      enclosed,
      encloses,
    });
  });

  const measurements = new Map<string, Measurable>();
  const abstractedMeasurements: AbstractedMeasurement[] = [];
  profiles.forEach((p, i) => {
    const handle = `e${i}`;
    for (const m of measurablesIn(sketch, p.shapeIds, names)) {
      const mid = `m${abstractedMeasurements.length}`;
      measurements.set(mid, m);
      abstractedMeasurements.push({
        id: mid,
        kind: m.kind,
        label: m.label,
        valueMm: round(m.value),
        entity: handle,
      });
    }
  });

  return {
    payload: {
      units: "mm",
      drawingHint,
      entities,
      measurements: abstractedMeasurements,
      existingParameters: Object.values(sketch.parameters).map((p) => ({
        name: p.name,
        role: p.role,
        valueMm: round(p.value),
      })),
    },
    entityIds,
    measurements,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// The reference gate
// ---------------------------------------------------------------------------

/**
 * Drops anything that refers to something we did not send.
 *
 * A model that invents an id is not corrected or matched to the nearest real
 * one — guessing what it meant is how a suggestion ends up attached to the wrong
 * wall. It is dropped, and the drop is recorded.
 */
export function resolveSuggestions(
  response: AdvisorResponse,
  entityIds: Map<string, Profile>,
  measurements: Map<string, Measurable>,
  knownParameters: Set<string> = new Set()
): { suggestions: ReviewedSuggestion[]; rejected: { id: string; reason: string }[] } {
  const suggestions: ReviewedSuggestion[] = [];
  const rejected: { id: string; reason: string }[] = [];

  for (const s of response.suggestions) {
    if (s.kind === "rename_parameter") {
      // The reference gate for a rename is the parameter list we sent.
      if (!s.parameter || !knownParameters.has(s.parameter)) {
        rejected.push({ id: s.id, reason: `renames ${s.parameter ?? "nothing"}, which does not exist` });
        continue;
      }
      if (!s.suggestedName) {
        rejected.push({ id: s.id, reason: "asks for a rename without giving a name" });
        continue;
      }
      if (s.suggestedName === s.parameter) continue; // nothing to do
      suggestions.push({ ...s, affectedLabels: [s.parameter] });
      continue;
    }

    if (s.kind === "derive_formula") {
      if (!s.parameter || !knownParameters.has(s.parameter)) {
        rejected.push({ id: s.id, reason: `derives ${s.parameter ?? "nothing"}, which does not exist` });
        continue;
      }
      if (!s.expression) {
        rejected.push({ id: s.id, reason: "proposes a formula without giving one" });
        continue;
      }
      suggestions.push({ ...s, affectedLabels: [s.parameter] });
      continue;
    }

    if (s.entities.length === 0) {
      rejected.push({ id: s.id, reason: "names no geometry" });
      continue;
    }
    const unknownEntity = s.entities.find((e) => !entityIds.has(e));
    if (unknownEntity) {
      rejected.push({ id: s.id, reason: `refers to ${unknownEntity}, which was never sent` });
      continue;
    }
    const unknownMeasure = (s.measurements ?? []).find((m) => !measurements.has(m));
    if (unknownMeasure) {
      rejected.push({ id: s.id, reason: `refers to ${unknownMeasure}, which was never sent` });
      continue;
    }
    if (s.kind === "name_measurement" && (s.measurements ?? []).length === 0) {
      rejected.push({ id: s.id, reason: "asks to name a measurement without naming one" });
      continue;
    }

    // The value comes from OUR measurement, not from the model.
    const measured = (s.measurements ?? [])
      .map((m) => measurements.get(m)?.value)
      .find((v): v is number => v !== undefined);

    suggestions.push({
      ...s,
      measuredValueMm: measured,
      affectedLabels: [
        ...s.entities.map((e) => entityIds.get(e)!.label),
        ...(s.measurements ?? []).map((m) => measurements.get(m)!.label),
      ],
    });
  }

  return { suggestions, rejected };
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

export const ADVISOR_SYSTEM_PROMPT = `You are a chartered structural draftsman reviewing a 2D general arrangement drawing
(box culverts, bridges, retaining walls, ROBs) for a parametric CAD system. You work to
IRC / IRS / AASHTO / Eurocode convention.

You receive ABSTRACTED measurements only — sizes, counts, nesting, and what is already
named. You never receive coordinates, and you never produce them.

YOUR JOB — three kinds of answer, and the third is the most valuable

A. NAME the measurements worth naming ("name_measurement"), and replace generated
   placeholder names with engineering ones ("rename_parameter").

B. SAY WHICH GEOMETRIC RELATIONSHIPS the drawing is meant to hold ("parallel",
   "symmetric", "equal_length" and so on). Design intent the geometry cannot prove:
     - several clearances at the same value are usually ONE thickness repeated
     - an opening inside an envelope is usually meant to stay centred
     - matching corner cuts are usually one haunch dimension

C. RELATE THE NAMED VALUES TO EACH OTHER with arithmetic ("derive_formula").
   Look hard at "existingParameters" every time. Whenever one of those values is a
   CONSEQUENCE of the others rather than an independent choice, say so. This is the
   single most useful thing you can do, because it is what turns a drawing with three
   numbers a user must keep consistent by hand into one where they type two and the
   third follows.
   Worked example — a single-cell box culvert with OverallWidth 2100, WallThickness 350
   and ClearSpan 1400: the clear span is not an independent input, it is what is left of
   the overall width after BOTH side walls, so
       parameter: "ClearSpan", expression: "OverallWidth - 2 * WallThickness"
   Others that recur: overall height = clear height + top slab + bottom slab; a total run
   = count * pitch; a centreline = an overall size / 2.
   COUNT CAREFULLY. A box has two side walls and two slabs. An expression that is out by
   one wall is rejected by the checker, and you will have wasted the suggestion.

RULES
1. Refer ONLY to entity ids and measurement ids given in the payload. Never invent an id.
2. Never output a coordinate, a length, a thickness, or any other geometric number.
   The system measures values itself. You say WHAT relates to WHAT, and why.
3. Suggest names in standard civil nomenclature: ClearSpan, ClearHeight, WallThickness,
   SlabThickness, HaunchLeg, BottomSlabThickness, CushionDepth. Match ^[A-Za-z][A-Za-z0-9_]{0,39}$.
4. Do not propose a measurement that is already in existingParameters — but DO rename any
   existing parameter whose name is a placeholder rather than an engineering term.
   "R1Width", "L2Height", "Profile_A_width" and the like are generated defaults; replace them
   with what the dimension IS on this structure. Use kind "rename_parameter", put the current
   name in the "parameter" field, the new one in "suggestedName", and leave "entities" empty.
   A name that is already meaningful is left alone.
5. A "derive_formula" expression uses only existing parameter names, numbers and + - * / ( ).
   It is EVALUATED AGAINST THE DRAWING before the author ever sees it: if it does not
   reproduce the value that parameter already measures, it is thrown away. So check your
   arithmetic against the numbers in existingParameters before you send it.
6. One sentence of engineering rationale each, in a draftsman's words — say what it means
   for the structure, not what it means for the software.
7. Confidence must be honest. Below 0.5 for anything you are inferring from a single
   coincidence. A drawing you cannot read is a short list, not a long guess.
8. Return ONLY JSON matching the schema.`;

/** Response schema in the shape Google's structured output expects. */
export const ADVISOR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    structureType: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: [...SUGGESTION_KINDS] },
          entities: { type: "array", items: { type: "string" } },
          measurements: { type: "array", items: { type: "string" } },
          parameter: { type: "string" },
          expression: { type: "string" },
          suggestedName: { type: "string" },
          role: { type: "string", enum: ["DRIVING", "DERIVED", "FIXED"] },
          confidence: { type: "number" },
          engineeringRationale: { type: "string" },
        },
        required: ["id", "kind", "entities", "confidence", "engineeringRationale"],
      },
    },
  },
  required: ["suggestions"],
} as const;

// ---------------------------------------------------------------------------
// The agent
// ---------------------------------------------------------------------------

export interface AdvisorTransport {
  generate(request: { systemPrompt: string; payload: unknown; schema: unknown }): Promise<string>;
}

/**
 * Reads a drawing and comes back with reviewable suggestions.
 *
 * Every failure is quiet and reported as `unavailable`, never thrown: an
 * assistant that breaks the panel when a network call times out is worse than no
 * assistant. The reason is kept so the status line can say what happened.
 */
export async function adviseOnSketch(
  sketch: AuthoringSketch,
  transport: AdvisorTransport | null,
  options: { names?: Record<string, string>; drawingHint?: string } = {}
): Promise<AdvisorResult> {
  const started = Date.now();
  const { payload, entityIds, measurements } = abstractSketch(
    sketch,
    options.names,
    options.drawingHint
  );

  if (!transport) {
    return {
      suggestions: [],
      source: "unavailable",
      unavailableReason: "No model is configured.",
      elapsedMs: Date.now() - started,
      rejected: [],
    };
  }
  if (payload.entities.length === 0) {
    return {
      suggestions: [],
      source: "unavailable",
      unavailableReason: "There is nothing on the sheet to read yet.",
      elapsedMs: Date.now() - started,
      rejected: [],
    };
  }

  let raw: string;
  try {
    raw = await transport.generate({
      systemPrompt: ADVISOR_SYSTEM_PROMPT,
      payload,
      schema: ADVISOR_RESPONSE_SCHEMA,
    });
  } catch (err) {
    return {
      suggestions: [],
      source: "unavailable",
      unavailableReason: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
      rejected: [],
    };
  }

  let parsed: AdvisorResponse;
  try {
    parsed = AdvisorResponseSchema.parse(JSON.parse(raw));
  } catch (err) {
    return {
      suggestions: [],
      source: "unavailable",
      unavailableReason: `The model's reply did not match the schema: ${
        err instanceof Error ? err.message.slice(0, 200) : String(err)
      }`,
      elapsedMs: Date.now() - started,
      rejected: [],
    };
  }

  const { suggestions, rejected } = resolveSuggestions(
    parsed,
    entityIds,
    measurements,
    new Set(Object.keys(sketch.parameters))
  );
  return {
    structureType: parsed.structureType,
    suggestions,
    source: "llm",
    elapsedMs: Date.now() - started,
    rejected,
  };
}

// ---------------------------------------------------------------------------
// Accepting one
// ---------------------------------------------------------------------------

/**
 * What accepting a suggestion would actually do, worked out before it is done.
 *
 * Three different mechanisms are behind the one Accept button, and which one
 * applies depends on what the suggestion is:
 *
 *   A NAME is applied directly. The model chose the word; the kernel supplies
 *   the number by measuring, so there is nothing to verify geometrically.
 *
 *   A RENAME is applied directly, for the same reason — it changes a label, not
 *   a millimetre.
 *
 *   A GEOMETRIC RELATIONSHIP is NOT applied directly, and this is the important
 *   one. The model names two profiles; a constraint needs two SEGMENTS, and
 *   picking which edge of an eight-edge cell it meant would be guessing at the
 *   exact point where guessing is least acceptable. So it is matched against
 *   what the detectors independently found between those same profiles, and
 *   accepting the card accepts those candidates — rows the admissibility gate
 *   has already passed. If the detectors found nothing, the honest answer is
 *   that the drawing does not show it, and the card says so instead of
 *   inventing a pairing.
 */
export interface SuggestionPlan {
  kind: "name" | "rename" | "formula" | "candidates" | "unavailable";
  /** Candidate ids to accept, for the geometric kinds. */
  candidateIds: string[];
  /** One sentence describing the outcome, for the button's tooltip. */
  summary: string;
  /** Set when nothing can be done, and why. */
  blocked?: string;
  /** For a formula: how well it agrees with the drawing as drawn. */
  agreement?: string;
}

export interface CandidateLike {
  id: string;
  constraint: { kind: string };
  affectedShapeIds: string[];
  admissible: boolean;
}

/** Maps the advisor's vocabulary onto the constraint kinds the kernel has. */
const KIND_MAP: Record<string, string[]> = {
  equal_length: ["equal_length"],
  parallel: ["parallel"],
  perpendicular: ["perpendicular"],
  horizontal: ["horizontal"],
  vertical: ["vertical"],
  symmetric: ["symmetric"],
};

export function planSuggestion(
  suggestion: ReviewedSuggestion,
  entityIds: Map<string, Profile>,
  candidates: CandidateLike[],
  /**
   * Checks the model's arithmetic against the drawing.
   *
   * Injected rather than imported so this stays a pure planner and the check —
   * which re-solves the sketch — is the caller's decision to pay for.
   */
  checkFormula?: (target: string, expr: string) => { ok: boolean; reason?: string; agreement?: string }
): SuggestionPlan {
  if (suggestion.kind === "derive_formula") {
    if (!suggestion.parameter || !suggestion.expression) {
      return { kind: "unavailable", candidateIds: [], summary: "", blocked: "Incomplete formula." };
    }
    if (!checkFormula) {
      return { kind: "unavailable", candidateIds: [], summary: "", blocked: "Not checked yet." };
    }
    const verdict = checkFormula(suggestion.parameter, suggestion.expression);
    if (!verdict.ok) {
      return { kind: "unavailable", candidateIds: [], summary: "", blocked: verdict.reason };
    }
    return {
      kind: "formula",
      candidateIds: [],
      summary: `Make ${suggestion.parameter} follow ${suggestion.expression}.`,
      agreement: verdict.agreement,
    };
  }

  if (suggestion.kind === "rename_parameter") {
    return {
      kind: "rename",
      candidateIds: [],
      summary: `Rename ${suggestion.parameter} to ${suggestion.suggestedName}.`,
    };
  }

  if (suggestion.kind === "name_measurement") {
    if (!suggestion.suggestedName) {
      return { kind: "unavailable", candidateIds: [], summary: "", blocked: "No name was given." };
    }
    return {
      kind: "name",
      candidateIds: [],
      summary: `Name this measurement ${suggestion.suggestedName}${
        suggestion.measuredValueMm !== undefined
          ? ` at ${suggestion.measuredValueMm.toFixed(1)} mm`
          : ""
      }.`,
    };
  }

  const wanted = KIND_MAP[suggestion.kind];
  if (!wanted) {
    return { kind: "unavailable", candidateIds: [], summary: "", blocked: "Nothing to apply." };
  }

  // Which shapes the suggestion is about.
  const shapeIds = new Set(
    suggestion.entities.flatMap((e) => entityIds.get(e)?.shapeIds ?? [])
  );

  const matched = candidates.filter(
    (c) =>
      c.admissible &&
      wanted.includes(c.constraint.kind) &&
      c.affectedShapeIds.length > 0 &&
      c.affectedShapeIds.every((id) => shapeIds.has(id))
  );

  if (matched.length === 0) {
    return {
      kind: "unavailable",
      candidateIds: [],
      summary: "",
      blocked:
        "The drawing does not currently show this, so there is no measured relationship to accept. Assert it yourself under Relationships if you mean it.",
    };
  }

  return {
    kind: "candidates",
    candidateIds: matched.map((c) => c.id),
    summary: `Accept ${matched.length} matching relationship${matched.length === 1 ? "" : "s"} the drawing already shows.`,
  };
}
