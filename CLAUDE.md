# CLAUDE.md — Unified Parametric CAD Engine (UPCE) Instructions & Architecture Guide

## 1. Project Overview & Primary Authority Specifications
This codebase implements the **Unified Parametric 2D CAD Engine (UPCE)** — a deterministic, 2D parametric geometry kernel and drafting environment designed for civil General Arrangement Drawings (GAD) such as RCC box culverts, balancing structures, ROB/RUB, pier caps, and retaining walls, while remaining architecturally domain-neutral.

All architectural designs, mathematical invariants, solver contracts, and behavioral requirements are strictly governed by two master specifications:
1. **`docs/audit/UNIFIED_PARAMETRIC_CAD_ENGINE_MASTER_PLAN.md` (UPCE-MASTER-1.0)** — The foundational consolidated architecture, 9-layer kernel, dual-model formulation, PlaneGCS solver contract, and GEOM-RP/1 inference protocol.
2. **`docs/audit/UNIFIED_PARAM_2.0.md` (UPCE-ADDENDUM-2.0)** — Engineering specification for dynamic cell pitch & repeat arrays, LCS rigid clusters, relative 2D line driving, active centroid constraints, and DCEL / Clipper2 topological boolean fusion.

> **CRITICAL DIRECTIVE**: ALL code changes in this repository MUST be made with respect to, and remain strictly compliant with, `UNIFIED_PARAMETRIC_CAD_ENGINE_MASTER_PLAN.md` and `UNIFIED_PARAM_2.0.md`. Never introduce ad-hoc heuristics or shortcuts that violate these specifications.

---

## 2. Core Architectural Philosophy & Non-Negotiable Invariants

### 2.1 Zero Conformal Scaling on Solve Paths (§8, §29.4, §81)
- **NEVER** apply uniform similarity or proportional scaling ($k = L_{\text{target}} / L_{\text{original}}$) to engineering geometry.
- Undriven member lengths, wall thicknesses, slab depths, haunch legs, and clearances must be strictly preserved during parameter modifications.
- Variational solves compute minimum-norm coordinate displacements ($\Delta X^* = -J^+ F$) via SVD / Dogleg / Levenberg-Marquardt from warm starts ($X_0$).
- When span changes, only the driven walls and boundary vertices translate; internal structural elements remain invariant.

### 2.2 Planar Rigid-Body Anchor Rule (§18)
- Every 2D planar mechanism requires fixing **3 degrees of freedom** (2 translation + 1 rotation) to eliminate rigid body drift.
- Fixing a single point only removes translation. Rotation must be explicitly anchored (e.g. horizontal/vertical baseline constraint) so that solver null spaces do not cause rotational drift.
- Bipartite constraint graphs and Dulmage-Mendelsohn (DM) analyses must propagate the anchor datum so that $d_{\text{anchor}} = 0$ is accurately reflected.

### 2.3 Persona Boundary Isolation (§3, §59, §64)
Mixing persona boundaries is strictly forbidden:
- **Draftsman Mode (`DraftPanel`)**: Formula exposure is **strictly zero**. No formula bars, no math expressions, no AST graphs, no synthetic names like `R1_Width`. Drafting is direct manipulation and editing interactive dimension badges with nominal numbers.
- **Author Mode (`AuthorPanel`)**: The single dedicated surface where expressions and formulas are authored (`Relationships > Formula`). Candidates are reviewed with evidence, confidence, and explicit Accept/Reject actions.
- **Project Engineer Mode (`RunPanel`)**: Driving parameters appear as clean form inputs; derived parameters are displayed as read-only values without mathematical expressions.
- **CAD Agent (`AssistantPanel`)**: Autonomous drafting assistant on the left dock (`Draw | Formulas | Ask | Review`). Its `Formulas` tab is **strictly a viewer and store** across all personas — never display formula creation forms inside CAD Agent.

