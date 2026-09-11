/**
 * The draftsman workflow, end to end.
 *
 * These are the acceptance scenarios from the repair brief (§26), run against
 * the same public API the UI calls:
 *
 *     draw -> analyse -> accept -> diagnose -> author intent
 *          -> parameters -> component -> repeat -> validate -> publish
 *          -> change values -> geometry follows, invariants hold
 *
 * They assert BEHAVIOUR, not structure: what the geometry does when a value
 * changes, and whether the relationships the author declared still hold
 * afterwards. A test that only checked "DOF is 0" would pass on a drawing that
 * solves cleanly and means the wrong thing (§5).
 */

import { describe, it, expect } from "vitest";
import {
  begin,
  acceptAllDetected,
  answerEverything,
  choose,
  commit,
  setParameter,
  dof,
  nestedRectangles,
  haunchedCellInFrame,
  railingPost,
  HAUNCHED_CELL_SHAPE_IDS,
  Session,
} from "./fixtures";
import { regenerate } from "../../lib/upce/document";
import { suggestCompletion, applyAction, findOffsets } from "../../lib/upce/completion";
import { detectCandidates } from "../../lib/upce/detect";
import { analyseDof } from "../../lib/upce/dof";
import { proposeDerived, acceptDerived } from "../../lib/upce/derive";
import { createComponent, createRepeat } from "../../lib/upce/repeat";
import { assessReadiness, publish, buildManifest } from "../../lib/upce/template";
import { findProfiles } from "../../lib/upce/profile";
import type { RectangleShape, LineShape } from "../../lib/geometry/types";

/**
 * How close is close enough.
 *
 * The engine's own working tolerance is half a millimetre (§17). Asserting to
 * a ten-thousandth of a millimetre would be testing double-precision noise, not
 * behaviour, so these tests use a hundredth of a millimetre: far finer than any
 * drawing is fabricated to, and far coarser than the solver's residual.
 */
const MM = 1; // digits, i.e. within 0.05 mm

function rect(session: Session, id: string): RectangleShape {
  const result = regenerate(session.shapes, session.sketch, { shapeNames: session.names });
  return result.shapes.find((s) => s.id === id) as RectangleShape;
}

function gapsAround(session: Session, outerId: string, innerId: string) {
  const o = rect(session, outerId);
  const i = rect(session, innerId);
  return {
    left: i.x - o.x,
    right: o.x + o.width - (i.x + i.width),
    top: i.y - o.y,
    bottom: o.y + o.height - (i.y + i.height),
  };
}

describe("Scenario A — nested rectangles become a parametric template", () => {
  function authored(): Session {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");
    s = choose(s, "Name Outer's height");
    s = choose(s, "Keep both left and right gaps equal");
    s = choose(s, "Keep both top and bottom gaps equal");
    return s;
  }

  it("reaches a fully defined state through the assistant alone", () => {
    const s = authored();
    expect(dof(s)).toBe(0);
  });

  it("names the two thicknesses rather than four independent clearances", () => {
    const s = authored();
    const names = Object.keys(s.sketch.parameters);
    expect(names).toContain("WallThickness");
    expect(names).toContain("SlabThickness");
    expect(s.sketch.parameters.WallThickness.value).toBeCloseTo(300, MM);
  });

  it("deforms anisotropically: a thicker wall narrows the opening and leaves the frame alone", () => {
    let s = authored();
    const before = rect(s, "R1");
    s = setParameter(s, "WallThickness", 500);

    const after = rect(s, "R1");
    const opening = rect(s, "R2");
    const gaps = gapsAround(s, "R1", "R2");

    expect(after.width).toBeCloseTo(before.width, MM);
    expect(after.height).toBeCloseTo(before.height, MM);
    expect(opening.width).toBeCloseTo(3000, MM);
    expect(gaps.left).toBeCloseTo(500, MM);
    expect(gaps.right).toBeCloseTo(500, MM);
    expect(gaps.top).toBeCloseTo(300, MM);
  });

  it("holds the wall thickness when the frame is widened", () => {
    let s = authored();
    s = setParameter(s, "OuterWidth", 6000);
    const gaps = gapsAround(s, "R1", "R2");
    expect(gaps.left).toBeCloseTo(300, MM);
    expect(gaps.right).toBeCloseTo(300, MM);
    expect(rect(s, "R2").width).toBeCloseTo(5400, MM);
  });

  it("never applies an inference without being asked", () => {
    const s = begin(nestedRectangles());
    const candidates = detectCandidates(s.sketch, { shapeNames: s.names });
    expect(candidates.length).toBeGreaterThan(0);
    // Detection alone changes nothing: only geometric facts are present.
    expect(s.sketch.constraints.every((c) => c.strength === "fact")).toBe(true);
  });

  it("does not flood the author with near-identical candidates", () => {
    const s = begin(nestedRectangles());
    const candidates = detectCandidates(s.sketch, { shapeNames: s.names });
    // Two rectangles have dozens of true parallel/perpendicular pairs. After the
    // minimisation pass only the independent ones are worth a card.
    expect(candidates.length).toBeLessThanOrEqual(6);
  });
});

