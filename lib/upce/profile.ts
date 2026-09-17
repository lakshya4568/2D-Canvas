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

/**
 * The same walk, returning point IDS rather than coordinates.
 *
 * A centroid constraint has to name the vertices it depends on, not copy their
 * positions — the positions are what the solver is about to change. Sharing the
 * traversal with `profileLoop` keeps the two in the same order, which matters
 * because a shoelace area is meaningless if the boundary is walked differently
 * on two occasions.
 */
export function profileLoopIds(sketch: AuthoringSketch, profile: Profile): string[] | null {
  if (!profile.closed) return null;

  const adjacency = new Map<string, { segId: string; other: string }[]>();
  for (const segId of profile.segmentIds) {
    const seg = sketch.segments[segId];
    (adjacency.get(seg.p1) ?? adjacency.set(seg.p1, []).get(seg.p1)!).push({ segId, other: seg.p2 });
    (adjacency.get(seg.p2) ?? adjacency.set(seg.p2, []).get(seg.p2)!).push({ segId, other: seg.p1 });
  }

  const start = profile.pointIds[0];
  const ids: string[] = [];
  const usedSegments = new Set<string>();
  let current = start;

  for (let guard = 0; guard <= profile.segmentIds.length; guard++) {
    if (!sketch.points[current]) return null;
    ids.push(current);

    const next = (adjacency.get(current) ?? []).find((e) => !usedSegments.has(e.segId));
    if (!next) break;
    usedSegments.add(next.segId);
    current = next.other;
    if (current === start) break;
  }

  return usedSegments.size === profile.segmentIds.length && ids.length >= 3 ? ids : null;
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

/**
 * A closed loop the geometry actually bounds, with its vertices in order.
 *
 * For a simple outline this is the profile itself. For a BRANCHED one — two
 * solids that share an edge, a cushion sitting on a slab, two cells side by side
 * — the connected component is not a loop at all: the shared corners have three
 * edges and `profileLoop` gives up. Every analysis built on loops (regions,
 * overlaps, wall offsets, containment) then silently skipped the whole
 * structure. Here such a component is split into the faces it bounds.
 */
export interface ClosedLoop extends Profile {
  /** Point ids in boundary order. */
  loopIds: string[];
  /** The connected profile this loop was traced from. */
  profileId: string;
}

/**
 * Bounded faces of one connected profile, by planar face tracing.
 *
 * At each vertex the walk takes the first edge CLOCKWISE from the one it
 * arrived along, which keeps the face on its left; faces with positive signed
 * area are bounded, the one negative face is the outside. Two segments joining
 * the same pair of points (a rectangle's edge lying on another's) make a
 * zero-area sliver, which is dropped.
 */
function tracedFaces(sketch: AuthoringSketch, profile: Profile, names: Record<string, string>): ClosedLoop[] {
  type Out = { to: string; seg: string; angle: number };
  const out = new Map<string, Out[]>();
  for (const segId of profile.segmentIds) {
    const seg = sketch.segments[segId];
    const a = sketch.points[seg.p1];
    const b = sketch.points[seg.p2];
    if (!a || !b) continue;
    (out.get(seg.p1) ?? out.set(seg.p1, []).get(seg.p1)!).push({ to: seg.p2, seg: segId, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    (out.get(seg.p2) ?? out.set(seg.p2, []).get(seg.p2)!).push({ to: seg.p1, seg: segId, angle: Math.atan2(a.y - b.y, a.x - b.x) });
  }
  // Two segments between the same pair of points leave at the same angle. For
  // the rotation system to be planar their order must be MIRRORED at the two
  // ends — the one that is clockwise-most leaving one end is counter-clockwise-
  // most leaving the other — or the walk mixes the faces on either side.
  for (const [at, list] of out) {
    list.sort((m, n) => {
      if (m.angle !== n.angle) return m.angle - n.angle;
      const forward = at < m.to;
      return (m.seg < n.seg ? -1 : 1) * (forward ? 1 : -1);
    });
  }

  const used = new Set<string>();
  const key = (from: string, seg: string) => `${from}>${seg}`;
  const raw: { ids: string[]; segs: string[] }[] = [];

  for (const [start, edges] of [...out.entries()].sort((m, n) => (m[0] < n[0] ? -1 : 1))) {
    for (const first of edges) {
      if (used.has(key(start, first.seg))) continue;
      const ids: string[] = [];
      const segs: string[] = [];
      let from = start;
      let edge = first;
      for (let guard = 0; guard < 4 * profile.segmentIds.length + 4; guard++) {
        used.add(key(from, edge.seg));
        ids.push(from);
        segs.push(edge.seg);
        const at = edge.to;
        const list = out.get(at)!;
        const back = list.findIndex((e) => e.seg === edge.seg && e.to === from);
        // Next clockwise from the way back = previous in counter-clockwise order.
        const next = list[(back - 1 + list.length) % list.length];
        from = at;
        edge = next;
        if (from === start && edge.seg === first.seg) break;
      }
      let area = 0;
      for (let i = 0; i < ids.length; i++) {
        const p = sketch.points[ids[i]];
        const q = sketch.points[ids[(i + 1) % ids.length]];
        area += p.x * q.y - q.x * p.y;
      }
      if (area / 2 > 1e-6) raw.push({ ids, segs });
    }
  }

  // Where two segments lie on each other, each face should be credited with
  // the one that belongs with the rest of its outline: a box's top face is the
  // box's top edge, not the bottom edge of the layer resting on it. Which of
  // the pair the walk handed to which face is arbitrary, so each shared pair is
  // settled between its two faces by affinity. Lines drawn as one outline are
  // named Name_1, Name_2...; the stem is what they have in common.
  const stem = (segId: string) => sketch.segments[segId].shapeId.replace(/_\d+$/, "");
  const affinity = (face: { segs: string[] }, seg: string, except: string) =>
    face.segs.filter((x) => x !== except && stem(x) === stem(seg)).length;
  const samePair = (a: string, b: string) => {
    const s1 = sketch.segments[a];
    const s2 = sketch.segments[b];
    return a !== b && ((s1.p1 === s2.p1 && s1.p2 === s2.p2) || (s1.p1 === s2.p2 && s1.p2 === s2.p1));
  };
  for (let i = 0; i < raw.length; i++) {
    for (let j = 0; j < raw.length; j++) {
      if (i === j) continue;
      for (let ai = 0; ai < raw[i].segs.length; ai++) {
        const a = raw[i].segs[ai];
        const bj = raw[j].segs.findIndex((b) => samePair(a, b));
        if (bj < 0) continue;
        const b = raw[j].segs[bj];
        const keep = affinity(raw[i], a, a) + affinity(raw[j], b, b);
        const swap = affinity(raw[i], b, a) + affinity(raw[j], a, b);
        if (swap > keep) {
          raw[i].segs[ai] = b;
          raw[j].segs[bj] = a;
        }
      }
    }
  }

  const faces: ClosedLoop[] = [];
  raw.forEach(({ ids, segs }, k) => {
    const shapeIds = [...new Set(segs.map((sid) => sketch.segments[sid].shapeId))].sort();
    const stems = [...new Set(segs.map(stem))];
    faces.push({
      // A face that is one shape — a rectangle resting on another — is that
      // shape, and is called by its id; anything else by the profile and its
      // first edge, which does not change while the topology does not.
      id: shapeIds.length === 1 ? shapeIds[0] : `${profile.id}/${[...segs].sort()[0]}`,
      profileId: profile.id,
      shapeIds,
      segmentIds: [...new Set(segs)].sort(),
      pointIds: [...new Set(ids)].sort(),
      loopIds: ids,
      closed: true,
      label:
        shapeIds.length === 1
          ? names[shapeIds[0]] ?? shapeIds[0]
          : stems.length === 1
            ? stems[0]
            : `${profile.label} part ${k + 1}`,
    });
  });
  return faces;
}

/** Every closed loop in the sketch: simple profiles whole, branched ones by face. */
export function closedLoops(sketch: AuthoringSketch, names: Record<string, string> = {}): ClosedLoop[] {
  const out: ClosedLoop[] = [];
  for (const profile of findProfiles(sketch, names)) {
    if (!profile.closed) continue;
    const ids = profileLoopIds(sketch, profile);
    if (ids) out.push({ ...profile, loopIds: ids, profileId: profile.id });
    else out.push(...tracedFaces(sketch, profile, names));
  }
  return out;
}

/**
 * Which closed loop each closed loop sits inside, by loop id.
 *
 * The innermost container wins, so an opening inside a wall inside a frame
 * reports the wall. Used to catch the failure a value sweep otherwise passes:
 * an opening driven wider than the box around it breaks no declared rule — the
 * wall it pushed through was simply never named — yet the section is nonsense.
 */
export function containment(sketch: AuthoringSketch, names: Record<string, string> = {}): Map<string, string> {
  const loops = closedLoops(sketch, names).map((l) => ({
    ...l,
    pts: l.loopIds.map((id) => sketch.points[id]),
  }));
  const area = (loop: { x: number; y: number }[]) => {
    let a = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a / 2);
  };
  const out = new Map<string, string>();
  for (const inner of loops) {
    let best: { id: string; area: number } | null = null;
    for (const outer of loops) {
      if (outer.id === inner.id || outer.profileId === inner.profileId) continue;
      // Shared vertices sit ON the outer boundary, not inside it; only the
      // inner loop's own vertices decide.
      const own = inner.pointIds.filter((id) => !outer.pointIds.includes(id));
      if (own.length === 0) continue;
      if (!own.every((id) => sketch.points[id] && pointInLoop(outer.pts, sketch.points[id]))) continue;
      const a = area(outer.pts);
      if (!best || a < best.area) best = { id: outer.id, area: a };
    }
    if (best) out.set(inner.id, best.id);
  }
  return out;
}

/**
 * Pairs of circles whose discs overlap, by shape id.
 *
 * Circles are not profiles, so no loop analysis ever sees them. A plate whose
 * width is driven below twice its edge distance puts two bolt holes on top of
 * each other and breaks no written rule; this is how a value sweep notices.
 */
export function overlappingCircles(sketch: AuthoringSketch, tolerance = 1e-6): Set<string> {
  const discs = Object.values(sketch.circles)
    .map((c) => {
      const o = sketch.points[c.center];
      const r = sketch.points[c.rim];
      return o && r ? { id: c.shapeId, x: o.x, y: o.y, r: Math.hypot(r.x - o.x, r.y - o.y) } : null;
    })
    .filter((d): d is { id: string; x: number; y: number; r: number } => d !== null);
  const out = new Set<string>();
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i];
      const b = discs[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - tolerance) {
        out.add(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
      }
    }
  }
  return out;
}
