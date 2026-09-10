import fs from "node:fs";
import path from "node:path";

interface LintViolation {
  file: string;
  line: number;
  rule: string;
  message: string;
  snippet: string;
}

const BANNED_TOLERANCE_PATTERNS = [
  /const\s+(?:[A-Z0-9_]*TOLERANCE|EPSILON|EPS)\s*=\s*[\d.]+/i,
  /let\s+(?:[A-Z0-9_]*TOLERANCE|EPSILON|EPS)\s*=\s*[\d.]+/i,
  /tolerance\s*:\s*[\d.]+\s*(?:\/\/\s*px|\/\*\s*px)/i,
];

const SHAPE_BRANCH_PATTERN = /if\s*\(\s*(?:shape|s|child|cand)\.type\s*===\s*['"`](?:rectangle|circle|polygon|arc)['"`]\s*\)/;

/**
 * Narrow, justified exemptions.
 *
 * §17 governs MODEL-SPACE tolerances — distances and angles compared against
 * real-world geometry. It does not govern numerical-algorithm constants such as
 * a machine epsilon or a finite-difference step, which are dimensionless
 * properties of the arithmetic, not of the drawing.
 *
 * Every entry MUST carry a reason. An exemption without one is itself a failure.
 */
const EXEMPTIONS: { file: string; snippet: string; reason: string }[] = [
  {
    file: "lib/solver/matrix/svd.ts",
    snippet: "const eps = 1e-15;",
    reason:
      "Machine epsilon for the implicit-QR bidiagonal convergence test, scaled " +
      "by ‖A‖. A property of double-precision arithmetic, not a model tolerance.",
  },
  {
    file: "lib/parametric/variationalKernel.ts",
    snippet: "const eps = 1e-6;",
    reason:
      "Forward-difference step size in state-vector units for the reference " +
      "variational kernel (test-only oracle). Not a model-space tolerance.",
  },
];

/**
 * Matched on file + exact trimmed source line, so an exemption cannot drift onto
 * a different constant when the file is edited above it.
 */
function isExempt(file: string, snippet: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return EXEMPTIONS.some((e) => e.file === normalized && e.snippet === snippet.trim());
}

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== ".next" && entry.name !== "dist") {
        scanDirectory(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function runLint(): LintViolation[] {
  const rootDir = path.resolve(__dirname, "..");
  const libDir = path.join(rootDir, "lib");
  const files = scanDirectory(libDir);
  const violations: LintViolation[] = [];

  for (const filePath of files) {
    const relPath = path.relative(rootDir, filePath);
    // tolerance.ts is the ONLY authoritative source defining tolerances
    if (relPath.replace(/\\/g, "/") === "lib/geometry/tolerance.ts") {
      continue;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Rule 4: One tolerance policy object, injected. No module defines its own.
      // Skip comments or legacy files explicitly permitted during Phase 0
      if (!line.trim().startsWith("//") && !line.trim().startsWith("/*")) {
        for (const pattern of BANNED_TOLERANCE_PATTERNS) {
          if (pattern.test(line)) {
            if (isExempt(relPath, line)) break;
            violations.push({
              file: relPath,
              line: i + 1,
              rule: "TOLERANCE_INJECTION_REQUIRED",
              message: `Locally defined tolerance constant detected. Tolerances MUST be injected via TolerancePolicy from lib/geometry/tolerance.ts (UPCE-MASTER-1.0 §2.4, §17).`,
              snippet: line.trim(),
            });
          }
        }
      }

      // Rule 5: No shape-type branching in detection or inference (lib/inference/ or lib/geometry/predicates)
      if (relPath.includes("lib/inference") || relPath.includes("lib/geometry/predicates")) {
        if (SHAPE_BRANCH_PATTERN.test(line)) {
          violations.push({
            file: relPath,
            line: i + 1,
            rule: "NO_SHAPE_TYPE_BRANCHING",
            message: `Shape-type branching 'if (shape.type === ...)' is banned in inference and detection paths (UPCE-MASTER-1.0 §2.5).`,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  return violations;
}

if (require.main === module || (typeof Bun !== "undefined" && Bun.main === import.meta.path)) {
  console.log("Scanning codebase for tolerance discipline and shape-type branching violations...");
  const violations = runLint();

  if (violations.length === 0) {
    console.log("✓ Lint passed: No locally defined tolerance constants or illegal shape-type branching found.");
    if (EXEMPTIONS.length > 0) {
      console.log(`  (${EXEMPTIONS.length} justified exemption(s) on file — see EXEMPTIONS in this script.)`);
    }
    process.exit(0);
  }

  console.error(`✗ Lint FAILED with ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line} - ${v.message}`);
    console.error(`    --> ${v.snippet}`);
  }
  console.error(
    "\nTolerances MUST come from the single injected TolerancePolicy " +
      "(lib/geometry/tolerance.ts). If a constant is a numerical-algorithm " +
      "epsilon rather than a model-space tolerance, add a JUSTIFIED entry to " +
      "EXEMPTIONS in scripts/lint-tolerance.ts."
  );
  // The implementation brief requires this rule to FAIL the build (§17,
  // non-negotiable constraint 4). It previously exited 0 and only logged.
  process.exit(1);
}
