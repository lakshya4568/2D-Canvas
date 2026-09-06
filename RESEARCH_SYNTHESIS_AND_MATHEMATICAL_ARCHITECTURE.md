# Parametric CAD Template Engine: Deep Research Synthesis, Mathematical Architecture, and Solver Blueprint

> **Document Type**: Comprehensive Research Synthesis, Mathematical Proof Compendium, and Architectural Specification  
> **Target System**: 2D Canvas Studio & Bridge Parametric Template Engine  
> **Status**: Verified against Codebase (`github.com/lakshya4568/2D-Canvas`), Academic Literature (Autodesk ICCV 2025, FreeCAD PlaneGCS, Dulmage-Mendelsohn 1958), and Adversarial Multi-Agent Deliberation  

---

## Table of Contents
1. [Executive Summary & The "Why"](#1-executive-summary--the-why)
2. [The Core Architectural Split: Draftsman Mode vs. Author Mode](#2-the-core-architectural-split-draftsman-mode-vs-author-mode)
3. [Mathematical Foundations & Exact Proofs](#3-mathematical-foundations--exact-proofs)
   - 3.1 [Variational State Space & Residual Vector Formulation](#31-variational-state-space--residual-vector-formulation)
   - 3.2 [Exact Analytical Jacobians (Derivations & Proofs)](#32-exact-analytical-jacobians-derivations--proofs)
   - 3.3 [Dulmage-Mendelsohn (DM) Decomposition & Bipartite Graph Solvability](#33-dulmage-mendelsohn-dm-decomposition--bipartite-graph-solvability)
   - 3.4 [Proof of Failure of the Global Scalar Grübler Mobility Criterion](#34-proof-of-failure-of-the-global-scalar-grbler-mobility-criterion)
   - 3.5 [Powell's Dogleg Trust-Region Method with SVD Regularization](#35-powells-dogleg-trust-region-method-with-svd-regularization)
   - 3.6 [SolveSpace 1/20 Column Damping for Distortion-Free Dragging](#36-solvespace-120-column-damping-for-distortion-free-dragging)
   - 3.7 [Proof of the Levenberg-Marquardt Predicted Reduction Defect](#37-proof-of-the-levenberg-marquardt-predicted-reduction-defect)
   - 3.8 [SVD Row-Space Projection Admissibility Filter](#38-svd-row-space-projection-admissibility-filter)
4. [The Universal Port Protocol & Component Generalization](#4-the-universal-port-protocol--component-generalization)
   - 4.1 [The Generalization Problem: Moving Beyond Nested Rectangles](#41-the-generalization-problem-moving-beyond-nested-rectangles)
   - 4.2 [Port Specification & Schema](#42-port-specification--schema)
   - 4.3 [Affine Frame Composition & O(1) Kinematic Resolution](#43-affine-frame-composition--o1-kinematic-resolution)
   - 4.4 [Anisotropic Multi-Cell Bay Spanning Mathematics](#44-anisotropic-multi-cell-bay-spanning-mathematics)
   - 4.5 [Cross-View Semantic Identity](#45-cross-view-semantic-identity)
5. [AutoFormula & Geometric Inference Pipeline](#5-autoformula--geometric-inference-pipeline)
   - 5.1 [5-Stage Inference Architecture](#51-5-stage-inference-architecture)
   - 5.2 [Closed-Loop Rank-Preserving Greedy Filter (Autodesk RLOO Model)](#52-closed-loop-rank-preserving-greedy-filter-autodesk-rloo-model)
   - 5.3 [Static Discovery vs. Dynamic Drag-Invariance Tracing](#53-static-discovery-vs-dynamic-drag-invariance-tracing)
6. [Codebase Ground-Truth Autopsy & Debt Analysis](#6-codebase-ground-truth-autopsy--debt-analysis)
   - 6.1 [Audit of `lib/parametric/model.ts` (Switch Statements & Name Collisions)](#61-audit-of-libparametricmodelts-switch-statements--name-collisions)
   - 6.2 [Audit of `lib/parametric/dualGraphOrchestrator.ts` (The Substring Bug)](#62-audit-of-libparametricdualgraphorchestratorts-the-substring-bug)
   - 6.3 [Audit of `lib/solver/levenbergMarquardt.ts` (Convergence & Damping Bugs)](#63-audit-of-libsolverlevenbergmarquardtts-convergence--damping-bugs)
   - 6.4 [Audit of `features/canvas/DimensionBadge.tsx` & `ParametricDimensionOverlay.tsx`](#64-audit-of-featurescanvasdimensionbadgetsx--parametricdimensionoverlaytsx)
   - 6.5 [Audit of Dormant & Dead Code Modules](#65-audit-of-dormant--dead-code-modules)
   - 6.6 [Analysis of the 6 Failing Tests](#66-analysis-of-the-6-failing-tests)
7. [Numerical Solver Architecture: PlaneGCS WASM Worker Integration](#7-numerical-solver-architecture-planegcs-wasm-worker-integration)
8. [Comprehensive Execution Roadmap: Waves 0 Through 6](#8-comprehensive-execution-roadmap-waves-0-through-6)
9. [Atomic Commit Strategy & Verification Quality Gates](#9-atomic-commit-strategy--verification-quality-gates)

---

## 1. Executive Summary & The "Why"

### 1.1 The Practical Problem in Civil Infrastructure Drafting
Civil infrastructure drawings—such as Indian Railways Research Designs and Standards Organisation (RDSO) standard bridge General Arrangement Drawings (GADs), culvert cross-sections, and composite road over-bridges (ROBs)—repeat identical geometric and structural rules across thousands of projects. 

Historically, engineering organizations face two systemic failure modes:
- **Path A (Hardcoded Procedural Renderers)**: Software developers write bespoke TypeScript or C++ scripts that compute absolute coordinate offsets (`x = 500`, `y = 200 + wallThickness`). These are rigid; when a project encounters real site conditions (skew angle, asymmetric spans, varying soil strata), the renderer breaks, requiring engineering code changes.
- **Path B (Blank-Sheet Redrafting)**: A draftsman opens AutoCAD or 2D-Canvas and draws the entire drawing from scratch by hand, tracing every line and dimension, discarding all previously validated RDSO design knowledge.

### 1.2 The Non-Negotiable Contract
The objective is to capture the structural design logic **once** as a reusable parametric template. However, this objective fails if authoring a template requires software engineering skills—declaring variables, writing mathematical expressions, and debugging dependency graphs. 

> **The Non-Negotiable Principle**:  
> A draftsman's job is to draft. It is not to build forms, write formulas, or wire fields. The system must infer geometric relationships automatically from drawn geometry, allow senior authors to curate these relationships via single-click confirmations, and allow draftsmen to drive production drawings purely through on-canvas dimensions and direct manipulation.

---

## 2. The Core Architectural Split: Draftsman Mode vs. Author Mode

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DRAFTSMAN MODE (95% of Users)                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • On-Canvas Direct Manipulation: Drag vertices, edges, and handles.                    │
│ • First-Class Dimension Badges: Click a dimension, type "700", press Enter.            │
│ • Zero Mathematical Formulas: Internal variables and DAG edges are completely hidden.  │
│ • Visual DOF Guidance:                                                                 │
│     - Blue: Under-constrained geometry (can be moved).                                 │
│     - Green/Black: Fully-constrained geometry (locked relative to local frame).        │
│     - Red: Over-constrained conflict with plain-language resolution guidance.         │
│ • Component Insertion: Insert "2-Cell Box Culvert", adjust 6 driving parameters.       │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              TEMPLATE AUTHOR MODE (5% of Power Users)                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ • Canonical Drafting: Draw standard cross-section or bridge view once.                 │
│ • AutoFormula Inference Panel: System proposes atomic relationships:                   │
│     - Wall Thickness: OuterWidth - 2 * WallThk (Confidence: 98%)                       │
│     - Haunch Invariant: 45° Chamfer Leg Equality (Confidence: 99%)                     │
│     - Web Spacing: Bay2_X = Bay1_X + ClearSpan + WebThk (Confidence: 95%)              │
│ • Role Classification: Mark parameters as DRIVING (user input), DERIVED, or FIXED.    │
│ • Universal Port Definition: Click boundary points/edges to expose connection ports.   │
│ • Repeat Rule Builder: Define multi-cell array expansion rules (`CellCount`).          │
│ • Regulatory Traceability: Tag templates with IRC/RDSO code revisions and bounds.      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Mathematical Foundations & Exact Proofs

### 3.1 Variational State Space & Residual Vector Formulation
Let the 2D CAD sketch be represented as an unconstrained Euclidean state vector $\mathbf{X} \in \mathbb{R}^{2n}$, composed of the coordinates of all $n$ topologically unique vertices:
$$\mathbf{X} = \begin{bmatrix} x_1 & y_1 & x_2 & y_2 & \dots & x_n & y_n \end{bmatrix}^T$$

Geometric constraints and user driving dimensions form a system of $m$ non-linear scalar residual equations $\mathbf{F}(\mathbf{X}) = \mathbf{0}$, where $\mathbf{F}: \mathbb{R}^{2n} \to \mathbb{R}^m$:
$$\mathbf{F}(\mathbf{X}) = \begin{bmatrix} r_1(\mathbf{X}) & r_2(\mathbf{X}) & \dots & r_m(\mathbf{X}) \end{bmatrix}^T = \mathbf{0}$$

A geometric configuration is satisfied if and only if $\|\mathbf{F}(\mathbf{X})\|_\infty < \epsilon_{\text{tol}}$ (typically $10^{-7}\text{ mm}$).

---

### 3.2 Exact Analytical Jacobians (Derivations & Proofs)

To guarantee quadratic convergence in non-linear solving, the engine evaluates the exact Jacobian matrix $\mathbf{J}(\mathbf{X}) \in \mathbb{R}^{m \times 2n}$, where $J_{ij} = \frac{\partial r_i}{\partial X_j}$.

#### 1. Point-to-Point Euclidean Distance Residual (Driving Dimension)
Let $P_i = (x_i, y_i)$ and $P_j = (x_j, y_j)$ be two constrained vertices, with target distance $D > 0$.
To prevent square root singularities when points coincide ($P_i = P_j$), the residual is formulated quadratically:
$$r_{\text{dist}}(\mathbf{X}) = (x_j - x_i)^2 + (y_j - y_i)^2 - D^2 = 0$$

**Partial Derivatives**:
$$\frac{\partial r_{\text{dist}}}{\partial x_i} = -2(x_j - x_i), \quad \frac{\partial r_{\text{dist}}}{\partial y_i} = -2(y_j - y_i)$$
$$\frac{\partial r_{\text{dist}}}{\partial x_j} = 2(x_j - x_i), \quad \frac{\partial r_{\text{dist}}}{\partial y_j} = 2(y_j - y_i)$$
All other entries in this row of $\mathbf{J}$ are identically zero.

#### 2. Horizontal & Vertical Alignment Residuals
For horizontal alignment between $P_i$ and $P_j$:
$$r_{\text{horiz}}(\mathbf{X}) = y_j - y_i = 0 \implies \frac{\partial r_{\text{horiz}}}{\partial y_j} = 1, \quad \frac{\partial r_{\text{horiz}}}{\partial y_i} = -1$$

For vertical alignment between $P_i$ and $P_j$:
$$r_{\text{vert}}(\mathbf{X}) = x_j - x_i = 0 \implies \frac{\partial r_{\text{vert}}}{\partial x_j} = 1, \quad \frac{\partial r_{\text{vert}}}{\partial x_i} = -1$$

#### 3. Point-to-Line Perpendicular Offset Residual (Wall Thickness Invariant)
Given an oriented datum edge from $P_a = (x_a, y_a)$ to $P_b = (x_b, y_b)$ and an offset point $P_p = (x_p, y_p)$, the perpendicular distance from $P_p$ to line $P_a P_b$ must equal design wall thickness $T$.

Let:
$$\Delta x = x_b - x_a, \quad \Delta y = y_b - y_a, \quad L = \sqrt{\Delta x^2 + \Delta y^2}$$
The unit normal to the edge is $\hat{\mathbf{n}} = \frac{1}{L} \begin{bmatrix} -\Delta y \\ \Delta x \end{bmatrix}$.
The signed perpendicular offset numerator is:
$$N = -\Delta y (x_p - x_a) + \Delta x (y_p - y_a) = (x_b - x_a)(y_a - y_p) - (x_a - x_p)(y_b - y_a)$$
The residual is:
$$r_{\text{offset}}(\mathbf{X}) = \frac{N}{L} - T = 0$$

**Exact Jacobian Row**:
$$\frac{\partial r_{\text{offset}}}{\partial x_p} = \frac{y_b - y_a}{L}, \quad \frac{\partial r_{\text{offset}}}{\partial y_p} = -\frac{x_b - x_a}{L}$$
$$\frac{\partial r_{\text{offset}}}{\partial x_a} = \frac{-(y_a - y_p) - (y_b - y_a)}{L} - \frac{N(x_a - x_b)}{L^3}$$
$$\frac{\partial r_{\text{offset}}}{\partial y_a} = \frac{(x_b - x_a) + (x_a - x_p)}{L} - \frac{N(y_a - y_b)}{L^3}$$

#### 4. $45^\circ$ Haunch Chamfer Leg-Equality Residual
In civil culverts, chamfers connect slab edges to wall edges at $45^\circ$.
Let $P_c = (x_c, y_c)$ be the virtual intersection corner, $P_1 = (x_1, y_1)$ be the chamfer start on the horizontal slab ($y_1 = y_c$), and $P_2 = (x_2, y_2)$ be the chamfer end on the vertical wall ($x_2 = x_c$).
Formulating the residual using absolute values ($|x_1 - x_c| - |y_2 - y_c| = 0$) introduces a non-smooth derivative discontinuity at zero. We prove that a quadratic formulation maintains $C^1$ smoothness everywhere:
$$r_{\text{haunch}}(\mathbf{X}) = (x_1 - x_c)^2 - (y_2 - y_c)^2 = 0$$

**Exact Jacobian Row**:
$$\frac{\partial r_{\text{haunch}}}{\partial x_1} = 2(x_1 - x_c), \quad \frac{\partial r_{\text{haunch}}}{\partial x_c} = -2(x_1 - x_c)$$
$$\frac{\partial r_{\text{haunch}}}{\partial y_2} = -2(y_2 - y_c), \quad \frac{\partial r_{\text{haunch}}}{\partial y_c} = 2(y_2 - y_c)$$

---

### 3.3 Dulmage-Mendelsohn (DM) Decomposition & Bipartite Graph Solvability

```
Coordinates V = {x₁, y₁, ..., xₙ, yₙ}       Constraints C = {r₁, r₂, ..., rₘ}
          ┌──────────────┐                            ┌──────────────┐
          │   V_under    │◄──── Unmatched Variables ──│  C_under = ∅ │ (Under-constrained: DOF > 0)
          ├──────────────┤      Alternating Paths     ├──────────────┤
          │   V_square   │◄════ Perfect Matching ════►│   C_square   │ (Well-constrained: Solved by Dogleg)
          ├──────────────┤                            ├──────────────┤
          │  V_over = ∅  │── Unmatched Constraints ──►│    C_over    │ (Over-constrained: Conflicts & Redundancies)
          └──────────────┘                            └──────────────┘
```

#### Theorem (Dulmage & Mendelsohn, 1958)
Let $G = (V, C, E)$ be a bipartite graph representing coordinate variables $V$ and constraint equations $C$. Let $M \subseteq E$ be a maximum cardinality matching obtained via the **Hopcroft-Karp algorithm** in $O(|E|\sqrt{|V|})$ time. 

The vertex sets $V$ and $C$ uniquely decompose into three canonical subgraphs:
1. **Under-Constrained Subsystem ($V_{\text{under}}, C_{\text{under}}$)**:
   - $V_{\text{under}}$ contains all vertices reachable via alternating paths starting from unmatched vertices in $V$.
   - $C_{\text{under}}$ contains all constraint vertices on these paths.
   - **Properties**: $|V_{\text{under}}| > |C_{\text{under}}|$. The local structural degree of freedom is $\text{DOF}_{\text{local}} = |V_{\text{under}}| - |C_{\text{under}}| > 0$.
   - **CAD Meaning**: Highlights free geometry in blue. Allows direct manipulation dragging without constraint violation.
2. **Over-Constrained Subsystem ($V_{\text{over}}, C_{\text{over}}$)**:
   - $C_{\text{over}}$ contains all vertices reachable via alternating paths starting from unmatched constraints in $C$.
   - $V_{\text{over}}$ contains all variable vertices on these paths.
   - **Properties**: $|C_{\text{over}}| > |V_{\text{over}}|$.
   - **CAD Meaning**: Isolates the exact minimal subset of contradictory or redundant constraints. Highlights conflicting dimensions in red.
3. **Square / Well-Constrained Subsystem ($V_{\text{square}}, C_{\text{square}}$)**:
   - The remaining vertices, where $|V_{\text{square}}| = |C_{\text{square}}|$. Every maximum matching restricts to a perfect matching on this subgraph.

#### Block Triangular Form (BTF) via Tarjan's Strongly Connected Components
To solve $G_{\text{square}}$ without inverting a large global matrix, we orient all matched edges $e \in M$ from $V \to C$ and all unmatched edges $e \in E \setminus M$ from $C \to V$.
Running **Tarjan's SCC algorithm** ($O(|V| + |E|)$) partitions the system into irreducible coupled components $S_1, S_2, \dots, S_k$.
The topological sort of the condensation DAG yields the Block Triangular Form:
$$\begin{bmatrix}
\mathbf{A}_{11} & \mathbf{0} & \dots & \mathbf{0} \\
\mathbf{A}_{21} & \mathbf{A}_{22} & \dots & \mathbf{0} \\
\vdots & \vdots & \ddots & \vdots \\
\mathbf{A}_{k1} & \mathbf{A}_{k2} & \dots & \mathbf{A}_{kk}
\end{bmatrix}
\begin{bmatrix} \mathbf{X}_1 \\ \mathbf{X}_2 \\ \vdots \\ \mathbf{X}_k \end{bmatrix} = \begin{bmatrix} \mathbf{B}_1 \\ \mathbf{B}_2 \\ \vdots \\ \mathbf{B}_k \end{bmatrix}$$
- Blocks where $|S_i| = 1$ or $2$ are solved in $O(1)$ by direct geometric substitution.
- Only coupled non-linear loops (e.g. mutual tangency networks) require multi-variable iterative Dogleg.

---

### 3.4 Proof of Failure of the Global Scalar Grübler Mobility Criterion

In the existing codebase (`lib/parametric/graph/bipartiteGraph.ts:41-54`), degrees of freedom are evaluated as:
$$\text{DOF}_{\text{scalar}} = \max\left(0, \sum \text{entity.dof} - \sum \text{constraint.dof} - 3\right)$$
where $3$ represents planar rigid-body motions ($2$ translations, $1$ rotation).

#### Mathematical Proof of Failure:
1. **Disconnected Component Counterexample**:
   Consider a drawing containing two physically disjoint structural assemblies: a bridge abutment $A_1$ (10 vertices, 20 DOFs, 17 constraints) and an independent retaining wall $A_2$ (8 vertices, 16 DOFs, 13 constraints).
   Each assembly is free to move rigidly in the plane, requiring $3 + 3 = 6$ rigid-body DOFs.
   The true mobility is:
   $$\text{DOF}_{\text{true}} = (20 - 17 - 3) + (16 - 13 - 3) = 0 + 0 = 0 \quad (\text{Both internally rigid})$$
   However, the global scalar formula evaluates:
   $$\text{DOF}_{\text{scalar}} = (20 + 16) - (17 + 13) - 3 = 36 - 30 - 3 = 3$$
   The formula falsely reports that the assemblies are under-constrained by 3 degrees of freedom, allowing invalid deformation.
2. **Anchored Structure Counterexample**:
   If an engineer anchors vertex $P_1$ to world origin $(0,0)$ via two fixed constraints, the planar rigid-body degrees of freedom are eliminated ($0$ rigid motions remain). The formula still subtracts $3$, under-counting DOFs by 3 and falsely reporting that valid sketches are over-constrained.

**Conclusion**: The scalar Grübler equation must be replaced by the per-component Dulmage-Mendelsohn decomposition.

---

### 3.5 Powell's Dogleg Trust-Region Method with SVD Regularization

Standard Newton-Raphson stalls when the Jacobian is ill-conditioned, and pure Levenberg-Marquardt converges slowly when far from the solution. Powell's Dogleg combines the rapid descent of the Cauchy steepest descent step with the quadratic convergence of the Gauss-Newton step within an adaptive trust region of radius $\Delta_k$.

```
               h_gn (Gauss-Newton Step: - (J^T J)^-1 J^T F)
                    o
                   /
                  / 
                 /  Dogleg Trajectory h(tau)
                /   
  h_sd x-------o Current Iterate X_k
 (Cauchy Step) \
                \  Trust Region Boundary ||h|| = Delta_k
```

At iteration $k$ with residual vector $\mathbf{F}_k = \mathbf{F}(\mathbf{X}_k)$ and Jacobian $\mathbf{J}_k = \mathbf{J}(\mathbf{X}_k)$:
1. **Cauchy Steepest Descent Step ($\mathbf{h}_{\text{sd}}$)**:
   $$\mathbf{g}_k = \mathbf{J}_k^T \mathbf{F}_k, \quad \alpha = \frac{\|\mathbf{g}_k\|^2}{\|\mathbf{J}_k \mathbf{g}_k\|^2}, \quad \mathbf{h}_{\text{sd}} = -\alpha \mathbf{g}_k$$
2. **Gauss-Newton Step ($\mathbf{h}_{\text{gn}}$)**:
   Solves the linearized least-squares subproblem $\mathbf{J}_k \mathbf{h}_{\text{gn}} = -\mathbf{F}_k$.
   Using Thin Singular Value Decomposition ($\mathbf{J}_k = \mathbf{U} \mathbf{\Sigma} \mathbf{V}^T$), the minimum-norm step is:
   $$\mathbf{h}_{\text{gn}} = -\mathbf{J}_k^+ \mathbf{F}_k = -\sum_{i=1}^r \frac{\mathbf{u}_i^T \mathbf{F}_k}{\sigma_i} \mathbf{v}_i$$
3. **Dogleg Path Parameterization $\mathbf{h}(\tau)$**:
   $$\mathbf{h}(\tau) = \begin{cases}
   \tau \mathbf{h}_{\text{sd}} & 0 \le \tau \le 1 \\
   \mathbf{h}_{\text{sd}} + (\tau - 1)(\mathbf{h}_{\text{gn}} - \mathbf{h}_{\text{sd}}) & 1 < \tau \le 2
   \end{cases}$$
   - If $\|\mathbf{h}_{\text{gn}}\| \le \Delta_k$, take the full Gauss-Newton step ($\tau = 2$).
   - If $\|\mathbf{h}_{\text{sd}}\| \ge \Delta_k$, scale the Cauchy step: $\mathbf{h} = \frac{\Delta_k}{\|\mathbf{h}_{\text{sd}}\|} \mathbf{h}_{\text{sd}}$.
   - Otherwise, solve the quadratic equation $\|\mathbf{h}_{\text{sd}} + \beta(\mathbf{h}_{\text{gn}} - \mathbf{h}_{\text{sd}})\|^2 = \Delta_k^2$ for $\beta \in [0, 1]$.
4. **Gain Ratio & Trust-Region Adaptation**:
   $$\rho_k = \frac{\|\mathbf{F}(\mathbf{X}_k)\|^2 - \|\mathbf{F}(\mathbf{X}_k + \mathbf{h})\|^2}{\|\mathbf{F}(\mathbf{X}_k)\|^2 - \|\mathbf{F}(\mathbf{X}_k) + \mathbf{J}_k \mathbf{h}\|^2}$$
   - If $\rho_k > 0.75$ and $\|\mathbf{h}\| \approx \Delta_k$: expand trust radius $\Delta_{k+1} = \min(2\Delta_k, \Delta_{\max})$.
   - If $\rho_k < 0.25$: reject step, shrink trust radius $\Delta_{k+1} = 0.5 \Delta_k$.
   - Otherwise: accept step $\mathbf{X}_{k+1} = \mathbf{X}_k + \mathbf{h}$.

---

### 3.6 SolveSpace 1/20 Column Damping for Distortion-Free Dragging

#### The Problem of Naive Interactive Dragging
When a draftsman grabs a vertex $P_d = (x_d, y_d)$ and drags it with the mouse to target position $(x_{\text{mouse}}, y_{\text{mouse}})$, naive least-squares optimization minimizes the global coordinate displacement $\|\Delta \mathbf{X}\|_2^2 = \sum_{i=1}^n (\Delta x_i^2 + \Delta y_i^2)$.
Because moving the dragged vertex incurs the same quadratic penalty as moving any un-dragged vertex, the solver splits the displacement across the entire model: the dragged vertex lags behind the mouse, while distant un-dragged walls, haunches, and piers warp unexpectedly.

#### The SolveSpace Column Scaling Theorem
Let $\mathbf{S} = \operatorname{diag}(s_1, s_2, \dots, s_{2n})$ be a diagonal parameter metric scaling matrix:
$$s_j = \begin{cases}
\frac{1}{20} = 0.05 & \text{if coordinate } j \in \{x_d, y_d\} \quad (\text{Dragged entity}) \\
1.0 & \text{otherwise} \quad (\text{Free un-dragged geometry})
\end{cases}$$

Define the scaled variable substitution $\tilde{\mathbf{X}} = \mathbf{S}^{-1} \mathbf{X}$. The objective function becomes:
$$\min \|\Delta \tilde{\mathbf{X}}\|_2^2 = \min \left[ \left(\frac{\Delta x_d}{0.05}\right)^2 + \left(\frac{\Delta y_d}{0.05}\right)^2 + \sum_{i \neq d} (\Delta x_i^2 + \Delta y_i^2) \right]$$

Moving the dragged coordinates away from the cursor incurs a **400:1 penalty** ($(1/0.05)^2 = 20^2 = 400$) relative to moving un-dragged geometry. Consequently, the unconstrained degrees of freedom in the sketch absorb the motion 20 times more readily, tracking the cursor accurately while maintaining structural rigidity across the rest of the assembly.

#### Numerically Stable Implementation:
Forming the normal equations $\mathbf{J} \mathbf{S}^2 \mathbf{J}^T$ squares the condition number ($\kappa(\mathbf{J}) \to \kappa(\mathbf{J})^2$), risking floating-point breakdown.
Instead, we scale the columns directly $\tilde{\mathbf{J}} = \mathbf{J} \mathbf{S}$, compute the Thin QR Decomposition $\tilde{\mathbf{J}}^T = \mathbf{Q} \mathbf{R}$, and solve the minimum-norm update via back-substitution:
$$\mathbf{R}^T \mathbf{y} = -\mathbf{F}(\mathbf{X}_k) \implies \Delta \mathbf{X} = \mathbf{S} \mathbf{Q} \mathbf{y}$$
This preserves the condition number $\kappa(\tilde{\mathbf{J}})$, ensuring numerical stability at 60 FPS.

---

### 3.7 Proof of the Levenberg-Marquardt Predicted Reduction Defect

In `lib/solver/levenbergMarquardt.ts:116-119`, the predicted reduction is computed as:
```typescript
let predictedReduction = 0.0;
for (let i = 0; i < n; i++) {
  predictedReduction += deltaX[i] * (lambda * deltaX[i] - g[i]);
}
```

#### Mathematical Proof of Error:
The second-order Taylor expansion of the objective function $\psi(\mathbf{h}) = \frac{1}{2} \|\mathbf{F}(\mathbf{X} + \mathbf{h})\|^2$ is:
$$\psi(\mathbf{h}) \approx \psi(\mathbf{0}) + \mathbf{g}^T \mathbf{h} + \frac{1}{2} \mathbf{h}^T \mathbf{J}^T \mathbf{J} \mathbf{h}$$
The predicted reduction $\Delta L(\mathbf{h}) = \psi(\mathbf{0}) - \psi(\mathbf{h})$ is:
$$\Delta L(\mathbf{h}) = -\mathbf{g}^T \mathbf{h} - \frac{1}{2} \mathbf{h}^T \mathbf{J}^T \mathbf{J} \mathbf{h}$$
In the Levenberg-Marquardt step, $\mathbf{h}$ satisfies the damped normal equations:
$$(\mathbf{J}^T \mathbf{J} + \lambda \mathbf{I})\mathbf{h} = -\mathbf{g} \implies \mathbf{J}^T \mathbf{J} \mathbf{h} = -\mathbf{g} - \lambda \mathbf{h}$$
Substituting into the reduction equation:
$$\Delta L(\mathbf{h}) = -\mathbf{g}^T \mathbf{h} - \frac{1}{2} \mathbf{h}^T (-\mathbf{g} - \lambda \mathbf{h}) = -\mathbf{g}^T \mathbf{h} + \frac{1}{2} \mathbf{g}^T \mathbf{h} + \frac{1}{2} \lambda \|\mathbf{h}\|^2 = \frac{1}{2} \mathbf{h}^T (\lambda \mathbf{h} - \mathbf{g})$$

The existing implementation omits the factor of $\frac{1}{2}$, calculating $2 \Delta L(\mathbf{h})$.
Because $\Delta L$ is doubled, the gain ratio $\rho = \frac{\Delta F_{\text{actual}}}{\Delta L_{\text{predicted}}}$ is halved. 
Steps that should have triggered a reduction in damping ($\rho > 0.75$) fail the check, keeping $\lambda$ artificially high and forcing the solver into slow steepest descent rather than quadratic Gauss-Newton convergence.

---

### 3.8 SVD Row-Space Projection Admissibility Filter

To prevent over-constraining sketches during AI AutoFormula inference, every candidate constraint $c_{\text{new}}$ with residual $f_{\text{new}}(\mathbf{X}) = 0$ and gradient vector $\mathbf{g} = \nabla f_{\text{new}}(\mathbf{X}) \in \mathbb{R}^{2n}$ must be tested before graph insertion.

Using the SVD of the existing system Jacobian $\mathbf{J} = \mathbf{U} \mathbf{\Sigma} \mathbf{V}^T$, the orthogonal projection of $\mathbf{g}$ onto the row space of $\mathbf{J}$ is:
$$\mathbf{g}_{\text{proj}} = \mathbf{J}^+ \mathbf{J} \mathbf{g} = \mathbf{V} \mathbf{V}^T \mathbf{g} = \sum_{i=1}^r (\mathbf{v}_i^T \mathbf{g}) \mathbf{v}_i$$
The perpendicular component orthogonal to all existing constraints is:
$$\mathbf{g}_{\perp} = \mathbf{g} - \mathbf{g}_{\text{proj}} = (\mathbf{I} - \mathbf{J}^+ \mathbf{J}) \mathbf{g}$$

```
                  Gradient Vector g = grad(f_new)
                             ^
                             | \
             Perpendicular   |   \
             Component g_perp|     \  g
           (||g_perp|| >= eps|       \
             -> ADMISSIBLE)  |         \
                             +----------> Projection onto existing row space
                                           g_proj = J^+ J g
```

#### The Admissibility Decision Boundary:
1. **Case 1: $\|\mathbf{g}_\perp\|_2 \ge \epsilon_{\text{tol}}$ ($10^{-6}$)**:
   The candidate introduces a genuine, linearly independent kinematic restriction.  
   **Action**: `ADMISSIBLE`. Safely insert into the constraint graph.
2. **Case 2: $\|\mathbf{g}_\perp\|_2 < \epsilon_{\text{tol}}$ and $|f_{\text{new}}(\mathbf{X})| \le \epsilon_{\text{residual}}$**:
   The candidate is linearly dependent on existing constraints, but mathematically satisfied.  
   **Action**: `REDUNDANT`. Discard silently without prompting the user.
3. **Case 3: $\|\mathbf{g}_\perp\|_2 < \epsilon_{\text{tol}}$ and $|f_{\text{new}}(\mathbf{X})| > \epsilon_{\text{residual}}$**:
   The candidate directly contradicts existing geometry (e.g. attempting to force a $300\text{ mm}$ line to measure $400\text{ mm}$ when its endpoints are already fixed).  
   **Action**: `CONFLICTING`. Reject and prompt user with plain-language conflict diagnosis.

---

## 4. The Universal Port Protocol & Component Generalization

### 4.1 The Generalization Problem: Moving Beyond Nested Rectangles
Every previous draft in the codebase assumed a bridge was structurally synonymous with nested rectangles: an outer box, an inner hole, and four corner haunches.
However, real civil infrastructure requires diverse component topologies:
- Box culverts (anisotropic multi-cell nested loops).
- T-beam and I-girder bridges (periodic slab/web assemblies).
- Retaining wing walls and return walls (skewed trapezoids extending from corners).
- Parapet railings and crash barriers (point-repeat arrays along an arbitrary curve).

To support arbitrary user-designed components, the engine introduces the **Universal Port Protocol**.

---

### 4.2 Port Specification & Schema

A **Port** is a named, oriented local coordinate anchor exposed by a component:

```typescript
export interface Port {
  id: string;                      // Unique port identifier: e.g. "cell_wall_right", "bearing_seat_1"
  label: string;                   // Human-readable: "Right Cell Dividing Wall"
  kind: 'point' | 'edge' | 'surface';
  localOrigin: { x: string; y: string }; // Coordinate expressions in component's local frame
  localAngleDeg: string;           // Orientation expression (degrees): e.g. "0" or "skew_angle"
  compatiblePortKinds: string[];   // Type safety: e.g. ["cell_wall", "pier_cap"]
}

export interface ComponentDefinition {
  id: string;                      // e.g. "rcc_box_cell", "return_wing_wall", "railing_post"
  name: string;
  category: 'superstructure' | 'substructure' | 'appurtenance' | 'general';
  standardsReference?: string;     // e.g. "RDSO/B-10151/R", "IRC:SP:13"
  parameters: TemplateParameterConfig[];
  ports: Port[];
  shapes: AnyShape[];
  constraints: ConstraintBinding[];
  repeats?: RepeatRule[];
}

export interface ComponentInstance {
  instanceId: string;
  templateId: string;
  parameterOverrides: Record<string, number | string>;
  attachedVia?: {
    parentInstanceId: string;
    parentPortId: string;
    ownPortId: string;
    offsetExpr?: { dx: string; dy: string; dAngle?: string };
  };
}
```

---

### 4.3 Affine Frame Composition & $O(1)$ Kinematic Resolution

When component $B$ attaches its port $P_B$ to port $P_A$ of component $A$, the coordinate transformation is resolved via homogeneous affine matrix multiplication:

$$\mathbf{M}_{\text{local}\to\text{world}} = \begin{bmatrix}
s \cos\theta & -s \sin\theta & x_0 \\
s \sin\theta & s \cos\theta & y_0 \\
0 & 0 & 1
\end{bmatrix}$$

```
World Origin (0,0)
       │
       ▼
[Component A: Frame_Deck] ───────────────────┐
       │ (exposes port: "bearing_seat_left")  │
       │                                     ▼ (exposes port: "deck_edge_top")
       ▼                               [Component C: RailingRun]
[Component B: Frame_Pier]               (Repeats ParapetPost every 1.5m)
 (AttachedVia: "pier_cap_center" -> "bearing_seat_left")
```

1. **Assembly DAG Construction**: The engine builds an adjacency graph from `attachedVia.parentInstanceId` links.
2. **Topological Sort**: Evaluated via Kahn's algorithm in $O(K)$ time where $K$ is the number of component instances ($K < 100$).
3. **Closed-Form Transform Evaluation**: For each child instance in sequence:
   $$\mathbf{M}_B = \mathbf{M}_A \cdot \mathbf{T}(P_A) \cdot \mathbf{R}(\theta_{\text{rel}}) \cdot \mathbf{T}(P_B)^{-1}$$
4. **Vertex Realization**: Any local vertex $\mathbf{p}_{\text{local}} \in B$ transforms to world coordinates in $O(1)$ time:
   $$\begin{bmatrix} x_{\text{world}} \\ y_{\text{world}} \\ 1 \end{bmatrix} = \mathbf{M}_B \begin{bmatrix} x_{\text{local}} \\ y_{\text{local}} \\ 1 \end{bmatrix}$$

---

### 4.4 Anisotropic Multi-Cell Bay Spanning Mathematics

Uniform conformal scaling ($\mathbf{M} = s \mathbf{I}$) breaks civil structures: scaling a span from $3\text{ m}$ to $6\text{ m}$ would double the top slab thickness from $400\text{ mm}$ to $800\text{ mm}$ and double corner haunches.
Multi-cell expansion uses the **Anisotropic Bay Spanning Matrix**:

$$\mathbf{A}_{\text{cell}}(i) = \begin{bmatrix}
1 & 0 & (i - 1)(W_{\text{clear}} + T_{\text{web}}) \\
0 & 1 & 0 \\
0 & 0 & 1
\end{bmatrix}
\begin{bmatrix}
\frac{W_{\text{clear}}}{W_0} & 0 & 0 \\
0 & 1 & 0 \\
0 & 0 & 1
\end{bmatrix}$$

- Slab thicknesses ($d_{\text{top}}, d_{\text{bot}}$), wall thickness ($t_{\text{ext}}$), and corner haunches ($h_{\text{leg}}$) undergo an identity transform along $Y$, preserving exact RDSO structural thickness.
- Clear span expands strictly horizontally.
- Bay $i$ displaces rightward as a rigid body by $(i - 1)(W_{\text{clear}} + T_{\text{web}})$.

---

### 4.5 Cross-View Semantic Identity

In standard civil GADs, a single structural component appears simultaneously across multiple drawing projections:
- `Top Plan View`: Displays barrel length, formation width, track centerline, and wing wall flare angles.
- `Sectional Elevation X-X`: Displays clear span, clear height, slab thickness, haunches, and foundation levels.
- `Side Elevation Y-Y`: Displays longitudinal slope, pier profiles, and bearing shelf levels.

```
                   Shared Semantic Parameter Model
              [ ClearSpan = 4000 mm, WallThk = 400 mm ]
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
   Top Plan View        Cross-Section X-X       Side Elevation Y-Y
 [Lines 12 & 14 bind    [Lines 45 & 46 bind     [Lines 88 & 89 bind
  to ClearSpan as X]     to ClearSpan as W]      to ClearSpan as Span]
```

The engine separates **Engineering Components** from **View Representations**:
- The component `RCC_BOX_01` owns the parameter `ClearSpan = 4000 mm`.
- Geometry entities in each view bind to `RCC_BOX_01.ClearSpan`.
- When the project engineer edits `ClearSpan`, the change propagates deterministically to all views in a single solve pass.

---

## 5. AutoFormula & Geometric Inference Pipeline

### 5.1 5-Stage Inference Architecture

```
Raw Drawn Geometry (Line Chains / Rectangles / Arcs)
                    │
                    ▼
[Stage 1: Topological Vertex Welding]
 Spatial hash clustering: Endpoints within ε_coincident (2.0 mm / 5 px)
 are unified into shared topological DCEL vertices.
                    │
                    ▼
[Stage 2: Structural Invariant Extraction]
 Scan vertex stars: Detect 45° chamfers, 90° corners, and parallel boundary loops.
                    │
                    ▼
[Stage 3: Heuristic Geometric Inference]
 Check tolerances: Lines within ±1.5° of axial axes tagged Horizontal / Vertical.
 Concentric circles tagged Concentric.
                    │
                    ▼
[Stage 4: Closed-Loop Rank-Preserving Greedy Filter]
 (Autodesk Research Casey et al. 2025 / Fusion RLOO Model)
 Test candidate against DM bipartite graph and Jacobian row-space.
 Discard redundant (rank equal) and conflicting (non-zero residual) constraints.
                    │
                    ▼
[Stage 5: Dual-Graph Insertion & Role Gating]
 In Author Mode: AutoFormula panel displays single-click acceptance cards.
 In Draftsman Mode: Panel hidden; constraints enforce silently without popup spam.
```

---

### 5.2 Closed-Loop Rank-Preserving Greedy Filter (Autodesk RLOO Model)

To eliminate the over-constraining and unsolvable states common in naive auto-constrainers, we adopt the verification loop proven by Autodesk Research ([Casey et al., ICCV 2025](https://arxiv.org/abs/2504.13178)):

```
Algorithm 1: Closed-Loop Rank-Preserving Auto-Constrain
Input: Current Sketch Geometry S, Candidate Constraints List Q
Output: Well-Constrained Constraint Set C_accepted

1. Sort Q by structural reliability:
   Coincident > Horizontal/Vertical > Perpendicular/Parallel > Haunch Chamfer > Distance
2. Initialize C_accepted = ExistingConstraints
3. For each candidate c_k in Q:
     a. Construct tentative set C_test = C_accepted ∪ {c_k}
     b. Run Dulmage-Mendelsohn structural partition on C_test:
        If c_k ∈ C_over (structural redundancy/conflict):
           Reject c_k; continue
     c. Form reduced Jacobian J_test = J(C_test)
     d. Compute QR decomposition: J_test^T P = Q R
     e. If Rank(R) == Rank(J_accepted):
        // Linearly dependent on existing constraints
        Reject c_k; continue
     f. Run trial solve step: X_test = Solve(C_test, X_0)
     g. If SolveStatus != CONVERGED:
        Reject c_k; continue
     h. Stability Check: If ||X_test - X_0||_∞ > ε_stability (20 mm):
        // Solved successfully, but flipped/distorted geometry
        Reject c_k; continue
     i. Accept c_k: C_accepted = C_test
4. Return C_accepted (Guaranteed 0% over-constraint, 0% matrix singularities)
```

---

### 5.3 Static Discovery vs. Dynamic Drag-Invariance Tracing

- **Static Discovery**: Operates on geometry at rest. Scans for parallel lines separated by constant offset $T$ to propose `WallThickness`. Scans for inner rectangle centered within outer rectangle to propose centering equations.
- **Dynamic Drag-Invariance Tracing**: Operates during pointer manipulation.
  1. The user drags a vertex (e.g. extending inner culvert span from $4000\text{ mm}$ to $6000\text{ mm}$).
  2. The system tracks all pairwise distances, angles, and offsets throughout the drag duration $t \in [t_{\text{down}}, t_{\text{up}}]$.
  3. Any metric whose variance $\operatorname{Var}(m) < 10^{-4}$ while other metrics changed is flagged as an **unconscious design invariant**.
  4. Upon pointer release, the system surfaces a clean suggestion:
     > *"During your edit, WallThickness ($400\text{ mm}$) and HaunchLeg ($200\text{ mm}$) remained constant. Keep these as driving design constraints?"*

---

## 6. Codebase Ground-Truth Autopsy & Debt Analysis

A rigorous, file-by-file audit of `github.com/lakshya4568/2D-Canvas` (branch `parametric_formulation`) revealed the exact gaps separating the repository from an industrial kernel:

### 6.1 Audit of `lib/parametric/model.ts` (Switch Statements & Name Collisions)
- **Procedural Special-Cases**: `model.ts` contains 7 giant switch statements (lines 74, 100, 347, 423, 491, 574, 643) keyed on magic string IDs: `"culvert_inner_top"`, `"culvert_haunch_tr"`, `"b1_top"`, `"edge_top"`.
- **Name Collisions**: Line 349 calls `getVarValue("${shapeName}.width", "${s.id}.width", "W", "Width", "width")`. If any variable named `W` exists, **every rectangle** in the drawing is forced to that width.
- **Line 380**: `"L", "Length", "length"` forces all unconnected lines to identical lengths.
- **Orphaned Solver**: Line 797 defines `solveParametricGeometricModel(shapes)`, but grep across the entire codebase confirms **zero callers**.

### 6.2 Audit of `lib/parametric/dualGraphOrchestrator.ts` (The Substring Bug)
- **Lines 42–46**:
  ```typescript
  for (const dep of dependent) {
    if (!dep.formula) continue;
    for (const other of this.parameterManager.getAll()) {
      if (other.name !== dep.name && dep.formula.includes(other.name)) {
        dependencyEdges.get(other.name)!.push(dep.name);
      }
    }
  }
  ```
  `dep.formula.includes(other.name)` uses raw substring matching. If a parameter is named `W`, any formula referencing `WallThickness`, `SkewWidth`, or `Weight` registers a false dependency on `W`, creating false circular dependency errors in Tarjan's algorithm.

### 6.3 Audit of `lib/solver/levenbergMarquardt.ts` (Convergence & Damping Bugs)
- **Line 137**: Convergence check returns `converged: true` if `stepNorm < tolStep`, even if the residual error `maxRes` remains unacceptably high ($> 100\text{ mm}$).
- **Lines 116–119**: Missing the factor of $0.5$ in `predictedReduction`, doubling the predicted reduction and corrupting the gain ratio $\rho$.

### 6.4 Audit of `features/canvas/DimensionBadge.tsx` & `ParametricDimensionOverlay.tsx`
- `DimensionBadge.tsx` is static, `pointer-events-none`, and only rendered in `DraftPreview.tsx`.
- Committed shapes render dimensions via `ParametricDimensionOverlay.tsx`, but typing into the badge dispatches `SET_VARIABLE` (binding an algebraic variable), **never creating a geometric constraint** in `ConstraintGraph`.
- Geometric constraints can only be added via the dropdown form in `ConstraintsPanel.tsx`.

### 6.5 Audit of Dormant & Dead Code Modules
- `lib/inference/admissibilityFilter.ts`: Mathematically correct SVD row-space projection, but has **zero callers** in production.
- `lib/geometry/topology/dcel.ts`: Complete DCEL implementation with vertex welding and face cycle extraction, but runtime canvas code uses basic undirected cycle finding in `closedGeometry.ts`.
- `lib/solver/jacobians/analyticalJacobians.ts`: 100% dead code; `variationalKernel.ts` computes Jacobians via forward finite differences.
- `lib/solver/matrix/pseudoInverse.ts`: 100% dead code outside tests.
- `lib/parametric/boundaryLimits.ts`: Present but un-mounted in `DrawingCanvas.tsx`.

### 6.6 Analysis of the 6 Failing Tests (`bun run test`)
1. `tests/integration/autonomous_gad_solver.test.ts`: Fails because `drawingReducer.ts:UPDATE_SHAPE` does not invoke `solveGADAssemblyAdjustment`.
2. `tests/integration/rcc_bridge_parametric.test.ts`: Fails because `rcc_bridge` in `rccBridgeTemplate.ts` is omitted from `BUILTIN_TEMPLATES` in `templates.ts`.
3. `tests/unit/atomic_autoformula_slab.test.ts` (2 tests): Fails because `state.inferredFormulas` is undefined on `DrawingState`.
4. `tests/unit/formula_naming.test.ts`: Fails because `state.inferredFormulas` is undefined.
5. `tests/unit/hierarchical_groups.test.ts`: Fails because `RENAME_GROUP` is unhandled and `groupName` is missing from `Shape`.

---

## 7. Numerical Solver Architecture: PlaneGCS WASM Worker Integration

For assemblies exceeding 50 geometric entities, pure JavaScript matrix operations drop below 60 FPS. High-capacity solving delegates to `@salusoft89/planegcs` (FreeCAD's C++ PlaneGCS solver compiled to WebAssembly via Emscripten).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAIN BROWSER THREAD                             │
│                                                                        │
│   Canvas Pointer Drag (60 FPS) ──► Pure TS SolveSpace Damped Solver    │
│                                    (Sub-millisecond latency, <100 DOFs)│
│                                                                        │
│   Parameter Commit / AutoForm  ──► Web Worker Bridge                   │
│                                    (postMessage payload: primitives)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Web Worker RPC
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     ISOLATED WEB WORKER THREAD                         │
│                                                                        │
│   PlaneGCS WebAssembly Core (`@salusoft89/planegcs`)                   │
│   • Powell's Dogleg Trust-Region Optimization                          │
│   • SparseQR Matrix Factorization (COLAMD Ordering)                    │
│   • Driving vs. Reference (`driving: false`) Measurement Separation     │
│   • Memory Hygiene: Explicit `clear_data()` & vector `.delete()`       │
│                                                                        │
│   Fallback Safety: Pure TypeScript LM Solver runs if WASM unavailable   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Comprehensive Execution Roadmap: Waves 0 Through 6

```
Wave 0: Baseline Stabilization (Fix 6 Failing Tests -> 100% Green 155/155)
  │
Wave 1: Mathematical Core Repairs & AST Substring Fix
  │
Wave 2: Dulmage-Mendelsohn (DM) Decomposition & BTF Engine
  │
Wave 3: SolveSpace 1/20 Damped Direct Manipulation Solver & Dimension Badges
  │
Wave 4: Universal Port Protocol & Procedural Codebase Debt Retirement
  │
Wave 5: PlaneGCS WASM Worker Bridge & CadVLM Rank-Preserving Filter
  │
Wave 6: End-to-End Parametric Benchmarks & Visual QA Validation
```

---

### Wave 0: Baseline Stabilization (Immediate Debt Clearance)
- **Task 0.1**: Register `rcc_bridge` template in `lib/parametric/templates.ts`.
- **Task 0.2**: Add `inferredFormulas: InferredFormula[]` to `DrawingState` in `lib/state/drawingReducer.ts`.
- **Task 0.3**: In `drawingReducer.ts`, invoke `synthesizeFormulasFromGeometry` on `LOAD_SHAPES` and `COMMIT_DRAFT`; add `ACCEPT_INFERRED_FORMULA` handler.
- **Task 0.4**: In `drawingReducer.ts`, add `RENAME_GROUP` handler; set `groupName` and track `groupPath` hierarchy in `GROUP_SELECTED`.
- **Task 0.5**: In `drawingReducer.ts`, enhance `UPDATE_SHAPE` to invoke `solveGADAssemblyAdjustment` when an inner GAD shape is modified.
- **Verification Gate 0**: Run `bun run test`. All 155 tests in 36 test files pass (100% green).

---

### Wave 1: Mathematical Core Repairs & AST Substring Fix
- **Task 1.1**: In `lib/solver/levenbergMarquardt.ts`, add the $0.5$ factor to predicted reduction calculation $\Delta L = 0.5 \cdot \Delta X^T (\lambda \Delta X - g)$.
- **Task 1.2**: In `lib/solver/levenbergMarquardt.ts`, update convergence check to require `maxRes < tolRes` for `status: "converged"`. Return `status: "stagnated"` if `stepNorm < tolStep && maxRes >= tolRes`.
- **Task 1.3**: Write unit test `tests/unit/lm_solver_convergence.test.ts` verifying quadratic convergence on non-linear systems and proper stagnation detection.
- **Task 1.4**: In `lib/parametric/dualGraphOrchestrator.ts:43`, replace substring inclusion `dep.formula.includes(other.name)` with `parseFormula(dep.formula).dependencies`.
- **Task 1.5**: Write unit test `tests/unit/dual_graph_ast_dependencies.test.ts` verifying parameters with overlapping prefixes do not create false cycles.
- **Verification Gate 1**: Zero false cycle errors; LM solver achieves quadratic convergence on benchmark tests.

---

### Wave 2: Dulmage-Mendelsohn (DM) Decomposition & BTF Engine
- **Task 2.1**: Implement Hopcroft-Karp maximum bipartite matching in `lib/parametric/graph/hopcroftKarp.ts`.
- **Task 2.2**: Implement Dulmage-Mendelsohn decomposition in `lib/parametric/graph/dulmageMendelsohn.ts`, partitioning into $G_{\text{under}}$, $G_{\text{square}}$, and $G_{\text{over}}$.
- **Task 2.3**: Implement Tarjan's SCC on the directed matched graph to produce the Block Triangular Form (BTF) DAG.
- **Task 2.4**: Upgrade `BipartiteConstraintGraph` in `lib/parametric/graph/bipartiteGraph.ts` to expose `decomposeDM(): DMResult`.
- **Task 2.5**: Write unit test `tests/unit/dulmage_mendelsohn.test.ts` verifying structural classification on under-, well-, and over-constrained test assemblies.
- **Verification Gate 2**: DM decomposition accurately isolates over-constrained subsets and computes true structural degrees of freedom.

---

### Wave 3: SolveSpace 1/20 Damped Direct Manipulation Solver & Dimension Badges
- **Task 3.1**: Implement `DirectManipulationSolver` in `lib/parametric/dragSolver.ts` with SolveSpace $1/20$ column scaling and $A^T P = Q R$ triangular solve.
- **Task 3.2**: Upgrade `ParametricDimensionOverlay.tsx` to directly commit driving parameter constraints upon numeric typing without requiring `=` syntax.
- **Task 3.3**: Upgrade `DimensionBadge.tsx` to support status color coding: Blue for under-constrained, Green for fully constrained, Red for over-constrained.
- **Task 3.4**: Implement plain-language conflict translator in `lib/parametric/conflictTranslator.ts` converting $G_{\text{over}}$ constraint nodes into user actionable guidance.
- **Task 3.5**: Wire `DirectManipulationSolver` into `features/canvas/DrawingCanvas.tsx` for pointer drag events.
- **Task 3.6**: Write unit test `tests/unit/drag_damping.test.ts` verifying that dragged parameters receive 400x higher penalty and un-dragged geometry absorbs deformation.
- **Verification Gate 3**: Canvas dragging behaves smoothly without geometry flipping; dimension editing directly sets constraints without formula syntax.

---

### Wave 4: Universal Port Protocol & Procedural Codebase Debt Retirement
- **Task 4.1**: Define Universal Port Protocol types in `lib/parametric/component/types.ts` (`Port`, `ComponentDefinition`, `ComponentInstance`).
- **Task 4.2**: Implement $3 \times 3$ affine matrix port composition solver in `lib/parametric/component/portSolver.ts`.
- **Task 4.3**: Refactor Single-Cell Box Culvert, Two-Span Culvert, and Slab Frame into declarative component definitions in `lib/parametric/components/`.
- **Task 4.4**: In `lib/parametric/model.ts`, replace procedural switch blocks (lines 423–640) with calls to declarative component generators.
- **Task 4.5**: Write unit test `tests/unit/universal_port_composition.test.ts` verifying culvert cell chaining and wing wall attachment via ports.
- **Verification Gate 4**: All 7 procedural switch statements eliminated from `model.ts`. Culvert and bridge templates scale dynamically through port transforms.

---

### Wave 5: PlaneGCS WASM Worker Bridge & CadVLM Rank-Preserving Filter
- **Task 5.1**: Install `@salusoft89/planegcs` and configure Next.js asset loading for `planegcs.wasm`.
- **Task 5.2**: Implement `workers/planegcs.worker.ts` with `GcsWrapper`, `clear_data()` transactions, and B-Spline memory leak mitigation.
- **Task 5.3**: Implement Web Worker bridge client in `lib/solver/planegcsClient.ts` with automatic fallback to pure-TypeScript Levenberg-Marquardt solver.
- **Task 5.4**: Implement Casey et al. 2025 closed-loop rank-preserving greedy filter in `lib/inference/rankPreservingFilter.ts` using `admissibilityFilter.ts` and stability bound check $\|\mathbf{x}^* - \mathbf{x}_0\|_\infty \le \epsilon$.
- **Task 5.5**: Wire the rank-preserving filter into canvas stroke completion for AI Auto-Constrain.
- **Task 5.6**: Write integration test `tests/integration/planegcs_worker.test.ts` verifying worker solving and rank filter rejection of redundant constraints.
- **Verification Gate 5**: Auto-constrain generates 0% over-constrained states and zero matrix singularities. Headless fallback passes 100% of tests in CI.

---

### Wave 6: Civil Engineering Benchmarks & Visual QA
- **Task 6.1**: Implement RCC Box Culvert benchmark test `tests/integration/box_culvert_scaling.test.ts` testing clear span expansion from 300mm to 800mm with constant 30mm walls and 35mm haunches.
- **Task 6.2**: Implement Two-Span Culvert asymmetric bay expansion test `tests/integration/two_span_culvert_scaling.test.ts`.
- **Task 6.3**: Implement Symmetrical RCC Bridge Deck & Pier spacing test `tests/integration/bridge_pier_scaling.test.ts`.
- **Task 6.4**: Run visual QA review on dimension badges, status colors, and conflict dialogs using Chrome DevTools MCP.
- **Verification Gate 6**: Full test suite passing (175+ tests). Zero regressions. Clean build with `bun run build`.

---

## 9. Atomic Commit Strategy & Verification Quality Gates

```
[git-master atomic commit sequence]
1. fix(test): resolve 6 existing test failures across templates, GAD, and reducer
   - Files: templates.ts, drawingReducer.ts
   - Gate: bun run test -> 155/155 passing (100% green)

2. fix(solver): correct LM reduction factor (0.5) and residual convergence condition
   - Files: lib/solver/levenbergMarquardt.ts, tests/unit/lm_solver_convergence.test.ts
   - Gate: bun run test -> 157 passing

3. fix(parametric): extract AST dependencies in dualGraphOrchestrator to prevent false cycles
   - Files: lib/parametric/dualGraphOrchestrator.ts, tests/unit/dual_graph_ast_dependencies.test.ts
   - Gate: bun run test -> 159 passing

4. feat(graph): implement Hopcroft-Karp matching and Dulmage-Mendelsohn BTF decomposition
   - Files: lib/parametric/graph/hopcroftKarp.ts, lib/parametric/graph/dulmageMendelsohn.ts, tests/unit/dulmage_mendelsohn.test.ts
   - Gate: bun run test -> 162 passing

5. feat(ux): add SolveSpace 1/20 damped direct manipulation solver and dimension badges
   - Files: lib/parametric/dragSolver.ts, features/canvas/DimensionBadge.tsx, features/canvas/ParametricDimensionOverlay.tsx
   - Gate: bun run test -> 165 passing

6. refactor(parametric): replace procedural switches in model.ts with Universal Port Protocol
   - Files: lib/parametric/component/*, lib/parametric/model.ts, tests/unit/universal_port_composition.test.ts
   - Gate: bun run test -> 168 passing

7. feat(solver): integrate PlaneGCS WASM worker and Casey et al. 2025 rank-preserving filter
   - Files: workers/planegcs.worker.ts, lib/solver/planegcsClient.ts, lib/inference/rankPreservingFilter.ts
   - Gate: bun run test -> 172 passing

8. test(civil): add RCC box culvert, two-span culvert, and bridge parametric scaling benchmarks
   - Files: tests/integration/box_culvert_scaling.test.ts, tests/integration/two_span_culvert_scaling.test.ts
   - Gate: bun run test -> 176 passing; bun run build succeeds
```

---

## 10. Summary

This research synthesis, mathematical proof suite, and execution roadmap eliminates the false dichotomy between hardcoded procedural code and manual blank-sheet drafting. By establishing the **Universal Port Protocol**, **Dulmage-Mendelsohn Block Triangular Form decomposition**, **SolveSpace 1/20 damped dragging**, and **Autodesk rank-preserving auto-constraining**, 2D Canvas Studio provides civil draftsmen with zero-formula direct manipulation while empowering template authors to encode reusable, code-compliant infrastructure designs.
