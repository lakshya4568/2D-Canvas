# Unified Parametric 2D CAD Engine (UPCE-MASTER-1.0)
## Formal Architecture & System Topology Audit

**Document Revision**: 1.0.0  
**Target System**: Unified Parametric 2D CAD Engine (`lakshya4568/2D-Canvas`)  
**Specification Reference**: UPCE-MASTER-1.0 (§1–§86, Appendices A–G)  
**Verification Suite**: 726 automated tests passing, 0 lint violations  

---

## 1. Executive System Topology

The Unified Parametric 2D CAD Engine is an industrial-grade, client-first, web-native CAD system developed to eliminate the false dichotomy between hardcoded procedural geometry generators and blank-sheet manual drafting. The architecture operates entirely without third-party canvas or scene-graph libraries (zero Konva, Fabric.js, Paper.js, Two.js, or Pixi.js), projecting its mathematical state directly to the native SVG DOM.

### 1.1 High-Level Architectural Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PRESENTATION LAYER                                     │
│  CadShell · CommandBar · ToolRail · PersonaDock · ModeSwitch · StatusStrip             │
│  features/canvas/ (DrawingCanvas · DimensionBadge · SnapIndicator · SelectionOverlay) │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Dispatches Actions
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION STATE LAYER                                   │
│  lib/state/drawingReducer.ts (100-Step Transaction History · Pure Reducer)             │
│  lib/state/persistentStore.ts (Canonical JSON)  lib/state/transientStore.ts (Solve)    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Executes 13-Step Transaction Pipeline
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          PARAMETRIC MODEL & ORCHESTRATION                              │
│  lib/parametric/model.ts (ParametricModel · Bidirectional Syncer)                      │
│  lib/parametric/parameterManager.ts (Driving vs Dependent vs Fixed Scalar Registers)   │
│  lib/runtime/editPipeline.ts (Homotopy Sub-stepping · Rollback Safety · Report Gen)   │
└───────────────────────┬────────────────────────────────────────────┬───────────────────┘
                        │ Proposes Invariants                        │ Solves Equations
                        ▼                                            ▼
┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────┐
│       AUTOMATED INFERENCE PIPELINE           │  │         DUAL-GRAPH ENGINE            │
│  lib/inference/candidateDetector.ts          │  │  lib/parametric/dag/tarjan.ts        │
│  lib/inference/candidateClusterer.ts         │  │    (Directed Acyclic Graph)          │
│  lib/inference/admissibilityFilter.ts (SVD)  │  │  lib/parametric/graph/bipartite.ts   │
│  lib/inference/haunchRecognizer.ts           │  │    (Bipartite Constraint Graph)      │
│  lib/inference/bayClusterer.ts               │  │  lib/parametric/graph/dm.ts          │
│  lib/inference/integerRelation.ts (PSLQ)     │  │    (Dulmage-Mendelsohn BTF Partition)│
└───────────────────────┬──────────────────────┘  └──────────────────┬───────────────────┘
                        │ Admissible Invariants                      │ Partitioned Blocks
                        └───────────────────────┬────────────────────┘
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                NUMERICAL SOLVER KERNEL                                 │
│  lib/solver/planegcsClient.ts (PlaneGCS WebAssembly Solver · Fast-path WASM)          │
│  lib/solver/dogleg.ts (Powell's Dogleg Trust-Region · Thin SVD Regularization)         │
│  lib/solver/levenbergMarquardt.ts (LM with Exact Predicted Reduction Defect Fix)      │
│  lib/solver/jacobians/analyticalJacobians.ts (Closed-form Analytical Partial Derivs)  │
│  lib/parametric/dragSolver.ts (SolveSpace 1/20 Column-Damped Direct Manipulation)     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Solved Coordinates (X*)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PLANAR TOPOLOGY & DCEL MAP                                │
│  lib/geometry/topology/dcel.ts (Doubly Connected Edge List · Euler V - E + F = 1 + C)  │
│  lib/geometry/topology/holeNesting.ts (Ray-cast Jordan Even/Odd Void Detection)        │
│  lib/geometry/topology/semanticFaceTagger.ts (Persistent Face Matching across Solves)  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Metric carriers
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      COORDINATE-FREE PREDICATES & CARRIERS                             │
│  lib/geometry/predicates/vectorPredicates.ts (Level-1 P1/P3/P8 · Level-2 P2/P4/P5/P6)  │
│  lib/geometry/lcs/affineMatrix.ts (SE(2) 3x3 Homogeneous Affine Reference Frames)     │
│  lib/geometry/metrics/ (Analytical Centroids · Shoelace Loop Area · Arc Sagitta)       │
│  lib/geometry/tolerance.ts (Model-Space Millimeter Invariant Policy: Zero Screen Px)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 9-Layer Layering Analysis

The engine enforces a strictly unilateral 9-layer architectural stack. Higher layers consume abstractions exposed by lower layers, while lower layers possess zero knowledge of consumers above them.

```
Layer 9: Presentation & Shell Layer          (features/canvas, features/shell, features/panels)
Layer 8: Application State & Transaction     (lib/state/drawingReducer, persistentStore)
Layer 7: Parametric Orchestration & Runtime  (lib/parametric/model, lib/runtime/editPipeline)
Layer 6: Automated Relationship Inference    (lib/inference/candidateDetector, admissibilityFilter)
Layer 5: Dual-Graph Decomposition Engine    (lib/parametric/graph/bipartiteGraph, dulmageMendelsohn)
Layer 4: Variational Numerical Solver Kernel (lib/solver/planegcsClient, dogleg, levenbergMarquardt)
Layer 3: Planar Boundary Topology (DCEL)     (lib/geometry/topology/dcel, holeNesting, faceTagger)
Layer 2: Coordinate-Free Vector Predicates   (lib/geometry/predicates/vectorPredicates)
Layer 1: Geometric Primitives & Affine LCS   (lib/geometry/lcs, metrics, adapters, tolerance)
```

### Layer 1: Geometric Primitives & Affine LCS (`lib/geometry/`)
- **Carrier Curves**: Pure mathematical representations of points, unbounded carriers (lines, circles), bounded segments, circular arcs, and regular polygons.
- **Local Coordinate Systems (LCS)**: Every entity resides either globally or inside a local Euclidean reference frame represented as a $3 \times 3$ homogeneous affine transformation matrix in $\mathrm{SE}(2)$:
  $$\mathbf{M} = \begin{bmatrix} \cos\theta & -\sin\theta & x_0 \\ \sin\theta & \cos\theta & y_0 \\ 0 & 0 & 1 \end{bmatrix}$$
- **Gram-Schmidt Orthogonalization**: Prevents floating-point matrix shear accumulation during recursive affine compositions.
- **Tolerance Discipline**: All geometric comparisons rely on `DEFAULT_TOLERANCE_POLICY` (`policy.geometry_mm = 0.01`, `policy.weld_mm = 0.5`, `policy.angle_rad = 1e-4`, `policy.solver_residual = 1e-8`). Hardcoded constants or screen pixels are strictly forbidden.

### Layer 2: Coordinate-Free Vector Predicates (`lib/geometry/predicates/`)
- Pure geometric predicates that evaluate orientation-invariant relationships:
  - **P1 (Parallelism)**: $|\hat{\mathbf{d}}_A \times \hat{\mathbf{d}}_B| \le \epsilon_\theta$
  - **P2 (Perpendicularity)**: $|\hat{\mathbf{d}}_A \cdot \hat{\mathbf{d}}_B| \le \epsilon_\theta$
  - **P3 (Parallel Offset / Thickness)**: $|(\mathbf{B}_{\text{start}} - \mathbf{A}_{\text{start}})\cdot \hat{\mathbf{n}}_A - (\mathbf{B}_{\text{end}} - \mathbf{A}_{\text{start}})\cdot \hat{\mathbf{n}}_A| \le \epsilon_d$
  - **P4 (Corner Chamfer / Haunch)**: Measured transition angle $\theta \in (0, \pi/2)$ and projection leg lengths $L_1, L_2$. Hardcoded 45° constraints are eliminated.
  - **P5 (Concentric Radial Offset)**: $\|\mathbf{C}_A - \mathbf{C}_B\| \le \epsilon_{\text{weld}}$, $\Delta r = |r_A - r_B|$
  - **P6 (Tangency)**: Line-to-circle $(|(\mathbf{C} - \mathbf{P})\cdot \hat{\mathbf{n}}| - R = 0)$ and circle-to-circle $(\|\mathbf{C}_A - \mathbf{C}_B\| - (R_A \pm R_B) = 0)$.
  - **P8 (Coincidence)**: $\|\mathbf{P}_A - \mathbf{P}_B\| \le \epsilon_{\text{weld}}$
- **Zero Shape-Type Branching**: Predicates operate exclusively on geometric carriers (`SegmentPrimitive`, `CirclePrimitive`, `Point2D`). No `if (shape.type === 'rect')` branching exists in predicate paths.

### Layer 3: Planar Boundary Topology (DCEL) (`lib/geometry/topology/`)
- Implements a Doubly Connected Edge List (DCEL) maintaining combinatorial connectivity without reference to coordinates.
- **Intersection Splitting**: Decomposes intersecting segments and T-junctions into topological sub-edges, ensuring every edge terminates at a shared vertex.
- **Planar Simple Graph Deduplication**: Welded edges between adjacent shapes sharing a common wall (e.g. culvert dividing web walls) are collapsed into a single topological undirected edge (2 half-edge twins), eliminating multigraph degeneracy.
- **Euler-Poincaré Planar Invariant**: Every planar arrangement satisfies $V - E + F = 1 + C$, where $C$ is the number of connected components.
- **Hole Nesting & Winding Order**: Solid material (even nesting depth) vs interior voids (odd nesting depth) computed via ray-crossing Jordan polygon winding.
- **Face Identity Persistence**: Multi-criteria bipartite matching across solves (tag overlap $+1000$, nesting consistency $+100$, centroid proximity $-d$) prevents user hatch pattern corruption.

### Layer 4: Variational Numerical Solver Kernel (`lib/solver/`)
- **PlaneGCS WASM Solver Adapter** (`lib/solver/planegcsClient.ts`):
  - Primary variational solver executing FreeCAD's native PlaneGCS C++ kernel compiled to WebAssembly.
  - Cold solve: $< 2.5$ ms; Warm solve fast-path: $< 0.25$ ms ($> 300\times$ faster than interactive $150$ ms budget).
- **Powell's Dogleg with Thin SVD Regularization** (`lib/solver/dogleg.ts`):
  - In-process TypeScript fallback solver computing trust-region interpolation between Gauss-Newton ($\mathbf{h}_{\text{gn}} = -\mathbf{J}^+ \mathbf{F}$) and Cauchy steepest descent ($\mathbf{h}_{\text{sd}} = -\frac{\|\mathbf{g}\|^2}{\|\mathbf{J}\mathbf{g}\|^2}\mathbf{g}$).
  - Minimum-norm under-constrained update: $\Delta X^* = -\mathbf{J}^+ \mathbf{F}$.
- **Levenberg-Marquardt with Exact Predicted Reduction** (`lib/solver/levenbergMarquardt.ts`):
  - Regularized normal equations $(\mathbf{J}^T \mathbf{J} + \mu \mathbf{I})\Delta \mathbf{x} = -\mathbf{J}^T \mathbf{F}$.
  - Corrected gain ratio denominator $\Delta L = \frac{1}{2}\Delta \mathbf{x}^T (\mu \Delta \mathbf{x} - \mathbf{J}^T \mathbf{F})$, eliminating false step rejections.
- **SolveSpace 1/20 Column Damping Direct Manipulation Solver** (`lib/parametric/dragSolver.ts`):
  - Solves interactive pointer drags at 60 FPS without shape distortion by applying diagonal column scaling $\mathbf{S}$:
    $$S_{jj} = \begin{cases} 0.05 & \text{for dragged coordinate degrees of freedom} \\ 1.0 & \text{for unconstrained free coordinates} \\ 1000.0 & \text{for anchored baseline datums} \end{cases}$$

### Layer 5: Dual-Graph Decomposition Engine (`lib/parametric/graph/`)
- **Bipartite Constraint Graph** (`lib/parametric/graph/bipartiteGraph.ts`):
  - Undirected bipartite graph $G = (V, C, E)$ linking geometric coordinate entities $V$ to constraint equations $C$.
- **Dulmage-Mendelsohn (DM) Decomposition** (`lib/parametric/graph/dulmageMendelsohn.ts`):
  - Hopcroft-Karp maximum bipartite matching combined with Tarjan Block Triangular Form (BTF).
  - Partitions system into under-constrained ($V_0, C_0$), well-constrained ($V_1, C_1$), and over-constrained ($V_\infty, C_\infty$) subgraphs.
  - Per-Component Degree-of-Freedom Calculation:
    $$\mathrm{DOF}_k = |V_k| - \mathrm{rank}(\mathbf{J}_k) - D_{\text{anchor},k}$$
    Where $D_{\text{anchor},k} = 0$ if component $k$ possesses a rigid-body anchor, and $3$ if floating.
- **DAG Expression Engine** (`lib/parametric/dag/tarjan.ts`, `dependencyGraph.ts`):
  - Evaluates scalar functional variable formulas ($y = f(x)$) via topological sorting.
  - Circular references detected via Tarjan strongly connected components (SCC).

### Layer 6: Automated Relationship Inference (`lib/inference/`)
- **Autonomous Discovery Pipeline** (`lib/inference/autonomousDiscoveryPipeline.ts`):
  - Discovers parallel offsets, perpendiculars, chamfers, and coincidences from raw sketched coordinates without requiring user-authored formulas.
- **Candidate Clustering** (`lib/inference/candidateClusterer.ts`):
  - Merges redundant geometric proposals within `cluster_mm` (1.0 mm) into unified parameter cards (e.g. collapsing 4 exterior wall offsets into a single `WallThickness = 40.0 mm` card).
- **SVD Row-Space Admissibility Gate** (`lib/inference/admissibilityFilter.ts`):
  - Computes orthogonal residual projection of candidate constraint gradients against the active Jacobian row space:
    $$\mathbf{g}_\perp = (\mathbf{I} - \mathbf{J}^T (\mathbf{J}\mathbf{J}^T)^{-1} \mathbf{J})\mathbf{g}_{\text{cand}}$$
  - If $\|\mathbf{g}_\perp\| < 10^{-6}$: candidate is linearly dependent. If residual $|f_{\text{cand}}| < \epsilon$, proposal is silently discarded as redundant; if $|f_{\text{cand}}| \ge \epsilon$, proposal is flagged as conflicting.
- **Haunch & Chamfer Recognizer** (`lib/inference/haunchRecognizer.ts`):
  - Measures true diagonal angles and leg lengths connecting orthogonal boundaries, eliminating hardcoded 45° constraints.
- **Multi-Cell Bay Clusterer** (`lib/inference/bayClusterer.ts`):
  - Groups adjacent void loops and identifies intermediate dividing webs.
- **Integer-Relation Discovery** (`lib/inference/integerRelation.ts`):
  - PSLQ lattice reduction discovering integer algebraic relationships ($\sum a_i x_i = 0$) backed by 4 validation gates: dimension match, sample consistency, non-triviality, and residual tolerance.

### Layer 7: Parametric Model & Runtime Pipeline (`lib/parametric/`, `lib/runtime/`)
- **ParametricModel** (`lib/parametric/model.ts`):
  - Central orchestrator mediating bidirectional synchronization:
    $$\text{Canvas Drag} \longleftrightarrow \text{DCEL Topology} \longleftrightarrow \text{ParameterManager} \longleftrightarrow \text{Solver Kernel}$$
- **13-Step Transactional Edit Pipeline** (`lib/runtime/editPipeline.ts`):
  1. Capture pre-edit snapshot.
  2. Validate parameter input bounds ($L \in [L_{\text{min}}, L_{\text{max}}]$).
  3. Pre-solve standards compliance check against active profile (`standards/profiles/*.json`).
  4. Homotopy continuation sub-stepping: large parameter changes ($\Delta L > 500$ mm) split into steps $\Delta L_i \le 500$ mm.
  5. Assemble active constraint equations and Jacobian.
  6. Solve variational system via PlaneGCS WASM / Dogleg fallback.
  7. Check convergence residual ($\|\mathbf{F}\| \le 10^{-8}$ mm).
  8. Enforce condition number limit $\kappa(\mathbf{J}) \le 10^8$.
  9. Bentley-Ottmann planar self-intersection check.
  10. Rebuild DCEL planar arrangement and match face identities.
  11. Compute derived engineering properties (Shoelace area, moments of inertia).
  12. Generate auditable Invariant Report (green/amber/red).
  13. Commit updated state or trigger atomic rollback on failure.

### Layer 8: Application State & Transaction (`lib/state/`)
- **DrawingReducer** (`lib/state/drawingReducer.ts`):
  - Pure, side-effect-free reducer managing 100-step transactional undo/redo stack.
- **Persistent vs Transient Store**:
  - Persistent store records immutable geometric invariants, explicit constraints, and user driving dimensions.
  - Transient store holds temporary drag preview targets, cached Jacobians, and resolved vertex buffers. Drag previews never pollute persistent undo history.

### Layer 9: Presentation & Shell Layer (`features/`)
- **Zero Drawing Libraries**: Native SVG DOM rendering with CSS hardware acceleration.
- **DimensionBadge** (`features/canvas/DimensionBadge.tsx`):
  - On-canvas dimension controls implementing a strict 3-state machine: `DISPLAY` $\to$ `EDITING` $\to$ `COMMIT`.
  - Commits route exclusively through `ParameterManager.setDriving()` and re-solve; direct shape coordinate mutation is prohibited.
- **CAD Grips & Snapping** (`lib/geometry/grips.ts`, `lib/geometry/snapping.ts`):
  - 3-state grip lifecycle (`warm`, `hover`, `hot`) for vertices, midpoints, and centroids.
  - 11 OSNAP categories (`endpoint`, `midpoint`, `center`, `intersection`, `perpendicular`, `quadrant`, `tangent`, `centroid`, `edge`, `chamfer_ref`, `grid`).
- **Persona Isolation Surfaces**:
  - `DraftPanel` (Draftsman Mode): 0 formulas displayed.
  - `AuthorPanel` (Template Author Mode): Candidate review and formula synthesis.
  - `RunPanel` (Project Engineer Mode): Standard parameter form controls.

---

## 3. Runtime Dataflow Pipelines

### 3.1 Pipeline A: Direct Manipulation (Pointer Drag at 60 FPS)

```
[Pointer Move Event]
       │ (Screen coordinates)
       ▼
[Viewport CTM Projection] ──► World Coordinates (mm)
       │
       ▼
[CadGrip Hit-Test] ──► Active Hot Grip (Vertex / Midpoint / Centroid)
       │
       ▼
[DirectManipulationDragSolver]
       │ Instantiates temporary drag constraint (temporary: true)
       │ Assigns SolveSpace diagonal damping:
       │   S_dragged = 0.05, S_free = 1.0, S_anchored = 1000.0
       │ Solves: (J^T J + S^T S) Δx = J^T (x_cursor - x_current)
       ▼
[Warm-Start Solution Hysteresis] ──► Prevents branch-jumping
       │
       ▼
[DCEL Chirality Check] ──► Validates sign(det(v1, v2)) > 0 (No self-inversion)
       │
       ▼
[Transient SVG State Push] ──► Smooth 60 FPS canvas update without undo push
       │
[Pointer Up Event] ──► Commits final transaction to DrawingReducer history
```

### 3.2 Pipeline B: Committed Parameter Edit (Badge Edit: ClearSpan = 3500)

```
[User clicks DimensionBadge] ──► State: EDITING
       │ Types "3500", presses Enter
       ▼
[ParameterManager.setDriving("ClearSpan", 3500)]
       │
       ▼
[runEditPipeline()] (13-Step Transactional Execution)
       │
       ├─► 1. Pre-edit snapshot created
       ├─► 2. Range validation: 3500 ∈ [1000, 6000] (Passed)
       ├─► 3. Standards check: Evaluates IRC:112 cover & slab thickness (Amber Note)
       ├─► 4. Homotopy sub-stepping: 2000 -> 3500 (Δ = 1500 > 500)
       │      Sub-steps: 2500 -> 3000 -> 3500 mm
       ├─► 5. PlaneGCS WASM Fast-Path Solve (Warm latency 0.23 ms)
       │      Minimum-norm update: ΔX* = -J^+ F (Zero conformal scaling)
       ├─► 6. Convergence verify: ||F|| = 4.2e-9 mm <= 1e-8 mm
       ├─► 7. Condition number: κ(J) = 1.4e3 <= 1e8
       ├─► 8. Self-intersection: Bentley-Ottmann reports 0 invalid crossings
       ├─► 9. DCEL Planar Map Rebuild & Euler Invariant Validation: V - E + F = 1 + C
       ├─► 10. Face Identity Persistence: Matches Bay 1, Bay 2, and Voids stably
       └─► 11. Invariant Report: GREEN (All structural walls and haunches preserved)
       │
       ▼
[dispatch({ type: "COMMIT_EDIT", payload: solvedShapes })]
       │
       ▼
[DrawingReducer Push] ──► Pushes undo entry, updates persistent state
       │
       ▼
[React 19 Context Broadcast] ──► Re-renders SVG canvas & DimensionBadges
```

---

## 4. Kernel Invariants & Boundary Enforcement

The engine strictly enforces 6 non-negotiable architectural invariants:

### 4.1 Zero Conformal Scaling on Solve Paths (§8, §29.4, §81)
- Proportional similarity scaling ($k = L_{\text{target}} / L_{\text{original}}$) is mathematically banned from the solve path.
- Undriven member lengths, structural wall thicknesses, and 45° corner haunches are strictly preserved during span modifications.
- Variational solves compute minimum-norm coordinate displacements ($\Delta X^* = -\mathbf{J}^+ \mathbf{F}$) from warm starts ($X_0$).

### 4.2 Planar Rigid-Body Anchor Rule (§18)
- Every 2D planar mechanism requires fixing 3 degrees of freedom (2 translation + 1 rotation) to eliminate rigid body drift.
- Fixing a single point only removes translation ($2$ DOFs). Rotation ($1$ DOF) must be anchored via a horizontal/vertical baseline constraint.
- Dulmage-Mendelsohn analysis propagates the anchor datum: $D_{\text{anchor},k} = 0$ for anchored components, avoiding spurious over-/under-constrained misdiagnoses.

### 4.3 Persona Boundary Isolation (§3, §59, §64)
| Persona Mode | Surface | Permitted Interactions | Forbidden Elements |
|---|---|---|---|
| **Draftsman Mode** | `DraftPanel`, Canvas | Click badges, direct drag, snaps, tools | Formulas, expressions, ASTs, synthetic names (`R1_Width`) |
| **Author Mode** | `AuthorPanel` | Review candidate invariants, accept/reject | Direct coordinate hacking bypassing solver |
| **Run Mode** | `RunPanel` | Form sliders, inputs, exports | Equation editing, formula authoring |

### 4.4 Variable Scoping in Bidirectional Sync (`model.ts`)
- Inner cutouts, voids, and nested sub-shapes are prevented from falling back to global un-scoped dimensions (`Width`, `Height`, `W`, `H`).
- Shapes matching `/inner|cutout|void/i` bind exclusively to scoped variables (`InnerWidth`, `Bay1.width`, etc.).

### 4.5 Tolerance & Unit Discipline (§17, §84)
- All geometric tolerances are injected from `TolerancePolicy` in model-space millimeters (`policy.geometry_mm`, `policy.weld_mm`, `policy.solver_residual`), never hardcoded or expressed in screen pixels.
- Zero locally defined tolerance constants are permitted in production code (enforced by `bun run lint:tolerance`).
- Zero GPL/AGPL dependencies are permitted in package closures (enforced by `bun run license:scan`).

### 4.6 Zero LLM Geometric Authority (§2.1, §56)
- AI adapters possess strictly zero authority over geometric coordinates, constraint equations, or topology.
- AI naming patches are restricted purely to semantic tags, friendly parameter names, and UI grouping.
- 100% of engine functionality operates deterministically with the AI disabled via `DeterministicFallbackNamer`.
