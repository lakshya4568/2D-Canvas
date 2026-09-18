/**
 * Reading a bridge drawing someone drew by hand.
 *
 * Proposes what each part of free-drawn geometry IS — bed level, HFL, earth
 * cushion, pier, footing, deck, clear opening — with the evidence and a
 * confidence, exactly like the relationship candidates of Author mode (§42,
 * §47): nothing is applied until a person accepts it, and nothing is
 * inferred as a design value (railway guide §3.3: an inference is never a
 * design input).
 *
 * The evidence, strongest first:
 *   1. The drawing says so — a text, leader or level label naming the thing
 *      next to it ("HFL", "BED LEVEL", "EARTH CUSHION").
 *   2. Topology — an outline inside another is an opening in a solid; fill
 *      resting on the top of a box is its cushion; a tall block standing on a
 *      wider one is a pier on its footing.
 *   3. Arrangement — long level lines that run past the structure are levels;
 *      the lowest near the waterway floor is the bed, those above the
 *      structure are formation and rail.
 * Everything is relative to the drawing itself; no size is assumed.
 */

import type { LineShape, Point, Shape } from "@/lib/geometry/types";
import type { Annotation, DrawingSettings } from "@/lib/cad/types";
import { paperToModel } from "@/lib/cad/types";
import { indexShapes, pointInPolygon, polygonBounds, resolveAnchor, shapeVertices, signedArea } from "@/lib/cad/geometry";
import { chainGroup } from "@/lib/cad/modify";
import { regionAt } from "@/lib/cad/region";
import { DEFAULT_TOLERANCE_POLICY } from "@/lib/geometry/tolerance";
import { termFor, termFromText, type BridgeTerm } from "./glossary";

export interface RoleCandidate {
  id: string;
  role: string;
  label: string;
  shapeIds: string[];
  /** 0..1 */
  confidence: number;
  evidence: string[];
}

interface Ring {
  pts: Point[];
  ids: string[];
  box: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
}

function ringsOf(shapes: Shape[]): Ring[] {
  const out: Ring[] = [];
  const mk = (pts: Point[], ids: string[]) => ({ pts, ids, box: polygonBounds(pts), area: Math.abs(signedArea(pts)) });
  for (const s of shapes) {
    if (s.type === "line" || s.type === "arrow" || s.isVisible === false) continue;
    out.push(mk(shapeVertices(s), [s.id]));
  }
  const groups = new Map<string, LineShape[]>();
  for (const s of shapes) if (s.type === "line" && s.groupId) groups.set(s.groupId, [...(groups.get(s.groupId) ?? []), s]);
  for (const members of groups.values()) {
    const c = chainGroup(members);
    if (c?.closed && c.points.length >= 3) out.push(mk(c.points, members.map((m) => m.id)));
  }
  return out;
}

const horizontal = (l: LineShape) => {
  const dx = Math.abs(l.x2 - l.x1);
  const dy = Math.abs(l.y2 - l.y1);
  return dx > 0 && dy / dx < Math.tan(DEFAULT_TOLERANCE_POLICY.angle_rad * 6);
};

function labelTexts(annotations: Annotation[], shapes: Shape[]): { text: string; at: Point; tip?: Point }[] {
  const idx = indexShapes(shapes);
  const out: { text: string; at: Point; tip?: Point }[] = [];
  for (const a of annotations) {
    if (a.componentInstanceId) continue;
    if (a.type === "text") {
      const p = resolveAnchor(a.at, idx);
      if (p) out.push({ text: a.text, at: p });
    } else if (a.type === "leader") {
      const tip = resolveAnchor(a.points[0], idx);
      const last = resolveAnchor(a.points[a.points.length - 1], idx);
      if (tip && last) out.push({ text: a.text, at: last, tip });
    } else if (a.type === "level" && a.label) {
      const p = resolveAnchor(a.at, idx);
      if (p) out.push({ text: a.label, at: p, tip: p });
    }
  }
  return out;
}

