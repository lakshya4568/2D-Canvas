# Closing the Formula Gap: A Verified Architecture for Author Mode, Dimension-Badge Constraints, and Generalized Templates

*A fourth document, written against your actual code — not a fourth restatement of the same idea.*

---

## 0. How this fits with what you already have

You now have three prior documents that all converge on the same design intent from different angles:

| Document | What it nailed | What it couldn't verify |
|---|---|---|
| **Kernel Architecture PDF** (Gemini) | The math: DCEL, residuals, Jacobians, LM/SVD, DOF via `2V−C` | Never touches your actual files — pure theory |
| **Engine Blueprint PDF** (Gemini) | The PRD, Dulmage–Mendelsohn + Dogleg, a `TemplateDefinition` schema, real TS classes | Also theory — well-designed, but not checked against code |
| **AutoFormula transcript + 2D-Canvas PRD** (Perplexity) | Ties everything to *real* file names (`model.ts`, `dualGraphOrchestrator.ts`, `gadAssemblyEngine.ts`…), found a real substring-matching bug, proposed the Author/Draftsman split, surfaced `@salusoft89/planegcs` | Explicitly disclaimed it: *"the GitHub connector lets me list the branch and directory tree… but it downloads file contents without exposing the text to me"* — so its code-level claims were inference from your deep-dive doc, not the code itself |

Your "Main fix" prompt is essentially the correct one-paragraph summary of where all three documents were already pointing. So instead of writing a fifth version of the same target picture, I cloned `github.com/lakshya4568/2D-Canvas` — both `main` and `parametric_formulation` — and read the files myself. This document is organized around what that actually showed, because several "already wired" claims turned out to be false, and the real gap is narrower and more specific than any of the three documents could tell you.

Everything in **Section 1** is a direct file/line finding, not a summary of a summary. Everything after that is the fix.

---

## 1. Verified diagnosis: what your code actually does today

Branch `parametric_formulation` has essentially every subsystem the "Main fix" prompt asks for. It also has a second, mostly-empty subsystem (`main`) that none of this has been merged into. Here is what's real, what's a stub, and what's orphaned:

| Piece | File | Verified state |
|---|---|---|
| Dimension badges | `features/canvas/DimensionBadge.tsx` | **Read-only.** `React.memo`, `pointer-events-none`, `select-none`. It computes `lineMetrics()` and renders a `<text>` label. There is no click handler, no input, no `onChange` — nothing to edit. Used in exactly two places: `DraftPreview.tsx` (only while actively drawing a *new* shape) and imported into `ShapeRenderer.tsx`. **A draftsman cannot edit a dimension by clicking on it anywhere in the app today.** |
| DAG dependency extraction | `lib/parametric/dualGraphOrchestrator.ts`, `preSolveDAGPass()` | The substring bug is real and current: `if (other.name !== dep.name && dep.formula.includes(other.name))`. A parameter named `W` will register as a dependency of any formula that merely contains the *letters* `W` inside a longer name like `WallThickness`. |
| Admissibility / over-constraint filtering | `lib/inference/admissibilityFilter.ts` | The math is **correct** — real SVD row-space projection, matching the `P = ∇fₖ·(I − J⁺J)` test from the Kernel PDF. But `grep` across the whole repo shows `isConstraintAdmissible` is called from exactly one place: its own unit test. It is not called from any inference or solve path. **Dead code that happens to be right.** |
| Incremental/BFS subgraph solving | `lib/parametric/graph/bfsPartition.ts` | `extractConnectedSubgraphsBFS` exists and is correct, but its only callers are `dualGraphOrchestrator.ts` (itself unused, see below) and its own test. |
| Bipartite constraint graph / DOF | `lib/parametric/graph/bipartiteGraph.ts` | This is **not** a Dulmage–Mendelsohn decomposition, despite the filename and despite `tests/unit/bipartite_partition.test.ts` existing. `calculateDegreesOfFreedom()` does: `const planarRigidMotions = 3; return Math.max(0, totalDof − totalEquations − planarRigidMotions)`. That's one global scalar for the *entire* graph — no matching, no partition into under/well/over-constrained subsets, no identification of *which* constraint conflicts. It also has a real bug: it subtracts 3 rigid-motion DOF once, globally, even when an assembly has several disconnected components or an anchored (fixed) origin — both cases where subtracting 3 is wrong. |
| Parameter roles (DRIVING/DEPENDENT/FIXED) | `lib/parametric/parameterManager.ts` | Clean, correct, exactly as documented. But wiring check shows `ParameterManager` and `DualGraphOrchestrator` are instantiated only inside `tests/unit/parametric_dag.test.ts`. **The entire clean DAG/parameter layer is not connected to the live app or the reducer.** It sits next to the app, not inside it. |
| Component templates | `lib/parametric/templates/rccBridgeTemplate.ts` | `generateRCCBridgeAssembly()` is a plain function that computes absolute coordinates with hardcoded arithmetic (`centerX = 500`, `deckTopY = 200`, `cellWidth = (p.deckWidth − 4*p.wallThickness) / 2`, …) and returns a flat `Shape[]`. It does not use `ParameterManager`, `ConstraintGraph`, DRIVING/DERIVED roles, or the `TemplateDefinition` shape sketched in every one of your three prior documents. It is **exactly "Path A — hardcoded renderer"** from your own "why" document, freshly rewritten, for a bridge type none of your other tooling knows about. Zero call sites reference it outside its own file — `TemplateModal.tsx` instead imports `BUILTIN_TEMPLATES` from the older, separate `lib/parametric/templates.ts`. |
| Working anisotropic solve | `lib/state/presets/singleCellCulvert.ts` | `SingleCellCulvertModel` genuinely calls `solveLevenbergMarquardt()` with a real `SystemModel`/Jacobian — this is a working, tested, correct anisotropic culvert solve. But `clearSpan`, `clearHeight`, `wallThickness`, `haunchLeg` are hardcoded fields on a hand-written TypeScript class, not data in a template a non-programmer could author. |
| Hardcoded resolvers | `lib/parametric/model.ts` (955 lines, 7 `switch` blocks) | Magic-string case labels are real and current: `"culvert_inner_top"`, `"culvert_haunch_tr"`, `"culvert_inner_right"`, `"culvert_haunch_br"`, `"culvert_inner_bottom"`, `"culvert_haunch_bl"`, `"culvert_inner_left"`, `"culvert_haunch_tl"`, `"b1_top"`, `"b1_haunch_tr"`, `"b1_right"`, `"b1_haunch_br"` and more. Every one of these is a bespoke resolver for one specific drawing pattern. |
| `main` branch | — | Has none of the above. No `lib/inference`, no `lib/solver`, no `parameterManager.ts`, no `dualGraphOrchestrator.ts`, no `gadAssemblyEngine.ts`, no `boundaryLimits.ts`. All of the sophisticated work lives only on `parametric_formulation` and has not been merged. |

**The one-line diagnosis:** you have built almost everything "Main fix" asks for — a DAG, a constraint graph, an admissibility filter, incremental BFS solving, a real LM solver, an LCS/affine-frame system, a DCEL topology layer — and connected almost none of it to anything else, including the canvas. The 2D-Canvas prototype doesn't have five competing engines fighting for control so much as it has one working engine (`model.ts` + the culvert/GAD path) and several correct, unused engines parked next to it. That reframes the fix: this is much less "build new math" and much more "wire four already-correct pieces to each other and to the badge the draftsman actually clicks."

