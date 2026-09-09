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

# 2. Run test suite (180+ tests passing 100%)
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

## 🧪 Unit Testing

Run the Vitest test suite with:
```bash
bun run test
```

49 unit tests verify:
- **Expression Engine**: Tokenizer, precedence, math functions (`sqrt`, `sin`, `cos`, `hypot`), syntax error reporting, division by zero handling.
- **Dependency Graph**: Topological sorting, downstream dirty propagation, cycle detection.
- **Constraint Solver**: Horizontal, vertical, parallel, concentric, conflicting constraint detection.
- **Bidirectional Model**: Variable-to-geometry propagation ($W = 400 \to H = W$), inner/outer rectangle synchronization.
- **CAD Templates**: Parametric generation and parameter override testing.
- **Geometry & Reducer**: Normalization, hit-testing, zoom invariants, history stack.