### 2.4 Variable Scoping in Bidirectional Sync (`model.ts`)
- In `syncModel`, never allow inner cutouts, voids, or nested sub-shapes to fall back to global un-scoped dimensions (`Width`, `Height`, `W`, `H`).
- Inner shapes matching `/inner|cutout/i` bind exclusively to scoped variables (`InnerWidth`, `Inner_Cutout.width`, etc.).
- Template definitions must provide explicit scoped variables for each constituent shape.

### 2.5 Tolerance & Unit Discipline (§17, §84)
- All geometric tolerances MUST be injected from `TolerancePolicy` (`lib/geometry/tolerance.ts`) in model-space millimeters (`policy.geometry_mm`, `policy.weld_mm`, `policy.solver_residual`), **NEVER hardcoded and NEVER in screen pixels**.
- Enforce via linter: `bun run lint:tolerance`. Zero locally defined tolerance constants allowed.
- **Zero Shape-Type Branching**: Solver and constraint modules must not branch on `shape.type === 'rectangle' | 'circle'`. Operations must process canonical boundary loops and geometric primitives.
- **License Integrity**: Zero GPL/AGPL dependencies are permitted. Verify with `bun run license:scan`.

### 2.6 Zero LLM Geometric Authority (§2.1, §56)
- AI models/adapters (LLMs, FastMCP, CadCoder) have **STRICTLY ZERO authority** over geometric coordinates, constraints, or topology.
- Geometry is 100% deterministic and solved by mathematical solvers.
- AI adapters are restricted purely to semantic tags, friendly names, UI grouping, and natural-language explanations. AI naming patches must be reconstructed field-by-field rather than spread.

### 2.7 Two Ways to Define Geometry — Sketches and Components (decision, 2026-09-18)
Degrees-of-freedom bookkeeping (§30) is the right gate for a **free-hand sketch** a draftsman constrains, and it is kept for that. It does **not** scale to a whole bridge (thousands of coordinates), so bridge-scale geometry uses **constructive components** (`lib/components/`, UPCE-MASTER §23):
- Every coordinate in a `ComponentDefinition` is an **expression of named values** in the component's local frame (mm, Y up). Geometry is therefore fully determined by construction — a well-constrained system already in block-triangular form (§30.3) solved in closed form. There is no DOF to count; **do not add DOF gates to components or to drawings made only of components.**
- What replaces the DOF gate is what it stood for: explicit **invariants** (`InvariantDef`), plus generic checks the engine runs on every regeneration (collapsed loops, self-crossing outlines, loops turned inside out vs. the defaults = chirality §31.2, openings leaving the solid). An edit that fails is **refused whole** with the reason; nothing half-regenerates.
- Components are **data**, never renderer code: one `ComponentDefinition` format for every part and assembly, no bridge vocabulary in `evaluate.ts`. Counts are topology (repeats with index-stable ids, §23.4); composition is by placement or port attachment (§23.2). Out-of-range values are warnings (§26), never clamped. No conformal scaling — each coordinate is re-evaluated.
- Component geometry carries `componentInstanceId`. It is **never** edited by grips, modify tools, or the authoring solver (`authoredOnly()` excludes it; `APPLY_SOLVED_SHAPES` preserves it). It changes only through `CAD_SET_COMPONENT_VALUES`.

### 2.8 The CAD Document Layer (`lib/cad/`)
- `DrawingState.cad` holds layers, annotations, component instances, the bridge project record, sheets and settings; every history snapshot stores it with the shapes, so undo restores geometry, annotations and design data together.
- Tools and validators find layers by **category** (`layerIdFor(layers, "hatch")`), never by literal name — a project can load another layer standard.
- Annotations are **associative**: dimensions measure their resolved anchors (a textual override is flagged, never silently shown); level markers read the RL from the point's height (`levelAt`); hatches re-trace their boundary shapes. Heights of text/arrows are paper mm × the annotation scale.
- **One draw list** (`annotationPrims`, `shapePrims`) feeds the canvas, SVG, DXF (R12) and PDF sheets. Never compute annotation geometry a second way in a renderer.

