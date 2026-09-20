/**
 * Reasoning about geometry instead of guessing coordinates.
 *
 * Every test here asks the same question in a different way: is what came back
 * a RELATIONSHIP, or just today's answer? A point derived at an angle must move
 * when the angle changes; an equation solved for an angle must give an
 * expression, not a number; a relationship that cannot be rearranged must still
 * be re-solved when its inputs change.
 */

import { describe, it, expect } from "vitest";
import {
  isolate,
  printAST,
  parseEquation,
  solveNumeric,
  solveSystem,
  substitute,
  value,
} from "@/lib/geometry/symbolicAlgebra";
import * as Rel from "@/lib/geometry/relations";
import { sym, symPoint, type SP } from "@/lib/components/symbolic";
import { evaluateComponent } from "@/lib/components/evaluate";
import { makeRegistry } from "@/lib/components/instantiate";
import { DEFAULT_TOLERANCE_POLICY } from "@/lib/geometry/tolerance";
import type { ComponentDefinition } from "@/lib/components/types";

const TOL = DEFAULT_TOLERANCE_POLICY.geometry_mm;
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

// ---------------------------------------------------------------------------
// Rearranging a relationship
// ---------------------------------------------------------------------------

describe("solving for the unknown, as an expression", () => {
  const solved = (equation: string, unknown: string) => {
    const r = isolate(equation, unknown);
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    return r.ok ? r.expr : "";
  };

  it("undoes a sum, a product and a quotient", () => {
    expect(solved("Total = A + B", "B")).toBe("Total - A");
    expect(solved("Width = Count * Pitch", "Pitch")).toBe("Width / Count");
    expect(solved("Slope = Rise / Run", "Run")).toBe("Rise / Slope");
    expect(solved("Free = Soffit - HFL", "HFL")).toBe("Soffit - Free");
  });

  it("undoes trigonometry, which is the inverse question a draftsman actually asks", () => {
    // "What angle gives this rise over this length?"
    expect(solved("Rise = Length * sin(Angle)", "Angle")).toBe("asin(Rise / Length)");
    expect(solved("Run = Length * cos(Angle)", "Angle")).toBe("acos(Run / Length)");
    expect(solved("Slope = tan(Angle)", "Angle")).toBe("atan(Slope)");
    // And the answer is the same number the forward relationship gives.
    const scope = { Rise: 1500, Length: 3000 };
    const angle = value(solved("Rise = Length * sin(Angle)", "Angle"), scope)!;
    near(angle, 30);
    near(value("Length * sin(Angle)", { ...scope, Angle: angle })!, 1500);
  });

  it("works whichever side the unknown is on, and through a square root or a hypotenuse", () => {
    expect(solved("Length * cos(A) = Run", "A")).toBe("acos(Run / Length)");
    expect(solved("Side = sqrt(Area)", "Area")).toBe("Side * Side");
    expect(solved("Diagonal = hypot(Run, Rise)", "Rise")).toBe("sqrt(Diagonal * Diagonal - Run * Run)");
    near(value(solved("Diagonal = hypot(Run, Rise)", "Rise"), { Diagonal: 5, Run: 3 })!, 4);
  });

  it("says why it cannot, instead of inventing an answer", () => {
    const twice = isolate("Total = X + X * Slope", "X");
    expect(twice.ok).toBe(false);
    expect(twice.ok ? "" : twice.reason).toMatch(/appears 2 times/);

    const noInverse = isolate("Gap = abs(Offset)", "Offset");
    expect(noInverse.ok).toBe(false);
    expect(noInverse.ok ? "" : noInverse.reason).toMatch(/abs\(\)/);

    const absent = isolate("A = B + C", "Angle");
    expect(absent.ok).toBe(false);
    expect(absent.ok ? "" : absent.reason).toMatch(/does not appear/);
  });

  it("writes expressions back with the brackets the meaning needs, and no others", () => {
    const round = (src: string) => printAST(parseEquation(`x = ${src}`).rhs);
    expect(round("a + b * c")).toBe("a + b * c");
    expect(round("(a + b) * c")).toBe("(a + b) * c");
    expect(round("a - (b - c)")).toBe("a - (b - c)");
    expect(round("a / (b * c)")).toBe("a / (b * c)");
    expect(round("sin(A) * L")).toBe("sin(A) * L");
  });

  it("puts one relationship inside another", () => {
    expect(substitute("Rise / Run", "Rise", "Length * sin(A)")).toBe("Length * sin(A) / Run");
  });
});