describe("Derived values are inferred only when the solver agrees", () => {
  function authored(): Session {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");
    s = choose(s, "Name Outer's height");
    s = choose(s, "Keep both left and right gaps equal");
    s = choose(s, "Keep both top and bottom gaps equal");
    return s;
  }

  it("finds the canonical inner-width relationship and validates it by perturbation", () => {
    const s = authored();
    const candidates = proposeDerived(s.sketch, s.shapes, { shapeNames: s.names });
    const width = candidates.find((c) => /WallThickness/.test(c.expr) && /Width$/.test(c.name));
    expect(width).toBeDefined();
    expect(width!.expr.replace(/\s+/g, "")).toBe("OuterWidth-2*WallThickness");
    expect(width!.validation.cases).toBeGreaterThan(0);
    expect(width!.validation.passed).toBe(width!.validation.cases);
  });

  it("rejects a coincidence that two equal parameters would otherwise explain", () => {
    // WallThickness and SlabThickness both measure 300, so `H - 2*WallThickness`
    // is arithmetically just as good as `H - 2*SlabThickness` for the opening's
    // height. Only the one the constraints actually enforce may survive.
    const s = authored();
    const candidates = proposeDerived(s.sketch, s.shapes, { shapeNames: s.names });
    const height = candidates.find((c) => /Height$/.test(c.name));
    expect(height).toBeDefined();
    expect(height!.expr).toContain("SlabThickness");
    expect(height!.expr).not.toContain("WallThickness");
  });

  it("never proposes a bare identity as a derived relationship", () => {
    const s = authored();
    const candidates = proposeDerived(s.sketch, s.shapes, { shapeNames: s.names });
    for (const c of candidates) {
      expect(c.dependencies.length).toBeGreaterThan(1);
    }
  });
});

