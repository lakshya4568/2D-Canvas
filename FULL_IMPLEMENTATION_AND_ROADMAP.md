# 2D Canvas Studio — Parametric 2D CAD Engine
## Full Implementation Architecture, Mathematical R&D, and Strategic Capability Roadmap

---

## 1. Executive Summary & Core Philosophy

**2D Canvas Studio** is an industrial-grade, web-based Parametric 2D Vector Computer-Aided Design (CAD) and Geometric Constraint Modeling Engine. It transforms raw 2D sketching into an intelligent, constraint-aware, topological geometry system.

### Core Architectural Invariants:
1. **Zero External Drawing Libraries**: The engine operates purely on native SVG DOM and TypeScript mathematical kernels. No Konva, Fabric.js, Paper.js, Two.js, or p5.js.
2. **Topological Coincident Joint Invariant**: *"Shared vertices move together."* In a valid CAD sketch, dimensions do not mutate line endpoints into arbitrary empty space. Touching endpoints represent unified topological joints; modifying any connected dimension automatically updates the entire connected assembly without breaking joints or leaving lines hanging in mid-air.
3. **Bidirectional Parametric Reactivity**: Changes flow seamlessly in both directions:
   $$\text{Interactive Canvas Drag} \longleftrightarrow \text{Topological Graph} \longleftrightarrow \text{Variables \& Formulas} \longleftrightarrow \text{Constraint Solver}$$
4. **Local Coordinate System (LCS) Independence**: Geometric objects can be evaluated either globally or within their own relative coordinate frames, preserving orientation, translation, and hierarchical inheritance.

---

## 2. System Architecture & Subsystem Decomposition

```
├── lib/
│   ├── geometry/                  # Pure Mathematical Kernels (Zero React/DOM imports)
│   │   ├── types.ts               # Canonical data models (Point, Shape, Viewport, SnapResult)
│   │   ├── metrics.ts             # Shape metrics, bounding boxes, polygon generators, centroids
│   │   ├── hitTest.ts             # Analytical point-to-segment distance, ray-casting containment
│   │   ├── transform.ts           # Screen-to-SVG CTM affine projections & cursor-anchored zooming
│   │   ├── snapping.ts            # CAD magnetic snapping (Endpoints, Midpoints, Intersections, Grid)
│   │   └── chamferReference.ts    # Smart diagonal angle filtering, tangent projection & reference extents
│   ├── parametric/                # Parametric Engine & Numerical Solvers
│   │   ├── expression.ts          # Lexer, AST Parser & Recursive Evaluator for math functions
│   │   ├── dependencyGraph.ts     # Directed Acyclic Graph (DAG) with cycle detection & topological sort
│   │   ├── transform2d.ts         # 3x3 Homogeneous Affine Transformation Matrices & Local Frames
│   │   ├── geometryObject.ts      # Object-level Local Coordinate Systems & relative placement
│   │   ├── solver.ts              # Hierarchical LCS tree solver
│   │   ├── constraintGraph.ts     # Bipartite Degree-of-Freedom (DOF) Analysis Graph
│   │   ├── constraintSolver.ts    # Gauss-Newton / Levenberg-Marquardt Least-Squares Relaxation
│   │   ├── closedGeometry.ts      # Shoelace area, Polygon Centroids, Cycle Traversals
│   │   ├── structuralLoopSolver.ts # Strict Coincident Joint Closure & Residual Distribution
│   │   ├── connectedComponentSolver.ts # Universal Connected Component Graph Solver for Arbitrary Networks
│   │   ├── model.ts               # Parametric Model Orchestrator & Bidirectional State Syncer
│   │   ├── constructionGeometry.ts# Virtual reference axes, pitch circles, and construction lines
│   │   └── templates.ts           # Reusable CAD templates (Dual-wall Frame, Tube, Flange)
│   ├── state/                     # Immutable State Machine
│   │   ├── drawingReducer.ts      # Pure Reducer with 100-step Undo/Redo & Parametric Dispatchers
│   │   └── drawingContext.tsx     # High-performance React 19 Context Provider
│   └── serialization/             # Lossless Import / Export Pipeline
│       ├── schema.ts              # Strict Zod schemas for all 7 shape primitives
│       ├── exportJson.ts          # Specification-compliant, ID-stripped JSON exporter
│       ├── importJson.ts          # Safe JSON document parser with runtime error reporting
│       ├── exportSvg.ts           # Clean, standalone, production-ready SVG XML exporter
│       └── exportPng.ts           # 2x High-DPI offscreen rasterization
└── features/                      # Visual Presentation Layer
    ├── canvas/                    # Native SVG Surface & Overlays (Drawing, Handles, Badges, Snapping)
    ├── parametric/                # Variables Panel, Formula Editor, Quick Formula Bar
    ├── inspector/                 # Property Inspector (Transform, Style, Layers, Constraints)
    └── toolbar/                   # CAD Toolbars & Viewport Controls
```

