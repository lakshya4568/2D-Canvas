/**
 * Standards profiles as data — codes stay OUT of the kernel.
 * UPCE-MASTER-1.0 §26, §88 (safe evaluation, never `eval`), DEC-004.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseStandardsProfile,
  evaluateAgainstProfile,
  evaluateArithmetic,
  evaluateComparison,
  StandardsProfileRegistry,
} from "../../lib/validation/standardsProfile";

const ROOT = join(import.meta.dir, "..", "..");
const loadProfile = (name: string) =>
  parseStandardsProfile(JSON.parse(readFileSync(join(ROOT, "standards", "profiles", name), "utf8")));

describe("Shipped profiles load and are honest about verification", () => {
  it("parses the RDSO culvert profile", () => {
    const p = loadProfile("rdso_culvert.json");
    expect(p.id).toBe("RDSO_CULVERT");
    expect(p.requiredParameters).toContain("ClearSpan");
    expect(p.relationships.length).toBeGreaterThan(0);
  });

  it("parses the IRC structural profile", () => {
    const p = loadProfile("irc_structural.json");
    expect(p.id).toBe("IRC_STRUCTURAL");
    expect(p.parameterBounds.ConcreteCover.codeRef).toContain("IRC:112");
  });

  it("marks both shipped profiles UNVERIFIED until a human confirms the clauses", () => {
    // DEC-004 / Appendix G item 4: clause values must be read from the current
    // official edition before they are treated as authoritative.
    for (const name of ["rdso_culvert.json", "irc_structural.json"]) {
      expect(loadProfile(name).verified).toBe(false);
    }
  });

  it("surfaces the unverified status in the evaluation metadata", () => {
    const e = evaluateAgainstProfile(loadProfile("rdso_culvert.json"), {
      ClearSpan: 2000,
      ClearHeight: 1500,
      WallThickness: 350,
      SlabThickness: 300,
    });
    expect(e.verified).toBe(false);
    expect(e.metadata.join(" ")).toContain("UNVERIFIED");
  });
});

describe("§88 Safe evaluation — never `eval`", () => {
  it("evaluates arithmetic with correct precedence", () => {
    expect(evaluateArithmetic("2 + 3 * 4", {})).toBe(14);
    expect(evaluateArithmetic("(2 + 3) * 4", {})).toBe(20);
    expect(evaluateArithmetic("A / B", { A: 10, B: 4 })).toBe(2.5);
    expect(evaluateArithmetic("-A + 5", { A: 2 })).toBe(3);
  });

  it("returns null on an unbound symbol rather than guessing", () => {
    expect(evaluateArithmetic("A + B", { A: 1 })).toBeNull();
  });

  it("returns null on division by zero", () => {
    expect(evaluateArithmetic("A / B", { A: 1, B: 0 })).toBeNull();
  });

  it("refuses code, not just bad arithmetic", () => {
    expect(evaluateArithmetic("process.exit(1)", {})).toBeNull();
    expect(evaluateArithmetic("globalThis", {})).toBeNull();
    expect(evaluateArithmetic("(()=>1)()", {})).toBeNull();
    expect(evaluateArithmetic("A; B", { A: 1, B: 2 })).toBeNull();
  });

  it("evaluates every supported comparison operator", () => {
    expect(evaluateComparison("A <= B", { A: 1, B: 2 })).toEqual({ ok: true, parsed: true });
    expect(evaluateComparison("A >= B", { A: 1, B: 2 })).toEqual({ ok: false, parsed: true });
    expect(evaluateComparison("A == B", { A: 2, B: 2 })).toEqual({ ok: true, parsed: true });
    expect(evaluateComparison("A < B", { A: 3, B: 2 })).toEqual({ ok: false, parsed: true });
    expect(evaluateComparison("A > B", { A: 3, B: 2 })).toEqual({ ok: true, parsed: true });
  });

  it("reports an unparseable rule instead of silently passing it", () => {
    const r = evaluateComparison("A ~= B", { A: 1, B: 2 });
    expect(r.parsed).toBe(false);
  });
});

describe("§26 Evaluation produces metadata, not solver logic", () => {
  const profile = () => loadProfile("rdso_culvert.json");

  it("reports a compliant parameter set as clean", () => {
    const e = evaluateAgainstProfile(profile(), {
      ClearSpan: 2000,
      ClearHeight: 1500,
      WallThickness: 350,
      SlabThickness: 300,
    });
    expect(e.compliant).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("flags a below-minimum value as a WARNING, not a block", () => {
    const e = evaluateAgainstProfile(profile(), {
      ClearSpan: 2000,
      ClearHeight: 1500,
      WallThickness: 100,
      SlabThickness: 300,
    });
    expect(e.compliant).toBe(false);
    expect(e.blocked).toBe(false);
    expect(e.boundViolations[0].severity).toBe("warning");
    expect(e.boundViolations[0].kind).toBe("below-min");
    expect(e.boundViolations[0].codeRef).toBeTruthy();
  });

  it("blocks ONLY a physically impossible value", () => {
    const e = evaluateAgainstProfile(
      profile(),
      { ClearSpan: 2000, ClearHeight: 1500, WallThickness: 350, SlabThickness: 300, InnerWidth: -50 },
      { physicalFloors: { InnerWidth: 0 } }
    );
    expect(e.blocked).toBe(true);
    expect(e.boundViolations[0].kind).toBe("physically-impossible");
    expect(e.boundViolations[0].severity).toBe("error");
  });

  it("evaluates the aspect-ratio relationship with its clause reference", () => {
    const e = evaluateAgainstProfile(profile(), {
      ClearSpan: 6000,
      ClearHeight: 1000,
      WallThickness: 350,
      SlabThickness: 300,
    });
    expect(e.standardsViolations.length).toBeGreaterThan(0);
    expect(e.standardsViolations[0].codeRef).toBeTruthy();
  });

  it("reports a missing required parameter as a warning", () => {
    const e = evaluateAgainstProfile(profile(), { ClearSpan: 2000 });
    expect(e.boundViolations.some((v) => v.kind === "missing")).toBe(true);
  });

  it("skips a rule whose parameters are absent rather than failing it", () => {
    const e = evaluateAgainstProfile(profile(), { WallThickness: 350 });
    // ClearSpan/ClearHeight are missing, so the aspect rule cannot run — and it
    // must not be reported as a violation.
    expect(e.standardsViolations).toHaveLength(0);
  });
});

describe("Profile parsing rejects malformed data loudly", () => {
  it("rejects a non-object", () => {
    expect(() => parseStandardsProfile(null)).toThrow();
    expect(() => parseStandardsProfile("nope")).toThrow();
  });

  it("rejects a missing id or revision", () => {
    expect(() => parseStandardsProfile({ revision: "1" })).toThrow(/Missing 'id'/);
    expect(() => parseStandardsProfile({ id: "X" })).toThrow(/revision/);
  });

  it("rejects an inverted bound", () => {
    expect(() =>
      parseStandardsProfile({
        id: "X",
        revision: "1",
        parameterBounds: { A: { min: 100, max: 10, note: "", codeRef: "" } },
      })
    ).toThrow(/exceeds max/);
  });
});

describe("Registry", () => {
  it("registers, retrieves, and lists profiles", () => {
    const reg = new StandardsProfileRegistry();
    const p = reg.register(JSON.parse(readFileSync(join(ROOT, "standards", "profiles", "rdso_culvert.json"), "utf8")));
    expect(reg.has(p.id)).toBe(true);
    expect(reg.get(p.id)!.id).toBe("RDSO_CULVERT");
    expect(reg.list()).toHaveLength(1);
  });

  it("lists profiles still awaiting human clause verification", () => {
    const reg = new StandardsProfileRegistry();
    for (const n of ["rdso_culvert.json", "irc_structural.json"]) {
      reg.register(JSON.parse(readFileSync(join(ROOT, "standards", "profiles", n), "utf8")));
    }
    expect(reg.unverified()).toHaveLength(2);
  });
});