describe("relationships solved together", () => {
  it("eliminates by substitution and writes each unknown in the knowns", () => {
    // A batter of known slope spanning a known height: how far out, how long?
    const r = solveSystem(["Rise = Run * Slope", "Length = hypot(Run, Rise)"], ["Run", "Length"]);
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    if (!r.ok) return;
    const byName = Object.fromEntries(r.solutions.map((s) => [s.name, s.expr]));
    expect(byName.Run).toBe("Rise / Slope");
    // Length must be written in the knowns, not left standing on Run.
    expect(byName.Length).not.toMatch(/\bRun\b/);
    const scope = { Rise: 2000, Slope: 0.5 };
    near(value(byName.Run, scope)!, 4000);
    near(value(byName.Length, scope)!, Math.hypot(4000, 2000));
  });

  it("says which unknowns it could not separate", () => {
    const r = solveSystem(["A * B = 10", "A + B = 7"], ["A", "B"]);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.reason).toMatch(/could not be separated|numerically/);
  });
});

describe("solving numerically, when nothing can be rearranged", () => {
  it("finds the answer inside the range and reports how closely it balances", () => {
    const r = solveNumeric("Angle + 100 * sin(Angle) = Target", "Angle", { scope: { Target: 80 }, min: 0, max: 90 });
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    if (!r.ok) return;
    near(r.value + 100 * Math.sin((r.value * Math.PI) / 180) - 80, 0, 1e-6);
    expect(Math.abs(r.residual)).toBeLessThan(1e-6);
  });

  it("refuses a range that does not contain the answer, and says what to do", () => {
    const r = solveNumeric("X * X = 4", "X", { scope: {}, min: 3, max: 9 });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.reason).toMatch(/never meet|Widen/);
  });
});

// ---------------------------------------------------------------------------
// Geometric constructions
// ---------------------------------------------------------------------------

describe("constructions that stay parametric", () => {
  const scope = { Ox: 1000, Oy: 500, WingAngle: 30, WingLength: 4000, Run: 2000, BatterRun: 4 };
  const P = (x: string, y: string): SP => symPoint([x, y], scope);
  const S = (e: string) => sym(e, scope);
  const at = (sp: SP, s: Record<string, number>) => ({ x: value(sp.x.e, s)!, y: value(sp.y.e, s)! });

  it("places a member's far end from its angle and its length", () => {
    const end = Rel.polar(P("Ox", "Oy"), S("WingAngle"), S("WingLength"));
    near(end.x.v, 1000 + 4000 * Math.cos(Math.PI / 6));
    near(end.y.v, 500 + 4000 * Math.sin(Math.PI / 6));
    // The relationship, not the answer: turn the wall and the end follows.
    expect(end.x.e).toMatch(/cos\(WingAngle\)/);
    const turned = at(end, { ...scope, WingAngle: 45 });
    near(turned.x, 1000 + 4000 * Math.cos(Math.PI / 4));
    near(turned.y, 500 + 4000 * Math.sin(Math.PI / 4));
    // And lengthening it keeps the angle.
    const longer = at(end, { ...scope, WingLength: 6000 });
    near(Math.atan2(longer.y - 500, longer.x - 1000) * (180 / Math.PI), 30);
  });

  it("falls a batter written as a ratio, and keeps it written that way", () => {
    const toe = Rel.bySlope(P("0", "3000"), S("Run"), S("-1 / BatterRun"));
    near(toe.x.v, 2000);
    near(toe.y.v, 3000 - 2000 / 4);
    // A flatter batter moves the toe down less — because the ratio is still there.
    const flatter = at(toe, { ...scope, BatterRun: 8 });
    near(flatter.y, 3000 - 2000 / 8);
  });

  it("runs along a line by distance or fraction, and parallel to it", () => {
    const a = P("0", "0");
    const b = P("3000", "4000");
    near(Rel.along(a, b, { distance: S("2500") }).x.v, 1500);
    near(Rel.along(a, b, { fraction: S("0.5") }).y.v, 2000);
    const parallel = Rel.along(a, b, { fraction: S("0.5") }, S("500"));
    // 500 to the left of a 3-4-5 direction.
    near(parallel.x.v, 1500 - 400);
    near(parallel.y.v, 2000 + 300);
  });

  it("finds where two faces meet, square distances, and a mitre", () => {
    const hit = Rel.crossing(P("0", "0"), P("1000", "1000"), P("0", "800"), P("1000", "800"), TOL)!;
    near(hit.x.v, 800);
    near(hit.y.v, 800);

    const foot = Rel.footOnLine(P("500", "900"), P("0", "0"), P("1000", "0"));
    near(foot.x.v, 500);
    near(foot.y.v, 0);
    near(Rel.offsetFromLine(P("500", "900"), P("0", "0"), P("1000", "0")).v, 900);
    near(Rel.perpendicularFrom(P("500", "0"), P("0", "0"), P("1000", "0"), S("250")).y.v, 250);

    const mitre = Rel.bisector(P("0", "0"), P("1000", "0"), P("0", "1000"), S("1000"));
    near(mitre.x.v, Math.cos(Math.PI / 4) * 1000);
    near(mitre.y.v, Math.sin(Math.PI / 4) * 1000);
  });

  it("reads a relationship back out of geometry", () => {
    near(Rel.distance(P("0", "0"), P("3000", "4000")).v, 5000);
    near(Rel.angleOf(P("0", "0"), P("1000", "1000")).v, 45);
    near(Rel.slopeOf(P("0", "0"), P("4000", "1000"), TOL)!.v, 0.25);
    expect(Rel.slopeOf(P("0", "0"), P("0", "1000"), TOL)).toBeNull();
    near(Rel.angleBetween(P("0", "0"), P("1000", "0"), P("0", "0"), P("0", "1000")).v, 90);
  });

  it("meets circles where they are actually met", () => {
    const tangents = Rel.tangentPoints(P("0", "0"), P("5000", "0"), S("3000"))!;
    for (const t of [tangents.first, tangents.second]) {
      near(Math.hypot(t.x.v - 5000, t.y.v), 3000, 1e-6);
      // The touch point is square to the line from the outside point: compare
      // the directions, not their product, which is in mm squared.
      const radius = { x: t.x.v - 5000, y: t.y.v };
      const ray = { x: t.x.v, y: t.y.v };
      const cosine = (radius.x * ray.x + radius.y * ray.y) / (Math.hypot(radius.x, radius.y) * Math.hypot(ray.x, ray.y));
      near(cosine, 0, 1e-9);
    }
    expect(Rel.tangentPoints(P("5000", "0"), P("5000", "0"), S("3000"))).toBeNull();

    const cut = Rel.lineCircle(P("-9000", "0"), P("9000", "0"), P("0", "0"), S("2000"))!;
    near(Math.abs(cut.first.x.v), 2000);
    near(Math.abs(cut.second.x.v), 2000);

    const two = Rel.circleCircle(P("0", "0"), S("1000"), P("1600", "0"), S("1000"))!;
    near(Math.hypot(two.first.x.v, two.first.y.v), 1000);
    near(Math.hypot(two.first.x.v - 1600, two.first.y.v), 1000);
    expect(Rel.circleCircle(P("0", "0"), S("100"), P("9000", "0"), S("100"))).toBeNull();
  });

  it("sets out in the structure's own axes and comes back to global ones", () => {
    const frame = { origin: P("1000", "2000"), angle: S("WingAngle") };
    const g = Rel.toGlobal(frame, S("3000"), S("400"));
    const back = Rel.toLocal(frame, g);
    near(back.u.v, 3000, 1e-6);
    near(back.v.v, 400, 1e-6);
    // Turn the frame: the point follows it, because the angle is still in there.
    const turned = at(g, { ...scope, WingAngle: 90 });
    near(turned.x, 1000 - 400);
    near(turned.y, 2000 + 3000);
  });
});

