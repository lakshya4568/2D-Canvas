/**
 * Components and repeats — the generalisation mechanism (§23).
 *
 * §23.4 settles the hardest problem in the system and this file implements that
 * settlement literally: an integer count is a TOPOLOGY MUTATION, not a solver
 * variable. Changing it changes how many primitives and constraints exist, so it
 * is handled procedurally ABOVE the solver: regenerate the flat geometry from
 * the rule, then hand the result to the solver as if the author had drawn it.
 *
 * There is no `CulvertCell`, no `if (isBridge)`, and nothing here knows what the
 * repeated unit represents. The same code path arrays a box-culvert cell, a
 * railing post, and a shape a user drew this morning, because all it does is:
 *
 *     copy the unit's shapes  ->  give the copies index-derived ids
 *     copy the unit's constraints, remapped to those ids
 *     tie copy i to copy 0 with a spacing constraint scaled by i
 *
 * Because ids are a pure function of the instance index, a constraint or a
 * semantic tag attached to instance 2 is still attached to instance 2 after the
 * count changes from 3 to 6.
 */

import { Shape } from "../geometry/types";
import {
  AuthoringSketch,
  ComponentDefinition,
  RepeatRule,
  SketchConstraint,
  Provenance,
} from "./types";

export const REPEAT_ID_SEPARATOR = "#";

/** True for a shape that repeat expansion generated rather than the author drawing it. */
export function isGeneratedShape(shapeId: string): boolean {
  return shapeId.includes(REPEAT_ID_SEPARATOR);
}

/** Deterministic id for the copy of `shapeId` at instance `index`. */
export function instanceShapeId(ruleId: string, index: number, shapeId: string): string {
  return `${ruleId}${REPEAT_ID_SEPARATOR}${index}:${shapeId}`;
}

function prov(detail: string): Provenance {
  return { origin: "component", detail, createdAt: Date.now() };
}

function translateShape(shape: Shape, dx: number, dy: number, id: string, name?: string): Shape {
  const base = { ...shape, id, name: name ?? shape.name };
  switch (shape.type) {
    case "line":
    case "arrow":
      return { ...base, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy } as Shape;
    case "rectangle":
      return { ...base, x: shape.x + dx, y: shape.y + dy } as Shape;
    case "circle":
    case "ellipse":
    case "polygon":
    case "star":
      return { ...base, cx: (shape as { cx: number }).cx + dx, cy: (shape as { cy: number }).cy + dy } as Shape;
    default:
      return base as Shape;
  }
}

export interface ExpansionResult {
  shapes: Shape[];
  /** Extra constraints that only exist because of a repeat rule. */
  constraints: SketchConstraint[];
  /** Human-readable notes for the authoring panel. */
  notes: string[];
}

/**
 * Regenerates every repeat rule's instances from the author's original unit.
 *
 * Previously generated shapes are discarded first, so this is idempotent and a
 * count of 6 followed by a count of 2 leaves exactly two instances behind.
 */
