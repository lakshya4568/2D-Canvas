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
│   ├── api/ai/agent/           # FastMCP / CadAgent streaming endpoint (SSE)
│   ├── api/ai/drafter/         # Deterministic Drafter agent endpoint
│   ├── api/ai/cadcoder/        # CadCoder uv/python CadQuery bridge
│   ├── api/v1/templates/       # Template instantiation & rendering APIs
│   └── page.tsx                # Main canvas CAD workstation interface
├── features/                   # UI presentation and interaction layer
│   ├── canvas/                 # 2D Canvas renderer, grips, direct manipulation
│   │   ├── DimensionBadge.tsx  # Interactive dimension badge (Display -> Edit -> Commit)
│   │   ├── CanvasOverlay.tsx   # Constraints, DOF status, and grip rendering
│   │   └── Viewport.tsx        # Pan/zoom camera transform
│   ├── panels/                 # Persona panels and docks
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
│   ├── agent/                  # CAD Agent, drafter workspace, FastMCP server bridge
│   └── dxf/                    # DXF R2010 DIMENSION entity parser and exporter
├── tests/                      # Verification test suites
│   ├── unit/                   # Unit tests (cell repeat, formulas tab, predicates)
│   ├── integration/            # Multi-cell solver, FastMCP, agentic loop, CAD coder
│   └── fixtures/               # Reference DXF, JSON GAD benchmarks
├── scripts/                    # CI linting & audit scripts
│   ├── lint-tolerance.ts       # Enforces model-space tolerance discipline
│   └── license-scan.ts         # Scans dependencies for banned GPL/AGPL licenses
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
# 1. Run all unit and integration tests (1000+ tests)
bun test

# 2. Verify tolerance injection discipline (zero local tolerance constants)
bun run lint:tolerance

# 3. Verify dependency licenses (zero GPL/AGPL packages)
bun run license:scan

# 4. Production build verification (Next.js 16 Turbopack)
bun run build
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