---

## 3. Mathematical R&D Foundations & Analytical Formulas

### 3.1. Affine Transformations & Local Coordinate Systems (LCS)
Every geometric entity is defined either in World Space $\mathbf{P}_w = (x_w, y_w, 1)^T$ or within a Local Frame $\mathcal{F}_{\text{local}} = (\mathbf{O}, \mathbf{u}, \mathbf{v})$ via a $3 \times 3$ homogeneous affine transformation matrix:

$$\mathbf{M}_{\text{local} \to \text{world}} = \begin{bmatrix} \cos\theta & -\sin\theta & x_0 \\ \sin\theta & \cos\theta & y_0 \\ 0 & 0 & 1 \end{bmatrix}$$

- **Forward Projection**: $\mathbf{P}_w = \mathbf{M} \cdot \mathbf{P}_l$
- **Inverse Projection**: $\mathbf{P}_l = \mathbf{M}^{-1} \cdot \mathbf{P}_w$, where $\mathbf{M}^{-1} = \begin{bmatrix} \cos\theta & \sin\theta & -(x_0\cos\theta + y_0\sin\theta) \\ -\sin\theta & \cos\theta & -(-x_0\sin\theta + y_0\cos\theta) \\ 0 & 0 & 1 \end{bmatrix}$

### 3.2. Shoelace Formula for Arbitrary Closed Polygons
For an $N$-sided closed polygon with vertices $V_0, V_1, \dots, V_{N-1}$ where $V_N \equiv V_0$:

$$\text{Area} = \frac{1}{2} \left| \sum_{i=0}^{N-1} (x_i y_{i+1} - x_{i+1} y_i) \right|$$

- **Sign of Area**: Positive indicates Counter-Clockwise (CCW) winding; negative indicates Clockwise (CW) winding.

### 3.3. Polygon Centroid (Center of Mass)
The analytical centroid $(\bar{x}, \bar{y})$ of a non-self-intersecting closed polygon is:

$$C_x = \frac{1}{6A} \sum_{i=0}^{N-1} (x_i + x_{i+1})(x_i y_{i+1} - x_{i+1} y_i)$$

$$C_y = \frac{1}{6A} \sum_{i=0}^{N-1} (y_i + y_{i+1})(x_i y_{i+1} - x_{i+1} y_i)$$

### 3.4. Conformal Similarity Scaling for Connected Components
When a single driving edge $S_{\text{driving}}$ within a connected geometric network has its target length modified from $L_{\text{orig}}$ to $L_{\text{target}}$, the network scales conformally with scale factor:

$$k = \frac{L_{\text{target}}}{L_{\text{orig}}}$$

Given an anchor vertex $\mathbf{A} = (x_A, y_A)$, every vertex $\mathbf{V}_j$ in the connected component transforms as:

$$\mathbf{V}_j' = \mathbf{A} + k \cdot (\mathbf{V}_j - \mathbf{A})$$