export function recognizeBridge(allShapes: Shape[], annotations: Annotation[], settings: DrawingSettings): RoleCandidate[] {
  const shapes = allShapes.filter((s) => !s.componentInstanceId && s.isVisible !== false);
  const untagged = (id: string) => !shapes.find((s) => s.id === id)?.semanticRole;
  const out = new Map<string, RoleCandidate>();
  const add = (term: BridgeTerm | undefined, ids: string[], confidence: number, evidence: string) => {
    if (!term || ids.length === 0 || !ids.every(untagged)) return;
    const key = [...ids].sort().join(",");
    const prev = out.get(key);
    if (prev && prev.role === term.role) {
      prev.confidence = Math.min(0.98, Math.max(prev.confidence, confidence) + 0.05);
      if (!prev.evidence.includes(evidence)) prev.evidence.push(evidence);
      return;
    }
    if (prev && prev.confidence >= confidence) return;
    out.set(key, { id: `${term.role}:${key}`, role: term.role, label: term.label, shapeIds: ids, confidence, evidence: [evidence] });
  };

  const lines = shapes.filter((s): s is LineShape => s.type === "line");
  const rings = ringsOf(shapes);
  const textH = paperToModel(settings.textHeight, settings);

  // 1. The drawing names it.
  for (const lbl of labelTexts(annotations, shapes)) {
    const term = termFromText(lbl.text);
    if (!term) continue;
    const probe = lbl.tip ?? lbl.at;
    if (term.kind === "level" || term.kind === "axis") {
      let best: { l: LineShape; d: number } | undefined;
      for (const l of lines) {
        if (term.kind === "level" && !horizontal(l)) continue;
        const minX = Math.min(l.x1, l.x2) - textH * 6;
        const maxX = Math.max(l.x1, l.x2) + textH * 6;
        if (probe.x < minX || probe.x > maxX) continue;
        const y = (l.y1 + l.y2) / 2;
        const d = Math.abs(probe.y - y);
        if (d <= textH * 4 && (!best || d < best.d)) best = { l, d };
      }
      if (best) add(term, [best.l.id], 0.9, `Labelled "${lbl.text.trim()}" on the drawing, ${Math.round(best.d)} mm from the line`);
    } else {
      const r = regionAt(shapes, probe);
      if (r) add(term, r.shapeIds, 0.88, `Labelled "${lbl.text.trim()}" inside or pointing at it`);
    }
  }

  // 2. Topology of closed outlines.
  const inside = (a: Ring, b: Ring) => a !== b && a.area < b.area && a.pts.every((p) => pointInPolygon(p, b.pts));
  const tol = DEFAULT_TOLERANCE_POLICY.weld_mm * 4;
  for (const r of rings) {
    const parents = rings.filter((o) => inside(r, o));
    const children = rings.filter((o) => inside(o, r));
    if (children.length > 0 && parents.length === 0) {
      add(termFor("concrete_section"), r.ids, 0.6, `Closed outline with ${children.length} outline(s) inside it — a solid with openings`);
      for (const c of children) add(termFor("clear_opening"), c.ids, 0.66, `Closed outline inside ${r.ids.length > 1 ? "a closed polyline" : "another outline"} — an opening through the solid`);
    }
  }
  // Fill resting on top of a box.
  const boxes = rings.filter((r) => rings.some((o) => inside(o, r)));
  for (const b of boxes) {
    const top = b.box.minY; // canvas y down: smallest y is the top
    for (const r of rings) {
      if (r === b || inside(r, b) || inside(b, r)) continue;
      const restsOnTop = Math.abs(r.box.maxY - top) <= tol || r.pts.some((p) => Math.abs(p.y - top) <= tol && p.x >= b.box.minX - tol && p.x <= b.box.maxX + tol);
      const above = r.box.minY < top - tol && (r.box.minX <= b.box.maxX && r.box.maxX >= b.box.minX);
      if (restsOnTop && above) add(termFor("earth_cushion"), r.ids, 0.7, `Region resting on the top of the box, ${Math.round(top - r.box.minY)} mm deep`);
    }
  }
  // Tall blocks standing on wider ones: pier / abutment on footing; wider block on top: cap.
  const blocks = rings.filter((r) => r.pts.length === 4);
  for (const shaft of blocks) {
    const w = shaft.box.maxX - shaft.box.minX;
    const h = shaft.box.maxY - shaft.box.minY;
    if (h < 1.5 * w) continue;
    const footing = blocks.find((f) => f !== shaft && Math.abs(f.box.minY - shaft.box.maxY) <= tol && f.box.maxX - f.box.minX > w * 1.2 && f.box.minX <= shaft.box.minX + tol && f.box.maxX >= shaft.box.maxX - tol);
    if (!footing) continue;
    add(termFor("pier"), shaft.ids, 0.58, `Tall block (${Math.round(h)} × ${Math.round(w)}) standing on a wider block`);
    add(termFor("open_footing"), footing.ids, 0.58, `Wide block carrying a tall block — its footing`);
    const cap = blocks.find((c) => c !== shaft && Math.abs(c.box.maxY - shaft.box.minY) <= tol && c.box.maxX - c.box.minX > w * 1.05);
    if (cap) add(termFor("pier_cap"), cap.ids, 0.55, "Wider block on top of the shaft");
  }
  // Wide slender block on two or more supports: deck.
  for (const d of blocks) {
    const w = d.box.maxX - d.box.minX;
    const h = d.box.maxY - d.box.minY;
    if (w < 5 * h) continue;
    const supports = blocks.filter((s) => s !== d && Math.abs(s.box.minY - d.box.maxY) <= tol * 60 && s.box.maxX > d.box.minX && s.box.minX < d.box.maxX);
    if (supports.length >= 2) add(termFor("deck"), d.ids, 0.55, `Slender block (${Math.round(w)} × ${Math.round(h)}) spanning ${supports.length} supports`);
  }
  // Circles in a block (plan): piles in a pile cap.
  const circles = shapes.filter((s) => s.type === "circle");
  for (const b of blocks) {
    const ins = circles.filter((c) => c.type === "circle" && pointInPolygon({ x: c.cx, y: c.cy }, b.pts));
    if (ins.length >= 2) {
      add(termFor("pile_cap"), b.ids, 0.55, `${ins.length} circles inside it`);
      for (const c of ins) add(termFor("pile"), [c.id], 0.55, "Circle inside a block with other circles — a pile in plan");
    }
  }

  // 3. Long level lines that run past the structure.
  // Judge level lines against the structure, not against fill drawn up to them.
  const fillIds = new Set([...out.values()].filter((c) => termFor(c.role)?.kind === "region").flatMap((c) => c.shapeIds));
  const structural = (boxes.length ? boxes : rings).filter((r) => !r.ids.some((id) => fillIds.has(id)));
  if (structural.length) {
    const minX = Math.min(...structural.map((r) => r.box.minX));
    const maxX = Math.max(...structural.map((r) => r.box.maxX));
    const top = Math.min(...structural.map((r) => r.box.minY));
    const bottom = Math.max(...structural.map((r) => r.box.maxY));
    const long = lines.filter((l) => horizontal(l) && Math.min(l.x1, l.x2) < minX && Math.max(l.x1, l.x2) > maxX && !l.groupId);
    const byY = long.map((l) => ({ l, y: (l.y1 + l.y2) / 2 })).sort((a, b) => a.y - b.y);
    const above = byY.filter((x) => x.y < top - tol);
    const within = byY.filter((x) => x.y >= top - tol && x.y <= bottom + tol);
    if (above.length === 1) add(termFor("formation_level"), [above[0].l.id], 0.45, "Long level line above the structure");
    if (above.length >= 2) {
      add(termFor("rail_level"), [above[0].l.id], 0.42, "Highest long level line above the structure");
      add(termFor("formation_level"), [above[1].l.id], 0.45, "Long level line above the structure, below the rail line");
    }
    const dashed = within.filter((x) => Boolean(x.l.strokeDasharray));
    const solid = within.filter((x) => !x.l.strokeDasharray);
    if (dashed.length) add(termFor("HFL"), [dashed[0].l.id], 0.45, "Broken level line across the waterway — the usual way a flood level is drawn");
    if (dashed.length > 1) add(termFor("LWL"), [dashed[dashed.length - 1].l.id], 0.4, "Lower broken level line across the waterway");
    if (solid.length) add(termFor("bed_level"), [solid[solid.length - 1].l.id], 0.5, "Lowest solid level line through the structure — the waterway floor");
  }

  return [...out.values()].sort((a, b) => b.confidence - a.confidence);
}
