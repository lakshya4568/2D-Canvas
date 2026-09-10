/**
 * Shared fixtures for the authoring-workflow tests.
 *
 * These build drawings the way a draftsman would — ordinary shapes with no
 * parametric information attached — and then drive the SAME public authoring
 * API the UI panels call. Nothing here reaches into the kernel's internals, so
 * a test passing here means the workflow a person clicks through works, not
 * merely that a function returns.
 */

import type { Shape } from "../../lib/geometry/types";
import { startAuthoring, regenerate, namesOf, addConstraint } from "../../lib/upce/document";
import { detectCandidates } from "../../lib/upce/detect";
import { suggestCompletion, applyAction, IntentAction } from "../../lib/upce/completion";
import { analyseDof } from "../../lib/upce/dof";
import type { AuthoringSketch } from "../../lib/upce/types";

export interface Session {
  shapes: Shape[];
  names: Record<string, string>;
  sketch: AuthoringSketch;
}

export function begin(shapes: Shape[]): Session {
  const names = namesOf(shapes);
  return { shapes, names, sketch: startAuthoring(shapes).sketch };
}

/** Accepts every admissible detected relationship, as "Accept all" does. */
export function acceptAllDetected(session: Session, rounds = 6): Session {
  let sketch = session.sketch;
  for (let r = 0; r < rounds; r++) {
    const candidates = detectCandidates(sketch, { shapeNames: session.names }).filter(
      (c) => c.admissible
    );
    if (candidates.length === 0) break;
    for (const c of candidates) sketch = addConstraint(sketch, c.constraint, `c_${c.id}`);
    const result = regenerate(session.shapes, sketch, { shapeNames: session.names });
    if (!result.rejection) sketch = result.sketch;
  }
  return { ...session, sketch };
}

/** Picks the first option matching `title` from the assistant and applies it. */
export function choose(session: Session, title: string): Session {
  const report = suggestCompletion(session.sketch, session.names);
  const pool: IntentAction[] = [...report.quickFixes, ...report.groups.flatMap((g) => g.options)];
  const action = pool.find((o) => o.title.includes(title));
  if (!action) {
    throw new Error(
      `no option matching "${title}". Offered: ${pool.map((o) => o.title).join(" | ") || "(none)"}`
    );
  }
  return commit(session, applyAction(session.sketch, action));
}

/** Answers every open question by taking the first option that removes freedom. */
export function answerEverything(session: Session, rounds = 20): Session {
  let current = session;
  for (let r = 0; r < rounds; r++) {
    const report = suggestCompletion(current.sketch, current.names);
    const action = [...report.quickFixes, ...report.groups.flatMap((g) => g.options)].find(
      (o) => o.dofRemoved > 0
    );
    if (!action) break;
    const next = applyAction(current.sketch, action);
    const result = regenerate(current.shapes, next, { shapeNames: current.names });
    if (result.rejection) break;
    current = { ...current, sketch: result.sketch };
  }
  return current;
}

export function commit(session: Session, sketch: AuthoringSketch): Session {
  const result = regenerate(session.shapes, sketch, { shapeNames: session.names });
  if (result.rejection) throw new Error(`edit refused: ${result.rejection}`);
  return { ...session, sketch: result.sketch };
}

export function setParameter(session: Session, name: string, value: number): Session {
  const existing = session.sketch.parameters[name];
  if (!existing) throw new Error(`no parameter named ${name}`);
  return commit(session, {
    ...session.sketch,
    parameters: { ...session.sketch.parameters, [name]: { ...existing, value } },
  });
}

export function dof(session: Session): number {
  return analyseDof(session.sketch, session.names).dof;
}

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

/** Two nested rectangles — the master plan's own R1/R2 reference case (§7). */
export function nestedRectangles(): Shape[] {
  return [
    { id: "R1", name: "Outer", type: "rectangle", x: 0, y: 0, width: 4000, height: 2400 } as Shape,
    { id: "R2", name: "Opening", type: "rectangle", x: 300, y: 300, width: 3400, height: 1800 } as Shape,
  ];
}

/**
 * A haunched cell drawn as eight separate lines inside a frame.
 *
 * Structurally nothing like the nested rectangles: the cell is not a rectangle,
 * is not one shape, and has four 45-degree corners. If the workflow only ever
 * worked on rectangles, this is where it shows.
 */
export function haunchedCellInFrame(): Shape[] {
  const p = {
    tlTop: { x: 165, y: 130 },
    trTop: { x: 345, y: 130 },
    trRight: { x: 380, y: 165 },
    brRight: { x: 380, y: 295 },
    brBottom: { x: 345, y: 330 },
    blBottom: { x: 165, y: 330 },
    blLeft: { x: 130, y: 295 },
    tlLeft: { x: 130, y: 165 },
  };
  const line = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): Shape =>
    ({ id, name: id, type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y }) as Shape;

  return [
    { id: "outer", name: "Outer_Frame", type: "rectangle", x: 100, y: 100, width: 400, height: 260 } as Shape,
    line("roof", p.tlTop, p.trTop),
    line("ch_tr", p.trTop, p.trRight),
    line("wall_r", p.trRight, p.brRight),
    line("ch_br", p.brRight, p.brBottom),
    line("floor", p.brBottom, p.blBottom),
    line("ch_bl", p.blBottom, p.blLeft),
    line("wall_l", p.blLeft, p.tlLeft),
    line("ch_tl", p.tlLeft, p.tlTop),
  ];
}

export const HAUNCHED_CELL_SHAPE_IDS = [
  "roof",
  "ch_tr",
  "wall_r",
  "ch_br",
  "floor",
  "ch_bl",
  "wall_l",
  "ch_tl",
];

/** A railing post — structurally unlike a culvert cell, used to prove generality. */
export function railingPost(): Shape[] {
  return [
    { id: "deck", name: "Deck", type: "line", x1: 0, y1: 1000, x2: 6000, y2: 1000 } as Shape,
    { id: "post", name: "Post", type: "rectangle", x: 200, y: 400, width: 80, height: 600 } as Shape,
  ];
}
