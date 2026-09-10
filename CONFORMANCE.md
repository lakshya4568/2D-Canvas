# GEOM-RP/1 Protocol Conformance Specification

This document defines the conformance levels under **GEOM-RP/1** (Universal Geometric Resolver Protocol) and maps the level required by each civil template and implemented by each engine module.

---

## 1. Conformance Levels Definition (UPCE-MASTER-1.0 §43 Clause 14)

| Conformance Level | Predicates Required | Geometric Capabilities | Primary Target Typologies |
|---|---|---|---|
| **Level 1** | **P1** (Parallel), **P3** (Parallel Offset), **P8** (Coincidence) | Arbitrary rotated straight-edge assemblies with uniform wall thickness and welded topological joints. | Basic rectangular boxes, uniform-thickness ducts, planar plates. |
| **Level 2** | Level 1 + **P2** (Perpendicular), **P4** (Corner Chamfer w/ measured angle), **P5** (Concentric Radial Offset), **P6** (Tangency) | Orthogonal corners, chamfered transitions at arbitrary angles (30°, 45°, 60°), circular ducts/pipes, filleted arch boundaries. | Single-cell box culverts with haunches, pipe culverts, filleted piers. |
| **Level 3** | Level 2 + **P7** (Cross-Drawing Equal Length), **P9** (Bilateral Symmetry) | Multi-bay balanced spans, cross-assembly symmetry axes, modular components with ports and repeat rules. | Multi-cell box culverts, balanced railway bridges, parapet/railing arrays. |

---

## 2. Module Implementation Conformance

| Engine Module | Target Level | Current Status | Notes |
|---|---|---|---|
| `lib/geometry/predicates/vectorPredicates.ts` | **Level 3** | Operational (Gates G2 & G4 verified) | Pure rotation-invariant vector/matrix formulation. Zero axis-aligned bounding boxes. |
| `lib/geometry/topology/dcel.ts` | **Level 1** | Operational (Gate G1 Verified) | Planar arrangement with intersection splitting, vertex welding at `weld_mm`, Euler characteristic $V - E + F = 1 + C$, face tracing, nesting depth, and face persistence. |
| `lib/parametric/graph/dulmageMendelsohn.ts` | **Level 3** | Operational | Bipartite matching (Hopcroft-Karp) + Tarjan BTF + connected-component DOF. |
| `lib/inference/admissibilityFilter.ts` | **Level 3** | Operational | SVD row-space projection `(I - J⁺J)g`. Wired into candidate pipeline in Phase 2. |
| `lib/solver/planegcsClient.ts` | **Level 3** | Operational (Gate G6 verified) | PlaneGCS WASM client adapter + analytical Levenberg-Marquardt domain layer. |
| `lib/parametric/component/portSolver.ts` | **Level 3** | Operational (Gate G5 verified) | 3x3 homogeneous affine composition for modular components. |
| `lib/parametric/component/repeatExpander.ts` | **Level 3** | Operational (Gate G5 verified) | Procedural count-driven regeneration (counts as topology, not solver variables). Path is `component/repeatExpander.ts`, not the `repeats/repeatEngine.ts` originally planned. |

---

## 3. Template Conformance Requirements

| Template / Archetype | Required Level | Required Predicates | Invariants Preserved Under Anisotropic Solve |
|---|---|---|---|
| **Single-Cell Box Culvert** | **Level 2** | P1, P2, P3, P4, P8 | `WallThickness`, `SlabThickness`, `HaunchSize`, `HaunchAngle` |
| **Multi-Cell Culvert (N-Bay)** | **Level 3** | P1, P2, P3, P4, P7, P8, P9 | Bay spans, intermediate web thickness `t_mid`, outer walls, inter-cell gap |
| **Pipe Culvert** | **Level 2** | P5, P8 | Barrel thickness `|r_outer - r_inner|`, invert levels |
| **Parapet & Railing Run** | **Level 3** | P1, P7, P8 | `PostHeight`, `PostSpacing`, procedural count `ceil(L/Spacing) + 1` |
| **Retaining Wall / Pier Cap** | **Level 2** | P1, P2, P3, P4, P8 | Stem batter angle, base slab thickness, toe/heel dimensions |

---

## 4. Phase 8–9 Modules (added 2026-09-10)