### 2.9 Bridge Domain & Authority (`lib/bridge/`)
- The editor understands hand-drawn bridges through the **vocabulary** in `glossary.ts` (bed level, HFL, earth cushion, pier, …): `CAD_CLASSIFY` tags geometry (layer, level marker, hatch); `recognize.ts` only **proposes** roles with evidence and confidence — nothing is applied without acceptance; `drawnFacts.ts` reads levels and sizes from tagged geometry for the audit.
- Every audit rule cites a record in `sources.ts` (IRBM-2024 paras, IRCM Table 4.03). When software can compute a number but not establish that a rule applies, the result is **requires review** — never "compliant" or "safe".
- Design-basis values carry a status. The agent may enter values (`INFERRED`, `ASSUMED_FOR_DRAFT`, `PENDING_CONFIRMATION`) but **never confirm** them and never approves a drawing; template defaults are drafting aids, flagged by the audit.

### 2.10 Values: Auto, Typed, Related — and Tables (`lib/components/evaluate.ts`)
- A parameter's value comes from, in order: a **relationship** on the instance (`instance.relations`, written in Author mode or by the agent's `relationship` tool), a **typed** value, its **auto** expression (`defaultExpr`, e.g. rail level = formation + 0.762 — it follows until someone types), or its default. `ComponentEvaluation.sources` records which.
- Relationships, auto values and formulas are ordered together by their AST dependencies; a cycle, an unknown name or a broken invariant **refuses the edit whole** (`CAD_EDIT_COMPONENT_INPUTS`). A relationship may not overwrite a definition's formula; a new name becomes a reported value. Instance inputs (`customValues`) feed relationships.
- Run mode shows a related value's result and the names it follows — **never the expression** (§64). Expressions are authored only in Author mode (`features/bridge/ComponentRelationships.tsx`).
- **Tables** (`TableDef`, e.g. foundation layers) are list values; a `repeat: { table }` walks the rows, with `<T>_<col>`, `<T>_before_<col>`, `<T>_sum_<col>`, `<T>_count` in scope and text columns interpolated into notes. Hatches may pick their material per row.
- Component annotation is data too: `leaders` (text on the shelf), levels in GAD style (`style: "gad"`, `format`, water/ground symbols), dimension `prefix`/`hideValue`, rotated text (`rotate`, `along`), choice labels `{Name:label}`, `{SCALE}`.

### 2.11 Make Parametric — the Manual Route (`lib/components/fromDrawing.ts`)
- Free geometry + its dimensions, level markers and callouts → one `ComponentDefinition` stored on the drawing (`cad.definitions`, `origin.kind = "drawn"`) and an instance replacing the free entities (`CAD_MAKE_PARAMETRIC`). Generic "datum" method — levels and offsets, no bridge vocabulary in the algorithm:
  every distinct X/Y (weld tolerance from `TolerancePolicy`) is a datum; site levels are inputs; dimensions are edges taken **chain-first (Kruskal)** — an edge reaching a new datum drives it, one closing a loop is a reported **result**; widths symmetric about the centre line are split half each side; mirror-image dims share a value; a leader stating a thickness and pointing into a band that thick (or sitting on an edge that long) becomes a value, shared by the other corners of the same shape; other datums follow the nearest **structural** datum (never a water line) at a fixed offset; notes' numbers are linked to the values they state.
- The plan is evaluated before anything changes: **every vertex must come back where it was drawn** or the conversion is refused. `CAD_EXPLODE_COMPONENT` ("Edit shape", `BEDIT`) turns a component back into geometry; dimension names ride on `drives`, relationships are carried (`cad.carried` / `origin`) to the next Make parametric.
- Never special-case a structure type in `fromDrawing.ts`; improve the generic rules and cover them with a hand-drawn test.

