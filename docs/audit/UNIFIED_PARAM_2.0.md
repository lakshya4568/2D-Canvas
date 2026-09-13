# UPCE-ADDENDUM-2.0: Unified Parametric CAD Engine
## Engineering Specification & Implementation Blueprint for Advanced Draftsman Interaction, Component Rigidity, Dynamic Pitch & Geometric Fusion

**Document ID:** UPCE-ADDENDUM-2.0  
**Parent Specification:** `UNIFIED_PARAMETRIC_CAD_ENGINE_MASTER_PLAN.md` (UPCE-MASTER-1.0)  
**Status:** Approved Technical Architecture & Final Implementation Plan  
**Target Scope:** Resolution of core mechanical drafting failure modes (multi-cell distortion, relative line tracking, centroid constraints, rigid grouping, and collision/boolean fusion) within the existing 2D Canvas and Aagento civil GAD workflow.

---

## 1. Executive Problem Decomposition & Root Cause Analysis

Analysis of the 7 handwritten notebook pages against the `2D-Canvas` codebase (`parametric_formulation` branch) and the Aagento GAD application workflow reveals why the system failed after earlier initial patches:

```
                  USER ACTION                                               SYSTEM FAILURE
┌──────────────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ Notebook Pages 1 & 2:                        │          │ Root Cause: Uncoupled Void Solves            │
│ Modifying Wall / Slab thickness or adding    ├─────────►│ Voids are dimensioned against outer envelope │
│ cells in a multi-cell box culvert.           │          │ rather than an explicit inter-cell pitch.    │
│ Target: Haunches & webs stay 100% constant.  │          │ Conformal scaling distorts haunches & webs.  │
└──────────────────────────────────────────────┘          └──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ Notebook Pages 3, 4, 5:                      │          │ Root Cause: No Rigid Subgraph Condensation   │
│ Grouping arbitrary lines into a component    ├─────────►│ The solver treats grouped vertices as loose  │
│ and constraining Line 1 to external Line 2.  │          │ coordinates; dragging or constraining one    │
│ Target: Entire component moves rigidly.      │          │ edge skews or collapses the rest of the loop.│
└──────────────────────────────────────────────┘          └──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ Notebook Page 6:                             │          │ Root Cause: Absence of 2D Relative DOF       │
│ Relative (X, Y) line-to-line offset          ├─────────►│ Lack of directed 2-axis relative alignment;  │
│ driving without algebraic formula creation.  │          │ lines cannot pull/push neighbours smoothly.  │
└──────────────────────────────────────────────┘          └──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ Notebook Page 7:                             │          │ Root Cause: Missing DCEL / CSG Boolean Step  │
│ Shapes closing up ($x' > x$) and overlapping │├─────────►│ Solver allows self-intersecting loops        │
│ ("Green shaded area to be cut / removed").   │          │ without triggering automatic shared web      │
│ Target: Clean wall fusion or boolean cut.    │          │ collapse or planar arrangement union.        │
└──────────────────────────────────────────────┘          └──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐          ┌──────────────────────────────────────────────┐
│ Notebook Page 8:                             │          │ Root Cause: Centroid is Passive Metric       │
│ Centroid-to-Centroid / Center-to-Center      ├─────────►│ Centroids are computed post-solve as shoelace│
│ distance constraint between arbitrary shapes.│          │ metrics; they possess no analytical Jacobian  │
│ Target: Decreasing dist pulls shapes closer. │          │ rows to actively drive the solver.           │
└──────────────────────────────────────────────┘          └──────────────────────────────────────────────┘
```

---

## 2. Mathematical Formulations & Analytical Derivatives

To ensure the variational solver (`PlaneGCS` / internal Levenberg-Marquardt) converges quadratically ($\|\mathbf{F}(\mathbf{X})\|_\infty < 1\times 10^{-8}$) without finite-difference noise, we introduce analytical residuals and exact Jacobian rows for the newly specified capabilities.

### 2.1 Centroid-to-Centroid Active Driving Constraint ($P10$)
*(Solves Notebook Page 8: "build a relationship b/w centers / centroid of 2 shapes... when I try to close them, rectangles also start coming closer")*

