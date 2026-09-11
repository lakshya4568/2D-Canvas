# The Unified Parametric CAD Engine
## Final Consolidated Architecture, Mathematics & Implementation Specification

**Document ID:** UPCE-MASTER-1.0
**Status:** Frozen engineering specification — implementable without a further design phase
**Date:** 9 September 2026
**Scope:** A general, deterministic 2D parametric geometry engine with two operating modes (Draftsman/Author authoring, User runtime) and one optional secondary ingestion path (GAD PDF / image / DWG), targeted first at civil GAD work (RCC box culverts, multi-cell balancing structures, ROB/RUB, retaining walls, pier caps, parapets/railings under RDSO & IRC practice) but architecturally domain-neutral.
**Constraint:** **No machine-learning model is trained, fine-tuned, or post-trained anywhere in this system.** Only deterministic mathematics, open-source libraries, and off-the-shelf LLM APIs used for naming and explanation.

---

## 0. How to read this document

### 0.1 What this document is

This is the single consolidation of eleven prior research and audit documents produced across ChatGPT Deep Research, Gemini Deep Research (×2), Claude Research (×2), Perplexity Deep Research, an OpenCode implementation session, and four internal architecture papers. Every durable finding, formula, schema, protocol clause, library decision, license verdict, risk, and roadmap item from those documents is carried forward here exactly once. Where the sources disagreed, this document **adjudicates** and states the reason. Where a source made a claim that could not be verified, this document **marks it** rather than laundering it into fact.

Nothing else needs to be read to start building. The source documents are now reference material only.

### 0.2 Structure

| Part | Contents | Primary reader |
|---|---|---|
| **I** | Problem, personas, non-negotiables, acceptance definition | Product, leadership |
| **II** | Foundations from first principles — why formulas alone fail, why scaling fails, the dual-model | Everyone, including new engineers |
| **III** | System architecture, layers, module tree, data-flow contracts | Architects, tech leads |
| **IV** | Canonical data model (`ParametricSketch`, `TemplateDefinition`) | All engineers |
| **V** | Complete mathematics: residuals, Jacobians, solvers, DOF, SVD, damping, affine algebra, derived metrics | Kernel/geometry engineers |
| **VI** | GEOM-RP/1 — the universal geometric resolver protocol (P1–P9 + formal clauses) | Kernel/inference engineers |
| **VII** | Inference pipeline: candidate parameters, formulas, admissibility, drag-invariance | Inference engineers |
| **VIII** | AI layer — exactly what the LLM may and may not do | Backend engineers |
| **IX** | Draftsman & Author mode — modules, grips, badges, review UI | Frontend engineers, UX |
| **X** | User mode runtime, validation, exports | Frontend + backend |
| **XI** | Secondary GAD ingestion path | Deferred team |
| **XII** | Verification: tests, fixtures, gates, benchmarks | QA + all |
| **XIII** | Verified codebase audit and the exact fix list | Maintainers of `2D-Canvas` |
| **XIV** | Technology stack, dependencies, licenses | Architects, legal |
| **XV** | Phased roadmap, risk matrix, deployment | Delivery management |
| **XVI** | Honest boundaries — what this system will *not* do | Everyone |
| **XVII** | Appendices: glossary, schemas, prompts, formula card, source ledger | Reference |

### 0.3 Conformance language

`MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY` are used in the RFC 2119 sense (as updated by RFC 8174). This document defines an **internal** protocol. It is **not** an IEEE, ISO, or STEP standard, though it borrows the geometry/topology separation principle from ISO 10303-42 and the constraint/design-intent vocabulary from ISO 10303-108 and ISO/TS 10303-1788/1789, so that a future exchange mapping is possible without redesign.

### 0.4 Provenance ledger — what was consolidated