### 2.12 Bridge Knowledge and Agent Skills
- `docs/bridge-formulas/*.txt` is the project's formula documentation (RCC box railway/highway, hume pipe, PSC slab, composite girder, OWG, glossary, cross-reference, Q&A). It is bundled into `lib/bridge/knowledge/corpus.generated.ts` by `bun run knowledge:build` (a test fails if stale) and searched by the agent's `bridge_reference` tool. It is a **reference, not a code** — rules citing it (`aagento-*` sources) say "requires review".
- Component formulas cite the ids they implement (`cites: ["RCR-LVL-002"]`); a test checks every cited id exists.
- `lib/agent/drafter/skills.ts` holds drafting playbooks (rcc-box-half-section, gad-drafting-style, make-parametric, bridge-levels, per bridge type). The prompt lists them; the agent loads one with `use_skill`. Its view (`buildScene`) renders the full draw list — hatches, leaders, level callouts, notes — so it can see whether its drawing looks like a GAD.

### 2.13 The Agent Constructs; the Library Is the Draftsman's (decision, 2026-09-19)
- The drafting agent never uses the component library: `list_components`, `component_info`, `insert_component` and `set_table` are not offered to it and are refused if called. It may not read, change or reuse a library instance a person placed. Component tools act only on drawing-owned definitions (`origin.kind = "drawn"`).
- **Plan first.** `plan` (analysis, values, relations, cross-checks, features, expected content) gates every geometry and annotation tool. The plan picks the route.
- **Construction route** (`lib/agent/drafter/construction.ts`): the agent writes its own drawing-owned `ComponentDefinition` (`drawing.agent-N`), primitive by primitive:
  - every coordinate is an expression of plan values, evaluated by the engine (typed values become parameters, relations become formulas);
  - mirror, copy, rotate, offset and polygon booleans derive new expressions from existing ones (`lib/components/symbolic.ts`); topology is fixed when the construction is made, coordinates stay parametric;
  - there is no DOF gate (§2.7).
- **Verification.** `verify` gates `finish`. It covers plan checks, the engine's geometry checks, every planned feature, and every expected dimension, level and text, measured back from the geometry. With a reference attached, `compare_reference` must run after the last change. It lives in `lib/agent/drafter/reference.ts` and does four things: decodes the PNG, builds an ink distance map, registers the drawing at two points refined by chamfer matching, and reports each entity's deviation in mm.
- Numbers on a reference that contradict each other go to `expect.disputed`, with a reason. They are never drawn to match, and they are always reported.
- **The result is a parametric model.** It is generic: no structure is known to the code. The chain is geometry → parameters (typed values) → formulas (derived values) and constraints (`plan.constraints` → invariants) → dependency graph → regenerated geometry.
  - Dimensions bind to the value they measure one for one, found by sensitivity (`bindDimensions`: ∂dimension/∂value = 1). They become driving dimensions, and a double-click on one in the canvas sets its value.
  - A relationship may rewrite a formula of a drawing-owned definition. Library formulas stay protected (`evaluate.ts`).
  - `verify` refuses typed values that drive nothing, and levels duplicated from other values (write a formula instead). It also nudges every value ±5% as Run mode would, and reports whatever breaks.
  - The plan and part tags travel in `origin.construction`, so the construction can be edited again from the drawing alone.
- The **sketch route** (`route: "sketch"`) stays for one small profile held by rules (DOF, `flex_test`, `make_parametric`).

---

## 3. Key Engine Subsystems & Mathematical Models

### 3.1 The Dual-Model Architecture (Part II & III)
UPCE maintains two complementary representations:
1. **Undirected Variational Constraint Graph**: Solved by `PlaneGCS` (WASM) and internal Levenberg-Marquardt for bidirectional geometric constraints (parallel, perpendicular, distance, tangent, angle, coincident).
2. **Directed Scalar DAG**: Maintained in `sketch.parameters` and evaluated via `evaluateParameters`. Handles explicit parametric dependencies, derived formulas, and quantities.

