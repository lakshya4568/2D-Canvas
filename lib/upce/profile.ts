/**
 * Profiles — connected chains of edges, and the unit the workflow reasons about.
 *
 * A draftsman who draws a culvert cell as a roof, a floor, two walls and four
 * haunches has drawn ONE THING. The drawing model, however, holds eight
 * independent line shapes, and every question the authoring layer asks — "what
 * holds this in place?", "what controls its size?", "how far is it from the
 * frame?" — is nonsense if asked eight times over.
 *
 * That was a real failure: measuring the clearance from an outer frame to each
 * of eight separate lines produced eight unrelated gaps and named them
 * SideThickness, SideThickness2, EndThickness, EndThickness2 with values like
 * 98 and 186 that mean nothing to anybody.
 *
 * So the authoring layer groups edges into profiles first. A profile is a
 * connected component of the segment graph — segments that share welded
 * vertices. A rectangle is one profile; eight welded lines are one profile; two
 * unrelated shapes are two. Nothing here knows what the profile represents,
 * which is the point: the same grouping serves a culvert cell, a railing post
 * and an arbitrary sketch a user drew this morning.
 */

import { AuthoringSketch } from "./types";

export interface Profile {
  /** Deterministic: the lexicographically smallest shape id in the group. */
  id: string;
  shapeIds: string[];
  segmentIds: string[];
  pointIds: string[];
  /** Every vertex has at least two edges — the chain closes on itself. */
  closed: boolean;
  /** What to call it in a sentence. */
  label: string;
}

/**
 * Groups the sketch's segments into connected profiles.
 *
 * `names` supplies display names for single-shape profiles; a component whose
 * shapes exactly cover a group lends the group its name, which is why making a
 * component out of a cell immediately improves every sentence the UI produces.
 */
export function findProfiles(
  sketch: AuthoringSketch,
  names: Record<string, string> = {}
): Profile[] {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
    // Path compression keeps this linear on long chains.
    let cur = a;
    while (cur !== r) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, r);
      cur = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra > rb ? ra : rb, ra > rb ? rb : ra);
  };

  const segments = Object.values(sketch.segments)
    .filter((s) => !sketch.circles[`${s.shapeId}:c`] && !s.construction)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const seg of segments) {
    parent.set(seg.p1, find(seg.p1));
    parent.set(seg.p2, find(seg.p2));
    union(seg.p1, seg.p2);
  }

  const groups = new Map<string, { segs: string[]; points: Set<string>; shapes: Set<string> }>();
  for (const seg of segments) {
    const root = find(seg.p1);
    const g = groups.get(root) ?? { segs: [], points: new Set<string>(), shapes: new Set<string>() };
    g.segs.push(seg.id);
    g.points.add(seg.p1);
    g.points.add(seg.p2);
    g.shapes.add(seg.shapeId);
    groups.set(root, g);
  }

  const profiles: Profile[] = [];
  const groupList = [...groups.values()].sort((m, n) => {
    const a = [...m.shapes].sort()[0];
    const b = [...n.shapes].sort()[0];
    return a < b ? -1 : 1;
  });
  let letterIndex = 0;
  for (const g of groupList) {
    const degree = new Map<string, number>();
    for (const segId of g.segs) {
      const seg = sketch.segments[segId];
      degree.set(seg.p1, (degree.get(seg.p1) ?? 0) + 1);
      degree.set(seg.p2, (degree.get(seg.p2) ?? 0) + 1);
    }
    const closed = g.segs.length >= 3 && [...degree.values()].every((d) => d >= 2);
    const shapeIds = [...g.shapes].sort();

    const label = labelFor(sketch, shapeIds, names, () => nextLetter(letterIndex++));
    profiles.push({
      id: shapeIds[0],
      shapeIds,
      segmentIds: [...g.segs].sort(),
      pointIds: [...g.points].sort(),
      closed,
      label,
    });
  }

  return profiles.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * What to call a profile.
 *
 * A multi-edge profile has no name of its own until the author gives it one, so
 * the fallback has to be something that reads well in a sentence AND survives
 * being turned into an identifier: parameter names are built from this, and
 * "the 8-edge profile at ch_bl" becomes `the8edgeprofileatch_blWidth`, which is
 * worse than useless. A plain letter is honest, short, and the author replaces
 * it the moment they make the profile a named unit.
 */
function labelFor(
  sketch: AuthoringSketch,
  shapeIds: string[],
  names: Record<string, string>,
  nextFallback: () => string
): string {
  // A component that covers exactly this group has already been named by the
  // author, and their name beats anything derived from the parts.
  const component = sketch.components.find(
    (c) => c.shapeIds.length === shapeIds.length && shapeIds.every((id) => c.shapeIds.includes(id))
  );
  if (component) return component.name;

  if (shapeIds.length === 1) return names[shapeIds[0]] ?? shapeIds[0];

  return nextFallback();
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function nextLetter(index: number): string {
  const letter = LETTERS[index % LETTERS.length];
  const round = Math.floor(index / LETTERS.length);
  return `Profile ${letter}${round > 0 ? round + 1 : ""}`;
}

/**
 * Walks a closed profile's vertices in order.
 *
 * Needed because containment and signed area are only meaningful on an ordered
 * loop, and a profile assembled from eight separately drawn lines has no
 * inherent ordering — `edgeIndex` only orders the edges within one shape.
 * Returns null for anything that does not close.
 */
export function profileLoop(
  sketch: AuthoringSketch,
  profile: Profile
): { x: number; y: number }[] | null {
  if (!profile.closed) return null;

  const adjacency = new Map<string, { segId: string; other: string }[]>();
  for (const segId of profile.segmentIds) {
    const seg = sketch.segments[segId];
    (adjacency.get(seg.p1) ?? adjacency.set(seg.p1, []).get(seg.p1)!).push({ segId, other: seg.p2 });
    (adjacency.get(seg.p2) ?? adjacency.set(seg.p2, []).get(seg.p2)!).push({ segId, other: seg.p1 });
  }

  const start = profile.pointIds[0];
  const loop: { x: number; y: number }[] = [];
  const usedSegments = new Set<string>();
  let current = start;

  for (let guard = 0; guard <= profile.segmentIds.length; guard++) {
    const p = sketch.points[current];
    if (!p) return null;
    loop.push({ x: p.x, y: p.y });

    const next = (adjacency.get(current) ?? []).find((e) => !usedSegments.has(e.segId));
    if (!next) break;
    usedSegments.add(next.segId);
    current = next.other;
    if (current === start) break;
  }

  // A profile with a branch or a spur will not consume every edge in one walk.
  return usedSegments.size === profile.segmentIds.length && loop.length >= 3 ? loop : null;
}

export function pointInLoop(loop: { x: number; y: number }[], p: { x: number; y: number }): boolean {
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

/** The profile a shape belongs to, if any. */
export function profileOfShape(profiles: Profile[], shapeId: string): Profile | undefined {
  return profiles.find((p) => p.shapeIds.includes(shapeId));
}

/** Longest edge of a profile — the one a direction question should ask about. */
export function longestSegment(sketch: AuthoringSketch, profile: Profile): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const segId of profile.segmentIds) {
    const seg = sketch.segments[segId];
    const a = sketch.points[seg.p1];
    const b = sketch.points[seg.p2];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = segId;
    }
  }
  return best;
}
