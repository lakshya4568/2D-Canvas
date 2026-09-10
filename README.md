# 2D Canvas Studio — Parametric 2D CAD & Geometric Constraint Engine

> **A precision web-based Parametric 2D Vector CAD & Constraint-Driven Geometry Workspace built with Next.js 16 (App Router), Bun, React 19, TypeScript, Tailwind CSS v4, Motion, and Raw SVG DOM with Zero External Drawing Libraries.**

---

## 🚀 Quick Start

### Prerequisites
- **Bun 1.3+** (recommended) or **Node.js 20+** with npm 10+.

### Build Environment & Dependency Resolution
If installing via npm in certain sandboxes, npm Arborist may fail with:
`TypeError: Cannot read properties of null (reading 'edgesOut')`
due to peer-dependency resolution between React 19, Next 16, and Vite 6.
To resolve:
```bash
# Recommended: Use Bun (fast, zero-conflict)
bun install

# Alternative: Use npm with legacy peer deps
npm install --legacy-peer-deps
```

### Installation & Development
```bash
# 1. Install dependencies
bun install

# 2. Run test suite (723 tests across 78 files, 0 failures)
bun test

# 3. Launch local development server
bun --bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
bun run build
bun run start
```

---

## 🏛 Architecture & Engineering Philosophy

This application strictly adheres to the core requirement: **Zero canvas-rendering libraries** (no Konva, Fabric.js, Paper.js, Two.js, or p5.js). The entire rendering engine is built directly on native browser **SVG DOM**, utilizing mathematical coordinate projections, browser-native transformation matrices, pure geometry calculations, and an integrated **parametric constraint solver**.

### Clean Layered Separation
```
├── lib/
│   ├── geometry/           # 100% PURE mathematical functions (zero DOM/React imports)
│   │   ├── types.ts        # Source of truth for points, shapes, metrics, viewports, snapping
│   │   ├── metrics.ts      # Line length/angle, Rect/Circle/Ellipse/Polygon/Star generators & centroids
│   │   ├── hitTest.ts      # Analytical point-to-segment distance, ray-casting polygon testing & rotation transforms
│   │   ├── transform.ts    # Screen-to-SVG CTM transforms & cursor-anchored zoom math
│   │   └── snapping.ts     # CAD-grade coordinate snapping: Endpoints, Corners, Midpoints, Centroids, Edges, Intersections, Perpendiculars
│   ├── parametric/         # Parametric Modeling & Constraint Engine
│   │   ├── expression.ts   # Lexer, AST Parser & Evaluator with math functions (sqrt, sin, cos, tan, hypot, pow)
│   │   ├── dependencyGraph.ts # DAG dependency graph, cycle detection, topological sorting & dirty propagation
│   │   ├── constraints.ts  # Geometric constraints (horizontal, vertical, parallel, perpendicular, concentric, etc.) & relaxation solver
│   │   ├── model.ts        # Parametric shape bindings, symbol table manager, and bidirectional canvas sync
│   │   └── templates.ts    # Parametric CAD template system & preset library (Dual-wall Frame, Tube, Flange)
│   ├── serialization/      # Lossless vector data import / export
│   │   ├── schema.ts       # Strict Zod schemas validating document payloads (all 7 shape types)
│   │   ├── exportJson.ts   # ID-stripped specification-compliant JSON serializer
│   │   ├── importJson.ts   # Safe JSON parser with runtime error reporting
│   │   ├── exportSvg.ts    # Standalone clean SVG XML vector exporter
│   │   └── exportPng.ts    # 2x high-DPI offscreen SVG-to-Canvas rasterization
│   └── state/              # Immutable state & history management
│       ├── drawingReducer.ts # Pure reducer with 100-level past/present/future history stack & parametric actions
│       └── drawingContext.tsx# React context provider and hook
├── features/
│   ├── canvas/             # SVG Canvas & Layered Rendering Pipeline
│   │   ├── DrawingCanvas.tsx    # Interactive SVG surface with pointer capture & gesture management
│   │   ├── ShapeRenderer.tsx    # Memoized committed shapes with pass-through hollow drawing
│   │   ├── DraftPreview.tsx     # High-contrast live dashed preview for all shape primitives
│   │   ├── SelectionOverlay.tsx # Figma-style 8-handle bounding box, top rotation handle & 15° snap
│   │   ├── ConstraintOverlays.tsx # Canvas visual glyphs for active constraints (H, V, //, ⟂, ◎)
│   │   ├── DimensionBadge.tsx   # Floating dimension badges (live & persistent)
│   │   ├── GridLayer.tsx        # Viewport-aware scalable CAD grid
│   │   └── SnapIndicator.tsx    # Magnetic snap target badge & orthogonal alignment guides
│   ├── parametric/         # Parametric UI Panels & Editors
│   │   ├── VariablesPanel.tsx   # Variable creation, value/formula inputs, and dependency badges
│   │   ├── FormulaEditor.tsx    # Expression editor with syntax check, function shortcuts & live validation
│   │   ├── ConstraintsPanel.tsx # Geometric constraint manager with conflict detection & enable/disable
│   │   ├── TemplateModal.tsx    # Reusable CAD template browser, parameter sliders & instant instantiator
│   │   └── BottomFormulaBar.tsx # Quick command bar at bottom of canvas (e.g. W = 400, H = W * 0.5)
│   ├── toolbar/            # Toolbars (Collapsible CAD tools, Viewport, Undo/Redo, Footer Export)
│   ├── inspector/          # Collapsible Property Inspector with Transform, Parametric, Style, Layers, and History tabs
│   ├── statusbar/          # Real-time coordinate readout (X, Y), counters, and embedded Export menu
│   └── theme/              # Light / Dark mode toggle
└── tests/                  # Exhaustive Vitest unit test suite (49 tests passing 100%)
```