describe("Scenario B — a repeat authored from ordinary geometry", () => {
  function authoredCell(): Session {
    let s = begin(haunchedCellInFrame());
    s = { ...s, sketch: createComponent(s.sketch, s.shapes, HAUNCHED_CELL_SHAPE_IDS, "Cell").sketch };
    s = acceptAllDetected(s);
    s = answerEverything(s);
    return s;
  }

  it("treats eight welded lines as one profile, not eight shapes", () => {
    const s = begin(haunchedCellInFrame());
    const profiles = findProfiles(s.sketch, s.names);
    expect(profiles).toHaveLength(2);
    const cell = profiles.find((p) => p.shapeIds.length === 8);
    expect(cell).toBeDefined();
    expect(cell!.closed).toBe(true);
  });

  it("measures one clearance per face of the frame, not one per line", () => {
    const s = begin(haunchedCellInFrame());
    const offsets = findOffsets(s.sketch, undefined, s.names);
    // Four faces on the frame, one inner profile.
    expect(offsets).toHaveLength(4);
    expect(new Set(offsets.map((o) => o.inner.id)).size).toBe(1);
  });

  it("fully defines the haunched cell through the assistant", { timeout: 30_000 }, () => {
    const s = authoredCell();
    expect(dof(s)).toBe(0);
  });

  it("collapses the four haunches into one named length taken from their own names", { timeout: 30_000 }, () => {
    const s = authoredCell();
    // The four chamfers were drawn as ch_tr, ch_br, ch_bl, ch_tl, so the shared
    // prefix is what names the value. The claim under test is that there is ONE
    // parameter for all four, not four independent numbers.
    const haunch = Object.values(s.sketch.parameters).find((p) => p.name.startsWith("ch"));
    expect(haunch).toBeDefined();

    const result = regenerate(s.shapes, s.sketch, { shapeNames: s.names });
    const lengths = ["ch_tr", "ch_br", "ch_bl", "ch_tl"].map((id) => {
      const l = result.shapes.find((sh) => sh.id === id) as LineShape;
      return Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    });
    for (const len of lengths) expect(len).toBeCloseTo(lengths[0], MM);

    // And driving it moves all four together.
    const moved = setParameter(s, haunch!.name, haunch!.value + 10);
    const after = regenerate(moved.shapes, moved.sketch, { shapeNames: moved.names });
    const movedLengths = ["ch_tr", "ch_br", "ch_bl", "ch_tl"].map((id) => {
      const l = after.shapes.find((sh) => sh.id === id) as LineShape;
      return Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    });
    for (const len of movedLengths) expect(len).toBeCloseTo(lengths[0] + 10, MM);
  });

  it("regenerates topology when the count changes, and the frame follows", { timeout: 60_000 }, () => {
    let s = authoredCell();
    const component = s.sketch.components.find((c) => c.name === "Cell")!;
    s = commit(s, createRepeat(s.sketch, {
      componentId: component.id,
      count: 1,
      pitch: 280,
      spacingMode: "driven",
      direction: { x: 1, y: 0 },
    }).sketch);

    // The container question is asked even though the sketch is fully defined.
    const report = suggestCompletion(s.sketch, s.names);
    const grow = report.groups
      .flatMap((g) => g.options)
      .find((o) => o.title.includes("grows to fit"));
    expect(grow).toBeDefined();
    // The expression must be built from named values, with no magic constant.
    expect(grow!.convertToDerived!.expr).toBe(
      "(CellCount - 1) * CellPitch + CellWidth + 2 * WallThickness"
    );

    s = commit(s, applyAction(s.sketch, grow!));

    // Once applied, the question is resolved and must not be offered again (§3.2).
    const reportAfter = suggestCompletion(s.sketch, s.names);
    expect(reportAfter.groups.filter((g) => g.id.startsWith("array_"))).toHaveLength(0);

    const widths: number[] = [];
    for (const count of [1, 2, 3, 4]) {
      s = setParameter(s, "CellCount", count);
      const result = regenerate(s.shapes, s.sketch, { shapeNames: s.names });
      expect(result.rejection).toBeUndefined();

      const roofs = result.shapes.filter(
        (sh) => sh.id === "roof" || sh.id.endsWith(":roof")
      ) as LineShape[];
      expect(roofs).toHaveLength(count);

      const frame = result.shapes.find((sh) => sh.id === "outer") as RectangleShape;
      widths.push(frame.width);

      // Every copy sits one pitch from the last, and every copy is a true
      // translation of the unit rather than a mirrored twin: the haunches all
      // lean the same way, which is what a congruence check on the roof's
      // position within each cell actually measures.
      const xs = roofs.map((l) => Math.min(l.x1, l.x2)).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i] - xs[i - 1]).toBeCloseTo(280, MM);
      }
      const leftWalls = result.shapes.filter(
        (sh) => sh.id === "wall_l" || sh.id.endsWith(":wall_l")
      ) as LineShape[];
      expect(leftWalls).toHaveLength(count);
      const runs = leftWalls
        .map((w) => Math.min(w.x1, w.x2))
        .sort((a, b) => a - b)
        .map((x, i) => xs[i] - x);
      for (const run of runs) expect(run).toBeCloseTo(runs[0], MM);

      expect(result.dof.dof).toBe(0);
      expect(result.invariants.every((inv) => inv.ok)).toBe(true);
      expect(result.topology.ok).toBe(true);
    }

    // The frame really grew, by exactly one pitch per extra copy.
    expect(widths[1] - widths[0]).toBeCloseTo(280, MM);
    expect(widths[2] - widths[1]).toBeCloseTo(280, MM);
  });

  it("keeps the growth rule correct when a thickness changes", { timeout: 60_000 }, () => {
    let s = authoredCell();
    const component = s.sketch.components.find((c) => c.name === "Cell")!;
    s = commit(s, createRepeat(s.sketch, {
      componentId: component.id,
      count: 3,
      pitch: 280,
      spacingMode: "driven",
      direction: { x: 1, y: 0 },
    }).sketch);
    const grow = suggestCompletion(s.sketch, s.names)
      .groups.flatMap((g) => g.options)
      .find((o) => o.title.includes("grows to fit"))!;
    s = commit(s, applyAction(s.sketch, grow));

    const before = rect(s, "outer").width;
    const wall = s.sketch.parameters.WallThickness.value;
    s = setParameter(s, "WallThickness", wall + 45);
    const after = rect(s, "outer").width;

    // Two end walls, so the frame gains twice the extra thickness. A hand-written
    // formula with a baked-in constant would not do this.
    expect(after - before).toBeCloseTo(90, MM);
  });
});

