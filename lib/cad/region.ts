/**
 * BOUNDARY / BPOLY: the closed region around a point, for hatching.
 */

import type { LineShape, Point, Shape } from "@/lib/geometry/types";
import { pointInPolygon, shapeVertices, signedArea, traceRing } from "./geometry";
import { chainGroup } from "./modify";

/**
 * The innermost closed region around a point, from single closed shapes and
 * from grouped/connected lines, with every smaller closed region inside it cut
 * out as a hole. This is BOUNDARY/BPOLY in miniature.
 */
export function regionAt(shapes: Shape[], p: Point): { outer: Point[]; holes: Point[][]; shapeIds: string[]; holeIds: string[][] } | null {
  const rings: { pts: Point[]; ids: string[] }[] = [];
  for (const s of shapes) {
    if (s.isVisible === false || s.type === "line" || s.type === "arrow") continue;
    rings.push({ pts: shapeVertices(s), ids: [s.id] });
  }
  const groups = new Map<string, LineShape[]>();
  for (const s of shapes) if (s.type === "line" && s.groupId) groups.set(s.groupId, [...(groups.get(s.groupId) ?? []), s]);
  for (const [, members] of groups) {
    const c = chainGroup(members);
    if (c?.closed) rings.push({ pts: c.points, ids: members.map((m) => m.id) });
  }
  const containing = rings.filter((r) => r.pts.length >= 3 && pointInPolygon(p, r.pts)).sort((a, b) => Math.abs(signedArea(a.pts)) - Math.abs(signedArea(b.pts)));
  const outer = containing[0];
  if (!outer) {
    // Loose lines: try every line set that closes around the point (small drawings only).
    const loose = shapes.filter((s): s is LineShape => s.type === "line" && !s.groupId);
    if (loose.length > 0 && loose.length <= 60) {
      const ring = traceRing(loose);
      if (ring && pointInPolygon(p, ring)) return { outer: ring, holes: [], shapeIds: loose.map((l) => l.id), holeIds: [] };
    }
    return null;
  }
  const oa = Math.abs(signedArea(outer.pts));
  const holes = rings.filter((r) => r !== outer && Math.abs(signedArea(r.pts)) < oa && r.pts.every((q) => pointInPolygon(q, outer.pts)) && !pointInPolygon(p, r.pts));
  return { outer: outer.pts, holes: holes.map((h) => h.pts), shapeIds: outer.ids, holeIds: holes.map((h) => h.ids) };
}

