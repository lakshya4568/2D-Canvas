import fs from "node:fs";
import path from "node:path";

export interface LicenseScanResult {
  passed: boolean;
  bannedPackagesFound: string[];
  bannedLicensesFound: { pkg: string; license: string }[];
  scannedPackagesCount: number;
}

export const BANNED_PACKAGE_NAMES = [
  "py-slvs",
  "python-solvespace",
  "solvespace",
  "cad_sketcher",
  "cad-sketcher",
  "pymupdf",
  "fitz",
  "libredwg",
  "libdxfrw",
  "freecad-stubs",
  "jsketcher",
];

export const BANNED_LICENSE_PATTERNS = [
  /^GPL/i,
  /^AGPL/i,
  /GNU General Public License v3/i,
  /GNU Affero General Public License/i,
];

export function scanDependencies(packageJsonPath?: string): LicenseScanResult {
  const rootDir = path.resolve(__dirname, "..");
  const pkgPath = packageJsonPath || path.join(rootDir, "package.json");
  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  const allDeps: Record<string, string> = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
    ...(pkgJson.peerDependencies || {}),
  };

  const bannedPackagesFound: string[] = [];
  const bannedLicensesFound: { pkg: string; license: string }[] = [];
  let scannedCount = 0;

  for (const dep of Object.keys(allDeps)) {
    scannedCount++;
    const lowerDep = dep.toLowerCase();

    // Check banned package name
    if (BANNED_PACKAGE_NAMES.some((banned) => lowerDep.includes(banned))) {
      bannedPackagesFound.push(dep);
    }

    // Check installed package.json license if available in node_modules
    const depPkgPath = path.join(rootDir, "node_modules", dep, "package.json");
    if (fs.existsSync(depPkgPath)) {
      try {
        const depPkg = JSON.parse(fs.readFileSync(depPkgPath, "utf-8"));
        const lic = typeof depPkg.license === "string" ? depPkg.license : (depPkg.license?.type || "");
        if (lic) {
          // Note: LGPL is permitted per §84 for PlaneGCS
          const isLgpl = /^LGPL/i.test(lic) || lic.includes("Lesser General Public License");
          if (!isLgpl) {
            for (const pattern of BANNED_LICENSE_PATTERNS) {
              if (pattern.test(lic)) {
                bannedLicensesFound.push({ pkg: dep, license: lic });
                break;
              }
            }
          }
        }
      } catch {
        // Ignore read errors for optional or platform-specific packages
      }
    }
  }

  const passed = bannedPackagesFound.length === 0 && bannedLicensesFound.length === 0;

  return {
    passed,
    bannedPackagesFound,
    bannedLicensesFound,
    scannedPackagesCount: scannedCount,
  };
}

if (require.main === module || (typeof Bun !== "undefined" && Bun.main === import.meta.path)) {
  console.log("Running CI Dependency License Scan (UPCE-MASTER-1.0 §2.10, §84)...");
  const result = scanDependencies();

  console.log(`Scanned ${result.scannedPackagesCount} declared dependencies.`);
  if (result.passed) {
    console.log("✓ License scan passed: 0 banned GPL/AGPL packages found.");
    process.exit(0);
  } else {
    console.error("✗ License scan FAILED: Banned GPL/AGPL packages or licenses detected!");
    if (result.bannedPackagesFound.length > 0) {
      console.error("  Banned packages:", result.bannedPackagesFound);
    }
    if (result.bannedLicensesFound.length > 0) {
      console.error("  Banned licenses:", result.bannedLicensesFound);
    }
    process.exit(1);
  }
}