describe("Generality — the same mechanism on structurally different geometry", () => {
  it("arrays a railing post along a deck with no post-specific code", () => {
    let s = begin(railingPost());
    s = acceptAllDetected(s);
    s = answerEverything(s);

    const component = createComponent(s.sketch, s.shapes, ["post"], "Post");
    s = commit(s, component.sketch);
    s = commit(s, createRepeat(s.sketch, {
      componentId: component.component.id,
      count: 5,
      pitch: 1200,
      spacingMode: "driven",
      direction: { x: 1, y: 0 },
    }).sketch);

    const result = regenerate(s.shapes, s.sketch, { shapeNames: s.names });
    expect(result.rejection).toBeUndefined();
    const posts = result.shapes.filter((sh) => sh.id === "post" || sh.id.endsWith(":post"));
    expect(posts).toHaveLength(5);

    s = setParameter(s, "PostCount", 3);
    const fewer = regenerate(s.shapes, s.sketch, { shapeNames: s.names });
    expect(fewer.shapes.filter((sh) => sh.id === "post" || sh.id.endsWith(":post"))).toHaveLength(3);
  });
});

describe("Refusals are atomic and explained", () => {
  it("leaves the drawing untouched when a value cannot be satisfied", () => {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");
    s = choose(s, "Name Outer's height");
    s = choose(s, "Keep both left and right gaps equal");
    s = choose(s, "Keep both top and bottom gaps equal");

    const before = rect(s, "R2");
    // A wall thicker than half the frame turns the opening inside out.
    const probe = {
      ...s.sketch,
      parameters: {
        ...s.sketch.parameters,
        WallThickness: { ...s.sketch.parameters.WallThickness, value: 2600 },
      },
    };
    const result = regenerate(s.shapes, probe, { shapeNames: s.names });

    expect(result.rejection).toBeDefined();
    expect(result.rejection).toMatch(/Nothing was changed/);
    // And the geometry that came back is the geometry that went in.
    const after = result.shapes.find((sh) => sh.id === "R2") as RectangleShape;
    expect(after.width).toBeCloseTo(before.width, MM);
  });
});

describe("Template readiness is behavioural, not structural", () => {
  function publishable(): Session {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");
    s = choose(s, "Name Outer's height");
    s = choose(s, "Keep both left and right gaps equal");
    s = choose(s, "Keep both top and bottom gaps equal");
    for (const name of ["OuterWidth", "OuterHeight", "WallThickness", "SlabThickness"]) {
      const p = s.sketch.parameters[name];
      s = {
        ...s,
        sketch: {
          ...s.sketch,
          parameters: {
            ...s.sketch.parameters,
            [name]: { ...p, min: p.value * 0.5, max: p.value * 2 },
          },
        },
      };
    }
    return s;
  }

  it("passes only after every swept value re-solves with invariants intact", { timeout: 30_000 }, () => {
    const s = publishable();
    const report = assessReadiness(s.sketch, s.shapes, { shapeNames: s.names });
    expect(report.sweep.length).toBeGreaterThan(0);
    expect(report.sweep.every((x) => x.ok)).toBe(true);
    expect(report.ready).toBe(true);
  });

  it("refuses to publish an under-constrained drawing", () => {
    const s = begin(nestedRectangles());
    const report = assessReadiness(s.sketch, s.shapes, { shapeNames: s.names });
    expect(report.ready).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/degree\(s\) of freedom remain/);
  });

  it("publishes only what the author exposed, and the values stay live", () => {
    const s = publishable();
    const result = publish(s.sketch, s.shapes, { shapeNames: s.names });
    expect(result.manifest).toBeDefined();
    expect(result.manifest!.driving.map((d) => d.name).sort()).toEqual([
      "OuterHeight",
      "OuterWidth",
      "SlabThickness",
      "WallThickness",
    ]);

    // The manifest reads from the sketch, so a later change shows through it.
    const moved = {
      ...result.sketch,
      parameters: {
        ...result.sketch.parameters,
        WallThickness: { ...result.sketch.parameters.WallThickness, value: 420 },
      },
    };
    expect(buildManifest(moved).driving.find((d) => d.name === "WallThickness")!.value).toBe(420);
  });
});

