/**
 * The guardrails must actually guard.
 * UPCE-MASTER-1.0 §17, §2.5, §84 — and the implementation brief's non-negotiable
 * constraints 4, 5 and 10, each of which requires a rule that FAILS THE BUILD,
 * not one that logs and exits 0.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runLint } from "../../scripts/lint-tolerance";

const ROOT = join(import.meta.dir, "..", "..");

describe("Tolerance lint (§17, non-negotiable 4)", () => {
  it("reports no unexempted violations in lib/", () => {
    expect(runLint()).toEqual([]);
  });

  it("exits non-zero on a violation — the rule must break the build", () => {
    const src = readFileSync(join(ROOT, "scripts", "lint-tolerance.ts"), "utf8");
    expect(src).toContain("process.exit(1)");
    // The Phase 0 "log and pass" behaviour must be gone.
    expect(src).not.toContain("Phase 0 Tolerance Lint completed");
  });

  it("requires every exemption to carry a written justification", () => {
    const src = readFileSync(join(ROOT, "scripts", "lint-tolerance.ts"), "utf8");
    const block = src.slice(src.indexOf("const EXEMPTIONS"), src.indexOf("function isExempt"));
    const files = [...block.matchAll(/file:\s*"([^"]+)"/g)];
    // Count only reasons that actually carry text, not the type declaration.
    const reasons = [...block.matchAll(/reason:\s*\n?\s*"/g)];
    expect(files.length).toBeGreaterThan(0);
    expect(reasons.length).toBe(files.length);
    // And every reason must say something, not just exist.
    for (const [, reason] of block.matchAll(/reason:\s*\n?\s*"([^"]+)"/g)) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("keys exemptions on file + source line, so they cannot drift onto another constant", () => {
    const src = readFileSync(join(ROOT, "scripts", "lint-tolerance.ts"), "utf8");
    expect(src).toContain("snippet: string");
    expect(src).not.toMatch(/EXEMPTIONS[\s\S]{0,400}line:\s*\d+/);
  });
});

describe("No tolerance is expressed in pixels (§17)", () => {
  it("the connected-geometry solver injects its weld radius from the policy", () => {
    const src = readFileSync(
      join(ROOT, "lib", "parametric", "connectedComponentSolver.ts"),
      "utf8"
    );
    expect(src).toContain("policy.weld_mm");
    // The pixel-denominated constant is gone.
    expect(src).not.toContain("world px");
    expect(src).not.toMatch(/const\s+TOLERANCE\s*=\s*15/);
  });

  it("no source file in lib/ declares a tolerance in pixels", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
          const src = readFileSync(full, "utf8");
          if (/(?:tolerance|weld|epsilon)[^\n]{0,60}\b(?:px|pixels?)\b/i.test(src)) {
            offenders.push(full);
          }
        }
      }
    };
    walk(join(ROOT, "lib"));
    expect(offenders).toEqual([]);
  });
});

describe("No conformal scaling on the solve path (§8)", () => {
  it("the connected-geometry solver contains no scale factor", () => {
    const src = readFileSync(
      join(ROOT, "lib", "parametric", "connectedComponentSolver.ts"),
      "utf8"
    );
    // The banned formula k = L_target / L_original, in any of its old spellings.
    expect(src).not.toMatch(/singleScale/);
    expect(src).not.toMatch(/targetLen\s*\/\s*(?:edge\.)?origLen/);
    expect(src).not.toMatch(/Proportional Conformal Scaling/);
  });

  it("it solves variationally with analytical partials and a warm start", () => {
    const src = readFileSync(
      join(ROOT, "lib", "parametric", "connectedComponentSolver.ts"),
      "utf8"
    );
    expect(src).toContain("solveDogleg");
    expect(src).toContain("evaluateJacobian");
    // §18 anchor rule is applied.
    expect(src).toContain("anchorVertexId");
  });
});

describe("License scan (§84, non-negotiable 10)", () => {
  it("fails the build on a banned GPL/AGPL package", () => {
    const src = readFileSync(join(ROOT, "scripts", "license-scan.ts"), "utf8");
    expect(src).toContain("process.exit(1)");
    for (const banned of ["py-slvs", "solvespace", "pymupdf"]) {
      expect(src.toLowerCase()).toContain(banned);
    }
  });

  it("declares no banned dependency in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).map((d) =>
      d.toLowerCase()
    );
    for (const banned of ["py-slvs", "python-solvespace", "pymupdf", "fitz", "libredwg"]) {
      expect(deps).not.toContain(banned);
    }
  });
});
