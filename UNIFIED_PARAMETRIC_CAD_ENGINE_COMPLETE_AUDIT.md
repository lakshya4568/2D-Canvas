# Unified Parametric CAD Engine — Complete Technical Audit & Architecture Knowledge Base
## The Single Authoritative Engineering Reference: Architecture, Mathematics, Integration, Agent, Verification and Debt

**Document ID:** UPCE-MASTER-AUDIT-2026-FINAL-R3
**Date:** September 22, 2026
**Status:** Single authoritative source of truth. Supersedes every earlier audit, status report, verification report and migration note listed in §0.3.
**Reading contract:** this file stands alone. A new engineer should be able to read only this and understand what exists, why, how it is resolved mathematically, and what is not finished.

---

## 0. Front Matter

### 0.1 Scope — the engine now lives in two repositories

The Unified Parametric CAD Engine (UPCE) was built in one repository and now runs in two. Any statement in this document that does not name a repository applies to the kernel itself, which is identical in both.

| | `2D Canvas` | `aagento-bridge` |
| :-- | :-- | :-- |
| Role | Where the kernel was built; its own React/Next.js drafting studio | Production host: Angular 20 CAD editor with the kernel underneath it |
| Kernel path | `lib/` (250 `.ts` files) | `src/cad-engine/` (250 `.ts` files, byte-identical apart from two narrowing fixes — §5.2) |
| UI | React 19 + Next.js 16, `features/` | Angular 20 standalone, zoneless, `src/app/features/cad/components/cad-editor/` |
| HEAD at audit | `f9394aa` on `feat/ir-bridge-cad-editor` | `feature/upce-cad-migration` |
| Drafting entity model | Engine `Shape` union (7 members) | Aagento `Entity` hierarchy (20+ classes) — §6.1 |

The important consequence, and the single biggest correction this revision makes to earlier audits: **UPCE is no longer a self-contained application.** In production it is a *computation layer underneath somebody else's CAD editor*. Sections 5, 6, 16, 17, 23 and 24 exist because of that, and they did not exist in the pre-integration audits.

### 0.2 Verified baseline (measured, this revision)

| Measurement | `2D Canvas` | `aagento-bridge` |
| :-- | :-- | :-- |
| Test files | 125 | — |
| Tests | **1,360 passing, 0 failing** across 125 files | **812 specs: 739 passing, 73 failing** (§32.3) |
| Kernel `.ts` files | 250 | 250 |
| Kernel files reachable from the app | n/a (it *is* the app) | **106 of 250** (§29) |
| Native interactive CAD tools | — | **64** (39 draw + 25 modify), plus 13 view/select/block |
| Tools exposed to the agent as validated actions | 60+ kernel tools | **53** registered `AiTool`s; **57** function declarations offered to the model; **38** of those map straight onto a native Aagento tool |
| PlaneGCS WebAssembly | installed and used | **installed and used** — merged from `feature/planegcs-wasm` (§11.6) |

The 73 Aagento failures are pre-existing and unrelated to the kernel — see §32.3, where they are diagnosed rather than merely counted.

### 0.3 Sources consolidated into this document

Specification: `docs/audit/UNIFIED_PARAMETRIC_CAD_ENGINE_MASTER_PLAN.md` (UPCE-MASTER-1.0, §1–§86), `docs/audit/UNIFIED_PARAM_2.0.md` (UPCE-ADDENDUM-2.0).
Research: `output/research/parametric-bridge-cad-template-architecture-research.cleaned.md`, `universal-geometric-resolver-protocol.md` (GEOM-RP/1), `parametric_geometry_engine.md`, `Parametric CAD Engine Architecture.md`, `parametric-template-authoring-architecture.md`, `report-source.md`.
Audits and status: `docs/audit/ARCHITECTURE_AUDIT.md`, `FINAL_ARCHITECTURE.md`, `UPCE_CAD_AGENT_FULL_ARCHITECTURE_DEEP_DIVE.md`, `UPCE_COMPATIBILITY_MATRIX.md`, `MASTER_FEATURE_MATRIX.md`, `IMPLEMENTATION_STATUS.md`, `TEST_REPORT.md`, `VERIFICATION_REPORT.md`, `DEPENDENCY_AUDIT.md`, `DEPENDENCY_GRAPH.md`, `CAD_UX_SPECIFICATION.md`, `DRAFTSMAN_UX_SPEC.md`.
Decision ledger: `DECISIONS.md` (DEC-001 … DEC-068). Narrative: `walkthrough.md`, `COMPREHENSIVE_WALKTHROUGH.md`.
Integration: `aagento-bridge/docs/UPCE_MIGRATION.md` (three passes).
Domain: `docs/bridge-formulas/` (17 codified IRS/RDSO/IRC documents).
Code: both repositories, inspected directly. Where a document and the code disagreed, **the code won** and the document's claim is recorded in §28 or §31.

### 0.4 How this document is organised

One concept, one explanation, cross-referenced everywhere else. The dependency graph is explained once (§10); Author Mode, Template Mode, the agent and regeneration all point at §10 rather than re-explaining it. Where a section says "see §N", that is the authoritative text.

Four words are used precisely throughout, and the difference between them is one of the most important findings of the integration work (§29):

| Word | Means |
| :-- | :-- |
| **Reachable** | Implemented, imported by the running application, exercised |
| **Unwired** | Implemented and compiling, but with zero importers from the application — indistinguishable from missing to a user, entirely different to a maintainer |
| **Excluded** | Present in the tree and deliberately not used, with a stated reason |
| **Missing** | Not implemented anywhere |

---

## 1. Executive Summary

UPCE is a **deterministic, non-linear variational 2D constraint-solving and parametric authoring kernel**, paired in production with a professional Angular CAD editor and an autonomous drafting agent.

It exists because 2D engineering drafting has only ever offered two bad options. **Procedural hardcoding** — `width = span + 2 * wall` written into a renderer — works for one nominal configuration and has to be rewritten for every skew, haunch variation or extra cell; validated engineering logic ends up trapped in code a draftsman cannot touch. **Blank-sheet redrawing** repeats the work and the mistakes on every contract. And the obvious middle road, *resizing the picture*, is mathematically catastrophic: uniform similarity scaling ($k = L_{\text{target}}/L_{\text{original}}$) inflates wall thicknesses, slab depths, haunch legs and cover along with the span. A bridge that is 50% longer does not have 50% thicker walls.

UPCE's answer: a draftsman draws ordinary geometry once. The kernel builds the planar arrangement of that geometry, discovers spatial invariants with rotation-invariant vector predicates ($P1$–$P10$, §12.1), gates each candidate through an SVD row-space projection so it cannot over-constrain the model (§12.3), asks the plain-English design question behind each remaining freedom (§9.4), and stores the result as a parametric model. Later dimensional changes are solved variationally as minimum-norm coordinate displacements (§11), so driven dimensions move and undriven ones do not.

Three things distinguish the system as it stands from the system as earlier audits described it:

**It is an integration, not an application.** The kernel runs underneath Aagento's Angular CAD editor through a five-file adapter (§5). The drawing is Aagento's `DxfFile.entities`; the parametric model is upstream of it the way a formula is upstream of a spreadsheet cell (§6). Generated geometry is ordinary entities — selectable, snappable, layerable, plottable, exportable — with one deliberate exception (grips, §16.4).

**Implemented is not the same as reachable.** After the first integration pass the entire solver package, the DOF analyser, the constraint graph, the dependency graph and the inference detectors had *zero importers*. Nothing was missing; nothing was reachable. That distinction now runs through the whole document (§29).

**Autonomy is a budget problem, not a capability problem.** The agent could always draw. What stopped long runs finishing was a prompt describing tools that did not exist, a zoom that discarded itself, and a context that grew until the run died — diagnosed and fixed in §21. Both verified live runs now reach `finish`, including a full railway GAD (§26.3).

---

## 2. The System in One Page

```text
                    A PERSON, OR THE AGENT, EXPRESSES INTENT
                                     │
   ┌─────────────────────────────────┼─────────────────────────────────┐
   │                                 │                                 │
draws geometry                  edits a value                   states a plan
with native tools           (Author / Template mode)          (agent, §20)
   │                                 │                                 │
   └─────────────────────────────────┼─────────────────────────────────┘
                                     ▼
                 ┌───────────────────────────────────────┐
                 │  PARAMETERS  (§8)  named scalars      │
                 │  EXPRESSIONS (§8.3) AST, not strings  │
                 └──────────────────┬────────────────────┘
                                    ▼
                 ┌───────────────────────────────────────┐
                 │  DEPENDENCY GRAPH (§10)               │
                 │  Kahn order · Tarjan cycle refusal    │
                 └──────────────────┬────────────────────┘
                                    ▼
                 ┌───────────────────────────────────────┐
                 │  CONSTRAINTS (§9) → RESIDUALS (§9.3)  │
                 └──────────────────┬────────────────────┘
                                    ▼
                 ┌───────────────────────────────────────┐
                 │  SOLVER (§11)                         │
                 │  DOF (DM) · SVD · Dogleg · LM · GCS   │
                 └──────────────────┬────────────────────┘
                                    ▼
                 ┌───────────────────────────────────────┐
                 │  GEOMETRIC RESOLUTION (§12)           │
                 │  DCEL planar map · predicates         │
                 └──────────────────┬────────────────────┘
                                    ▼
                 ┌───────────────────────────────────────┐
                 │  INVARIANTS & VALIDATION (§16.3)      │
                 │  pass → commit   fail → REFUSE WHOLE  │
                 └──────────────────┬────────────────────┘
                                    ▼
                 ┌───────────────────────────────────────┐
                 │  ENTITY RECONCILIATION (§16.2)        │
                 │  upceKey · identity survives          │
                 └──────────────────┬────────────────────┘
                                    ▼
             AAGENTO CAD ENTITIES  →  canvas · dimensions · layers
                                      DXF · PDF · SVG · .mycad
```

Read that column once and the rest of the document is detail. The two rules that make it trustworthy:

1. **Refusal is atomic.** Anything that fails at the validation gate rolls back whole; nothing half-regenerates (§16.3).
2. **The language model has zero geometric authority.** It chooses *what* to build and *which tool* to reach for. Every coordinate is produced by the deterministic kernel (§20.2).

---

## 3. What the System Is — and the Four Kinds of Knowledge

UPCE is not a procedural bridge macro, not a formula spreadsheet bolted to a canvas, and not a generative geometry model. It rests on one distinction:

> **Geometry, topology, design relationships and engineering semantics are four different kinds of knowledge, and they must never share a data slot.**

| Kind | Example | Where it lives | Direction |
| :-- | :-- | :-- | :-- |
| Geometry | a line from (0,0) to (300,0) | coordinate buffer | measured |
| Topology | two edges share one vertex record | planar map (DCEL, §12.2) | structural |
| Relationship | those edges are parallel, 300 mm apart | constraint graph (§9) | non-directional |
| Semantics | that 300 mm is `WallThickness` | parameter / component model (§8) | human-confirmed |

Collapsing any two of these is the root cause of every failure mode the system was built to avoid. Putting a relationship in the coordinate buffer gives you a picture that cannot be re-solved. Putting geometry in the semantic layer gives you a hardcoded renderer. Putting a relationship in the directed dependency graph creates an artificial cycle the moment the geometry closes a loop (§7.1).

### 3.1 The non-negotiable invariants

Six rules hold everywhere. A change that breaks one is rejected regardless of what it enables.

1. **Zero conformal scaling on solve paths** (UPCE-MASTER §8, §29.4, §81; DEC-058, DEC-062). No proportional factor may be applied to engineering geometry. Solves compute minimum-norm displacements $\Delta X^* = -J^+F(X)$ from a warm start (§11.2). Verified: a span change 3000 → 6000 mm leaves wall thickness exact to $10^{-6}$ mm.
2. **Planar rigid-body anchor rule** (UPCE-MASTER §18; DEC-063). Every planar mechanism must fix 3 DOF — two translation and one rotation. Fixing a point removes translation only; rotation needs its own anchor or the solver drifts in the null space.
3. **Persona boundary isolation** (UPCE-MASTER §3, §59, §64; DEC-065). Draftsman mode shows no formulas at all. Author mode is the *only* surface where expressions are written. Run/Template mode shows results and the names they follow, never the expression. See §23, §24.
4. **Single tolerance-policy authority** (UPCE-MASTER §17, §84; DEC-059). Every tolerance is injected from `TolerancePolicy` in model-space millimetres. No local constants, no pixel measurements. §15 explains why one policy value is nevertheless not sufficient for every operation.
5. **Zero geometric authority for language models** (UPCE-MASTER §2.1, §53–§57). See §20.2.
6. **Refuse whole, never half-apply** (§16.3). An edit that breaks an invariant is rejected in full with a reason, and the previous state stands.

---

## 4. Complete Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TIER 1  PRESENTATION                                                         │
│   aagento-bridge: Angular 20 zoneless CAD editor                             │
│     canvas · 64 native tools · command line · dynamic input · grips          │
│     panels: Properties · Layers · Blocks · Views · Library · L-section       │
│     drawers: AI Agent (§20) · Author (§23) · Template (§24)                  │
│   2D Canvas: React 19 studio — DraftPanel / AuthorPanel / RunPanel           │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ user intent, tool calls
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ TIER 2  SESSION & ORCHESTRATION                                              │
│   DocumentService · CommandStackService · ViewModelService   (Aagento)        │
│   UpceDocumentService (§5.3) · ParametricWorkbenchService (§7.3)             │
│   ActionRouterService → validation pipeline → one CompoundCmd (§22.2)        │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ CadAction / parameter edit
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ TIER 3  AUTHORING KERNEL FACADE                                              │
│   lib/upce/document.ts  regenerate()  — the single entry point (§16.1)        │
│   lib/state/cadActions.ts applyCadAction() — the reducer both sides run       │
│   lib/components/evaluate.ts — constructive component evaluation (§7.2)       │
└──────┬─────────────────────────────┬──────────────────────────┬──────────────┘
       │                             │                          │
