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
            // Check if it's not a legacy exception or test
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
    process.exit(0);
  } else {
    console.warn(`Found ${violations.length} lint warnings/violations:`);
    for (const v of violations) {
      console.warn(`  [${v.rule}] ${v.file}:${v.line} - ${v.message}`);
      console.warn(`    --> ${v.snippet}`);
    }
    // During Phase 0, report violations
    console.log(`Phase 0 Tolerance Lint completed with ${violations.length} logged items.`);
    process.exit(0);
  }
}