A closed planar polygon $A$ with ordered vertices $(x_0, y_0), \dots, (x_{k-1}, y_{k-1})$ (with cyclic indexing $x_k = x_0, y_k = y_0$) has signed shoelace area and centroid coordinates:

$$\Omega = \frac{1}{2} \sum_{i=0}^{k-1} (x_i y_{i+1} - x_{i+1} y_i)$$

$$C_x = \frac{1}{6\Omega} \sum_{i=0}^{k-1} (x_i + x_{i+1})(x_i y_{i+1} - x_{i+1} y_i) = \frac{M_y}{6\Omega}$$

$$C_y = \frac{1}{6\Omega} \sum_{i=0}^{k-1} (y_i + y_{i+1})(x_i y_{i+1} - x_{i+1} y_i) = \frac{M_x}{6\Omega}$$

Where the cross-term is defined as $\xi_i = x_i y_{i+1} - x_{i+1} y_i$.

#### Exact Analytical Partial Derivatives
For any vertex coordinate $x_j$ ($j \in \{0, \dots, k-1\}$):

$$\frac{\partial \Omega}{\partial x_j} = \frac{1}{2} (y_{j+1} - y_{j-1}), \quad \frac{\partial \Omega}{\partial y_j} = \frac{1}{2} (x_{j-1} - x_{j+1})$$

The moment sum $M_y = \sum_{i=0}^{k-1} (x_i + x_{i+1})\xi_i$ depends on $x_j$ directly and via $\xi_{j-1}, \xi_j$:

$$\frac{\partial M_y}{\partial x_j} = (x_{j-1} + x_j)(-y_{j-1}) + \xi_{j-1} + (x_j + x_{j+1})(y_{j+1}) + \xi_j$$

$$\frac{\partial M_y}{\partial y_j} = (x_{j-1} + x_j)(x_{j-1}) + (x_j + x_{j+1})(-x_{j+1})$$

Applying the quotient rule gives the exact gradient of the centroid coordinate:

$$\frac{\partial C_x}{\partial x_j} = \frac{1}{6} \left[ \frac{1}{\Omega} \frac{\partial M_y}{\partial x_j} - \frac{M_y}{\Omega^2} \frac{\partial \Omega}{\partial x_j} \right]$$

$$\frac{\partial C_x}{\partial y_j} = \frac{1}{6} \left[ \frac{1}{\Omega} \frac{\partial M_y}{\partial y_j} - \frac{M_y}{\Omega^2} \frac{\partial \Omega}{\partial y_j} \right]$$

*(Analogous formulations apply to $\partial C_y / \partial x_j$ and $\partial C_y / \partial y_j$ by swapping axes).*

#### Centroid Distance Residual
For two shapes $A$ and $B$ with target centroid distance $D$:

$$r_{\text{centroid\_dist}} = (C_x^A - C_x^B)^2 + (C_y^A - C_y^B)^2 - D^2 = 0$$

$$\frac{\partial r}{\partial X_j^A} = 2(C_x^A - C_x^B) \frac{\partial C_x^A}{\partial X_j^A} + 2(C_y^A - C_y^B) \frac{\partial C_y^A}{\partial X_j^A}$$

$$\frac{\partial r}{\partial X_j^B} = -2(C_x^A - C_x^B) \frac{\partial C_x^B}{\partial X_j^B} - 2(C_y^A - C_y^B) \frac{\partial C_y^B}{\partial X_j^B}$$

**Implementation:** Registered in `lib/parametric/constraints/centroidConstraint.ts`. When a draftsman clicks "Align Centers" or dimensions between two shape centroids, this analytical residual is injected directly into the active Jacobian.

---

### 2.2 Directed 2D Line-to-Line Relative Movement Residuals ($\Delta X, \Delta Y, P3$)
*(Solves Notebook Pages 4, 5 & 6: "move $l_2$ with $l_1$ along x/y coordinate... distance b/w lines is maintained")*

Let Line 1 be directed from $P_1(x_1, y_1)$ to $P_2(x_2, y_2)$ and Line 2 be directed from $P_3(x_3, y_3)$ to $P_4(x_4, y_4)$.

```
           Line 1 (P1 → P2)
        P1 o────────────────o P2
           │               │
  ΔY offset│               │
           │               │
        P3 o────────────────o P4
           Line 2 (P3 → P4)
           ◄───────ΔX──────►
```