┌──────▼───────────────┐ ┌───────────▼──────────────┐ ┌─────────▼──────────────┐
│ 4A TOPOLOGY &        │ │ 4B INFERENCE &           │ │ 4C NUMERICAL SOLVERS   │
│    PROCEDURAL        │ │    COMPLETION            │ │                        │
│ upce/repeat.ts       │ │ upce/detect.ts (GEOM-RP) │ │ upce/solve.ts          │
│ upce/lower.ts        │ │ upce/completion.ts       │ │ solver/dogleg.ts       │
│ upce/fusion.ts       │ │ upce/dof.ts (736 lines)  │ │ solver/levenberg…      │
│ geometry/topology/   │ │ inference/* (§29.2)      │ │ solver/planegcsClient  │
│   dcel.ts            │ │ upce/admissibility.ts    │ │ upce/residuals.ts      │
└──────┬───────────────┘ └───────────┬──────────────┘ └─────────┬──────────────┘
       └─────────────────────────────┼──────────────────────────┘
                                     │ solved state vector X*
┌────────────────────────────────────▼─────────────────────────────────────────┐
│ TIER 5  VALIDATION GATES                                                     │
│   invariants · chirality · collapsed loops · openings leaving the solid       │
│   analyseDof() (Dulmage–Mendelsohn, §11.1) · bridge audit, 9 gates (§19.3)   │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │ verified state
┌────────────────────────────────────▼─────────────────────────────────────────┐
│ TIER 6  RECONCILIATION, PERSISTENCE, INTERCHANGE                             │
│   upce-entity-mapper.ts reconcile() (§16.2) → Aagento entities                │
│   .mycad (lib/io/cadFile.ts) · DXF in/out · PDF sheets · SVG                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Kernel subsystem map

| Subsystem | Path | Status in Aagento | Responsibility |
| :-- | :-- | :-- | :-- |
| Authoring kernel | `lib/upce/` | Reachable (§7.3) | `regenerate()`, `solveSketch()`, `detectCandidates()`, `suggestCompletion()`, `analyseDof()`, `fuseSketch()` |
| Variational solvers | `lib/solver/` | Reachable via `upce/solve.ts`; `planegcsClient` excluded (§11.6) | Dogleg, Levenberg–Marquardt, SVD, pseudo-inverse, 18 analytical Jacobians |
| Geometry & topology | `lib/geometry/` | Reachable | DCEL planar map, predicates $P1$–$P10$, tolerance policy, LCS, moments, **queries (§13)** |
| Inference | `lib/inference/` | Mostly unwired (§29.2) | Candidate detection, clustering, semantic vocabulary, formula candidates |
| Parametric model | `lib/parametric/` | Partly reachable | Dual-graph orchestration, dependency graph, variational kernel, DM decomposition |
| Component assembly | `lib/parametric/component/` | Unwired (§29.2) | SE(2) port mating, repeat expansion, shared-edge collapse |
| Constructive components | `lib/components/` | Reachable | The component definition format, evaluation, `fromDrawing.ts` (Make parametric) |
| CAD document | `lib/cad/` | Reachable | Layers, annotations, one draw list, hatch, sheets, annotation layout |
| Bridge domain | `lib/bridge/` | Reachable | Glossary, recognition, drawn facts, sources, 9-gate GAD audit, knowledge corpus |
| Agent | `lib/agent/` | Excluded from the browser (§20.3); prompt and skills imported | The 2D Canvas drafting loop and tools; server-side only |
| AI transport | `lib/ai/` | Type-only import (§20.4) | Vertex transport, session cache, cost meter — never in the bundle |
| File I/O | `lib/io/` | Excluded (§29.3) | Aagento has its own, older and richer |

---

## 5. Aagento ↔ UPCE Integration

This is the newest and least-documented part of the system, and the part a new engineer most needs to understand first.

### 5.1 It is an integration, not a rewrite

Three measured facts made that possible.

**The kernel is already framework-free.** Across the whole of `lib/`, exactly one file imports React (`state/drawingContext.tsx`) and, outside the AI layer, nothing imports a Node built-in. Every internal import uses one prefix, `@/lib/`. A single `tsconfig` path mapping —

```json
"paths": { "@/lib/*": ["./src/cad-engine/lib/*"] }
```

— makes all of them compile inside Angular **without rewriting a single import**.

**The coordinate frames already agree.** A component evaluates in millimetres with Y up. Aagento's world frame is millimetres with Y up; `ViewModelService.w2s` negates Y only at paint time. Geometry therefore crosses the boundary untransformed. The one place a frame flips is the GAD level callout (§5.4).

**The adapter surface is seven kinds.** `evaluateComponent()` returns loops, circles, dimensions, levels, hatches, texts and leaders. That is the entire contract between kernel and host.

### 5.2 The only edits inside migrated code

Two one-word narrowing fixes that Angular's `strict: false` requires (`!x.parsed` → `x.parsed === false`, `if (r.ok)` → `if (r.ok === true)`). Everything else is byte-identical to upstream, so the kernel can be re-synced with a straight copy. That property is worth protecting; it is why `noPropertyAccessFromIndexSignature` was turned off app-wide rather than editing 204 files (§34, item 4).

A consequence worth stating: because `strictNullChecks` is off in the Angular program, **discriminated-union narrowing does not work there**. Result types in Aagento-side code use one interface with `ok: boolean` and optional `value`/`reason` rather than a `{ok:true}|{ok:false}` union, which silently fails to narrow. New code must follow that convention.

### 5.3 The adapter, in five files

| File | Responsibility |
| :-- | :-- |
| `upce-entity-mapper.ts` | `ComponentEvaluation` → native Aagento entities; plus `reconcile()`, pure (§16.2) |
| `upce-entity-lift.ts` | The inverse: Aagento entities → engine shapes and annotations, keeping `sourceOf` so the return leg is a lookup, not a second registry |
| `upce-document.service.ts` | Owns `CadDocState`; every edit goes through `applyCadAction`; pushes one `ICommand` per edit onto Aagento's command stack |
| `upce-drafter.service.ts` | SSE client for the headless sidecar (§30.3) |
| `upce-file.service.ts` | Native `.mycad.json` — the model saved, and refused whole if damaged |

### 5.4 The one place a frame flips

The GAD level callout is the only annotation Aagento has no entity for. Rather than draw it a second way, the mapper borrows the kernel's own draw list (`lib/cad/annotationPrims.ts`) — the same list that feeds its canvas, SVG, DXF and PDF, and that the annotation layout pass judges. That list is in canvas coordinates (Y down), so it is negated on the way out. This is deliberate and documented rather than incidental: **one draw list** is a kernel invariant, and duplicating annotation geometry in a renderer is how two outputs start disagreeing.

### 5.5 What stayed Aagento's, and why

| Kept | Reason |
| :-- | :-- |
| `Entity` model — 20+ classes, 7 dimension types, hatch edge paths, MLeader, spline, viewport, table | Richer for drafting than the kernel's 7-member `Shape` union. Replacing it would be a severe regression (§6.1) |
| 64 native tools, command line, dynamic input | The human interaction model |
| `SnappingService` (13 snaps), `GripManagerService`, `SpatialIndexService` | Mature; the kernel has no equivalent |
| `CommandStackService` | Parametric edits are pushed onto it, so Ctrl+Z is uniform across hand edits and parametric edits |
| `DxfExportService`, `CanvasMultiplexer` | WYSIWYG DXF parity |
| `template-engine` + Template Mode | An existing authoring workflow with real users (§24) |
| 12 bridge rule engines and scene renderers | Outside the CAD editor |


### 5.6 One scrolling contract for the panels

The kernel's surfaces — Author Mode, the geometry workbench, the agent timeline
— are Angular components living in Aagento's drawer. Getting them to scroll was
not a styling detail; it was a three-layer structural fault worth recording,
because each layer is invisible in a stylesheet review and two of them are
general traps.

1. **A flex item's default minimum is its CONTENT.** `flex: 1` alone does not
   make a box shrink to its parent — it makes the box grow to its content and
   push the parent open. With `overflow: hidden` above it, the surplus is simply
   cut off, and no scrollbar ever appears, because nothing overflowed a box that
   was allowed to be too small. Every link in the chain needs `min-height: 0`.
2. **An Angular host element is an INLINE box.** `<app-author-panel>` has no
   height of its own, so a `height: 100%` inside it resolves against nothing.
   Each panel needs its own `:host { display: flex; … }`.
3. **The drawer body was a BLOCK container.** `flex: 1 1 auto` on a panel inside
   a block parent means nothing at all, so even a correctly written panel could
   not be constrained. This one was found by measurement, not by reading: a test
   mounting the real components in a 280 px drawer still measured a 4,105 px
   panel after the first two causes were fixed.

**The contract, stated once and followed everywhere:** the drawer gives its
panel a height; the **panel** scrolls; the drawer does not. Two scrollers on the
same axis is the trap where the outer one swallows the wheel before the inner
one sees it. A body holding plain content rather than a panel component says
`.scrolls` and takes the job itself. A component that sits *inside* another
panel's scroller — the geometry workbench inside Author Mode — is content, not a
panel: `flex: 0 0 auto`, no overflow of its own, free to be as tall as it needs.

It is guarded by measurement rather than by eye: `panel-scrolling.spec.ts`
mounts the real components in a drawer of known height with more content than
fits, and asserts the scroller is bounded by the drawer, reports something to
scroll, actually scrolls, and that there is exactly **one** scroller on the
vertical axis.


---

## 6. The CAD Document Model — One Drawing, Not Two

This is the architectural concept that most often gets misunderstood, so it is stated here once and referenced everywhere else.

### 6.1 There is exactly one drawing

`DxfFile.entities` **is** the drawing. A parametric component does not keep a private copy of its geometry.

```text
        PARAMETRIC MODEL                 (values, formulas, constraints)
                 │
                 │  evaluate + reconcile     ← §16
                 ▼
        GENERATED AAGENTO ENTITIES        (PolylineEntity, CircleEntity, …)
                 │
                 ▼
        DxfFile.entities                  ← the drawing, and the only drawing
```

The parametric model is **upstream** of those entities the way a formula is upstream of a spreadsheet cell. You can look at the cell, copy it, colour it, print it. You change it by changing the formula.

### 6.2 Therefore generated geometry is ordinary geometry

Component-generated entities are `PolylineEntity`, `CircleEntity`, `DimensionEntity`, `TextEntity`, `LeaderEntity` and `HatchEntity` — the same classes a person's hand draws. They are:

selected · snapped to · put on layers · coloured · given lineweights · measured · dimensioned · plotted · exported to DXF · saved in `.mycad` · undone and redone

with **one deliberate exception**: grips are refused (§16.4).

Verified directly on agent-produced geometry through the editor's own services: selected the agent's outer outline, moved it 1000 mm (−1850 → −850), Ctrl+Z restored it to −1850, deleted it (8 → 7 entities), Ctrl+Z restored it (7 → 8).

### 6.3 Why the entity model was not replaced

The kernel's `Shape` union has seven members. Aagento's `Entity` hierarchy has more than twenty classes including seven dimension types, hatch edge paths, multi-leaders, splines, viewports and tables. The kernel is better at *reasoning about* geometry; Aagento is better at *drafting* it. Replacing the richer model with the poorer one to satisfy a layering diagram would have been a severe functional regression. The adapter (§5.3) is the price of keeping both, and it is five files.

### 6.4 The document layer

`DrawingState.cad` (kernel) / `CadDocState` (through `UpceDocumentService`) holds layers, annotations, component instances, the bridge project record, sheets and settings. Every history snapshot stores it with the shapes, so undo restores geometry, annotations and design data together.

Two rules inside it:

- **Layers are found by category, never by literal name** (`layerIdFor(layers, "hatch")`), so a project can load a different layer standard without breaking the tools.
- **Annotations are associative.** A dimension measures its resolved anchors; a textual override is flagged, never silently shown. A level marker reads its RL from the point's height. A hatch re-traces its boundary shapes. This is what makes §17 possible.

---

## 7. Parametric Architecture — Two Ways to Define Geometry

There are two legitimate ways to make geometry parametric in this system, and choosing the wrong one for the job is a recurring source of confusion.

### 7.1 The dual-model principle

Two mathematical systems run side by side because neither can do the other's job.

```text
Parameter edit (person or agent)
        │
        ▼
SYSTEM A — DIRECTED SCALAR DAG            evaluated topologically (Kahn)
   InnerWidth = OuterWidth − 2·WallThickness
   TotalSpan  = N·ClearSpan + (N−1)·MidWall + 2·ExtWall
        │  scalar targets bound into constraint nodes
        ▼
SYSTEM B — UNDIRECTED CONSTRAINT GRAPH    solved simultaneously (variational)
   parallel · perpendicular · coincident · directed offset
   haunch equal-leg · centroid distance
        │
        ▼
DCEL re-sync → invariant check → derived metrics → render
```

**Why the separation is mandatory.** Put geometric constraints into a directed DAG and you create an artificial cycle the instant the geometry closes a loop — a rectangle's four corners each depend on their neighbours. Put scalar arithmetic into a non-linear solver and you burn Newton iterations on relationships that have instantaneous closed-form answers.

### 7.2 Route 1 — constructive components (`lib/components/`)

Every coordinate in a `ComponentDefinition` is an **expression of named values** in the component's local frame. Geometry is therefore *fully determined by construction*: a well-constrained system already in block-triangular form, solved in closed form. **There is no DOF to count, and DOF gates must not be added to components.**

What replaces the DOF gate is explicit `InvariantDef`s plus generic checks the engine runs on every regeneration: collapsed loops, self-crossing outlines, loops turned inside out relative to their defaults (chirality), openings leaving the solid. A failing edit is refused whole (§16.3).

Components are **data, never renderer code**: one definition format for every part and assembly, no bridge vocabulary in `evaluate.ts`. Counts are topology (repeats with index-stable ids). Composition is by placement or port attachment (§18.1). Out-of-range values are warnings, never clamped.

This route scales to a whole bridge. It is what the agent's construction path and Make parametric both produce.

### 7.3 Route 2 — free sketches (`lib/upce/`, `ParametricWorkbenchService`)

A draftsman draws ordinary lines and then constrains them. DOF bookkeeping is exactly right here and is kept.

`ParametricWorkbenchService` (Aagento) holds **one session over a selection** and walks the kernel's own chain:

```text
entities → liftEntities → shapes → startAuthoring → AuthoringSketch
   ↓ detectCandidates    what the geometry already says about itself
   ↓ analyseDof          what is still free, and why
   ↓ suggestCompletion   the design question behind each freedom
   ↓ regenerate          the solve
back onto the SAME entities, by id, through the command stack
```

**A session is a proposal until it is solved.** Accepting a detected relationship or asserting a rule changes the sketch, not the drawing. The drawing moves only when `solve()` succeeds, and then it moves through `ModifyGeometryCmd` like any other edit — one Ctrl+Z puts it back, and selection, layer and colour survive.

A refused solve rolls the *proposal* back as well. An early version left the drawing correct and the model holding a formula that referred to nothing; that asymmetry is a bug class worth naming.

It will not silently drop geometry it cannot lift: arcs and splines are reported in `unsupported` and named to the user, because a chord-approximated arc parametrized as chords is a lie about the drawing (§33, item 2).

### 7.4 Make parametric — the manual bridge between the routes

`lib/components/fromDrawing.ts` turns free geometry plus its dimensions, level markers and callouts into one `ComponentDefinition` stored on the drawing, and an instance replacing the free entities.

The method is generic — levels and offsets, no bridge vocabulary in the algorithm:

- every distinct X/Y (within the weld tolerance) is a datum; site levels are inputs;
- dimensions are graph edges taken **chain-first (Kruskal)** — an edge reaching a new datum *drives* it; one closing a loop is a reported **result**;
- widths symmetric about the centre line are split half each side; mirror-image dimensions share a value;
- a leader stating a thickness and pointing into a band that thick becomes a value, shared by the other corners of the same shape;
- other datums follow the nearest **structural** datum (never a water line) at a fixed offset;
- numbers in notes are linked to the values they state.

**The plan is evaluated before anything changes: every vertex must come back where it was drawn, or the conversion is refused.** `CAD_EXPLODE_COMPONENT` reverses it.

### 7.5 Which route to use

| Situation | Route |
| :-- | :-- |
| One small profile a person wants held by rules | Sketch (§7.3) — DOF is meaningful |
| A structure with hundreds or thousands of coordinates | Components (§7.2) — DOF is not meaningful |
| Existing free geometry that should become editable | Make parametric (§7.4) |
| The agent constructing from a brief | Components, written primitive by primitive (§25) |

---

## 8. Parameter & Expression System

### 8.1 What a parameter is

```ts
export interface Parameter {
  id: string;
  name: string;                  // civil nomenclature: "ClearSpan", never "R1_Width"
  role: "DRIVING" | "DERIVED" | "FIXED" | "MEASURED";
  type: "LENGTH" | "ANGLE" | "COUNT" | "RATIO" | "BOOLEAN";
  unit: "mm" | "m" | "deg" | "rad" | "count" | "ratio";
  value: number;
  min?: number; max?: number; step?: number;
  expr?: string;                 // present iff role === "DERIVED"
  semanticTag?: string;          // CLEAR_SPAN, WALL_THICKNESS, HAUNCH_LEG
  sourceGeometry?: string[];     // the primitives it was measured from
  confidence?: number;           // inference score, 0…1
  provenance: ProvenanceRecord;  // who or what created it, and when
  codeRef?: string;              // "IRC:112 Table 14.2"
  uiGroup?: string;
  boundConstraints: string[];    // the rules it drives — see §8.5
  published: boolean;
}
```

### 8.2 Where a value comes from — the precedence chain

For a component parameter, in order (`lib/components/evaluate.ts`):

1. a **relationship** on the instance (`instance.relations`, written in Author Mode or by the agent);
2. a **typed** value;
3. its **auto** expression (`defaultExpr` — e.g. rail level = formation + 0.762 — which follows until someone types over it);
4. its default.

`ComponentEvaluation.sources` records which one won, and that is what Run/Template mode displays (§24.2).

A value may also be **solved** rather than evaluated (`ComponentFormula.solve = {equation, min, max}`): the relationship is stored and the engine re-solves it by bisection on every regeneration. This is the last resort, for a relationship that cannot be rearranged to put the unknown on its own. A relationship with no answer in its range is an error, never a silently wrong number.

### 8.3 Expressions are ASTs, not strings

Parsed by a deterministic recursive-descent lexer and parser. Dependency extraction inspects AST identifier nodes **exclusively** — which is what eliminated the substring-collision bug where `WallThickness` inside `HalfWallThickness` was read as a reference to it.

```ts
export function dependenciesOf(expr: string): string[] {
  const ast = parseExpressionToAst(expr);
  const identifiers = new Set<string>();
  walkAst(ast, (n) => { if (n.type === "Identifier") identifiers.add(n.name); });
  return [...identifiers];
}
```

Trigonometry is in **degrees** (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sqrt`, `hypot`, `pow`, `abs`, `min`, `max`, `sign`, `if`/`gt`/`lt`). A gradient written as a ratio stays a ratio — `1 / BatterRun`, never its decimal.

### 8.4 Editing a derived value — the Inversion Assistant

`lib/upce/inverse.ts`. When a user edits a `DERIVED` parameter the system neither locks the field nor silently overwrites the formula. It analyses the dependency chain and offers inversion options. For `TotalWidth = ClearSpan + 2·WallThickness`, edited 4000 → 5000:

- **A** — make `TotalWidth` driving; `ClearSpan` becomes `TotalWidth − 2·WallThickness`;
- **B** — hold `ClearSpan`; `WallThickness = (TotalWidth − ClearSpan)/2`;
- **C** — reject, preserving the author's driving hierarchy.

Template Mode takes option C by default and says so, naming the inputs to change instead (§24.3).

### 8.5 Automatic naming — meaningful names, not `parameter_1`

A drawing whose values are called `parameter_1` is no more editable than one with no values at all. `ParametricWorkbenchService.suggestNames()` proposes a name for every measured rule that has none, from two sources in order:

1. **Intent already stated.** If a number in the caller's plan (the agent's `plan`, or a template's fields) matches the measurement to within 0.1 mm, the rule takes that name. *This is how a domain word such as `ClearSpan` reaches the model without any domain vocabulary living in the engine.*
2. **What the geometry is.** Failing that, the name is read off the rule and the shapes it holds:

| Rule | Proposed name |
| :-- | :-- |
| `distance_x` across one outline | `<Shape>Width` |
| `distance_y` across one outline | `<Shape>Height` |
| `point_line_distance` / `normal_offset` between parallel faces | `<Shape>Thickness` |
| `angle` | `<Shape>Angle` |
| `relative_x` / `relative_y` | `<Shape>OffsetX` / `OffsetY` |
| `centroid_distance` | `<A>To<B>CentreDistance` |
| anything else | `<Shape>Length` |

No two rules are ever handed the same name. The agent's `name_value` tool called with no arguments lists the proposals with the evidence for each; called with `accept_all` it takes them all in one turn (§21.5 explains why the batch form mattered).

Where richer domain naming is wanted, `inference/semanticVocabulary.ts` holds a curated civil vocabulary (`WallThickness`, `ClearSpan`, `ClearHeight`, `HaunchLeg`, `TopSlabThickness`, `BottomSlabThickness`, `ParapetHeight`, `PierWidth`, `PierSpacing`, `CornerChamfer`, …) mapped from DCEL face categories and predicate evidence. It is **unwired by choice** (§29.2, §35): it is bridge-specific, and the governing requirement is that the parametrization system stay geometry-agnostic. Geometry-derived naming plus stated intent achieves meaningful names without a domain schema.

---

## 9. Constraint System

### 9.1 What a constraint is

A constraint stores **no coordinates**. It stores topological references and a target.

```ts
export interface SketchConstraint {
  id: string;
  kind: ConstraintKind;          // 21 kinds — §9.2
  points: string[];              // referenced point ids
  segments: string[];            // referenced segment ids
  value?: number;                // literal target (mm or rad); ignored if paramRef set
  valueY?: number;               // second literal, used only by `fix`
  sign?: 1 | -1;                 // handedness of a directed measurement — §9.3
  paramRef?: string;             // the parameter that drives it
  strength: "fact" | "fixed" | "driving" | "hard" | "soft" | "reference" | "temporary";
  driving: boolean;              // true if it removes DOF
  predicate?: "P1" … "P10";
  provenance?: Provenance;
  state: "active" | "suppressed" | "conflicting" | "redundant";
}
```

### 9.2 The vocabulary

Twenty-one kinds: `fix`, `coincident`, `horizontal`, `vertical`, `parallel`, `perpendicular`, `equal_length`, `point_on_line`, `midpoint`, `symmetric`, `distance`, `distance_x`, `distance_y`, `point_line_distance`, `angle`, `concentric`, `relative_x`, `relative_y`, `normal_offset`, `centroid_distance`, `tangent`.

`strength: "fact"` marks a relationship that is part of *what the shape is* rather than a choice — removing it is refused, because a rectangle that stops being rectangular was not edited, it was destroyed.

### 9.3 Compilation to residuals

Every active constraint compiles to scalar residuals $r_i(X)=0$ with **exact analytical derivatives** (`lib/upce/residuals.ts`). Finite differences are not used on the solve path.

| Constraint | Residual $r(X)=0$ | Note |
| :-- | :-- | :-- |
| `coincident` ($P8$) | $x_j-x_i=0$, $y_j-y_i=0$ | removes 2 DOF per pair |
| `horizontal` | $y_j-y_i=0$ | |
| `vertical` | $x_j-x_i=0$ | |
| `distance` | $(x_j-x_i)^2+(y_j-y_i)^2-D^2=0$ | squared form avoids the $\sqrt{}$ singularity at $P_i=P_j$ |
| `parallel` ($P1$) | $(x_2-x_1)(y_4-y_3)-(y_2-y_1)(x_4-x_3)=0$ | 2D cross product vanishes |
| `perpendicular` ($P2$) | $(x_2-x_1)(x_4-x_3)+(y_2-y_1)(y_4-y_3)=0$ | 2D dot product vanishes |
| `point_line_distance` ($P3$) | $\dfrac{-\Delta y(x_p-x_a)+\Delta x(y_p-y_a)}{\sqrt{\Delta x^2+\Delta y^2}}-T=0$ | **signed** normal offset — preserves wall thickness across rotated geometry |
| `haunch_equal_leg` ($P4$) | $(x_w-x_c)^2-(y_s-y_c)^2=0$ | quadratic form maintains $C^1$ continuity |
| `relative_x` | $\frac{x_3+x_4}{2}-\frac{x_1+x_2}{2}-D_x=0$ | directed midpoint tracking |
| `centroid_distance` ($P10$) | $(C_x^A-C_x^B)^2+(C_y^A-C_y^B)^2-D^2=0$ | exact shoelace centroid partials — an **active driving** constraint, not a report |

The `sign` field matters more than it looks. `point_line_distance` measures a *signed* normal offset, so "300 mm thick" means one thing on the left face of a loop and its mirror image on the right. Keeping the handedness on the constraint lets a **single positive parameter drive both faces** — which is exactly what "one wall thickness, two walls" requires.

A historical note worth keeping (DEC-064): emitting distance-only for an offset allowed rotational drift, and emitting `parallel` alongside it caused divergence. The signed normal formulation resolved both.

### 9.4 Detection, gating and completion

**Detection** (`upce/detect.ts`) proposes candidates from the geometry using the $P1$–$P10$ predicates (§12.1), each with evidence and confidence. **Nothing is applied by detection.** A candidate is a proposal until an author or an explicit completion action admits it — this is a first-order safety principle, not a UI nicety.

**Gating** is the SVD row-space admissibility test (§12.3): independent, redundant, or conflicting.

**Completion** (`upce/completion.ts`, 1,810 lines) turns each remaining freedom into a plain-English design question with answer options, and reports quick fixes with the DOF each would remove. It prioritises anchor suggestions, because an unanchored sketch drifts in the solver null space (§3.1, rule 2).

---

## 10. Dependency Graph

One explanation; everything else references it.

### 10.1 What it is

A directed graph over **named values**. An edge $A \to B$ means "$B$'s expression reads $A$". It is built from AST identifiers (§8.3), never from string matching.

### 10.2 What it answers

| Question | Mechanism |
| :-- | :-- |
| In what order must values be evaluated? | Kahn topological sort |
| Is there a circular definition? | Tarjan strongly-connected components — any SCC with more than one vertex is a cycle |
| If I change this, what has to be recomputed, and in what order? | downstream traversal (`getDownstreamOrder`) — this is the **impact analysis** Author Mode shows |
| What does this value follow? | the parsed `dependencies` on the parameter |

A detected cycle **aborts the mutation atomically** and reports the exact chain, e.g. `ClearSpan → TotalWidth → InnerWidth → ClearSpan`. It is never partially applied.

One implementation detail that has bitten a test: `setDependencies` deliberately **skips trivial self-loops** ($A \to A$), so a self-reference is not reported as a cycle. A genuine two-node cycle ($A \to B \to A$) is.

### 10.3 Where it is used

Regeneration order (§16.1) · Author Mode's *affects* column (§23.2) · Template Mode's `dependsOn` (§24.2) · the agent's `describe_parameters` · refusing a formula before it is stored (§23.3).

---

## 11. Solver Architecture

The pieces below are not alternatives; each has a distinct job in one pipeline.

```text
constraint set + current coordinates X₀
        │
        ▼
 (a) STRUCTURAL ANALYSIS — is this solvable, and where?
     bipartite graph → Hopcroft–Karp matching → Dulmage–Mendelsohn blocks
     → Tarjan SCC inside the square block → block-triangular order
        │  under-constrained · well-constrained · over-constrained, PER BLOCK
        ▼
 (b) ADMISSIBILITY — may this new constraint join at all?
     SVD row-space projection of its gradient
        │
        ▼
 (c) NUMERICAL SOLVE — move the coordinates
     Dogleg (trust region) or Levenberg–Marquardt, exact analytical Jacobians,
     minimum-norm step ΔX* = −J⁺F via SVD pseudo-inverse, warm start from X₀
        │
        ▼
 (d) PATH CONTINUATION — for a large change
     homotopy sub-stepping, ⌈ΔP/300 mm⌉ steps when ΔP > 500 mm
        │
        ▼
 (e) VERIFICATION — did it stay a real shape?  (§16.3)
```

### 11.1 (a) Structural analysis — DOF that means something

`lib/upce/dof.ts` (736 lines) and `lib/parametric/graph/dulmageMendelsohn.ts`.

The bipartite incidence graph $B=(V,C,E)$ pairs $2n$ coordinate variables with $m$ residual rows.

1. **Hopcroft–Karp** finds a maximum-cardinality matching in $O(|E|\sqrt{|V|})$.
2. **Alternating-path traversal** partitions $B$ into the three canonical blocks:
   - $G_{\text{under}}$ — reachable from unmatched *variables*; $|V|>|C|$; identifies unconstrained geometry;
   - $G_{\text{square}}$ — perfectly matched; decomposed by Tarjan SCC into block-triangular form and solved sequentially;
   - $G_{\text{over}}$ — reachable from unmatched *constraints*; $|C|>|V|$; identifies over-constraint or conflict.
3. Per component: $\text{DOF}_k = |V_k| - \operatorname{rank}(J_k) - D_{\text{anchor},k}$, with $D_{\text{anchor},k}=0$ when the component contains a fixed datum and $3$ when it floats freely in $\mathbb{R}^2$.

The output (`DofReport`) carries `variables`, `rows`, `rank`, `dof`, `status` (`under`/`well`/`over`), the **motions** still available in plain language, diagnoses, blocks, whether the sketch is anchored, and the maximum residual.

Reporting DOF *per block* rather than for the whole sketch is what makes the number actionable: "this corner is free" instead of "the drawing has 7 degrees of freedom".

### 11.2 (c) The numerical core

**Why minimum-norm.** Of all coordinate updates that satisfy the constraints, the solver takes the smallest one:

$$\Delta X^* = -J^{+}F(X), \qquad J^{+} = V\Sigma^{+}U^{T}$$

That single choice is what implements "zero conformal scaling" in practice. Nothing tells the solver to preserve wall thickness; preserving it *is* the minimum-norm answer, because moving an undriven wall costs displacement the constraint did not ask for.

**Dogleg** (Powell) is the default: a trust-region step interpolating the Gauss–Newton and steepest-descent directions, robust when $J$ is near-singular. **Levenberg–Marquardt** damps instead. Both take exact analytical Jacobians (18 of them). Both warm-start from $X_0$, which is also what keeps the solver on the same solution branch rather than jumping to a mirrored one.

**Column damping** ($S_{jj}$) is used during direct manipulation so a dragged vertex moves and its neighbours resist proportionally.

### 11.3 (d) Homotopy sub-stepping

A change larger than 500 mm is subdivided into $\lceil \Delta P / 300\,\text{mm}\rceil$ predictor–corrector steps. Without it, a large span change can cross a fold in the solution manifold and land on a different branch — visibly, a haunch turning inside out.

### 11.4 (b) SVD admissibility — see §12.3

Stated with the geometry engine because it is about *candidates from geometry*.

### 11.5 The variational GAD kernel

`lib/parametric/variationalKernel.ts` takes a different route from declare-and-solve, and it is worth understanding why both exist.

`extractVariationalGAD(shapes, weldingTolerance)` **infers** the constraints a drawing already obeys — horizontal, vertical, perpendicular, parallel, offset, haunch angle, datum, driving length, driving span — and `solveVariationalGAD(shapes, modification)` then applies a requested change by Levenberg–Marquardt while holding those inferred invariants.

The distinction:

| | declare-and-solve (§7.3) | infer-and-stretch (this) |
| :-- | :-- | :-- |
| Where the rules come from | asserted or accepted by a person | inferred from the geometry, every time |
| What it is for | a model that will be edited repeatedly | "make this 900 wide and keep it looking like itself" |
| Persistence | constraints are stored | nothing is stored |

Both are reachable in Aagento: the second through Author Mode's *Shape it keeps* panel and the agent's `reshape` tool. `reshape` verifies what it produced — an early version reported success while producing 1478 mm for a requested 900, and it now refuses with the number it would actually have made.

### 11.6 PlaneGCS — the WebAssembly solver

PlaneGCS is FreeCAD's Sketcher constraint solver, compiled to WebAssembly (496 KB). It is **LGPL-2.0-or-later**, so dynamic WASM linking is compatible with commercial distribution — unlike SolveSpace's `slvs`, which is GPLv3 and is therefore banned from production and kept only as a development-time oracle (§27.2).

**Status by repository:**

| | `2D Canvas` | `aagento-bridge` main | `aagento-bridge` `feature/planegcs-wasm` |
| :-- | :-- | :-- | :-- |
| `@salusoft89/planegcs` | installed | not installed | installed |
| `lib/solver/planegcsClient.ts` | active, 0.23 ms warm solve | present; shim rejects on init | active |
| Effective solver | hybrid | TypeScript Dogleg/LM | hybrid |

`PlaneGcsClient.solve()` stamps every result with its `provenance`: `planegcs_wasm`, `analytical_culvert`, `dogleg_ts` or `lm_ts`, so which solver produced a given answer is always recoverable. When the WASM package is absent the shim answers the import and rejects on init, and the client falls back cleanly.

**Two real browser-specific problems were found and fixed on the branch**, and they are the reason this is not simply "install the package":

1. The Emscripten glue statically imports Node's `module`, which a browser bundler cannot resolve. Fixed with `externalDependencies: ["module"]` in `angular.json` — a tsconfig `paths` mapping does *not* reach inside `node_modules`.
2. The glue locates the `.wasm` relative to the **bundled** `import.meta.url`, which is wrong after bundling. Fixed by `shims/planegcs-browser.ts`, which re-exports the real package through its deep path and supplies `WASM_URL = '/planegcs.wasm'` to `make_gcs_wrapper`, which sets Emscripten's `locateFile`.

Verified on that branch: `provenance === 'planegcs_wasm'` in Chrome, residual < $10^{-9}$, agreeing with the TypeScript core to $10^{-3}$; the production build ships the 496 KB wasm; in Node, `npm run planegcs:check` reports all `planegcs_wasm` with residuals ~$10^{-14}$. **The branch is unmerged** (§35).

**Routing when both are present:** PlaneGCS takes standard sketch constraints (distance, parallel, coincident); the TypeScript core takes the civil-specific ones (haunch equal-leg, centroid distance, signed wall offsets) that PlaneGCS has no vocabulary for. This is a deliberate hybrid, not duplication (§30.2).


---

## 12. Geometry Engine

### 12.1 GEOM-RP/1 — the vector predicate engine ($P1$–$P10$)

`lib/geometry/predicates/vectorPredicates.ts`. Every relationship is evaluated with coordinate-free vector algebra, so rotating the whole drawing changes nothing about what is detected. That property is the entire point of the protocol: a skewed bridge is not a special case.

```text
P1  Parallel          |d_A × d_B| / (|d_A||d_B|)  <  sin(ε_angle)
P2  Perpendicular     |d_A · d_B| / (|d_A||d_B|)  <  sin(ε_angle)
P3  Offset            δ_start = (B_start − A_start) · n_A
                      δ_end   = (B_end   − A_start) · n_A
                      |δ_start − δ_end| < ε_dist          (and the SIGN is kept)
P4  Chamfer/haunch    θ = atan2(d_C × d_A, d_C · d_A); equal-leg iff ||h_A|−|h_B|| < ε_dist
P5  Concentric        ‖C_A − C_B‖ < ε_dist;  radial offset = |r_A − r_B|
P6  Tangent           ||(C − A_start) × d_A| − r| < ε_dist
P7  Equal length      ||d_A| − |d_B|| < ε_dist
P8  Coincident        ‖P_A − P_B‖ < ε_weld
P9  Symmetry          R = I − 2nnᵀ;  ‖P′_A − P_B‖ < ε_dist
P10 Centroid distance ‖C_A − C_B‖ = D        (an ACTIVE driving constraint)
```

$P10$ is worth singling out: it is not a report. Decreasing a centroid distance pulls the shapes together along the exact Jacobian gradient of the shoelace centroid, which is how "this slab is centred on that opening" becomes something the solver maintains rather than something a person re-checks.

### 12.2 The planar map (DCEL)

`lib/geometry/topology/dcel.ts`. This is the structure that makes every question about enclosure answerable.

1. **Intersection splitting** — intersecting, touching (T-junction) and overlapping segments are split at true intersections, found through a broad-phase R-tree (Flatbush).
2. **Vertex welding** — endpoints within $\varepsilon_{\text{weld}}$ merge into one topological vertex through union-find.
3. **Half-edge pairing** — directed half-edges are sorted radially by angle at each vertex, wiring `next`, `prev` and `twin`.
4. **Face tracing and nesting** — cycles are traced, signed shoelace areas computed, and nesting depth assigned by ray casting. **Even depth is solid material; odd depth is an interior void.** That one rule is what lets an opening inside a wall be reported as an opening rather than as a second solid.
5. **Euler characteristic enforcement** — every build asserts $V - E + F = 1 + C$.

### 12.3 SVD row-space admissibility

`lib/inference/admissibilityFilter.ts` / `lib/upce/admissibility.ts`. Before a candidate constraint is allowed to join, its gradient $g = \nabla f_{\text{cand}}$ is projected onto the row space of the existing Jacobian $J = U\Sigma V^{T}$:

$$g_\parallel = VV^{T}g, \qquad g_\perp = (I - VV^{T})g$$

$$\begin{cases}
\|g_\perp\|_2 \ge 10^{-6} & \textbf{Independent} \text{ — admissible; removes one DOF} \\
\|g_\perp\|_2 < 10^{-6},\ |f(X)| < \varepsilon & \textbf{Redundant} \text{ — discarded silently} \\
\|g_\perp\|_2 < 10^{-6},\ |f(X)| \ge \varepsilon & \textbf{Conflicting} \text{ — flagged, never applied}
\end{cases}
$$

This is what stops an inference engine from over-constraining a drawing into unsolvability, and it is why detection can be aggressive without being dangerous.

### 12.4 Construction pipeline

```text
STAGE 1  primitives — drawn, or imported through DXFIN
STAGE 2  normalisation — weld within ε_weld, split at intersections
STAGE 3  loop tracing — closed cycles, nesting depth: even solid, odd void
STAGE 4  binding — predicates detect, SVD gates, author accepts, solver maintains
```

---

## 13. Geometric Queries

`lib/geometry/queries.ts` and `GeometryQueryService`. This is the layer that answers questions *about* geometry, as opposed to solving it, and it exists because the editor could not answer the simplest one.

### 13.1 "Where is the centre of this?" has three answers

| Name | What it is | What it is for |
| :-- | :-- | :-- |
| **Area centroid** | where the enclosed material balances, openings subtracted | engineering: section properties, stability, balance |
| **Box centre** | the middle of the extents | presentation: where a label goes |
| **Length centre** | where open geometry balances, weighted by length | a chain of lines that encloses nothing |

They are named apart in the code, in the reports and on screen, and a box centre is never returned as a centroid. For an L-section they differ by 400 mm, and for an L the box centre is not inside the material at all.

### 13.2 What it answers

Built on the DCEL (§12.2) and `computePolygonMoments` (Green's theorem), so every number is measured from the planar arrangement rather than from the shapes' declared extents:

- **Enclosed regions** — each with its own area, perimeter, centroid, extents, nesting depth and `kind: solid | void`, and which primitives bound it;
- **Section properties** — gross area, void area, net area, composite centroid, and the **major principal axis** from the second moments about the centroid, accumulated over N disjoint solids and M voids with Ixy carried, so "which way is this section lying?" is measured rather than assumed;
- **Reference points** — endpoints, midpoints, vertices, edge centres, circle centres, quadrants, centroids, under the same names the object snaps use;
- **Intersections** — exact, for line/line, line/circle and circle/circle, with arcs limited to their sweep;
- **Closest point and normal** on any primitive;
- **Mitre bisector** at a corner, and the signed angle between two segments.

### 13.3 Who uses it

The agent (`geometry_query`), Author Mode (the **Measure** block), the autonomous discovery pipeline (§29.2 — it converts entities to primitives through the same adapter), and any tool that needs to know where something is. One question, one answer, everywhere.

---

## 14. Coordinate Systems & Local Frames

### 14.1 Why a local frame is not a convenience

A draftsman does not set a wingwall out in world coordinates. It is *1200 forward of the abutment face, splayed 30°* — in the abutment's frame. When the skew changes, the wingwall follows, because it was never written in world terms in the first place.

Geometry written in world coordinates does not follow. That is the whole difference, and it is why §12 of the requirements calls hardcoded coordinates a defect rather than a style.

### 14.2 How it works

`LocalFrameService`, on the kernel's `LocalFrame` and `AffineMatrix3x3`.

A frame is a name, an origin, a rotation, and optionally a parent. Composition is by matrix product:

$$M_{\text{local}\to\text{world}} = \begin{bmatrix}\cos\theta & -\sin\theta & X_0\\ \sin\theta & \cos\theta & Y_0\\ 0&0&1\end{bmatrix}$$

so a chain needs no special case:

```text
world
  └── bridge_axis          origin on the centre line, +U along the deck
        ├── abutment_a     origin at the face, +U along the deck
        │     └── wingwall_a    origin at the return, +U splayed 30°
        └── abutment_b
```

**Setting a frame out along an edge** is the usual form: pick the face, and everything after it is measured along and across it. In Aagento the shortest version is a name plus the **id of a line already drawn** — the agent has that id in front of it from the tool that made the line.

### 14.3 Frame-relative coordinates work everywhere

A point may be written `{"frame": "abutment_a", "u": 1200, "v": 0}` in **any** tool, because resolution happens **once, at dispatch**, before the tool is chosen — not in the handful of tools that remembered to ask. A frame therefore works everywhere or nowhere, never in half the editor.

Refused, with the reason: a parent that does not exist, a chain that loops back on itself, removing a frame something else stands on, and a point in a frame that is not there — which is never quietly placed at the origin.

### 14.4 Rigid condensation — the solver's use of frames

`lib/geometry/lcs/componentFrame.ts`, `lib/upce/rigid.ts`. A rigid component containing $k$ vertices is condensed in the solver into **3 degrees of freedom**, $\mathbf{q} = [X_0, Y_0, \theta]^{T}$. External constraints acting on any internal line differentiate with respect to $\mathbf{q}$:

$$\frac{\partial r}{\partial X_0} = \frac{\partial r}{\partial P}\begin{bmatrix}1\\0\end{bmatrix},\quad
\frac{\partial r}{\partial Y_0} = \frac{\partial r}{\partial P}\begin{bmatrix}0\\1\end{bmatrix},\quad
\frac{\partial r}{\partial \theta} = \frac{\partial r}{\partial P}\begin{bmatrix}-u\sin\theta - v\cos\theta\\ u\cos\theta - v\sin\theta\end{bmatrix}$$

The component translates and rotates rigidly; its internal polygon never deforms.

---

## 15. Tolerance & Numerical Robustness

### 15.1 One policy, injected

`TolerancePolicy` (`lib/geometry/tolerance.ts`), in model-space millimetres, never pixels, never a local constant:

| Field | Default | Governs |
| :-- | --: | :-- |
| `weld_mm` | 0.5 | topological vertex welding (union-find) |
| `geometry_mm` | 0.5 | predicate distance comparisons |
| `cluster_mm` | 1.0 | 1-D value clustering |
| `angle_rad` | 0.008727 (0.5°) | predicate angular comparisons |
| `collinear_rad` | 0.05 (2.86°) | collinearity |
| `solver_residual` | 1e-8 | convergence, $\|F(X)\|_\infty$ |
| `singular_value_eps` | 1e-10 | SVD rank determination |
| `independence_eps` | 1e-6 | row-space admissibility |
| `snap_import_mm` | 2.0 | endpoint snapping on vector import |

### 15.2 One value is not enough for every operation — the lesson

This is the most instructive numerical finding of the integration work, and it generalises well beyond the case that produced it.

`geometry_mm = 0.5` is a **position** tolerance: the right question is "are these two points the same place?". Used as a **sagitta** — the departure a chord may make from its arc — it is wrong, and wrong in a way that hides.

A Ø24 bolt hole tessellated at 0.5 mm sagitta becomes an **eleven-sided polygon**. An eleven-gon inscribed in its circle is **5.3% short on area**. That error goes straight into a section's net area and displaces its centroid, and nothing about the drawing looks wrong.

The correction is not a smaller constant. A single absolute bound is the wrong *shape* of rule for curvature, because the acceptable departure scales with the radius. The bound is now the tighter of an absolute and a **relative** one:

$$\text{sagitta} = \min\!\left(\text{policy.geometry\_mm},\ \frac{r}{10^4}\right)$$

with a **floor**: the planar arrangement welds vertices closer together than `weld_mm`, so cutting an arc into chords shorter than that does not buy accuracy — it collapses the loop. That floor is the real limit on how exactly a small circle can be measured *through the arrangement*, and it is documented rather than discovered later.

Measured across radii 6 mm to 5 m: **within 0.12%**, from 5.3%. Tests pin 0.2%.

The general rule: **a tolerance is a tolerance for a question**. Before reusing one, ask whether the new question has the same units and the same shape.

### 15.3 Other robustness measures

- **Squared distance residuals** avoid the $\sqrt{}$ singularity at $P_i = P_j$ (§9.3).
- **Warm starts** keep the solver on the same solution branch.
- **Homotopy sub-stepping** (§11.3) prevents branch jumping on large changes.
- **Tikhonov regularisation** ($\lambda = 10^{-4}$) and **column damping** in the drag path.
- **Chirality barrier** $\Phi = -\mu\ln(\text{Area}_{\text{haunch}})$ prevents corner inversion during large span changes.

---

## 16. Regeneration & Entity Identity

"Changing a parameter regenerates the geometry" is true and useless. This is what actually happens.

### 16.1 The pipeline

```text
1  PARAMETER CHANGE            a value is typed, dragged, or set by a tool
        ▼
2  EXPRESSION EVALUATION       the AST is evaluated (§8.3), in dependency order
        ▼
3  DEPENDENCY RESOLUTION       Kahn order; a cycle refuses the edit here (§10.2)
        ▼
4  WARM-START LIFT             the previous solved state is lifted onto the shapes,
                               so copies begin from converged coordinates
        ▼
5  RIGID-BODY ABSORPTION       a direct drag on a rigid group transforms all its
                               members before solving, so the loop does not tear
        ▼
6  REPEAT EXPANSION            counts are topology, not solver variables: cell
                               pitch is evaluated and copies stamped with
                               index-stable ids BEFORE any numerical work (§18.2)
        ▼
7  PRIMITIVE LOWERING          shapes → SketchPoint / SketchSegment; coincident
                               joints collapse into one vertex record
        ▼
8  VARIATIONAL SOLVE           residual rows + analytical Jacobians → Dogleg/LM,
                               minimum-norm step from the warm start (§11.2)
        ▼
9  INVARIANT & TOPOLOGY GATE   declared invariants re-measured; loops closed;
                               no self-intersection; no inversion (chirality);
                               openings still inside the solid
        ▼                              │
        │ pass                         │ fail → ATOMIC ROLLBACK, reason returned,
        ▼                              │        previous state stands (§16.3)
10 SHAPE LIFTING               solved coordinates back onto the shapes
        ▼
11 BOOLEAN FUSION              overlapping solids unioned (Clipper2); shared webs
                               collapsed to a single intermediate thickness
        ▼
12 ENTITY RECONCILIATION       matched by upceKey; mutate in place (§16.2)
        ▼
13 DRAWING UPDATED             canvas, dimensions, annotations, exports
```

### 16.2 Identity survives — `upceKey`

Every generated entity carries `upceKey = ${instanceId}:${indexStablePath}`.

On a value change, `reconcile()` matches by that key and **mutates the matching entity in place**. Its Aagento id survives; so does its selection, and any layer, colour or lineweight a draftsman set on it.

Entities appear or disappear **only when the topology genuinely changed** — a cell added, an opening removed. This is why the path element is *index-stable*: the second cell of a three-cell box is the same key whether the box has two cells or five.

Without this, every regeneration would be delete-all-and-redraw, and every selection, every manual override and every annotation anchored to a generated entity would be lost on each edit.

### 16.3 What happens when it does not work

| Situation | Behaviour |
| :-- | :-- |
| Value is valid | solves, reconciles, drawing updates |
| Value produces impossible geometry (a loop collapses, a shape turns inside out, an opening leaves the solid) | **refused whole** with the reason; the previous state stands — verified: `D1 = −9000` returned *"D1 must be more than zero. rectangle 2 has turned inside out"* and the width stayed at 5200 |
| A name in an expression is undefined | refused before anything is stored — verified: *"Undefined variable 'NotAValue'. Nothing was changed."*, and the earlier formula survived |
| A cycle is introduced | refused at step 3, with the exact chain (§10.2) |
| Solver does not converge | reported as not converged, with the largest residual; the drawing is unchanged |
| Topology changed legitimately | entities appear or disappear; everything else keeps its id |
| A shape cannot be rebuilt from the solved sketch | left as it was and reported, never silently squared off |

**Nothing half-regenerates.** A partially applied edit is worse than a refused one, because it looks like it worked.

### 16.4 Why grips are refused on generated geometry

A dragged vertex on component geometry would be overwritten at the next regeneration: the edit appears to work, then quietly disappears. So component entities **lose their grips** — one line in `GripManagerService.generate()`, the same rule AutoCAD applies to a locked layer — and keep everything else.

They are edited through their values, or through a driving dimension (§17). This is a deliberate refusal in place of a silent revert, and the distinction matters: a user who cannot drag learns the rule in one second; a user whose drag disappears later learns to distrust the tool.

Free-sketch geometry in an analysed session is different: it **can** be dragged, through `drag()` (§11.2, §25.4), because there the solver decides what follows and the result is durable.

---

## 17. Dimensions That Drive Geometry

### 17.1 Two completely different objects with the same name

| | Dimension as annotation | Dimension as parameter driver |
| :-- | :-- | :-- |
| What it does | states a measurement | **is the handle of the value that sets it** |
| Where the number comes from | measured from its anchors | the parameter it is bound to |
| Editing its text | puts a number on the sheet that may contradict the geometry | — |
| Editing it | — | opens the parameter, changes the model, regenerates |

Both are `DimensionEntity`. What distinguishes them is a binding.

### 17.2 Sensitivity binding — how the binding is found

Not by name matching, and not by asking a model. By **measurement**: each candidate value is nudged and the dimension re-measured. A dimension binds to the value where

$$\frac{\partial(\text{dimension})}{\partial(\text{value})} = 1$$

one for one. That is what "this dimension measures that value" means operationally, and it works regardless of what either is called.

The result is carried on the entity as `upceDrives`.

### 17.3 Editing it

Double-clicking a dimension that carries `upceDrives` opens the **parametric panel on that value**, not the dimension text editor.

Editing the text is prohibited, and the reason is exactly the invariant the whole system is built on: a number on the sheet that contradicts the geometry is the one thing an engineering drawing must never contain. A dimension is a *reading*. If the reading is wrong, the geometry is wrong.

### 17.4 A dimension must measure real geometry

Dimensions run between the geometry's own coordinates, and level callouts stand on a constructed line or face. A dimension to a typed position is refused. This is enforced at the `check_geometry` gate (§25.3), and it is why annotation comes after geometry: you cannot measure something that is not there yet.

---

## 18. Complex & Composite Geometry

### 18.1 Port composition — SE(2) affine frames

`lib/parametric/component/portMatingSolver.ts`. Components define local frames and named boundary **ports**. When child $C$ mates with parent $P$:

$$M_{\text{target}} = M_{P}\cdot M_{\text{port}_P}\cdot T(\text{along},\text{normal})\cdot R(\theta_{\text{rot}}+\theta_{\text{mate}})$$
$$M_{C} = M_{\text{target}}\cdot M_{\text{port}_C}^{-1}$$

The rigid inverse is formed directly rather than by general matrix inversion, avoiding numerical noise:

$$M^{-1} = \begin{bmatrix} u_x & u_y & -\mathbf{O}\cdot\mathbf{u}\\ v_x & v_y & -\mathbf{O}\cdot\mathbf{v}\\ 0&0&1\end{bmatrix}$$

This protocol is what lets one architecture carry box cells, piers, deck modules, wingwalls, parapets and user-drawn components without a vocabulary for any of them.

### 18.2 Repeats are topology, not variables

Changing a count $N: 1 \to 4$ changes the **dimensionality of the state vector**. A solver cannot be asked to do that. So repeat expansion happens **above** the solver (`repeat.ts`, `repeatExpander.ts`), stamping index-stable ids before any numerical work begins.

Cell pitch is formalised rather than inferred from outer boundaries — which is what caused the multi-cell distortion defect:

$$P_{\text{cell}} = S_{\text{clear}} + t_{\text{mid}}, \qquad W_{\text{total}} = N\,S_{\text{clear}} + (N-1)\,t_{\text{mid}} + 2\,t_{\text{ext}}$$

with the structural default $t_{\text{mid}} \equiv t_{\text{ext}}$.

```text
   ◄─── Clear Span S ───►  t_mid  ◄─── Clear Span S ───►
   ┌──────────────────────┐      ┌──────────────────────┐
   │        CELL 0        │      │        CELL 1        │
   └──────────────────────┘      └──────────────────────┘
   ◄────────────── Cell pitch P ────────────────────────►
```

Expanding $1 \to 3$: cells instantiate at $0, P, 2P$; intermediate webs synthesise at $t_{\text{mid}}$; all twelve corner haunches keep $45°$ and invariant leg lengths; total width becomes $3S + 2t_{\text{mid}} + 2t_{\text{ext}}$ with zero conformal distortion.

### 18.3 Boolean fusion and shared-web collapse

Broad-phase interference via R-tree; when solids overlap, Clipper2 executes a Boolean union. Boundary edges within $\varepsilon_{\text{weld}}$ collapse into a single intermediate web of thickness $t_{\text{mid}} = t_1 + t_2 - \text{overlap}$, and the planar DCEL is rebuilt with correct interior void nesting.

### 18.4 Tables as list values

A `TableDef` (foundation layers, for instance) is a list value. A `repeat: { table }` walks its rows with `<T>_<col>`, `<T>_before_<col>`, `<T>_sum_<col>` and `<T>_count` in scope, text columns interpolated into notes, and hatches able to pick their material per row.


---

## 19. Structural, Bridge & Culvert Domain

Everything here is **domain knowledge layered on a domain-neutral engine**. Nothing in §7–§18 knows what a bridge is, and that separation is load-bearing: the same kernel must handle a steel plate tomorrow.

### 19.1 Codified standards

`docs/bridge-formulas/` holds 17 documents covering IRS/RDSO/IRC practice — RCC box (railway and highway), hume pipe, PSC slab, composite girder, OWG, substructure, foundations, the railway drafting sequence, a glossary, cross-references and Q&A. They are bundled into a searchable corpus (`knowledge:build`) and reached by the agent's `bridge_reference` tool.

They are **reference, not code**. A rule citing them reports "requires review", never "compliant".

### 19.2 Vocabulary and recognition

`lib/bridge/glossary.ts` gives the editor the words (bed level, HFL, earth cushion, pier…). `recognize.ts` **proposes** roles with evidence and confidence — nothing is applied without acceptance. `drawnFacts.ts` reads levels and sizes back out of tagged geometry for the audit.

Design-basis values carry a status. The agent may enter values as `INFERRED`, `ASSUMED_FOR_DRAFT` or `PENDING_CONFIRMATION`, but it may **never confirm** one and never approves a drawing.

### 19.3 The 9-gate GAD compliance audit

`lib/bridge/audit.ts`. Before a drawing is issued it passes nine gates:

| Gate | Checks |
| :-- | :-- |
| 1 `data` | Design Basis Report fields present and confirmed |
| 2 `geometry` | closed loops, no self-intersection, slab ≥ 200 mm, wall ≥ 250 mm (IRC:112 / IRS) |
| 3 `parameter` | no unbound driving parameters, valid domains, no cyclic or orphaned dependencies |
| 4 `consistency` | span, height and cushion identical across section, elevation and plan |
| 5 `annotation` | every structural face dimensioned, components tagged, materials labelled |
| 6 `railway` | HFL, freeboard (600 mm culverts / 1000 mm major bridges), vertical clearance against the IRS Schedule of Dimensions, scour |
| 7 `standard` | 1:100 readability, layer assignments, line weights |
| 8 `sheet` | geometry and annotation inside the title-block borders |
| 9 `approval` | issue blocked while any blocker or error remains |

Every rule cites a record in `sources.ts`. Where software can compute a number but cannot establish that a rule *applies*, the verdict is **requires review** — never "safe".

### 19.4 The drafting grammar

The sequence the agent is held to, and the one a draftsman follows:

axes establish position → levels establish vertical relationships → a clear opening is the space between inside faces → a thickness is the distance between two parallel faces, an **offset**, never a separately guessed rectangle → the outer outline minus the openings is the concrete → repeated parts derive from one pattern and a count → wings and returns relate to the structure and the alignment → the track relates to the railway centre line and sits on the formation → dimensions describe the finished geometry → annotation explains it.

Neither dimensions nor annotation ever substitute for missing geometry.

---

## 20. Agent Architecture

### 20.1 Where it runs

```text
                        AAGENTO CAD EDITOR
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
   AI Agent              Author Mode            Template Mode
   (§20–§22)               (§23)                   (§24)
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                      ONE CAD DOCUMENT  (§6)
             DocumentService · CommandStackService
                               │
                    AAGENTO NATIVE CAD TOOLS
          CadToolRegistryService → ActionRouterService
                               │
                     UPCE / SOLVER  (§7–§18)
```

The loop runs **in the browser**, because that is where the tools are. Only the model call crosses to the sidecar (§20.4).

### 20.2 Zero geometric authority

The language model decides **what** to build and **which tool** to reach for. It never produces a coordinate that is not either given to a deterministic tool or computed by the kernel. Every action terminates in `ActionRouterService` → validation pipeline → command stack, or in `AgentExecutorService` → the kernel.

A refusal is a result: the model is told what the editor said, in the editor's own words, and gets to fix it. Nothing is silently dropped and nothing is silently approximated.

### 20.3 The loop's three disciplines

1. **The model's turn is stored verbatim.** Gemini function calls carry thought signatures that must go back unmodified; rebuilding the turn from the parts we happened to understand breaks the next turn's function calling.
2. **Stopping is not finishing.** A model that stops calling tools has proven nothing. It is shown the current verification and nudged, a bounded number of times; if it still will not finish, the run ends `incomplete` with the drawing kept.
3. **A failure is reported as a failure.** Nothing is ever substituted for the model's work and labelled as the model's work.

### 20.4 Credentials never enter the browser

`ProxyChatTransport` implements the kernel's one-method `ChatTransport` and POSTs to the sidecar's `POST /api/ai/chat`, which adds the credential and forwards to Vertex.

`lib/ai` is imported into the browser with **`import type` only**, which TypeScript erases — so `vertexTransport.ts` (`node:crypto`, `node:fs`) and `geminiCache.ts` never enter the bundle. The production build would fail to resolve `node:*` for a browser target if that ever regressed.

**Verified** by searching the production bundle for the project id, `BEGIN PRIVATE KEY`, `service_account`, `node:crypto`, `node:fs`, `node:zlib`: nothing. The only Vertex-related string is a comment naming which environment variables the *sidecar* reads. The browser holds one address.

**Cost is never fabricated.** Vertex returns token counts, not prices. The panel always shows tokens, and a money figure only when an operator has set `GEMINI_PRICE_INPUT_PER_M` / `GEMINI_PRICE_OUTPUT_PER_M` / `GEMINI_PRICE_CURRENCY` on the sidecar. Otherwise it says why there is no figure.

---

## 21. Agent Runtime & Memory

### 21.1 Why long runs did not finish — the diagnosis

Three causes. **None of them was the step limit**, which is why raising it never helped.

| Cause | Mechanism | Fix |
| :-- | :-- | :-- |
| **Tool-vocabulary mismatch** | The prompt was 2D Canvas's. It asked for `construct`, `transform`, `boolean`, `annotate`, `derive`, `compare_reference`, `layout_annotations` — none of which exist in this host — and never mentioned Offset, Trim, Extend, Fillet, Mirror or Dimension, which do. A model told to use a tool it has not got spends its turns discovering that, apologising, and rephrasing the same mistake. | `agent-prompt.ts`: the same method written against the real tool surface (§21.2) |
| **Fake viewport semantics** | `zoom` moved the canvas; `view` then called `zoomExtents` before rendering. Framing a wingwall and looking at it showed the whole sheet again. A zoom that cannot change what the agent sees is not a zoom. | viewport as state (§21.3) |
| **Context explosion** | Every turn sent the whole conversation back, and the conversation is mostly tool output: a `look` over a GAD is 400 lines; a `view` is a 1600 px render. | compaction + state brief (§21.4) |

Two further causes were found by running it:

| Cause | Mechanism | Fix |
| :-- | :-- | :-- |
| **No progress detection** | The model could repeat an identical call indefinitely on unchanged geometry. | progress guard (§21.6) |
| **No semantic completion check** | A run could pass verification with correct geometry and **no named values at all** — a picture, not a model. | the parametric gate (§21.7) |

### 21.2 Milestones

The method is expressed as finished states rather than a stream, so the agent can say where it is and what remains:

```text
M0  UNDERSTAND    read the brief and the reference; load the skills that apply
M1  REFERENCES    centre lines and controlling levels as construction geometry,
                  AND a named frame on each one to be built from (§14)
M2  PRIMARY       the openings, and the concrete around them
M3  COMPONENTS    haunches, bedding, footings, headwalls, wings
M4  CONTEXT       ground line, embankment, formation, track
M5  PARAMETRIZE   analyse → constrain → name_value → DOF → solve
M6  CHECK         check_geometry; correct at the cause
M7  DIMENSION     the controlling sizes, measured off the geometry
M8  ANNOTATE      levels, notes, hatching, titles
M9  VERIFY        verify; correct; verify again
M10 FINISH
```

### 21.3 Viewport as state

`zoom` writes the viewport; `view` renders **that world rectangle** as a window (`area: 'window'` with explicit bounds), independent of canvas size; both report where the agent is, how much of the drawing that is, what is in view, and **which regions have already been inspected** — so the same corner is not read twice.

`zoom` takes `extents`, `selection`, `entity`, `region` (with a label), `in`, `out` and `previous`. The coarse-to-fine discipline on a large GAD — fit the sheet, find the views, zoom region by region, return — is only possible because of this.

### 21.4 Memory: remember the state, not every token

`agent-memory.ts`.

```text
conversation history
        │  past the budget (120k estimated tokens)
        ▼
COMPACTION
   old function responses  → one-line digests (head + tail, ~400 chars)
   old renders             → dropped, except the last two
   the model's own turns   → UNTOUCHED
        ▼
+ stateBrief()   objective · plan values · what is drawn, by type and layer ·
                 extents · ids created · parameters · constraints · DOF ·
                 frames · where it is looking
        ▼
continue
```

Four design choices, each for a reason:

- **The model's turns are never rewritten.** Thought signatures must go back verbatim (§20.3), so only *our* side of the conversation — the function responses this application wrote — is touched.
- **Images are charged by tiles, not bytes.** A 1600 px render is ~1,300 tokens; counting its base64 length would put the estimate out by a factor of several hundred.
- **The state brief is read from the drawing and the workbench as they stand**, not accumulated as a running summary, so it cannot drift from the truth.
- **Compaction happens once at a threshold**, not continuously, because rewriting history invalidates the prompt cache and a cache miss costs more than the tokens it saves. (Observed cache hit rates: 340k of 373k, and 1.21M of 1.47M.)

### 21.5 Batching

Independent calls go in **one turn**. The GAD run made 145 tool calls in 28 turns — about five per turn — which is what makes a run of that size affordable at all.

The counterpart lesson: batching fixed the *rate* but not the *choice*. That run still drew 68 separate lines, because a repeated row, a polygon and a region to hatch had no tool. A missing tool does not announce itself; it becomes a slow, plausible substitute. See §22.3.

### 21.6 Progress guard

The same tool, with the same arguments, on a drawing that has not changed since, is not progress.

```text
1st  allowed
2nd  allowed, with a note: "you already have this answer — act on it"
3rd  REFUSED, with the reason and an instruction to change strategy or finish
```

A drawing fingerprint (entity count, id hash, extents, constraint and parameter counts) is taken on every call; any change forgives every earlier repetition. This is what ends `zoom → inspect → zoom → inspect`.

### 21.7 Budget, and a guaranteed path to finish

`finish` is a required state, not a closing thought. The run reserves turns for it and says so **once**, at the point construction has to stop — a warning on every turn is noise the model stops reading.

### 21.8 The record at finish

The agent's closing account is **appended to a measured record** read off the drawing: entity counts by type, every named value, how many of them drive geometry, constraints, degrees of freedom and whether the model is under-constrained, local frames, enclosed area and centroid, and the design inputs still required.

This exists because a real run finished by reporting the model "fully constrained and solved" when it had 138 degrees of freedom and two named values. Everything else in that account was accurate, which is exactly why the one false line mattered: nothing contradicted it. The prose is kept; it is no longer the only thing on the page.

---

## 21A. Agent Perception — How the Drafter Sees

This section exists because the two hosts' drafters were given the same method
and very different senses, and the difference accounted for most of the quality
gap between them. It is the answer to "why does the same model, on the same
drawing, do so much better over there?"

### 21A.1 The three ways of seeing, and what each is for

| | What it shows | What it is for | Cost |
| :-- | :-- | :-- | :-- |
| **Reading tiles** | the reference, whole and cut into six overlapping magnified tiles | reading every written number BEFORE planning | one turn's tokens, cached thereafter |
| **`zoom_reference`** | any region of the reference, up to 4×, six at a time | a callout that is still unclear; which band an arrow points into; solid or dashed | one call |
| **`view`** | the drawing the agent has built, through the real renderer | checking proportions, seeing what it actually drew | one call |
| **`compare_reference`** | the construction laid OVER the reference, registered | measuring how far each line is from where it should be | one call |
| **`look`** | the drawing as text: counts, layers, ids | naming an entity for the next call | small, by default |

The reference and the drawing are **different things**, and the tools keep them
apart. Mixing them into one observation is how an agent ends up unsure which it
is looking at.

### 21A.2 Why turn-one tiles are decisive

A GAD is a wide sheet of small text. Scaled to fit a model's image budget, its
2.5 mm dimensions are about three pixels high: the model can see that a
dimension is *there* and cannot read what it *says*.

What follows from that is the whole failure mode. It guesses a number, plans
around the guess, builds around the plan, and every later observation is spent
discovering that something does not fit — which reads, from outside, as an agent
burning a hundred tool calls and producing very little.

So the reference arrives **twice** in the first message: whole, and cut into six
overlapping tiles magnified to the image budget, with a text index giving each
tile's position in thousandths of the original. On the reference GAD
(1726 × 798) that is 1.7×–1.9× per tile, and at that magnification
`400 · 2180 · 350 · 2180 · 400`, `2720`, `2870`, `HFL 57.668`, `BED LEVEL
56.538`, `700 mm. SAND FILLING` and `SCALE 1:100` are all unambiguous.

The 8% overlap is not decoration: a dimension that falls on a tile boundary
would otherwise be cut in half and unreadable in both.

### 21A.3 Comparison is measured, not eyeballed

Asking a multimodal model to compare two pictures is asking it to do the thing
it is worst at. It will not notice a slab 5% too thick, or a wall drawn on the
wrong face of a line.

`compare_reference` does what a checker with tracing paper does, and does it
deterministically:

```text
1  the reference's INK is marked — anything that is not paper
2  a chamfer DISTANCE MAP gives, for every pixel, how far the nearest ink is
3  the agent pins its drawing to the image with TWO points it recognises on
   both (a corner of the structure, the foot of the centre line)
4  the fit is REFINED by sliding and scaling until the drawing's lines sit on
   the reference's ink — pattern search on the mean capped distance
5  every constructed entity is SAMPLED along its length and scored: what share
   lies on a reference line, and how far the rest strays, in MILLIMETRES
```

Short gaps between "on" samples are bridged, so a dash-dot reference line is not
read as a missing one. The distance is capped, so a line the reference simply
does not have cannot drag the fit towards itself — which means a reported
deviation at the cap means "off the map", not an exact distance.

The overlay returned with it shows the reference faded to a tracing, the
construction in blue, and a red dot wherever a line leaves it — and it can be
returned magnified around one entity's worst point, so a deviation can actually
be looked at.

### 21A.4 What is shared between the hosts, and what is not

The arithmetic is the kernel's and is used unchanged: `inkMask`,
`distanceMap`, `registrationFromPairs`, `refineRegistration`, `deviations`,
`samplePolyline`, `toImage` (`lib/agent/drafter/reference.ts`).

Only the **pixels** are host-specific. The kernel's versions carry their own PNG
codec and a software rasteriser with a 5×7 bitmap font, because they were
written for a Node server with no canvas. A browser has a canvas, which decodes,
crops, resamples and encodes natively, faster and with better resampling than
any hand-written raster loop — so `AgentVisionService` does the imaging and
`node:zlib` gets a shim that **throws with the reason** rather than returning
empty buffers. A reference that silently decodes to nothing would look like a
blank drawing, which is a far worse failure than a refusal naming the tool to
use instead.

### 21A.5 Observation is layered

```text
LEVEL 1  GLOBAL   the whole reference, and `view` of the whole drawing
                  → composition, what the structure is, where the views are
LEVEL 2  REGION   tiles, `zoom_reference`, `zoom` + `view` on a region
                  → a wingwall, a corner, a callout, a repeated feature
LEVEL 3  EXACT    `look detail:"all"`, `measure`, `geometry_query`
                  → coordinates, spans, constraint and parameter state
```

The failure this replaces was going straight to level 3 for everything.
`look`'s default was every entity with its coordinates — four hundred lines to a
model that could have been shown the picture. Its default is now the summary
(counts, layers, ids), which is what the *next call* needs; the full listing is
there when exact coordinates are genuinely wanted.

### 21A.6 The division of labour

```text
VISION / MODEL                        DETERMINISTIC ENGINE
understand the picture                exact coordinates
identify the components               intersections, offsets, transforms
decide what needs building            constraints and parameters
recognise a difference                regeneration and topology
choose which tool                     validation
choose what to inspect next           the measured deviation itself
```

The model is never asked to compute a coordinate, and the engine is never asked
to interpret a picture. `compare_reference` sits exactly on that line: the model
supplies two points it *recognises*, and the engine does the registration, the
sampling and the scoring.


---

## 22. Agent Tool Architecture

### 22.1 Two kinds of call, one dispatcher

```text
                      AgentExecutorService.run(name, args)
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
   NATIVE_TOOL_FOR[name] exists                  not in the table
              │                                         │
              ▼                                         ▼
   CadAction → ActionRouterService            an ACT OF DRAFTING
   → validation pipeline                      handled here, against the kernel
   → CommandStackService (one undo step)      plan · look · view · use_skill
   → an ordinary entity on the drawing        bridge_reference · geometry_query
                                              set_frame · discover_model
                                              analyse_geometry · constrain
                                              name_value · drag · reshape · solve
                                              make_parametric · set_value
                                              check_geometry · audit · verify · finish
```

Before either, **frame resolution** runs once over the arguments (§14.3).

### 22.2 The mapping, stated once

`NATIVE_TOOL_FOR` in `agent-tools.ts`:

| The agent calls | Aagento runs |
| :-- | :-- |
| `line` `polyline` `rectangle` `circle` `arc` `construction_line` `text` `polygon` `ellipse` `spline` `point` | `draw.*` |
| `offset` `trim` `extend` `fillet` `chamfer` `copy` `rotate` `mirror` `scale` `array` `join` `break_entity` `explode` `stretch` | `modify.*` |
| `move` `delete` `set_layer` `set_color` `set_lineweight` | `entities.*` |
| `layer_rename` `layer_visible` `layer_lock` | `layer.*` |
| `select` | `query.selectEntities` |
| `dimension` | `annotation.addDimension` |
| `leader` `hatch` | `annotation.*` |
| `insert_library_item` | `library.insert` |

A test asserts that every mapped intent resolves to a registered tool and that every declared tool reaches a handler — so a dead tool call cannot ship.

### 22.3 Why the toolset was expanded

The GAD run's 68 `line` calls were the evidence. For a repeated row of cells, a polygon, a region to hatch or a note on a leader, drawing lines by hand was the only thing left.

Added, with their reasons:

| Tool | Replaces |
| :-- | :-- |
| `array` (rectangular and polar) | drawing each cell, pile or bolt hole |
| `join` | leaving an outline as four unconnected lines |
| `explode` | being unable to trim one edge of a polyline |
| `break_entity` | redrawing a line in two pieces |
| `stretch` | moving a whole entity when only one end should move |
| `polygon` `ellipse` `spline` `point` | approximating them with line segments |
| `leader` `hatch` | a note with no arrow; a material that is not indicated |

`hatch` is **associative**: it is tied to the entities that bound it, so it follows when they move.

### 22.4 The three drafting tools worth naming

- **`geometry_query`** (§13) — measured answers instead of arithmetic the model does in its head.
- **`discover_model`** (§29.2) — what the drawing already says about itself, clustered, before anything is constrained.
- **`drag`** (§16.4) — direct manipulation, and the fastest way to find a missing rule: if dragging the top of a wall shears it instead of lengthening it, something was never asserted.

---

## 23. Author Mode

The surface where relationships are **authored**. Persona rule §3.1 (3): this is the only place expressions are written.

### 23.1 Tabs

**Values** · **Geometry** · **Relationships** · **Audit**.

### 23.2 The Geometry tab — the draftsman's whole route, without the agent

In the order of the work:

1. **Measure** (§13) — area, perimeter, every enclosed region and opening with its own centroid, the extents. The three centres stay named apart on screen exactly as in the engine.
2. **What does it already say?** (§29.2) — the discovery pipeline: sizes the drawing repeats, how many places measure each, and the structure it is read as, with confidence. Nothing is applied.
3. **References** (§14) — set a frame out along the selected line, name it, and see how each was established and what carries it.
4. **Analyse** — open a session (§7.3).
5. **Freedom** — DOF, the motions still available in plain language, and the design question behind each one, with quick fixes and the DOF each would remove.
6. **Detected relationships** — candidates with evidence, confidence, what each preserves, and *show on drawing*.
7. **Shape it keeps** — the inferred invariants and the variational resize (§11.5).
8. **Rules** — what has been asserted, and what can still be taken back (a `fact` cannot).
9. **Values** — names, formulas, what each follows, what it drives, the regeneration order, cycle warnings, and an `affects` list from the dependency graph (§10.2).

Every button calls the engine and shows what the engine said — **including when it says no**, which is most of what a draftsman needs to hear.

### 23.3 Writing a relationship

Writing `OverallWidth = 3 * ClearSpan + 4 * WallThick` goes through the kernel's own reducer (`CAD_EDIT_COMPONENT_INPUTS`). A cycle, an unknown name or a broken invariant is **refused whole with the reason** (§16.3).

A relationship may rewrite a formula of a **drawing-owned** definition. Library formulas are protected.

### 23.4 Claims that can be checked

*Drives N entities* selects them on the drawing. The dependency is read off the definition — a primitive's coordinates **are** expressions, and the primitive's id is the tail of the `upceKey` the mapper stamps on the entity — so the two line up with no second index to keep in step.

---

## 24. Template Mode

### 24.1 Two parametric systems, on purpose

Aagento's `template-engine` and the kernel's component engine are **both** parametric systems, and they were not forcibly unified. Unifying them would rewrite working Aagento code well beyond the CAD editor, for a layering diagram.

`ParametricBridgeService` connects them, and the seam is visible rather than hidden — see §30.1.

### 24.2 What it reads

Every named value on the drawing, from **both** sources:

- **the sketch** — values named on free geometry by the agent or Author Mode, listed under *This drawing*;
- **component instances** — parameters, formulas and authored relations, per component.

Each row carries its value, whether it is driving or worked out, the expression behind it, and what it depends on.

This was a real defect: `values()` walked `doc.components` and stopped, so a drawing made of lines — constrained and named, with a full parametric model — showed nothing at all. A draftsman who watched the agent create `ClearSpan` opened Template Mode and concluded two systems were running side by side. They are not.

### 24.3 What it writes

A **driving** sketch value is an editable field. Typing in it goes to the workbench, which re-solves and moves the entities through the ordinary command stack — one Ctrl+Z steps back over it.

Refused, with the reason:

- a value worked out from others — changing a result rather than its inputs is how a model quietly stops meaning anything, so it names the inputs to change instead (§8.4 option C);
- a value belonging to a component, which is edited on the component;
- a name that is not on the drawing.

### 24.4 Adoption

*Adopt into this template* copies the values into the template engine's own `ParameterDef`/`FormulaDef`: a driving value becomes an `INPUT`, a worked-out one a `COMPUTED` carrying its expression and `dependsOn`.

**It is a copy and it says so.** The two engines evaluate differently, and pretending one *is* the other would be worse than showing the seam. A parameter the template author wrote themselves is never overwritten.

### 24.5 Expressions are not shown here

Run/Template mode shows a value's **result and the names it follows**, never the expression (§3.1, rule 3). Expressions are authored in Author Mode. That is a decision about this mode, not a limitation of it.

---

## 25. The Agent → Parametric Workflow

How a brief becomes an editable model, end to end.

### 25.1 Understand, then plan

The agent loads the drafting skills that apply, reads the brief and any reference, and records a `plan`: the title, the values it will work to (**each marked given or assumed**), the features in build order, and the checks that must hold at the end. **Nothing is drawn before the plan.**

The agent drafts; it does not design. Span, clear height, thicknesses, foundation type and depth, HFL, rail and formation levels, loading, reinforcement, soil values, scour, hydraulics and material grades come from the brief, the reference, approved calculations or a standard drawing. A value nobody gave is recorded as assumed, drawn as a placeholder, and reported at the end as a design input still required — **never presented as data**.

### 25.2 References before geometry

`set_frame` on the centre line and on each controlling face (§14). A position written in world coordinates does not follow when its reference moves.

### 25.3 Construct, then gate

Geometry in stage order, batched. Then `check_geometry`, which is the gate between geometry and annotation. It refuses:

- an empty drawing, zero-size entities, duplicates;
- a drawing with no dimensions;
- **a drawing with no named values driving it** (§21.7);
- and it reports strays, plan checks, assumed values, and — advisory — a structure of any size with no local frames.

It deliberately does **not** demand zero DOF. Counting DOF is the right gate on a small sketch held by rules (§7.5); on a structure with thousands of coordinates it is not, and demanding it would make `finish` unreachable for exactly the drawings this exists for.

### 25.4 Parametrize

```text
discover_model      what sizes this drawing repeats, and where      (optional, §29.2)
analyse_geometry    open a session over the geometry                (§7.3)
constrain           accept every detected relationship in ONE call
name_value          list the proposals, then accept_all             (§8.5)
degrees_of_freedom  what is still free, and why                     (§11.1)
drag                test it: does the right thing follow?           (§16.4)
solve               settle it                                       (§11)
```

### 25.5 Dimension, annotate, verify, finish

Dimensions measure the geometry and become the handles of the values they measure (§17). Annotation follows. `verify` runs the geometry report, the invariant report (UPCE-MASTER §67) and the 9-gate GAD audit. `finish` appends the measured record (§21.8).

---

## 26. End-to-End Examples — Verified, Not Illustrative

Everything in this section was executed and read back out of the running application.

### 26.1 A single-cell RCC box culvert, and its parametric behaviour

Brief: clear span 3000, clear height 2500, walls 350, slabs 400.

**What landed on the drawing** (read from `DocumentService.activeFile.entities`):

| | |
| :-- | :-- |
| outer outline | closed `PolylineEntity`, **3700 × 3300** — 3000 + 2×350, 2500 + 2×400 |
| clear opening | closed `PolylineEntity`, **3000 × 2500**, at y = 400 (on the bottom slab) |
| dimensions | two `DimensionEntity`, measuring **3000** and **2500** off the geometry |
| title | `TextEntity` |

**That it is ordinary geometry** — through the editor's own services: selected the outer outline, moved it 1000 mm (−1850 → −850), Ctrl+Z (back to −1850), deleted it (8 → 7 entities), Ctrl+Z (7 → 8).

**That it is genuinely parametric.** `make_parametric` produced `D1 = 3000` and `D2 = 2500` as driving values and **every coordinate as an expression of them** — `X4 = X2 + D1`, `X5 = X4 + 350`, `Y4 = Y3 + D2`, `Y5 = Y4 + 400`.

```text
D1 = 3000  →  outer width 3700
D1 = 4500  →  outer width 5200        (= 4500 + 2 × 350)
D1 = −9000 →  REFUSED WHOLE: "D1 must be more than zero.
                              rectangle 2 has turned inside out"
              width stays 5200
```

That refusal is the architecture working, not an error: §16.3.

**Author Mode**, on that drawing: every row showed its expression, what it follows and what it drives. `OverallWidth = D1 + 2 * 350` was accepted (3700, follows D1). `Nope = NotAValue * 2` was refused — *"Undefined variable 'NotAValue'. Nothing was changed."* — and `OverallWidth` survived.

**Template Mode** showed the same model including `OverallWidth`. *Adopt* brought 14 parameters over: `D1`/`D2` as `INPUT` in mm; `X4` and `OverallWidth` as `COMPUTED` carrying `X2 + D1` and `D1 + 2 * 350` with their `dependsOn`.

### 26.2 A steel gusset plate, from a brief alone

Gemini 3.5 Flash Lite · high reasoning. **Reached `finish`.**

21 turns · 34 tool calls · 82 s · 373,014 tokens (340,213 cached) · 16 entities.
Tools, in order: `use_skill → plan → construction_line ×2 → rectangle → circle ×4 → fillet → zoom → view → analyse_geometry → constrain → check_geometry → look ×2 → dimension ×6 → zoom → view → look → verify → text ×3 → zoom → view → verify → finish`.

Geometry exact: 600 × 400 centred on the origin, four Ø24 holes at 60 mm edge distance, 30 mm corner fillets.

**What this run exposed**, both since fixed:

- the holes measured **5.3% small** — the sagitta problem (§15.2);
- the run finished with 14 constraints, 6 dimensions and **no named values at all** — a picture, not a model. Verification passed it silently, which produced the parametric gate (§21.7) and batch naming (§8.5).

**Re-run after those fixes.** Still reaches `finish`, and now with a model
behind it — `ProfileAWidth = 600`, `ProfileAHeight = 400`, 17 constraints —
where the first run had none. But it took **58 turns and 73 tool calls**, up
from 21 and 34, because the parametric gate now makes it name values and it
struggled to.

Six of those calls were refusals that taught it nothing:

| Refusal | Why it cost more than one turn |
| :-- | :-- |
| `analyse_geometry` ✗ ×2 | refused because nothing happened to be selected, so the run went analyse → refused → select → analyse |
| `name_value` ✗ ×3 | it passed a PARAMETER name where a RULE id was wanted, and the reply did not say so, so it tried again |
| `select` ✗ ×1 | followed from the above |

Both are fixed: `analyse_geometry` falls back to the whole drawing minus
annotation, and a wrong rule id now comes back with the measured rules still
waiting for a name, their values and their proposals. **The lesson is general:
a refusal that does not say what WOULD work costs another turn**, and on an
autonomous run that compounds.

The run also produced `Outline1Length = -300` — the same signed-measurement
naming defect the GAD run showed (§26.3.1), since fixed (§8.5).

### 26.3 The reference GAD — the real test

Gemini 3.8 Flash · medium reasoning, with the reference drawing attached. **Reached `finish`.**

28 turns · 145 tool calls · 24 min 27 s · 1,503,304 tokens (1,205,705 cached) · 120 entities (72 LINE, 10 CIRCLE, 15 DIMENSION, 23 TEXT) · 63 constraints.

It reconstructed "HALF SECTION & HALF ELEVATION — PROPOSED BRIDGE" with the level chain intact: rail 105.762, formation 105.000, top of slab 101.000, bottom of top slab 100.200, HFL 96.800, bed 96.100, foundation 94.150. A 10700 × 4100 single-cell box, 800 mm slabs, 350 mm outer walls, 600 × 600 haunches, foundation build-up (150 wearing course, 150 PCC, 850 granular), boulder backing, 1:1.5 embankment, 6000 mm return wall with 150 coping, weep holes, stepped footing, berm and inspection steps. Sub-bed features correctly dashed.

**What this run exposed:**

| Finding | Response |
| :-- | :-- |
| Its summary claimed "fully constrained and solved" with **138 DOF and 2 named values** | the measured record at finish (§21.8) |
| **68 separate `line` calls** where polyline/array/mirror/offset would have done | the expanded toolset (§22.3) and an explicit instruction |
| **Zero local frames** used, despite having them | `set_frame` by entity id, frames placed in M1, and an advisory in `check_geometry` (§14.2) |
| Batching worked — 145 calls in 28 turns | kept |

That table is the honest reading of that result: the drawing was right, and the
model behind it was thin.

### 26.3.1 The same GAD, after those fixes — measured

Re-run on the same reference with the same model. **Reached `finish`.**

| | First run | After | |
| :-- | --: | --: | :-- |
| Wall clock | 24 min 27 s | **8 min 23 s** | 2.9× faster |
| Tool calls | 145 | **116** | |
| Turns | 28 | 30 | batching held |
| Tokens | 1,503,304 | **1,303,610** (1,065,687 cached) | |
| `line` calls | 68 | **40** | polyline ×2, rectangle ×5, copy ×1 now used |
| Local frames | 0 | **1** (`bridge_axis`, set at M1) | |
| Named values | 2 | **4** | |
| Degrees of freedom | 138 | **8** | 27 constraints, up from a thinner set |
| Entities | 120 | 113 | |

The geometry is equivalent — the same level chain, the same 10700 × 4100 single
cell, the same 600 × 600 haunches — built in a third of the time with a model
behind it that is very nearly determined.

**What it still shows.** 40 `line` calls remain: the agent reaches for
`rectangle`, `polyline` and `copy` now, but not yet for `array` or `mirror` on a
symmetric half-section, which is where the remaining bulk is. And one named
value came back as `Line1Length = −5700` — a signed distance taken as a length,
which is a naming defect rather than a geometric one (§8.5), and the kind of
thing only a run surfaces.

### 26.4 Discovery on raw geometry

Two rectangles — 3700 × 3300 outside, 3000 × 2500 opening — and nothing else. `discover_model` returned, with no constraint asserted by anyone:

```text
TopSlabThickness  = 400   · 2 places · P3_PARALLEL_OFFSET · GeometricFact
WallThickness     = 350   · 2 places · P3_PARALLEL_OFFSET · GeometricFact
ClearHeight       = 2500  · 1 place  · P3_PARALLEL_OFFSET · GeometricFact
ClearSpan         = 3000  · 1 place  · P3_PARALLEL_OFFSET · GeometricFact
SquareCorner      = 90    · 8 places · P2_PERPENDICULAR   · GeometricFact
```

14 candidates, all admissible, none redundant or conflicting.

**And the caveat that shaped how it is wired:** given a steel plate with a slot, the same classifier returns `single_cell_culvert` at **0.98 confidence** and offers the slot a `ClearSpan` and the plate edge a `TopSlabThickness`. So the domain names are a **labelled proposal** beside a name read from the geometry alone, withheld below 0.9 confidence, and never applied. See §29.2.

---

## 27. Research Findings — What Was Adopted, and What Was Not

### 27.1 Design intent and the solver-as-verifier

From arXiv:2504.13178 (Autodesk Research):

- **Adopted**: the operational definition of design intent — *fully constrained, solvable, and geometrically stable under parameter sweeps* — and the solver-as-verifier loop. This is why `verify` nudges every typed value ±5% and reports what breaks.
- **Rejected**: reinforcement learning, fine-tuning and learned constraint generation. In a narrow, code-governed engineering domain, deterministic vector predicates are auditable and need no training data. A constraint a court may be asked about should not come from a weight matrix.

### 27.2 Licensing verdicts

| Library | Licence | Verdict |
| :-- | :-- | :-- |
| SolveSpace `slvs` / `py-slvs` | **GPLv3** | Banned from production — prohibits dynamic linking with proprietary software. Kept only as a development-time oracle. |
| **PlaneGCS** (FreeCAD Sketcher) | **LGPL-2.0-or-later** | Adopted. Dynamic WebAssembly linking conforms (§11.6). |
| PyMuPDF | **AGPL-3.0** | Rejected — network copyleft. Replaced with `pdfplumber` (MIT) and native vector sheet exporters. |

Enforced by `license:scan`; zero GPL/AGPL dependencies permitted.

### 27.3 The four architectural conclusions the research forced

1. **Formula-only authoring fails CAD.** Formulas are one-directional ($Y = f(X)$). A drawing requires bidirectional solving: dragging either edge must update the conjugate edge according to context. Hence the dual model (§7.1) and `drag` (§16.4).
2. **Topological invariance beats coordinate invariance.** Coordinates are transient; connectivity is permanent. Vertices meeting at a corner share **one record**, which is why joints do not tear open during a dimension edit.
3. **Detected is not confirmed.** Inference proposes with evidence and confidence; only an explicit human action or completion admits a candidate. §9.4, and §29.2 is the strongest application of it.
4. **Counts are topology, not solver variables.** Changing $N$ changes the dimensionality of the state vector, so it must happen procedurally above the solver with index-stable ids (§18.2).

### 27.4 The containment formulas the research settled

$$\text{InnerWidth} = \text{OuterWidth} - 2t, \qquad \text{InnerHeight} = \text{OuterHeight} - 2t$$
$$\text{InnerWidth} = \text{OuterWidth} - t_{\text{left}} - t_{\text{right}} \quad\text{(independently measured margins)}$$
$$\text{InnerX} = \text{OuterX} + \frac{\text{OuterWidth} - \text{InnerWidth}}{2} \iff t_{\text{left}} = t_{\text{right}}$$

The point of writing them down was never the algebra — it was that **each is a different design intent**, and the system must let an author say which one they mean rather than inferring it from one drawing.


---

## 28. Documentation vs Implementation

Where an earlier document and the code disagreed, the code won. This table records the reconciliation; §31 records the history.

| Concept | Documented in | Reality | Verdict |
| :-- | :-- | :-- | :-- |
| PlaneGCS WASM client | UPCE-MASTER §83 | Active in both repositories (Aagento since the `feature/planegcs-wasm` merge); 0.23 ms warm solve; residuals ~1e-14 in Node | **Implemented** (§11.6) |
| Pure TS LM & Dogleg | UPCE-ADDENDUM §2 | Active, exact analytical Jacobians | **Implemented** |
| Constraint Completion Assistant | Brief §4 | `lib/upce/completion.ts`, 1,810 lines, drives Author Mode | **Implemented** |
| Active dimension badges | UPCE-ADDENDUM §7 | `DimensionBadge.tsx` in 2D Canvas; in Aagento the equivalent is `upceDrives` double-click (§17.3) | **Implemented, differently in each host** |
| Rigid subgraph condensation | UPCE-ADDENDUM §4 | `lcs/componentFrame.ts`, `upce/rigid.ts` | **Implemented** |
| Centroid constraint $P10$ | UPCE-ADDENDUM §2.1 | `centroidPredicates.ts` + constraint | **Implemented** |
| Boolean wall fusion | UPCE-ADDENDUM §5 | `topology/booleanFusion.ts`, `upce/fusion.ts`, Clipper2 | **Implemented** |
| AutoCAD DXF import | `walkthrough.md`, DEC-068 | `lib/io/dxfImporter.ts` in 2D Canvas; Aagento uses its own, richer importer | **Implemented in both, not shared** |
| Port mating / repeat expander | UPCE-ADDENDUM §3, §4 | Implemented in the kernel; **unreached from Aagento** — `upce/repeat.ts` carries repeats there instead | **Unwired** (§29.2) |
| Raster GAD OCR ingestion | UPCE-MASTER Part XI | Vector DXF works; raster Hough/Tesseract vectorisation not started | **Missing** (§35) |
| "1,360 tests, 0 failures" | earlier audit revision | True of `2D Canvas`. Aagento is a different program: 809 specs, 73 pre-existing failures | **Both true; see §32** |
| "726 / 773 / 791 tests" | COMPATIBILITY_MATRIX, TEST_REPORT, FEATURE_MATRIX | Superseded snapshots of a growing suite | **Historical** (§32.2) |
| "204 migrated files" / "239 engine files" | UPCE_MIGRATION §2, §8b | Now **250** in `src/cad-engine` | **Superseded** |

---

## 29. Reachability — the Distinction That Matters Most

### 29.1 Why this is its own section

After the first integration pass, the Angular application imported seventeen kernel modules. These packages had **zero importers between them**:

| Package | What was in it | Importers |
| :-- | :-- | --: |
| `solver/` | Dogleg, Levenberg–Marquardt, 18 analytical Jacobians, SVD, pseudo-inverse | 0 |
| `upce/` | `dof.ts` (736 lines), `document.ts`, detect, completion, inverse, parameters | 0 |
| `parametric/` | constraint graph (14 types), constraint solver, variational kernel, dependency graph, Tarjan, Dulmage–Mendelsohn | 0 |
| `inference/` | candidate detection, wall and haunch discovery, semantic vocabulary, formula candidates | 0 |
| `geometry/` | relations, symbolic algebra, DCEL, predicates, metrics | 1 (`types`) |

DOF analysis, the constraint graph, the dependency graph, the detectors and the deterministic solver were **never missing**. They were unreachable — which from a user's point of view is the same thing and from a maintainer's is entirely different. A missing feature must be built. An unwired one must be *connected*, and the estimate for those two differs by an order of magnitude.

Any audit of an integrated system must answer, per module: **missing, unwired, reachable, or excluded.**

### 29.2 Current state

**86 → 106 of 250 files reachable** from the Angular application, across three passes.

**Reachable** — `upce/` (document, solve, lower, dof, detect, completion, parameters, residuals, repeat, rigid, fusion, admissibility, types), `solver/` (dogleg, LM, SVD, Jacobians, **planegcsClient**), `geometry/` (queries, predicates, metrics, lcs, topology/dcel, tolerance, relations, symbolicAlgebra), `parametric/` (variationalKernel, dependencyGraph, graph/dulmageMendelsohn, graph/bipartite, schemaTypes), `inference/` (**autonomousDiscoveryPipeline**, candidateDetector, candidateClusterer, blueprintClassifier, redundancyFilter, semanticVocabulary), `serialization/` (sketchSerializer, conformanceReporter, schema), `validation/` (**invariantChecker**), `components/`, `cad/`, `state/cadActions`, `bridge/`.

**Newly reached in the third pass**, and how:

| Module | Reached through |
| :-- | :-- |
| `inference/autonomousDiscoveryPipeline` + its cluster, classifier and filter | `ParametricWorkbenchService.discover()` → agent `discover_model`, Author Mode *"What does it already say?"* |
| `serialization/sketchSerializer`, `conformanceReporter`, `schema` | pulled in by the pipeline above |
| `validation/invariantChecker` | `ParametricWorkbenchService.invariantReport()` → inside `verify` |
| `solver/planegcsClient` | the pipeline's solver model, and the `feature/planegcs-wasm` merge (§11.6) |
| `parametric/graph/*` (Dulmage–Mendelsohn, bipartite) | the pipeline's structural analysis |
| `geometry/queries` | `GeometryQueryService` → agent `geometry_query`, Author Mode *Measure* |
| `geometry/lcs/frame`, `affineMatrix` | `LocalFrameService` |
| `upce/solve.dragPoint`, `upce/lower.liftSketchToShapes` | `ParametricWorkbenchService.drag()` → agent `drag` |

**How the domain classifier is handled.** `blueprintClassifier` is reachable and *used*, but its output is never applied. Given a steel plate with a slot it returns `single_cell_culvert` at 0.98 confidence and offers the slot a `ClearSpan`. So:

- every discovered value carries a **geometric** name derived from the predicate alone — always present, domain-neutral;
- the classifier's name is carried beside it as a **labelled suggestion**, withheld entirely below 0.9 confidence;
- **neither is applied.** A domain word enters the model only when a person or a plan put it there (§8.5).

That is how the capability is kept without the engine acquiring a bridge schema.

### 29.3 Excluded, with reasons

| Excluded | Why | What does the job instead |
| :-- | :-- | :-- |
| `lib/agent/**` (21 files) | The 2D Canvas agent's own loop, tools and workspace. The loop here is Angular's, because the tools are here. | `AgentRunnerService`, `AgentExecutorService`, `agent-tools.ts` (§20–§22). `prompt.ts` and `skills.ts` **are** imported. |
| `lib/ai/**` (8 files) | Node built-ins (`node:crypto`, `node:fs`). Type-only import keeps them out of the bundle. | the sidecar (§20.4) |
| `lib/io/**` (11 files) | Aagento's own document, command stack and DXF/PDF/SVG exporters are older and richer. | Aagento's own |
| `lib/commands/**` (4 files) | Aagento has its own AutoCAD-style command line | Aagento's own |
| `lib/state/drawingReducer`, `persistentStore`, `transactionalHistory`, `transientStore` | React state for the 2D Canvas UI | `DocumentService`, `CommandStackService` |
| `lib/cad/dxf`, `export`, `pdf`, `svgRender`, `layout`, `region` | renderers and exporters for the other host | Aagento's own |
| `lib/geometry/adapters/**`, `grips`, `hitTest`, `cadSelection`, `cadTracking` | interaction plumbing for the React canvas | `SnappingService`, `GripManagerService`, `SpatialIndexService` |
| `lib/parametric/templates/**` | Aagento's Template Mode is the template system here | `template-engine` + `ParametricBridgeService` (§24) |

### 29.4 Unwired — implemented, compiling, not yet called

| Module | What it does | Why it is not wired | Cost to wire |
| :-- | :-- | :-- | :-- |
| `parametric/component/**` (8 files) — port mating, repeat expander, shared-edge collapse, haunch preserver, composite assembly | SE(2) port composition and procedural cell arrays (§18.1–18.3) | `upce/repeat.ts` covers repeats on the path Aagento uses; port composition needs a UI for ports, which does not exist here | Medium — needs a port-authoring surface |
| `parametric/constraintGraph`, `constraintSolver`, `dualGraphOrchestrator`, `structuralLoopSolver`, `boundaryLimits`, `structuralEditing` | An older, parallel constraint pipeline | `upce/solve.ts` is the active one; two solvers on one path would be a maintenance liability, not a feature | Not recommended — see §30.2 |
| `parametric/dragSolver` | SVD drag solver with column damping | The kernel's own `upce/solve.dragPoint` is wired instead (§16.4). This is a **parallel implementation**, not a missing one. | Not recommended |
| `inference/wallDiscovery`, `wallThicknessExtractor`, `bayClusterer`, `formulaCandidateGenerator`, `integerRelation`, `dragInvarianceDetector`, `solverVerifier` | Second-order inference: bay clustering, formula candidate generation, drag-invariance detection | `autonomousDiscoveryPipeline` covers the primary path; these add formula *guessing*, which the "detected is not confirmed" rule makes expensive to expose safely | Medium — each needs a review surface |
| `upce/inverse` | The Parameter Inversion Assistant (§8.4) | Template Mode currently takes option C (refuse, name the inputs). The full three-option dialogue has no UI here. | Low — a dialog |
| `upce/derive`, `formulaCheck`, `template` | Derived-value helpers and template scaffolding | Covered by `components/evaluate` on this path | Low |
| `validation/standardsProfile` | Parameter bounds and relationship rules from a standards profile | No profile is loaded; the 9-gate bridge audit (§19.3) covers the same ground with citations | Low — needs a profile source |
| `geometry/derivedModel`, `referenceGeometry` | Derived property expressions, centreline extraction | Superseded by `geometry/queries` (§13) for the queries; the centreline extractor has no caller | Low |
| `topology/booleanFusion` | Clipper2 union and shared-web collapse | Reached only through `upce/fusion` on the component path, which Aagento does not yet exercise with overlapping solids | Low |
| `runtime/editPipeline` | The 2D Canvas edit pipeline | `ActionRouterService` is the equivalent here | Not recommended |

---

## 30. Redundant & Parallel Systems

Not everything that exists twice is redundant. Each pair below is classified, and the classification is the useful part.

| # | Pair | Class | Verdict |
| :-- | :-- | :-- | :-- |
| 1 | `template-engine` (Aagento) vs `lib/components` (kernel) | **Intentional parallel system** | Keep both. §30.1 |
| 2 | PlaneGCS WASM vs TypeScript Dogleg/LM | **Specialized implementation** | Keep both, hybrid routing. §30.2 |
| 3 | `parametric/dragSolver` vs `upce/solve.dragPoint` | **Real duplicate** | `dragPoint` is the active one; `dragSolver` should be deprecated |
| 4 | `parametric/constraintSolver` + `dualGraphOrchestrator` vs `upce/solve.ts` | **Legacy** | `upce/solve.ts` is the authority; the older pipeline is pre-UPCE |
| 5 | `parametric/model.ts` (`ParametricModel`) vs `upce/document.ts` (`regenerate`) | **Legacy** | `regenerate` is the authority; `ParametricModel` uses string switches and is kept only for older tests |
| 6 | `BUILTIN_TEMPLATES` vs `CanonicalTemplates` | **Legacy** | `CanonicalTemplates` conforms to the schema; `BUILTIN_TEMPLATES` does not |
| 7 | `parametric/connectedComponentSolver` | **Deprecated** | Applied conformal scaling (DEC-058/062). Replaced by the variational Dogleg solve. Must never return. |
| 8 | Aagento `Entity` vs kernel `Shape` | **Adapter** | Two representations, one drawing, five adapter files. §6.3 |
| 9 | Aagento bridge audit vs `validation/standardsProfile` | **Specialized implementation** | The audit cites sources and says "requires review"; the profile evaluator is generic bounds checking. Merge the rule sets eventually (§29.4) |
| 10 | Browser drafter loop vs sidecar `runDrafter` | **Legacy / specialised** | §30.3 |
| 11 | Aagento's 22-tool `AiOrchestratorService` vs the Autonomous Drafter | **Intentional parallel system** | Different jobs: one does layer and entity edits, the other constructs. Both available. |
| 12 | `lib/cad/dxf`, `pdf`, `svgRender` vs Aagento's exporters | **Adapter boundary** | Each host uses its own; the kernel's are excluded (§29.3) |

### 30.1 Why the two parametric systems were not unified

This is the most consequential "redundancy" in the system and the one most likely to be mistaken for an accident.

`template-engine` is Aagento's, older, with real users and workflows (Master Library, drafting checklist, autosave, canvas live sync, binding suggestions). `lib/components` is the kernel's constructive engine, with expressions, invariants, refuse-whole semantics and index-stable repeats.

Unifying them means rewriting working Aagento code well beyond the CAD editor. The chosen answer is a **bridge with a visible seam** (§24): Template Mode reads the kernel's model, including values named on free geometry, and *Adopt* copies them in — a copy that says it is a copy, because the two engines evaluate differently and pretending otherwise would be worse than the seam.

### 30.2 Why two solvers is not duplication

PlaneGCS has no vocabulary for the civil-specific constraints — haunch equal-leg ($P4$), centroid distance ($P10$), signed wall offsets ($P3$ with handedness). The TypeScript core has them with exact analytical Jacobians.

Routing: PlaneGCS takes standard sketch constraints (distance, parallel, coincident); the TypeScript core takes the rest. Every result is stamped with `provenance` — `planegcs_wasm`, `analytical_culvert`, `dogleg_ts`, `lm_ts` — so which solver produced a given answer is always recoverable, and the fallback is never silent.

### 30.3 The sidecar drafter

`POST /api/ai/drafter` (SSE) still runs `runDrafter` against the kernel for headless work, and `UpceDrafterService` is still its client. **Nothing in the editor's UI points at it** — the AI Agent panel uses the browser-side loop. It is kept because `scripts/` and the wire-contract test use it, not because the product needs two. It should be retired once those move.

---

## 31. Architecture Evolution

Understanding why abstractions exist requires knowing what failed. Seven phases, 139 commits in `2D Canvas` (30 Aug – 20 Sep 2026), then three integration passes in `aagento-bridge`.

| Phase | Commits | What it established |
| :-- | :-- | :-- |
| I Canvas foundation | `6bdeafd`–`cef17ed` | Vector geometry, precision snapping |
| II Early parametric DAG | `c1f4e55`–`a5af1e9` | Scalar dependency graph, on-canvas badges |
| III Closed geometry & variational solvers | `d5ea2ae`–`a686234` | DCEL planar map, Dogleg/LM, **the end of conformal scaling** |
| IV Universal protocol & studio UI | `098db59`–`6657cc1` | GEOM-RP/1, AutoCAD ergonomics |
| V UPCE authoring subsystem | `e8d7204`–`c104460` | `lib/upce/`, the Completion Assistant |
| VI FastMCP Python spike → TypeScript | `14100d6`–`9045403` | The convergence, §31.2 |
| VII Native CAD document & drafter | `3ac5947`–`f9394aa` | `lib/cad/`, constructive components, the railway drafter, the 9-gate audit |
| Integration pass 1 | `aagento-bridge` | The kernel under Angular; the component path wired |
| Integration pass 2 | ″ | The engine made **reachable** (§29.1) |
| Integration pass 3 | ″ | Queries, frames, agent runtime, discovery, the expanded toolset, PlaneGCS in the browser |

### 31.1 The five pivots

1. **Conformal scaling → variational minimum-norm** (DEC-058, DEC-062). Proportional scaling inflated walls with spans. Replaced by $\Delta X^* = -J^{+}F$ from a warm start.
2. **Redundancy → under-constraint** (DEC-048 → DEC-057 → DEC-063). Culvert drift was blamed on PlaneGCS redundancy; it was a 7-DOF under-constraint. Produced the planar rigid-body anchor rule (§3.1, rule 2).
3. **Distance-only offset → signed normal offset** (DEC-064). Distance-only allowed rotation drift; adding `parallel` caused divergence. The signed normal residual resolved both (§9.3).
4. **Out-of-process Python → in-process TypeScript** (§31.2).
5. **Global formula bar → Author Mode candidate cards** (DEC-066). A persistent bottom bar exposed formulas to draftsmen, violating persona isolation. Removed as a global surface and rebuilt as reviewable candidates.

### 31.2 The Python FastMCP decommissioning

Phase VI investigated a Python 3.12 FastMCP daemon wrapping `ezdxf`, exposing 7 MCP tools over JSON-RPC. It was deleted whole in `9045403`. Four failure modes, all of which generalise:

1. **IPC latency** — 300–800 ms per tool call; a 40-step loop spent over 30 s purely waiting.
2. **Split-brain state** — the Python side built its own geometric representation; reconciling it with the browser's DCEL and CAD document needed lossy JSON round-trips, producing coordinate jitter.
3. **It could not enforce the kernel's invariants** — Python could not evaluate the SVD admissibility gate or the Dogleg residuals, so an invalid instruction got no immediate feedback.
4. **Two package ecosystems** to maintain.

The lesson carried into the Aagento integration: **the agent's loop runs where the tools and the invariants are.** That is why the drafting loop is in the browser (§20.1) and only the model call crosses a boundary.

### 31.3 Superseded claims

Preserved here, removed from the main text:

- "204 migrated files", "239 engine files" → now **250**.
- "627 / 632 tests" in the Aagento migration notes → now **809 specs**.
- "726 / 773 / 791 tests" across the 2D Canvas audit documents → snapshots of one growing suite; the current figure, re-measured, is 1,360 (§32.2).
- "`serialization/**` and `autonomousDiscoveryPipeline` need `zod` and are unreachable" (UPCE_MIGRATION §8b) → **wrong**. `zod` is installed and the pipeline is now wired (§29.2).
- "`solver/planegcsClient` is excluded; nothing reaches it" → **superseded** by the `feature/planegcs-wasm` merge (§11.6).
- "The engine is 204 files with zero edits" → two one-word narrowing fixes (§5.2).


---

## 32. Verification & Test Evidence

Claims in this document are one of three kinds, and they are distinguished on purpose: **architectural** (this is how it is designed), **implemented** (the code does this), **verified** (this was executed and the result read back).

### 32.1 Current state

| Check | `2D Canvas` | `aagento-bridge` |
| :-- | :-- | :-- |
| Unit + integration tests | **1,360 passing, 0 failing** across 125 files, 80 s (re-run for this revision) | **812 specs: 739 passing, 73 failing**, 4 s (§32.3) |
| Production build | clean (Next.js 16 / Turbopack) | clean (`ng build`) |
| Kernel typecheck under `strict` | n/a — the whole program is strict | `engine:check` — all 250 kernel files |
| Server typecheck under `strict` | n/a | `drafter:check` — passes |
| Headless kernel invariants | — | `upce:verify` — **36/36** |
| Tolerance discipline | `lint:tolerance` — zero local constants | inherited |
| Licence scan | `license:scan` — zero GPL/AGPL | inherited |
| PlaneGCS in Node | — | `planegcs:check` — every case `planegcs_wasm`, residuals ~1e-14 |
| PlaneGCS in the browser | — | 4 specs: package present, `/planegcs.wasm` served with the WebAssembly magic number, solves with `planegcs_wasm` at residual < 1e-9, agrees with the TypeScript core to 1e-3 |
| Live agent runs | — | 2 of 2 reached `finish` (§26.2, §26.3) |
| Credential leakage | — | production bundle searched for project id, `BEGIN PRIVATE KEY`, `service_account`, `node:crypto`, `node:fs`, `node:zlib` — **nothing** |

`upce:verify`'s 36 checks include the one that matters most: **zero conformal scaling on drawn geometry** — a span change 3000 → 6000 mm leaves wall thickness exact to $10^{-6}$ mm — plus index-stable paths, refuse-whole semantics, the 9-gate audit, all 20 skills and a searchable knowledge corpus.

### 32.2 Reconciling the test counts

Earlier documents report 726, 773 and 791 for `2D Canvas`, and 593, 627 and 632 for `aagento-bridge`. These are **not contradictions**; they are snapshots of growing suites.

Both current figures were **re-run for this revision**, not copied: `bun run test` in `2D Canvas` gives 1,360 passing across 125 files in 80 s, and `ng test` in `aagento-bridge` gives 812 specs, 739 passing, 73 failing. The earlier numbers are historical (§31.3) and should not be cited.

### 32.3 The 73 Aagento failures, diagnosed

Not merely counted. `origin/dev` was merged into a clean `feature/cad-enhancement` worktree with the same four conflict resolutions and **none** of this work: 593 tests, **the same 73 failures**.

All 73 are `NG0908: In this configuration Angular requires Zone.js`. The application is zoneless (`provideZonelessChangeDetection()`, `polyfills: []`); those specs predate that switch and call `TestBed` without providing it. Every new spec added by this work passes it, which is the same one-line fix those 73 need.

They are in the bridge template suites (`WorkspaceBridgeState & GuideWall` ×23, `CulvertService` ×6, `RccPscCombinationRenderer` ×5, and assorted component-creation specs), not in the CAD editor or the kernel.

### 32.4 Bugs the verification found

Each of these was found by running the system, not by reading it — which is the argument for the live harness existing at all.

| Bug | Found by | Root cause |
| :-- | :-- | :-- |
| Undoing a moved LINE threw | unit test | `snapshotEntity` recorded `angle`, a getter-only property. Pre-existing, reachable from Move, Rotate and Mirror. |
| "Offset out" shrank a rectangle | unit test | Sides inverted and winding ignored |
| `view` rendered A0 at 300 dpi (14,043 × 9,933 px) to a vision model | live run | Plot DPI used instead of a resolved long-edge pixel budget |
| Tool counter read 0 while tools ran | live run | Totals updated only at turn end |
| A turn's prose split mid-word | live run | Gemini splits text across parts; they were pushed separately |
| The agent deleted and redrew dimensions in a loop | live run | `look` had no DIMENSION case and reported a bounding box |
| A refused formula left a broken expression in the model | unit test | The drawing rolled back; the proposal did not |
| `reshape` reported success while producing 1478 mm for a requested 900 | unit test | No verification of what it actually produced |
| Ø24 bolt holes measured 5.3% small | live run | A position tolerance used as a sagitta (§15.2) |
| A run finished with correct geometry and **no named values** | live run | Verification had no semantic completion check (§21.7) |
| A run reported "fully constrained" with 138 DOF | live run | The agent's prose was the only record (§21.8) |
| A panel 4,105 px tall inside a 280 px drawer | unit test | `.drawer-body` was a block container (§5.6) |
| Template Mode showed nothing for a drawing made of lines | unit test | `values()` walked components only (§24.2) |

---

## 33. Known Limitations

One authoritative list. Other sections reference this one.

| # | Limitation | Consequence | Status |
| :-- | :-- | :-- | :-- |
| 1 | **Production sidecar not deployed.** `environment.prod.ts` points at `https://bridge-gad-dev.aagento.ai/drafter`; the route does not exist. | The AI Agent works in development only. It says plainly that it cannot reach the drafter server rather than failing silently. | Needs deployment + `DRAFTER_ALLOWED_ORIGINS` |
| 2 | **Arcs and splines cannot be made parametric.** The kernel's free-shape vocabulary has no arc. | The lift reports them in `unsupported` and names them, rather than chord-approximating — deliberately, since an approximated arc would be parametrized as chords. The agent can *draw* arcs and splines; it cannot parametrize them. | Needs an arc in the kernel's `Shape` union, upstream |
| 3 | **`trim` and `extend` handle lines only.** | A polyline target is refused with that reason rather than partly trimmed. `IntersectionService` already covers line/arc/circle. | Known |
| 4 | **`fillet` produces a chamfer.** A polyline carries arcs as per-vertex bulges; the corner-cutting code sets vertices only. | The tool says so in its own comment rather than claiming a radius it did not draw. | Needs the bulge written |
| 5 | **Two parametric systems.** | By choice (§30.1). The bridge copies rather than unifies, and says so. | Intentional |
| 6 | **The engine-side sidecar drafter is still there.** | Two drafting paths exist; only one is used by the UI. | Retire once `scripts/` and the contract test move (§30.3) |
| 7 | **`noPropertyAccessFromIndexSignature` is off app-wide.** | A stylistic rule that cannot mask a bug; turning it off is what keeps the kernel byte-identical to upstream. | Accepted trade (§34, item 4) |
| 8 | **`strictNullChecks` is off in the Angular program**, so discriminated-union narrowing does not work there. | New Aagento-side code must use the `{ok, value?, reason?}` convention (§5.2). | Accepted; a trap for new contributors |
| 9 | **The agent's tool choice is improved but still coarse.** 68 `line` calls became 40 (§26.3.1); it now reaches for rectangle, polyline and copy, but not yet for `array` or `mirror` on a symmetric half-section. | More calls than necessary on repetitive geometry. The run still finishes, three times faster. | Improved, measured; not closed |
| 10 | **Local frames are used, but sparingly.** One frame (`bridge_axis`) on a drawing that could carry several. | Positions relative to an abutment or wingwall face are still written in world terms, so they do not follow if that face moves. | Improved, measured; not closed |
| 17 | **The parametric gate makes simple drawings slower.** The gusset plate went from 21 turns to 58 once naming was required. | The result is a model rather than a picture, which is the point — but the cost is real on small work. | Accepted; partly mitigated by the refusal fixes (§26.2) |
| 11 | **Port composition and the repeat expander are unwired in Aagento.** | Multi-cell arrays go through `upce/repeat.ts`; port mating has no authoring surface here. | Unwired (§29.4) |
| 12 | **Second-order inference is unwired.** Bay clustering, formula candidate generation, drag-invariance detection. | The primary discovery path covers the common case. Each of these needs a review surface, because "detected is not confirmed". | Unwired (§29.4) |
| 13 | **Raster GAD ingestion.** Vector DXF import works; scanned-PDF OCR vectorisation does not exist. | A scanned drawing must be traced by hand. | Missing (§35) |
| 14 | **Automated codal remediation.** The 9-gate audit flags violations with clause citations; it does not fix them. | Advisory by design — software that silently "corrects" a clause violation is worse than one that reports it. | Intentional |
| 15 | **Large repeat arrays.** Beyond ~20 cells, incremental planar arrangement on every drag frame can miss a 60 fps budget. | Noticeable only in direct manipulation of very large arrays. | Known; needs spatial bounding |
| 16 | **`dragSolver` vs `dragPoint` duplication.** | Two implementations of direct manipulation; one is wired. | Deprecate `dragSolver` (§30) |

---

## 34. Technical Debt

Distinct from §33: these are not missing capabilities but costs already incurred.

1. **Two parametric systems to keep in step** (§30.1). The bridge is one service, but every new value kind has to be representable on both sides or the copy becomes lossy.
2. **Two solvers to test** (§30.2). Real, and accepted: the alternative is losing either the civil constraints or the mature standard ones.
3. **Legacy kernel residue.** `ParametricModel`, `BUILTIN_TEMPLATES`, `connectedComponentSolver`, `dragSolver`, the older constraint pipeline — kept for backward test compatibility. Each should be deleted with its tests, not silently.
4. **`noPropertyAccessFromIndexSignature` and `strictNullChecks` disabled** (§33, items 7 and 8). The first is deliberate and cheap; the second is a genuine trap.
5. **The kernel is a vendored copy.** Byte-identical is a property worth protecting — it makes re-syncing a straight copy — but it means upstream fixes arrive manually.
6. **73 zoneless test failures** (§32.3). One line each; the reason they persist is that they are in suites nobody has had to touch.
7. **The live agent harness needs credentials, a sidecar and ~25 minutes.** It is opt-in and excluded from the build, which is right, but it means the most valuable verification is the least frequently run.
8. **Karma no-activity timeout raised to 45 minutes** app-wide, to let that harness run. Harmless, but it means a genuinely hung ordinary test takes 45 minutes to report.

---

## 35. Missing Components

Not implemented anywhere. Distinct from unwired (§29.4).

| Missing | Why it matters | Notes |
| :-- | :-- | :-- |
| **Arc in the kernel's `Shape` union** | Blocks §33, item 2 — the single most-requested parametric capability | Upstream change; affects lowering, residuals, lifting and detection |
| **Raster GAD ingestion** (Hough/Tesseract vectorisation) | A scanned drawing cannot be brought in at all | UPCE-MASTER Part XI, deferred |
| **Port-authoring surface in Aagento** | Without it, `portMatingSolver` cannot be reached (§29.4) | The kernel side exists |
| **A standards profile source** | Without one, `validation/standardsProfile` has nothing to evaluate against | The evaluator exists |
| **Bulge writing in `fillet`** | §33 #4 | Small, well-understood |
| **Polyline trim/extend** | §33 #3 | `IntersectionService` already has the maths |

---

## 36. Recommended Future Architecture

In order of value, with the reasoning rather than a wish list.

1. **Add an arc to the kernel's `Shape` union.** It unblocks parametric arcs, and arcs are in every real drawing. The largest single capability gain available.
2. **Retire the duplicates deliberately** — `dragSolver`, `ParametricModel`, `BUILTIN_TEMPLATES`, `connectedComponentSolver`, the older constraint pipeline — each with its tests, in one commit each. Legacy that nobody has decided to delete is indistinguishable from legacy that is load-bearing.
3. **Fix the 73 zoneless specs.** One line each; it removes the noise that makes every future regression harder to see.
4. **Deploy the sidecar** and set `DRAFTER_ALLOWED_ORIGINS`. The agent is development-only until then.
5. **Run the live harness on a schedule.** Every one of the bugs in §32.4's lower half was found by running it, and none by reading the code.
6. **Give second-order inference a review surface** (§29.4). The rule that detection only proposes is what makes aggressive inference safe; the missing piece is the surface, not the inference.
7. **Merge the standards profile into the 9-gate audit** so there is one compliance authority with one vocabulary for "requires review".
8. **Write the polyline bulge**, then `fillet` stops being a chamfer and polyline trim/extend become straightforward.
9. **Consider unifying the two parametric systems** — but only with a migration path for existing templates, and not before the above. The seam is honest and working; unifying for tidiness would be the wrong trade.

---

## 37. Complete System Data Flow

```text
 USER INTENT ─────────────────────────────────────────────────────────────────┐
   a brief · a reference drawing · a typed value · a dragged point            │
        │                                                                     │
        ▼                                                                     │
 AGENT PLAN  (§25.1)                                                          │
   title · values, each marked given or assumed · features in build order     │
   · checks that must hold.  Nothing is drawn before this.                    │
        │                                                                     │
        ▼                                                                     │
 REFERENCES  (§14)                                                            │
   centre lines and levels as construction geometry; a named frame on each    │
   controlling face.  Positions are written in u/v from here on.              │
        │                                                                     │
        ▼                                                                     │
 CONSTRUCTION  (§22)                                                          │
   agent intent → NATIVE_TOOL_FOR → CadAction → ActionRouterService           │
   → validation pipeline → CommandStackService → ordinary Aagento entities    │
        │                                                                     │
        ▼                                                                     │
 PARAMETERS  (§8)          ◄── discover_model (§29.2) proposes the sizes      │
   named scalars, each with role, unit, provenance, bound constraints          │
        │                                                                     │
        ▼                                                                     │
 EXPRESSIONS  (§8.3)                                                          │
   parsed to AST; dependencies from identifier nodes, never substrings        │
        │                                                                     │
        ▼                                                                     │
 DEPENDENCIES  (§10)                                                          │
   Kahn evaluation order · Tarjan cycle detection → refuse whole              │
        │                                                                     │
        ▼                                                                     │
 CONSTRAINTS  (§9)                                                            │
   21 kinds · topological references, never coordinates · signed where        │
   handedness matters · detected candidates gated by SVD (§12.3)              │
        │                                                                     │
        ▼                                                                     │
 SOLVER  (§11)                                                                │
   DM decomposition → per-block DOF · admissibility · Dogleg / LM / PlaneGCS  │
   · minimum-norm ΔX* = −J⁺F from a warm start · homotopy sub-stepping        │
        │                                                                     │
        ▼                                                                     │
 GEOMETRIC RESOLUTION  (§12)                                                  │
   DCEL planar arrangement · predicates P1–P10 · faces, nesting, voids        │
        │                                                                     │
        ▼                                                                     │
 PARAMETRIC MODEL                                                             │
   geometry + relationships + constraints + parameters + formulas + graph     │
        │                                                                     │
        ▼                                                                     │
 REGENERATION  (§16.1)                                                        │
   evaluate → resolve → warm start → absorb rigid edits → expand repeats →    │
   lower → solve → INVARIANT GATE ──── fail ──► REFUSE WHOLE, reason, rollback│
        │ pass                                                                │
        ▼                                                                     │
 ENTITY RECONCILIATION  (§16.2)                                               │
   matched by upceKey · mutated in place · ids, selection, layer, colour       │
   survive · entities appear or vanish only on real topology change            │
        │                                                                     │
        ▼                                                                     │
 AAGENTO CAD ENTITIES  (§6)                                                   │
   ordinary PolylineEntity · CircleEntity · DimensionEntity · TextEntity …    │
        │                                                                     │
        ├──► CANVAS — selected, snapped, layered, coloured                    │
        ├──► DIMENSIONS — measured from the geometry; driving ones open       │
        │                 the value they measure (§17)                        │
        ├──► ANNOTATIONS — associative: levels read heights, hatches re-trace │
        │                                                                     │
        ▼                                                                     │
 VALIDATION  (§19.3, §16.3)                                                   │
   invariant report (UPCE-MASTER §67) · 9-gate GAD audit with source citations ·            │
   "requires review" where applicability cannot be established                │
        │                                                                     │
        ▼                                                                     │
 FINAL CAD                                                                    │
   DXF · PDF sheets · SVG · native .mycad — and a model that still edits ─────┘
```

---

## 38. The Final Unified Mental Model

If only one page of this document survives, make it this one.

**There is one drawing.** `DxfFile.entities`. The parametric model sits upstream of it the way a formula sits upstream of a spreadsheet cell. Generated entities are ordinary entities — selectable, snappable, layerable, plottable, exportable — with one deliberate exception: grips are refused, because a drag that would be silently overwritten is worse than a drag that is politely declined.

**Four kinds of knowledge never share a slot.** Geometry is measured. Topology is structural. Relationships are non-directional. Semantics are human-confirmed. Every failure mode this system was built to avoid comes from collapsing two of them.

**Two mathematical systems run side by side because neither can do the other's job.** A directed scalar DAG for arithmetic that has closed-form answers; an undirected constraint graph solved simultaneously for geometry that closes loops.

**Nothing is scaled.** Of all coordinate updates that satisfy the constraints, the solver takes the smallest. Preserving an undriven wall thickness is not a rule the solver follows — it is what the minimum-norm answer *is*.

**Detection proposes; it never asserts.** Candidates carry evidence and confidence, are gated by an SVD row-space projection, and are admitted only by an explicit action. This is what lets inference be aggressive without being dangerous — and it is why a blueprint classifier that reads a steel plate as a culvert at 0.98 confidence can be kept, usefully, without ever being believed.

**Refusal is atomic and carries a reason.** An edit that breaks an invariant is rejected whole and the previous state stands. A partially applied edit is worse than a refused one, because it looks like it worked.

**Identity survives regeneration.** `upceKey` with an index-stable path means a value change *mutates* the entities rather than replacing them, so selections, manual overrides and anchored annotations survive every edit.

**The language model has zero geometric authority.** It decides what to build and which tool to reach for. Every coordinate comes from a deterministic tool or the kernel. Every action lands on the same command stack a person's action lands on.

**The agent's real constraints are budget and vocabulary, not capability.** It could always draw. What stopped it finishing was a prompt naming tools it did not have, a zoom that discarded itself, and a context that grew until the run died. Fixing those three is what made a 145-call, 24-minute GAD reach `finish`.

**Implemented is not reachable.** The most expensive misreading available in this system is to look at a directory, see a solver, and conclude it is running. Always ask which of the four it is: missing, unwired, reachable, or excluded.

**And the one an engineer should carry away:** *a tolerance is a tolerance for a question.* The 0.5 mm that correctly answers "are these the same point?" silently turns a Ø24 bolt hole into an eleven-sided polygon 5.3% short on area. Before reusing a constant, check that the new question has the same units — and the same shape.