### 3.2 Dynamic Cell Pitch & Procedural Repeat Engine (UPCE-ADDENDUM-2.0 §3)
- Multi-cell expansion ($1 \to N$ cells) is a **procedural topology mutation handled above the solver** (`repeatExpander.ts`), never an internal solver integer variable.
- **Cell Pitch Equation**:
  $$P_{\text{cell}} = S_{\text{clear}} + t_{\text{mid}}$$
  Structural default invariant: $t_{\text{mid}} \equiv t_{\text{ext}} \implies P_{\text{cell}} = S_{\text{clear}} + t_{\text{wall\_ext}}$.
- **Total Structural Width**:
  $$W_{\text{total}} = N \cdot S_{\text{clear}} + (N - 1) \cdot t_{\text{mid}} + 2 \cdot t_{\text{ext}}$$
- **Haunch Invariant ($P4$) & Chirality Barrier**:
  Corner haunches maintain exact leg dimensions $r_{\text{leg\_h}} = \|P_w - P_c\| - h_{\text{wall}} = 0$, $r_{\text{leg\_v}} = \|P_s - P_c\| - h_{\text{slab}} = 0$.
  Chirality is guarded by an interior point barrier $\Phi_{\text{chirality}} = -\mu \ln(\text{Area}_{\text{haunch}})$ to prevent corner inversion during large span changes.
- **Homotopy Sub-stepping**: Changes $\Delta P > 500\text{ mm}$ are subdivided into sub-steps ($\lceil \Delta P / 300\text{ mm} \rceil$) to preserve path continuity.

### 3.3 Component Grouping, LCS Frames & Rigid Subgraphs (UPCE-ADDENDUM-2.0 §4)
- Components carry a 3×3 homogeneous affine frame $(\mathbf{O}, \mathbf{u}, \mathbf{v})$:
  $$\mathbf{M}_{\text{local}\to\text{world}} = \begin{bmatrix} \cos\theta & -\sin\theta & X_0 \\ \sin\theta & \cos\theta & Y_0 \\ 0 & 0 & 1 \end{bmatrix}$$
- Rigid components are condensed in the solver into **3 DOFs**: $\mathbf{q}_{\text{comp}} = [X_0, Y_0, \theta]^T$.
- External constraints against internal lines differentiate with respect to $\mathbf{q}_{\text{comp}}$, causing the entire component to translate/rotate rigidly without internal distortion.

### 3.4 Directed 2D Line-to-Line Relative Movement (UPCE-ADDENDUM-2.0 §2.2)
- Decoupled horizontal and vertical separation residuals:
  $$r_{\Delta X} = \frac{x_3 + x_4}{2} - \frac{x_1 + x_2}{2} - D_x = 0$$
  $$r_{\Delta Y} = \frac{y_3 + y_4}{2} - \frac{y_1 + y_2}{2} - D_y = 0$$
- Directed perpendicular normal offset $r_{\text{offset}} = \mathbf{n} \cdot (P_3 - P_1) - T = 0$ preserves anisotropic thickness across arbitrary angles.

### 3.5 Active Centroid-to-Centroid Constraints ($P10$) (UPCE-ADDENDUM-2.0 §2.1)
- First-class analytical constraint driving the solver using exact shoelace area and moment partial derivatives ($\partial C_x / \partial X_j, \partial C_y / \partial X_j$).
- Decreasing centroid distance dynamically pulls shapes closer along the active Jacobian gradient.