#### 1. Decoupled Horizontal / Vertical Separation Residuals
For axes-aligned or guided 2D movement:

$$r_{\Delta X} = \frac{x_3 + x_4}{2} - \frac{x_1 + x_2}{2} - D_x = 0$$

$$r_{\Delta Y} = \frac{y_3 + y_4}{2} - \frac{y_1 + y_2}{2} - D_y = 0$$

$$\nabla_{\mathbf{X}} r_{\Delta X} = \left[ -\frac{1}{2}, 0, -\frac{1}{2}, 0, \frac{1}{2}, 0, \frac{1}{2}, 0 \right]$$

$$\nabla_{\mathbf{X}} r_{\Delta Y} = \left[ 0, -\frac{1}{2}, 0, -\frac{1}{2}, 0, \frac{1}{2}, 0, \frac{1}{2} \right]$$

#### 2. Directed Perpendicular Offset ($P3$ Variant)
When lines are oriented at an arbitrary angle $\theta$:

$$\Delta x = x_2 - x_1, \quad \Delta y = y_2 - y_1, \quad L = \sqrt{\Delta x^2 + \Delta y^2}$$

$$\mathbf{n} = \left[ -\frac{\Delta y}{L}, \frac{\Delta x}{L} \right]^T$$

$$r_{\text{offset}} = \mathbf{n} \cdot (P_3 - P_1) - T = 0$$

$$r_{\text{offset}} = \frac{-(y_2 - y_1)(x_3 - x_1) + (x_2 - x_1)(y_3 - y_1)}{\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}} - T = 0$$

This enables exact anisotropic thickness preservation across rotated boundaries.

---

### 2.3 Haunch Invariant & Chirality Protection ($P4$)
*(Solves Notebook Pages 1, 2 & 3: "wall thickness, slab thickness when upon changing them, the geometry don't get stretched and its getting destroyed... haunch not flipping")*

A chamfer/haunch corner is defined by three vertices: wall vertex $P_w$, corner virtual datum $P_c$, and slab vertex $P_s$.

```
           P_s (Slab Vertex)
            o───────────────
           /│
  Haunch  / │
  Edge   /  │  Corner Datum (Virtual)
        o   o P_c
      P_w   Wall Vertex
```

To prevent haunch distortion, three coupled conditions are enforced:

1. **Leg Dimension Invariant ($P4_{\text{leg}}$):**
   $$r_{\text{leg\_h}} = \|P_w - P_c\| - h_{\text{wall}} = 0$$
   $$r_{\text{leg\_v}} = \|P_s - P_c\| - h_{\text{slab}} = 0$$

2. **Chirality Barrier ($\Phi_{\text{barrier}}$):**  
   To prevent the haunch from inverting into the clear opening during large span changes, the signed area of the corner triangle $\Delta(P_w, P_c, P_s)$ is constrained via a logarithmic interior point barrier:
   $$\Phi_{\text{chirality}} = -\mu \ln \left( (x_w - x_c)(y_s - y_c) - (y_w - y_c)(x_s - x_c) \right)$$
   As the area approaches zero, $\Phi \to \infty$, penalizing inversion and forcing the solver to stay within the physical design manifold.

3. **Homotopy Sub-stepping:**  
   Any user input causing a parameter change $\Delta P > 500\text{ mm}$ is subdivided into $N = \lceil \Delta P / 300\text{ mm} \rceil$ intermediate steps, solving sequentially to guarantee path continuity.

---

## 3. Dynamic Cell Pitch & Repeat Topology Engine

*(Solves Notebook Pages 1 & 2: "cell pitch or unit pitch... wall thickness should be maintained at exact b/w the two cell on increasing")*

### 3.1 The Pitch Equation vs. Wall Thickness
The primary reason multi-cell culverts distorted was that the engine lacked a formal **Pitch Engine**. 

```
   ◄─── Clear Span (S) ───►  t_mid  ◄─── Clear Span (S) ───►
   ┌───────────────────────┐       ┌───────────────────────┐
   │                       │       │                       │
   │        CELL 0         │       │        CELL 1         │
   │                       │       │                       │
   │◄─────────────────────►│       │                       │
   └───────────────────────┘       └───────────────────────┘
   ◄────────────── Cell Pitch (P_cell) ───────────────────►
```