*(I did not fully read `gadAssemblyEngine.ts` (836 lines) or all 955 lines of `model.ts` — the switch-statement finding above is from a targeted grep, not a full read. I also could not check the separate production CAD described in the AutoFormula transcript — `template.schema.ts`, `binding-suggestion.service.ts`, the `template-bind-field.tool.ts` AI tools — because that codebase isn't on GitHub; Section 7 below is design-level for that half, not verified-against-code the way Section 1–6 are for 2D-Canvas.)*

---

## 2. The decision you need to stop re-deriving: one solver contract

Right now there are three different solver recommendations sitting in your documents, and none has been chosen:

- **What's built:** a GAD delta heuristic → proportional/conformal scaling → Gauss-Seidel/LM chain, run in priority order in `model.ts`. Proportional scaling is provably wrong for your use case — it scales wall thickness when a span changes, which directly violates the anisotropic invariant every one of your documents states as non-negotiable.
- **Kernel Blueprint PDF's answer:** hand-build a Dulmage–Mendelsohn (Hopcroft-Karp) classifier and a Powell's Dogleg trust-region solver from scratch.
- **AutoFormula transcript's answer:** adopt `@salusoft89/planegcs` — FreeCAD's actual production solver, ported to WebAssembly with full TypeScript types.

I checked `@salusoft89/planegcs` directly: it's real, current (v1.1.7), actively maintained, LGPL-2.0-or-later licensed, and solves via DogLeg (default), Levenberg-Marquardt, BFGS, or SQP. Two details matter a lot for you specifically:

- Every constraint carries a **`driving`** flag. Set `false` and it becomes a pure measurement that never influences the solve — this *is* your DRIVING vs. DERIVED/MEASURED distinction, already built and battle-tested inside FreeCAD's Sketcher, for free.
- Every constraint also carries a **`temporary`** flag, explicitly designed for live mouse-dragging: it's enforced only so far as it doesn't fight other constraints, and it doesn't reduce DOF. This is the exact problem your proportional-scaling hack was trying to solve for interactive drag preview — solved properly, off the shelf.

(License note, not legal advice: LGPL generally permits use as an unmodified dependency inside closed-source products; if you fork/modify planegcs itself, that fork's changes need to stay LGPL. Get this confirmed by whoever handles your IP before shipping — I'm flagging the shape of the constraint, not clearing it.)

**Recommendation — don't rebuild, don't fully replace, layer:**

```
┌──────────────────────────────────────────────────────────────┐
│  DOMAIN LAYER (yours — keep)                                  │
│  DCEL welding · haunch/wall inference · GAD assembly ·        │
│  RDSO-specific residuals · anisotropic bay spanning           │
└───────────────────────────┬────────────────────────────────────┘
                             │ compiles to generic JSON
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  NUMERIC CORE — adopt planegcs                                 │
│  Points / lines / circles / arcs + generic constraints         │
│  DogLeg / LM / BFGS · driving flag · temporary flag for drag   │
└──────────────────────────────────────────────────────────────┘
```

This is the option the AutoFormula transcript floated ("keep your kernel for the inference/GAD layer and let planegcs handle the numerical core") but never committed to. Commit to it: your haunch-leg-equality and anisotropic-bay residuals are domain knowledge planegcs doesn't have and shouldn't need to; generic distance/parallel/perpendicular/coincident solving is exactly what planegcs already does better than a hand-rolled Gauss-Seidel relaxer that stalls on conflicting constraints.

**For DOF diagnosis, don't adopt planegcs's DOF count wholesale either — build the real Dulmage–Mendelsohn decomposition on top of the adjacency structure you already have.** `BipartiteConstraintGraph` already stores `entityToConstraints` and `constraintToEntities` — that *is* the bipartite graph. What's missing is a Hopcroft-Karp maximum-matching pass over it, partitioning entities/constraints into under-constrained, well-constrained, and over-constrained blocks (and fixing the global-vs-per-component rigid-motion bug at the same time — subtract 3 once *per connected component*, not once for the whole graph). This isn't hypothetical rigor: FreeCAD's own Sketcher — the reference implementation everyone here is measuring against — has multiple open, confirmed issues (`FreeCAD/FreeCAD#15850`, `#6174`, `#8324`) where naive DOF counting reports "fully constrained" on sketches that visibly still move, and its redundant-constraint detector uses what its own docs call a "popularity contest" heuristic to guess which of several redundant constraints to flag. DM decomposition is the standard fix for exactly this failure mode in the constraint-solving literature (it's what Pyomo and JuMP use to debug over/under-determined nonlinear systems) — a hand-rolled scalar count would just be re-discovering FreeCAD's bug on a smaller graph.