describe("Every parameter can say where it came from", () => {
  it("records an origin and an explanation for each one", () => {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");

    for (const p of Object.values(s.sketch.parameters)) {
      expect(p.provenance.origin).toBeTruthy();
      expect(p.provenance.detail.length).toBeGreaterThan(10);
      expect(p.role).toBeTruthy();
    }
  });

  it("records an origin for each constraint too, including the shape's own facts", () => {
    const s = begin(nestedRectangles());
    for (const c of s.sketch.constraints) {
      expect(c.provenance.origin).toBe("geometric-fact");
      expect(c.label.length).toBeGreaterThan(5);
    }
  });
});

describe("Degrees of freedom are measured, never estimated", () => {
  it("reports a lone rectangle as under-defined, not fully defined", () => {
    const s = begin([
      { id: "R", name: "Plate", type: "rectangle", x: 0, y: 0, width: 100, height: 50 } as never,
    ]);
    const report = analyseDof(s.sketch, s.names);
    // Two positions, one rotation, width and height: five, not zero.
    expect(report.dof).toBe(5);
    expect(report.status).toBe("under");
    expect(report.motions.length).toBeGreaterThan(0);
  });

  it("separates a harmless duplicate from a real contradiction by its residual", () => {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    const report = analyseDof(s.sketch, s.names);
    for (const d of report.diagnoses) {
      if (d.status === "redundant") expect(d.residual).toBeLessThan(0.5);
      if (d.status === "conflicting") expect(d.residual).toBeGreaterThan(0.5);
    }
  });
});

describe("Two-sided clearance coupling when both spans are named", () => {
  it("offers derived coupling when both outer and inner widths are named, and grows dynamically", () => {
    let s = begin(nestedRectangles());
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer");
    s = choose(s, "Name Outer's width");
    s = choose(s, "Name Outer's height");
    s = choose(s, "Name Opening's width");
    s = choose(s, "Name Opening's height");

    const report = suggestCompletion(s.sketch, s.names);
    const horiz = report.groups.find((g) => g.id.includes("horizontal"));
    expect(horiz).toBeDefined();

    const titles = horiz!.options.map((o) => o.title);
    expect(titles.some((t) => t.includes("grows to fit"))).toBe(true);
    expect(titles.some((t) => t.includes("sizes to fit inside"))).toBe(true);

    // Choose Outer grows to fit Opening
    s = choose(s, "grows to fit");
    expect(s.sketch.parameters.OuterWidth.role).toBe("DERIVED");
    expect(s.sketch.parameters.OpeningWidth.role).toBe("DRIVING");
    expect(s.sketch.parameters.WallThickness.role).toBe("DRIVING");

    // Driving OpeningWidth resizes the outer frame dynamically
    s = setParameter(s, "OpeningWidth", 5000);
    const r1 = rect(s, "R1");
    const r2 = rect(s, "R2");
    const gaps = gapsAround(s, "R1", "R2");

    expect(r2.width).toBeCloseTo(5000, MM);
    expect(r1.width).toBeCloseTo(5600, MM);
    expect(gaps.left).toBeCloseTo(300, MM);
    expect(gaps.right).toBeCloseTo(300, MM);

    // Driving WallThickness resizes the outer frame to preserve both walls
    s = setParameter(s, "WallThickness", 500);
    const r1Thick = rect(s, "R1");
    const r2Thick = rect(s, "R2");
    const gapsThick = gapsAround(s, "R1", "R2");

    expect(r2Thick.width).toBeCloseTo(5000, MM);
    expect(r1Thick.width).toBeCloseTo(6000, MM);
    expect(gapsThick.left).toBeCloseTo(500, MM);
    expect(gapsThick.right).toBeCloseTo(500, MM);
  });

  it("works identically on an 8-line haunched cell inside a frame", () => {
    let s = begin(haunchedCellInFrame());
    s = { ...s, sketch: createComponent(s.sketch, s.shapes, HAUNCHED_CELL_SHAPE_IDS, "Cell").sketch };
    s = acceptAllDetected(s);
    s = choose(s, "Pin Outer_Frame");
    s = choose(s, "Name Outer_Frame's width");
    s = choose(s, "Name Cell's width");

    const report = suggestCompletion(s.sketch, s.names);
    const horiz = report.groups.find((g) => g.id.includes("horizontal"));
    expect(horiz).toBeDefined();
    expect(horiz!.options.some((o) => o.title.includes("Outer_Frame grows to fit Cell"))).toBe(true);

    s = choose(s, "Outer_Frame grows to fit Cell");
    expect(s.sketch.parameters.Outer_FrameWidth.role).toBe("DERIVED");
  });
});

