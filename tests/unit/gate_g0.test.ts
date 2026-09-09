import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";
import { scanDependencies } from "../../scripts/license-scan";

describe("Gate G0 Acceptance Suite: Foundation & Document Model (§76 & §86)", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const fixturesDir = path.join(rootDir, "fixtures");

  const categories = ["basic", "civil", "difficult"];

  it("validates that all 38 fixtures parse cleanly and conform to the canonical ParametricSketch structure", () => {
    let totalFixtures = 0;

    for (const cat of categories) {
      const catDir = path.join(fixturesDir, cat);
      const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".json"));
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        totalFixtures++;
        const filePath = path.join(catDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const sketch = JSON.parse(content);

        // Required root fields per canonical schema
        expect(sketch.schemaVersion).toBe("1.0");
        expect(typeof sketch.sketchId).toBe("string");
        expect(sketch.units).toBeDefined();
        expect(sketch.units.length).toBe("mm");
        expect(sketch.tolerances).toBeDefined();
        expect(sketch.tolerances.units).toBe("mm");
        expect(sketch.tolerances.weld_mm).toBe(DEFAULT_TOLERANCE_POLICY.weld_mm);
        expect(sketch.tolerances.geometry_mm).toBe(DEFAULT_TOLERANCE_POLICY.geometry_mm);
        expect(sketch.tolerances.solver_residual).toBe(DEFAULT_TOLERANCE_POLICY.solver_residual);

        // Primitives must be uniform dictionary representation without shape-type switches
        expect(sketch.primitives).toBeDefined();
        expect(sketch.primitives.points).toBeDefined();
        expect(sketch.primitives.lines).toBeDefined();

        // Parameter roles must be valid
        if (sketch.parameters) {
          for (const param of Object.values(sketch.parameters) as any[]) {
            expect(["DRIVING", "DERIVED", "FIXED", "MEASURED"]).toContain(param.role);
            expect(["LENGTH", "ANGLE", "COUNT", "RATIO", "BOOLEAN"]).toContain(param.type);
            expect(typeof param.value).toBe("number");
          }
        }

        // Constraints must be uniform
        if (sketch.constraints) {
          for (const constraint of Object.values(sketch.constraints) as any[]) {
            expect(typeof constraint.type).toBe("string");
            expect(Array.isArray(constraint.entities)).toBe(true);
            expect(["fixed", "driving", "hard", "soft", "reference", "temporary"]).toContain(constraint.strength);
          }
        }
      }
    }

    expect(totalFixtures).toBe(38);
  });

  it("verifies the license gate against §84 ban list", () => {
    const licResult = scanDependencies();
    expect(licResult.passed).toBe(true);
    expect(licResult.bannedPackagesFound).toEqual([]);
    expect(licResult.bannedLicensesFound).toEqual([]);
  });

  it("verifies that anchor rule (§18) holds: every sketch fixes >= 1 entity or origin", () => {
    for (const cat of categories) {
      const catDir = path.join(fixturesDir, cat);
      const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".json"));

      for (const file of files) {
        const filePath = path.join(catDir, file);
        const sketch = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const points = Object.values(sketch.primitives.points || {}) as any[];

        const hasFixedPoint = points.some((p) => p.fixed === true);
        const hasFixedConstraint = Object.values(sketch.constraints || {}).some(
          (c: any) => c.type === "FIXED" || c.strength === "fixed"
        );

        expect(
          hasFixedPoint || hasFixedConstraint,
          `Fixture ${cat}/${file} violates anchor rule: must fix >= 1 entity or LCS origin`
        ).toBe(true);
      }
    }
  });
});