**Geometric Properties Preserved**:
- **Angles**: Preserved identically ($\theta_i' = \theta_i$).
- **Parallelism & Perpendicularity**: If $\vec{u} \parallel \vec{v}$, then $\vec{u}' \parallel \vec{v}'$; if $\vec{u} \perp \vec{v}$, then $\vec{u}' \perp \vec{v}'$.
- **Coincidence**: If $\mathbf{P}_1 = \mathbf{P}_2$, then $\mathbf{P}_1' = \mathbf{P}_2'$ (zero joint gap).

### 3.5. Least-Squares Residual Distribution for Closed Polygonal Loops
When independent user dimensions are assigned across an $N$-sided closed loop, the forward vector sum may produce a closure residual:

$$\vec{\delta} = \mathbf{V}_N - \mathbf{V}_0 = \sum_{i=0}^{N-1} L_i^{\text{target}} \hat{u}_i$$

To close the loop without introducing discontinuous tears, the residual is smoothly absorbed across all vertices:

$$\mathbf{V}_i' = \mathbf{V}_i - \frac{i}{N} \vec{\delta}, \quad \text{for } i = 0, 1, \dots, N-1$$

This ensures $\mathbf{V}_0' = \mathbf{V}_0$ and $\mathbf{V}_N' = \mathbf{V}_N - \vec{\delta} = \mathbf{V}_0$ (strict mathematical closure).

### 3.6. Degree of Freedom (DOF) & Grübler Mobility Criterion
For a 2D sketch with $V$ free geometric vertices and $C$ scalar constraints:

$$\text{DOF} = 2V - C$$

- $\text{DOF} > 0$: Under-constrained (system has remaining rigid-body motion or flexure).
- $\text{DOF} = 0$: Fully constrained (exact unique solution exists).
- $\text{DOF} < 0$: Over-constrained (redundant or contradictory constraints detected).

### 3.7. Non-Linear Constraint Relaxation (Gauss-Newton)
Geometric constraints $f_j(\mathbf{X}) = 0$ (e.g. distance constraints, coincident joints, orthogonality) are formulated as an optimization problem:

$$\min_{\mathbf{X}} \frac{1}{2} \|\mathbf{R}(\mathbf{X})\|^2 = \frac{1}{2} \sum_{j=1}^M f_j(\mathbf{X})^2$$

Iterative update using the Jacobian matrix $J = \nabla \mathbf{R}$:

$$\left( \mathbf{J}^T \mathbf{J} + \lambda \mathbf{I} \right) \Delta \mathbf{X} = -\mathbf{J}^T \mathbf{R}(\mathbf{X})$$

$$\mathbf{X}_{k+1} = \mathbf{X}_k + \Delta \mathbf{X}$$

---

## 4. Comprehensive Catalog of Implemented Features

### 4.1. Precision Drafting & Geometry Primitives
- **7 Fundamental Shapes**: Line, Arrow, Rectangle, Circle, Ellipse, Regular Polygon ($N$-gon), and Star.
- **Manual Drag Preservation**: Mouse drag coordinates are committed faithfully without unsolicited overwrites or jumps.
- **Smart Snap Engine**:
  - Vertex/Endpoint Snapping (within $20\text{px}$ threshold).
  - Midpoint Snapping.
  - Perpendicular Snapping.
  - Intersection Snapping.
  - Scalable CAD Grid Snapping.
- **Chamfer Reference Engine**: Dynamically detects $45^\circ$ diagonal lines, projecting collinear extensions and matching symmetrical corner extents without hijacking freehand lines.

### 4.2. Parametric & Constraint Modeling
- **Universal Connected Component Geometry Solver**:
  - Automatically clusters touching line endpoints into topological vertices using Disjoint-Set Union (DSU).
  - Operates on arbitrary line networks: triangles, braced frames, trusses, polygons, internal diagonals.
  - Enforces the *shared-vertex invariant*: modifying any line dimension scales the connected figure conformally without separating joints.
- **Structural Closed Loop Solver**:
  - Detects closed polygonal paths ($V_N \equiv V_0$).
  - Distributes closure residuals smoothly so all joints remain $100\%$ coincident ($\text{gap} = 0.00\text{ px}$).
- **Real-Time Expression Parser & Formula Engine**:
  - Evaluates algebraic expressions (`W = 400`, `H = W * 0.5`, `hypot(W, H)`).
  - Handles mathematical functions (`sqrt`, `sin`, `cos`, `tan`, `hypot`, `abs`, `pow`, etc.).
  - Dependency Graph (DAG) with circular reference detection and topological dirty propagation.
- **Quick Formula Bar**:
  - Bottom command bar for real-time formula entry (`L1 = 300`, `L2 = L3`).
  - Active line detection and instant dimension reassignment.
  - Separate pills for Constants and Formula-driven variables.
- **Closed Shape Analysis Badge**:
  - Displays Shoelace Area ($\text{px}^2$), Perimeter ($\text{px}$), Centroid coordinate $(C_x, C_y)$, and Bounding Box dimensions.
  - Centroid visual target glyph rendered directly at the center of mass.

### 4.3. Figma-Grade Direct Manipulation
- **Interactive Transform Overlay**:
  - 8-handle bounding box for proportional or axial resizing.
  - Top rotation handle with $15^\circ$ angle increment snapping.
  - Rigid multi-shape group rotation around collective centroids.
  - Selection overlay automatically disabled during drawing tools to allow uninterrupted vertex connection.
- **Layer & Hierarchy Management**:
  - Grouping (`Ctrl+G`) and Ungrouping (`Ctrl+Shift+G`).
  - Z-order management (Bring Forward, Send Backward, Bring to Front, Send to Back).
  - Multi-selection via Marquee Box or Shift-click.
- **Non-Destructive History Engine**:
  - 100-level past/future Undo/Redo stack (`Ctrl+Z`, `Ctrl+Y`).
  - Stale variable pruning on shape deletion and canvas clearing.

### 4.4. Import / Export Capabilities
- **Clean SVG Exporter**: Generates standards-compliant, standalone SVG XML with precision stroke widths and fills.
- **Specification JSON**: ID-stripped, round-trip serialization validated against strict Zod schemas.
- **2x High-DPI PNG Rasterizer**: Client-side offscreen canvas rasterization for high-resolution graphics export.

### 4.5. Test Suite & Code Quality
- **90 Passing Automated Vitest Tests** across 9 distinct test suites:
  - `geometry.test.ts`: Pure mathematical calculations and metrics.
  - `closed_geometry.test.ts`: Closed loop detection, Shoelace area, centroid math, right-triangle scaling, 8-sided polygon closure, and diagonal box scaling.
  - `parametric.test.ts`: Expression parsing, AST evaluation, and variable dependency propagation.
  - `reducer.test.ts`: Drawing actions, undo/redo, manual drag preservation, and stale variable cleanup.
  - `lcs.test.ts`: Local coordinate frames, affine transformations, and relative object placement.
  - `constraint_graph.test.ts`: Degree of Freedom (DOF) graph calculations.
  - `chamfer_reference.test.ts`: Chamfer angle filtering and extent projection.
  - `serialization.test.ts`: JSON import/export validation.
  - `structural_editing.test.ts`: Rigid group rotations and vertex transformations.

---

## 5. Strategic Capability Roadmap ("What Features It Can Have")

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PARAMETRIC CAD ROADMAP                          │
├────────────────────┬────────────────────┬──────────────────────────────┤
│ PHASE 1 (Current)  │ PHASE 2 (Advanced) │ PHASE 3 (Industrial / 3D)    │
│ ✅ SVG DOM CAD     │ ⏳ Advanced 2D Sk. │ ⏳ 2.5D & 3D Extrusion       │
│ ✅ Connected Graph │ ⏳ Arc & Splines   │ ⏳ STEP / DXF Import/Export  │
│ ✅ Conformal Scale │ ⏳ Trim / Extend   │ ⏳ FEM Stress Analysis       │
│ ✅ Formula AST     │ ⏳ Tangent Solver  │ ⏳ Feature Tree Timeline     │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

### 5.1. Phase 2: Advanced 2D Sketching & Constraint Engine
1. **Curved Primitives & Parametric Arcs**:
   - **Circular Arcs**: Defined by center, radius, start angle, and end angle (or 3-point arc).
   - **Cubic Bézier & B-Spline Curves**: Parametric control points with curvature continuity ($G^0, G^1, G^2$).
2. **Interactive Trimming & Corner Operations**:
   - **Trim / Extend Tool**: Click on an edge intersecting another line to automatically split or extend to the intersection point.
   - **Fillet Tool**: Select two intersecting lines to insert an arc tangent to both lines at a specified radius $R$.
   - **Chamfer Tool**: Truncate intersecting corners with symmetric or asymmetrical distances ($d_1, d_2$).
3. **Advanced Tangent & Geometric Constraints**:
   - **Line-to-Circle Tangency**: Enforces the normal distance from circle center to line equals radius $R$.
   - **Concentricity**: Centers of two arcs or circles locked to the exact same point.
   - **Symmetry Constraint**: Two entities mirrored across a designated construction centerline.
   - **Parallel Offset / Wall Thickness**: Creates an interior or exterior contour at fixed normal distance $d$.

### 5.2. Phase 3: Industrial CAD Interoperability & 3D Modeling
1. **Industry File Formats**:
   - **DXF (AutoCAD Drawing Exchange Format)**: Bi-directional import and export for laser cutting and CNC manufacturing.
   - **STEP (ISO 10303) & IGES Export**: Standard formats for importing into SolidWorks, Autodesk Fusion 360, FreeCAD, or Siemens NX.
2. **2.5D / 3D Solid Modeling**:
   - **Extrude**: Turn any closed 2D profile into a 3D solid with specified depth $D$.
   - **Revolve**: Revolve a closed profile around an axis by angle $\alpha \le 360^\circ$.
   - **WebGPU / Three.js 3D Viewer**: Live 3D isometric viewport alongside the 2D sketch.
3. **Structural Engineering Analysis (FEA / Beam Mechanics)**:
   - **Second Moment of Area ($I_{xx}, I_{yy}$)**:
     $$I_{xx} = \frac{1}{12} \sum_{i=0}^{N-1} (y_i^2 + y_i y_{i+1} + y_{i+1}^2)(x_i y_{i+1} - x_{i+1} y_i)$$
   - **Radius of Gyration ($k_x, k_y$) & Section Modulus ($Z_x, Z_y$)**.
   - **2D Truss Finite Element Solver**: Calculate tension/compression forces in truss members given point loads.

### 5.3. Phase 4: Professional UX & Collaborative Sketching
1. **Interactive Dimension Leader Lines**:
   - Industry-standard engineering dimension lines with arrowheads, witness lines, and draggable dimension text.
2. **Parametric Feature Tree & History Rollback**:
   - Left-sidebar feature tree displaying sketch entities, variables, and constraints chronologically.
   - Draggable rollback bar to replay the sketch step-by-step.
3. **Multi-User Collaborative Sketching**:
   - Real-time peer-to-peer or WebSocket synchronization using Conflict-Free Replicated Data Types (CRDTs / Yjs).

---

## 6. Verification & Validation Summary

| Test Category | Target Description | Method | Result |
|---|---|---|---|
| **Manual Drag** | Dragging 150px commits exactly 150px without 308px reversion | Puppeteer UI + Vitest | **PASS** |
| **Coincident Closure** | 8-line chamfered polygon closures with custom dimensions | Geometric Solver | **PASS (0.00 px gap)** |
| **Right Triangle** | Changing $L_1$ from 240 to 300 scales $L_2, L_3$ proportionally with $90^\circ$ angle intact | Puppeteer UI + Vitest | **PASS** |
| **Diagonal Box** | Changing diagonal $L_5$ from 300 to 150 scales box to $131 \times 73$ without mid-air tear | Puppeteer UI + Vitest | **PASS (0.00 px gap)** |
| **Full Build** | Turbopack production compilation | Next.js 16 build | **PASS (0 errors)** |
| **Unit Test Suite** | Complete algorithmic regression suite | Vitest 4.1 | **PASS (90/90 passed)** |