For an array of $N$ cells:
- Let $S_{\text{clear}}$ be the clear span of each cell.
- Let $t_{\text{mid}}$ be the intermediate wall thickness.
- Let $t_{\text{ext}}$ be the exterior wall thickness.

The **Cell Pitch** $P_{\text{cell}}$ is defined as:

$$P_{\text{cell}} = S_{\text{clear}} + t_{\text{mid}}$$

If the draftsman leaves $P_{\text{cell}}$ undefined, the system applies the **structural default invariant**:

$$t_{\text{mid}} \equiv t_{\text{wall\_ext}} \implies P_{\text{cell}} = S_{\text{clear}} + t_{\text{wall\_ext}}$$

The total structural width $W_{\text{total}}$ is governed by the scalar DAG relation:

$$W_{\text{total}} = N \cdot S_{\text{clear}} + (N - 1) \cdot t_{\text{mid}} + 2 \cdot t_{\text{ext}}$$

### 3.2 Procedural Repeat Expander Algorithm (`repeatExpander.ts`)

```ts
interface RepeatSpecification {
  sourceCellId: string;
  count: number;
  clearSpan: number;
  clearHeight: number;
  wallThickness: number;
  slabThickness: number;
  haunchSize: number;
  cellPitch?: number; // Optional user override
}

export function expandMultiCell(spec: RepeatSpecification): TopologyMutationResult {
  const pitch = spec.cellPitch ?? (spec.clearSpan + spec.wallThickness);
  const cells: CellInstance[] = [];

  for (let i = 0; i < spec.count; i++) {
    const originX = i * pitch;
    const originY = 0;
    
    // 1. Generate local cell boundary loop with stable indexed IDs
    const cellId = `cell[${i}]`;
    const loop = createHaunchedCellLoop({
      idPrefix: cellId,
      origin: { x: originX, y: originY },
      width: spec.clearSpan,
      height: spec.clearHeight,
      haunch: spec.haunchSize,
    });
    cells.push({ cellId, loop, index: i });
  }

  // 2. Synthesize intermediate dividing webs
  const intermediateWebs: WebSegment[] = [];
  for (let i = 0; i < spec.count - 1; i++) {
    const leftCell = cells[i];
    const rightCell = cells[i + 1];
    
    // Intermediate wall face extraction
    const web = createIntermediateWeb({
      id: `web[${i}_${i+1}]`,
      leftBoundaryId: `${leftCell.cellId}/edge_right`,
      rightBoundaryId: `${rightCell.cellId}/edge_left`,
      nominalThickness: pitch - spec.clearSpan,
    });
    intermediateWebs.push(web);
  }

  // 3. Generate exterior boundary envelope
  const totalWidth = (spec.count * spec.clearSpan) + 
                     ((spec.count - 1) * (pitch - spec.clearSpan)) + 
                     (2 * spec.wallThickness);
  const totalHeight = spec.clearHeight + (2 * spec.slabThickness);
  
  const outerEnvelope = createOuterEnvelope({
    id: 'envelope/outer',
    width: totalWidth,
    height: totalHeight,
    wallThickness: spec.wallThickness,
    slabThickness: spec.slabThickness,
  });

  return { cells, intermediateWebs, outerEnvelope };
}
```

---

## 4. Component Grouping, LCS Frames & Rigid Tracking

*(Solves Notebook Pages 3, 4 & 5: "First it consider a closed structed as a single unit... flexibility if I select a line in a group or not in a group... moving a line can move the whole geometry with it")*

When a draftsman selects a set of lines, arcs, or polylines and clicks **"Group into Component"**, the engine must not simply tag them with a common metadata string. It must instantiate a **Local Coordinate System (LCS)** and a **Rigid Cluster Node**.

### 4.1 3×3 Homogeneous Frame Definition
Every component $C$ defines a local frame $F_C = (\mathbf{O}, \mathbf{u}, \mathbf{v})$:

$$\mathbf{M}_{\text{local}\to\text{world}} = \begin{bmatrix} u_x & v_x & O_x \\ u_y & v_y & O_y \\ 0 & 0 & 1 \end{bmatrix} = \begin{bmatrix} \cos\theta & -\sin\theta & X_0 \\ \sin\theta & \cos\theta & Y_0 \\ 0 & 0 & 1 \end{bmatrix}$$