| Engine Module | Target Level | Current Status | Notes |
|---|---|---|---|
| `lib/solver/branchControl.ts` | **Level 3** | Operational (Gate G10) | §31: homotopy sub-stepping (ΔL ≤ 500 mm), chirality & degeneracy log-barriers, Bentley–Ottmann sweep with `crossing`/`overlap`/`touching` classification, κ(J) > 1e8 λ-clamping. |
| `lib/inference/integerRelation.ts` | **Level 3** | Operational (Gate G10) | §49.2 escalation ladder: bounded-coefficient search → PSLQ → LLL, with dimensional-consistency gating. |
| `lib/inference/bayClusterer.ts` | **Level 3** | Operational (Gate G10) | §80: the horizontal bay-clustering pass. Stacking axis derived from void-centroid scatter — rotation-invariant, no bounding box. Emits ONE stack relation. |
| `lib/inference/formulaCandidateGenerator.ts` | **Level 3** | Operational (Gate G10) | §49.1/§49.3/§49.4: dimension stacks, Occam ranking, and all four validation gates. Perturbation evidence is required, never assumed. |
| `lib/inference/dragInvarianceDetector.ts` | **Level 3** | Operational (Gate G10) | §50: the live candidate signal, feeding the same queue and the same SVD gate as static detection. |
| `lib/inference/solverVerifier.ts` | **Level 3** | Operational (Gate G10) | §51: solver-as-verifier + §75.7 stability sweeps with a seeded, reproducible Latin hypercube. |
| `lib/validation/invariantChecker.ts` | **Level 3** | Operational (Gate G10) | §5/§67: the full acceptance condition and the report the spec prints. |
| `lib/validation/standardsProfile.ts` | n/a (data) | Operational (Gate G10) | §26: codes stay out of the kernel. Restricted comparison grammar, never `eval`. Both shipped profiles carry `verified: false` (DEC-004). |
| `lib/runtime/editPipeline.ts` | **Level 3** | Operational (Gate G10) | §66: the thirteen steps in order, with the §13/§67 all-or-nothing transaction boundary. |
| `lib/ai/*` | n/a (labels only) | Operational (Gate G10) | §53–§57: zero geometric authority enforced by field-by-field reconstruction. Deterministic fallback ships first and the suite passes with the LLM disabled. |
| `lib/io/dxfExporter.ts` | **Level 3** | Operational (Gate G10) | §69: R2010 default / R12 fallback, the §69 layer scheme, native associative `DIMENSION` entities. Dependency-free. |
| `lib/io/pdfSheetExporter.ts` | **Level 3** | Operational (Gate G10) | §69: A1–A4 sheets, title block, scale bar, metadata. Dependency-free (no AGPL PyMuPDF, §84). |
| `lib/io/svgExporter.ts` | **Level 3** | Operational (Gate G10) | §69: canonical-model SVG. Deliberately separate from the canvas `Shape[]` exporter; neither is chained through the other. |
| `lib/io/renderService.ts` + `restHandlers.ts` | **Level 3** | Operational (Gate G10) | §69 REST + CLI contract. One implementation shared by client, `scripts/gad-render.ts`, and `app/api/v1/**`. |
| `lib/parametric/component/sharedEdgeCollapse.ts` | **Level 3** | Operational (Gate G10) | §68 redundant coincident-edge collapse between adjoining repeat instances (DEC-061). |

## 5. Known Conformance Gaps

Verified defects, recorded so the conformance claim stays honest.

| Gap | Spec clause | Evidence | Status |
|---|---|---|---|
| An `offset` compiles to the distance half only, omitting `Parallel`. Each P3 contributes one equation instead of two, leaving 10 DOF free and drifting the height ~213 mm on a horizontal edit. | §22, §48, §5 | `tests/unit/autonomous_pipeline_dof_regression.test.ts`; DEC-057, DEC-064 | **Open**, precisely located. Both §22-correct formulations diverge against the current PlaneGCS mapping and were reverted. Next task: a **signed** point-to-line residual in `planegcsClient.ts`. |
| No minimum-norm projection on the PlaneGCS parameter-change path, so free DOF absorb arbitrary motion. | §29.4 | DEC-057 | **Open.** |

### Closed

| Gap | Spec clause | Resolution |
|---|---|---|
| Conformal similarity scaling on the live solve path. | §8, §29.4, §81 change 8 | **Fixed** (DEC-062). `connectedComponentSolver.ts` is now a variational solve: welded vertices, squared-distance residuals with analytical partials, §18 anchor, Dogleg + SVD minimum-norm from a warm start. Undriven member lengths are now preserved rather than scaled. |
| A vertex-weld tolerance expressed in pixels. | §17 | **Fixed** (DEC-062). Reads from `policy.weld_mm`; the lint exemption is deleted and `lint_guardrails.test.ts` asserts no pixel tolerance remains in `lib/`. |
| The §18 anchor rule never reached the DOF analysis (`isAnchored: false` on every sketch). | §18 | **Fixed** (DEC-063). Note the honest consequence: reported DOF rose 7 → 10, because the unanchored report had been discounting three rigid-body DOF the sketch did not have free. |
| The tolerance lint logged violations and exited 0. | §17 | **Fixed** (DEC-059). Fails the build; exemptions require a written reason and are keyed on source line. |
| §68 redundant coincident edges between adjoining repeat instances. | §68 | **Fixed** (DEC-061). `sharedEdgeCollapse.ts`; 4 measured overlap faults → 0. |

## 6. Persona Conformance (§3)

The §3 contract is enforced structurally by the UI, not by convention.

| Clause | Where it is enforced |
|---|---|
| "Formula exposure: **strictly zero**" for the draftsman | `features/panels/DraftPanel.tsx` renders no expression string of any kind. A derived row is locked and names its drivers (§12) rather than showing its formula. |
| Project engineer "does NOT see constraints, the DCEL, a Jacobian, a formula DAG, or PlaneGCS" | `features/panels/RunPanel.tsx` renders names, values and units only; derived rows show the **result**, never the expression. |
| Author gets "Accept / Reject / Edit / Rename, set the role" | `features/panels/AuthorPanel.tsx`, the only surface where an expression is rendered. |
| "Conflicts MUST be surfaced using driving-parameter names, never raw constraint or predicate identifiers" | `features/shell/ConstraintStatus.tsx` — `conflictingParameters`, never ids. |
| Counts are topology, not constraints (§23.4) | A COUNT edit routes through procedural regeneration in the edit pipeline, never into the solver. |