| Decision | Verdict |
|---|---|
| GAD heuristic solver | Keep, but demote to a warm-start predictor only (fast `X₀`, never the final answer) |
| Proportional/conformal scaling | **Delete from the solve path.** Keep only as a non-authoritative drag preview, never committed |
| Gauss-Seidel relaxation | Keep as a cheap first pass for small/simple sketches; not the answer for conflicting constraints |
| Hand-rolled LM/SVD kernel (`levenbergMarquardt.ts`) | Keep for haunch/anisotropic residuals your own code already solves correctly (`SingleCellCulvertModel`); don't throw this away |
| `bipartiteGraph.ts` scalar DOF | Replace with real DM decomposition, fix the per-component rigid-motion bug |
| planegcs | Adopt as the generic numeric core behind a thin interface, spiked first against your two hardest cases (single-cell culvert, two-span culvert) before any wider commitment |
| `admissibilityFilter.ts` | Keep — it's correct — but actually call it from the AutoFormula/inference pipeline (Section 5) |

---

## 3. Dimension badges as first-class constraints — the actual missing wire

Since `DimensionBadge.tsx` is read-only right now, "treat dimension badges as first-class constraints" isn't a refinement of existing behavior — it's the single highest-leverage feature that doesn't exist yet. This is also exactly what the AutoFormula transcript ranked priority #1: *"Dimension-constraint UX over your existing solver — highest impact, no new math needed."* Verified: still true, still unbuilt.

**The state machine a badge needs:**

```
 DISPLAY (current state — read only)
    │  tap / click
    ▼
 EDITING  ──type value, Enter──▶  COMMIT
    │ Esc                              │
    ▼                                  ▼
 DISPLAY                    resolve target entities (DCEL vertex IDs)
                                        │
                             existing driving constraint on
                             this entity pair?
                             ┌──────────┴──────────┐
                            yes                    no
                             │                      │
                    update its target value   create ParameterEntry (DRIVING)
                             │                 + ConstraintNode (distance/length/
                             │                   angle, isDriving=true)
                             └──────────┬──────────┘
                                        ▼
                          DualGraphOrchestrator.preSolveDAGPass()
                                        ▼
                          planegcs / LM solve (Section 2)
                                        ▼
                          write SOLVED coordinates back to shapes
                          (never mutate shape.width/x2 directly —
                           that bypasses the constraint graph entirely)
                                        ▼
                          badge re-renders from solved geometry
```

Concretely, against your real files:

