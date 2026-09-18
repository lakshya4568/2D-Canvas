/**
 * Engineering facts read from geometry a person drew and tagged.
 *
 * Components report their facts from their values; free geometry reports them
 * from what it measures once it has a role: a line tagged HFL gives the HFL
 * (its height is the level), a tagged opening gives its clear span and
 * headroom, a tagged cushion its depth, and so on. The same audit rules then
 * run on a hand-drawn bridge as on a component one.
 */

import type { LineShape, Point, Shape } from "@/lib/geometry/types";
import type { DrawingSettings } from "@/lib/cad/types";
import { levelAt } from "@/lib/cad/types";
import { polygonBounds, shapeVertices } from "@/lib/cad/geometry";
import { chainGroup } from "@/lib/cad/modify";
import type { EvalFact } from "@/lib/components/evaluate";
import { termFor } from "./glossary";

function outlineOf(members: Shape[]): Point[] | null {
  if (members.length === 1 && members[0].type !== "line") return shapeVertices(members[0]);
  const lines = members.filter((m): m is LineShape => m.type === "line");
  const c = chainGroup(lines);
  return c?.closed ? c.points : null;
}

/** Tagged free shapes, grouped into the objects they form (a polyline is one object). */
function tagged(shapes: Shape[]): { role: string; members: Shape[] }[] {
  const byKey = new Map<string, { role: string; members: Shape[] }>();
  for (const s of shapes) {
    if (!s.semanticRole || s.componentInstanceId) continue;
    const key = `${s.semanticRole}|${s.groupId ?? s.id}`;
    const e = byKey.get(key) ?? { role: s.semanticRole, members: [] };
    e.members.push(s);
    byKey.set(key, e);
  }
  return [...byKey.values()];
}

export function drawnFacts(shapes: Shape[], settings: Pick<DrawingSettings, "datumRL">): EvalFact[] {
  const facts: EvalFact[] = [];
  const push = (key: string, value: number, path: string, semanticType: string) => facts.push({ key, value, path: `drawn:${path}`, semanticType });
  const objs = tagged(shapes);
  const level = (role: string) => {
    const o = objs.find((x) => x.role === role && x.members[0].type === "line");
    if (!o) return undefined;
    const l = o.members[0] as LineShape;
    return levelAt((l.y1 + l.y2) / 2, settings);
  };

  for (const o of objs) {
    const term = termFor(o.role);
    if (!term) continue;
    const id = o.members[0].groupId ?? o.members[0].id;
    if (term.kind === "level" && term.fact && o.members[0].type === "line") {
      const l = o.members[0] as LineShape;
      push(term.fact, levelAt((l.y1 + l.y2) / 2, settings), id, o.role);
    }
    const outline = outlineOf(o.members);
    if (!outline) continue;
    const b = polygonBounds(outline);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    switch (o.role) {
      case "clear_opening":
        push("clear_opening_mm", w, id, o.role);
        push("clear_height_mm", h, id, o.role);
        break;
      case "earth_cushion":
        push("cushion_mm", h, id, o.role);
        break;
      case "deck":
      case "top_slab":
      case "PSC_girder":
        push("soffit_level_m", levelAt(b.maxY, settings), id, o.role);
        break;
      case "concrete_section":
        push("culvert_exempt_clearance", 1, id, o.role);
        break;
      case "open_footing":
        push("foundation_open", 1, id, o.role);
        break;
      case "pile":
        push("foundation_pile", 1, id, o.role);
        if (o.members[0].type === "circle") push("pile_diameter_mm", 2 * o.members[0].r, "piles", o.role);
        break;
      case "well_steining":
        push("foundation_well", 1, id, o.role);
        break;
    }
  }

  // Openings: total waterway, largest opening.
  const openings = facts.filter((f) => f.key === "clear_opening_mm");
  if (openings.length) {
    const total = openings.reduce((s, f) => s + f.value, 0);
    push("linear_waterway_mm", total, "openings", "clear_opening");
    push("max_clear_opening_mm", Math.max(...openings.map((f) => f.value)), "openings", "clear_opening");
    const hfl = level("HFL");
    const bed = level("bed_level");
    const heights = facts.filter((f) => f.key === "clear_height_mm");
    const area = hfl !== undefined && bed !== undefined ? (total / 1000) * Math.max(0, hfl - bed) : openings.reduce((s, f, i) => s + (f.value * (heights[i]?.value ?? 0)) / 1e6, 0);
    push("waterway_area_m2", area, "openings", "clear_opening");
  }

  // Piles: spacing in the drawn group (for IRBM 409).
  const piles = shapes.filter((s) => s.semanticRole === "pile" && s.type === "circle" && !s.componentInstanceId);
  if (piles.length >= 2) {
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < piles.length; i++) {
      let nearest = Infinity;
      for (let j = 0; j < piles.length; j++) {
        if (i === j) continue;
        const a = piles[i];
        const c = piles[j];
        if (a.type !== "circle" || c.type !== "circle") continue;
        nearest = Math.min(nearest, Math.hypot(a.cx - c.cx, a.cy - c.cy));
      }
      min = Math.min(min, nearest);
      max = Math.max(max, nearest);
    }
    const f = facts.find((x) => x.key === "pile_diameter_mm");
    if (f) f.path = "drawn:piles";
    push("pile_min_spacing_mm", min, "piles", "pile");
    push("pile_max_spacing_mm", max, "piles", "pile");
  }

  // Clearances between tagged levels.
  const hfl = level("HFL");
  const formation = level("formation_level");
  const soffitF = facts.find((f) => f.key === "soffit_level_m")?.value ?? level("soffit_level");
  const bed = level("bed_level");
  if (hfl !== undefined && formation !== undefined) push("freeboard_mm", (formation - hfl) * 1000, "levels", "levels");
  if (hfl !== undefined && soffitF !== undefined) push("vertical_clearance_mm", (soffitF - hfl) * 1000, "levels", "levels");
  if (bed !== undefined && soffitF !== undefined) push("headroom_mm", (soffitF - bed) * 1000, "levels", "levels");
  const cushion = facts.find((f) => f.key === "cushion_mm");
  if (!cushion && formation !== undefined) {
    const box = tagged(shapes).find((o) => o.role === "concrete_section");
    const outline = box && outlineOf(box.members);
    if (outline) push("cushion_mm", (formation - levelAt(polygonBounds(outline).minY, settings)) * 1000, "levels", "levels");
  }
  return facts;
}