Every vertex $P_i$ within the group has fixed local coordinates $\mathbf{p}_{i,\text{local}} = (u_i, v_i)^T$. Its world coordinates are:

$$\mathbf{P}_{i,\text{world}} = \mathbf{M}_{\text{local}\to\text{world}} \begin{bmatrix} u_i \\ v_i \\ 1 \end{bmatrix} = \begin{bmatrix} X_0 + u_i \cos\theta - v_i \sin\theta \\ Y_0 + u_i \sin\theta + v_i \cos\theta \end{bmatrix}$$

### 4.2 Rigid Subgraph Condensation in the Solver
If the component is declared **Rigid** (e.g., a precast cell, a parapet post, or an authored cross-section), the solver does **not** allocate $2k$ independent variables for its $k$ vertices.

Instead, the component is condensed into **3 Degrees of Freedom**:

$$\mathbf{q}_{\text{comp}} = [X_0, Y_0, \theta]^T$$

#### Tracking external movements
When a draftsman sets a distance constraint between external Line $l_1$ and internal Line $l_2 \in C$:
1. Line $l_2$ is transformed by $\mathbf{M}(X_0, Y_0, \theta)$.
2. The residual $r(l_1, l_2(X_0, Y_0, \theta)) = 0$ is differentiated with respect to the component state $\mathbf{q}_{\text{comp}}$:
   $$\frac{\partial r}{\partial X_0} = \frac{\partial r}{\partial \mathbf{P}} \frac{\partial \mathbf{P}}{\partial X_0} = \frac{\partial r}{\partial \mathbf{P}} \begin{bmatrix} 1 \\ 0 \end{bmatrix}$$
   $$\frac{\partial r}{\partial Y_0} = \frac{\partial r}{\partial \mathbf{P}} \frac{\partial \mathbf{P}}{\partial Y_0} = \frac{\partial r}{\partial \mathbf{P}} \begin{bmatrix} 0 \\ 1 \end{bmatrix}$$
   $$\frac{\partial r}{\partial \theta} = \frac{\partial r}{\partial \mathbf{P}} \begin{bmatrix} -u \sin\theta - v \cos\theta \\ u \cos\theta - v \sin\theta \end{bmatrix}$$
3. **Outcome:** When Line $l_1$ is translated by $\Delta X$, the solver moves $X_0$ by $\Delta X$. Every line, vertex, and arc in component $C$ translates rigidly. **No distortion occurs.**

---

## 5. Geometric Collision, Spatial Overlap & Boolean Wall Merging

*(Solves Notebook Page 7: "distance closed up... they will start to overlap the sections; Green shaded: showing this part is needs to be cut or removed by building a bridge")*

```
 STEP 1: Motion towards overlap          STEP 2: Collision & Intersection          STEP 3: Planar Map Fusion (Union / Cut)
 ┌────────┐      ┌────────┐              ┌────────┬───────┐                       ┌───────────────┬───────┐
 │ Cell 1 │ ───► │ Cell 2 │      ───►    │ Cell 1 │///////│ Cell 2 │              │ Cell 1        │ Cell 2│
 │        │      │        │              │        │///////│        │     ───►     │ (Solid Web    │       │
 └────────┘      └────────┘              └────────┴───────┘                       │  Synthesized) │       │
   dist > 0                                Overlap: x' > x                        └───────────────┴───────┘
                                           (Green Shaded)                           Exterior boundary fused;
                                                                                    Shared web created.
```