1. **`DimensionBadge.tsx`** needs an editable variant: replace the static `<text>` with a positioned `<input>` (or `contentEditable` `<text>`) on tap, anchored at the same `badgeX`/`badgeY` transform it already computes. Add three visual states it doesn't currently have at all: **driving** (the badge's value came from a user-typed dimension — normal weight), **derived** (a lock glyph, muted color — editing it should be disabled or should visibly warn "this follows from ClearSpan and WallThickness"), and **conflicting** (red, matching the FreeCAD/Abaqus convention of coloring over-constrained geometry — verified this is the industry-standard color code, not a stylistic choice you'd be inventing).
2. **On commit**, do not let the badge write straight into `shape.width`/`shape.x2`. That's the ad-hoc-formula failure mode wearing a UI: it produces a number that *looks* parametric but has no constraint backing it, so the next unrelated edit can silently un-satisfy it. Route every commit through `ParameterManager.setDriving()` + a new/updated `ConstraintNode`, then re-solve.
3. **Fix the substring bug in the same pass.** Since badge-driven parameter creation is about to become the primary way `ParameterEntry` objects get created, this is the moment to stop deriving DAG edges with `dep.formula.includes(other.name)` and instead walk the AST your own `expression.ts` already parses, collecting identifier nodes. You already have the parser; you're just not using its symbol table for dependency extraction yet.
4. **Draftsman-specific over-constraint recovery.** This matters because dimension badges are the one place a non-technical draftsman *does* create real constraints, even though they never see a formula. If a badge edit would conflict (DM decomposition puts the new constraint in the over-constrained block with nonzero residual — see Section 6), don't show a stack of constraint IDs. Show, in the draftsman's own vocabulary: *"Setting ClearSpan to 700 conflicts with WallThickness and Haunch — try changing one of those first."* The translation from `Cover(over-constrained block)` → named DRIVING parameters is a lookup through `ConstraintNode.targetParameter`, which the schema in every one of your documents already carries.

---

## 4. The generalized component protocol — "component can be anything"

This is the part explicitly called out in your original brief ("component can be anything, designed by the user themselves… a way to generalize them, using some kind of standard or protocol") and it's the one place all three prior documents sketch a `TemplateDefinition` shape but never finish the job — because every worked example in all three documents is a nested-rectangle-with-wall-thickness pattern. That's not a coincidence; it's the tell that the generalization was never actually stress-tested against a structurally different shape.

**Reconcile three schemas into one first.** You currently have three non-identical template representations in play: the wired-but-old `BUILTIN_TEMPLATES` in `lib/parametric/templates.ts`, the orphaned `rccBridgeTemplate.ts` generator, and the aspirational `TemplateDefinition` (parameters/shapes/bindings/constraints/repeats) that PDF2, the AutoFormula transcript, and `2d-canvas-prd.md` all sketch nearly identically. Pick the aspirational one as canonical — it's the only one that actually satisfies "authored once, exposes only DRIVING parameters" — and write a one-time adapter that lifts `BUILTIN_TEMPLATES` entries into it. Retire `rccBridgeTemplate.ts` and hand-written model classes like `SingleCellCulvertModel` by re-expressing them *as data* in the canonical schema — you don't lose the solve logic, since the residuals they call already exist as reusable functions; you stop needing a new TypeScript file per shape family.

**What's actually missing is composability: ports.** Every nesting example so far — "Cell 2's origin is constrained relative to Cell 1," Bay 2 displacing rigidly when Bay 1's span changes — is hand-coded: a human already knew it was a horizontal cell-adjacency case and wrote `Ocell2 = Ocell1 + (Span1 + WallMid, 0)` by hand. A template author designing a genuinely new component (not a bridge cell) has no declarative way to say "attach my new thing to that thing's edge" without a programmer writing that offset formula for them — which is exactly the bottleneck the whole effort exists to remove.

Add a **port**: a named, local-frame anchor a component exposes, and a **component instance** that can attach to another instance's port instead of hardcoding an offset:

```ts
interface Port {
  id: string;
  kind: 'point' | 'edge' | 'axis';
  localOrigin: { x: string; y: string };   // expressions in the OWNING template's own params
  localAngle: string;                       // expression, degrees
}

interface ComponentInstance {
  instanceId: string;
  templateId: string;
  parameterOverrides: Record<string, string>;   // DRIVING params this instance sets
  attachedVia?: {
    parentInstanceId: string;
    parentPortId: string;
    ownPortId: string;
    offsetExpr?: { along: string; normal: string; rotate?: string };
  };
}

interface TemplateDefinition {
  id: string; name: string; category: 'component' | 'bridge';
  parameters: TemplateParameter[];
  ports: Port[];                       // NEW — what other components can attach to
  shapes: AnyShape[];
  bindings: ShapeBinding[];
  constraints: ConstraintBinding[];
  repeats?: RepeatRule[];
  components?: ComponentInstance[];    // NEW — nested/composed instances
}
```

Resolution is boring on purpose: build a dependency graph from `attachedVia.parentInstanceId` edges, topologically sort it (you already have Tarjan/Kahn in `lib/parametric/dag/tarjan.ts` — the *same* algorithm doing double duty, once for scalar formulas, once for instance placement order), then for each instance in order, compose its parent's resolved LCS frame with the port's local frame and the offset expression. `lib/geometry/lcs/affineMatrix.ts` and `frame.ts` already do exactly this matrix composition — they're just not being called from anything today. Nothing new needs to be invented mathematically; it needs to be exposed as author-facing data instead of programmer-facing code.

**Proving it actually generalizes.** Every example in the source material is a nested-rectangle/wall-thickness pattern. To show the port protocol isn't secretly bridge-shaped, here's a component that is structurally nothing like a culvert cell — a repeating railing run, which is a *point-repeat-along-a-path* pattern instead of an *offset-nested-rectangle* pattern:

- **`ParapetPost` template:** one DRIVING parameter (`PostHeight`), a single port `base` at local origin `(0,0)`, angle `0`.
- **`RailingRun` template:** DRIVING params `RunLength`, `PostSpacing`; a `repeats` rule instantiating `ParapetPost` `ceil(RunLength / PostSpacing) + 1` times; each instance attaches its `base` port via `attachedVia.offsetExpr.along = "i * PostSpacing"` against a `deckEdge` port on whatever it's placed on.
- **Composed onto the bridge:** the existing deck template exposes a `deckEdge` port (an `edge`-kind port running its full length); `RailingRun` attaches there with zero bridge-specific code anywhere in either template.

Nothing about `Port`, `ComponentInstance`, or the resolution algorithm above referenced spans, walls, or haunches — the same mechanism that composes a box-culvert cell onto a bridge composes a fence post onto a railing. That's the generalization test the existing documents skipped.

**Validation and versioning**, reusing what already exists rather than inventing new plumbing: `boundaryLimits.ts` already exists for range-checking DRIVING parameters — wire it to run at template-save time and produce a `TemplateValidationReport` (`errors[]`, `warnings[]` keyed to parameter names, surfaced in Author mode before publish — this is the one piece of the AutoFormula transcript's production-CAD recommendations that ports cleanly regardless of which codebase implements it). Attach `standardsReference` metadata (code + revision) to every canonical template, exactly as PDF2's JSON schema already proposed — I'm not changing that part, just confirming it should survive into the merged schema.

---

## 5. One candidate pipeline: static AutoFormula + drag-invariance

Solutions 1–2 across your documents (dimension-driven UX, template-first modeling) are now specified in Sections 3–4. Solution 3 from the AutoFormula transcript — *"what stayed invariant during the drag is the formula set"* — is the freshest idea in your source material and the one none of the three documents actually finished specifying, so it's worth doing properly rather than leaving it as a paragraph.

Right now AutoFormula candidates come from exactly one source: static pattern detectors on geometry at rest (`wallDiscovery.ts`, `haunchRecognizer.ts`, `wallThicknessExtractor.ts` — all verified present). Add a second, complementary source that fires *during* interaction instead of on geometry at rest:

```
Static path:  geometry-at-rest ──▶ wallDiscovery / haunchRecognizer / wallThicknessExtractor
                                                        │
Live path:    pointer-drag delta ──▶ watch OTHER residuals during the drag:
                                      which ones stayed within tolerance while
                                      the dragged one changed?
                                                        │
                                                        ▼
                                        ONE CANDIDATE QUEUE
                                                        │
                                        admissibilityFilter.ts (finally wired in)
                                                        │
                                                        ▼
                                        AutoFormula suggestion panel
                              "You changed ClearSpan 500→700; WallThickness=250,
                               Haunch=150, TopSlab=300 stayed put — keep these
                               as driving dimensions?"
```

Both sources land in the same queue and pass through the same admissibility check before reaching the author — which is also the fix for the dead-code finding in Section 1: this is the pipeline `isConstraintAdmissible` should have been sitting inside all along.

Two lifecycle rules prevent this from becoming suggestion spam, since "Complex authoring UX" is a risk your own PRD already flagged: don't re-propose a candidate the author already rejected for the same entity pair within the session, and supersede (don't duplicate) a pending suggestion if the geometry changes again before the author acts on it. Show provenance on each suggestion — *"detected: nested rectangle"* vs. *"detected: stayed invariant during your last drag"* — so the author can tell which signal to trust more for a given case.

---

## 6. DOF status, for two different readers

The FreeCAD/Abaqus convention — green for fully-constrained, a distinct color for conflicting/over-constrained — is the actual industry standard, confirmed directly rather than assumed; both tools independently converged on it, and it's worth just adopting rather than designing a new visual language.

**Draftsman-facing (built on Section 3's badges, no jargon):**

| State | Signal | Tap action |
|---|---|---|
| Under-constrained | Neutral/grey dot, "N free" | Suggests which dimension to add next |
| Fully constrained | Green check | Nothing — this is the target state |
| Conflicting | Red, matching the industry convention above | Plain-language list of the specific named DRIVING parameters involved (translated from the DM `Cover` set — never raw constraint IDs) |

**Author-facing (the real DM output from Section 2):** full partition view — under-constrained / well-constrained / over-constrained blocks, with the redundant-vs-conflicting distinction your Kernel PDF already derived correctly (‖P‖ < 1e-6 and residual ≈ 0 → redundant, safe to discard silently; residual ≠ 0 → genuine conflict, must be shown) now actually computed from a real matching instead of a global scalar.

---

## 7. One reconciled roadmap

Four different phase plans exist across your documents (a 12-phase kernel roadmap, a 4-phase/8-week blueprint, a 7-phase Gantt chart, and a separate "migration order" for 2D-Canvas specifically). Here's the one sequence that supersedes all four, ordered by actual dependency and citing the verified files each step touches:

1. **Wire the dimension-badge loop** (Section 3) — `DimensionBadge.tsx` → `ParameterManager` → `ConstraintGraph` → solve → write-back. Highest leverage, reuses existing correct pieces, no new math.
2. **Kill the substring DAG bug** — swap `dep.formula.includes(other.name)` for AST symbol extraction via the existing `expression.ts` parser. Do this alongside step 1 since badge-driven parameter creation is about to make this path load-bearing.
3. **Wire the two dead-code paths in** — `admissibilityFilter.ts` into the AutoFormula queue (Section 5); `bfsPartition.ts` into the solve loop so edits only re-solve the dirty connected component instead of the whole drawing.
4. **Replace the scalar DOF count with real Dulmage–Mendelsohn** on the existing `BipartiteConstraintGraph` adjacency (Section 2), fixing the per-component rigid-motion bug at the same time.
5. **Spike planegcs** behind a thin interface against your two hardest verified cases — `singleCellCulvert` and `twoSpanCulvert` — before deciding how much of the hand-rolled LM path it replaces.
6. **Land the canonical `TemplateDefinition` + ports/`ComponentInstance` schema** (Section 4); migrate `BUILTIN_TEMPLATES`; re-express `rccBridgeTemplate.ts` and `SingleCellCulvertModel` as data instead of code.
7. **Author-mode UI gating** — the DRAFTSMAN/AUTHOR toggle, AutoFormula suggestion panel, DOF badges for both audiences (Section 6).
8. **Delete the magic-string resolvers and proportional scaling from `model.ts`** once templates cover the same drawings — not before, so you always have a working fallback while the new path is proven out.
9. **Merge `parametric_formulation` into `main`** — everything above is worthless sitting on a branch nothing else builds on.

---

## 8. What I'd check next

This document is verified where it says it's verified and design-level everywhere else — worth being precise about which is which before you hand it to a team:

- I did **not** fully read `gadAssemblyEngine.ts` (836 lines) or all of `model.ts` (955 lines) — the switch-statement count is a targeted grep, and there may be more resolvers than the ones quoted here.
- I could **not** access the separate production CAD (`template.schema.ts`, `template-runner.service.ts`, `binding-suggestion.service.ts`, the `template-bind-field.tool.ts` AI agent tools) described in the AutoFormula transcript — it isn't on GitHub. Section 4's schema is written to be a reasonable merge target for it, but that side is unverified against real code the way Sections 1–6 are.
- The `main` branch's total absence of the advanced work is worth a direct answer from whoever owns the repo: is `parametric_formulation` the intended future of `main`, or an abandoned spike? The roadmap above assumes the former.

**External references checked while building this:** [`@salusoft89/planegcs`](https://www.npmjs.com/package/@salusoft89/planegcs) (npm) · [Salusoft89/planegcs](https://github.com/Salusoft89/planegcs) (GitHub) · [Dulmage–Mendelsohn decomposition](https://en.wikipedia.org/wiki/Dulmage%E2%80%93Mendelsohn_decomposition) (Wikipedia) · [CadVLM](https://www.research.autodesk.com/publications/cad-vlm/) (Autodesk Research, ECCV 2024) · [Onshape custom features / FeatureScript](https://www.onshape.com/en/features/custom-features) · FreeCAD Sketcher DOF-counting issues: [#15850](https://github.com/FreeCAD/FreeCAD/issues/15850), [#6174](https://github.com/FreeCAD/FreeCAD/issues/6174), [#8324](https://github.com/FreeCAD/FreeCAD/issues/8324).