export function expandRepeats(
  authoredShapes: Shape[],
  sketch: AuthoringSketch
): ExpansionResult {
  const base = authoredShapes.filter((s) => !isGeneratedShape(s.id));
  const shapes: Shape[] = [...base];
  const constraints: SketchConstraint[] = [];
  const notes: string[] = [];

  for (const rule of sketch.repeats) {
    const component = sketch.components.find((c) => c.id === rule.componentId);
    if (!component) continue;

    const countParam = sketch.parameters[rule.countParam];
    const spacingParam = sketch.parameters[rule.spacingParam];
    if (!countParam || !spacingParam) {
      notes.push(`Repeat "${component.name}" is missing its count or spacing parameter and was not expanded.`);
      continue;
    }

    const count = Math.max(1, Math.round(countParam.value));
    const pitch = spacingParam.value;
    const len = Math.hypot(rule.direction.x, rule.direction.y) || 1;
    const ux = rule.direction.x / len;
    const uy = rule.direction.y / len;

    const unitShapes = base.filter((s) => component.shapeIds.includes(s.id));
    if (unitShapes.length === 0) {
      notes.push(`Repeat "${component.name}" has no geometry left to copy.`);
      continue;
    }

    const anchorShapeId = component.ports[0]
      ? sketch.points[component.ports[0].pointId]?.owners[0]
      : undefined;
    const anchorPointId = component.ports[0]?.pointId ?? defaultAnchorPoint(sketch, component);
    void anchorShapeId;

    for (let i = 1; i < count; i++) {
      const dx = ux * pitch * i;
      const dy = uy * pitch * i;

      for (const s of unitShapes) {
        shapes.push(
          translateShape(
            s,
            dx,
            dy,
            instanceShapeId(rule.id, i, s.id),
            s.name ? `${s.name} ${i + 1}` : undefined
          )
        );
      }

      // Copy the unit's own design intent onto the copy.
      //
      // Which rules travel is not arbitrary. A rule entirely inside the unit —
      // "this cell is 2000 wide" — is part of what the unit IS, so every copy
      // gets it. A rule that ties the unit to something outside splits in two:
      //
      //   direction and size relations ("stay parallel to the deck", "match
      //   that edge's length") describe how the unit sits in the world and are
      //   just as true of copy 4 as of the original, so they travel;
      //
      //   POSITION relations ("sit 300 mm off the left wall") do not, because
      //   the repeat rule is already what positions copy 4. Copying those would
      //   stack a second, contradictory answer to the same question and the DOF
      //   report would — correctly — call it a conflict.
      const DIRECTIONAL = new Set(["parallel", "perpendicular", "horizontal", "vertical", "angle", "equal_length"]);
      for (const c of sketch.constraints) {
        if (c.kind === "fix") continue; // only the original is pinned
        const refs = [...c.points, ...c.segments];
        if (refs.length === 0) continue;
        const owned = refs.filter((r) => component.shapeIds.includes(r.split(":")[0]));
        if (owned.length === 0) continue;
        const whollyOwned = owned.length === refs.length;
        if (!whollyOwned && !DIRECTIONAL.has(c.kind)) continue;

        const remap = (r: string) =>
          component.shapeIds.includes(r.split(":")[0]) ? remapRef(rule.id, i, r) : r;

        constraints.push({
          ...c,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:${c.id}`,
          points: c.points.map(remap),
          segments: c.segments.map(remap),
          label: `${c.label} (copy ${i + 1})`,
          provenance: prov(
            `Regenerated from "${component.name}" because the repeat count is ${count}. It is the same rule the author accepted on the original unit.`
          ),
        });
      }

      // Spacing. The pitch parameter drives every instance; the multiplier is
      // the instance index, so one number places them all.
      if (anchorPointId) {
        const targetPoint = remapRef(rule.id, i, anchorPointId);
        const common = {
          points: [anchorPointId, targetPoint],
          segments: [] as string[],
          paramRef: rule.spacingParam,
          paramScale: i,
          strength: "hard" as const,
          driving: true,
          state: "active" as const,
          provenance: prov(
            `Places copy ${i + 1} at ${i} x ${rule.spacingParam} from the original along the repeat direction.`
          ),
        };
        constraints.push({
          ...common,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:pitch-x`,
          kind: "distance_x",
          sign: ux < 0 ? -1 : 1,
          paramScale: i * Math.abs(ux),
          label: `Copy ${i + 1} sits ${i} x ${rule.spacingParam} along the array`,
        });
        constraints.push({
          ...common,
          id: `${rule.id}${REPEAT_ID_SEPARATOR}${i}:pitch-y`,
          kind: "distance_y",
          sign: uy < 0 ? -1 : 1,
          paramScale: i * Math.abs(uy),
          label: `Copy ${i + 1} stays on the array line`,
        });
      }
    }

    notes.push(
      `"${component.name}" repeats ${count} time${count === 1 ? "" : "s"} at ${pitch.toFixed(1)} mm pitch (${
        rule.spacingMode === "driven" ? "pitch fixed, extent grows" : "extent fixed, pitch adjusts"
      }).`
    );
  }

  return { shapes, constraints, notes };
}

function remapRef(ruleId: string, index: number, ref: string): string {
  const [shapeId, tail] = splitRef(ref);
  return tail ? `${instanceShapeId(ruleId, index, shapeId)}:${tail}` : instanceShapeId(ruleId, index, shapeId);
}

function splitRef(ref: string): [string, string | null] {
  const i = ref.lastIndexOf(":");
  if (i < 0) return [ref, null];
  return [ref.slice(0, i), ref.slice(i + 1)];
}