When two independent components or cells are driven closer such that their clearance becomes zero or negative ($x' \le x$), real-world engineering requires that the structures either merge (monolithic construction) or form an expansion joint. The engine executes this through the **Topological Fusion Pipeline**:

### 5.1 The Fusion Protocol (`lib/topology/booleanFusion.ts`)
1. **Continuous Interference Broad-Phase:**  
   Using the R-Tree spatial index (`Flatbush`), components are monitored for bounding box collisions during drag or solver update.
2. **Intersection Detection (Bentley-Ottmann Sweep):**  
   When edge segments cross, true intersection points $\mathbf{P}_{\text{int}}$ are computed.
3. **Topological Classification:**
   - If the overlapping components are both marked `structural_concrete`:
     Execute a **Boolean Union** using Clipper2 (`ClipType.Union`).
   - The overlapping volume ("Green shaded area") is merged.
   - If two parallel boundary edges are within $\varepsilon_{\text{weld}} = 0.5\text{ mm}$, they collapse into a single shared intermediate web with thickness $t_{\text{mid}} = t_1 + t_2 - \text{overlap}$.
4. **DCEL Half-Edge Reconstruction:**  
   The half-edge planar map is regenerated:
   - Faces are re-traced.
   - Solid regions receive ANSI31 concrete hatching.
   - Interior boundary loops remain classified as voids (`nestingDepth % 2 !== 0`).

---

## 6. End-to-End Draftsman Workflow Architecture

The draftsman workflow is structured to require zero manual formula writing while maintaining transparency:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 1. DRAFTING & SELECTION                                     │
│  Draftsman draws lines/arcs/rectangles freely on 2D Canvas.                                 │
│  Snapping (P8 Coincident, P1 Parallel, P2 Perpendicular) hints render dynamically.         │
│  Draftsman selects loops and clicks "Create Component" (assigns LCS Frame).                 │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               2. INFERENCE & ADMISSIBILITY                                  │
│  GEOM-RP/1 evaluates P1–P10.                                                                │
│  1D DBSCAN clusters clearances into candidate parameters (e.g., WallThickness = 300 mm).    │
│  SVD Admissibility Filter: g_perp = (I - V V^T) g. Redundant = dropped, Conflicting = red.   │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            3. INTERACTIVE DIMENSION BADGES                                  │
│  Dimension badges appear directly on canvas.                                                │
│  Draftsman clicks any badge (e.g., "Clear Span: 2000") -> Enters 2500 -> Press Enter.       │
│  System determines if Driving or Derived. Solves variational minimum-norm update.           │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               4. REPEAT & ARRAY RULES                                       │
│  Draftsman clicks "Repeat Array" on Cell 0 -> Sets CellCount: 1 -> 3.                       │
│  Procedural Repeat Expander computes P_cell = S_clear + t_mid.                              │
│  DCEL instantiates 3 cells; haunches and wall thicknesses stay exactly constant.            │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          5. INVARIANT REPORT & TEMPLATE EXPORT                              │
│  System verifies: Residual < 1e-8, Haunch Angles = 45°, Wall Thickness Deviation = 0.00 mm. │
│  Save as Template -> Template is immediately runnable in User Mode.                         │
│  Exports to AutoCAD DXF (R2010 native DIMENSION entities), PDF Sheet, and 3D IFC.           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Concrete Implementation Roadmap (Actionable File Instructions)

The following modular implementation instructions address the identified failure modes:

### Module 1: Centroid Primitive & Constraint Engine
- **Target File:** `lib/geometry/predicates/centroidPredicates.ts` (NEW)
  - Implement shoelace area and moment partial derivatives ($\partial C_x / \partial X_j, \partial C_y / \partial X_j$).
  - Export `evaluateCentroid(points: Point[]): { center: Point, jacobian: Float64Array }`.
- **Target File:** `lib/parametric/constraints/centroidConstraint.ts` (NEW)
  - Implement $r_{\text{centroid\_dist}} = \|\mathbf{C}_A - \mathbf{C}_B\|^2 - D^2$.
  - Hook into `PlaneGCS` adapter and `levenbergMarquardt.ts`.

### Module 2: Relative Line Movement & Decoupled 2D Driving
- **Target File:** `lib/parametric/constraints/relativeLineConstraint.ts` (NEW)
  - Implement $r_{\Delta X}$, $r_{\Delta Y}$, and directed normal offset $r_{\text{offset}}$.
  - Ensure updating Line 1 propagates through the solver to translate Line 2.
- **Target File:** `lib/parametric/dragSolver.ts`
  - Implement Jacobian column scaling damping: $S_{jj} = 0.05$ (dragged), $1.0$ (free), $1000.0$ (anchored).

### Module 3: Procedural Multi-Cell & Pitch Expander
- **Target File:** `lib/parametric/component/repeatExpander.ts` (NEW)
  - Implement `expandMultiCell(spec)`.
  - Calculate default cell pitch: $P_{\text{cell}} = S_{\text{clear}} + t_{\text{mid}}$.
  - Deterministically generate index-stable entity IDs: `cell[i]/edge_top`, `web[i]/center`.
- **Target File:** `lib/parametric/component/haunchPreserver.ts` (NEW)
  - Enforce chirality barrier: $\Phi_{\text{barrier}} = -\mu \ln(\text{Area}_{\text{haunch}})$.
  - Restrict haunch geometry updates to local corner coordinate frames.

### Module 4: Rigid Component Grouping (LCS)
- **Target File:** `lib/geometry/lcs/componentFrame.ts` (NEW)
  - Bind primitive arrays to 3×3 homogeneous affine frames.
  - Implement solver condensation: evaluate components as 3-DOF super-nodes $(X_0, Y_0, \theta)$.

### Module 5: Topological Boolean Fusion & Edge Collapse
- **Target File:** `lib/topology/booleanFusion.ts` (NEW)
  - Integrate Clipper2 for automatic union of overlapping solid regions ($x' \le x$).
  - Implement shared web collapse: when two cell walls touch within $\varepsilon_{\text{weld}}$, merge into an intermediate web entity.

### Module 6: Dimension Badge Full Interactivity
- **Target File:** `features/canvas/DimensionBadge.tsx`
  - Remove `pointer-events-none` and `select-none`.
  - Implement `DISPLAY -> EDITING -> COMMIT` state machine.
  - On commit, invoke `ParameterManager.setDriving()`, write to constraint target value, and dispatch asynchronous solver update.

---

## 8. Verification & Acceptance Test Suite

The implementation is verified against the notebook scenarios using four automated integration tests:

```ts
import { describe, it, expect } from 'vitest';
import { expandMultiCell } from '../lib/parametric/component/repeatExpander';
import { solveLevenbergMarquardt } from '../lib/solver/levenbergMarquardt';
import { evaluateCentroidConstraint } from '../lib/parametric/constraints/centroidConstraint';

describe('Notebook Verification & Acceptance Gates', () => {

  it('Gate 1 (Notebook Pages 1 & 2): Multi-cell pitch & haunch preservation', async () => {
    // 1-cell box culvert: Span=2000, Height=1500, Wall=300, Slab=250, Haunch=150
    const singleCell = createTestBoxCulvert({ span: 2000, height: 1500, wall: 300, slab: 250, haunch: 150 });
    
    // Expand to 3 cells
    const multiCell = expandMultiCell({
      sourceCellId: singleCell.id,
      count: 3,
      clearSpan: 2000,
      clearHeight: 1500,
      wallThickness: 300,
      slabThickness: 250,
      haunchSize: 150
    });

    const result = await solveLevenbergMarquardt(multiCell.systemModel);

    expect(result.converged).toBe(true);
    expect(result.maxResidual).toBeLessThan(1e-8);
    
    // Verify invariants
    expect(multiCell.getIntermediateWebThickness(0)).toBeCloseTo(300.0, 3);
    expect(multiCell.getIntermediateWebThickness(1)).toBeCloseTo(300.0, 3);
    expect(multiCell.getExternalWallThickness('left')).toBeCloseTo(300.0, 3);
    expect(multiCell.getExternalWallThickness('right')).toBeCloseTo(300.0, 3);
    
    // Verify all 12 haunches remain exactly 45 deg with 150 mm legs
    multiCell.getAllHaunches().forEach(h => {
      expect(h.legHorizontal).toBeCloseTo(150.0, 2);
      expect(h.legVertical).toBeCloseTo(150.0, 2);
      expect(h.angleDeg).toBeCloseTo(45.0, 1);
    });

    // Verify total width = 3*2000 + 4*300 = 7200 mm
    expect(multiCell.calculateTotalWidth()).toBeCloseTo(7200.0, 2);
  });

  it('Gate 2 (Notebook Pages 4 & 5): Rigid Component Grouping & Relative Move', async () => {
    // Draw arbitrary triangle from loose lines
    const triangle = createPolygonComponent([
      { x: 0, y: 0 }, { x: 500, y: 0 }, { x: 250, y: 400 }
    ]);
    triangle.setRigid(true);

    // External guideline L1 at x = -200
    const lineL1 = createDatumLine({ x1: -200, y1: -100, x2: -200, y2: 500 });
    
    // Constrain triangle's leftmost line to L1 with distance = 200 mm
    const offsetConstraint = createDistanceConstraint(lineL1, triangle.getEdge(0), 200);

    // Move L1 to x = -500 (deltaX = -300)
    lineL1.translate(-300, 0);
    const solveResult = await solveLevenbergMarquardt(buildSystemModel([triangle, lineL1, offsetConstraint]));

    expect(solveResult.converged).toBe(true);
    // Assert triangle moved rigidly by exactly -300 mm without internal distortion
    expect(triangle.getVertex(0).x).toBeCloseTo(-300.0, 3);
    expect(triangle.getEdge(0).length).toBeCloseTo(500.0, 3);
    expect(triangle.getInternalAngle(0)).toBeCloseTo(57.99, 1);
  });

  it('Gate 3 (Notebook Page 8): Centroid-to-Centroid Active Driving', async () => {
    const rect1 = createRectangleComponent({ x: 0, y: 0, w: 400, h: 300 });
    const rect2 = createRectangleComponent({ x: 1000, y: 0, w: 400, h: 300 });

    // Initial centroids: C1 = (200, 150), C2 = (1200, 150). Distance = 1000
    const centroidConstraint = createCentroidDistanceConstraint(rect1, rect2, 600); // Drive distance -> 600

    const solveResult = await solveLevenbergMarquardt(buildSystemModel([rect1, rect2, centroidConstraint]));

    expect(solveResult.converged).toBe(true);
    const c1Post = rect1.computeCentroid();
    const c2Post = rect2.computeCentroid();
    const distancePost = Math.hypot(c2Post.x - c1Post.x, c2Post.y - c1Post.y);
    
    expect(distancePost).toBeCloseTo(600.0, 3);
    // Ensure shapes themselves were pulled closer symmetrically
    expect(rect2.origin.x - (rect1.origin.x + 400)).toBeCloseTo(200.0, 2);
  });

  it('Gate 4 (Notebook Page 7): Spatial Overlap & Boolean Wall Collapse', async () => {
    const cell1 = createBoxCell({ originX: 0, width: 2000, wall: 300 });
    const cell2 = createBoxCell({ originX: 2200, width: 2000, wall: 300 }); // 100mm gap

    // Drive cell2 into cell1 by setting distance to overlap by 200mm
    const fused = executeTopologicalFusion(cell1, cell2, { targetOverlap: 200 });

    // Verify Boolean Union generated clean planar map
    expect(fused.externalFaces.length).toBe(1); // Merged outer envelope
    expect(fused.voidFaces.length).toBe(2);     // Two preserved voids
    expect(fused.hasSelfIntersections()).toBe(false);
  });

});
```

---

## 9. Conclusion & Summary of Fixed Invariants

| Design Parameter / Behavior | Previous Broken State | Refactored UPCE-ADDENDUM-2.0 State |
|---|---|---|
| **Multi-cell Expansion ($1 \to N$)** | Voids scaled independently; haunches inverted; intermediate webs became irregular. | Procedural repeat expansion via pitch $P_{\text{cell}} = S_{\text{clear}} + t_{\text{mid}}$. Webs and haunches stay strictly constant. |
| **Loose Line Selection & Grouping** | Grouping did not enforce rigidity; constraining one line distorted the polygon. | Component grouped with LCS frame $(\mathbf{O}, \mathbf{u}, \mathbf{v})$ as a 3-DOF rigid cluster. Translates rigidly without distortion. |
| **Line-to-Line Relative Movement** | Required manual formula entry; movement failed to propagate to neighbouring lines. | Directed 2D residuals ($\Delta X, \Delta Y, P3$) actively drive the minimum-norm update. |
| **Centroid Driving Constraints** | Centroids were read-only post-solve text values. | First-class analytical constraint ($P10$) with exact shoelace partial derivatives. |
| **Component Overlap ($x' > x$)** | Shapes intersected destructively, corrupting the DCEL loop. | Automatic Clipper2 / DCEL Boolean Fusion merges solids and synthesizes intermediate webs. |
| **Dimension Badges** | Unclickable, static `<text>` elements. | Active `DISPLAY -> EDITING -> COMMIT` widgets initiating bidirectional variational solves. |