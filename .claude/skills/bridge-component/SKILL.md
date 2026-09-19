---
name: bridge-component
description: Add or change a parametric bridge/culvert drawing view (a ComponentDefinition in lib/components/library), make it look like an Indian Railways GAD, cite the formula docs, teach the drafting agent about it, and verify it visually. Use when asked to add a bridge type, reproduce a reference GAD drawing, or fix how a component draws.
---

# Adding or changing a bridge component

Components are DATA (`lib/components/library/*.ts`): every coordinate is an expression of named values in the local frame (mm, Y up; for views at true levels local Y = RL × 1000). The engine (`lib/components/evaluate.ts`) has no bridge vocabulary; never add structure-specific code there. Read CLAUDE.md §2.7–2.12 first.

## 1. Read the source of truth
- The formula docs: `docs/bridge-formulas/*.txt` (ids like RCR-GEO-001). Search them: `bun -e 'import {searchKnowledge,formatEntry} from "@/lib/bridge/knowledge"; for (const e of searchKnowledge("earth cushion", 4)) console.log(formatEntry(e))'`.
- If the user's other app is available, the original renderer lives in `/Users/proximus/Documents/Aagento Systems/aagento-bridge/src/app/features/bridges/utils/…` (e.g. `rcc-box-railway/rcc-box-half-section-view.ts`). Port its GEOMETRY and LAYOUT as expressions; do not port its hard-coded pixel offsets or its inconsistencies (use the documented level chain).

## 2. Write the definition
- `parameters` (with `group`, `min`/`max`, `sourceRequired` for design values, `defaultExpr` for values that normally follow others), `tables` for list values (layers, spans), `formulas` (helpers + `report: true` results, each with `cites: [ids]`), `primitives` (loops/paths/circles; `draw: false` for hatch-only boundaries), `hatches`, `dimensions` (`drives` the value it shows; `prefix`, `hideValue`), `levels` (`style: "gad"`), `leaders` (`placement: "above"`), `texts` (`along` for slope text), `invariants` (errors for impossible geometry; warnings with `source` for code/reference limits, message says "requires review"), `facts` for the audit, `drawingScale` for its usual scale.
- Use `min`/`max`/`if`/`gt` in expressions so shapes morph cleanly (consecutive duplicate points are dropped). Guard anything that can collapse with `when`.
- Annotation placement reads `TXT`, `DIM`, `SCALE`; geometry must not.
- Register it in `lib/components/library/index.ts`.

## 3. Look at it — every time
```bash
bun run scripts/dev/render-component.ts <id> /tmp/v.svg Name=value …   # prints issues and reported values
bun run scripts/dev/svg-to-png.ts /tmp/v.svg /tmp/v.png 1800             # then Read the PNG
bun run scripts/dev/roundtrip.ts <id>                                     # explode + Make parametric must reproduce it
bun run scripts/dev/agent-view.ts <id> /tmp/a.png                         # what the agent sees
```
Compare with the reference drawing: levels written on their lines, section half hatched, elevation half hidden below ground, callouts on shelves, V.C./F.B., ℄, title and scale.

## 4. Test
Add `tests/unit/<name>.test.ts`: defaults evaluate with no errors and reproduce the reference numbers; the documented chain holds for other values; morphs (e.g. RCR-CUT-007) behave; relationships/auto values; unique ids (the library-wide test in `components_engine.test.ts` runs automatically). `tests/unit/bridge_knowledge.test.ts` checks every `cites` id exists.

## 5. Teach the agent
Add or update a playbook in `lib/agent/drafter/skills.ts` (what the view contains, how to read a reference drawing into values, route A component / route B by hand + make_parametric). Formula ids it mentions must exist (tested).

## 6. Verify
`bun run test`, `bun run lint:tolerance`, `bun run license:scan`, `bun run build`; after editing the docs, `bun run knowledge:build`. Check it live: Parametric › Component, insert, change values, Author › Component relationships.