| # | Source document | What it uniquely contributed | Status here |
|---|---|---|---|
| 1 | *Parametric Geometry Resolver Implementation Report* (ChatGPT DR) | Dual-model decision; canonical primitive adapter table; relationship vocabulary table; solver **contract** (inputs/outputs); GEOM-RP/2 clause set; template/port TS types; phase 0–7 plan; non-negotiable test gates; ISO/RFC/FreeCAD citations | Fully absorbed (Parts III, IV, V, VI, XII, XV) |
| 2 | *Aagento Parametric 2D CAD System — Final Implementation Plan* (Claude Research 1) | arXiv 2504.13178 adopt/adapt/reject analysis; PlaneGCS-vs-SolveSpace licence verdict; module table M1–M8; pebble-game + witness DOF method; IRC:112 / IRC:SP:13 FIXED parameters; phase table | Fully absorbed (Parts V, VII, VIII, X, XIV) |
| 3 | *Parametric 2D Engineering Drawing (GAD) System* (Claude Research 2) | Count-driven topology = FeatureScript layer above solver (hardest-problem answer); DCEL face-identity persistence; formula false-positive control (perturbation validation); full licence-risk matrix incl. AGPL PyMuPDF; safe-eval (asteval/mathjs); REST/CLI contract; P0–P5 effort estimates | Fully absorbed (Parts IV, VII, X, XIV, XV) |
| 4 | *Production System Architecture: Parametric Civil GAD Engine* (Gemini Research 2) | Full JSON Schema for `ParametricSketch`; analytic residual/Jacobian set; SVD null-space projection for grip drag; LLM request/response payload examples + deterministic fallback ladder; DXF layer naming; 20-week 3-dev roadmap; homotopy sub-stepping; chirality barrier | Fully absorbed (Parts IV, V, VIII, X, XV) |
| 5 | *Parametric Geometry Understanding Engine* (Gemini Research Plan) | Line-by-line audit of `gadAssemblyEngine.ts` / `model.ts`; the 24-magic-string table; multi-cell inference failure trace; GEOM-RP/1 predicate table with thresholds; component-port case studies (2-cell culvert, railing); drag damping matrix; 5-phase execution sequence with verification criteria | Fully absorbed (Parts VI, V, IX, XIII, XV) |
| 6 | *Parametric CAD Engine Architecture* (duplicate of #5 with works-cited) | Citations; identical technical content | Merged into #5, redundancy removed |
| 7 | *Universal Geometric Resolver Protocol* (GEOM-RP/1 paper) | The rotation-invariance argument; P1–P9 with the "why each earns its place" rationale; single-tolerance rule; conformance levels; phased predicate rollout table | Fully absorbed (Part VI) |
| 8 | *Parametric Template Authoring Architecture* | Verified file-by-file diagnosis (read-only badge, dead `admissibilityFilter`, fake DM, substring bug, orphaned `rccBridgeTemplate`); the **ports** generalisation test (railing ≠ culvert); badge state machine; `driving`/`temporary` PlaneGCS flags; 9-step reconciled roadmap | Fully absorbed (Parts IV, IX, XIII, XV) |
| 9 | *Parametric 2D CAD Kernel Architecture* | The 9-layer kernel; assertion-class taxonomy (Fact/Inference/User Constraint/User Formula/Derived Measurement); minimum-norm projection; persistent-vs-transient state split; incremental subgraph & DR-plan; construction/reference geometry; derived metrics (shoelace, centroid, second moments); 12-phase roadmap; 15 foundational decisions | Fully absorbed (Parts III, IV, V, X, XV) |
| 10 | *Parametric CAD Engine — Unified Plan* | First consolidation attempt; aagento-bridge production context; template schema shape | Superseded by this document; production-context section retained (Part X.9) |
| 11 | *Opencode Worked Session (cleaned)* | Ground-truth test progression (155→166→170); implementation output inventory; evidence-vs-claim separation; the "overclaiming semantic inference" correction; minimum invariant report | Fully absorbed (Parts XII, XIII, XVI) |
| 12 | *Perplexity Deep Research transcript* | The didactic R1/R2 fully-constrained walkthrough; generic-offsets vs uniform-thickness model table; two-modes-one-core framing; Vitruvion/SketchGraphs/DAVINCI/PICASSO evaluation and **rejection**; GPU/CPU resource profile | Fully absorbed (Parts II, VII, VIII, XV) |

### 0.5 The six adjudications this document makes

Where sources conflicted, these are the decisions. They are not revisited later in the document.

1. **Solver:** PlaneGCS (via `@salusoft89/planegcs` WASM client-side, Python bindings server-side) is the generic numeric core. SolveSpace/`py-slvs` is **dev-time oracle only, never linked**. The hand-derived analytical culvert Jacobians are **retained** as a domain layer, not deleted. *(Sources 1, 2, 3, 5, 8 all converge; source 12's earlier CAD_Sketcher/jsketcher suggestions are rejected on licence grounds.)*
2. **Language:** TypeScript is the primary language and the client owns interactive solving; Python 3.11+ is the server for authoring batch, export, ingestion, and CI harnesses. *(Source 2 argued TS-only; source 3 argued Python-first; both are right about their half — the split below is the resolution.)*
3. **Editor:** Extend the existing 2D Canvas. Do **not** adopt Blender/CAD_Sketcher, FreeCAD GUI, or jsketcher as the editor. *(Unanimous among 2, 3, 8.)*
4. **AI:** No training of any kind. The arXiv 2504.13178 paper is adopted for its **evaluation half** (design-intent definition + solver-as-verifier) and its **method half is rejected**. LLMs name and explain only. *(Sources 1, 2, 5, 11, 12 converge.)*
5. **Counts/repeats:** Integer counts are a **topology mutation handled procedurally above the solver**, never a constraint variable inside it. *(Source 3's answer; adopted verbatim as the resolution to the hardest problem.)*
6. **Semantics:** Geometry may *propose* meaning; only a human author *confirms* it. Any claim that the engine "knows" a 2000 mm gap is a Clear Span is an overclaim. *(Sources 1, 11 correction; binding on all product copy.)*

---

# PART I — THE PROBLEM

## 1. What is actually being solved

The request, stated plainly:

> A draftsman draws a diagram once. He tags a few dimensions with meaning. The system works out the rest — the relationships, the parameters, the formulas — and produces a template. Afterwards, anyone can open that template, type new numbers into a handful of clearly-named boxes, and get a correct drawing. The drawing must change the way an engineer expects it to change, not the way a picture-editor would change it.

The hard part is **not** "make a rectangle resize." The hard part is:

> Given arbitrary engineering geometry, how do you discover and then permanently preserve the relationships that make that geometry *mean* something, so that they survive every future dimensional change?

Consider a draftsman drawing this:

```
                    Outer envelope
     ┌───────────────────────────────────────┐
     │                                       │
     │       ┌───────────────────────┐       │
     │       │                       │       │
     │       │     CLEAR OPENING     │       │
     │       │                       │       │
     │       └───────────────────────┘       │
     │                                       │
     └───────────────────────────────────────┘
```

The system should discover the scalars `OuterWidth`, `OuterHeight`, `WallThickness`, `SlabThickness`, `ClearSpan`, `ClearHeight`, and the relations

```
InnerLeft   = OuterLeft  + WallThickness
InnerRight  = OuterRight - WallThickness
InnerWidth  = OuterWidth - 2 × WallThickness
InnerBottom = OuterBottom + SlabThickness
InnerTop    = OuterTop    - SlabThickness
ClearSpan   = InnerWidth
ClearHeight = InnerHeight
```

**But those formulas are not the fundamental representation.** The fundamental representation is:

```
wall faces are parallel          slab faces are parallel
wall offset is constant          slab offset is constant
opening is centred               corners are coincident
left wall ≡ mirror of right wall about the vertical axis
```

The formulas are a *scalar convenience layer* derived from that structure. A system built formula-first can compute the inner rectangle when the outer changes, and nothing else. A system built constraint-first can do that **and** let the user drag the inner right wall and have the outer envelope follow, which is what a CAD user expects.

Everything in this document follows from that one distinction.

## 2. The two failure modes being replaced

| Path | What it is | Why it fails |
|---|---|---|
| **Path A — hardcoded procedural renderer** | A script computes absolute coordinates by arithmetic: `centerX = 500`, `cellWidth = (deckWidth − 4*wallThickness)/2`. Fast for the nominal case. | Fails the moment site conditions deviate — skew angles, unequal haunch splays, non-standard wall dimensions, a third cell. Every new bridge type needs a new file. Validated engineering knowledge lives in code a draftsman cannot touch. |
| **Path B — blank-sheet drafting in generic CAD** | Redraw the standard geometry from scratch for every contract. | Discards validated design logic every time; introduces geometric drafting errors; nothing is reusable; quantities and downstream views must be re-derived by hand. |

The target is a third path: **capture the design rules of each typology once, as data, and make daily work parameter entry.**

## 3. Personas and their contracts

Three roles, three completely different products sharing one kernel. Mixing them is the single most common design error in this space.

| Dimension | **Draftsman** (daily) | **Template Author** (specialist, occasional) | **Project Engineer** (per-project) |
|---|---|---|---|
| Primary interaction | Draw geometry; drag CAD grips; edit numeric dimension badges; insert components | Draft the canonical component; curate inferred relationships; define ports, repeats, bounds, standards metadata | Enter site/boundary conditions into a form; audit compliance |
| Formula exposure | **Strictly zero.** No formula bar, no expression syntax, no dependency graph, no synthetic names like `R1_Width` | Full, auditable: parameter bindings, expressions, repeat rules, roles | Read-only |
| Geometry mutation | Direct manipulation + dimension badge editing | Accept/reject/edit inferred predicates; assign semantics; set roles | Parameter form only |
| Sees DOF as | A neutral / green / red status chip in plain words | Full Dulmage–Mendelsohn block partition with named conflicts | Nothing |
| Underlying engine | Variational constraint solver, bidirectional | Dual-graph orchestrator (scalar DAG + constraint graph) + inference | Template runner |

**Rule:** A draftsman `MUST NOT` be required to read or write a symbolic formula to accomplish an ordinary edit. An accepted relationship `MUST` be editable by direct manipulation of the geometry it constrains. Conflicts `MUST` be reported using the names of driving parameters, never raw constraint or predicate identifiers.

**Corollary (important, and a correction to earlier drafts):** removing formulas from the *draftsman's view* is correct. Removing formulas from the *system* is not. Derived scalar relationships, template bindings, validation bounds, and repeat rules all still need an internal representation. The goal is **hidden and curated complexity, not absent complexity.**

## 4. Non-negotiable requirements

1. **Zero-formula drafting for day-to-day work.**
2. **Anisotropic deformation.** Changing a clear span moves the correct walls and bays while strictly preserving wall thickness, slab depths, haunch leg lengths, gaps, and shared joints. There is no global scale factor anywhere in the system.
3. **Bidirectional solving.** Any dimension — grip or badge — can be the driver. Roles are not hardcoded in the data model; they are decided at solve time by context.
4. **Structural correctness.** Closed loops stay closed. DOF diagnostics distinguish under-, well-, and over-constrained *sub*systems, per connected component, not one global scalar.
5. **Rotation invariance.** Every detection predicate must give the same answer for the same physical configuration drawn at 0°, 15°, 37°, or 45°.
6. **Template authorship once per type.** Components are hierarchical and composable via ports; parameters carry DRIVING/DERIVED/FIXED/MEASURED roles.
7. **Determinism.** Geometry is never generated, interpolated, or altered by a stochastic model. Millimetre precision is a fabrication requirement, not a preference.
8. **Graceful degradation.** With the LLM disabled or unreachable, the entire system still works; parameters simply get deterministic names.

## 5. The acceptance definition of "fully parametric"

A template is complete only if all ten hold:

1. Geometry survives parameter changes across the declared validity range.
2. Constraints survive parameter changes (residuals stay below tolerance).
3. Topology survives (no self-intersection, no loop inversion, no lost closure).
4. Component relationships survive (ports stay aligned).
5. Repetition survives count changes.
6. Semantic meaning survives (tags stay attached to the right faces/edges).
7. The system can *explain* why anything moved, in the user's vocabulary.
8. Invalid configurations are rejected before they render, with an explanation.
9. The author can change design intent later without redrawing.
10. The user never needs to understand a formula.

**Critical caveat, stated once and binding everywhere:** *fully constrained is not the same as correct.* A sketch can solve cleanly, report DOF = 0, and still encode the wrong intent — walls dragged along, a haunch distorted, symmetry silently lost. Therefore the real acceptance condition for any edit is:

```
solver converged
  AND max residual < ε_tol
  AND DOF structure as expected (no new over/under-constrained blocks)
  AND declared invariants preserved (thicknesses, angles, symmetry, gaps)
  AND topology preserved (closure, no self-intersection, chirality intact)
  AND semantic expectations met (tags still attached, ports still aligned)
```

This is the "invariant report" of §67 and it is the product's real quality gate.

---

# PART II — FOUNDATIONS (from first principles)

This part exists so a new engineer can be productive without reading the research corpus. It builds from the simplest possible example to the dual-model architecture.

## 6. Four kinds of knowledge, which must never be conflated

| Kind | Example | Where it lives | Direction |
|---|---|---|---|
| **Geometry** | This segment runs from (100,200) to (400,200); its length is 300 | Coordinate buffers (transient) | measured |
| **Topology** | These two segments share *one* vertex — they do not merely have endpoints that are close | DCEL (persistent) | structural |
| **Design relationship** | These two edges are parallel and 300 mm apart, and always will be | Constraint graph (persistent) | **non-directional** |
| **Engineering meaning** | That 300 mm offset is `WallThickness`; that 2000 mm opening is `ClearSpan` | Semantic/component graph (persistent, human-confirmed) | asserted by a person |

Coordinates alone cannot yield the fourth kind. The system may *propose* it, ranked by evidence; a template author *confirms* it once; from then on it is stored and reused. This division is what makes the whole thing tractable without hardcoding bridge knowledge into geometry detectors.

## 7. Why a formula-only architecture cannot work — the R1/R2 walkthrough

Take the simplest real case: rectangle `R2` nested inside rectangle `R1`.

Two independent rectangles carry **eight** scalars:

```
R1_X, R1_Y, R1_Width, R1_Height
R2_X, R2_Y, R2_Width, R2_Height
```

### 7.1 Under-constrained

If the only bound relation is

```
R2_Y = R1_Y + TopOffset
```

then `R2`'s top edge follows `R1`, but `R2` can still move horizontally, change width, change height, and float vertically if `TopOffset` is itself free. **Under-constrained.**

### 7.2 Two valid fully-constrained models

**Generic nested rectangle** (each side independent):

```
R2_X      = R1_X      + LeftOffset
R2_Y      = R1_Y      + TopOffset
R2_Width  = R1_Width  − LeftOffset − RightClearance
R2_Height = R1_Height − TopOffset  − BottomClearance
```

**Structural model** (what civil work actually wants):

```
LeftOffset = RightClearance   = WallThickness
TopOffset  = BottomClearance  = SlabThickness

R2_X      = R1_X      + WallThickness
R2_Y      = R1_Y      + SlabThickness
R2_Width  = R1_Width  − 2 × WallThickness
R2_Height = R1_Height − 2 × SlabThickness
```

| Model | Inputs | Result |
|---|---|---|
| Generic nested rectangle | LeftOffset, RightClearance, TopOffset, BottomClearance | Every side may differ |
| **Structural rectangle** | WallThickness, SlabThickness | Left/right walls match; top/bottom slabs match |

**This is the first job of inference:** detect four clearances, notice two pairs cluster to equal values, and *collapse four parameters into two named ones* before showing anything to a human. Nine near-duplicate cards become the two real independent values.

Worked: `R1_Width` 698 → 800 mm with `WallThickness` = 177 mm gives `R2_Width` = 800 − 354 = **446 mm**, and the right wall is still exactly 177 mm because the right edge is *derived*, not free.

### 7.3 Over-constrained, and why it must be detected mathematically

```
R1_Width       = 698
LeftOffset     = 177
RightClearance = 152      ⟹ R2_Width = 369 (derived)
```

Now *also* lock `R2_Width = 500`. The equation set is now contradictory. The correct behaviour is a red badge and a plain-language message — never a silently moved wall.

| State | Meaning | Detection |
|---|---|---|
| Under-constrained | Geometry can still move unexpectedly | DM under-determined block; `‖V_under‖ > ‖C_under‖` |
| Fully constrained | Determined up to discrete branches | Square, matched, full numerical rank |
| Over-constrained (conflicting) | Contradictory requirements | Dependent candidate **with non-zero residual** |
| Redundant | Extra rule that adds no information | Dependent candidate **with zero residual** |

The redundant/conflicting distinction is decided by the residual, not by counting. This matters: a naive "too many constraints" heuristic flags harmless redundancy as an error and destroys user trust.

### 7.4 The limit of the formula model

A DAG of formulas is one-directional. It handles *"change `R1_Width` → recompute `R2_Width`"*. It cannot handle:

- Drag `R2`'s right edge → **which** parameter should absorb it: `R1_Width`, `WallThickness`, or `ClearSpan`?
- Detect that two accepted rules say the same thing.
- Keep a symmetry, a tangency, or a haunch angle true while something unrelated moves.

Those need an **undirected constraint graph plus a numerical solver**. Hence the dual model.

## 8. Why uniform scaling is structurally wrong

The instinctive implementation of "make it bigger" is a conformal scale factor `k = L_target / L_original` applied to all coordinates. For engineering geometry this is **provably wrong**: it scales wall thickness, slab depth, haunch legs, cover, and inter-cell gaps along with the span. A 25 % span increase must not produce 25 % thicker walls.

```
WRONG:  ClearSpan × 1.25  →  scale everything

RIGHT:  ClearSpan target changes
        → solver moves the vertices that must move
        → offsets, angles, gaps and thicknesses hold as constraints
```

Uniform scaling `MUST` be removed from the solve path entirely. It `MAY` survive only as a non-authoritative drag *preview*, never committed. Anisotropic deformation is the whole point.

## 9. The dual-model principle — the architectural core

Two mathematical systems run side by side, each doing the job it is good at.

### System A — Scalar Dependency DAG (directional, arithmetic)

Handles named scalars and their algebraic relations:

```
ClearSpan, ClearHeight, WallThickness, SlabThickness,
OuterWidth, CellCount, Gap, HaunchSize, PostSpacing …

InnerWidth = OuterWidth − 2 × WallThickness
TotalSpan  = N·ClearSpan + (N+1)·WallThickness + (N−1)·Gap
```

Directed: `A → B → C`. Evaluated by topological sort (Kahn). Cycles are errors, detected by Tarjan.

### System B — Geometric Constraint Graph (non-directional, spatial)

Handles invariants between geometric entities:

```
parallel · perpendicular · coincident · offset · equal-length
symmetry · tangent · concentric · collinear · point-on-object · angle
```

Undirected and bipartite: `Line A ↔ constraint ↔ Line B`. There is no input or output. Solved simultaneously by non-linear least squares.

### How they cooperate

```
Driving parameter edit
        │
        ▼
  Scalar DAG (pre-solve pass, topological order)
        │  produces target values
        ▼
  Bind targets into constraint nodes
        │
        ▼
  Geometric constraint graph  ──►  PlaneGCS / analytical LM solve
        │  produces coordinates
        ▼
  DCEL re-sync  →  invariant checks  →  post-solve DAG (derived metrics)
        │
        ▼
  Render
```

**Why the separation is mandatory:** representing variational geometry inside a directed graph creates artificial cycles the moment geometry forms a closed loop — which it always does. Representing scalar arithmetic inside the constraint solver wastes the solver on problems that have an exact, instantaneous answer. Every prior document independently converged on this split; it is the load-bearing decision of the architecture.

---

# PART III — SYSTEM ARCHITECTURE

## 10. The three-layer product view

```
                    ┌───────────────────────────────────┐
                    │      DRAFTSMAN / END USER         │
                    │                                   │
                    │  Draw geometry                    │
                    │  Add dimensions                   │
                    │  Drag CAD grips                   │
                    │  Select semantic parameters       │
                    └────────────────┬──────────────────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────────┐
        │            PARAMETRIC CAD INTELLIGENCE LAYER           │
        │                                                        │
        │  Geometry normalisation · DCEL topology                │
        │  GEOM-RP/1 predicate engine (P1–P9)                    │
        │  Parameter inference · Formula inference               │
        │  Constraint graph · SVD admissibility gate             │
        │  DOF: Dulmage–Mendelsohn + Jacobian rank               │
        │  PlaneGCS / analytical LM solver                       │
        │  Ports · affine transforms · repeat rules              │
        │  LLM naming + explanation (optional, non-authoritative)│
        └────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────────┐
                 │      PARAMETRIC TEMPLATE          │
                 │                                   │
                 │  Driving parameters               │
                 │  Derived formulas (scalar DAG)    │
                 │  Geometric constraints            │
                 │  Components + ports               │
                 │  Repeat rules                     │
                 │  Validation rules + standards     │
                 │  Provenance + version             │
                 └────────────────┬──────────────────┘
                                  │
                                  ▼
                 ┌───────────────────────────────────┐
                 │            USER MODE              │
                 │                                   │
                 │  ClearSpan     2000 → 2500        │
                 │  ClearHeight   1500 → 1800        │
                 │  WallThickness  300 → 350         │
                 │  CellCount        1 → 3           │
                 │                                   │
                 │  → DAG → transforms → solver      │
                 │  → topology → invariants → draw   │
                 └───────────────────────────────────┘
```

This is **not** a procedural bridge generator. It is a general parametric geometric system for which bridge/civil templates are one application. That distinction is what makes "component can be anything" achievable.

## 11. Three front doors, one core

```
                         ┌─────────────────────────────────────────────┐
                         │      ParametricSketch  (canonical)          │
                         │  geometry · DCEL · constraints · params ·   │
                         │  formula DAG · components · semantics ·     │
                         │  validation · provenance · version          │
                         └───────▲──────────────▲──────────────▲───────┘
                                 │              │              │
        ┌────────────────────────┘              │              └────────────────────────┐
        │                                       │                                       │
┌───────────────────┐            ┌──────────────────────────┐          ┌────────────────────────────┐
│  DRAFTSMAN MODE   │            │       USER MODE          │          │  GAD INGESTION (Phase 10)  │
│  2D Canvas edit   │            │  DRIVING-param panel     │          │  PDF / DWG / raster        │
│  GEOM-RP detect   │            │  formula DAG eval        │          │  vectorise + OCR           │
│  param inference  │            │  re-solve + regenerate   │          │  build DCEL + semantics    │
│  formula inference│            │  invariant check         │          │  → SAME pipeline           │
│  LLM naming       │            │  redraw + export         │          └────────────────────────────┘
│  template commit  │            └──────────────────────────┘
└───────────────────┘
```

The ingestion path is an **alternative front door**, not a second engine. Nothing in draftsman or user mode depends on it, which is why it can ship last (or never) without affecting viability.

## 12. The nine-layer kernel stack

Each layer encapsulates one mathematical abstraction and knows nothing about the layers above it.

| # | Layer | Responsibility | Key content |
|---|---|---|---|
| 1 | **Topology** — half-edge DCEL / planar map | Combinatorial connectivity without metrics | Vertices, directed half-edges, twins, faces, boundary loops, nesting depth |
| 2 | **Geometry** — primitives & carriers | Binds topology to curves in ℝ² | Point, segment, circular arc, circle, polyline; (splines as carriers only) |
| 3 | **Local coordinate systems** | Hierarchical placement | 3×3 homogeneous affine frames, forward/inverse transforms, Gram–Schmidt frame construction |
| 4 | **Parameter system** | All scalar DOF | DRIVING / DERIVED / FIXED / MEASURED roles, bounds, units, history |
| 5 | **Geometric relationships** | Qualitative predicates | parallel, perpendicular, offset, tangent, concentric, symmetry, equal-length, chamfer |
| 6 | **Constraint system** | Declarative invariants as equations | `f_j(X) = 0` residuals + analytical Jacobian rows |
| 7 | **Dual-graph orchestration** | Causality vs. simultaneity | Scalar DAG (Tarjan/Kahn) + bipartite constraint graph |
| 8 | **Variational solver** | Numerical resolution | LM + Powell's Dogleg, SVD minimum-norm, DM decomposition, drag damping |
| 9 | **Resolved geometry & presentation** | Post-solve metrics and rendering | Shoelace area, centroids, second moments, winding; SVG/DXF/PDF emission |

**The invariant that makes this work:** topological facts (do these two edges share a vertex?) are stored separately from geometric metrics (how long is this edge?). Dragging a vertex or growing a wall therefore *cannot* split a joint, because the joint is one record, not two nearby coordinates. This mirrors the geometry/topology separation of ISO 10303-42 without importing a full B-rep implementation.

## 13. Persistent vs. transient state

A hard boundary, enforced by the type system.

```
PERSISTENT STATE  (immutable single source of truth, serialised)
├── Topology store ....... planar-map DCEL (vertices, half-edges, faces)
├── Parameter store ...... scalars, roles, bounds, units, driving values
├── Constraint store ..... type, entity refs, target/param ref, strength, provenance
├── Formula store ........ symbolic ASTs for DERIVED parameters
├── Component store ...... templates, instances, ports, repeat rules
├── Semantic store ....... component graph, face/edge tags, standards metadata
└── Construction store ... datum lines, reference points, symmetry centrelines

                     │  (evaluated by DAG + solver + matrix pipelines)
                     ▼

TRANSIENT STATE  (fully derivable, discardable, never serialised)
├── Affine matrix cache ....... local→world 3×3 stacks
├── Coordinate buffers ........ Float64Array of solved (x, y)
├── Jacobian cache ............ sparse J, QR/SVD factorisations
├── Metric cache .............. areas, centroids, perimeters, second moments
├── Diagnostic cache .......... DOF blocks, residual norms, conflict sets
└── Presentation cache ........ SVG path strings, grips, snap glyphs, badges
```

Rules:

- Coordinates in persistent storage are parameterised **exclusively by topological vertex ID**, so two primitives can never store conflicting coordinates for the same joint.
- All user actions dispatch **pure reducer events**; undo/redo uses structural sharing over a bounded history.
- If a solve diverges or produces topological invalidity, the **transaction is rejected wholesale** and state reverts cleanly. The user never sees torn geometry.

## 14. Repository and module layout

```
apps/
  web/                          # React + TS shell (Draftsman, Author, User modes)

packages/
  geometry/                     # primitives, adapters, tolerance policy, predicates
    predicates/vectorPredicates.ts     # P1–P9
    lcs/affineMatrix.ts, frame.ts      # 3×3 affine algebra
    topology/dcel.ts                   # half-edge planar map
  topology/                     # planar arrangement, face tracing, face identity
  constraints/                  # constraint records, residuals, analytical Jacobians
  parameters/                   # roles, bounds, units, parameter manager
  expressions/                  # parser → AST → safe evaluation, DAG, Tarjan/Kahn
  inference/                    # GEOM-RP engine, clustering, formula discovery,
                                #   admissibility filter, candidate queue, drag-invariance
  solver/                       # PlaneGCS adapter, LM/Dogleg, DM decomposition,
                                #   SVD, drag damping, subgraph partitioning
  components/                   # ComponentDefinition, ports, repeat rules, port solver
  templates/                    # TemplateDefinition, versioning, migration, registry
  validation/                   # invariant checker, standards profiles, stability sweeps
  rendering/                    # SVG scene graph, grips, dimension badges, hatching
  ai/                           # LLM adapter, schemas, prompts, cache, fallback namer
  io/                           # SVG / DXF / PDF exporters; DXF / PDF / raster importers

services/
  api/                          # FastAPI: persistence, auth, LLM proxy, batch render
  import-worker/                # ingestion jobs (Phase 10)
  export-worker/                # DXF/PDF sheet generation

schemas/
  parametric-sketch.schema.json # JSON Schema draft 2020-12 — the contract
  template.schema.json

fixtures/
  basic/  civil/  difficult/    # see §74

tests/
  unit/  property/  golden/  stability/  e2e/
```

**Rule:** shared TypeScript types are **generated from the JSON Schema**, never hand-duplicated. Python dataclasses/Pydantic models are generated from the same schema. One contract, three languages, no drift.

## 15. Data-flow contracts between modules

| Producer | Consumer | Contract |
|---|---|---|
| Canvas editor | `ParametricSketch.geometry`, user-added `constraints` | The editor mutates **only** geometry and explicit user constraints. It never writes parameters, formulas, or inferred constraints. |
| Normaliser | DCEL builder | Raw primitives + one tolerance policy → welded vertices, split edges, oriented loops |
| DCEL builder | GEOM-RP engine | Faces, half-edges, adjacency, nesting depth (even = solid, odd = void) |
| GEOM-RP engine | Candidate queue | `Candidate[]` with predicate type, refs, measured value, deviation, confidence, provenance |
| Candidate queue | Admissibility filter | Every candidate, before display, without exception |
| Admissibility filter | Author review UI | Only independent candidates; redundant ones dropped silently; conflicting ones flagged with diagnosis |
| Author review UI | `ParametricSketch.parameters/constraints/semantics` | Only after explicit human accept |
| Scalar DAG | Constraint graph | Target scalar values bound into constraint nodes |
| Solver | Coordinate buffers + `dofReport` | Solved coordinates, convergence status, residuals, block partition, conflict list |
| Solver | Invariant checker | Post-solve state for the ten-point acceptance check |
| LLM adapter | `parameters[].name`, `semanticTag`, explanation text | **Nothing else, ever.** No coordinates, no values, no constraint edits. |

---
# PART IV — THE CANONICAL DATA MODEL

Everything in the system reads and writes exactly one document type. This section is the contract.

## 16. `ParametricSketch` — conceptual shape

```
ParametricSketch
│
├── metadata          id, name, schemaVersion, engineVersion, units, tolerances
├── geometry          vertices, lines, arcs, circles, polylines, construction geometry
├── topology          half-edges, faces, loops, adjacency, nesting depth
├── constraints       bipartite constraint records (the design intent)
├── parameters        named scalars with roles, bounds, units, semantic tags
├── expressions       scalar DAG: DERIVED parameter formulas
├── components        component definitions + instances (local frames)
├── ports             named local frames on component boundaries
├── repeats           count-driven procedural array rules
├── semantics         component graph: walls, slabs, webs, haunches, voids, posts
├── validation        standards profile bindings, bounds, code references
├── dofReport         solver + structural diagnosis (transient, but serialised for audit)
└── provenance        who/what asserted each constraint and parameter, and why
```

## 17. Units and tolerance — one policy, defined once

Five conflicting vertex-weld tolerances across five files was a confirmed latent correctness bug in the existing code. It is fixed by a single shared policy object, and **no module may define its own**.

```ts
interface TolerancePolicy {
  units: 'mm';                 // ONE canonical internal unit, always
  weld_mm:            number;  // topological vertex welding                default 0.5
  geometry_mm:        number;  // predicate distance comparisons             default 0.5
  cluster_mm:         number;  // parameter value clustering                 default 1.0
  angle_rad:          number;  // predicate angular comparisons  0.5° = 0.008726
  collinear_rad:      number;  // collinearity                               default 0.05
  solver_residual:    number;  // ‖F‖∞ convergence                           default 1e-8
  singular_value_eps: number;  // SVD rank determination                     default 1e-10
  independence_eps:   number;  // ‖g⊥‖ admissibility threshold               default 1e-6
  snap_import_mm:     number;  // endpoint snapping during ingestion         default 2.0
}
```

**Clause (binding):** tolerances `MUST` be absolute real-world units. They `MUST NOT` be expressed in pixels, `MUST NOT` be scaled by viewport zoom, and `MUST NOT` vary per module. Model-space millimetres, everywhere, one object, injected.

**Scale-aware variant (optional):** for drawings spanning several orders of magnitude, `ε_d = max(abs_tol, rel_tol × drawingExtent)` with `abs_tol = 0.5 mm`, `rel_tol = 0.1 %` is permitted — but the policy object still owns it; call sites never compute it.

## 18. Geometry primitives and the adapter table

Every authoring shape lowers into a small primitive set that the resolver understands. **Shape identity survives only for rendering and editing; detection never branches on it.**

| Authoring shape | Resolver representation | Notes |
|---|---|---|
| Line / arrow | Segment between two topological vertices | Direction and normal derive from endpoints |
| Rectangle | 4 segments + 4 vertices | Creation asserts 4 perpendicularity + 2 parallel facts as *Geometric Facts* |
| Polygon / polyline | Ordered segments + vertices | Preserve edge order, winding, open/closed state |
| Circle | Centre point + radius | A circle is an arc spanning 360° |
| Circular arc | Centre, radius, start/end angle, endpoint vertices | Supplies tangent directions |
| Ellipse / spline / imported curve | Explicit **carrier adapter** + sampled bounds for broad phase | Preserved and rendered, but `MUST NOT` advertise editable constraints until a residual + Jacobian exists for them |

```ts
type Id = string;                       // stable string IDs — never array indices

interface Point    { id: Id; x: number; y: number; fixed?: boolean; construction?: boolean }
interface Line     { id: Id; p1: Id; p2: Id; construction?: boolean; semanticRole?: string }
interface Arc      { id: Id; center: Id; radius: number; startAngle: number; endAngle: number;
                     startPoint?: Id; endPoint?: Id; construction?: boolean }
interface Circle   { id: Id; center: Id; radius: number; construction?: boolean }
interface Polyline { id: Id; vertices: Id[]; closed: boolean; construction?: boolean }

interface Geometry {
  points: Point[]; lines: Line[]; arcs: Arc[]; circles: Circle[]; polylines: Polyline[];
}
```

**Anchor rule (adopted verbatim from arXiv 2504.13178 App. A.4):** every `ParametricSketch` `MUST` fix at least one entity (or one LCS origin) to remove the three global rigid-body DOF. Without it, DOF analysis mis-reports three spurious degrees of freedom on every sketch and every diagnosis downstream is wrong.

## 19. DCEL topology — derivation, face identity, and why it matters

Topology is **derived from primitives, never authored**, and re-synced when geometry changes materially.

```ts
interface Vertex   { id: Id; point: Id; incidentEdge: Id; semanticTags?: string[] }
interface HalfEdge { id: Id; origin: Id; twin: Id | null; next: Id; prev: Id;
                     face: Id; edgeGeom: Id }
interface Face     { id: Id; outerComponent: Id | null; innerComponents: Id[];
                     nestingDepth: number; semanticCategory?: FaceCategory;
                     hatchPattern?: string; tags: string[] }

type FaceCategory =
  | 'VOID' | 'TOP_SLAB' | 'BOTTOM_SLAB' | 'OUTER_WALL' | 'INTERNAL_WEB'
  | 'HAUNCH' | 'FOOTING' | 'BARRIER' | 'DECK' | 'PIER' | 'UNCLASSIFIED';
```

### Construction algorithm (planar arrangement)

1. Collect all edge primitives.
2. Compute pairwise intersections (broad phase via R-tree / `PlanarSet`; narrow phase exact) and split edges at true intersections.
3. Weld endpoints within `weld_mm` into single topological vertices (union-find).
4. Sort half-edges around each vertex by angle; wire `next` / `prev` / `twin`.
5. Trace faces by following `next` to closure.
6. Assign nesting depth by ray casting: **even depth = solid material, odd depth = interior void.**

Complexity is O(n log n), dominated by intersection sorting, so rebuild is **lazy**: geometry edits mark the DCEL dirty; it is regenerated before any face-dependent operation (semantic tagging, boolean/area ops, hatching, export).

### Face identity persistence — a subtle correctness requirement

Semantic tags attach to faces. If face IDs churn on every rebuild, tags detach and the template silently loses meaning under a parameter sweep. Therefore:

> **Rule:** After each rebuild, each new face `MUST` be matched to the previous face with the closest interior centroid **and** overlapping tag set. Face IDs are stable across rebuilds under this matching. This `MUST` have dedicated unit tests that sweep every DRIVING parameter across its range and assert tag survival.

## 20. Parameters and roles

```ts
type ParameterRole = 'DRIVING' | 'DERIVED' | 'FIXED' | 'MEASURED';
type ParameterType = 'LENGTH' | 'ANGLE' | 'COUNT' | 'RATIO' | 'BOOLEAN';
type Unit = 'mm' | 'm' | 'deg' | 'rad' | 'count' | 'ratio';

interface Parameter {
  id: Id;
  name: string;                  // "ClearSpan", "WallThickness" — never "R1_Width"
  role: ParameterRole;
  type: ParameterType;
  unit: Unit;
  value: number;
  min?: number; max?: number; step?: number;
  expr?: string;                 // present iff role === 'DERIVED'
  semanticTag?: string;          // WALL_THICKNESS, CLEAR_SPAN, …
  sourceGeometry?: Id[];         // the primitives this parameter was measured from
  confidence?: number;           // 0..1 — inference confidence at proposal time
  provenance: 'GeometricFact' | 'Inference' | 'UserConstraint' | 'UserFormula' | 'Measurement';
  codeRef?: string;              // e.g. "IRC:112 Table 14.2"
  uiGroup?: string;              // "Clearance Dimensions", "Structural Thicknesses"
}
```

| Role | Meaning | Who may change it | Example |
|---|---|---|---|
| **DRIVING** | Independent user input | User (within bounds) | `ClearSpan = 2000` |
| **DERIVED** | Computed by the scalar DAG | Nobody directly; edit prompts conversion | `InnerWidth = OuterWidth − 2·WallThickness` |
| **FIXED** | Template/standard constant | Author only | `HaunchAngle = 45°`, `MinCover = 40 mm` |
| **MEASURED** | Recovered from imported geometry, read-only | Nobody — becomes DRIVING only on author promotion | `ScannedSpan = 3499.7` |

Worked example of a fully-specified parameter:

```
Parameter
  name           = "WallThickness"
  role           = DRIVING
  type           = LENGTH
  value          = 300 mm
  semanticTag    = WALL_THICKNESS
  sourceGeometry = [edge_17, edge_22, edge_31, edge_42]
  confidence     = 0.94
  provenance     = Inference (author-confirmed)
```

which lets the UI say, truthfully: *"WallThickness = 300 mm because four independent parallel offsets cluster at 299.875 mm ± 0.225 mm across symmetric regions."*

## 21. Expressions — the scalar DAG

```ts
interface FormulaEdge { from: Id; to: Id }             // 'to' depends on 'from'
interface FormulaDAG  { nodes: Id[]; edges: FormulaEdge[] }

interface Formula {
  targetParameterId: Id;
  expression: string;                                   // "OuterWidth - 2*WallThickness"
  dependencies: Id[];                                   // extracted from the AST, never by substring
  description?: string;
}
```

### Dependency extraction — the substring bug and its fix

The confirmed bug in the existing code:

```ts
// WRONG — a parameter named W registers as a dependency of WallThickness,
//         SkewWidth, Weight, and anything else containing the letter.
if (other.name !== dep.name && dep.formula.includes(other.name)) { … }
```

The fix is not a better regex. Parse the expression once with the existing `expression.ts` parser, walk the AST, and collect **identifier nodes only**. Dependency edges are built strictly from verified symbol references. Cache the parsed AST; re-evaluate against the current symbol table on every solve.

### Evaluation and cycle detection

- Build the DAG in `networkx.DiGraph` (server) / an equivalent TS structure (client).
- Order by **Kahn's topological sort**; `NetworkXUnfeasible` (or the TS equivalent) is the cycle detector; `find_cycle` returns the offending edge list so the author sees exactly which formulas are circular.
- **Tarjan's SCC** runs continuously during formula editing to block a cycle at entry rather than at solve time.

### Safe evaluation — mandatory

Author and user formulas are **never** passed to `eval`.

- **Server:** `asteval` (MIT) — restricted AST interpreter forbidding `import`, `getattr`/`setattr`, class creation, decorators, `lambda`, `exec`/`eval`, and neutralising `**`/`open`. Symbol table restricted to declared parameter names plus a math whitelist.
- **Client:** `mathjs` (Apache-2.0) or `expr-eval` (MIT) with a scoped scope object. Never JS `eval`/`Function`.
- Cap expression length and evaluation time. Treat `expr` strings from an untrusted template file strictly as data.

### Canonical formula set for a box culvert

```
InnerWidth   = OuterWidth  − 2·WallThickness
InnerHeight  = ClearHeight
OuterHeight  = ClearHeight + SlabThickness_top + SlabThickness_bot
TotalWidth   = 2·ClearSpan + 2·WallThickness + t_mid          (2-cell)
HaunchLeg    = HaunchSize                                     (45° ⟹ legs equal)
InnerX       = OuterX + WallThickness
InnerY       = OuterY + SlabThickness
Bay2X        = Bay1X  + Bay1Width + WebThickness
```

Generalised multi-cell (the relation the current engine fails to find):

```
TotalSpan = N·ClearSpan + (N+1)·WallThickness + (N−1)·Gap
```

## 22. Constraints — the design intent

Constraints are stored **abstractly** and compiled to the solver's vocabulary at solve time.

```ts
type ConstraintKind =
  | 'coincident' | 'collinear' | 'parallel' | 'perpendicular' | 'horizontal' | 'vertical'
  | 'equal_length' | 'equal_radius' | 'symmetric' | 'tangent' | 'point_on_object'
  | 'midpoint' | 'concentric' | 'offset' | 'distance' | 'distance_x' | 'distance_y'
  | 'angle' | 'radius' | 'diameter' | 'chamfer_equal_leg' | 'fixed';

type ConstraintStrength =
  | 'fixed'        // datum, immovable
  | 'driving'      // user-asserted dimension; removes DOF
  | 'hard'         // structural invariant from topology
  | 'soft'         // accepted inference, may be relaxed on conflict
  | 'reference'    // measurement only; driving:false; removes NO DOF
  | 'temporary';   // live drag; enforced best-effort; removes NO DOF

interface Constraint {
  id: Id;
  kind: ConstraintKind;
  refs: Id[];                    // primitive IDs (+ sub-point role codes)
  value?: number;                // literal target (mm or rad)
  paramRef?: Id;                 // OR a named parameter that drives it
  strength: ConstraintStrength;
  driving: boolean;
  predicate?: 'P1'|'P2'|'P3'|'P4'|'P5'|'P6'|'P7'|'P8'|'P9';
  clause?: string;               // "GEOM-RP/1 Clause 6"
  provenance: 'GeometricFact' | 'Inference' | 'UserConstraint';
  confidence?: number;           // 1.0 when author-asserted
  state: 'active' | 'suppressed' | 'conflicting' | 'redundant';
  diagnostic?: string;
}
```

### Assertion-class taxonomy

| Class | Origin | Strength | DOF impact | Lifecycle |
|---|---|---|---|---|
| **Geometric Fact** | Intrinsic topology — shared vertices, closed loops, rectangle corners | Structural / inviolable | Removes 2 DOF per coincidence, at the data-structure level | Held indefinitely by DCEL connectivity |
| **Geometric Inference** | Heuristic alignment detected within tolerance | Soft / candidate | Proposes −1 DOF, subject to rank test | Shown as candidate; discarded if overridden or rejected |
| **User Constraint** | Explicit engineering declaration (`ClearSpan = 2000`) | Hard | −1 or −2 DOF | Hard residual row in the active system |
| **User Formula** | Algebraic relation between scalars | Functional dependency | −1 DOF by converting a variable to DERIVED | Evaluated by DAG topological sort *before* the solve |
| **Derived Measurement** | Analytical metric of the solved state (area, centroid, section modulus) | Passive observer | 0 DOF | Post-solve, read-only binding |

### Constraint vocabulary → detection → residual

| Family | Constraint | Detection measurement | Solver residual concept |
|---|---|---|---|
| Topology | Coincident | Point distance | Same vertex, or x/y equality |
| Linear | Parallel, perpendicular, angle | Cross product, dot product, signed angle | Cross/dot, or normalised angle error |
| Metric | Length, point distance, equal length | Euclidean norm | Squared-distance or length difference |
| Offset | Point-to-line, parallel-chain offset | Projection on the edge normal | Signed normal distance − target |
| Circular | Concentric, radial offset, point-on-circle | Centre distance, radius | Centre equality or radial error |
| Tangency | Segment–circle, circle–circle, arc variants | Centre-to-carrier distance | Distance − r, or − (r₁ ± r₂) |
| Incidence | Point-on-line, point-on-arc, collinear | Cross product, radial/angular check | Carrier distance + range condition |
| Symmetry | Point/edge symmetry about an axis | Reflection matrix error | Reflected-coordinate difference |
| Reference | Fixed point, fixed angle, construction axis | Explicit author action | Coordinate or direction target |

**Containment, repeated spacing, "wall", "clear span", and "cell" are NOT primitive constraints.** They are higher-level candidate *patterns* composed from this vocabulary. A wall is two offset edge chains; a cell is a bounded void between them; a railing is a repeated post pattern. No bridge-specific mathematics ever enters the solver.

### Compilation to PlaneGCS

Constraint names verified against FreeCAD `src/Mod/Sketcher/App/planegcs/Constraints.h`:

| Abstract kind | PlaneGCS / Sketcher constraint |
|---|---|
| `parallel` | `Parallel` |
| `perpendicular` | `Perpendicular` |
| `equal_length` / `equal_radius` | `Equal` |
| `tangent` | `Tangent` / `TangentCircumf` |
| `coincident` | `P2PCoincident` |
| `point_on_object` | `PointOnObject` |
| `symmetric` | `Symmetric` |
| `distance` | `P2PDistance` / `P2LDistance` |
| `distance_x` / `distance_y` | `DistanceX` / `DistanceY` |
| `angle` | `L2LAngle` / `AngleViaPoint` |
| `radius` | `CircleRadius` / `ArcRadius` |
| **`offset`** | **not native** — compiles to `Parallel` + equal perpendicular distance |

That last row is the important one: **"wall thickness" is an offset**, and an offset is *parallel + constant perpendicular distance*. That is exactly why the wall stays 300 mm when the span grows — the invariant is stated as a geometric relation, not carried as a coordinate.

For server-side FreeCAD `SketchObject` driving, the verified constructor forms are:
`Constraint("Coincident", e1, pos1, e2, pos2)`, `Constraint("Parallel", l1, l2)`, `Constraint("Perpendicular", l1, l2)`, `Constraint("Equal", e1, e2)`, `Constraint("Tangent", e1, e2)`, `Constraint("Symmetric", e1, p1, e2, p2, refEdgeOrPoint)`, `Constraint("PointOnObject", e, pos, edgeToBeOn)`, `Constraint("Distance", e1, p1, e2, p2, Quantity('123 mm'))`, `Constraint("DistanceX"|"DistanceY", …, value)`, `Constraint("Radius", edge, value)`, `Constraint("Angle", l1, l2, value)`. Geometry refs: positive int = edge index; −1 = X axis; −2 = Y axis; −3… = external geometry. Point-position codes: 0 = whole, 1 = start, 2 = end, 3 = centre.

## 23. Components, ports, and repeats

This is what makes the system general rather than a bridge program.

### 23.1 Component definition

```ts
interface ComponentDefinition {
  id: Id;
  name: string;
  category: 'component' | 'assembly';
  parameters: Parameter[];       // local parameter space
  primitives: Geometry;          // authored in LOCAL coordinates
  constraints: Constraint[];
  ports: Port[];
  repeats?: RepeatRule[];
  children?: ComponentInstance[];
  semantics?: Component[];
}
```

**Do not build `CulvertTemplate`, `ROBTemplate`, `PierTemplate` as separate systems.** A culvert is one component. A pier cap is another. A railing is another. A user-drawn arbitrary shape is another. All use this one definition.

### 23.2 Ports — the declarative attachment mechanism

```ts
interface Port {
  id: Id;
  kind: 'point' | 'edge' | 'axis';
  localFrame: { origin: { x: string; y: string }; angle: string };  // expressions in the
                                                                    // OWNING template's params
  direction?: 'in' | 'out' | 'bidirectional';
  length?: string;               // for edge ports
}

interface ComponentInstance {
  instanceId: Id;
  templateId: Id;
  parameterOverrides: Record<string, string>;
  attachedVia?: {
    parentInstanceId: Id;
    parentPortId: Id;
    ownPortId: Id;
    offsetExpr?: { along: string; normal: string; rotate?: string };
  };
}
```

Resolution is deliberately boring: build a dependency graph from `attachedVia.parentInstanceId` edges, topologically sort it (**the same Tarjan/Kahn code that orders scalar formulas, doing double duty**), then compose each instance's frame from its parent's resolved frame, the parent port frame, the offset, and the inverse of its own port frame (§37).

### 23.3 The generalisation proof

Every worked example in the prior research was a nested-rectangle-with-wall-thickness. That is a tell that generalisation was never tested. Here is a component that is structurally nothing like a culvert cell — a **point-repeat-along-a-path** instead of an **offset-nested-rectangle**:

- **`ParapetPost`** — one DRIVING parameter `PostHeight`; a single port `base` at local `(0,0)`, angle `0`.
- **`RailingRun`** — DRIVING `RunLength`, `PostSpacing`; a repeat rule instantiating `ceil(RunLength / PostSpacing) + 1` posts; each attaches its `base` via `offsetExpr.along = "i * PostSpacing"`.
- **Composition** — the deck template exposes a `deckEdge` edge-port along its full length; `RailingRun` attaches there. **No bridge-specific code appears in either template.**

Nothing in `Port`, `ComponentInstance`, or the resolution algorithm mentions spans, walls, or haunches. The same mechanism that composes a box-culvert cell onto an assembly composes a fence post onto a railing. That is the generalisation test the earlier documents skipped, and it passes.

### 23.4 Repeat rules — counts are topology, not constraints

**The hardest problem in the system, and its answer.**

Integer counts (cells, bays, posts, spans) **cannot** be solved by the numeric solver, because changing a count changes the *number* of primitives and constraints — the system's degrees of freedom change. That is a **topology mutation, not a parameter update.**

```ts
interface RepeatRule {
  id: Id;
  type: 'linear_array' | 'path_array' | 'polar_array' | 'mirror';
  sourceComponent: Id;
  countParamRef: Id;             // integer parameter
  spacingExpr: string;           // driven OR derived — an authoring decision
  spacingMode: 'driven' | 'derived';   // fixed spacing (span grows) vs spacing = span/count
  direction: [number, number];
  anchorPortId: Id;
  indexVariable: string;         // "i", usable inside offset expressions
}
```

Handling, in strict order:

1. A repeated structure is stored as a **procedural node**, never as flattened geometry.
2. On any change, the instancing engine **deterministically regenerates** flat primitives and constraints from the rule: emit `count` copies, wire inter-instance coincidences (instance *i* end vertex ≡ instance *i+1* start vertex), stamp **index-derived IDs** (`bay_03/ln_002`).
3. **Only after regeneration** is the system handed to the solver.
4. Because regeneration is deterministic and ID-stable (IDs are a pure function of instance index), semantic tags and DERIVED formulas referencing "the spacing parameter" survive count changes; formulas referencing a specific instance are re-bound by index.

```
Post[i].position = Start + i × PostSpacing × Direction
PostCount = 12 → 16 creates four more posts.
```

This is fundamentally different from scaling a railing. It mirrors how FreeCAD's Draft `Array` and PartDesign patterns separate pattern features from sketch solving. **Pure constraint solving cannot change cardinality — do not attempt it.**

## 24. Semantics — the component graph

```ts
interface Component {
  id: Id;
  type: string;   // outer_wall | inner_web | top_slab | bottom_slab | haunch | void
                  // | pier | bay | cell | post | footing | barrier | wing_wall | …
  faces: Id[];    // DCEL face IDs owned
  edges: Id[];
  parent?: Id;
  children: Id[];
  params: Id[];
  confirmedBy: 'author' | 'inference-pending';
}
```

Hierarchy: culvert → cells → walls/slabs/haunches. Because face IDs persist across rebuilds (§19), component→face links survive re-solves and count changes.

## 25. `TemplateDefinition` — the deliverable artefact

One versioned format replaces the three parallel template representations currently in play.

```ts
interface TemplateDefinition {
  id: Id;
  name: string;
  category: 'component' | 'bridge' | 'detail' | 'assembly';
  schemaVersion: string;             // "1.0"
  engineVersion: string;
  standardsReference?: string;       // "IRC:SP:13-2022", "RDSO/B-xxxx Rev 3"

  parameters: Parameter[];
  expressions: Formula[];
  geometry: Geometry;                // local coordinates
  topology?: DCEL;                   // cached; regenerable
  constraints: Constraint[];
  ports: Port[];
  repeats?: RepeatRule[];
  components?: ComponentInstance[];
  semantics: Component[];
  validation: ValidationRule[];
  provenance: ProvenanceRecord[];    // which inference produced what, and who accepted it
  history?: EditRecord[];            // append-only audit trail
}
```

### Versioning and schema evolution

- Canonical JSON, UTF-8, top-level `schemaVersion` + `engineVersion`.
- Validate against the published **JSON Schema (draft 2020-12)** on load *and* before commit.
- Additive changes bump **minor** (back-compatible). Breaking changes bump **major** and ship a registered `migrate(doc, from, to)` chain. Loaders **refuse** documents whose major version exceeds the engine's.
- Keep an append-only `history` of parameter edits for audit and user-mode rollback.

### Template validation report

Produced at save time, before publish:

```ts
interface TemplateValidationReport {
  errors:   { code: string; parameterOrEntity: string; message: string }[];
  warnings: { code: string; parameterOrEntity: string; message: string }[];
  checks: {
    unboundPorts: string[];
    expressionCycles: string[][];
    duplicateDrivingDimensions: string[];
    outOfRangeDefaults: string[];
    unresolvedSolverErrors: string[];
    unreachableComponents: string[];
  };
}
```

## 26. Standards profiles — keep codes out of the kernel

Do **not** bake IRC/RDSO rules into the geometry engine.

```ts
interface StandardsProfile {
  id: 'RDSO_CULVERT' | 'IRC_STRUCTURAL' | 'CUSTOM_ORG' | string;
  revision: string;
  parameterBounds: Record<string, { min?: number; max?: number; note: string; codeRef: string }>;
  requiredParameters: string[];
  relationships: { expr: string; message: string; codeRef: string }[];
}
```

Representative rules (to be re-read from the current official code text before hard-coding — secondary sources vary and editions are revised):

| Rule | Typical value | Reference |
|---|---|---|
| Minimum concrete grade, RCC bridge components | M25 | IRC:112 Cl. 6.1 |
| Minimum concrete grade, prestressed | M35 (M90 max recognised) | IRC:112 Cl. 6.1 |
| Minimum cover, moderate exposure | 40 mm | IRC:112 Table 14.2 |
| Minimum cover, RC piers normal exposure | ~50 mm | IRC:112 |
| Minimum cover, marine XS2/XS3 | ~55 mm | IRC:112 |
| Standard box cell sizes | 2×2 m, 3×3 m, … | IRC:SP:13 |
| Slab-culvert thickness by span | ~300 mm @ 2.0 m, ~500 mm @ 4.0 m | IRC:SP:13 tables |
| Minimum slab thickness (crack/cover) | ≥ 200 mm | practice + IRC:SP:13 |
| Minimum wall thickness | ≥ 250 mm | practice |
| Minimum haunch leg | ≥ 100 mm | practice |
| Aspect-ratio sanity | ClearSpan / ClearHeight ≤ 3.0 | practice |

Violations become **validation metadata**, not solver logic: the canvas still updates, the input border turns amber, a tooltip cites the clause, and the drawing is flagged non-compliant in its metadata header. Hard blocks are reserved for physically impossible values (`InnerWidth ≤ 0`).

---
# PART V — THE MATHEMATICAL KERNEL

Everything here is deterministic numerical linear algebra and computational geometry. No learned component appears anywhere in this part.

## 27. Notation and the state vector

Let the planar geometry be defined by `n` unique **topological** vertices, giving the state vector

```
X = [x₁, y₁, x₂, y₂, …, xₙ, yₙ]ᵀ  ∈ ℝ^(2n)
```

A geometric constraint `k` is a scalar residual `r_k(X) = 0`. The full system is

```
F(X) = [r₁(X), r₂(X), …, r_m(X)]ᵀ = 0 ,     F : ℝ^(2n) → ℝ^m
```

with Jacobian

```
J(X) ∈ ℝ^(m × 2n) ,   J_ij = ∂r_i(X) / ∂X_j
```

Equilibrium is declared when

```
‖F(X)‖∞ < ε_tol        (ε_tol = 1e-8)
```

Convergence `MUST` require a small **residual**, not merely a small step. A small step with a large residual is *stagnation*, and reporting it as success is a bug.

For a segment `A → B`: direction `d = B − A`, length `L = ‖d‖`, unit direction `d̂ = d/L`, unit normal `n̂ = (−d̂_y, d̂_x)`.

## 28. Residual and Jacobian catalogue

Analytical derivatives are mandatory. Finite differences introduce truncation error, require 2n residual evaluations per iteration, and degrade convergence. Every residual below ships with exact partials and a finite-difference cross-check test (§75.2).

### 28.1 Point-to-point distance (squared form)

Quadratic form avoids the square-root singularity at `Pᵢ = Pⱼ`:

```
r_dist = (xⱼ − xᵢ)² + (yⱼ − yᵢ)² − D²

∂r/∂xᵢ = −2(xⱼ − xᵢ)      ∂r/∂yᵢ = −2(yⱼ − yᵢ)
∂r/∂xⱼ = +2(xⱼ − xᵢ)      ∂r/∂yⱼ = +2(yⱼ − yᵢ)
```

### 28.2 Horizontal / vertical alignment

```
r_horiz = yⱼ − yᵢ = 0     ∂r/∂yᵢ = −1,  ∂r/∂yⱼ = +1
r_vert  = xⱼ − xᵢ = 0     ∂r/∂xᵢ = −1,  ∂r/∂xⱼ = +1
```

### 28.3 Parallelism (2-D cross product vanishes)

For `V₁ = P₂ − P₁`, `V₂ = P₄ − P₃`:

```
r_parallel = (x₂ − x₁)(y₄ − y₃) − (y₂ − y₁)(x₄ − x₃) = 0
```

### 28.4 Perpendicularity (2-D dot product vanishes)

```
r_perp = (x₂ − x₁)(x₄ − x₃) + (y₂ − y₁)(y₄ − y₃) = 0
```

### 28.5 Directed wall-offset (the wall-thickness invariant)

The single most important residual in civil work. For baseline `Pₐ → P_b` and offset point `P_p` at signed perpendicular distance `T`:

```
Δx = x_b − xₐ,   Δy = y_b − yₐ,   L = √(Δx² + Δy²)

N = −Δy(x_p − xₐ) + Δx(y_p − yₐ)          (signed cross-product numerator)

r_offset = N / L − T = 0
```

Partials with respect to the offset vertex:

```
∂r/∂x_p = −Δy / L        ∂r/∂y_p = +Δx / L
```

Partials with respect to the baseline vertices (quotient rule, because L varies):

```
∂r/∂xₐ = (y_p − y_b)/L − N(xₐ − x_b)/L³      ∂r/∂yₐ = (x_b − x_p)/L − N(yₐ − y_b)/L³
∂r/∂x_b = (yₐ − y_p)/L + N(xₐ − x_b)/L³      ∂r/∂y_b = (x_p − xₐ)/L + N(yₐ − y_b)/L³
```

**Semantic point:** wall thickness is a *perpendicular distance*, not a global scale factor. Encoding it this way is precisely what makes anisotropic expansion work.

### 28.6 Haunch / chamfer leg equality

For a haunch joining corner `P_c` to slab point `P₁` and wall point `P₂`, horizontal and vertical leg projections must match:

```
r_haunch = (x₁ − x_c)² − (y₂ − y_c)² = 0

∂r/∂x₁ = +2(x₁ − x_c)      ∂r/∂y₂ = −2(y₂ − y_c)
∂r/∂x_c = −2(x₁ − x_c)     ∂r/∂y_c = +2(y₂ − y_c)
```

The quadratic form maintains continuous C¹ differentiability everywhere, avoiding the gradient discontinuity of an absolute-value formulation.

**Generalisation:** this residual expresses a *45° equal-leg* haunch. For arbitrary splay angles the constraint is instead an **angle constraint on the measured angle** (§28.7 / P4), with the angle itself becoming an author-visible parameter. The hardcoded 45° test is removed; 30°, 45°, and 60° chamfers all become "a chamfer with an angle".

### 28.7 Angle between two lines

```
θ = atan2(d₁ × d₂ , d₁ · d₂)
r_angle = θ − θ_target = 0
```

Signed, and therefore able to distinguish a 30° splay from a 150° one. This is the general replacement for every hardcoded angle in the codebase.

### 28.8 Concentricity and radial offset

```
r_concentric = ‖C_A − C_B‖ = 0         (or componentwise x, y equality)
r_radial     = |r_A − r_B| − t = 0
```

### 28.9 Tangency (segment ↔ circle, circle ↔ circle)

```
r_tangent_line   = |(C − A_start) × d̂| − r          = 0
r_tangent_circle = ‖C_A − C_B‖ − (r_A ± r_B)        = 0     (+ external, − internal)
```

with the projected contact point required to lie within the segment range.

### 28.10 Point-on-object / collinearity

```
r_on_line = (P − A) × d̂ = 0            (plus a range condition)
r_on_arc  = ‖P − C‖ − r  = 0           (plus an angular range condition)
```

### 28.11 Bilateral symmetry

Reflection about an axis through `O` with unit normal `n̂` uses the Householder matrix:

```
R = I − 2 n̂ n̂ᵀ
P′_A = O + R (P_A − O)
r_symmetry = ‖P′_A − P_B‖ = 0
```

This is the one genuinely matrix-native predicate — a real 2×2 linear map — and it is the cleanest way to state "these two things are mirror images" without hand-rolled coordinate arithmetic. Bridge cross-sections are symmetric by design, so it earns its place.

### 28.12 Drag targets (temporary)

```
r_drag,x = x_d − x_cursor = 0
r_drag,y = y_d − y_cursor = 0
```

Marked `temporary`: enforced best-effort, removes no DOF, dropped on mouse-up.

## 29. The variational solver

### 29.1 Objective

```
min_X  Φ(X) = ½ ‖F(X)‖² = ½ F(X)ᵀ F(X)
```

### 29.2 Levenberg–Marquardt

```
( J(X_k)ᵀ J(X_k) + λ_k · diag(J ᵀJ) ) ΔX_k = − J(X_k)ᵀ F(X_k)
```

`λ → 0` approaches Gauss–Newton (quadratic convergence near the root); `λ → ∞` approaches steepest descent (guaranteed progress far from it). `λ` is adapted by the **gain ratio** between actual and predicted residual reduction.

**Verified bug and its fix — the missing one-half.** The predicted reduction must be

```
ΔL = ½ ΔXᵀ ( λ ΔX − g ) ,      g = Jᵀ F
```

Omitting the `½` corrupts the gain ratio and keeps damping permanently too high, making the solver crawl. This was a real defect found in `levenbergMarquardt.ts` and is now a required regression test.

### 29.3 Powell's Dogleg (trust region)

```
Gauss–Newton step :  h_GN = −J⁺ F
Cauchy step       :  g = Jᵀ F ,  α = ‖g‖² / ‖J g‖² ,  h_SD = −α g
Dogleg path       :  h(β) = h_SD + β (h_GN − h_SD),  chosen to hit the trust radius δ
```

Dogleg is the default for interactive work (robust, predictable step length); LM is the fallback; BFGS and SQP are available through PlaneGCS for pathological systems.

### 29.4 Minimum-norm projection — why edits feel natural

Interactive sketches are almost always under-constrained (DOF > 0), so `J ΔX = −F` has infinitely many solutions. The kernel selects the **minimum-norm** one via the Moore–Penrose pseudo-inverse:

```
J = U Σ Vᵀ
ΔX* = −J⁺ F(X) = −V Σ⁺ Uᵀ F(X)
```

which minimises

```
‖ΔX‖² = Σᵢ [ (xᵢ_new − xᵢ_old)² + (yᵢ_new − yᵢ_old)² ]
```

subject to satisfying all hard constraints. **Consequence:** geometry not mechanically coupled to the edited dimension does not move. This single choice eliminates the "everything drifts" complaint that naive solvers produce.

### 29.5 Iteration cycle

```
1. Evaluate F(X_k) and J(X_k).
2. If ‖F(X_k)‖∞ < ε_tol → converged; commit.
3. Compute SVD J = U Σ Vᵀ.
4. If under-constrained (m < 2n, or σᵢ < ε_sing) → ΔX* = −V Σ⁺ Uᵀ F.
   Else → solve the damped normal equations (or take the Dogleg step).
5. Line-search / trust-region validate X_trial = X_k + ΔX.
      residual ↓ → accept, decrease λ (or grow δ)
      residual ↑ → reject,  increase λ (or shrink δ), recompute
6. Enforce branch guards (§31). Loop.
```

Numerical hygiene: prefer **column scaling of J** over forming `JᵀJ` where possible — the normal equations square the condition number.

### 29.6 Warm starts

Every solve is initialised from the previous frame's coordinates. This provides continuity (§31.1), speeds convergence, and is what makes 60 fps dragging feasible.

### 29.7 The two-layer hybrid solver core

```
┌────────────────────────────────────────────────────────────────┐
│  DOMAIN LAYER (ours — retained, not replaced)                  │
│  DCEL welding · haunch/wall inference · GAD assembly ·         │
│  RDSO-specific residuals · anisotropic bay spanning ·          │
│  hand-derived 24×24 single-cell culvert Jacobian               │
└──────────────────────────────┬─────────────────────────────────┘
                               │ compiles to generic constraints
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  NUMERIC CORE — PlaneGCS (@salusoft89/planegcs, WASM / Python) │
│  points · lines · circles · arcs · ellipses/hyperbolas/parabolas│
│  DogLeg (default) · Levenberg–Marquardt · BFGS · SQP           │
│  driving:false = reference dim   ·   temporary = drag          │
└────────────────────────────────────────────────────────────────┘
```

Do **not** discard validated domain residuals just because a generic solver is adopted. Route eligible connected components to PlaneGCS; keep the analytical registry for domain-specific residuals until benchmarked. PlaneGCS solver state is not persistent, so maintain a side table `entityId → gcs_handle` rebuilt on each init.

### 29.8 The solver contract

The numeric core receives a connected subgraph, current state, accepted constraints, and an edit request. It returns a **structured status**, never merely an array of coordinates.

**Inputs**

- Stable entity, parameter, constraint, and component-instance IDs.
- Model-space units, tolerance policy, numeric policy.
- Current solved state as the initial guess (preserving continuity and orientation branch).
- Constraint strengths: fixed, driving, hard, soft-inference, reference/measurement, temporary drag.
- Solve mode: `interactivePreview` | `commit`.
- Budget: algorithm preference, iteration/time limit, residual tolerance, allowed fallback.

**Outputs**

- Updated geometry and parameter values.
- Convergence status, max residual, weighted residual norm, iteration count, algorithm used, elapsed time.
- **Per connected component** DOF result: under-constrained / well-constrained / redundant / conflicting / malformed / non-convergent.
- A minimal explanation mapped from constraint IDs back to **semantic names** ("Clear Span", "Wall Thickness").
- Provenance sufficient to reproduce the solve from the same input graph and numeric policy.

**Rule:** a drag `MUST NOT` be silently converted into a permanent dimension. It is a temporary high-priority target while the pointer moves; on release the user may convert its measured result into a driving constraint or discard it.

## 30. Degrees of freedom — structural and numerical

### 30.1 Why the global scalar count is wrong

The historical formula

```
DOF = 2V − C − 3          (Grübler / naive Sketcher count)
```

— implemented in the existing `bipartiteGraph.ts` as `max(0, ΣentityDOF − ΣconstraintDOF − 3)` — is wrong in two distinct ways:

1. It subtracts three rigid-body motions **once globally**, even when the drawing contains several disconnected assemblies (each of which has its own three) or an anchored datum (which has none).
2. It counts constraints instead of measuring **rank**, so it cannot tell an independent constraint from a redundant one, and reports "fully constrained" on sketches that visibly still move.

This is not hypothetical: FreeCAD's own Sketcher carries multiple open, confirmed issues of exactly this kind (`#15850`, `#6174`, `#8324`), and its redundancy detector uses a "popularity contest" heuristic to guess which of several redundant constraints to blame. A hand-rolled scalar count merely re-discovers that bug on a smaller graph.

### 30.2 The corrected criterion

Evaluate **per connected topological component** `k`:

```
DOF_k = |V_k| − rank(J_k) − D_anchor,k

  D_anchor,k = 0   if component k contains a fixed datum coordinate
             = 3   if component k floats freely in the plane
```

### 30.3 Stage 1 — structural decomposition (Dulmage–Mendelsohn)

Build the bipartite incidence graph `B = (V, C, E)` with coordinate-variable nodes `V` (|V| = 2n), constraint-residual nodes `C` (|C| = m), and an edge `(vᵢ, cⱼ)` wherever `∂rⱼ/∂vᵢ ≠ 0`. Note that the existing `BipartiteConstraintGraph` already stores `entityToConstraints` and `constraintToEntities` — **that is already the bipartite graph**; only the matching pass is missing.

1. Compute a maximum-cardinality matching `M ⊆ E` by **Hopcroft–Karp** in `O(|E|√|V|)`.
2. Identify unmatched variable nodes `V_free` and unmatched constraint nodes `C_redundant`.
3. Traverse alternating paths from the unmatched sets to partition `B` into DM blocks:

| Block | Condition | Meaning | Product action |
|---|---|---|---|
| `G_under` | reachable from unmatched variables; `|V_under| > |C_under|` | free geometry | absorbs dragging; each residual DOF is a **DRIVING parameter candidate** |
| `G_square` | matched, `|V| = |C|` | well-constrained | decompose into **Block Triangular Form** `S₁ ≺ S₂ ≺ … ≺ S_k` by **Tarjan SCC**; solve blocks in order, locally |
| `G_over` | reachable from unmatched constraints; `|C_over| > |V_over|` | redundant or conflicting | highlight exact constraints for author feedback |

BTF matters for performance: a sequence of small square blocks is dramatically cheaper than one large system.

### 30.4 Stage 2 — numerical rank and null space (SVD)

Combinatorial analysis fails when constraints are structurally independent but *geometrically* degenerate (three parallel lines where two constraints happen to specify identical collinear offsets). So compute the SVD at the current configuration:

```
J = U Σ Vᵀ ,  Σ = diag(σ₁ … σ_min(m,2n))

effective rank r = #{ σᵢ > ε_sing }        (ε_sing = 1e-10)
DOF_num = 2n − r
```

- **Over-constraint identification:** if `m > r`, the left singular vectors `uᵢ (i > r)` span the space of conflicting constraint combinations. Trace the largest components of `uᵢ` back to constraint IDs; highlight them red.
- **Under-constraint grips:** the right singular vectors `vᵢ (i > r)` span `Null(J)`. Project a cursor displacement onto it:

```
ΔX_projected = Σ_{i=r+1}^{2n} (vᵢᵀ ΔX_cursor) vᵢ
```

so dragging moves geometry only along genuinely free directions, never violating an established relation.

### 30.5 Stage 3 — fast structural pre-pass (optional, for large sketches)

The **Jacobs–Hendrickson (2,3) pebble game** (with the **witness-configuration** method as the exact cross-check for theorem-induced dependencies the graph misses) decides Laman rigidity in near-linear time (a 2-D bar-joint graph on `n` vertices is minimally rigid iff it has `2n − 3` edges and no `k`-vertex subgraph has more than `2k − 3`). Use it to find rigid clusters and remaining DOF cheaply before paying for a rank computation.

### 30.6 Stage 4 — conflict vs. redundancy diagnosis

Distinguish **algebraic redundancy** (`0 = 0`) from **physical incompatibility** (`x = 0` and `x = 10`) by the residual, never by counting:

```
dependent  &  |f_cand(X)| < ε_tol   →  REDUNDANT   → discard silently
dependent  &  |f_cand(X)| ≥ ε_tol   →  CONFLICTING → reject + explain
```

PlaneGCS's own diagnostics are used as *guidance, not gospel*: `dofsNumber()`, `getConflicting()`, `getRedundant()`, `getPartiallyRedundant()` exist in the C++ `GCS::System`, but their exposure through Python/TS bindings is build-dependent. Architect on:

- the verified `sketch.solve()` return code (**0** OK, **−1** solver error, **−2** redundant, **−3** conflicting, **−4** over-constrained),
- plus **our own DM + SVD analysis**, which is the authoritative localisation.

Guard optional getters with `hasattr()` / capability checks and degrade gracefully.

### 30.7 Performance note (a correctness requirement in disguise)

FreeCAD has documented diagnosis cost growing **quadratically** across many independent sketch components, with large gains from partitioning first (issue #31183). **Component partitioning is therefore a correctness *and* performance requirement**, not an optimisation to defer.

## 31. Branch control — keeping the solution the *intended* one

Non-linear systems have multiple valid roots. A distance constraint against a line has two. The solver must land on the one the user means, every time.

### 31.1 Solution continuity (hysteresis)

Iterative descent converges to the root nearest its start. Always initialise from the immediately preceding frame's coordinates. This alone prevents most branch flips during dragging.

### 31.2 Chirality / handedness preservation

For closed polygons and haunched corners, the signed cross product of consecutive edge vectors must keep its sign:

```
sgn( (Vᵢ − Vᵢ₋₁) × (Vᵢ₊₁ − Vᵢ) ) = sgn_initial
```

Equivalently, for a haunch triangle `P₁P₂P₃`, track the signed area

```
A = ½ [ (x₂ − x₁)(y₃ − y₁) − (y₂ − y₁)(x₃ − x₁) ]
```

and enforce `A > 0`. As `A → 0`, add an interior **logarithmic barrier** to the objective:

```
Φ_barrier = −μ ln(A)
```

which prevents an interior chamfer from inverting outward into empty space.

### 31.3 Degeneracy barrier

If an edge length approaches zero (`‖Vᵢ₊₁ − Vᵢ‖ ≤ ε_deg`), add

```
Φ_barrier = −μ ln(‖Vᵢ₊₁ − Vᵢ‖)
```

to prevent geometric collapse during large dimensional changes.

### 31.4 Topological validity check

After convergence, validate against half-edge rules. If the solve caused edge crossing or loop self-intersection (detect with a **Bentley–Ottmann** sweep), reject the step, increase damping, and search along an alternative gradient direction.

### 31.5 Homotopy sub-stepping for large parameter jumps

A span change from 2.0 m to 20.0 m in one step can diverge or produce NaN. Split large changes into sub-steps of `ΔL ≤ 500 mm`, converging at each and warm-starting the next.

### 31.6 Singular-value thresholding

When the condition number `κ(J) = σ_max / σ_min > 1e8`, clamp `λ` to prevent division by near-zero pivots.

## 32. SVD row-space admissibility gating

**Every candidate constraint passes this test before it is shown to a human.** This is the mechanism that stops AutoFormula from producing a pile of redundant cards.

Given a candidate `f_cand(X) = 0` with gradient `g = ∇f_cand ∈ ℝ^(2n)` and the existing system Jacobian `J ∈ ℝ^(m×2n)` with thin SVD `J = U Σ Vᵀ`:

```
g∥ = V Vᵀ g                    (projection onto the row space of J)
g⊥ = g − g∥ = (I − V Vᵀ) g     (orthogonal component)
```

Equivalently `g⊥ = (I − J⁺J) g`.

| Condition | Verdict | Action |
|---|---|---|
| `‖g⊥‖₂ ≥ ε_indep` (1e-6) | **Independent** | Admissible — removes a DOF; may be offered to the author |
| `‖g⊥‖₂ < ε_indep` and `|f_cand(X)| < ε_tol` | **Redundant** | Discard silently; never shown |
| `‖g⊥‖₂ < ε_indep` and `|f_cand(X)| ≥ ε_tol` | **Conflicting** | Reject with a named diagnostic |

```
candidate
    │
    ▼
 SVD / rank test
    │
  independent?
   ╱        ╲
 no          yes
  │            │
reject/drop   solver test → stability test → offer to author
```

This module exists in the codebase (`lib/inference/admissibilityFilter.ts`), is mathematically correct, and **is called from nothing but its own unit test**. Wiring it into the candidate pipeline is a top-priority fix (§81).

## 33. Direct-manipulation damping

When a draftsman grabs a wall, the system must decide what moves. Column-scale the Jacobian rather than forming normal equations:

```
J_scaled = J S⁻¹ ,  S diagonal, with

S_jj = 0.05     if coordinate j belongs to the dragged vertex
     = 1.0      if coordinate j belongs to free geometry
     = 1000.0   if coordinate j is anchored or dimensionally locked
```

Stiffness scales quadratically: `(1.0 / 0.05)² = 400`. The dragged vertex therefore tracks the cursor closely while the free DOF in `G_under` absorb the displacement locally, leaving unrelated geometry stationary. This is the SolveSpace-style behaviour that distinguishes a CAD feel from a drawing-app feel.

**During a drag:** the cursor target is a `temporary` constraint. **On release:** determine the resulting parameter delta and map the movement onto an allowed DRIVING parameter — or discard. This is precisely why an undirected constraint graph is required; a one-way formula engine cannot answer "which parameter did that drag mean?"

## 34. Incremental subgraph solving

Full global re-solves on every pointer event do not scale. The kernel therefore:

1. **Dirty parameter identification** — forward reachability sweep on the scalar DAG to find directly and indirectly affected parameters.
2. **Bipartite partitioning** — BFS on the undirected constraint graph to extract the connected components containing dirty parameters. Untouched components are frozen. (`bfsPartition.ts` already implements this correctly and is currently unused.)
3. **Decomposition–Recombination (DR-plan)** — inside the affected component, identify rigid sub-clusters (internal DOF = 0) and condense each into a super-node with three rigid-body DOF, shrinking the active problem.
4. **Local assembly** — build `J` and `F` only for the reduced sub-problem. Editing one culvert bay works on `n ≈ 16` variables instead of a global `N > 2000`, keeping re-solve under ~2 ms.
5. **Targeted DOM reconciliation** — propagate dirty bounding boxes; update only affected SVG elements.

```
Parameter edit
   → DAG dependency sweep
   → affected parameters
   → affected components
   → affected constraints
   → solve block only
```

## 35. Derived analytical metrics (post-solve, read-only)

Computed from the solved `X` in the post-solve pass and exposed to the DAG parser, enabling expressions such as `TotalArea = area(Outer) − area(Hole₁) − area(Hole₂)`.

**Length and perpendicular distance**

```
L = ‖P₂ − P₁‖
d⊥ = |(P₀ − P₁) × û| = |(x₀−x₁)u_y − (y₀−y₁)u_x|
```

**Directed angle**

```
θ = atan2(d₁ × d₂ , d₁ · d₂)
```

**Polygon area (shoelace)**

```
A = ½ Σᵢ (xᵢ y_{i+1} − x_{i+1} yᵢ)
```

Sign gives winding: `A > 0` counter-clockwise, `A < 0` clockwise. Net material area with voids:

```
A_net = |A_outer| − Σ_k |A_hole,k|
```

**Centroid (Green's theorem)**

```
C_x = (1/6A) Σᵢ (xᵢ + x_{i+1})(xᵢ y_{i+1} − x_{i+1} yᵢ)
C_y = (1/6A) Σᵢ (yᵢ + y_{i+1})(xᵢ y_{i+1} − x_{i+1} yᵢ)
```

Composite with voids, by area-weighted superposition:

```
C_x,composite = ( A_outer·C_x,outer − Σ_k A_hole,k·C_x,hole,k ) / A_net
```

With per-material densities `ρⱼ`, the centre of mass is `R_CM = Σⱼ ρⱼ Aⱼ Cⱼ / Σⱼ ρⱼ Aⱼ`.

**Second moments of area**

```
I_xx = (1/12) Σᵢ (yᵢ² + yᵢ y_{i+1} + y_{i+1}²)(xᵢ y_{i+1} − x_{i+1} yᵢ)
I_yy = (1/12) Σᵢ (xᵢ² + xᵢ x_{i+1} + x_{i+1}²)(xᵢ y_{i+1} − x_{i+1} yᵢ)
```

Holes subtracted with the parallel-axis theorem:

```
I_xx,net = ( I_xx,outer + A_outer (C_y,outer − C_y,net)² )
         − Σ_k ( I_xx,hole,k + A_hole,k (C_y,hole,k − C_y,net)² )
```

These give quantity take-offs and section properties for free, from geometry the user already drew.

**Note on elementary formulas.** Standard shape formulas (circle `A = πr²`, `C = 2πr`; rectangle `A = lw`, `P = 2(l+w)`; triangle `A = ½bh`, Heron `A = √(s(s−a)(s−b)(s−c))`; cylinder `2πrh`, `2πr(r+h)`; cone `πr√(r²+h²)`, `πr(r+√(r²+h²))`; sphere `4πr²`; cuboid `2(lw+wh+hl)`; cube `6a²`) are **calculation** formulas for reporting. They are not substitutes for design intent and never enter the constraint system.

## 36. Reference and construction geometry

First-class, participating fully in the constraint graph but excluded from boundary loops, face definitions, and area evaluation.

- **Theoretical sharp corner.** A haunch truncates a corner, but drafting convention dimensions the chamfer from the *virtual* intersection. Define `P_sharp` by
  ```
  (P_sharp − V_wall1) × d₁ = 0 ,  (P_sharp − V_wall2) × d₂ = 0
  ```
- **Bilateral symmetry plane.** A centreline `L_sym` through `P₀` with unit direction `d̂` establishes reflection constraints:
  ```
  midpoint(P_A, P_B) lies on L_sym       and       (P_B − P_A) · d̂ = 0
  ```
  so editing the left wall expands the right symmetrically, with no formula written.
- **Datum axes, pitch circles, grid lines, alignment axes** follow the same pattern.

## 37. Affine algebra — local frames and port composition

### 37.1 Frames

Every composite profile, sub-cell, or reference entity owns a local frame `F = (O, u, v)` with `‖u‖ = ‖v‖ = 1`, `u · v = 0`. Forward transform:

```
        ⎡ u_x  v_x  x₀ ⎤
P_w =   ⎢ u_y  v_y  y₀ ⎥ · P_l          with u = (cos θ, sin θ), v = (−sin θ, cos θ)
        ⎣  0    0    1 ⎦
```

Rigid-body inverse:

```
          ⎡ u_x  u_y  −O·u ⎤
M⁻¹ =     ⎢ v_x  v_y  −O·v ⎥
          ⎣  0    0     1  ⎦
```

General form including uniform scale (for placement only — never for parameter changes):

```
    ⎡ s·cos θ  −s·sin θ  x₀ ⎤
M = ⎢ s·sin θ   s·cos θ  y₀ ⎥ ,   P_world = M_parent · M_local · P_local
    ⎣    0         0      1 ⎦
```

### 37.2 Gram–Schmidt frame construction

For a frame aligned to an arbitrary guide (roof pitch, haunch axis, skew centreline) with direction `w₁`:

```
u = w₁ / ‖w₁‖ ,      v = (−u_y, u_x)
```

Used as an algebraic frame constructor, not a solver.

### 37.3 Port attachment composition

```
M_C = M_P · T(O_port,P) · R(θ_port,P) · T(d_offset) · R(θ_relative) · T(−O_port,C)
```

with

```
        ⎡1 0 x⎤              ⎡cos θ  −sin θ  0⎤
T(x,y)= ⎢0 1 y⎥ ,   R(θ) =   ⎢sin θ   cos θ  0⎥
        ⎣0 0 1⎦              ⎣  0       0    1⎦
```

Equivalently: `WorldTransform(child) = WorldTransform(parent) · ParentPortFrame · UserOffsetRotation · inverse(ChildPortFrame)`.

**Why this matters:** when the parent expands along its clear span, the child **translates as a rigid body**. Its internal geometry undergoes zero local distortion, so internal wall thicknesses and haunches are preserved automatically, with no vertex-level arithmetic.

### 37.4 Rotation: two different jobs, two different tools

A precise statement that resolves a real ambiguity:

- **Detection under rotation** is solved by **vectors** — dot products, cross products, and distances between two primitives depend only on their *relative* geometry, never on the world frame. P1–P9 can therefore run directly in world coordinates and give identical answers at any drawing rotation. No pre-transformation into local frames is needed.
- **Reuse under rotation** is solved by **matrices** — storing an accepted relationship relative to its own component's frame is what lets that component be moved, rotated, or repeated later (Bay 2 = Bay 1 shifted) without re-running detection.

Both are needed, for different halves of the problem, and neither substitutes for the other.

### 37.5 Worked case — two-cell culvert

`BoxCell1` at origin `(0,0)` exposes port `web_right` at local `O = (S₁ + t_ext, 0)`, `θ = 0°`. `BoxCell2` attaches its `web_left` to `BoxCell1.web_right` with `d_offset = (t_mid, 0)`. Increasing `S₁` by `ΔS₁` updates the port origin, translating `BoxCell2` rightward by `ΔS₁`. The right outer wall follows:

```
x_outer_right = x_BoxCell2 + S₂ + t_ext
```

All thicknesses `(t_ext, t_mid)` and haunch dimensions remain invariant under anisotropic expansion. Concretely: `S₁` 2000 → 3500 mm expands Bay 1, rigidly translates the 350 mm intermediate web and the whole of Bay 2, and grows the envelope — with no conformal distortion anywhere.

### 37.6 Worked case — railing posts along a deck edge

`BridgeDeck` exposes edge-port `edge_fascia`: `O = (0, Y_deck_top)`, `θ = 0°`, length `L_deck`. `ParapetPost` (100 × 100 × 1000 mm) exposes port `base` at `O = (50, 0)`, `θ = 90°`. The repeat rule evaluates:

```
PostCount     = floor(L_deck / MaxSpacing) + 1        (MaxSpacing = 1500 mm)
ActualSpacing = L_deck / (PostCount − 1)
```

and instantiates `PostCount` posts at `d_offset = (i · ActualSpacing, 0)`. `L_deck` 12.0 m → 18.5 m recomputes the count and spacing without touching post cross-sections. **The same protocol handles a 2-D enclosed void and a 1-D repeating pattern along an arbitrary boundary.**

---
# PART VI — GEOM-RP/1: THE UNIVERSAL GEOMETRIC RESOLVER PROTOCOL

*(This is the unification of the two clause sets that circulated as "GEOM-RP/1" and "GEOM-RP/2". They are one protocol here. Version: **GEOM-RP/1.0**.)*

## 38. The one idea the protocol follows from

The two detectors that actually work in the current codebase both break under rotation, for the same underlying reason: `computeShapeBounds` measures gaps along the **world's** X and Y axes (`Δx`, `Δy`), and `recognizeHaunches` compares a direction against a **fixed** 45°. Both test geometry against the *page's* frame instead of against *itself*. Rotate the identical physical configuration by 15° and every one of those numbers changes, though nothing about the relationship did.

The fix is not a bigger pattern library. It is a change in *what kind of quantity is measured*:

> **Dot products, cross products, and distances between two vectors do not depend on the world's axes — only on the vectors themselves.**

That single property makes a predicate rotation-invariant for free. It is the precise, provable answer to "can vectors and matrices help here" — not a vague yes, but a specific mechanism visible in every formula below.

## 39. Primitives

Every shape reduces to three things:

- **Point** — `P = (x, y) ∈ ℝ²`
- **Edge** (straight) — `(A, B)`; `d = B − A`; `d̂ = d/‖d‖`; `n̂ = (−d̂_y, d̂_x)` (a 90° rotation of `d̂`)
- **Arc** — centre `C`, radius `r`, start/end angle. A circle is an arc spanning 360°.

A polygon or polyline is **not** a fourth primitive; it is an ordered list of edges. Nothing in this protocol ever asks "what shape is this". It only ever takes two primitives and asks a fixed question about them.

## 40. The predicate library P1–P9

| ID | Name | Operands | Invariant metric | Threshold | Engineering meaning |
|---|---|---|---|---|---|
| **P1** | Parallel | Edge A, Edge B | `\|d̂_A × d̂_B\| = \|d̂_Ax d̂_By − d̂_Ay d̂_Bx\|` | `< ε_angle` | Parallel/collinear boundary walls |
| **P2** | Perpendicular | Edge A, Edge B | `\|d̂_A · d̂_B\| = \|d̂_Ax d̂_Bx + d̂_Ay d̂_By\|` | `< ε_angle` | Orthogonal box corners, slab–wall joints |
| **P3** | Parallel offset | Edge A, Edge B (P1 holds) | `δ_start = (B_start − A_start)·n̂_A`, `δ_end = (B_end − A_start)·n̂_A` | `\|δ_start − δ_end\| < ε_dist`; value = mean | **Constant wall thickness, slab depth, clearance** |
| **P4** | Corner chamfer | Edges A ⊥ B, connecting edge C | `θ_C = atan2(d_C × d̂_A , d_C · d̂_A)`; legs `h_A = (C_end − C_start)·d̂_A`, `h_B = (C_end − C_start)·d̂_B` | measured `θ_C`; equal-leg iff `\|\|h_A\| − \|h_B\|\| < ε_dist` | Haunches and chamfers **at any splay angle** |
| **P5** | Concentric radial offset | Arc/circle A, B | `δ_C = ‖C_A − C_B‖`; radial offset `\|r_A − r_B\|` | `δ_C < ε_dist` | Hollow piers, pipe culverts, ducts, bearings |
| **P6** | Tangency | Edge A, Arc B | `d⊥ = \|(C_B − A_start) × d̂_A\|` | `\|d⊥ − r_B\| < ε_dist` | Filleted transitions, arch profiles |
| **P7** | Equal length | Edge A, Edge B (non-adjacent, anywhere) | `ΔL = \| ‖d_A‖ − ‖d_B‖ \|` | `< ε_dist` | Symmetric girder depths, balanced bays |
| **P8** | Coincidence | Point A, Point B | `δ_P = ‖P_A − P_B‖` | `< ε_weld` | Shared joints, closed loops (this **is** the DCEL welder, reused) |
| **P9** | Bilateral symmetry | Points A, B; axis `(O, n̂)` | `R = I − 2 n̂ n̂ᵀ`; `P′_A = O + R(P_A − O)` | `‖P′_A − P_B‖ < ε_dist` | Symmetric cross-sections, twin voids |

### Why each of the corrective predicates earns its place

- **P3 replaces the bounding-box offset test.** It is a projection onto the edge's *own* normal, so it works identically whether the wall is horizontal, vertical, or drawn at 37°. This one change fixes rotation for the most common relationship in these drawings.
- **P4 replaces the hardcoded 45°.** It *measures* the angle instead of assuming it, and records that angle as the candidate's own parameter. A 30°, 45°, and 60° chamfer are all simply "a chamfer" — and the angle becomes a value the draftsman can see and change, not a hidden assumption.
- **P5 is right where the bounding-box detector was only accidentally right.** A circle's bounding box equals its diameter only when it is exactly centred and undistorted. Move it off-centre, or place it inside a non-square opening, and P5 is the only version that still works — because it never looks at a bounding box at all.
- **P9 is the one genuinely matrix-native predicate**, and bridge cross-sections are symmetric by design.

### Additional derived predicates (compositions, not new primitives)

| Derived | Composition |
|---|---|
| Horizontal / Vertical | P1 against the datum X / Y axis |
| Collinear | P1 **and** offset ≈ 0 |
| Wall (structural) | Two P3 chains bounding a common solid face |
| Cell / void | Bounded face at odd nesting depth between wall chains |
| Repeated bay | P7 + P3 recurring at a constant stride |
| Centred feature | P9 about the parent's mid-axis, or `t_left = t_right` |

## 41. Detection tolerances

```
ε_dist      = 0.5 mm          (model space, absolute)
ε_angle     = 0.008726 rad    (0.5°)
ε_collinear = 0.05 rad
ε_cluster   = 1.0 mm          (parameter clustering bin)
ε_weld      = 0.5 mm          (DCEL vertex welding — same policy object)
```

Angular tolerance is **absolute and scale-independent** (0.5–1.0° is the working band). Distance tolerance may be scale-aware (`max(abs_tol, rel_tol × drawingExtent)`) but only through the single policy object of §17.

## 42. Confidence, clustering, and candidate lifecycle

Every candidate carries a measured deviation, which sets its confidence tier, mapped onto the assertion taxonomy of §22 (Geometric Fact / Inference / User Constraint).

**Pre-display clustering is mandatory.** Without it, an octagonal void with four corner haunches produces four separate equality cards (`L₂ = 49`, `L₃ = 49`, `L₆ = 50`, `L₇ = 49`) plus separate left/right offset formulas. The clustering pass:

1. **Group by predicate signature** — same predicate type (`HAUNCH_LEG_EQUALITY`) and same geometric parent context.
2. **Metric tolerance binning** — cluster values within `ε_cluster = 1.0 mm` (1-D DBSCAN or histogram binning).
3. **Parameter synthesis** — collapse into one card: `HaunchSize = 49 mm (used by 4 corners: L2, L3, L6, L7)`.
4. **Sub-pixel absorption** — the 49 vs 50 mm discrepancy is resolved during the variational solve, absorbing small drafting inaccuracy into one consistent engineering parameter.

**Rejection memory:** a rejected candidate is suppressed for the same primitive set for the remainder of the session. A pending suggestion is **superseded**, not duplicated, if geometry changes before the author acts. Each suggestion shows its provenance — *"detected: nested rectangle"* vs *"detected: stayed invariant during your last drag"* — so the author knows which signal to trust.

## 43. Formal protocol clauses

**Clause 1 — Scope.** This protocol governs how drafted 2-D geometry is decomposed, how relationships between its elements are detected, and how those relationships are exposed to a human, independent of drawing scale, rotation, or shape identity.

**Clause 2 — Definitions.** *Primitive*: a Point, Edge, or Arc per §39. *Predicate*: one of P1–P9. *Candidate*: a predicate result not yet accepted. *Driving parameter*: a value a person set directly. *Derived value*: a value computed from others through an accepted relation.

**Clause 3 — Identity and units.** A conforming document `MUST` use stable IDs for primitives, topological vertices, constraints, parameters, ports, and component instances. Every dimensional value `MUST` state its unit. Documents `MUST NOT` use pixels or viewport zoom as model tolerance.

**Clause 4 — Topology.** A conforming resolver `MUST` store intended shared endpoints as a topological identity or an explicit coincidence constraint. It `MUST` preserve ordered loop membership and orientation.

**Clause 5 — Primitive conformance.** Every drawn entity `MUST` reduce to Points, Edges, and Arcs within tolerance before any predicate runs. An implementation `MUST NOT` introduce a shape-specific code path in detection (`if (shape.type === 'rectangle')`); shape identity `MAY` be used for rendering only. Unsupported curves `MAY` be preserved as carriers but `MUST NOT` advertise unsupported editable constraints.

**Clause 6 — Invariant formulation.** Predicate evaluation `MUST` use the rotation-invariant vector/matrix forms of §40. It `MUST NOT` use axis-aligned bounding-box comparisons to detect clearances or thicknesses, and `MUST NOT` hardcode a specific angle where the predicate can measure the actual one.

**Clause 7 — Tolerance.** All `ε` values `MUST` be expressed in absolute real-world units and `MUST` come from one shared policy object. Implementations `MUST NOT` scale tolerance by viewport zoom or express it in pixels.

**Clause 8 — Constraint schema.** A constraint `MUST` carry its type, referenced entities, target value or parameter reference, strength, provenance, state, and current diagnostic result. A scalar formula `MUST` remain separate from a geometric constraint.

**Clause 9 — Inference lifecycle.** An inferred relationship `MUST` remain a candidate until accepted by an author, or by an explicitly enabled auto-constraint policy. It `MUST` carry a measured deviation and a confidence value. Rejected candidates `SHOULD` be suppressed for the same session and primitive set.

**Clause 10 — Clustering and admissibility.** Candidates of identical predicate type with near-equal values (`Δ ≤ ε_cluster`) `MUST` be merged into one parameter card before presentation. No candidate `SHALL` be presented before passing the SVD row-space admissibility test (§32) against the currently accepted set. Dependent candidates `MUST` be discarded if redundant, and flagged with a diagnosis if conflicting. A conflicting candidate `MUST NOT` be silently inserted.

**Clause 11 — Solve request.** An interactive request `MUST` declare temporary constraints separately from persistent driving constraints. The solve result `MUST` report convergence, residual, diagnosis, and the changes made.

**Clause 12 — Draftsman interaction.** A draftsman `MUST NOT` be required to write or read a symbolic formula for an ordinary edit. An accepted relationship `MUST` be editable by direct manipulation of the geometry it constrains. A derived dimension `MUST` be visibly locked, or explain the driving dimensions that control it. Conflicts `MUST` be surfaced using driving-parameter names, never raw constraint or predicate identifiers.

**Clause 13 — Component interoperability.** A component's internal relationships `MUST` be stored relative to its own local frame, not world coordinates, so that translation, rotation, and repetition preserve them without re-detection. Templates `MUST` expose named ports; instances `MAY` attach by compatible point, edge, or axis ports through affine composition.

**Clause 14 — Conformance levels.**

| Level | Predicates | Capability |
|---|---|---|
| **Level 1** | P1, P3, P8 | Arbitrary rotated straight-edge assemblies with uniform wall thickness and coincidence. Also covers the ISO-style basics: coincidence, distance/length, parallel, fixed entities. |
| **Level 2** | + P2, P4, P5, P6 | Corners at any splay angle, circular voids and ducts, filleted transitions, concentricity, angle, offset. |
| **Level 3** | + P7, P9 | Cross-drawing equal spans, symmetry, multi-cell balancing structures. Adds component ports, repeat arrays, curve adapters, verified exchange mapping. |

Each level is independently shippable and testable. **Level 1 alone is a complete, correct, useful system for a large fraction of real bridge cross-sections.**

## 44. Predicate rollout plan

| Phase | Target | Change | Verified starting point |
|---|---|---|---|
| **0 (today)** | — | Bounding-box offset (`computeShapeBounds`) + hardcoded 45° (`recognizeHaunches`) | Both confirmed live; both narrower than Level 1 |
| **1** | Level 1 | Replace bounding-box offset with true edge-to-edge **P3**, computed from the DCEL boundary graph rather than `computeShapeBounds`. Fixes rotation for the most common relationship type. | `lib/geometry/topology/dcel.ts` exists but is **not read** by the detector |
| **2** | Level 1, cleaned | Add the merge/clustering pass (§42) and wire `admissibilityFilter.ts` into the candidate pipeline before display | Both pieces exist in isolation; this phase is wiring, not new maths |
| **3** | Level 2 | Add **P2**, **P4** (measured angle replaces the fixed 45° test), **P5**, **P6** | `recognizeHaunches` becomes the reference implementation to *generalise*, not discard |
| **4** | Level 3 | Add **P7** (cross-drawing equal length) and **P9** (symmetry) — the two most specific to bridge cross-sections | New; no equivalent exists today |
| **5** | Protocol tooling | Per-template conformance report declaring the level it requires; one test file per predicate, mirroring the existing `tests/unit/` convention | Extends existing conventions |

## 45. Where GEOM-RP/1 honestly stops

- **Freeform / organic curves** (splines, hand-drawn irregular boundaries) are not covered by P1–P9. They need curve fitting, a different mathematical problem, and arguably out of scope for RDSO-style precision drafting where boundaries are supposed to be exact lines and arcs.
- **Genuine design ambiguity** — two edges that match by coincidence rather than intent — still needs a human decision. No predicate resolves that; it only surfaces it faster.
- Everything here is **2-D**. Nothing implies an extension to 3-D geometry or elevation data.

---
# PART VII — THE INFERENCE PIPELINE

This is where the system does the thing the user actually asked for: *"the draftsman draws, and the system works out the parameters and formulas by itself."*

## 46. Pipeline overview

```
raw shapes (lines / arcs / rectangles / polygons)
        ↓
normalise: one tolerance policy, model-space mm
        ↓
weld topological vertices  →  split at intersections  →  orient loops
        ↓
DCEL: faces, adjacency, nesting depth (even = solid, odd = void)
        ↓
spatial index (R-tree / PlanarSet) → nearby candidate pairs (broad phase)
        ↓
GEOM-RP/1 predicates P1–P9 (narrow phase, only applicable predicates)
        ↓
measurements  →  1-D clustering  →  candidate parameters
        ↓
formula candidate generation (integer-relation search)
        ↓
SVD admissibility gate  →  independent / redundant / conflicting
        ↓
solver test  →  stability test (perturbation sweep)
        ↓
rank + cluster + attach provenance
        ↓
AUTHOR REVIEW  (accept / reject / rename / edit / set role)
        ↓
commit: parameters + constraints + formulas + semantics → template
```

**Two hard rules govern the whole pipeline:**

1. Inference produces **candidates**, never silent commitments. It must never assert that every visually plausible relation is engineering intent.
2. The broad phase is spatially indexed. The existing `detectGADAssemblies` nested `O(n²)` scan — which static analysis showed runs 2–3 times per solve transaction — is acceptable as prototype code but `MUST NOT` become the production path.

## 47. The candidate record

```ts
interface Candidate {
  id: Id;
  kind: 'constraint' | 'parameter' | 'formula';
  predicate?: 'P1'|…|'P9';
  refs: Id[];                      // primitives / vertices / faces involved
  measuredValue?: number;
  unit?: Unit;
  deviation: number;               // how far from exact
  confidence: number;              // 0..1, from cluster tightness + residual
  occurrences: number;             // after clustering
  clusterMembers?: Id[];
  proposedResidualType: ConstraintKind;
  provenance: 'static-detector' | 'drag-invariance' | 'topology' | 'import-measurement';
  evidence: string[];              // human-readable, shown on the card
  admissibility?: 'independent' | 'redundant' | 'conflicting';
  diagnostic?: string;
}
```

Every card the author sees is built from this record, so every proposal is explainable. The card for a wall thickness reads:

```
Candidate: WallThickness = 300 mm
Evidence:
  · 4 parallel offsets (P3)
  · mean 299.875 mm, deviation ±0.225 mm
  · same topology role (bounding solid faces)
  · repeated across symmetric regions
Admissibility: independent (‖g⊥‖ = 0.83)
Confidence: 0.94
```

## 48. Deterministic parameter inference

### 48.1 Thicknesses from offset clusters

For each parallel edge pair (P1), compute the signed perpendicular distance (P3). Cluster the 1-D distance set with **DBSCAN** (scikit-learn, BSD) or histogram binning at `ε_cluster`. Each dense cluster becomes a candidate **thickness parameter**; its member pairs receive an `offset` constraint referencing that parameter.

```
measured offsets: 299.6, 300.1, 300.0, 299.8
   → cluster → WallThickness = 300 mm  (4 occurrences)
```

### 48.2 Spans and voids from topology

DCEL faces at odd nesting depth with no material component are **voids**. Their clear width and height give `ClearSpan` / `ClearHeight`. Distances between inner wall faces give clear spans directly. Two horizontal openings of 2000 mm each yield `ClearSpan = 2000` plus a symmetry hypothesis (P9).

### 48.3 Repeated features

Equal-length clustering (P7) plus constant stride detection yields bay widths, post spacings, and repeat counts. This is the pass whose absence causes the current engine's multi-cell failure (§80).

### 48.4 Equal-length groups, coincidence, tangency, collinearity

1-D length clustering → `equal_length` groups. Coincidence by union-find within `ε_weld`. Tangency by distance tests. Collinearity as parallel + zero offset.

### 48.5 Symmetry axes

Hypothesise candidate axes (bounding-box mid-lines; perpendicular bisectors of matched vertex pairs), apply the Householder reflection, and score by the fraction of primitives that map onto primitives within `ε_dist`.

## 49. Formula inference

### 49.1 Dimension-stack summation

For each principal direction, project all solid faces and voids onto an interval axis. If an exterior dimension `D_total` spans an interval subdivided by interior spans `S₁…S_k` and thicknesses `T₁…T_{k+1}`, propose:

```
D_total = Σᵢ Sᵢ + Σⱼ Tⱼ
```

### 49.2 Integer-relation discovery

For multi-cell systems, run an integer-relation search over the vector of detected scalars `[V₁ … V_m]`, seeking small-integer dependencies:

```
Σᵢ aᵢ Vᵢ = 0 ,   aᵢ ∈ {−4 … +4}
```

Methods, in increasing cost: bounded-coefficient least-squares subset search → **PSLQ** integer-relation detection (Ferguson & Bailey) → **LLL** lattice reduction for larger scalar sets. Example discovery: `1·W_outer − 2·ClearSpan − 3·WallThickness = 0`.

### 49.3 The anti-curve-fitting rule (mandatory)

```
BAD   :  A ≈ 0.713·B + 14.7
GOOD  :  A = B + 2·T
```

The second has geometric meaning; the first is numerology that happens to fit. Ranking function:

```
Score =  geometricFit
       + constraintIndependence
       + topologyEvidence
       + repetitionEvidence
       + semanticEvidence
       − formulaComplexity
```

Prefer **fewest terms and smallest integer coefficients** (Occam). Only high-scoring candidates ever reach the author.

### 49.4 Validation gates — all four required

A formula candidate is offered only if it is:

1. **Within tolerance** at the current configuration.
2. **Dimensionally consistent** (lengths with lengths; counts with counts).
3. **Survives perturbation** — perturb the inputs synthetically, re-solve, re-measure, and confirm the predicted output still matches. Relations that hold only at the current values are rejected. *This is the single most effective control on false positives.*
4. **Has minimum support** — enough independent occurrences to be more than a coincidence.

Deduplicate with symbolic simplification (SymPy, authoring-time only, off the hot path).

## 50. Live drag-invariance inference — the second signal

Static detectors look at geometry at rest. A complementary signal fires *during* interaction:

```
Static path : geometry-at-rest → wall/haunch/offset/symmetry detectors
                                            │
Live path   : pointer drag Δ → watch OTHER residuals during the drag:
                                which stayed within tolerance while the
                                dragged dimension changed?
                                            │
                                            ▼
                              ONE SHARED CANDIDATE QUEUE
                                            │
                              admissibilityFilter (SVD gate)
                                            │
                                            ▼
                              AutoFormula suggestion panel
              "You changed ClearSpan 500 → 700; WallThickness = 250,
               Haunch = 150, TopSlab = 300 stayed put — keep these as
               driving dimensions?"
```

Both sources land in the same queue and pass the same gate. This is exactly the pipeline `isConstraintAdmissible` should have been living inside all along.

## 51. Solver-as-verifier — what we adopt from arXiv 2504.13178

Autodesk Research's *Aligning Constraint Generation with Design Intent in Parametric CAD* (ICCV 2025; Casey, Zhang, Ishida, Thompson, Khasahmadi, Lambourne, Jayaraman, Willis; v2 adds McCarthy) is the most directly relevant published work. Its numbers describe **their trained model on mechanical sketches** and are cited here as motivation, not as predictions for this system.

**What the paper actually shows.** A generative constraint model (Vitruvion, trained on SketchGraphs) produced fully-constrained sketches only **8.87 %** of the time; supervised fine-tuning raised that to **34.24 %**; using a deterministic constraint solver as an automated reward signal during post-training reached **93.05 % (RLOO)** and **91.59 % (GRPO)**. The solver scored generated constraint sets on: constraint status (UC / FC / OC), solvability, and **geometric stability** (Euclidean displacement between the original sketch and the post-solve configuration, discretised into grid bins — a sketch is unstable if primitives jump cells after re-solve).

**What we ADOPT:**

- **The operational definition of design intent** = fully-constrained, not under-/over-constrained, solvable, and stable under parameter change. This becomes our DOF taxonomy and the acceptance test in both author review and user-mode validation. It maps directly onto our Geometric Fact / Inference / User Constraint taxonomy.
- **The solver-as-verifier loop.** After the deterministic engine proposes constraints, re-solve with perturbed driving parameters and check the sketch is fully constrained and stable. The paper's idea, applied deterministically.
- **The anchor rule** (App. A.4) — fix one entity to remove the global rigid-body DOF. Taken verbatim (§18).
- **The bipartite primitive↔constraint graph representation** (App. A.2) — matches our constraint graph exactly.
- **The stability metric** as a cheap template regression test.

**What we ADAPT:** the paper treats constraint generation as a *learned sequence model*. We replace the learned generator with the deterministic GEOM-RP/1 engine plus clustering, and keep the verifier identically — the evaluation half, without the generative half. The paper also *excludes* symmetry and pattern/mirror constraints to simplify learning; we **re-include** them (P9, repeat rules), because they are central to bridge GADs.

**What we REJECT, and why:**

- **All RL/DPO/GRPO/ReMax/RLOO/SFT post-training.** Training is forbidden by requirement; and for a narrow, code-governed domain a deterministic engine is more auditable and needs no 2.8 M-sketch dataset or the paper's reported 8×H100 × ~3-days-per-epoch runs. *This is the single biggest divergence from the source paper.*
- **The learned reward-model / PPO path** — the paper itself reports it failed through reward hacking.
- **Dependence on a proprietary solver** (Fusion) as verifier — substitute PlaneGCS (open, LGPL).

**Honest caveat:** the paper concerns *mechanical* sketches of ≤16 primitives, not civil GADs, and its figures describe its own trained model. Our deterministic pipeline's performance on civil GADs is unmeasured until we measure it (§76, gate G7).

**Corroborating lineage** (same conclusion, different angles): **DAVINCI** (BMVC 2024) predicts primitives + constraints end-to-end from raster images but relies on synthetic Constraint-Preserving Transformations to stay on the valid-CAD manifold; **CadVLM** (Autodesk, ECCV 2024) interprets engineering drawings with a VLM but routes every parameter proposal through an external solver for projection and verification; the **SketchGraphs** benchmark lineage (2020–2025) shows that predicting constraint graphs without an underlying bipartite solver produces cyclic deadlocks and over-constrained singularities. In every case the solver, not the model, is the source of truth.

## 52. Why no ML model is trained here — the explicit decision

Models evaluated and **not adopted**: Vitruvion (+ SketchGraphs), DAVINCI, PICASSO, AutoConstrain (Fusion 360, proprietary — excluded outright).

| Reason | Detail |
|---|---|
| **Requirement** | The brief forbids training any new model. |
| **Auditability** | For structural drawings governed by codes, a deterministic predicate that can show its evidence beats a probabilistic proposal that cannot. |
| **Cost** | Training-grade GPU hardware, dataset curation, and MLOps for a benefit that the deterministic engine already achieves in this narrow domain. |
| **Domain mismatch** | Public sketch corpora are mechanical CAD, not civil GAD. |
| **Risk** | A learned generator that "usually" gets a wall thickness right is worse than no generator at all in a fabrication context. |

Resource profile of the chosen path: **CPU only, no GPU, no training.** PlaneGCS/WASM and the deterministic engine run on a single CPU core in ~15 MB. The optional LLM runs on the vendor's hardware. Optional OCR/vision for the ingestion path uses pre-trained models on CPU. GPU is useful *later* only for raster GAD vision or large PDF batches, and is never required for the core engine.

---

# PART VIII — THE AI LAYER (INFERENCE ONLY)

## 53. Exactly what the LLM does and does not do

```
LLM DOES                              LLM NEVER DOES
────────────────────────────────      ──────────────────────────────────────
Param_3  →  "WallThickness"           Emit or modify coordinates
Explain why a candidate might be      Decide constraint correctness
  a wall thickness, in one sentence   Touch topology
Rank competing semantic hypotheses    Change a measured value
Suggest a UI grouping                 Write to the sketch, ever
Write user-facing help text           Act as the solver
```

The correct pipeline shape:

```
LLM
 ↓ proposal
JSON-schema validation (strict)
 ↓
semantic validator (reserved words, uniqueness, regex)
 ↓
geometry validator (does the named entity exist?)
 ↓
solver / admissibility (unchanged by naming)
 ↓
AUTHOR APPROVAL
 ↓
template
```

**Never:** `LLM → CAD database`.

## 54. Provider and structured outputs

- **Anthropic Claude Messages API** with **Structured Outputs** (public beta announced 14 Nov 2025, header `structured-outputs-2025-11-13`, initially Sonnet 4.5 / Opus 4.1), using constrained decoding to guarantee JSON-Schema compliance, with Pydantic/Zod support via `client.beta.messages.parse`. **Confirm current GA status, model availability, and the exact SDK surface at implementation time, and keep the deterministic fallback regardless.**
- **OpenAI Structured Outputs** (`response_format: json_schema`, `strict: true`) is an equivalent alternative.
- Either way: **inference only. No fine-tuning, no training, ever.**

## 55. The naming contract

**System prompt**

```
You are a civil/structural engineering drafting assistant. You name parameters of a
parametric 2D General Arrangement Drawing (bridges, culverts, retaining walls, ROBs).
You receive abstracted feature descriptors — never coordinates.
Map raw parameter IDs to standard civil nomenclature (IRC / IRS / AASHTO / Eurocode usage).

CRITICAL RULES
1. NEVER output geometric coordinates and NEVER modify a numerical value.
2. Return ONLY a valid JSON object matching the provided schema.
3. For each parameter give one plain-English sentence justifying the tag.
4. Assign a role:
     DRIVING  — a high-level value an engineer specifies (ClearSpan, ClearHeight,
                WallThickness, SlabThickness, FoundationDepth)
     DERIVED  — computed from others (TotalWidth, TotalHeight)
     FIXED    — a code or standard constant (MinimumWearingCoat = 75 mm)
5. Names must match ^[A-Za-z][A-Za-z0-9_]{0,39}$.
6. Never invent geometry. If evidence is insufficient, say so with low confidence.
```

**User payload (abstracted — no geometry leaves the building)**

```json
{
  "drawingType": "culvert",
  "units": "mm",
  "structureBoundingBox": { "width": 4300, "height": 3650 },
  "detectedFaces": [
    { "type": "VOID",  "width": 3500, "height": 3000, "count": 1 },
    { "type": "SOLID", "bounds": "EXTERIOR" }
  ],
  "clusters": [
    { "rawId": "param_offset_1", "kind": "offset_cluster", "nominalValue": 400,
      "members": 2, "orientation": "VERTICAL",        "adjacency": "outer" },
    { "rawId": "param_offset_2", "kind": "offset_cluster", "nominalValue": 350,
      "members": 1, "orientation": "HORIZONTAL_TOP",  "adjacency": "top_slab" },
    { "rawId": "param_offset_3", "kind": "offset_cluster", "nominalValue": 400,
      "members": 1, "orientation": "HORIZONTAL_BOTTOM" },
    { "rawId": "param_span_1",   "kind": "span",   "nominalValue": 3500,
      "orientation": "HORIZONTAL_VOID", "encloses": "void" },
    { "rawId": "param_height_1", "kind": "span",   "nominalValue": 3000,
      "orientation": "VERTICAL_VOID" }
  ],
  "inferredFormulas": [
    "TotalWidth  = param_span_1   + 2 * param_offset_1",
    "TotalHeight = param_height_1 + param_offset_2 + param_offset_3"
  ]
}
```

**Response schema (strict)**

```json
{ "type": "object",
  "properties": {
    "structureType": { "type": "string" },
    "names": { "type": "array", "items": {
      "type": "object",
      "properties": {
        "candidateId": { "type": "string" },
        "name":        { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9_]{0,39}$" },
        "role":        { "enum": ["DRIVING","DERIVED","FIXED"] },
        "type":        { "enum": ["LENGTH","ANGLE","COUNT","RATIO"] },
        "unit":        { "enum": ["mm","m","deg","count","ratio"] },
        "uiGroup":     { "type": "string" },
        "confidence":  { "type": "number", "minimum": 0, "maximum": 1 },
        "explanation": { "type": "string", "maxLength": 200 }
      },
      "required": ["candidateId","name","role","unit","confidence"] } } },
  "required": ["names"] }
```

**Representative response**

```json
{ "structureType": "SINGLE_CELL_BOX_CULVERT",
  "names": [
    { "candidateId": "param_span_1",   "name": "ClearSpan",           "role": "DRIVING",
      "type": "LENGTH", "unit": "mm", "uiGroup": "Clearance Dimensions", "confidence": 0.95,
      "explanation": "Spans the interior void horizontally — the clear waterway opening." },
    { "candidateId": "param_height_1", "name": "ClearHeight",         "role": "DRIVING",
      "type": "LENGTH", "unit": "mm", "uiGroup": "Clearance Dimensions", "confidence": 0.93,
      "explanation": "Vertical clearance from top of invert slab to soffit of deck slab." },
    { "candidateId": "param_offset_1", "name": "SideWallThickness",   "role": "DRIVING",
      "type": "LENGTH", "unit": "mm", "uiGroup": "Structural Thicknesses", "confidence": 0.90,
      "explanation": "Two opposing vertical boundary walls carrying lateral earth pressure." },
    { "candidateId": "param_offset_2", "name": "TopSlabThickness",    "role": "DRIVING",
      "type": "LENGTH", "unit": "mm", "uiGroup": "Structural Thicknesses", "confidence": 0.88,
      "explanation": "Horizontal solid face at the top resisting vehicular live load." },
    { "candidateId": "param_offset_3", "name": "BottomSlabThickness", "role": "DRIVING",
      "type": "LENGTH", "unit": "mm", "uiGroup": "Structural Thicknesses", "confidence": 0.88,
      "explanation": "Invert slab distributing structural and hydraulic load to the soil." }
  ] }
```

Because the **value 300 comes from geometry**, a wrong LLM guess can only produce a wrong *label*, which the author corrects in one click. It cannot corrupt the drawing. That asymmetry is the whole safety argument.

## 56. Guardrails

| Guardrail | Rule |
|---|---|
| **Zero geometric authority** | The LLM may write only `Parameter.name`, `Parameter.semanticTag`, `uiGroup`, and explanation text. Nothing else. Enforced by the type of the apply function, not by convention. |
| **Schema validation** | Every response validated against the JSON Schema plus Zod/Pydantic. Failures trigger one retry, then fallback. |
| **Semantic validation** | Reserved-word check, uniqueness check, regex check, referenced-candidate-exists check. Violations discarded. |
| **Human in the loop** | Names arrive as *editable suggestions*. Nothing commits without author accept. |
| **Timeout** | 3.0 s hard timeout; on expiry, fall back without blocking the workflow. |
| **Prompt injection** | The model receives only abstracted numeric descriptors; its output is schema-constrained and applied only to labels. Text ingested from a scanned drawing and destined for the model is sanitised, escaped, and length-capped. |
| **Privacy** | Never send full drawings, coordinate clouds, or binary CAD files. Send cluster statistics, adjacency, orientation, and topology role only. Keys live server-side behind a proxy; review vendor data-retention terms. |
| **Caching** | Key by hash of the abstracted descriptor (identical geometry → cached name), 24 h TTL. |
| **Cost** | Batch all candidates of one sketch into a single call. **User mode makes zero LLM calls** — names are baked into the template at commit. |

## 57. Deterministic fallback ladder — the system works with AI off

If the endpoint is unreachable, times out, or returns invalid JSON, a local rule-based classifier takes over:

```
horizontal inner void distance    → ClearSpan_1
vertical inner void distance      → ClearHeight_1
vertical solid offset             → WallThickness_1
top horizontal solid offset       → TopSlabThickness
bottom horizontal solid offset    → BottomSlabThickness
equal-leg chamfer cluster         → HaunchSize_1
repeated stride                   → Spacing_1 / Count_1
anything else                     → Parameter_N
```

**Rule:** the geometry engine `MUST NOT` depend on AI availability. AI is an accelerator, never a foundation. Ship the deterministic namer first; verify the whole draftsman → user round trip with the LLM disabled *before* integrating the API.

---

# PART IX — DRAFTSMAN & AUTHOR MODE

## 58. Module map

| Module | Responsibility | Libraries / existing code | In → Out |
|---|---|---|---|
| **M1 Interactive sketch canvas** | Draw/edit primitives, snap, tag dimensions semantically | Existing 2D Canvas (extend, don't replace); SVG scene graph | user events → geometry + user constraints |
| **M2 Normalisation & topology** | Weld with ONE mm tolerance; build DCEL | fix the 5-tolerance bug; `dcel.ts` | raw geometry → clean DCEL |
| **M3 GEOM-RP/1 relation engine** | Detect P1–P9 rotation-invariantly | new `vectorPredicates.ts`; replaces rotation-fragile `computeShapeBounds` and 45°-hardcoded `haunchRecognizer` | DCEL → candidate constraints with clause + confidence |
| **M4 Parameter & formula inference** | Cluster offsets → thicknesses; spans → ClearSpan; sums → formulas | DBSCAN / histogram binning; PSLQ/LLL; SymPy dedupe | constraints → candidate params + formula DAG |
| **M5 DOF & admissibility** | Pebble game + DM + SVD rank; mark free DOF as DRIVING candidates | wire in `admissibilityFilter.ts`; new `DulmageMendelsohnAnalyzer`; PlaneGCS diagnostics | constraint graph → dofReport + driving candidates |
| **M6 Solver bridge** | Push to PlaneGCS, solve, apply, re-solve perturbed for stability | `@salusoft89/planegcs`; analytical LM layer | ParametricSketch → coordinates + FC/stable verdict |
| **M7 LLM naming/explanation** | `Param_3` → `WallThickness`; explanation cards | Anthropic/OpenAI structured outputs + fallback | anonymised descriptors → names + text |
| **M8 Author review & commit** | Cards for params/formulas/DOF; accept/reject/edit; commit template | React review UI | reviewed model → `TemplateDefinition` + SVG/DXF snapshot |

Event flow:

```
user draws → primitive added → (optional) constraint added
   → ParametricSketch updated → DCEL dirty → solver runs → sketch redraws
   → detectors enqueue candidates → gate → cards appear (Author mode only)
```

## 59. The interactive sketch module

**Tools:** line, arc (3-point), rectangle (4 lines + implicit perpendiculars), circle, polyline, point, fillet/haunch, dimension, mirror, offset, trim, extend, move, stretch, array.

**Snapping and inferencing** — spatial query over an R-tree (`Flatbush`/`PlanarSet`) within a ~10 mm screen radius:

- endpoint (coincidence), midpoint, centre, intersection, quadrant
- orthogonal tracking (0°, 90°, 180°, 270°)
- extension tracking (collinear alignment with an existing segment)
- ghost-glyph relation hints; accepting a hint adds a `Constraint` with `confidence = 1.0`

**Transactions.** Every action pushes a reversible `(do, undo)` command. Multi-primitive operations (a rectangle) are one atomic transaction. The canvas is a **view**: each committed transaction mutates `Geometry`/`ConstraintGraph` and marks the DCEL dirty.

**Dragging.** Uses PlaneGCS `temporary` constraints (no permanent DOF change). On mouse-up the temporary is dropped and a real solve runs.

**Dimension tool.** Clicking two points or a segment creates an editable dimension entity. The user may leave it unnamed (system infers) or type a name (`ClearSpan`), which creates a DRIVING parameter inline.

## 60. CAD grips — replacing destructive resize

Figma-style eight-handle bounding-box resize applies uniform affine scaling and **destroys** engineering geometry by scaling wall thickness. It is removed. In its place, grips that operate on topological primitives:

| Grip | Glyph | Location | Command | Behaviour |
|---|---|---|---|---|
| **Vertex** | square | topological junction | `STRETCH` | Moves the shared joint; connected wall directions and thicknesses stay invariant |
| **Midpoint** | diamond | edge centre | `EDGE_OFFSET` | Translates the edge along its normal `n̂`; adjacent segment lengths adjust; perpendicular joints preserved |
| **Centroid** | circle | profile centre of mass | `MOVE` | Rigid translation `d = (Δx, Δy)` of the whole local frame; internal dimensions unchanged |
| **Rotation** | arc handle | offset from centroid | `ROTATE` | Only where the template permits rotation |

Whole-object scaling exists only as an **explicit, deliberate `SCALE` command** — never as an accidental selection behaviour.

During a grip drag, the drag solver applies Jacobian column scaling (§33) so the grabbed entity tracks the cursor while free DOF absorb the motion, and the null-space projection (§30.4) keeps the motion inside genuinely free directions.

## 61. Dimension badges as first-class constraints

Today `DimensionBadge.tsx` is `React.memo`, `pointer-events-none`, `select-none`, with no click handler and no input — **a draftsman cannot edit a dimension by clicking it anywhere in the app.** Making badges editable is the single highest-leverage feature in the whole plan, and it needs no new mathematics.

### State machine

```
 DISPLAY  ──click/tap──▶  EDITING  ──Enter──▶  COMMIT
    ▲                        │ Esc                 │
    └────────────────────────┘                     ▼
                                 resolve target entities in DCEL (vertex IDs / edge pair)
                                                   │
                                 existing driving constraint on this pair?
                                        ┌──────────┴──────────┐
                                       yes                    no
                                        │                      │
                              update its target value   create ParameterEntry(role=DRIVING)
                                        │                + ConstraintNode(distance/offset/angle,
                                        │                                 driving = true)
                                        └──────────┬──────────┘
                                                   ▼
                                       pre-solve DAG pass (§9)
                                                   ▼
                                       PlaneGCS / analytical LM solve
                                                   ▼
                                       write SOLVED double-precision coordinates back
                                       (NEVER mutate shape.width / shape.x2 directly)
                                                   ▼
                                       DCEL re-sync → invariant check → badge re-renders
```

**Rule (critical):** a badge commit `MUST NOT` write straight into `shape.width` / `shape.x2`. That is the ad-hoc-formula failure mode wearing a UI: it produces a number that *looks* parametric but has no constraint backing it, so the next unrelated edit silently un-satisfies it. Every commit routes through `ParameterManager.setDriving()` + a constraint node, then a re-solve.

### Three visual states

| State | Appearance | Click behaviour |
|---|---|---|
| **Driving** | dark graphite text, solid witness line | Edit directly |
| **Derived** | muted grey with a lock glyph | *"This dimension is governed by OuterWidth and WallThickness. Override it and make it a driving dimension?"* |
| **Conflicting** | red highlight (the FreeCAD/Abaqus industry convention, adopted rather than reinvented) | *"Setting ClearSpan to 700 conflicts with WallThickness and Haunch — try adjusting one of those first."* |

Conflict text is produced by mapping the DM over-determined block's constraint IDs back to `ConstraintNode.targetParameter` names. **Raw constraint IDs are never shown to a draftsman.**

## 62. Author review UI and template commit

After drawing, Author mode presents clustered, gated candidates:

```
┌───────────────────────────────────────────────┐
│ Suggested Parameters                          │
├───────────────────────────────────────────────┤
│ ✓ WallThickness       300 mm   (4 offsets)    │
│ ✓ ClearSpan          2000 mm   (1 void)       │
│ ✓ ClearHeight        1500 mm   (1 void)       │
│ ? SlabThickness       250 mm   (2 offsets)    │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Suggested Relationships                       │
├───────────────────────────────────────────────┤
│ ✓ 4 edges share a 300 mm offset      (P3)     │
│ ✓ 2 openings share a 2000 mm span    (P7)     │
│ ✓ left / right walls are symmetric   (P9)     │
│ ? haunch legs appear equal (49–50 mm) (P4)    │
└───────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Constraint Health                             │
├───────────────────────────────────────────────┤
│ ● Well-constrained    18 entities             │
│ ● Under-constrained    2 DOF  →  suggest dims │
│ ● Over-constrained     0                      │
└───────────────────────────────────────────────┘
```

For each card the author may **Accept / Reject / Edit / Rename**, set the **role** (DRIVING / DERIVED / FIXED), set units, bounds and step, choose among competing formulas, tag semantics, define ports and repeat rules, and attach standards metadata.

**Commit** writes a validated `TemplateDefinition` (all sub-models + FeatureScripts + component graph + provenance) plus an optional SVG/DXF snapshot thumbnail, after the regression harness of §75.7 passes.

### DOF status, for two different readers

| Reader | Presentation |
|---|---|
| **Draftsman** | Neutral/grey dot "N free" (with a suggestion of which dimension to add next) · green check "fully defined" · red "conflicting" with named parameters |
| **Author** | Full DM partition: under / well / over-constrained blocks, redundant-vs-conflicting distinction computed from real matching and residuals, per connected component |

## 63. Disambiguation — the case the naive engine gets wrong

An internal opening of nominal width `W_total = 2000 mm` with corner chamfers of leg `h = 49 mm` has straight-edge length `L_straight = W_total − 2h = 1902 mm`. The user increases the chamfer 49 → 62 mm.

Closure requires `W_total = L_straight + 2h` — **one equation, three variables.** Two valid behaviours exist:

- **Case A — hold `W_total`:** the straight edge absorbs it, shrinking by `2 × 13 = 26` mm → `L_straight = 1876 mm`.
- **Case B — hold `L_straight`:** the envelope absorbs it, growing 26 mm → `W_total = 2026 mm`.

**The engine resolves this deterministically through acceptance order and role tagging:**

- If the author previously accepted the outer containment relation (`Inner_Envelope = Outer − 2·t_wall`), then `W_total` is DERIVED/FIXED, so `L_straight` absorbs the change. No ambiguity.
- If the author instead declared the straight span a DRIVING parameter, the outer boundary moves outward.

Displaying explicit `[DRIVING]` / `[DERIVED]` tags on every parameter card communicates the governing hierarchy to both draftsman and author, so this never becomes a surprise.

---

# PART X — USER MODE RUNTIME

## 64. What the user sees

```
Single-Cell Box Culvert                            [ Export ▾ ]

Clearance Dimensions
  Clear Span        [ 2000 ] mm      (1200 – 6000)
  Clear Height      [ 1500 ] mm      (900 – 4500)

Structural Thicknesses
  Wall Thickness    [  300 ] mm      (≥ 250, IRC practice)
  Slab Thickness    [  250 ] mm      (≥ 200, IRC:SP:13)

Configuration
  Cell Count        [    1 ]         (1 – 6)

Derived (read-only)
  Total Width         2600 mm
  Total Height        2000 mm
  Net Concrete Area   1.34 m²
```

They do **not** see constraints, the DCEL, a Jacobian, a formula DAG, or PlaneGCS.

## 65. Template catalogue and loading

- Templates stored as versioned JSON (git-friendly) with a PostgreSQL JSONB index for search, or the local filesystem for desktop.
- Discovery by ID + version; instantiate into a live `ParametricSketch`; cache the parsed/validated document and compiled formula ASTs.
- On load the client instantiates (a) the scalar DAG in memory, (b) a PlaneGCS WASM instance initialised from the template's coordinates.
- The UI parses `parameters` and renders controls **only for DRIVING**; DERIVED values appear as live read-only badges; FIXED values appear in an "advanced/standards" disclosure.

## 66. The edit pipeline — every user change, exactly this

```
1. User edits a DRIVING parameter (slider / numeric input / badge)
2. Validate input        → physical bounds, standards profile, cross-parameter rules
3. Update the DRIVING parameter
4. Evaluate the scalar DAG in topological order (Kahn)            O(V+E), <1 ms
5. If a COUNT changed → regenerate procedural instances (§23.4), rebuild handles
6. Find the dirty geometry subgraph (BFS on the constraint graph)
7. Apply component / port / repeat transforms
8. Bind updated targets into constraint nodes
9. Solve (PlaneGCS warm-started; analytical LM for domain residuals)   2–10 ms
10. Rebuild / re-sync DCEL; re-assign face identity
11. Run the invariant report (§67) — on failure, roll back to last good state
12. Post-solve DAG pass: derived metrics (area, centroid, quantities)
13. Render (targeted DOM reconciliation)
```

**Value-only changes** use `setDatum`-style updates without re-initialising the solver. **Structural changes** (added/removed geometry, count change) force a full re-init — necessarily slower; show a brief progress state.

**Performance target:** < 100 ms perceived latency for a value change on a GAD-sized sketch. This is a **target to measure, not a verified benchmark** — no citable published PlaneGCS latency figure was found. Techniques: client-side WASM (no round trip), warm state, 30–50 ms input debounce, `setDatum` for value-only edits, web worker for heavy work. **Decision threshold:** if warm client solves exceed ~150 ms on representative sketches, move heavy solves server-side and keep the client for value-only updates.

## 67. Design-intent preservation and the invariant report

**Why intent survives, mechanically:** dimensions are driven by *named parameters*; thicknesses are *offset/equal constraints*, not scale factors; symmetry is a constraint; a haunch is an angle-plus-size constraint, not absolute coordinates. Components translate and repeat; they never uniformly scale. **Uniform scaling is structurally impossible because there is no global scale parameter anywhere in the model.**

After every meaningful edit, the `InvariantChecker` produces:

```
SOLVER
  status ............................ converged | stagnated | diverged
  max residual ...................... 3.1e-10 mm
  iterations / algorithm / time ..... 6 / dogleg / 4.2 ms

STRUCTURE
  under-constrained blocks .......... 0
  well-constrained blocks ........... 3
  over-constrained blocks ........... 0

GEOMETRIC INVARIANTS
  wall thickness deviation .......... 0.000 mm  (target 350)
  slab depth deviation .............. 0.000 mm  (target 300)
  haunch angle / leg deviation ...... 0.00° / 0.00 mm
  symmetry deviation ................ 0.001 mm
  inter-cell gap deviation .......... 0.000 mm  (target 10)

TOPOLOGY
  loop closure ...................... OK
  self-intersection ................. none
  chirality preserved ............... yes
  face identity retained ............ 14 / 14

ASSEMBLY
  port alignment error .............. 0.000 mm
  repeated instance count ........... 3 (expected 3)

COMPLIANCE
  parameter bounds .................. OK
  standards violations .............. none  (RDSO_CULVERT rev 3)
```

This report is what makes the system production-grade rather than a demo. In user mode it collapses to a single green/amber/red chip; in author mode it is fully expanded.

**Failure behaviour:** every re-solve is wrapped in a transaction. If the solve fails, or validation fails, or an invariant drifts beyond tolerance, **roll back to the last good state and explain**. The user never sees torn geometry.

## 68. Count changes in user mode

`CellCount: 1 → 3` with `ClearSpan = 2000`, `WallThickness = 350`, `Gap = 10`:

```
regenerate 3 cell instances from the repeat rule (index-stable IDs)
wire inter-cell coincidences
compose port frames:  ΔX_spacing = ClearSpan + IntermediateWallThickness
collapse redundant coincident edges between adjoining cells
re-init the solver, solve, check invariants
```

Result: walls stay 350, gaps stay 10, haunches unchanged, slab thickness unchanged, and

```
TotalSpan = 3 × 2000 + 4 × 350 + 2 × 10 = 7420 mm
```

Not: `scale everything × 3`.

## 69. Export

```
                  ParametricSketch (current solved state)
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   SVG exporter            DXF exporter             PDF sheet exporter
   (web, reports)          (ezdxf, R2010)           (title block, scale)
```

**Rule:** every exporter reads the **canonical model directly**. Never chain `SVG → DXF → PDF`; that makes an export artefact the de facto model and propagates its losses.

### DXF

`ezdxf` (MIT) — R12/R2000/R2004/R2007/R2010/R2013/R2018 read and write. Emit **R2010** as the interoperable default and **R12** as the maximally compatible fallback. Layer scheme following Indian drafting practice:

| Layer | Content | Style |
|---|---|---|
| `C-WALL-OUTL` | wall outlines | continuous, 0.50 mm |
| `C-SLAB-OUTL` | slab outlines | continuous, 0.50 mm |
| `C-HATCH-CONC` | concrete hatching | ANSI31 |
| `C-DIMS-ANNO` | dimensions, leaders, text | aligned dimension style, arrowheads, overrides |
| `C-CNTR-LINE` | centrelines, datums | centre linetype |
| `C-TITL-BLOC` | title block | — |

Dimensions are written as **native DXF `DIMENSION` entities referencing real geometric points**, so they stay associative when opened in commercial CAD.

### SVG

Serialise directly from the canonical geometry (client) or via `drawsvg` (server). Clean CSS styling, scalable paths, dimension overlays. (`svgwrite` is unmaintained per its own repository — prefer `drawsvg` for new code.)

### PDF sheets

A dedicated drawing-sheet pipeline: geometry + dimensions + text + title block + scale + layers → PDF, at A1/A2/A3 with formal borders, scale bars, and a project metadata table. `ezdxf` → matplotlib PDF backend, or ReportLab (BSD). PyMuPDF is faster but **AGPL-3.0** — see §84.

### Headless / batch

```
POST /v1/templates/{id}/instantiate   { params }                 → { sketchId, derived, dof, warnings }
POST /v1/sketches/{sketchId}/solve    { }                        → { status, conflicts, redundant, residual }
POST /v1/templates/{id}/render        { params, format, dxfVersion } → binary
GET  /v1/templates                    ?query                     → catalogue
```

```
gad-render --template culvert.json --set ClearSpan=5000 --set CellCount=3 \
           --format dxf --dxf-version R2010 --out out.dxf
```

The server render path reuses the **same** solver and exporter code as the client, guaranteeing parity.

## 70. Production integration context

Where this engine is consumed by an existing production application (an Angular SPA with `BridgeViewerComponent`, `BridgeStateService`, a `BRIDGE_REGISTRY` of rule engines and mappers, and a `DraftingCanvasContext` → `ExportManager` → Python/ezdxf export path):

- The kernel and template engine live in framework-agnostic packages (`cad-core/`, `packages/*`) and are called from both UI components and the DXF export path.
- Bridge-type rule engines compute derived dimensions using the kernel's derived metrics and constraint solving, so code compliance and drawing generation share one source of truth.
- The 2D Canvas is the **authoring** environment; the production engine **ingests the serialised template** to automate downstream construction documentation, quantities, and multi-view generation.
- Future tooling (author assistants, binding-suggestion services) operates over this unified schema, never over bespoke hardcoded renderers.

---

# PART XI — SECONDARY PATH: GAD PDF / IMAGE / DWG INGESTION

**Priority: last. Nothing in Parts I–X depends on it.** It is an alternative front door that produces a `ParametricSketch` identical in schema to draftsman output, then hands off to the *same* predicate engine, inference, solver, DOF analysis, and naming.

## 71. Pipeline

```
[ PDF / image / DWG ]
        │
        ├─ vector PDF ──► pdfplumber: line/curve/char geometry + transforms
        ├─ DXF ────────► ezdxf: LINE, LWPOLYLINE, ARC, CIRCLE, TEXT/MTEXT
        ├─ DWG ────────► out-of-process convert to DXF, then ezdxf
        └─ raster ─────► OpenCV: adaptive threshold, bilateral denoise,
                          morphological skeletonisation, probabilistic Hough
                          → potrace/autotrace vectorisation
        │
        ▼
  TOPOLOGICAL REBUILDER
   · endpoint snapping (ε_snap = 2.0 mm)
   · collinear merging
   · cross-intersection breaking at true intersections
        │
        ▼
  OCR & ANNOTATION ASSOCIATION
   · Tesseract / PaddleOCR (pre-trained only, no training)
   · find arrowheads + witness lines; match to nearest text
   · SCALE CALIBRATION: a segment measuring 399.7 units tagged "4000"
     gives scale S = 10.0 and a nominal target of exactly 4000 mm
   · classify and strip annotation layers from structural geometry
        │
        ▼
  DCEL + structural semantics  →  GEOM-RP/1  →  parameter inference
  →  formula inference  →  admissibility  →  solver  →  DOF  →  LLM naming
        │
        ▼
  AUTHOR REVIEW (mandatory)  →  template, byte-compatible with draftsman output
```

## 72. Accuracy limits and the mandatory-review rule

OCR of dimension text and layer/semantic interpretation are error-prone; DWG conversion can drop or mangle entities; raster vectorisation adds noise. Therefore:

> **Ingestion output is always a DRAFT that must pass the same author-review step as draftsman output before commit. It is never auto-published.** Low-confidence extractions are flagged prominently, and MEASURED parameters stay read-only until an author promotes them to DRIVING.

## 73. Ingestion licence traps (see §84 for the full matrix)

- **PyMuPDF is AGPL-3.0.** It is ~8–12× faster than pdfplumber, but the network clause triggers source-disclosure obligations for SaaS. **Default to pdfplumber (MIT).** Use PyMuPDF only under an Artifex commercial licence.
- **LibreDWG / libdxfrw are GPL.** Run any DWG→DXF conversion **out of process**, arms-length, as a CLI — or simply require DXF input.
- **ODA File Converter** is proprietary freeware with redistribution restrictions.
- Preferred posture: **accept DXF, not DWG.**

---
# PART XII — VERIFICATION

## 74. Fixture library

Every fixture exists in the repository and is used by multiple test layers.

**Basic**
```
rectangle · nested rectangle · rotated rectangle (15°, 37°, 45°)
triangle · circle · arc · concentric circles · eccentric circles
open polyline · closed polygon · self-touching polygon
```

**Civil**
```
single-cell box culvert (rect outer + octagonal void + 4 haunches)
two-cell culvert (intermediate web)
three-cell / N-cell culvert
haunched culvert with unequal legs (30°, 60°)
slab culvert · pipe culvert (circular)
retaining wall · pier cap · ROB cross-section
parapet · railing run with repeated posts
RDSO multi-cell balancing structure (see §76)
```

**Difficult (the generalisation proof set)**
```
arbitrary-angle haunch          rotated whole assembly at 15° / 37°
asymmetric geometry             mixed line + arc boundary
repeated components             rotated components
non-bridge component (railing)  disconnected assemblies in one document
anchored vs floating components deliberately redundant constraint set
deliberately conflicting set    near-singular / toggle configuration
```

## 75. Test taxonomy

### 75.1 Unit

- P1–P9 predicates, one test file per predicate (mirrors the existing `tests/unit/` convention).
- DCEL construction, welding, face tracing, **face-identity persistence across rebuilds**.
- Tolerance policy: a single source, and no module defines its own (enforced by a lint rule).
- Formula parser, AST symbol extraction, DAG topological order, cycle detection.
- Affine matrices: round-trip inversion precision `‖P − M⁻¹MP‖ < 1e-12`; orthonormal basis stability.
- Ports, port composition, repeat rules, index-stable ID generation.
- Grips: vertex stretch, midpoint edge offset, centroid rigid translation.
- Derived metrics against closed octagons, irregular polygons, and composites with holes.

### 75.2 Analytical-derivative verification

Every residual's analytical Jacobian **must** be cross-checked against central finite differences away from known singularities. A residual without this test does not ship.

### 75.3 Property-based (the rotation-invariance gate)

Generate random geometry, apply random rigid transforms (translation + rotation), and assert:

- The same candidate **types and values** are detected, within model tolerance.
- The primitive graph is unchanged.
- Pairwise vector measurements are unchanged.

This is the test that would have caught the bounding-box bug on day one, and it is non-negotiable.

### 75.4 Solver diagnosis

Constructed graphs for each class: **independent**, **redundant**, **conflicting**, **malformed**, **non-convergent**, **singular/toggle**. Each must produce a distinct, correct diagnosis — and a deliberately redundant dimension must produce a *different* result from a deliberately conflicting one.

### 75.5 No-mutation test

A rejected or inadmissible candidate `MUST NOT` modify persistent geometry or parameters. Assert byte-equality of the persistent store before and after a rejection.

### 75.6 Continuity tests

Repeated drag/commit cycles must not flip a valid chamfer, invert a haunch, or open a topological gap. Assert chirality sign preservation across 100 randomised drag sequences.

### 75.7 Stability sweeps (template elasticity)

A template is not finished when its *original* geometry solves. For every DRIVING parameter, sweep `P − δ`, `P`, `P + δ` across the declared range on a grid plus Latin-hypercube samples, regenerate instanced features, re-solve, and assert:

```
(a) solver status == converged at every sample
(b) no self-intersection in material faces
(c) DERIVED formulas stay in range
(d) semantic tags remain attached
(e) declared invariants (thickness, angle, symmetry, gap) hold
(f) primitives do not jump grid cells unexpectedly   ← the arXiv stability metric
```

Example: `ClearSpan ∈ {1500, 1800, 2000, 2200, 2500, 3000}`. Failing samples are reported with the exact breaking parameter combination. **Runs in CI on every template.**

### 75.8 Golden regression

Each template carries input parameters + expected invariants + expected geometry bounds + expected topology.

```
Given  ClearSpan = 2000, WallThickness = 300
Expect opening 2000 ± tol, wall 300 ± tol, symmetry true

Then   ClearSpan = 2500
Expect wall STILL 300, symmetry STILL true, haunch UNCHANGED
```

Golden-file export tests do **semantic** diffs of DXF/SVG output, not byte diffs.

### 75.9 Bridge invariants

Changing clear span or cell count preserves declared thicknesses, angles, symmetry, gaps, and port alignment. Explicit `CellCount: 3 → 4` interaction test with measured invariant checks — a gap the previous implementation session explicitly did **not** close.

### 75.10 Generality proof

An unrelated fixture — the railing/post system — must exercise the **same** primitive, constraint, port, and repeat code paths as the culvert, with no bridge-specific branch taken. Assert by code-path instrumentation, not by inspection.

### 75.11 End-to-end browser tests

Author acceptance → draftsman badge edit → direct drag → conflict recovery → port attachment → repeat count change → undo/redo → serialise → reload → re-solve → export.

### 75.12 Performance

Isolated-component and dense-connected-component scales. Assert incremental solve stays local; assert diagnosis cost does not grow quadratically with the number of independent components (the FreeCAD #31183 failure mode).

## 76. Acceptance gates (must pass to advance a phase)

| Gate | Criterion |
|---|---|
| **G0 Foundation** | One document model represents every fixture with **no shape-ID switches**. No geometry behaviour changes in this phase. |
| **G1 Topology** | Rotating any fixture does not change its primitive graph or any pairwise vector measurement. Disconnected components get separate topological and solve partitions. |
| **G2 Level-1 predicates** | A rotated nested rectangle produces the **same** offset candidates as the unrotated one. Arbitrary polygons use their real edges, never bounding boxes. |
| **G3 Badges + DOF** | Editing a committed `ClearSpan` badge re-solves bidirectionally; a deliberately redundant and a deliberately conflicting dimension produce distinct, correct results. |
| **G4 Level-2 predicates** | 30°, 45°, 60° chamfer fixtures retain their authored angle; circles stay concentric/tangent after a driving edit **and** a component rotation. |
| **G5 Components/ports** | A two-cell culvert **and** a railing/post fixture are both composed from ports and repeats, with no geometry-family-specific placement code. |
| **G6 Solver/perf** | The chosen solver meets interaction and convergence thresholds on the published benchmark suite; unsupported constraints route cleanly to the local residual registry or report clearly. |
| **G7 Inference quality** | On a 10-drawing reference set: **≥ 90 %** of true thicknesses/spans detected, and **zero** auto-introduced over-constraints. If formula false positives exceed ~10 % after perturbation validation, formulas remain suggestions-only permanently. |
| **G8 Authoring release** | An author can draw and author a non-rectangular, **rotated** detail without writing a formula; a draftsman changes exposed dimensions and receives invariant-preserving geometry with an auditable solve report. |
| **G9 Naming** | Author acceptance rate of LLM-proposed names **> 80 %** (tune prompts if lower). 100 % of exports pass the configured code checks. |

---

# PART XIII — VERIFIED CODEBASE AUDIT AND THE FIX LIST

*This part records what was directly verified in the `2D-Canvas` repository (branch `parametric_formulation`, commit `3c4956a`) rather than inferred. It exists so the team fixes the real problems, not the imagined ones.*

## 77. The one-line diagnosis

> The project has almost everything the architecture asks for — a DAG, a constraint graph, an admissibility filter, incremental BFS solving, a real LM solver, an LCS/affine system, a DCEL topology layer — and has connected almost none of it to anything else, **including the canvas**. There are not five competing engines fighting for control; there is one working engine (`model.ts` + the culvert/GAD path) and several correct, unused engines parked next to it.

That reframes the work: much less "build new maths", much more "wire four already-correct pieces to each other and to the badge the draftsman actually clicks."

## 78. Verified findings

| Area | Direct finding | Consequence |
|---|---|---|
| **Dimension badges** | `features/canvas/DimensionBadge.tsx` is `React.memo`, `pointer-events-none`, `select-none`. It computes `lineMetrics()` and renders a `<text>`. No click handler, no input, no `onChange`. Used only in `DraftPreview.tsx` (while drawing a *new* shape) and imported into `ShapeRenderer.tsx`. | **A draftsman cannot edit a dimension by clicking it anywhere in the app today.** Highest-leverage missing feature. |
| **Dimension overlay** | `ParametricDimensionOverlay.tsx` routes edits toward algebraic variable handling rather than creating a first-class geometric constraint. | Edits produce numbers with no constraint backing. |
| **GAD discovery** | `lib/geometry/gadAssemblyEngine.ts` (836 lines) builds candidate regions from shape bounds; `isGeometricallyContained` compares `minX/maxX/minY/maxY`. Rounds clearances, spans, and dimensions before creating suggestions. | Not rotation-invariant; treats a polygon's bounding box as its geometry. |
| **Nested-loop complexity** | `detectGADAssemblies` runs `for (child of candidates) for (cand of candidates)` — O(n²). Static analysis confirms **three call sites** (two in `gadAssemblyEngine.ts`, one in `model.ts`), so it runs 2–3× per solve transaction. | High CPU as entity counts scale. Unacceptable as a production path. |
| **Premature rounding** | **Eleven** `Math.round()` calls in `gadAssemblyEngine.ts`, lines ~299–409, inside the *inference heuristics* converting bounding-box gaps into candidate dimensions — not in the solver. | Systemic coordinate drift up to ±0.5 px per transaction. By contrast `levenbergMarquardt.ts` uses `Float64Array` with SVD regularisation and **zero** internal rounding. |
| **Haunch detection** | `recognizeHaunches()` filters `abs(θ_deg − 45.0°) ≤ 2.5°`, computed as `atan2(|Δy|,|Δx|)·180/π`. The loop branch also encodes `abs(abs(dx) − abs(dy)) < 3`. | Any 30° or 60° splay — common in hydraulic transitions — is rejected outright. |
| **"Solver" path** | `solveGADAssemblyAdjustment` changes rectangle widths, circle radii, polygon radii, and line endpoints through **shape-type branches**. | An assembly-specific procedural adjuster, not a general constraint solve. |
| **Formula acceptance** | Property Inspector dispatches `ACCEPT_INFERRED_FORMULA`; the reducer stores an expression string in `state.variables`; `runParametricSync` evaluates it top-down. | Accepted inference is **directional**. A direct geometry edit cannot solve the inverse relation. |
| **DAG dependency extraction** | `dualGraphOrchestrator.ts` `preSolveDAGPass()` uses `dep.formula.includes(other.name)`. | A parameter `W` falsely depends on any formula containing `WallThickness`, `SkewWidth`, `Weight`. Confirmed live. |
| **DOF analysis** | `bipartiteGraph.ts` `calculateDegreesOfFreedom()` returns `max(0, totalDof − totalEquations − 3)`. One global scalar. | No matching, no partition, no identification of *which* constraint conflicts; and subtracting 3 once is wrong for disconnected or anchored assemblies. |
| **DM decomposition** | Despite the filename and `tests/unit/bipartite_partition.test.ts`, this is **not** a Dulmage–Mendelsohn decomposition. | The tests validate something that isn't DM. |
| **Admissibility filter** | `lib/inference/admissibilityFilter.ts` implements the SVD row-space projection **correctly**. `grep` shows `isConstraintAdmissible` is called from exactly one place: its own unit test. | **Dead code that happens to be right.** |
| **BFS partition** | `lib/parametric/graph/bfsPartition.ts` `extractConnectedSubgraphsBFS` is correct; callers are `dualGraphOrchestrator.ts` (itself unused) and its own test. | Incremental solving is unavailable in the live path. |
| **Parameter manager** | `lib/parametric/parameterManager.ts` — clean, correct roles and DAG logic. `ParameterManager` and `DualGraphOrchestrator` are instantiated **only** inside `tests/unit/parametric_dag.test.ts`. | The entire clean parameter layer sits next to the app, not inside it. |
| **Analytical Jacobians** | The analytical-Jacobian module is dead; the variational kernel uses finite differences. | Slower, less accurate than the code already present. |
| **DCEL** | A DCEL implementation exists; runtime code uses simpler closed-cycle detection instead. It is **not read by the detector**. | Topology exists but is unused where it matters most. |
| **Working solve** | `lib/state/presets/singleCellCulvert.ts` `SingleCellCulvertModel` genuinely calls `solveLevenbergMarquardt()` with a real `SystemModel`/Jacobian (hand-derived 24×24) — a working, tested, correct anisotropic culvert solve. | But `clearSpan`, `clearHeight`, `wallThickness`, `haunchLeg` are hardcoded fields on a hand-written class, not data a non-programmer can author. |
| **Templates ×3** | Three non-identical representations coexist: wired-but-old `BUILTIN_TEMPLATES` (`lib/parametric/templates.ts`, used by `TemplateModal.tsx`); orphaned `rccBridgeTemplate.ts` (`generateRCCBridgeAssembly()` computing absolute coordinates — `centerX = 500`, `deckTopY = 200` — with **zero call sites** outside its own file); and the aspirational `TemplateDefinition`. | `rccBridgeTemplate.ts` is **exactly "Path A — hardcoded renderer"**, freshly rewritten. |
| **`model.ts`** | 955 lines, **seven** major `switch` blocks over **24** hardcoded magic strings. | Generalisation currently requires new code per family — the opposite of authoring from geometry. |
| **`main` branch** | Contains none of the advanced work: no `lib/inference`, no `lib/solver`, no `parameterManager.ts`, no `dualGraphOrchestrator.ts`, no `gadAssemblyEngine.ts`, no `boundaryLimits.ts`. | All sophisticated work lives only on `parametric_formulation` and is unmerged. |
| **Tests** | Progression `155 passing / 36 files (6 failures)` → `166 / 40` → **`170 passing / 41 files, 0 failures, 1,036 assertions`**. Suites verified stable: `cad_grips` (4/4), `drag_damping`, `dual_graph_ast_dependencies`, `dulmage_mendelsohn`, `lm_solver_convergence`. Full run confirmed via `bun run test`, 7 Sep 2026. | Real evidence of progress; **not** proof of universal capability. |
| **Build environment** | `npm install && npx vitest run` fails in sandboxes with `TypeError: Cannot read properties of null (reading 'edgesOut') at Arborist.buildDepStep` — an npm Arborist lockfile bug from peer-dependency conflicts across React 19 canary typings, Vite 6, and Vitest. Resolved with `npm install --legacy-peer-deps` or Bun. | Environmental, not a source defect. Document it in the README. |

## 79. The magic-string inventory in `model.ts`

| Switch domain | Feature | Magic identifiers | Failure mode |
|---|---|---|---|
| Inner opening horizontal webs | Single-cell void | `culvert_inner_top`, `culvert_inner_bottom` | Fails if the opening is drawn as discrete segments or a polyline |
| Corner haunches | Chamfered transitions | `culvert_haunch_tr`, `_br`, `_bl`, `_tl` | Fails if vertex ordering changes, or if the corner uses a circular fillet |
| Exterior envelopes | Outer/inner vertical webs | `culvert_inner_right`, `culvert_inner_left`, `culvert_outer_right` | Blocks dynamic multi-cell expansion; cannot instantiate intermediate dividing walls |
| Multi-bay bindings | Two-cell openings | `b1_top`, `b1_haunch_tr`, `b1_right`, `b1_haunch_br`, `b2_top`, `b2_right` | Hardcoded for exactly two bays; three or more fails at runtime |
| Post-solve haunch metrics | Display values | `haunch_delta_x`, `haunch_delta_y`, `haunch_angle` | Applies `Math.abs` to coordinate differences as display metrics |

## 80. Traced failure — why multi-cell breaks today

**Single nested shape (N = 1)** works: `asm.features.length === 1`; clearances

```
t_L = inner.minX − outer.minX     t_R = outer.maxX − inner.maxX
t_T = outer.maxY − inner.maxY     t_B = inner.minY − outer.minY
```

give `t_L ≈ t_R` and `t_T ≈ t_B`, so the synthesiser instantiates `WallThickness` and `SlabThickness` and emits `Inner_Width = Outer_Width − 2·WallThickness`. `ACCEPT_INFERRED_FORMULA` records it; `runParametricSync` evaluates top-down. Undo/redo works.

**Two or more nested shapes (N ≥ 2)** breaks: the engine treats each void independently against the outer envelope. For Void 1 it measures a left clearance of 350 mm and an *apparent* right clearance of 2450 mm (spanning Void 2 **plus** the external wall); for Void 2, the mirror. It emits

```
Void1_Width = Outer_Width − LeftOffset    − RightClearance
Void2_Width = Outer_Width − LeftClearance − RightOffset
```

Because there is **no horizontal bay-clustering pass**, it never recognises that the space between the voids is an intermediate web `t_mid`, and never produces the clean relation

```
TotalWidth = 2·ClearSpan + 2·t_ext + t_mid
```

Instead it shows **eleven disjoint, unmerged formula cards**. Accepting them introduces circular dependencies into the DAG and the canvas locks on the next edit.

**Non-nested / non-orthogonal features** fail earlier: external railing posts are classified as unrelated root shapes because they fail the AABB containment check, and non-45° chamfers are discarded by `recognizeHaunches`. Users are forced back to manual coordinates.

## 81. Keep / Change / Add / Delete

**KEEP**
- The 2D Canvas frontend — extend, do not replace. It is the right home for drawing, snapping, and rendering.
- `lib/geometry/topology/dcel.ts`, `lib/geometry/lcs/` (affine matrices, frames).
- GEOM-RP/1 as the protocol; the Geometric Fact / Inference / User Constraint confidence taxonomy; the `tests/unit/` convention.
- `admissibilityFilter.ts` — correct maths.
- `bfsPartition.ts` — correct algorithm.
- `parameterManager.ts` — correct roles and DAG.
- `SingleCellCulvertModel`'s residuals and hand-derived Jacobian — real, tested domain knowledge. Re-express it as **data**, keep the maths.
- The GAD heuristic — demoted to a **warm-start predictor only** (a fast `X₀`, never the final answer).
- Gauss–Seidel relaxation — as a cheap first pass on small sketches only.

**CHANGE / CORRECT**
1. **Collapse five vertex-weld tolerances into one mm-based constant** in a shared `tolerance.ts`, injected everywhere. Add lint enforcement and unit tests. *(Do this first; every downstream detection is untrustworthy until it lands.)*
2. **Replace substring dependency extraction with AST symbol extraction** using the existing `expression.ts` parser.
3. **Delete premature `Math.round()` from the inference heuristics.** Keep the state vector as raw `Float64Array`; round only at SVG rasterisation and badge string formatting (`toFixed(1)`).
4. **Replace `computeShapeBounds`-based detection with P3** computed from the DCEL boundary graph. Deprecate `computeShapeBounds` across all inference modules.
5. **Replace the hardcoded 45° test in `recognizeHaunches`** with the measured angle (P4). `recognizeHaunches` becomes the reference implementation to generalise, not to discard. Delete the fixed rule only after the measured replacement passes all regressions.
6. **Replace the scalar DOF count** in `bipartiteGraph.ts` with a real `DulmageMendelsohnAnalyzer` (Hopcroft–Karp + alternating-path partition + Tarjan BTF), and fix the rigid-motion subtraction to be **per connected component, anchored components exempt**.
7. **Wire the canvas to a real solver.** Add `lib/solver/planegcsClient.ts` wrapping `GcsWrapper`; use `driving:false` for reference dimensions and `temporary` for dragging.
8. **Delete proportional/conformal scaling from the solve path** entirely. Keep it only as a non-authoritative drag preview.
9. **Do not attempt counts inside the solver** — move to the procedural repeat layer.
10. **Replace `eval` in formula paths** with `asteval` (server) / scoped `mathjs` (client).
11. **Make `DimensionBadge.tsx` editable** with the three visual states and the commit state machine of §61.
12. **Replace the Figma-style eight-handle selection box** with CAD grips.

**ADD**
- `lib/geometry/predicates/vectorPredicates.ts` — P1–P9.
- Pre-display candidate **clustering** in `autoFormulaEngine.ts` (group by predicate signature, bin within `ε_cluster`).
- `lib/parametric/component/portSolver.ts` — 3×3 affine port composition using `lib/geometry/lcs/affineMatrix.ts`.
- Repeat-rule instancing engine with index-stable IDs.
- Deterministic formula inference with perturbation validation.
- DM-based DOF localiser and the invariant checker.
- Face-identity persistence across DCEL rebuilds.
- The template regression harness, gated in CI.
- LLM adapter with structured-output contract, guardrails, cache, and offline fallback.
- A cleanly separated ingestion module boundary (even if empty for now).
- `TemplateValidationReport` produced by wiring the existing `boundaryLimits.ts` to run at template-save time.

**DELETE (only after templates cover the same drawings — never before)**
- The 24 magic-string switch blocks in `model.ts`.
- `rccBridgeTemplate.ts`'s hardcoded coordinate generator (re-expressed as a canonical template first).
- The 45° hardcoded haunch rule.
- `computeShapeBounds` in inference paths.

**MERGE**
- `parametric_formulation` → `main`. Everything above is worthless sitting on a branch nothing else builds on. *(Confirm with the repo owner that `parametric_formulation` is the intended future of `main` and not an abandoned spike — the roadmap assumes the former.)*

## 82. Honest limits of the audit

- `gadAssemblyEngine.ts` (836 lines) and `model.ts` (955 lines) were **not** read in full; the switch-statement and `Math.round` counts come from targeted greps. There may be more resolvers than those quoted.
- The separate **production CAD** (`template.schema.ts`, `template-runner.service.ts`, `binding-suggestion.service.ts`, `template-bind-field.tool.ts`) is not on GitHub and could not be inspected. §25's schema is written to be a reasonable merge target for it, but that half is design-level, not verified.
- Claims that "all waves completed" in the implementation session are **not** supported end-to-end: no direct-dimension edit test from click through solver update; no `CellCount: 3 → 4` interaction test with measured invariants; the planned PlaneGCS WASM worker / `planegcsClient` / rank-preserving filter do **not** appear in the final patch inventory; no production merge, commit hash, or deployment proof is recorded.
- **Correct characterisation:** a strong, tested prototype milestone — not yet a proven production civil CAD kernel.

---

# PART XIV — TECHNOLOGY STACK AND LICENSING

## 83. The stack, decided

| Layer | Decision | Source | Licence | Role |
|---|---|---|---|---|
| **Frontend language** | **TypeScript** (React 19 + Tailwind) | — | — | Editor, review UI, user panel; shared types generated from JSON Schema |
| **Rendering** | **SVG** as canonical 2-D layer, Canvas 2D acceleration for large scenes; **Paper.js** (MIT) optional as a vector scene-graph helper if the existing canvas needs one | native · paperjs.org | MIT | Precise geometry, selection, dimension overlays, transforms, hit-testing, export, DOM integration, 60 fps drafting |
| **Client solver** | **`@salusoft89/planegcs`** (PlaneGCS → WebAssembly) | github.com/Salusoft89/planegcs · npmjs.com/package/@salusoft89/planegcs | **LGPL-2.0-or-later** (confirmed on npm; v1.1.7 current) | In-browser DogLeg/LM/BFGS/SQP; `driving:false`, `temporary`; full TS types; `init_planegcs_module()`, `GcsWrapper`, `GcsSystem` |
| **Server solver** | **`planegcs` Python bindings** | piwheels.org/project/planegcs | LGPL | Authoring batch, inference, headless render |
| **Domain solver layer** | In-house analytical LM/SVD (`levenbergMarquardt.ts` + hand-derived Jacobians) | your repo | yours | Culvert/haunch/anisotropic residuals; exact partials |
| **Geometry (client)** | **`@flatten-js/core`** + **`@flatten-js/boolean-op`** | github.com/alexbol99/flatten-js | MIT | 2-D primitives, DE-9IM relations, distance queries, polygon booleans, `PlanarSet` spatial index |
| **Geometry (server)** | **Shapely** | github.com/shapely/shapely | BSD-3-Clause | Polygon/area/boolean on faces (GEOS) |
| **Robust offsets** | **Clipper2 / `pyclipr`** | github.com/AngusJohnson/Clipper2 · github.com/drlukeparry/pyclipr | **Boost Software License 1.0** | Integer-precision offsetting/insetting for wall generation |
| **Exact predicates** | **robust-predicates** | github.com/mourner/robust-predicates | MIT | `orient2d`, `incircle` |
| **Spatial index** | **Flatbush** / **RBush** | github.com/mourner/flatbush · rbush | MIT | Broad-phase candidate retrieval |
| **Topology** | In-house half-edge DCEL | your repo | yours | The canonical parametric model — **not** OpenCascade |
| **Expression engine (client)** | **mathjs** (or `expr-eval`) | mathjs.org | Apache-2.0 (MIT) | Scoped safe evaluation, derivatives |
| **Expression engine (server)** | **asteval** | github.com/lmfit/asteval | MIT | Restricted-AST safe evaluation |
| **Graph algorithms** | **networkx** + custom Hopcroft–Karp / DM / Tarjan | networkx.org | BSD-3-Clause | DAG topo-sort, cycle detection, matching |
| **Numerics** | **NumPy / SciPy** | scipy.org | BSD-3-Clause | Jacobian rank, SVD, `sparse.csgraph` matching |
| **Clustering** | **scikit-learn** (DBSCAN) | scikit-learn.org | BSD-3-Clause | 1-D offset/length clustering |
| **Symbolics (authoring only)** | **SymPy** | sympy.org | BSD-3-Clause | Formula simplification/dedup, off the hot path |
| **Backend** | **Python 3.11+ / FastAPI** | fastapi | MIT | REST + WebSocket, persistence, LLM proxy, export, batch |
| **Database** | **PostgreSQL 16** (JSONB for templates) | — | PostgreSQL | Template registry, search, auth |
| **DXF** | **ezdxf** (server) · `@tarikjabiri/dxf` (client, optional) | github.com/mozman/ezdxf · github.com/dxfjs/writer | MIT | R12–R2018 read/write; native `DIMENSION` entities |
| **SVG (server)** | **drawsvg** | pypi.org/project/drawsvg | *(confirm SPDX)* | Replaces unmaintained `svgwrite` |
| **PDF** | **ezdxf → matplotlib** backend, or **ReportLab** | reportlab | BSD | Drawing-accurate vector sheets |
| **LLM** | **Anthropic Claude Messages API** (Structured Outputs) or **OpenAI** (`json_schema`, strict) | platform.claude.com · openai.com | commercial SaaS | Naming + explanation only |
| **Ingestion (vector)** | **pdfplumber** | github.com/jsvine/pdfplumber | MIT | Default PDF extraction — commercial-safe |
| **Ingestion (raster/OCR)** | **OpenCV** + **Tesseract / PaddleOCR** | opencv.org | Apache-2.0 | Pre-trained only, no training |
| **Desktop packaging** | **Tauri** (preferred) or Electron | tauri.app | MIT/Apache-2.0 | Offline/air-gapped deployment |
| **Reference oracle (DEV ONLY)** | SolveSpace `slvs` / `py-slvs` | github.com/solvespace/solvespace | **GPLv3** | Cross-checking during development. **NEVER linked into the product.** |

## 84. Licence risk matrix

| Component | Licence | Risk for a closed commercial product | Decision |
|---|---|---|---|
| **PlaneGCS** (C++, WASM port, Python bindings) | **LGPL-2.0/2.1-or-later** | **Low** — LGPL permits use in closed-source applications when the library is dynamically linked and replaceable and its own source/changes are published. The WASM port's authors explicitly note LGPL "makes it the only fully-featured 2D geometric constraint solver usable for closed-source applications." | **USE.** Keep it modular (a WASM blob / wheel). Publish any modifications *to PlaneGCS itself*. Document the relinking path in `NOTICE`. |
| **SolveSpace `slvs` / py-slvs / python-solvespace** | **GPLv3** | **High / viral** — SolveSpace's own library page states the GPLv3 "generally forbids linking the library with proprietary software." `py-slvs` is also inactive. | **BAN from production.** Dev-time oracle only, behind a process boundary, with legal sign-off. |
| **CAD_Sketcher** (Blender add-on) | GPL-3.0 (wraps py-slvs) | High, and Blender-coupled | **Reference architecture only.** Study its py-slvs wrapper patterns; depend on nothing. |
| **jsketcher** | Dual OSS/Commercial; OSS terms forbid integration into non-open systems | High unless commercially licensed | **Reject** unless a commercial licence is purchased. |
| **OCCT / pythonocc-core / replicad** | LGPL-2.1 **with linking exception** / LGPL-3.0-or-later / MIT | Low (the exception allows commercial embedding) | **Optional.** Not needed for 2-D GAD. Noted for a possible 3-D future. |
| **FreeCAD (as a library)** | LGPL-2.1+ | Low but heavy; drags OCCT | **Server/batch only, optional.** Useful as a diagnostic fallback. |
| **CGAL** | GPL/LGPL dual, commercial via GeometryFactory | **High** for the GPL packages | **Avoid the GPL packages entirely.** Use only LGPL foundation packages, or buy the commercial licence. |
| **Clipper2 / pyclipr** | **Boost Software License 1.0** | None | Use freely. |
| **ezdxf, Shapely, networkx, NumPy/SciPy, asteval, scikit-learn, flatten-js, SymPy, mathjs, robust-predicates, Flatbush/RBush** | MIT / BSD / Apache-2.0 | None | Use freely. |
| **PyMuPDF (fitz)** | **AGPL-3.0** | **High** for SaaS/closed distribution — the network clause triggers source disclosure | **Default to pdfplumber (MIT).** PyMuPDF only under an Artifex commercial licence. |
| **LibreDWG / libdxfrw** | **GPL** | High if linked into a distributed product | Run DWG→DXF **out of process** as an arms-length CLI, or require DXF input. Prefer "accept DXF, not DWG." |
| **ODA File Converter** | Proprietary freeware | Redistribution restricted | Optional, user-installed. |
| **Anthropic / OpenAI APIs** | SaaS ToS | Not copyleft; data-handling review needed | Fine for inference. Review data-retention terms. |
| **drawsvg, freecad-stubs** | *SPDX not individually pinned in sources* | Unknown | **Confirm before shipping.** |

**Bottom line:** the recommended stack (LGPL PlaneGCS + MIT/BSD/Apache/Boost libraries) is commercial-safe. The traps are **GPL solvers (py-slvs/SolveSpace)**, **AGPL PyMuPDF**, **GPL DWG libraries**, and **GPL CGAL packages**. Run a formal licence audit against this table before any distribution, confirm PlaneGCS stays dynamically linked and replaceable, and explicitly exclude the banned artefacts from the shipped bundle.

## 85. What was considered and rejected

| Option | Why rejected |
|---|---|
| Rewrite in Python with a Blender/FreeCAD front end | Discards a working TS canvas, DCEL, LCS, and tests; puts a Qt/Blender GUI where a web UX is needed |
| jsketcher as the editor | Licence forbids closed-source integration |
| CAD_Sketcher / py-slvs as the solver | GPLv3 viral; py-slvs inactive |
| OpenCascade as the canonical 2-D model | A generic kernel cannot carry the semantics (this offset is `WallThickness`, these three cells are a repeated assembly, this edge is a port) that the product exists to manage. Use it, if ever, as a utility — never as the source of truth |
| Training Vitruvion / DAVINCI / PICASSO | Forbidden by requirement; needs GPUs and datasets; mechanical-CAD domain mismatch; unauditable for code-governed work |
| AutoConstrain (Fusion 360) | Proprietary; unavailable |
| A giant LLM agent that "controls CAD" | The LLM would be writing coordinates. Categorically rejected |
| Formula-only architecture | Cannot support bidirectional editing; the original problem |
| Global uniform scaling | Destroys thicknesses, haunches, slabs, and gaps |
| Hardcoding civil types (`if culvert: … if ROB: …`) into the kernel | The exact failure mode being replaced |

---

# PART XV — ROADMAP, RISK, AND DEPLOYMENT

## 86. Phased plan

Effort assumes a small team of **3–4 engineers** (1 geometry/solver, 1 backend/inference, 1 frontend, shared QA). Each phase is independently shippable and independently testable.

### Phase 0 — Source of truth and safety *(2–3 weeks)*
- Freeze the canonical schema (`ParametricSketch`, `TemplateDefinition`) as JSON Schema; generate TS + Python types.
- **Unify the five vertex-weld tolerances into one shared mm-based policy** with lint enforcement.
- Freeze the current procedural GAD adjuster behind a legacy interface.
- Add the fixture library (§74) and capture current outputs as regression fixtures where behaviour is intentional.
- Stand up CI, the build-environment fix (`--legacy-peer-deps` / Bun), and the `NOTICE`/licence audit skeleton.

**Exit (G0):** one document model represents every fixture with no shape-ID switches. No geometry behaviour changes in this phase.

### Phase 1 — Primitive and topology foundation *(3–4 weeks)*
- Primitive adapters, stable IDs, model-unit tolerance policy, vertex welding, loop orientation, spatial index.
- Rectangles and polygons lower into shared segment/vertex graphs; source editing IDs preserved.
- DCEL made an **input to the detector** (it currently is not read).
- Face-identity persistence + its unit tests.
- Fix the AST dependency extraction (substring → symbol table) and delete premature `Math.round()` from inference.

**Exit (G1):** rotating any fixture changes neither its primitive graph nor any pairwise vector measurement. Disconnected components get separate partitions.

### Phase 2 — Level-1 predicates and candidates *(3–4 weeks)*
- Implement P1, P3, P8 (+ coincidence, distance/length, point-on-line, fixed).
- Replace axis-aligned discovery in the candidate path with vector calculations.
- Add pre-display **clustering**; wire `admissibilityFilter.ts` into the pipeline.
- Keep the existing formula cards as a temporary UI adapter, but emit **typed constraint candidates**, not formula strings.

**Exit (G2):** a rotated nested rectangle produces the same offset candidates as the unrotated one; arbitrary polygons use their real edges.

### Phase 3 — Badges, solver orchestration, DOF *(4–5 weeks)*
- Make `DimensionBadge.tsx` editable with the full state machine and three visual states.
- Route badge commits through `ParameterManager` + `ConstraintNode` + re-solve; never mutate `shape.width` directly.
- Integrate `@salusoft89/planegcs` (WASM) behind `planegcsClient.ts`; **spike it first against the single-cell and two-span culvert benchmarks** before wider commitment.
- Replace scalar DOF with `DulmageMendelsohnAnalyzer` (Hopcroft–Karp + partition + Tarjan BTF); fix per-component rigid-motion subtraction.
- Wire `bfsPartition` into the solve loop for dirty-subgraph solving.
- Show neutral / green / red status with semantic names.

**Exit (G3):** editing a committed `ClearSpan` badge re-solves bidirectionally; redundant and conflicting dimensions give distinct results; `dulmage_mendelsohn` and `lm_solver_convergence` suites pass.

### Phase 4 — Level-2 predicates: circular and angular *(3–4 weeks)*
- Signed angle, general chamfer (P4 measured angle), parallel offset refinement, concentricity (P5), radial offset, point-on-circle/arc, tangency (P6).
- Delete the fixed 45° rule **after** its measured replacement passes all regressions.

**Exit (G4):** 30/45/60° chamfer fixtures retain their authored angle; circles stay concentric/tangent after a driving edit and a component rotation; skewed sketches at 15°/37°/45° detect offsets and chamfers without distortion.

### Phase 5 — Parameter and formula inference *(4–5 weeks)*
- Offset clustering, equal-length clustering, repeated-span detection, symmetry detection, topology-based dimensions.
- Formula candidate generation (dimension stacks, integer-relation search) with the four validation gates.
- Live drag-invariance detector feeding the same queue.
- Nothing is silently committed.

**Exit (G7):** on a 10-drawing reference set, ≥ 90 % of true thicknesses/spans detected and zero auto-introduced over-constraints.

### Phase 6 — Author mode *(4–5 weeks)*
- Parameter cards, formula cards, constraint cards, DOF visualisation, semantic tagging, port editor, repeat editor, standards editor.
- Rejection memory and suggestion supersession.
- Template commit + `TemplateValidationReport` + SVG/DXF snapshot.
- The single click *"these four offsets are WallThickness"* eliminates dozens of manual formulas.

**Exit:** an author draws and authors a **rotated, non-rectangular** detail without writing a formula.

### Phase 7 — Components, ports, repeats *(4–6 weeks)*
- `portSolver.ts` with 3×3 affine composition; P9 symmetry.
- Repeat-rule instancing with index-stable IDs; count-change regeneration.
- Migrate `BUILTIN_TEMPLATES`, `rccBridgeTemplate.ts`, and `SingleCellCulvertModel` into the canonical schema **as data**.
- Remove the magic-string switch blocks from `model.ts` **only once templates reproduce the same drawings**.

**Exit (G5):** a two-cell culvert **and** a railing/post fixture are both composed from ports and repeats, with no family-specific placement code; changing Bay 1's `ClearSpan` expands Bay 1 and rigidly translates Bay 2 with constant web and external wall thicknesses.

### Phase 8 — User mode and validation *(3–4 weeks)*
- Template catalogue/registry; DRIVING-only parameter panel with bounds and cross-parameter validation.
- Standards profiles (RDSO/IRC) as data; amber warnings with clause citations.
- The full edit pipeline with dirty-subgraph solving, invariant report, and transactional rollback.
- Count-driven instancing exposed to end users.

**Exit:** a non-expert edits `ClearSpan` and `CellCount`; components translate and repeat (never scale); invalid combinations are blocked or explained; everything works offline.

### Phase 9 — LLM naming, exports, hardening *(3–4 weeks)*
- LLM adapter with structured outputs, guardrails, cache, deterministic fallback, server-side proxy.
- SVG / DXF (R2010 + R12) / PDF exporters from the canonical model; batch REST + CLI.
- Regression harness in CI; observability; golden-file semantic diffs.
- Merge `parametric_formulation` → `main`.

**Exit (G9):** DXF opens cleanly in AutoCAD/LibreCAD; all-template sweeps pass; naming acceptance > 80 %; latency SLOs measured and met.

### Phase 10 — GAD ingestion *(6–12 weeks, optional)*
- Vector PDF and DXF first; DWG via out-of-process conversion; raster + OCR last.
- Topological rebuilder, dimension-text association, scale calibration.
- Feeds the identical downstream pipeline; output always a review-required draft.

**Exit:** a sample vector-PDF GAD is recovered into a review-ready draft template, with core modes unaffected when the module is absent.

### Compressed 20-week view (3 developers)

```
Week:  01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20
P0/P1  [==========]                     (schema, tolerance, DCEL, WASM spike)
P2/P3        [==========]               (predicates, badges, solver, DOF)
P4/P5              [==========]         (L2 predicates, inference)
P6/P7                    [==========]   (author mode, ports, repeats)
P8/P9                          [======] (user mode, exports, hardening)
P10                                     (ingestion — separate track)
```

## 87. Risk matrix

| Failure mode | Root cause | Guardrail |
|---|---|---|
| **Numerical singularity** | Kinematic toggle positions, collinear segments, rank deficiency | Powell's Dogleg trust region + SVD pseudo-inverse regularisation; clamp `λ` when `κ(J) > 1e8`; fall back to warm-start coordinates if the residual norm stalls |
| **Solver divergence on large jumps** | Extreme parameter change in one step (2 m → 20 m) | Homotopy sub-stepping at `ΔL ≤ 500 mm`, warm-starting each step |
| **Model inversion / branch jump** | Non-linear distance constraints with dual algebraic roots | Solution hysteresis; chirality sign check `τ_initial · τ_trial > 0`; logarithmic barrier as signed area → 0; Bentley–Ottmann self-intersection rejection |
| **Coordinate drift across saves** | Premature `Math.round()` in inference heuristics | Raw `Float64Array` state; rounding only at rasterisation and badge formatting (`toFixed(1)`) |
| **Combinatorial graph explosion** | Global solving over thousands of entities | BFS subgraph partitioning; DR-plan cluster condensation; solve only the modified connected component |
| **Quadratic diagnosis cost** | Many independent components diagnosed together (FreeCAD #31183) | Partition before diagnosing — treated as a correctness requirement |
| **Draftsman confusion from redundant inferences** | Unmerged candidate proposals | Mandatory pre-display clustering within `ε_cluster`; SVD admissibility gate on every candidate |
| **Circular DAG dependencies** | Formula strings referencing variables circularly | Tarjan cycle detection at edit time; block the assignment and name the loop |
| **Formula false positives** | Curve fitting masquerading as design intent | Perturbation validation + dimensional consistency + minimum support + Occam ranking; author review always; if FP > 10 %, formulas stay suggestions-only permanently |
| **Count-change breakage** | Formulas bound to specific instances | Index-stable IDs (a pure function of instance index) + re-bind rules; count-sweep tests |
| **Face-identity loss** | DCEL rebuild churns face IDs, detaching semantic tags | Centroid + tag-set matching across rebuilds; dedicated sweep tests |
| **PlaneGCS mis-reporting redundancy** | Known FreeCAD edge cases | Independent DM analysis as the authority; prefer `solve()` return codes over uncertain getters; surface diagnostics as guidance, not gospel |
| **LLM failure / hallucination / latency** | External API | Zero geometric authority; strict schema + retry; 3 s timeout; deterministic fallback namer; the app must work fully with AI off |
| **Licence contamination** | GPL/AGPL creep into the bundle | The §84 matrix; ban list enforced in CI dependency scanning; legal review before release |
| **Untrusted template files** | Malicious `expr` strings, oversized documents | JSON-Schema validation; reject unknown major versions; treat `expr` as data fed only to a restricted evaluator; size/complexity caps |
| **Prompt injection via scanned text** | OCR'd drawing text reaching the LLM | Sanitise, escape, length-cap; the model receives only abstracted descriptors and can only write labels |
| **Scope drift** | Broad architecture work attached to narrow requests | Phase gates with explicit exit criteria; each phase independently shippable |

## 88. Deployment

### Topology

```
CLIENT (browser, or Tauri/Electron shell)
  · React 19 + TypeScript shell
  · SVG scene graph (Canvas 2D acceleration where needed), 60 fps target
  · PlaneGCS WASM solver  — single CPU core, < 15 MB, < 10 ms typical solve
  · IndexedDB cache for offline template persistence
        │  HTTPS / WebSocket
        ▼
BACKEND (Dockerised Linux, AWS/Azure/on-prem)
  · Python 3.11 / FastAPI — stateless render & solve API
  · Geometry + export engine (ezdxf, ReportLab, pdfplumber)
  · PostgreSQL 16 — users, projects; JSONB for templates
  · Redis / in-process LRU — parsed templates, compiled ASTs, LLM cache
        │  outbound HTTPS only
        ▼
OFF-THE-SHELF AI (inference only)
  · Anthropic Claude / OpenAI — naming and explanation
```

**Web app (recommended default):** static frontend on a CDN + client-side WASM solving (works offline, no round trip per solve) + a thin stateless backend for storage, auth, export, and the LLM proxy (keys never reach the client).

**Local desktop:** package the same frontend and a bundled Python core with **Tauri** (preferred) or Electron; SQLite for local storage; FastAPI as an embedded child process. Essential for engineering organisations that cannot upload drawings externally.

**Hybrid:** thin client + server solve for very large sketches.

### Resources

- **CPU only. No GPU. No training.** Backend containers at 2 vCPU / 4 GB are sufficient. The WASM solver uses one core and ~15 MB.
- Latency budgets: interactive value-only solve **< 100 ms** (target, to be measured); full re-init tens of ms; template regression sweep (hundreds of samples) seconds, run async/CI.
- LLM: one batched call per template at authoring time; **zero calls in user mode**.
- GPU is optional and only ever for raster GAD vision, OCR at volume, or large PDF batches.

### Communication

- **Client ↔ WASM:** synchronous in-memory bindings passing `Float64Array` buffers through Emscripten memory — no JSON serialisation during continuous drags.
- **Client ↔ backend:** WebSocket for live session sync; REST for exports (`/api/export/dxf`, `/api/export/pdf`).
- **Backend ↔ LLM:** encrypted outbound HTTPS via official SDKs, 3.0 s timeout, server-held keys.

### Security

- **Formula sandboxing:** asteval (server) / scoped mathjs (client). Never raw `eval`. Symbol table restricted to declared parameters + a math whitelist. Cap expression length and evaluation time.
- **Untrusted templates:** schema-validate on load; refuse unknown major versions; never deserialise executable code; enforce size/complexity limits (DoS).
- **Prompt injection:** as §56.
- **Statelessness:** the render/solve API is stateless (document in, result out) and scales horizontally behind a load balancer.

### Observability

Structured logs per solve (status code, DOF proxy, residual, timing, algorithm); latency and failure metrics; the template regression harness in CI; golden-file semantic diffs for exports; property-based tests for the formula DAG; DCEL face-identity tests across sweeps.

---

# PART XVI — HONEST BOUNDARIES

State these in product copy, not just internally.

## 89. Three separate capabilities, three different confidence levels

| Capability | Can the system do it? |
|---|---|
| **Geometry recognition** — line, arc, circle, polygon, offset, symmetry, tangency, chamfer angle | **Yes, deterministically and reliably.** |
| **Parametric reconstruction** — "a 300 mm repeated offset", "a 2000 mm repeated opening", "three equal bays" | **Yes**, with evidence, confidence, and clustering. |
| **Engineering semantics** — "this 2000 mm opening *is* the Clear Span" | **Sometimes.** Requires template context, semantic rules, or author confirmation. |

**Therefore the product promise is:**

> *The system parametrically reconstructs arbitrary supported geometry. Engineering semantic interpretation is evidence-driven and author-confirmable.*

Not: *"the system knows what your drawing means."* That is an overclaim, it was made in earlier work, and it is corrected here.

## 90. Explicit non-goals and limits

- **Freeform curves.** Splines, ellipses, and hand-drawn irregular boundaries are preserved and rendered but are not constraint-editable until a residual and Jacobian exist for them. Curve fitting is a different problem and arguably out of scope for precision drafting.
- **Coincidental matches.** Two edges that happen to be equal without intent still need a human decision. Inference surfaces it faster; it does not resolve it.
- **3-D.** Everything here is 2-D. Nothing implies an extension to 3-D geometry, elevations, or B-rep solids.
- **Imported imperfect geometry.** Dimension styles, hatching conventions, and standards-specific civil checks need explicit adapter and residual work. Preserve them in files if necessary, but never claim their relationships are editable until conformance tests exist.
- **Native DWG.** Not available in open TS/Python libraries without ODA. Plan a DXF interchange step.
- **Generative AI in the constraint or solve path.** Categorically excluded. If AI is used later, it is restricted to ranking or naming candidates. The deterministic predicate engine, admissibility test, author confirmation, and numeric solver remain the source of truth.
- **"Fully constrained" as a correctness proof.** It is not. See §5.

## 91. Things this document explicitly says NOT to build

```
✗ A large LLM agent that controls CAD
      LLM → "make this parametric" → LLM writes coordinates          NO.

✗ A formula-only architecture
      parameter → coordinate formula → coordinate                    Breaks bidirectional editing.

✗ Global scaling to implement parameter changes
      ClearSpan × 1.25 → scale everything                            Destroys thickness, haunch, slab, gap.

✗ Automatic acceptance of every detected relationship
      Inference stays a CANDIDATE until validated and confirmed.

✗ Civil object types hardcoded into the kernel
      if culvert: … if ROB: … if pier: …                             Use components, ports, tags, constraints.

✗ Counts solved inside the constraint solver
      Cardinality is topology. Regenerate procedurally, then solve.

✗ A second parametric engine for scanned drawings
      Ingestion is a front door to the same core.
```

---

# PART XVII — APPENDICES

## Appendix A — Glossary

| Term | Meaning |
|---|---|
| **Admissibility** | Whether a candidate constraint is linearly independent of the accepted set (SVD row-space test) |
| **BTF** | Block Triangular Form — ordering of square subsystems for sequential solving |
| **Candidate** | A detected relationship not yet accepted by a human |
| **Chirality** | Handedness; the sign of the cross product of consecutive edges |
| **DCEL** | Doubly Connected Edge List — half-edge planar topology |
| **DM decomposition** | Dulmage–Mendelsohn: partitions a bipartite graph into under/well/over-determined blocks |
| **DOF** | Degrees of freedom — remaining independent motions |
| **DRIVING / DERIVED / FIXED / MEASURED** | Parameter roles (§20) |
| **Design intent** | The set of relationships that must survive parameter change |
| **GEOM-RP/1** | The internal geometric resolver protocol (Part VI) |
| **Haunch** | A chamfered corner transition between slab and wall |
| **Homotopy sub-stepping** | Splitting a large parameter change into converging increments |
| **Invariant report** | The post-edit verification bundle (§67) |
| **LCS** | Local coordinate system — a component's own affine frame |
| **Minimum-norm solution** | The update that satisfies constraints while moving vertices least |
| **P1–P9** | The nine rotation-invariant predicates |
| **PlaneGCS** | FreeCAD's 2-D geometric constraint solver |
| **Port** | A named local frame on a component boundary, used for attachment |
| **Repeat rule** | A procedural array specification driven by a count parameter |
| **Residual** | `f(X)` — how far a constraint is from satisfied |
| **Stability** | Whether geometry stays put (beyond what the edit requires) after re-solve |
| **Warm start** | Initialising a solve from the previous solution |

## Appendix B — `ParametricSketch` JSON Schema (abbreviated core)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ParametricSketch",
  "type": "object",
  "required": ["sketchId","schemaVersion","units","tolerances","parameters",
               "formulas","primitives","topology","constraints"],
  "properties": {
    "sketchId":      { "type": "string", "format": "uuid" },
    "schemaVersion": { "type": "string", "const": "1.0" },
    "engineVersion": { "type": "string" },
    "name":          { "type": "string" },
    "units": {
      "type": "object", "required": ["length","angle"],
      "properties": {
        "length": { "enum": ["mm","m","in","ft"] },
        "angle":  { "enum": ["deg","rad"] } } },
    "tolerances": {
      "type": "object",
      "properties": {
        "weld_mm":            { "type": "number", "default": 0.5 },
        "geometry_mm":        { "type": "number", "default": 0.5 },
        "cluster_mm":         { "type": "number", "default": 1.0 },
        "angle_rad":          { "type": "number", "default": 0.008726 },
        "solver_residual":    { "type": "number", "default": 1e-8 },
        "singular_value_eps": { "type": "number", "default": 1e-10 },
        "independence_eps":   { "type": "number", "default": 1e-6 } } },

    "parameters": { "type": "object", "additionalProperties": {
      "type": "object",
      "required": ["id","name","role","type","value"],
      "properties": {
        "id":          { "type": "string" },
        "name":        { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9_]{0,39}$" },
        "role":        { "enum": ["DRIVING","DERIVED","FIXED","MEASURED"] },
        "type":        { "enum": ["LENGTH","ANGLE","COUNT","RATIO","BOOLEAN"] },
        "value":       { "type": "number" },
        "unit":        { "enum": ["mm","m","deg","rad","count","ratio"] },
        "minValue":    { "type": "number" },
        "maxValue":    { "type": "number" },
        "step":        { "type": "number" },
        "semanticTag": { "type": "string" },
        "uiGroup":     { "type": "string" },
        "codeRef":     { "type": "string" },
        "confidence":  { "type": "number", "minimum": 0, "maximum": 1 },
        "provenance":  { "enum": ["GeometricFact","Inference","UserConstraint",
                                  "UserFormula","Measurement"] } } } },

    "formulas": { "type": "array", "items": {
      "type": "object",
      "required": ["targetParameterId","expression","dependencies"],
      "properties": {
        "targetParameterId": { "type": "string" },
        "expression":        { "type": "string" },
        "dependencies":      { "type": "array", "items": { "type": "string" } },
        "description":       { "type": "string" } } } },

    "primitives": {
      "type": "object",
      "required": ["points","lines","arcs","circles"],
      "properties": {
        "points": { "type": "object", "additionalProperties": {
          "type": "object", "required": ["id","x","y","isConstruction"],
          "properties": {
            "id": { "type":"string" }, "x": { "type":"number" }, "y": { "type":"number" },
            "isConstruction": { "type":"boolean" },
            "fixed": { "type":"boolean" },
            "dofStatus": { "enum": ["FREE","FIXED_X","FIXED_Y","FULLY_CONSTRAINED"] } } } },
        "lines": { "type": "object", "additionalProperties": {
          "type": "object", "required": ["id","startPointId","endPointId","isConstruction"],
          "properties": {
            "id": { "type":"string" }, "startPointId": { "type":"string" },
            "endPointId": { "type":"string" }, "isConstruction": { "type":"boolean" },
            "semanticRole": { "type":"string" } } } },
        "arcs": { "type": "object", "additionalProperties": {
          "type": "object",
          "required": ["id","centerPointId","startPointId","endPointId","radius","isConstruction"],
          "properties": {
            "id": { "type":"string" }, "centerPointId": { "type":"string" },
            "startPointId": { "type":"string" }, "endPointId": { "type":"string" },
            "radius": { "type":"number" }, "isConstruction": { "type":"boolean" } } } },
        "circles": { "type": "object", "additionalProperties": {
          "type": "object", "required": ["id","centerPointId","radius","isConstruction"],
          "properties": {
            "id": { "type":"string" }, "centerPointId": { "type":"string" },
            "radius": { "type":"number" }, "isConstruction": { "type":"boolean" } } } } } },

    "topology": {
      "type": "object", "required": ["halfEdges","faces"],
      "properties": {
        "halfEdges": { "type": "object", "additionalProperties": {
          "type": "object",
          "required": ["id","originPointId","twinHalfEdgeId","nextHalfEdgeId","faceId","primitiveId"],
          "properties": {
            "id": { "type":"string" }, "originPointId": { "type":"string" },
            "twinHalfEdgeId": { "type":["string","null"] },
            "nextHalfEdgeId": { "type":"string" },
            "prevHalfEdgeId": { "type":"string" },
            "faceId": { "type":"string" }, "primitiveId": { "type":"string" } } } },
        "faces": { "type": "object", "additionalProperties": {
          "type": "object",
          "required": ["id","outerHalfEdgeId","innerHoles","semanticCategory"],
          "properties": {
            "id": { "type":"string" }, "outerHalfEdgeId": { "type":"string" },
            "innerHoles": { "type":"array", "items": { "type":"string" } },
            "nestingDepth": { "type":"integer" },
            "semanticCategory": { "enum": ["VOID","TOP_SLAB","BOTTOM_SLAB","OUTER_WALL",
                                           "INTERNAL_WEB","HAUNCH","FOOTING","BARRIER",
                                           "DECK","PIER","UNCLASSIFIED"] },
            "hatchPattern": { "type":"string" } } } } } },

    "constraints": { "type": "object", "additionalProperties": {
      "type": "object", "required": ["id","type","entities","isActive"],
      "properties": {
        "id":   { "type": "string" },
        "type": { "enum": ["COINCIDENT","COLLINEAR","HORIZONTAL","VERTICAL","PARALLEL",
                           "PERPENDICULAR","EQUAL_LENGTH","EQUAL_RADIUS","CONCENTRIC",
                           "DISTANCE_POINT_TO_POINT","DISTANCE_POINT_TO_LINE",
                           "OFFSET_LINE_TO_LINE","SYMMETRIC","TANGENT","POINT_ON_OBJECT",
                           "MIDPOINT","ANGLE","RADIUS","DIAMETER","CHAMFER_EQUAL_LEG","FIXED"] },
        "entities":         { "type": "array", "items": { "type": "string" } },
        "parameterBinding": { "type": ["string","null"] },
        "targetValue":      { "type": ["number","null"] },
        "strength":  { "enum": ["fixed","driving","hard","soft","reference","temporary"] },
        "driving":   { "type": "boolean" },
        "isActive":  { "type": "boolean" },
        "predicate": { "enum": ["P1","P2","P3","P4","P5","P6","P7","P8","P9"] },
        "provenance":{ "enum": ["GeometricFact","Inference","UserConstraint"] },
        "confidence":{ "type": "number", "minimum": 0, "maximum": 1 },
        "state":     { "enum": ["active","suppressed","conflicting","redundant"] },
        "diagnostic":{ "type": "string" } } } },

    "assemblies": { "type": "object", "additionalProperties": {
      "type": "object",
      "required": ["id","componentType","repeatParameterBinding","baseAnchorPointId","ports"],
      "properties": {
        "id": { "type":"string" },
        "componentType": { "type":"string" },
        "repeatParameterBinding":  { "type":"string" },
        "spacingParameterBinding": { "type":"string" },
        "spacingMode": { "enum": ["driven","derived"] },
        "baseAnchorPointId": { "type":"string" },
        "ports": { "type":"array", "items": {
          "type":"object", "required": ["portId","pointId","direction"],
          "properties": {
            "portId":   { "type":"string" },
            "pointId":  { "type":"string" },
            "kind":     { "enum": ["point","edge","axis"] },
            "direction":{ "type":"array", "items": {"type":"number"},
                          "minItems": 2, "maxItems": 2 } } } } } } },

    "dofReport": {
      "type": "object",
      "properties": {
        "total":  { "type": "integer" },
        "status": { "enum": ["UC","FC","OC","NotSolvable"] },
        "byComponent": { "type": "array", "items": {
          "type": "object",
          "properties": {
            "componentId": { "type": "string" },
            "dof":         { "type": "integer" },
            "block":       { "enum": ["under","square","over"] } } } },
        "conflicting": { "type": "array", "items": { "type": "string" } },
        "redundant":   { "type": "array", "items": { "type": "string" } },
        "maxResidual": { "type": "number" },
        "stable":      { "type": "boolean" } } }
  }
}
```

## Appendix C — Formula reference card

```
GEOMETRY
  d      = B − A                        d̂ = d/‖d‖            n̂ = (−d̂y, d̂x)
  θ      = atan2(d₁ × d₂, d₁ · d₂)
  d⊥     = |(P₀ − P₁) × û|
  A      = ½ Σ (xᵢ y_{i+1} − x_{i+1} yᵢ)            (shoelace; sign = winding)
  A_net  = |A_outer| − Σ |A_hole|
  Cx     = (1/6A) Σ (xᵢ + x_{i+1})(xᵢ y_{i+1} − x_{i+1} yᵢ)
  Ixx    = (1/12) Σ (yᵢ² + yᵢ y_{i+1} + y_{i+1}²)(xᵢ y_{i+1} − x_{i+1} yᵢ)

PREDICATES (rotation-invariant)
  P1 parallel      |d̂A × d̂B| < ε_angle
  P2 perpendicular |d̂A · d̂B| < ε_angle
  P3 offset        δ = (B − A)·n̂A ;  |δ_start − δ_end| < ε_dist
  P4 chamfer       θC = atan2(dC × d̂A, dC · d̂A) ; legs equal iff ||hA|−|hB|| < ε_dist
  P5 concentric    ‖CA − CB‖ < ε_dist ; radial = |rA − rB|
  P6 tangent       | |(CB − Astart) × d̂A| − rB | < ε_dist
  P7 equal length  | ‖dA‖ − ‖dB‖ | < ε_dist
  P8 coincident    ‖PA − PB‖ < ε_weld
  P9 symmetry      R = I − 2n̂n̂ᵀ ; ‖O + R(PA − O) − PB‖ < ε_dist

RESIDUALS
  dist     (xj−xi)² + (yj−yi)² − D²
  horiz    yj − yi          vert   xj − xi
  parallel (x2−x1)(y4−y3) − (y2−y1)(x4−x3)
  perp     (x2−x1)(x4−x3) + (y2−y1)(y4−y3)
  offset   N/L − T,  N = −Δy(xp−xa) + Δx(yp−ya),  L = √(Δx²+Δy²)
  haunch   (x1−xc)² − (y2−yc)²
  angle    atan2(d1×d2, d1·d2) − θ_target
  tangent  |(C−A)×d̂| − r
  symmetry ‖O + R(PA−O) − PB‖

SOLVER
  min ½‖F(X)‖²
  LM        (JᵀJ + λ diag(JᵀJ)) ΔX = −Jᵀ F
  gain      ΔL = ½ ΔXᵀ(λ ΔX − g),  g = Jᵀ F        ← the ½ is mandatory
  Dogleg    h_GN = −J⁺F ; α = ‖g‖²/‖Jg‖² ; h_SD = −αg ; h(β) = h_SD + β(h_GN − h_SD)
  min-norm  ΔX* = −V Σ⁺ Uᵀ F
  converge  ‖F‖∞ < 1e-8   (residual, not step)

DOF
  WRONG  DOF = 2V − C − 3                       (global scalar)
  RIGHT  DOF_k = |V_k| − rank(J_k) − D_anchor,k (per component; anchor 0 or 3)
  DM     Hopcroft–Karp matching → G_under / G_square / G_over ; Tarjan BTF

ADMISSIBILITY
  g⊥ = (I − VVᵀ)g
    ‖g⊥‖ ≥ 1e-6                       → independent  → offer
    ‖g⊥‖ < 1e-6 and |f| < ε_tol       → redundant    → discard silently
    ‖g⊥‖ < 1e-6 and |f| ≥ ε_tol       → conflicting  → reject + explain

DRAG DAMPING
  J_scaled = J S⁻¹ ,  S_jj = 0.05 (dragged) | 1.0 (free) | 1000 (anchored)
  stiffness ratio (1/0.05)² = 400
  ΔX_projected = Σ_{i>r} (vᵢᵀ ΔX_cursor) vᵢ

AFFINE
  M = [ s cosθ  −s sinθ  x₀ ; s sinθ  s cosθ  y₀ ; 0 0 1 ]
  M_C = M_P · T(O_port,P) · R(θ_port,P) · T(d_offset) · R(θ_rel) · T(−O_port,C)

TEMPLATE ALGEBRA
  InnerWidth = OuterWidth − 2·WallThickness
  TotalSpan  = N·ClearSpan + (N+1)·WallThickness + (N−1)·Gap
  PostCount  = floor(L_deck / MaxSpacing) + 1
  Spacing    = L_deck / (PostCount − 1)
```

## Appendix D — RDSO worked example (the target output)

Parameters of an RDSO-style multi-cell balancing culvert / bridge unit:

| Parameter | Example | Role |
|---|---|---|
| Cell count | 3 | DRIVING (COUNT) |
| Clear span | 2000 mm | DRIVING |
| Wall thickness | 350 mm | DRIVING |
| Barrel length | 6850 mm | DRIVING |
| Curtain wall span | 9150 mm | DRIVING |
| Track spacing | 6260 mm | DRIVING |
| Drop wall thickness | 250 mm | DRIVING |
| Inter-cell gap | 10 mm | FIXED |
| Haunch angle | 45° | FIXED |
| Total span | `3×2000 + 4×350 + 2×10 = 7420 mm` | DERIVED |

Components: repeated box units, return walls, curtain wall, drop wall, 45° flares, bridge and track centrelines.

Required behaviour:

- Changing clear span expands openings **horizontally only**.
- Wall thickness stays 350 mm; gaps stay 10 mm; flare/haunch angles unchanged.
- Increasing cell count instantiates another unit **through ports**.
- Return walls and drop wall expand with the assembly.

## Appendix E — End-to-end narrative (the product in one page)

```
Draftsman draws:

      ┌─────────────────────────┐
      │                         │
      │   ┌───────────────┐     │
      │   │               │     │
      │   └───────────────┘     │
      │                         │
      └─────────────────────────┘

System detects (P1, P3, P8, P9):  parallel · coincident · offset · symmetry
System measures offsets:          300 · 299.7 · 300.2 · 300.0
System clusters:                  WallThickness ≈ 300
System detects the void:          ClearSpan ≈ 2000 · ClearHeight ≈ 1500
System gates candidates:          SVD independence · solver test · stability sweep
LLM names them:                   WallThickness · ClearSpan · ClearHeight
Author confirms once.

System constructs:  constraints + formula DAG + topology + semantic components + ports
Template saved (versioned JSON + provenance).

────────────────────────────────────────────────────────────────────────────

Later, a different user opens the template and types:

    ClearSpan = 2500 · ClearHeight = 1800 · WallThickness = 350

Runtime:  DAG → component transforms → PlaneGCS → topology → invariants → render

Result:
                    2500 clear span
             ←──────────────────────→
             ┌────────────────────────────┐
             │                            │
   350 →     │                            │     ← 350
             │                            │
             └────────────────────────────┘
                          ↑
                     1800 clear height

The walls remain 350. The opening becomes 2500. The height becomes 1800.
No global scaling. No manual formula editing. No redrawing.

That is the product.
```

## Appendix F — The fifteen foundational decisions

These are the choices that must be made correctly *before* implementation begins. Each is restated in one line, with the section that develops it.

1. **Variational simultaneous solver over procedural formula evaluation.** Abandon text formulas as the foundation of geometry. Formulas set *target parameters*; geometry is resolved by a simultaneous solver. *(§9, §29)*
2. **Planar map (half-edge DCEL) over flat coordinate arrays.** Vertices meeting at a junction share one topological record, so coincidence is inherent rather than approximated by distance constraints. *(§12, §19)*
3. **Deprecation of conformal similarity scaling.** Replace `k = L_target / L_orig` with variational solving; structural assemblies need anisotropic deformation where slabs and haunches translate rigidly while spans elongate. *(§8)*
4. **Damped Levenberg–Marquardt with SVD over plain Newton–Raphson.** Newton diverges near singularities and under-constraint; LM+SVD gives the stable minimum-norm update needed for interactive dragging. *(§29)*
5. **Strict boundary between persistent and calculated state.** Persist topology, driving dimensions, constraints, formulas, components. Treat coordinates, matrices, Jacobians, and areas as transient caches. *(§13)*
6. **Dual-graph separation — DAG for causality, bipartite graph for variational invariants.** This is what eliminates circular-dependency bugs in closed-loop geometry. *(§9)*
7. **Analytical Jacobians over finite differences.** Exact partials remove truncation error, avoid 2n residual evaluations per iteration, and preserve quadratic convergence. *(§28)*
8. **Automated inference with rank-based admissibility filtering.** Every inferred constraint passes an independence test against the existing Jacobian before insertion, so the assistant cannot silently over-constrain the drawing. *(§32)*
9. **Local affine frame hierarchies over global coordinate lists.** Multi-cell configurations are modelled in local frames linked by 3×3 matrices, enabling modular replication and rotation. *(§37)*
10. **Hysteresis and solution continuity over arbitrary root jumping.** Always initialise from the previous frame, minimising movement and preventing geometric flipping. *(§31)*
11. **Native chamfer/haunch primitives with measured-angle invariants.** Corner transitions are linked to adjacent boundary normals by invariant projections, preserving their orientation when walls translate — with the angle **measured**, never hardcoded. *(§28.6, §40 P4)*
12. **Incremental subgraph partitioning by connected component.** Re-solve only the affected component; never the whole drawing. *(§34)*
13. **Zero external visual runtime dependencies in the kernel.** The kernel is a pure TypeScript mathematical library, isolated from UI frameworks, emitting standard SVG path data — for testability and performance. *(§14)*
14. **First-class construction geometry.** Datum axes, symmetry centrelines, and theoretical sharp corners participate fully in the constraint graph without contributing to boundary loops or area calculations. *(§36)*
15. **Area-weighted centroid superposition for composite geometry.** Centres of mass for sections with voids use first-moment integration with hole subtraction, giving accurate structural metrics for free. *(§35)*

## Appendix G — Source and claim ledger

| ID | Claim | Source and access note |
|---|---|---|
| S1 | Live branch state, file behaviour, test results (155→166→170 passing; 41 files; 1,036 assertions) | Direct local inspection of `2D-Canvas` @ `parametric_formulation`, commit `3c4956a`; `bun run test`, 7 Sep 2026 |
| S2 | Sketch constraints, dimensional editing, DOF workflow | FreeCAD Sketcher Workbench documentation (`FreeCAD/FreeCAD-documentation` wiki) |
| S3 | PlaneGCS primitive support, `driving`/`temporary` flags, DogLeg/LM/BFGS/SQP, WASM wrapper, LGPL-2.0-or-later, v1.1.7 | `github.com/Salusoft89/planegcs` README + npm metadata, accessed 7 Sep 2026 |
| S4 | Geometry/topology separation and exchange boundary | ISO 10303-42; ISO 10303-108 (constraints and design intent in 2-D sketches) — public scope pages |
| S5 | Explicit-constraint and dimension vocabulary | ISO/TS 10303-1788, ISO/TS 10303-1789 — public scope pages |
| S6 | Requirement keywords | RFC 2119 (Mar 1997), updated by RFC 8174 |
| S7 | Constraint generation vs design intent; solver-as-verifier; FC rates 8.87 % / 34.24 % / 93.05 % (RLOO) / 91.59 % (GRPO); stability metric; anchor rule (A.4); bipartite representation (A.2) | Casey et al., *Aligning Constraint Generation with Design Intent in Parametric CAD*, Autodesk Research, ICCV 2025 — arXiv:2504.13178 (v1 cited by user; v2 dated 5 Aug 2025 adds W. P. McCarthy — **standardise on one version**) |
| S8 | Connected-component diagnosis performance (quadratic growth; partitioning gains) | FreeCAD issue #31183 (open) |
| S9 | FreeCAD naive DOF-count failures; "popularity contest" redundancy heuristic | FreeCAD issues #15850, #6174, #8324 |
| S10 | `sketch.solve()` return codes (0 / −1 / −2 / −3 / −4); no guaranteed scalar DOF getter on the Python `SketchObject`; build-dependent conflict getters; verified authoring methods (`setDatum`, `setDriving`, `renameConstraint`, `getIndexByName`, missing-constraint analysers, `autoRemoveRedundants`) | FreeCAD main-branch `SketchObjectPyImp.cpp` + independent FreeCAD 1.1 testing |
| S11 | SolveSpace GPLv3 "generally forbids linking the library with proprietary software" | solvespace.com library page |
| S12 | Licences: ezdxf MIT · Shapely BSD-3 · Clipper2 Boost 1.0 · PyMuPDF AGPL-3.0 · py-slvs/python-solvespace GPLv3 · flatten-js MIT · networkx BSD · asteval MIT · mathjs Apache-2.0 | Respective project repositories / package metadata |
| S13 | Anthropic Structured Outputs public beta 14 Nov 2025, header `structured-outputs-2025-11-13`, Sonnet 4.5 / Opus 4.1, constrained decoding, Pydantic/Zod via `beta.messages.parse` | Anthropic release announcement + docs — **re-confirm GA status at implementation time** |
| S14 | OpenAI Structured Outputs strict schema adherence (`gpt-4o-2024-08-06` reported 100 % schema adherence in strict mode) | OpenAI structured-outputs documentation |
| S15 | IRC/IRS values (M25/M35 grades; 40/50/55 mm cover; SP:13 cell sizes and slab thicknesses) | IRC:112 Cl. 6.1, Table 14.2; IRC:SP:13 — **read the current official editions before hard-coding; SP:13 has 2004 and 2022 editions, IRC:112 has 2011 and 2020 editions; secondary sources vary** |
| S16 | Corroborating ML lineage: DAVINCI (BMVC 2024, Karadeniz et al.), CadVLM (Autodesk, ECCV 2024), SketchGraphs (2020–2025), Vitruvion (PrincetonLIPS) | Respective papers/repositories — cited for the "solver is the source of truth" conclusion only |
| S17 | Dulmage–Mendelsohn decomposition; Hopcroft–Karp; Tarjan SCC; PSLQ integer relation (Ferguson & Bailey); Laman/Jacobs–Hendrickson pebble game; Bentley–Ottmann; DCEL (Preparata & Shamos) | Standard literature; Pyomo `incidence_analysis.dulmage_mendelsohn`, `scipy.sparse.csgraph`, JGraphT for reference implementations |

**Unverified items to confirm before or during implementation**

1. Whether `@salusoft89/planegcs`'s `.d.ts` re-exports the DOF/conflicting/redundant getters — inspect `planegcs_dist/*.d.ts`. If absent, add a small binding patch or rely on our own SVD/DM analysis.
2. `drawsvg` and `freecad-stubs` SPDX identifiers.
3. Current Anthropic Structured Outputs GA status, model availability, and SDK surface (`output_config` vs legacy `output_format`).
4. The exact IRC/RDSO clause values from the current official documents.
5. Whether `parametric_formulation` is the intended future of `main`.
6. The production CAD's `template.schema.ts` field names, for schema alignment.
7. Real PlaneGCS latency on your largest expected GAD — **measure early**, it drives the client-vs-server solve decision.

---

## Closing statement

The durable answer, in one paragraph:

> **Let the draftsman work in geometry and dimensions. Let the author curate inferred design intent once. Keep formulas, dependency graphs, constraints, ports, and solver diagnostics behind the appropriate mode boundary. Use a real constraint solver and invariant checks to preserve engineering meaning during every edit.**

And the correction that makes it buildable:

> **Do not try to make AI understand CAD. Make deterministic geometry, topology, and constraints the authority, and use AI only where the ambiguity is genuinely semantic — naming and explanation.**

Draw once → infer relationships → the author approves intent → serialise a real constraint-based parametric template → users edit semantic parameters → the solver preserves the geometry.

That is feasible for a small team, requires no model training, supports interactive drafting today and scanned-GAD reconstruction later, and gives a concrete path from the existing 2D Canvas to a genuinely parametric CAD system — rather than another collection of hard-coded bridge templates.

---

*End of specification. UPCE-MASTER-1.0.*
