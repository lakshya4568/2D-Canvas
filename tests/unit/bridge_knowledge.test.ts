/**
 * The bridge formula documentation: the bundle the agent searches is the
 * docs folder, the parser finds formulas, checks, glossary and Q&A, and every
 * formula id a component cites exists in the documentation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readCorpus, renderCorpus } from "../../scripts/build-bridge-knowledge";
import { findKnowledge, knowledgeEntries, searchKnowledge } from "@/lib/bridge/knowledge";
import { COMPONENT_LIBRARY } from "@/lib/components/library";
import { DRAFTING_SKILLS } from "@/lib/agent/drafter/skills";

describe("bridge knowledge", () => {
  it("the bundle matches docs/bridge-formulas (run `bun run knowledge:build` after editing the docs)", () => {
    const root = process.cwd();
    const expected = renderCorpus(readCorpus(root));
    const actual = readFileSync(path.join(root, "lib/bridge/knowledge/corpus.generated.ts"), "utf8");
    expect(actual).toBe(expected);
  });

  it("parses formulas, checks, glossary rows and Q&A", () => {
    const all = knowledgeEntries();
    const count = (k: string) => all.filter((e) => e.kind === k).length;
    expect(count("formula")).toBeGreaterThan(100);
    expect(count("check")).toBeGreaterThan(30);
    expect(count("glossary")).toBeGreaterThan(100);
    expect(count("qa")).toBeGreaterThan(10);
    expect(findKnowledge("RCR-GEO-001")!.body).toMatch(/total_w = \(cW \* cells\) \+ \(tOW \* 2\) \+ \(tIW \* \(cells - 1\)\)/);
    expect(findKnowledge("RCR-VAL-007")!.body).toMatch(/earth_cushion >= 0\.075m/);
  });

  it("finds the right formula from plain words", () => {
    expect(searchKnowledge("earth cushion railway", 3).map((e) => e.id)).toContain("RCR-LVL-002");
    expect(searchKnowledge("minimum slab thickness psc", 3).map((e) => e.id)).toContain("PSC-SLAB-005");
    expect(searchKnowledge("pier cap width", 3).map((e) => e.id)).toContain("PSC-GEO-004");
  });

  it("every formula a component cites is in the documentation", () => {
    for (const d of COMPONENT_LIBRARY)
      for (const f of d.formulas ?? [])
        for (const id of f.cites ?? []) expect(findKnowledge(id), `${d.id}.${f.name} cites ${id}`).toBeTruthy();
  });

  it("every formula id a skill mentions is in the documentation", () => {
    for (const s of DRAFTING_SKILLS) {
      for (const m of s.body.matchAll(/\b([A-Z]{2,4}-(?:GEO|LVL|VAL|SLAB|STR|CUT|CELL|DRAW|EARTH|FND|DAG|IDX|EXPR|SYNC|VIS|REP)-\d{3})\b/g)) {
        expect(findKnowledge(m[1]), `${s.name} mentions ${m[1]}`).toBeTruthy();
      }
    }
  });
});