---

## 📐 Parametric Architecture & Mathematics

### 1. Expression System & AST Evaluation
Mathematical formulas are tokenized into an AST (Abstract Syntax Tree) supporting standard precedence:
- Operators: `+`, `-`, `*`, `/`, `^` (exponentiation), `%` (modulo), unary `-`.
- Functions: `sqrt()`, `sin()`, `cos()`, `tan()`, `asin()`, `acos()`, `atan()`, `atan2()`, `abs()`, `min()`, `max()`, `round()`, `floor()`, `ceil()`, `hypot()`, `pow()`.
- Variables & Properties: Identifiers such as `W`, `H`, `Rectangle_1.width`, `Line_1.length`, `Circle_1.r`.

### 2. Dependency Graph (DAG) & Forward Propagation
The system tracks forward and backward dependencies between variables, formulas, constraints, and geometry:
$$\text{Variables} \longrightarrow \text{Formulas} \longrightarrow \text{Constraints} \longrightarrow \text{Geometry}$$
- **Cycle Detection**: Detects circular definitions ($A \to B \to A$) and reports diagnostic paths without locking the browser.
- **Topological Sorting**: Evaluates dependencies in topological order so changing `Width` cascades automatically:
  $$\text{Width} \longrightarrow \text{Height} = \text{Width} \longrightarrow \text{InnerWidth} = \text{Width} \times 0.8 \longrightarrow \text{Geometry}$$

### 3. Geometric Constraint Solver
Supports common CAD-style constraints solved via relaxation projections:
- **Horizontal**: $y_1 = y_2$
- **Vertical**: $x_1 = x_2$
- **Parallel**: $(y_2 - y_1)(x_4 - x_3) - (y_4 - y_3)(x_2 - x_1) = 0$
- **Perpendicular**: $(x_2 - x_1)(x_4 - x_3) + (y_2 - y_1)(y_4 - y_3) = 0$
- **Equal Length**: $L_1 = L_2$
- **Fixed Length**: $L = L_0$
- **Concentric**: $cx_1 = cx_2, \quad cy_1 = cy_2$
- **Aspect Ratio**: $H = W / k$

