import { describe, it, expect } from "vitest";
import { scanDependencies, BANNED_PACKAGE_NAMES } from "../../scripts/license-scan";

describe("CI Dependency License Scanner (§2.10 & §84)", () => {
  it("confirms current codebase dependencies pass the license scan", () => {
    const result = scanDependencies();
    expect(result.scannedPackagesCount).toBeGreaterThan(15);
    expect(result.bannedPackagesFound).toEqual([]);
    expect(result.bannedLicensesFound).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("identifies banned GPL/AGPL packages in ban list", () => {
    expect(BANNED_PACKAGE_NAMES).toContain("py-slvs");
    expect(BANNED_PACKAGE_NAMES).toContain("solvespace");
    expect(BANNED_PACKAGE_NAMES).toContain("cad_sketcher");
    expect(BANNED_PACKAGE_NAMES).toContain("pymupdf");
    expect(BANNED_PACKAGE_NAMES).toContain("libredwg");
    expect(BANNED_PACKAGE_NAMES).toContain("freecad-stubs");
    expect(BANNED_PACKAGE_NAMES).toContain("jsketcher");
  });
});