function defaultAnchorPoint(sketch: AuthoringSketch, component: ComponentDefinition): string | undefined {
  const candidates = Object.values(sketch.points)
    .filter((p) => p.owners.some((o) => component.shapeIds.includes(o)))
    .map((p) => p.id)
    .sort();
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

/** Groups the author's selection into a reusable unit. */
export function createComponent(
  sketch: AuthoringSketch,
  shapes: Shape[],
  shapeIds: string[],
  name: string
): { sketch: AuthoringSketch; component: ComponentDefinition } {
  const id = `cmp_${Date.now().toString(36)}`;
  const member = shapes.filter((s) => shapeIds.includes(s.id));

  // The unit's local origin is its lowest-and-leftmost vertex, which is stable
  // under later edits and is what a linear array measures pitch from.
  const owned = Object.values(sketch.points).filter((p) => p.owners.some((o) => shapeIds.includes(o)));
  const origin = [...owned].sort((a, b) => a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : 1))[0];

  const component: ComponentDefinition = {
    id,
    name,
    shapeIds: [...shapeIds],
    ports: origin
      ? [{ id: `${id}_p0`, name: "origin", pointId: origin.id }]
      : [],
    createdAt: Date.now(),
    localShapes: member.map((s) => ({ ...s })),
  };

  return { sketch: { ...sketch, components: [...sketch.components, component] }, component };
}

export interface RepeatDraft {
  componentId: string;
  count: number;
  /** Distance between consecutive instances, in mm. */
  pitch: number;
  spacingMode: RepeatRule["spacingMode"];
  direction: { x: number; y: number };
  countParamName?: string;
  spacingParamName?: string;
}

/**
 * Turns a component into a count-driven array.
 *
 * The two parameters this creates are deliberately different in kind and the UI
 * says so: `Count` is an integer that changes how many things exist, `Pitch` is
 * a length the solver can hold. §23.4 — the solver never sees the count.
 */
export function createRepeat(
  sketch: AuthoringSketch,
  draft: RepeatDraft
): { sketch: AuthoringSketch; rule: RepeatRule } {
  const component = sketch.components.find((c) => c.id === draft.componentId);
  const base = component?.name.replace(/[^A-Za-z0-9]/g, "") || "Unit";
  const countName = draft.countParamName ?? `${base}Count`;
  const spacingName = draft.spacingParamName ?? (draft.spacingMode === "driven" ? `${base}Pitch` : `${base}Extent`);

  const parameters = { ...sketch.parameters };
  parameters[countName] = {
    name: countName,
    role: "DRIVING",
    type: "COUNT",
    unit: "count",
    value: Math.max(1, Math.round(draft.count)),
    min: 1,
    step: 1,
    provenance: {
      origin: "user",
      detail:
        "How many copies of the unit exist. This is a topology change: the drawing is rebuilt with a different number of pieces rather than being stretched.",
      createdAt: Date.now(),
    },
    boundConstraints: [],
    published: true,
    uiGroup: "Configuration",
  };

  if (draft.spacingMode === "driven") {
    parameters[spacingName] = {
      name: spacingName,
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: draft.pitch,
      provenance: {
        origin: "user",
        detail: "Distance from one copy to the next. Holding this fixed makes the array grow as the count rises.",
        createdAt: Date.now(),
      },
      boundConstraints: [],
      published: true,
      uiGroup: "Configuration",
    };
  } else {
    const extentName = `${base}Extent`;
    parameters[extentName] = {
      name: extentName,
      role: "DRIVING",
      type: "LENGTH",
      unit: "mm",
      value: draft.pitch * Math.max(1, draft.count - 1),
      provenance: {
        origin: "user",
        detail: "Overall length the array must fill. Holding this fixed makes the copies close up as the count rises.",
        createdAt: Date.now(),
      },
      boundConstraints: [],
      published: true,
      uiGroup: "Configuration",
    };
    parameters[spacingName] = {
      name: spacingName,
      role: "DERIVED",
      type: "LENGTH",
      unit: "mm",
      value: draft.pitch,
      expr: `${extentName} / max(1, ${countName} - 1)`,
      provenance: {
        origin: "user",
        detail: `Pitch is worked out from ${extentName} and ${countName}, because the author chose to hold the overall extent rather than the spacing.`,
        createdAt: Date.now(),
      },
      boundConstraints: [],
      published: false,
      uiGroup: "Configuration",
    };
  }

  const rule: RepeatRule = {
    id: `rep_${Date.now().toString(36)}`,
    componentId: draft.componentId,
    countParam: countName,
    spacingParam: spacingName,
    spacingMode: draft.spacingMode,
    direction: draft.direction,
    weldAdjacent: false,
    provenance: {
      origin: "user",
      detail: `Array of "${component?.name ?? draft.componentId}" along (${draft.direction.x}, ${draft.direction.y}).`,
      createdAt: Date.now(),
    },
  };

  return { sketch: { ...sketch, parameters, repeats: [...sketch.repeats, rule] }, rule };
}