### 4. Bidirectional Canvas Synchronization
- **Canvas Drag $\to$ Parameters**: Moving a shape updates its exposed parameter values.
- **Parameter Edit $\to$ Canvas**: Changing `W = 400` in the Variables Panel or Quick Formula Bar re-evaluates all dependent formulas and updates shape dimensions on canvas.

---

## 🎨 Feature Matrix

| Feature | Description | Status |
|---|---|:---:|
| **Parametric Variables** | Define variables ($W, H, L1$) controlling shape geometry dynamically | ✅ Complete |
| **Mathematical Formulas** | Formula parser supporting arithmetic, trigonometry, and function calls | ✅ Complete |
| **Dependency Graph** | DAG evaluation order with cycle detection and cascading updates | ✅ Complete |
| **Geometric Constraints** | Horizontal, Vertical, Parallel, Perpendicular, Equal Length, Concentric, Aspect Ratio | ✅ Complete |
| **Constraint Canvas Glyphs** | Live visual markers on canvas ($H, V, //, \perp, \text{concentric}$) | ✅ Complete |
| **CAD Template System** | Reusable parametric models (Dual-wall Frame, Tube Profile, Concentric Flange) | ✅ Complete |
| **Quick Formula Bar** | Bottom expression bar matching engineering notebook sketch (`x = 40, y = x/2`) | ✅ Complete |
| **7 Vector Shape Tools** | Line, Arrow, Rectangle, Circle, Ellipse, Polygon/Triangle, Star | ✅ Complete |
| **Live Dimensions** | Real-time length + angle, width × height, radius, diameter updating with cursor | ✅ Complete |
| **Figma-Style Selection** | 8 corner/edge resize handles, top rotation stem, 15° Shift-snap, marquee box select | ✅ Complete |
| **Multi-Object Grouping** | Group (`Ctrl+G`), Ungroup (`Ctrl+Shift+G`), and unified multi-object move/rotate | ✅ Complete |
| **CAD Snapping Engine** | Rotation-aware magnetic snapping: `ENDPOINT`, `CORNER`, `MIDPOINT`, `CENTROID`, `EDGE`, `INTERSECTION`, `PERPENDICULAR`, `GRID` | ✅ Complete |
| **Pass-Through Hollow Drawing** | Draw inside, across, or from within hollow shapes without blocking | ✅ Complete |
| **Embedded Footer Export** | Export PNG (2x retina), SVG Vector, JSON Schema directly in footer bar | ✅ Complete |
| **Full Undo / Redo** | Immutable 100-step history stack (`Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`) | ✅ Complete |

---

## 🧪 Testing

```bash
bun test                  # full suite: 723 tests / 78 files / 7,291 assertions
bun x tsc --noEmit        # typecheck
bun run lint:tolerance    # §17 tolerance discipline — FAILS the build on a violation
bun run license:scan      # §84 GPL/AGPL ban list — FAILS the build on a hit
```

The suite covers the §75 taxonomy against the §74 fixture library:

- **Predicates** — one file per predicate P1–P9, plus rotation-invariance property tests at 0°/15°/37°/45°.
- **Topology** — Euler characteristic `V − E + F = 1 + C`, half-edge twin pairing, cycle continuity, zero disconnected joints, and face-closure, swept across **every** fixture in `fixtures/{basic,civil,difficult}` (`dcel_euler_sweep.test.ts`).
- **Solver** — analytical Jacobians cross-checked against finite differences, LM gain-ratio convergence, Dogleg trust region, SVD pseudo-inverse, drag damping.
- **Branch control** — homotopy sub-stepping, chirality/degeneracy barriers, Bentley–Ottmann self-intersection, κ(J) clamping.
- **DOF** — Dulmage–Mendelsohn partition, per-component DOF, redundant-vs-conflicting by residual.
- **Inference** — clustering, SVD admissibility, integer relations (bounded search / PSLQ / LLL), the four §49.4 formula gates, drag-invariance, solver-as-verifier.
- **Runtime** — the thirteen-step edit pipeline and its all-or-nothing transaction boundary.
- **Export** — DXF (R2010/R12), PDF sheets, canonical SVG, the REST contract, and the `gad-render` CLI.
- **Gates** — `gate_g0` … `gate_g10`, one suite per roadmap gate.

### CLI

```bash
bun run scripts/gad-render.ts --list
bun run scripts/gad-render.ts --template single_cell_box_culvert \
    --set clear_span=350 --format dxf --dxf-version R2010 --out culvert.dxf
```

### REST

```
GET  /api/v1/templates?query=
POST /api/v1/templates/{id}/instantiate   { params }
POST /api/v1/templates/{id}/render        { params, format, dxfVersion }
```

The CLI, the REST routes, and the browser all call the same `RenderService`, so a
server-rendered drawing and a client-rendered one cannot diverge (§69).

## 🖥 The three modes

The UI is built around §3's three personas, and the right dock's contents swap
**wholesale** between them — three products sharing one kernel, not one panel with
widgets greyed out.

| Mode | Who | Sees | Never sees |
|---|---|---|---|
| **Draft** | Draftsman, daily | Dimensions of the selection, editable by typing; CAD grips on the sheet | Any formula, expression, dependency graph, or synthetic name |
| **Author** | Specialist, occasional | Candidate cards with measured evidence + confidence; Accept / Reject; full DM partition; expressions | — |
| **Run** | Project engineer, per project | DRIVING inputs grouped by role; DERIVED results read-only; standards advisories citing the clause | Constraints, the DCEL, a Jacobian, a formula DAG, PlaneGCS |

### Where the AutoFormula tab went

The capability is essential and stays. The old persistent bottom bar was in the
wrong place: §3 forbids a formula bar to the draftsman outright, and §64 forbids
it to the project engineer, so a bar docked across the bottom was visible to two
personas that must never see one.

It now lives in the **Author dock** as the candidate review surface §62 actually
specifies. Each card carries its evidence, provenance and confidence (§47: "every
proposal is explainable"), and nothing is applied until you press Accept (§46:
"inference produces candidates, never silent commitments").

§3's corollary is why the capability could not simply be deleted:

> "Removing formulas from the *draftsman's view* is correct. Removing formulas
> from the *system* is not... The goal is **hidden and curated complexity, not
> absent complexity**."

## ⚠️ Known Defects

Recorded so the status claim stays honest. Pinned by tests; see `DECISIONS.md`
(DEC-057, DEC-063, DEC-064) and `CONFORMANCE.md` §5.

**The autonomous discovery pipeline under-constrains.** A purely horizontal edit
(`ClearSpan` 2000 → 3500) drifts the overall height by ~213 mm while reporting
`converged = true` at residual 9e-13 — §5's caveat made concrete: "a sketch can
solve cleanly, report DOF = 0, and still encode the wrong intent."

The cause is now precisely located. §22's compilation table says an `offset` is
"not native — compiles to **Parallel + equal perpendicular distance**", but only
the distance half is emitted, so each offset contributes one equation instead of
two. Both §22-correct formulations were implemented and measured, and **both
diverge** against the current PlaneGCS mapping (residual 1.0 and 21 respectively);
homotopy sub-stepping made the drift worse. All three were reverted rather than
shipped — a non-converging solver is worse than a drifting one.

The next task is specific: a **signed** point-to-line residual (or a native offset
primitive) in `planegcsClient.ts`, then raise `equationCountFor` for P3 to 2 in
the same change.

**Fixed since the last release:** conformal similarity scaling is gone from the
solve path (DEC-062) and the §18 anchor rule now reaches the DOF analysis
(DEC-063) — which raised the reported DOF from 7 to 10, because the unanchored
report had been discounting three rigid-body DOF the sketch never had free.

## 🛠 Build Environment

`npm install` can fail in sandboxes with:

```
TypeError: Cannot read properties of null (reading 'edgesOut')
    at Arborist.buildDepStep
```

This is an npm Arborist lockfile bug arising from peer-dependency conflicts
across React 19 typings, Vite 6, and Vitest — not a source defect. Use **Bun**
(recommended) or `npm install --legacy-peer-deps`.