// ---------------------------------------------------------------------------
// A relationship the engine re-solves
// ---------------------------------------------------------------------------

describe("a value the engine solves on every regeneration", () => {
  /** The unknown appears twice, so there is nothing to rearrange. */
  const DEF: ComponentDefinition = {
    id: "drawing.solved-1",
    name: "Solved angle",
    category: "component",
    semanticType: "test",
    view: "elevation",
    description: "An angle defined by a relationship that cannot be rearranged.",
    version: "1",
    parameters: [{ name: "Target", label: "Target", kind: "length", unit: "mm", default: 80 }],
    formulas: [{ name: "Angle", expr: "0", unit: "deg", solve: { equation: "Angle + 100 * sin(Angle) = Target", min: "0", max: "90" } }],
    primitives: [
      { id: "arm", kind: "path", role: "member", layer: "outline", points: [["0", "0"], ["1000 * cos(Angle)", "1000 * sin(Angle)"]] },
    ],
    origin: { kind: "drawn" },
  };
  const reg = makeRegistry([DEF]);

  it("solves it, and solves it again when its input changes", () => {
    const first = evaluateComponent(DEF, { Target: 80 }, reg);
    expect(first.issues.filter((i) => i.severity === "error")).toEqual([]);
    const a1 = first.scope.Angle;
    near(a1 + 100 * Math.sin((a1 * Math.PI) / 180) - 80, 0, 1e-5);

    const second = evaluateComponent(DEF, { Target: 40 }, reg);
    const a2 = second.scope.Angle;
    near(a2 + 100 * Math.sin((a2 * Math.PI) / 180) - 40, 0, 1e-5);
    expect(a2).toBeLessThan(a1);

    // And the geometry built on it moved with it.
    const armOf = (ev: typeof first) => ev.loops.find((l) => l.primitiveId === "arm")!.points[1];
    expect(armOf(second).y).toBeLessThan(armOf(first).y);
  });

  it("reports a relationship with no answer in its range instead of drawing a wrong one", () => {
    const ev = evaluateComponent(DEF, { Target: 400 }, reg);
    const errors = ev.issues.filter((i) => i.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch(/solving|no answer/i);
  });
});