### 3.6 Topological Boolean Fusion & Shared Web Collapse (UPCE-ADDENDUM-2.0 §5)
- Continuous broad-phase interference via R-Tree (`Flatbush`).
- When shapes overlap ($x' \le x$), Clipper2 executes Boolean Union to merge concrete solids.
- Boundary edges within $\varepsilon_{\text{weld}} = 0.5\text{ mm}$ collapse into a single intermediate web with thickness $t_{\text{mid}} = t_1 + t_2 - \text{overlap}$.
- Reconstructs planar DCEL half-edge map with proper interior void nesting.

---

## 4. Codebase Directory Structure & Key Modules

```
├── app/                        # Next.js 16 App Router pages and API routes
│   ├── api/ai/agent/           # Legacy CadAgent endpoint (test/CLI only)
│   ├── api/ai/drafter/         # Drafting agent endpoint (SSE)
│   ├── api/v1/templates/       # Template instantiation & rendering APIs
│   └── page.tsx                # Main canvas CAD workstation interface
├── features/                   # UI presentation and interaction layer
│   ├── canvas/                 # 2D Canvas renderer, grips, direct manipulation
│   │   ├── DimensionBadge.tsx  # Interactive dimension badge (Display -> Edit -> Commit)
│   │   ├── CanvasOverlay.tsx   # Constraints, DOF status, and grip rendering
│   │   └── Viewport.tsx        # Pan/zoom camera transform
│   ├── bridge/                 # Component catalog, values form (auto/related/tables), Author relationships, Make parametric dialog, sheet preview, "What is this?" UI
│   ├── canvas/tools/           # Interactive annotation + modify tools (TEXT, DIM*, LEVEL, HATCH, OFFSET, TRIM…)
│   ├── panels/                 # Persona panels and docks (+ BridgePanel, LayerPanel)
│   │   ├── DraftPanel.tsx      # Draftsman Mode (zero formulas, nominal inputs)
│   │   ├── AuthorPanel.tsx     # Template Author Mode (formulas, candidates, DAG)
│   │   ├── RunPanel.tsx        # Project Engineer Mode (driving parameter form)
│   │   ├── FormulasPanel.tsx   # Dedicated Formulas store/viewer across all personas
│   │   └── AssistantPanel.tsx  # CAD Agent dock (Draw | Formulas | Ask | Review)
│   └── shell/                  # Top bar, persona switcher, dock containers
├── lib/                        # Core engineering logic & UPCE kernel
│   ├── upce/                   # Core UPCE data types, parameter DAG, formulaCheck
│   ├── parametric/             # Variational solver, PlaneGCS adapter, constraints
│   │   ├── constraints/        # Centroid, relative line, distance, angle constraints
│   │   ├── component/          # repeatExpander.ts, haunchPreserver.ts, LCS frames
│   │   └── dragSolver.ts       # SVD minimum-norm solver & column damping
│   ├── geometry/               # Primitives, predicates (P1–P10), tolerance.ts, DCEL
│   ├── topology/               # booleanFusion.ts (Clipper2 union & web collapse)
│   ├── agent/drafter/          # The drafting agent: workspace, tools, CAD tools (cadTools.ts), construction.ts (plan/construct/verify), reference.ts (compare with the reference image), skills.ts, loop, prompt
│   ├── cad/                    # CAD document: layers, annotations, draw list, hatch, modify ops, sheets, DXF/SVG/PDF
│   ├── components/             # Constructive component engine + library (library/*.ts are DATA); fromDrawing.ts = Make parametric
│   ├── bridge/                 # Railway domain: glossary, recognition, drawn facts, project/DBR, sources, audit; knowledge/ = formula docs search
│   └── state/cadActions.ts     # Reducer logic for the CAD document (shared by editor and agent)
├── tests/                      # Verification test suites
│   ├── unit/                   # Unit tests (cell repeat, formulas tab, predicates)
│   ├── integration/            # Multi-cell solver, FastMCP, agentic loop, CAD coder
│   └── fixtures/               # Reference DXF, JSON GAD benchmarks
├── scripts/                    # CI linting & audit scripts; build-bridge-knowledge.ts; dev/ (render a component to SVG/PNG, round-trip, agent view)
│   ├── lint-tolerance.ts       # Enforces model-space tolerance discipline
│   └── license-scan.ts         # Scans dependencies for banned GPL/AGPL licenses
├── docs/bridge-formulas/       # Project bridge formula documentation (source of lib/bridge/knowledge)
├── docs/guides/                # How-tos (rcc-box-half-section.md: component, hand-drawn, agent, relationships)
└── docs/audit/                 # Master specifications (UPCE-MASTER-1.0, UPCE-ADDENDUM-2.0)
```

---

## 5. Development Norms & Command Reference

### 5.1 Package & Python Tool Management
- **JavaScript/TypeScript**: Exclusively use `bun`. Never use `npm`, `yarn`, or `pnpm`.
- **Python**: Exclusively use `uv` (`uv run`, `uv sync`). Never invoke system/global Python directly.

### 5.2 Required Verification Commands
Before submitting any code change, ALL of the following commands must execute cleanly:

```bash
# 1. Run all unit and integration tests (1100+ tests, vitest — NOT `bun test`)
bun run test

# 2. Verify tolerance injection discipline (zero local tolerance constants)
bun run lint:tolerance

# 3. Verify dependency licenses (zero GPL/AGPL packages)
bun run license:scan

# 4. Production build verification (Next.js 16 Turbopack)
bun run build

# After editing docs/bridge-formulas: regenerate the agent's knowledge bundle
bun run knowledge:build

# See a component as it will plot (white paper) — dev helpers
bun run scripts/dev/render-component.ts ir.rcc_box.half_section /tmp/v.svg Name=value …
bun run scripts/dev/svg-to-png.ts /tmp/v.svg /tmp/v.png 1800
```

### 5.3 Next.js 16 Architectural Conventions
- This repository uses Next.js 16.3+ App Router with Turbopack.
- Always consult `node_modules/next/dist/docs/` for updated APIs.
- Keep agent configuration blocks clean and do not break Next.js server/client component boundaries (`"use client"` directive required for interactive canvas components).

---

## 6. Pre-flight & Post-flight Checklist for All Changes

1. [ ] **Conformal Scaling Check**: Did you introduce any proportional scale factor $k$? If yes, REJECT. Use variational minimum-norm displacement.
2. [ ] **Tolerance Policy Check**: Did you hardcode any `const EPSILON = 0.01` or pixel tolerance? If yes, REJECT. Inject from `TolerancePolicy`.
3. [ ] **Persona Isolation Check**: Did you expose a formula or synthetic parameter name to Draftsman Mode or CAD Agent dock? If yes, REJECT.
4. [ ] **Rigid-Body Anchor Check**: Does the planar sketch fix 3 DOFs (2 translation + 1 rotation)?
5. [ ] **Inner Void Scoping Check**: In `syncModel`, do inner shapes bind to scoped variables rather than global width/height?
6. [ ] **Test Integrity**: Did all tests in `bun test` pass? Are new capabilities accompanied by comprehensive integration tests?
7. [ ] **Lint & License Clean**: Did `bun run lint:tolerance` and `bun run license:scan` pass with 0 errors?
8. [ ] **Components are data**: New or changed component definitions use expressions only, declare invariants, and are covered by a test (defaults evaluate with no errors; unique entity ids). No bridge vocabulary in the engine.
9. [ ] **Rules cite sources**: Every new audit rule names a `sources.ts` record and says "requires review" where applicability cannot be established.
10. [ ] **One draw list**: Canvas, SVG, DXF and PDF output of any annotation come from `annotationPrims`.
11. [ ] **Formulas never reach Run mode**: relationships and auto values show results and the names they follow, not expressions.
12. [ ] **Make parametric stays generic**: no structure-specific branches in `fromDrawing.ts`; the self-check (every vertex reproduced) still passes.
13. [ ] **Knowledge in sync**: after editing `docs/bridge-formulas`, `bun run knowledge:build`; formula `cites` ids exist.
