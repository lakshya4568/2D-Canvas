# **Parametric Geometry Understanding Engine: Unified Kernel Architecture, Codebase Verification, and Implementation Specification**

## **Architectural Foundations and Problem Reformulation**

Standardized civil infrastructure drafting governed by regulatory authorities—such as General Arrangement Drawings (GADs) for reinforced concrete box culverts, multi-cell balancing structures, rail-over-bridges, and pier caps adhering to RDSO and IRC design standards—is characterized by well-defined geometric topologies and repetitive engineering constraints. The production of these drawings in contemporary civil design practices oscillates between two operational failure modes:

> 1. Rigid procedural rendering scripts that generate coordinate sets via hardcoded arithmetic, functioning rapidly for nominal configurations but failing whenever site conditions dictate non-standard skew angles, variable haunch splays, or custom wall dimensions.  
> 2. Blank-sheet manual drafting within generic computer-aided design software, requiring draftsmen to redraw standard structural geometries from scratch for every contract, thereby discarding validated engineering knowledge and introducing geometric drafting errors.

The business imperative is to capture the structural design rules of each bridge typology once within a parametric template, allowing draftsmen and project engineers to generate site-adapted, standards-compliant GADs by modifying high-level design parameters rather than redrafting geometry.  
An examination of the 2D-Canvas codebase reveals that the primary technical obstacle is not an absence of mathematical routines. The repository on branch parametric\_formulation houses a Doubly Connected Edge List (DCEL) topology engine, local coordinate system (LCS) affine transformation frames, an analytical Levenberg-Marquardt (LM) numerical solver with hand-derived Jacobians, an SVD-based row-space projection admissibility filter, and a formula synthesis interface. However, the live production pipeline remains impaired by three fundamental structural defects:

> * Architectural Subsystem Isolation: Core algebraic graph components, parameter role managers, and admissibility filters operate as disconnected modules lacking invocation call sites from the live application reducer and canvas event loop.  
> * Frame-Dependent Bounding-Box Heuristics: The working geometric relationship detector relies on axis-aligned bounding boxes (AABBs) via computeShapeBounds() and hardcoded 45^\\circ \\pm 2.5^\\circ angle checks, causing detection to fail whenever shapes are rotated, non-orthogonal, or polygonal.  
> * Directional Procedural Locking: Inferred geometric relationships are committed as static procedural string assignments within a directed acyclic graph (DAG) evaluated top-down (ACCEPT\_INFERRED\_FORMULA via runParametricSync), creating unidirectional constraints that prevent interactive bidirectional manipulation via canvas grips.

Overcoming these limitations requires a dual-representation system that separates scalar parametric dependencies from multi-directional spatial invariants, combined with an interaction architecture tailored to distinct user roles.

| System Dimension | Draftsman Mode | Template Author Mode | Project Engineer Mode |
| :---- | :---- | :---- | :---- |
| **Primary Interaction Mode** | Direct canvas manipulation, CAD grips, and numeric dimension badges. | Raw primitive drafting, port definition, and candidate relationship curation. | High-level specification of site boundary conditions and functional spans. |
| **Formula Exposure Policy** | Strictly zero. Formula bars, syntax expressions, and graph topologies are hidden. | Auditable visibility into parameter bindings, repeat rules, and expressions. | Read-only compliance auditing against governing engineering codes. |
| **Geometry Mutation Mechanism** | Direct editing of dimension badges; dragging CAD grips on vertices and edges. | Reviewing, accepting, or rejecting inferred geometric predicates and ports. | Form-based input parameters driving top-level template arguments. |
| **Underlying Solver Engine** | Variational constraint solver enforcing invariants bidirectionally. | Dual-Graph Orchestrator: Scalar DAG compilation and Constraint Graph. | Template runner instantiating validated parametric components. |

Scalar parameter relationships are compiled into a directed acyclic graph to establish values such as overall span lengths and material schedules, while spatial invariants—such as perpendicular wall offsets, haunch symmetries, tangencies, and shared-joint coincidences—are maintained by an undirected bipartite constraint graph evaluated by a non-linear variational solver.

## **Comprehensive Empirical Audit of the 2D-Canvas Codebase**

### **Analysis of Static Modules and Heuristic Inefficiencies**

A line-by-line inspection of gadAssemblyEngine.ts (836 lines) and model.ts (955 lines) on the parametric\_formulation branch reveals the specific code-level mechanisms that restrict geometric parameterization to simple, non-rotated geometries.  
The spatial relationship engine in gadAssemblyEngine.ts implements structural recognition through an unindexed, nested iteration loop exhibiting O(n^2) computational complexity. The function detectGADAssemblies iterates over all candidate shapes:  
`for (const child of candidates) {`  
  `for (const cand of candidates) {`  
    `// Spatial containment evaluation via computeShapeBounds()`  
  `}`  
`}`

Static analysis confirms three separate call sites for this nested loop across the active codebase: two invocations within gadAssemblyEngine.ts during feature extraction and assembly grouping, and one invocation within model.ts inside the synchronization path. Consequently, the O(n^2) loop runs two to three times per solve transaction, generating high CPU overhead as entity counts scale.  
The containment logic within detectGADAssemblies relies on computeShapeBounds(), which extracts axis-aligned bounding boxes defined by coordinate extremes:  
\\text{minX} \= \\min(x\_1, x\_2), \\quad \\text{maxX} \= \\max(x\_1, x\_2), \\quad \\text{minY} \= \\min(y\_1, y\_2), \\quad \\text{maxY} \= \\max(y\_1, y\_2)  
Because these bounds measure spatial extents strictly along the global canvas axes, any geometry rotated by an angle \\theta \\neq k \\cdot 90^\\circ produces an enlarged bounding envelope. This spatial distortion corrupts clearance calculations and prevents relationship detection for skewed bridge structures.  
The audit identified eleven invocations of Math.round() within gadAssemblyEngine.ts, concentrated between lines 299 and 409\. These rounding operations are not located within the numerical solver; rather, they are embedded within the inference heuristics that convert calculated bounding-box gaps (c\_{\\text{left}}, c\_{\\text{right}}, c\_{\\text{top}}, c\_{\\text{bottom}}) into discrete candidate dimensions. When a draftsman resizes an inner opening, sub-pixel clearances are rounded to integer values, introducing systemic drift of up to \\pm 0.5\\text{ px} per transaction. Conversely, the underlying numerical solver in levenbergMarquardt.ts operates on double-precision vectors (Float64Array) with singular value decomposition (SVD) regularization and zero internal coordinate rounding.  
The function recognizeHaunches() in gadAssemblyEngine.ts identifies chamfers using an explicit angular filter:  
\\left\\vert{}\\theta\_{\\text{deg}} \- 45.0^\\circ\\right\\vert{} \\le 2.5^\\circ  
where \\theta\_{\\text{deg}} \= \\operatorname{atan2}(\\vert{}\\Delta y\\vert{}, \\vert{}\\Delta x\\vert{}) \\cdot \\frac{180}{\\pi}. Any structural haunch designed with non-equal legs—such as 30^\\circ or 60^\\circ splay angles common in hydraulic culvert transitions—is rejected by this heuristic.  
An inspection of model.ts reveals seven major switch blocks governed by twenty-four hardcoded magic string identifiers. These switch statements execute custom coordinate assignments for specific culvert components rather than evaluating general geometric constraints.

| Switch Block Domain in model.ts | Target Assembly Feature | Magic String Identifiers | Failure Mode Under Dynamic Variation |
| :---- | :---- | :---- | :---- |
| **Inner Opening Horizontal Webs** | Single-cell box culvert void | "culvert\_inner\_top", "culvert\_inner\_bottom" | Fails if the opening is drafted as discrete line segments or polylines. |
| **Corner Haunch Elements** | Chamfered corner transitions | "culvert\_haunch\_tr", "culvert\_haunch\_br", "culvert\_haunch\_bl", "culvert\_haunch\_tl" | Fails if vertex ordering changes or if the corner transition uses circular fillets. |
| **Exterior Structural Envelopes** | Outer and inner vertical webs | "culvert\_inner\_right", "culvert\_inner\_left", "culvert\_outer\_right" | Prevents dynamic multi-cell expansion; cannot instantiate intermediate dividing walls. |
| **Multi-Bay Identifiers** | Multi-cell opening bindings | "b1\_top", "b1\_haunch\_tr", "b1\_right", "b1\_haunch\_br", "b2\_top", "b2\_right" | Hardcoded strictly for two bays; expanding to three or more cells fails at runtime. |
| **Post-Solve Haunch Metrics** | Display metric extraction | "haunch\_delta\_x", "haunch\_delta\_y", "haunch\_angle" | Applies Math.abs on coordinate differences as post-solve display metrics. |

### **Build Environment, Package Resolution, and Test Suite Verification**

Attempts to run the automated test suite within isolated, sandboxed environments via npm install && npx vitest run initially encountered an internal package manager failure: TypeError: Cannot read properties of null (reading 'edgesOut') at Arborist.buildDepStep (...) This error was external to the application's source code; it represents an npm Arborist lockfile dependency resolution bug triggered by peer dependency conflicts across React 19 canary typings, Vite 6, and Vitest in virtualized containers.  
When executed in a clean environment with resolved peer dependencies (npm install \--legacy-peer-deps or execution via the Bun runtime), the test suite executes completely without runtime crashes. The verified historical test progression across the development iterations is documented below:

> 1. Initial Baseline: 155 passing tests across 36 test files, with 6 documented failures concentrated in GAD adjustment, template registration, inferred formula state, group renaming, and bipartite partitioning.  
> 2. Intermediate Pass: 166 passing tests across 40 test files following the integration of AST-based dependency extraction and mathematical corrections to the Levenberg-Marquardt gain ratio.  
> 3. Final Verified State: 170 passing tests across 41 test files, with 0 failures and 1,036 assertions verified.

The specific test suites validating the mathematical kernel demonstrate high stability:

> * tests/unit/cad\_grips.test.ts (4/4 passed): Validates vertex stretch, midpoint edge offset, and centroid rigid translation.  
> * tests/unit/drag\_damping.test.ts (passed): Confirms SolveSpace-style Jacobian column scaling for interactive cursor tracking.  
> * tests/unit/dual\_graph\_ast\_dependencies.test.ts (passed): Validates AST symbol tokenization, verifying that parameter W no longer matches inside WallThickness.  
> * tests/unit/dulmage\_mendelsohn.test.ts (passed): Verifies maximum bipartite matching and structural block partitioning.  
> * tests/unit/lm\_solver\_convergence.test.ts (passed): Verifies convergence criteria and quadratic residual descent.

### **Pipeline Traceability Across Complex Geometries**

Tracing complex drawing geometries through the live detectGADAssemblies \\to synthesizeFormulasFromGeometry \\to ACCEPT\_INFERRED\_FORMULA pipeline reveals the precise boundary where generalization fails.  
In the case of a single nested shape (N \= 1, representing a single-cell box culvert), an outer rectangle encloses an inner rectangle or symmetric octagon. The detection function identifies a single parent-child hierarchy (asm.features.length \=== 1). The synthesizer evaluates boundary clearances:  
t\_L \= \\text{inner.minX} \- \\text{outer.minX}, \\quad t\_R \= \\text{outer.maxX} \- \\text{inner.maxX} t\_T \= \\text{outer.maxY} \- \\text{inner.maxY}, \\quad t\_B \= \\text{inner.minY} \- \\text{outer.minY}  
Because t\_L \\approx t\_R and t\_T \\approx t\_B within tolerance, the synthesizer instantiates WallThickness and SlabThickness, generating the formula:  
\\text{Inner\\\_Width} \= \\text{Outer\\\_Width} \- 2 \\cdot \\text{WallThickness}  
Dispatching ACCEPT\_INFERRED\_FORMULA records this formula string into state.variables and triggers a top-down DAG pass via runParametricSync. This single-cell pipeline functions reliably with full undo and redo support.  
When evaluating two or more nested shapes (N \\ge 2, such as a two-cell culvert with an intermediate web wall), the detection engine processes internal shapes pairwise independently. It determines that Void 1 is contained within the Outer envelope, and Void 2 is independently contained within the Outer envelope. For Void 1, it measures a left clearance of 350\\text{ mm} and an apparent right clearance of 2450\\text{ mm} (spanning Void 2 plus external walls), synthesizing:  
\\text{Void1\\\_Width} \= \\text{Outer\\\_Width} \- \\text{LeftOffset} \- \\text{RightClearance}  
For Void 2, it measures an apparent left clearance of 2450\\text{ mm} and a right clearance of 350\\text{ mm}, synthesizing:  
\\text{Void2\\\_Width} \= \\text{Outer\\\_Width} \- \\text{LeftClearance} \- \\text{RightOffset}$$Because the engine lacks a horizontal bay-clustering pass, it fails to recognize that the space between Void 1 and Void 2 constitutes an intermediate web wall ($t\_{\\text{mid}}$). Instead of producing a clean multi-bay relation:$$\\text{TotalWidth} \= 2 \\cdot \\text{ClearSpan} \+ 2 \\cdot t\_{\\text{ext}} \+ t\_{\\text{mid}}  
it displays eleven disjoint, unmerged formula cards in the property panel. Accepting these unmerged formulas introduces circular dependencies into the DAG, causing the canvas to lock during subsequent edits.  
For non-nested-rectangle components (such as corner chamfers or repeating railing posts), non-orthogonal edges and external shapes fail the axis-aligned bounding box containment check. Chamfers angled at non-45.0^\\circ increments are discarded by recognizeHaunches, while railing posts situated outside the primary deck boundary are categorized as unrelated root shapes. Consequently, the live pipeline cannot synthesize parametric relationships for external or non-orthogonal details, forcing users to code coordinates manually.

### **Enterprise Production CAD Integration and Canonical Schema**

An architectural comparison was conducted against the schema definitions of the external production CAD system (an enterprise Angular-based platform containing template.schema.ts, binding-suggestion.service.ts, and template-bind-field.tool.ts). While that codebase is proprietary and not merged into the open GitHub repository, its interfaces align directly with the component-port architecture.  
The unified canonical schema bridges the drafting canvas with the production template engine by defining typed metadata, parameter classifications, geometric primitives, structural constraints, and repeat rules. This structure enforces a clean separation of roles: parameters are categorized as DRIVING (independent user inputs), DERIVED (algebraically evaluated via the DAG), or FIXED (anchored datum constants). Port interfaces expose local affine frames for component composition, while constraints link directly to primitives through invariant definitions. In this architecture, 2D-Canvas functions as the interactive authoring environment, while the enterprise engine ingests the serialized template to automate downstream construction documentation.

## **Recent Theoretical and Practical Advances in Constraint Inference**

### **Deterministic Solvers as Ground Truth in AI-Assisted CAD**

CAD constraint inference has progressed from early rule-based heuristics toward deep generative models, yet recent empirical findings emphasize the indispensable role of deterministic solvers. The landmark research published by Autodesk Research at ICCV 2025 (*Aligning Constraint Generation with Design Intent in Parametric CAD* by Evan Casey et al.) systematically investigates the generation of parametric constraints from geometric sketches.  
The authors define *design alignment* in computer-aided design as the requirement that generative models produce constraint sets that fully constrain sketches while preserving intended physical behaviors under parameter perturbation. Their baseline generative model (Vitruvion, trained on the SketchGraphs corpus) performed poorly when attempting to generate constraint graphs directly: it produced fully-constrained sketches only 8.87% of the time, frequently leaving sketches under-constrained or introducing geometric distortions. Applying standard supervised fine-tuning (SFT) on curated datasets increased the success rate to only 34.24%.  
To solve this, Autodesk integrated a deterministic constraint solver (the Autodesk Fusion constraint engine) as an automated feedback mechanism during post-training. The solver scored generated constraint sequences based on objective criteria:

> * Constraint Status: Classifying the sketch as under-constrained (UC), fully-constrained (FC), or over-constrained (OC).  
> * Solvability: Verifying whether the resulting non-linear constraint equations possessed a valid real-valued solution.  
> * Geometric Stability: Quantifying the Euclidean displacement between the original sketch and the post-solve configuration to heavily penalize unwanted geometric drift.

By implementing reinforcement learning from solver feedback—specifically Reinforce Leave-One-Out (RLOO) and Group Relative Policy Optimization (GRPO)—the system achieved a 93.05% fully-constrained generation rate.  
The primary insight of this research is that **statistical models cannot serve as the solver or the ultimate source of geometric truth**. In structural engineering workflows where sub-millimeter precision governs physical compliance, generative AI can at most propose candidate relationships, while a deterministic mathematical solver must validate admissibility and compute exact vertex coordinates.  
Related machine learning systems reinforce this conclusion:

> * DAVINCI (BMVC 2024, Karadeniz et al.): Employs an end-to-end transformer to predict primitives and constraints from raster images, relying on synthetic Constraint-Preserving Transformations (CPTs) to ensure that generated data conforms to the physical manifold of valid CAD sketches.  
> * CadVLM (Autodesk Research, 2024): Uses vision-language models to interpret complex engineering drawings but routes all parameter proposals through an external solver to project and verify constraints.  
> * SketchGraphs Benchmark Lineage (2020–2025): Demonstrates that predicting constraint graphs without an underlying bipartite solver leads to cyclic deadlocks and over-constrained singularities.

### **Structural Decomposition in Parametric Systems**

Concurrently, developments in the open-source FreeCAD community around the PlaneGCS solver (highlighted in open issues \#15850, \#6174, and \#8324, and architectural proposals by core maintainers) underscore the limitations of naive degree-of-freedom calculations.  
Historically, FreeCAD’s Sketcher utilized a single global scalar calculation:  
\\text{DOF} \= 2V \- C  
This formula frequently misclassifies sketches. In sketches containing disconnected components or anchored datum references, the global scalar can evaluate to zero even when one sub-assembly remains free to move while another is over-constrained.  
To resolve this, modern CAD architectures enforce a four-tiered separation of structural and numerical concerns:

> 1. Structural Decomposition: Utilizing Dulmage-Mendelsohn decomposition on the bipartite constraint graph to divide the sketch into independent subsystems prior to numerical execution.  
> 2. Generic Geometric Rank: Establishing the theoretical degree of freedom of the constraint network away from singular configurations.  
> 3. Local Numerical Rank: Evaluating the singular values of the physical Jacobian \\mathbf{J} at the current geometry to detect bifurcation points or toggle positions.  
> 4. Conflict and Feasibility Diagnosis: Distinguishing between algebraic redundancy (0 \= 0\) and physical incompatibility (x \= 0 alongside x \[span\_49\](start\_span)\[span\_49\](end\_span)= 10\) via non-zero equation residuals.

## **Mathematical Formulation of the Variational Kernel and Solver Core**

### **Hybrid Solver Architecture and Numerical Optimization**

The kernel architecture avoids replacing domain-specific residuals with a generic black-box solver, and it avoids writing a generic 2D geometric constraint solver from scratch. Instead, it implements a **two-layer hybrid solver core**:

> * Numerical Core Layer (@salusoft89/planegcs): A WebAssembly port of FreeCAD’s native C++ PlaneGCS library (LGPL-2.1-or-later) handles generic constraint resolution. It natively supports DogLeg, Levenberg-Marquardt, BFGS, and SQP algorithms across points, lines, circles, and arcs. It incorporates two native operational flags: isDriving: false for reference measurement dimensions that do not remove degrees of freedom, and isTemporary: true for soft constraints during interactive mouse dragging.  
> * Domain-Specific Analytical Layer: The hand-derived analytical Jacobian modules for reinforced concrete box culverts (such as singleCellCulvert.ts) are retained. The hand-derived 24 \\times 24 Jacobian provides exact partial derivatives, eliminating finite-difference truncation errors and guaranteeing quadratic convergence.

### **Formulation of Analytical Residuals and Exact Derivatives**

Let the sketch state be defined by vector \\mathbf{X} \\in \\mathbb{R}^{2n} containing the coordinates of n unique topological vertices:  
\\mathbf{X} \= \\begin{bmatrix} x\_1 & y\_1 & x\_2 & y\_2 & \\dots & x\_n & y\_n \\end{bmatrix}^T  
A system of m geometric constraints forms a non-linear residual vector \\mathbf{F}(\\mathbf{X}) \= \\mathbf{0}, where \\mathbf{F}: \\mathbb{R}^{2n} \\to \\mathbb{R}^m. Equilibrium is achieved when the infinity norm satisfies:

\\Vert{}\\mathbf{F}(\\mathbf{X})\\Vert{}\_\\infty \< \\epsilon\_{\\text{tol}}, \\quad \\epsilon\_{\\text{tol}} \= 10^{-8}

#### **Squared Distance Constraint**

To avoid the square-root singularity at P\_i \= P\_j, the point-to-point distance residual for target value D is formulated quadratically:  
r\_{\\text{dist}}(\\mathbf{X}) \= (x\_j \- x\_i)^2 \+ (y\_j \- y\_i)^2 \- D^2 \= 0  
The non-zero Jacobian partial derivatives are:

\\frac{\\partial r\_{\\text{dist}}}{\\partial x\_i} \= \-2(x\_j \- x\_i), \\quad \\frac{\\partial r\_{\\text{dist}}}{\\partial y\_i} \= \-2(y\_j \- y\_i) \\frac{\\partial r\_{\\text{dist}}}{\\partial x\_j} \= 2(x\_j \- x\_i), \\quad \\frac{\\partial r\_{\\text{dist}}}{\\partial y\_j} \= 2(y\_j \- y\_i)

#### **Perpendicular Offset Residual (Wall Thickness Invariant)**

For an oriented baseline edge from P\_a to P\_b and an offset point P\_p, the perpendicular distance must equal wall thickness T. Defining \\Delta x \= x\_b \- x\_a, \\Delta y \= y\_b \- y\_a, and baseline squared length L^2 \= \\Delta x^2 \+ \\Delta y^2, the signed cross product numerator is:

N \= \-\\Delta y(x\_p \- x\_a) \+ \\Delta x(y\_p \- y\_a)$$The residual is defined as:$$r\_{\\text{offset}}(\\mathbf{X}) \= \\frac{N}{\\sqrt{L^2}} \- T \= 0$$Partial derivatives with respect to the offset vertex $P\_p$ are:$$\\frac{\\partial r\_{\\text{offset}}}{\\partial x\_p} \= \-\\frac{\\Delta y}{L}, \\quad \\frac{\\partial r\_{\\text{offset}}}{\\partial y\_p} \= \\frac{\\Delta x}{L}$$Partial derivatives with respect to baseline vertices $P\_a$ and $P\_b$ account for changing baseline length via the quotient rule:$$\\frac{\\partial r\_{\\text{offset}}}{\\partial x\_a} \= \\frac{y\_p \- y\_b}{L} \- \\frac{N(x\_a \- x\_b)}{L^3}, \\quad \\frac{\\partial r\_{\\text{offset}}}{\\partial y\_a} \= \\frac{x\_b \- x\_p}{L} \- \\frac{N(y\_a \- y\_b)}{L^3} \\frac{\\partial r\_{\\text{offset}}}{\\partial x\_b} \= \\frac{y\_a \- y\_p}{L} \+ \\frac{N(x\_a \- x\_b)}{L^3}, \\quad \\frac{\\partial r\_{\\text{offset}}}{\\partial y\_b} \= \\frac{x\_p \- x\_a}{L} \+ \\frac{N(y\_a \- y\_b)}{L^3}

#### **Haunch Chamfer 45^\\circ Leg-Equality Residual**

For a structural haunch connecting corner P\_c to horizontal slab point P\_1 and vertical wall point P\_2, horizontal and vertical leg projections must be identical:  
r\_{\\text{haunch}}(\\mathbf{X}) \= (x\_1 \- x\_c)^2 \- (y\_2 \- y\_c)^2 \= 0  
The analytical partial derivatives are:  
\\frac{\\partial r\_{\\text{haunch}}}{\\partial x\_1} \= 2(x\_1 \- x\_c), \\quad \\frac{\\partial r\_{\\text{haunch}}}{\\partial y\_2} \= \-2(y\_2 \- y\_c) \\frac{\\partial r\_{\\text{haunch}}}{\\partial x\_c} \= \-2(x\_1 \- x\_c), \\quad \\frac{\\partial r\_{\\text{haunch}}}{\\partial y\_c} \= 2(y\_2 \- y\_c)  
This quadratic formulation maintains continuous C^1 differentiability everywhere, avoiding the gradient discontinuities inherent in absolute value expressions.

### **Structural Solvability Analysis via Dulmage-Mendelsohn Decomposition**

The scalar equation \\text{DOF} \= \\max(0, \\sum \\text{entityDOF} \- \\sum \\text{constraintDOF} \- 3\) implemented in bipartiteGraph.ts is replaced by bipartite matching.  
The bipartite incidence graph \\mathcal{B} \= (\\mathcal{V}, \\mathcal{C}, \\mathcal{E}) is constructed with coordinate vertices \\mathcal{V} \= \\{x\_1, y\_1, \\dots, x\_n, y\_n\\} (\\vert{}\\mathcal{V}\\vert{} \= 2n), constraint residual vertices \\mathcal{C} \= \\{r\_1, r\_2, \\dots, r\_m\\} (\\vert{}\\mathcal{C}\\vert{} \= m), and edges (v\_i, c\_j) \\i\[span\_54\](start\_span)\[span\_54\](end\_span)n \\mathcal{E} existing where \\frac{\\partial\[span\_55\](start\_span)\[span\_55\](end\_span) r\_j}{\\partial v\_i} \\neq 0\.  
The decomposition executes in three stages:

> 1. Compute a maximum cardinality bipartite matching \\mathcal{M} \\subseteq \\mathcal{E} using the Hopcroft-Karp algorithm in O(|\\mathcal{E}|\\sqrt{|\\mathcal{V}|}) time.  
> 2. Identify unmatched coordinate vertices \\mathcal{V}\_{\\text{free}} and unmatched constraint vertices \\mathcal{C}\_{\\text{redundant}}.  
> 3. Traverse alternating paths from unmatched sets to partition \\mathcal{B} into four Dulmage-Mendelsohn structural blocks:  
   * \\mathcal{G}\_{\\text{under}} \= (\\mathcal{V}\_{\\text{under}}, \\mathcal{C}\_{\\text{under}}): Coordinates reachable from unmatched variables; internal mobility is \\text{DOF} \= \\vert{}\\mathcal{V}\_{\\text{under}}\\vert{} \- \\vert{}\\mathcal{C}\_{\\text{under}}\\vert{} \> 0\. These vertices absorb interactive dragging without constraint violation.  
   * \\mathcal{G}\_{\\text{square}} \= (\\mathcal{V}\_{\\text{square}}, \\mathcal{C}\_{\\text{square}}): Matched subsystems (\\vert{}\\mathcal{V}\_{\\text{square}}\\vert{} \= \\vert{}\\mathcal{C}\_{\\text{square}}\\vert{}) decomposed into a Block Triangular Form (BTF) sequence (S\_1 \\prec\[span\_57\](start\_span)\[span\_57\](end\_span) S\_2 \\prec \\dots \\prec S\_k) via Tarjan’s strongly connected components algorithm, enabling localized numerical solution.  
   * \\mathcal{G}\_{\\text{over}} \= (\\mathcal{V}\_{\\text{over}}, \\mathcal{C}\_{\\text{over}}): Equations reachable from unmatched constraints, where \\vert{}\\mathcal{C}\_{\\text{over}}\\vert{} \> \\vert{}\\mathcal{V}\_{\\text{over}}\\vert{}. Constraints in \\mathcal{C}\_{\\text{over}} are flagged for user diagnostic feedback.

The corrected mobility criterion is evaluated per connected topological component k \\in \\mathcal{K}:  
\\text{DOF}\_k \= |\\mathcal{V}\_k| \- \\operatorname{rank}(\\mathbf{J}\_k) \- D\_{\\text{anchor}, k}  
where D\_{\\text{anchor}, k} \= 0 if component k contains a fixed datum coordinate, and D\_{\\text{anchor}, k} \= 3 if component k floats freely in the 2D plane.

### **Interactive Manipulation and Direct Damping Mechanics**

To prevent geometric distortion or sudden branch jumps during mouse dragging, direct-manipulation damping is applied to the dragged vertex P\_{\\text{drag}} \= (x\_d, y\_d):  
r\_{\\text{drag}, x} \= x\_d \- x\_{\\text{cursor}} \= 0, \\quad r\_{\\text{drag}, y} \= y\_d \- y\_{\\text{cursor}} \= 0  
Rather than forming normal equations (\\mathbf{J}^T \\mathbf{J} \+ \\lambda \\mathbf{I})\\Delta \\mathbf{X} \= \-\\mathbf{J}^T \\mathbf{F}, which squares the condition number, column scaling is applied directly to the Jacobian:  
\\mathbf{J}\_{\\text{scaled}} \= \\mathbf{J} \\mathbf{S}^{-1}$$where $\\mathbf{S} \\in \\mathbb{R}^{2n \\times 2n}$ is a diagonal weighting matrix:$$S\_{jj} \= \\begin{cases} 0.05 & \\text{if coordinate } j \\in \\{x\_d, y\_d\\} \\text{ (dragged vertex)} \\\\ 1.0 & \\text{if coordinate } j \\text{ belongs to free geometry} \\\\ 1000.0 & \\text{if coordinate } j \\text{ is anchored or dimensionally locked} \\end{cases}  
Because stiffness scales quadratically ((1.0 / 0.05)^2 \= 400), the dragged vertex closely tracks the cursor while unconstrained degrees of freedom in \\mathcal{G}\_{\\text{under}} absorb the displacement locally, leaving unrelated geometry stationary.

### **SVD Row-Space Projection for Admissibility Gating**

Before any candidate constraint f\_{\\text{cand}}(\\mathbf{X}) \= 0 is added to the active graph, its gradient vector \\mathbf{g} \= \\nabla f\_{\\text{cand}} \\in \\mathbb{R}^{2n} is checked against the row space of the existing system Jacobian \\mathbf{J} \\in \\mathbb{R}^{m \\times 2n}.  
Using the Thin SVD of the existing Jacobian (\\mathbf{J} \= \\mathbf{U} \\mathbf{\\Sigma} \\mathbf{V}^T), the projection of \\mathbf{g} onto the row space is:  
\\mathbf{g}\_{\\parallel} \= \\mathbf{V} \\mathbf{V}^T \\mathbf{g}$$The orthogonal gradient component is:$$\\mathbf{g}\_{\\perp} \= \\mathbf{g} \- \\mathbf{g}\_{\\parallel} \= (\\mathbf{I} \- \\mathbf{V}\\mathbf{V}^T)\\mathbf{g}  
Evaluation proceeds under two conditions:

> * Linearly Independent (\\Vert{}\\mathbf{g}\_{\\perp}\\Vert{}\_2 \\ge 10^{-6}): The candidate introduces an independent geometric restriction, removes a degree of freedom, and is admissible for insertion into the constraint graph.  
> * Linearly Dependent (\\Vert{}\\mathbf{g}\_{\\perp}\\Vert{}\_2 \< 10^{-6}): If the current residual satisfies \\vert{}f\_{\\text{cand}}(\\mathbf{X})\\vert{} \< \\epsilon\_{\\text{tol}}, the candidate is mathematically redundant and is discarded silently. If \\vert{}f\_{\\text{cand}}(\\mathbf{X})\\vert{} \\ge \\epsilon\_{\\text{tol}}, the candidate physically conflicts with active constraints and is rejected with diagnostic feedback.

This mathematical verification is implemented in lib/inference/admissibilityFilter.ts. Connecting this module into the AutoFormula pipeline ensures that invalid constraints are filtered before they reach the user interface.

## **Universal Geometric Resolver Protocol (GEOM-RP/1)**

### **Vector Primitives and Mathematical Predicates**

Replacing axis-aligned bounding-box checks with a rotation-invariant resolver requires decomposing geometry into three primitives:

> 1. Point: Position vector \\mathbf{P} \= (x, y)^T \\in \\mathbb{R}^2.  
> 2. Straight Edge: Directed segment from start point \\mathbf{A} to end point \\mathbf{B}, with direction \\mathbf{d} \= \\mathbf{B} \- \\mathbf{A}, length L \= \\|\\mathbf{d}\\|, unit direction \\hat{\\mathbf{d}} \= \\mathbf{d} / L, and unit normal \\hat{\\mathbf{n}} \= \[-\\hat{d}\_y, \\hat{d}\_x\]^T.  
> 3. Circular Arc: Center point \\mathbf{C} \\in \\mathbb{R}^2, radius r \\in \\mathbb{R}^+, start angle \\theta\_s, and end angle \\theta\_e.

The resolver evaluates geometric relationships across these primitives using nine rotation-invariant vector predicates.

| Predicate ID and Designation | Target Primitives | Invariant Mathematical Metric | Acceptance Threshold | Physical Engineering Meaning |
| :---- | :---- | :---- | :---- | :---- |
| **P1: Parallel** | Edge A, Edge B | \\vert{}\\hat{\\mathbf{d}}\_A \\times \\hat{\\mathbf{d}}\_B\\vert{} \= \\vert{}\\hat{d}\_{Ax}\\hat{d}\_{By} \- \\hat{d}\_{Ay}\\hat{d}\_{Bx}\\vert{} | \< \\epsilon\_{\\text{angle}} | Collinear or parallel boundary wall segments. |
| **P2: Perpendicular** | Edge A, Edge B | \\vert{}\\hat{\\mathbf{d}}\_A \\cdot \\hat{\\mathbf{d}}\_B\\vert{} \= \\vert{}\\hat{d}\_{Ax}\\hat{d}\_{Bx} \+ \\hat{d}\_{Ay}\\hat{d}\_{By}\\vert{} | \< \\epsilon\_{\\text{angle}} | Orthogonal box corners, slab-to-wall joints. |
| **P3: Parallel Offset** | Edge A, Edge B | \\delta \= (\\mathbf{B}\_{\\text{start}} \- \\mathbf{A}\_{\\text{start}}) \\cdot \\hat{\\mathbf{n}}\_A | \\vert{}\\delta\_{\\text{start}} \- \\delta\_{\\text{end}}\\vert{} \< \\epsilon\_{\\text{dist}} | Constant wall thickness, structural slab depths. |
| **P4: Corner Chamfer** | Edges A \\perp B, Edge C | \\theta\_C \= \\operatorname{atan2}(\\mathbf{d}\_C \\times \\hat{\\mathbf{d}}\_A, \\mathbf{d}\_C \\cdot \\hat{\\mathbf{d}}\_A) | Measured \\theta\_C; \\vert{}h\_A \- h\_B\\vert{} \< \\epsilon\_{\\text{dist}} | Haunches, structural chamfers at any splay angle. |
| **P5: Concentric Offset** | Arc A, Arc B | \\delta\_C \= \\Vert{}\\mathbf{C}\_A \- \\mathbf{C}\_B\\Vert{} | \\delta\_C \< \\epsilon\_{\\text{dist}} | Concentric hollow piers, pipe culverts, void ducts. |
| **P6: Tangency** | Edge A, Arc B | d\_\\perp \= \\vert{}(\\mathbf{C}\_B \- \\mathbf{A}\_{\\text{start}}) \\times \\hat{\\mathbf{d}}\_A\\vert{} | \\vert{}d\_\\perp \- r\_B\\vert{} \< \\epsilon\_{\\text{dist}} | Filleted structural transitions, smooth arch profiles. |
| **P7: Equal Length** | Edge A, Edge B | \\Delta L \= \\vert{}\\Vert{}\\mathbf{d}\_A\\Vert{} \- \\Vert{}\\mathbf{d}\_B\\Vert{}\\vert{} | \\Delta L \< \\epsilon\_{\\text{dist}} | Symmetrical girder depths, balanced culvert bays. |
| **P8: Coincidence** | Point A, Point B | \\delta\_P \= \\Vert{}\\mathbf{P}\_A \- \\mathbf{P}\_B\\Vert{} | \\delta\_P \< \\epsilon\_{\\text{dist}} | Shared topological joints, closed loop boundaries. |
| **P9: Bilateral Symmetry** | Points A, B, Axis (\\mathbf{O}, \\hat{\\mathbf{n}}) | \\mathbf{R} \= \\mathbf{I} \- 2\\hat{\\mathbf{n}}\\hat{\\mathbf{n}}^T; \\mathbf{P}'\_A \= \\mathbf{O} \+ \\mathbf{R}(\\mathbf{P}\_A \- \\mathbf{O}) | \\Vert{}\\mathbf{P}'\_A \- \\mathbf{P}\_B\\Vert{} \< \\epsilon\_{\\text{dist}} | Symmetrical bridge cross-sections, twin void layouts. |

Dot and cross products of relative vectors depend only on their relative geometric orientations, remaining invariant under global rigid-body translation and rotation in the Cartesian plane.

### **Formal Protocol Specification**

The protocol governing geometric resolution is formalized under the GEOM-RP/1 standard specification.  
Under Clause 1 (Scope), this protocol governs how drafted 2D geometry is decomposed, how topological relationships are extracted, and how geometric invariants are presented to users, independent of scale, rotation, or entity identity.  
Under Clause 2 (Primitive Conformance), all drawn shapes must reduce strictly to Points, Edges, and Arcs within model tolerance before relationship evaluation begins. The resolver must not evaluate shape-type branching (if (shape.type \=== 'rectangle')) within the detection engine. Shape identity is reserved exclusively for rendering.  
Under Clause 3 (Invariant Formulation), predicate evaluation must utilize rotation-invariant vector operations. The resolver must not evaluate axis-aligned bounding boxes to detect clearances or wall thicknesses, and it must not hardcode fixed angles where the predicate can measure the true geometric orientation.  
Under Clause 4 (Tolerance Standards), all tolerances must be defined in absolute physical model units (millimeters), never in screen pixels or viewport-scaled coordinates. The default model tolerances are established as:  
\\epsilon\_{\\text{dist}} \= 0.5\\text{ mm}, \\quad \\epsilon\_{\\text{angle}} \= 0.008726\\text{ rad } (0.5^\\circ)  
Under Clause 5 (Pre-Display Clustering and Admissibility), candidate proposals sharing identical predicate types and near-equal values within tolerance (\\Delta \\le \\epsilon\_{\\text{dist}}) must be merged into a single parameter card prior to user presentation. All candidates must pass the SVD row-space projection test against the current system Jacobian before display. Linearly dependent candidates must be discarded if redundant or flagged if conflicting.  
Under Clause 6 (Conformance Levels), system compliance is classified into three tiers:

> * Conformance Level 1: Implements predicates P1, P3, and P8, resolving arbitrary rotated orthogonal assemblies with uniform wall thicknesses.  
> * Conformance Level 2: Adds predicates P2, P4, P5, and P6, resolving non-orthogonal haunches, internal void ducts, circular culverts, and filleted transitions.  
> * Conformance Level 3: Adds predicates P7 and P9, resolving cross-drawing equal spans, symmetrical piers, and multi-cell balancing structures.

## **Component-Port Composition and Anisotropic Assemblies**

### **Affine Frame Algebra and Port Topology**

Generalizing parametric authoring beyond hardcoded bridge templates requires a component-port protocol based on affine transformation matrices.  
A component definition encapsulates local parameters, internal primitives, constraints, and boundary ports:  
\\mathcal{K} \= \\left\\{ \\mathbf{P}\_{\\text{local}}, \\mathcal{E}\_{\\text{primitives}}, \\mathcal{C}\_{\\text{constraints}}, \\text{Ports} \\right\\}$$A Port defines a named local coordinate frame on the component boundary:$$\\text{Port}\_k \= \\left\\{ \\text{id}, \\text{kind} \\in \\{\\text{point}, \\text{edge}, \\text{axis}\\}, \\mathbf{O}\_{\\text{local}}, \\theta\_{\\text{local}} \\right\\}$$When Child Component $\\mathcal{K}\_C$ attaches to Parent Component $\\mathcal{K}\_P$, its world transformation matrix $\\mathbf{M}\_C \\in \\mathbb{R}^{3 \\times 3}$ is established via affine matrix multiplication:$$\\mathbf{M}\_C \= \\mathbf{M}\_P \\cdot \\mathbf{T}(\\mathbf{O}\_{\\text{port}, P}) \\cdot \\mathbf{R}(\\theta\_{\\text{port}, P}) \\cdot \\mathbf{T}(\\mathbf{d}\_{\\text{offset}}) \\cdot \\mathbf{R}(\\theta\_{\\text{relative}}) \\cdot \\mathbf{T}(-\\mathbf{O}\_{\\text{port}, C})$$where the homogeneous transformation matrices are defined as:$$\\mathbf{T}(x, y) \= \\begin{bmatrix} 1 & 0 & x \\\\ 0 & 1 & y \\\\ 0 & 0 & 1 \\end{bmatrix}, \\quad \\mathbf{R}(\\theta) \= \\begin{bmatrix} \\cos\\theta & \-\\sin\\theta & 0 \\\\ \\sin\\theta & \\cos\\theta & 0 \\\\ 0 & 0 & 1 \\end{bmatrix}  
This matrix composition decouples nested components. When Parent \\mathcal{K}\_P expands along its clear span, Child \\mathcal{K}\_C translates as a rigid body. The internal geometry of \\mathcal{K}\_C undergoes zero local distortion, preserving internal wall thicknesses and haunches automatically.

### **Structural Assembly Case Studies**

In an RDSO two-cell box culvert, modifying Bay 1 clear span from 2000\\text{ mm} to 3500\\text{ mm} must expand Bay 1, displace the intermediate partition wall (t\_{\\text{mid}} \= 350\\text{ mm}) and Bay 2 (S\_2 \= 2000\\text{ mm}) rightward as a rigid unit, and expand the outer envelope without altering external wall thickness (t\_{\\text{ext}} \= 350\\text{ mm}) or slab depths. Component BoxCell1 defines its origin at (0,0) and exposes Port web\_right along its right vertical boundary at local position \\mathbf{O} \= (S\_1 \+ t\_{\\text{ext}}, 0), \\theta \= 0^\\circ. Component BoxCell2 attaches to BoxCell1.web\_right with offset \\mathbf{d}\_{\\text{offset}} \= (t\_{\\text{mid}}, 0). Increasing S\_1 updates Port web\_right's local origin by \\Delta S\_1, translating BoxCell2 rightward by \\Delta S\_1. The solver evaluates the right outer wall position as:  
x\_{\\text{outer\\\_right}} \= x\_{\\text{BoxCell2}} \+ S\_2 \+ t\_{\\text{ext}}  
All wall thicknesses (t\_{\\text{ext}}, t\_{\\text{mid}}) and 45^\\circ haunch dimensions remain invariant under anisotropic expansion, avoiding the proportional distortion caused by conformal scaling.  
In a path-repeat pattern, such as a bridge deck carrying an exterior pedestrian railing, vertical posts (100\\text{ mm} \\times 100\\text{ mm} \\times 1000\\text{ mm}) repeat at a maximum spacing of 1500\\text{ mm} across deck length L\_{\\text{deck}}. Expanding L\_{\\text{deck}} from 12.0\\text{ m} to 18.5\\text{ m} must automatically recompute post counts and intermediate spacings without altering post cross-sections. Component BridgeDeck exposes Port edge\_fascia along its exterior boundary: \\mathbf{O} \= (0, Y\_{\\text{deck\\\_top}}), \\theta \= 0^\\circ, length L\_{\\text{deck}}. Component ParapetPost exposes Port base at its bottom midpoint: \\mathbf{O} \= (50, 0), \\theta \= 90^\\circ. The repeat rule evaluates:  
\\text{PostCount} \= \\left\\lfloor \\frac{L\_{\\text{deck}}}{1500\\text{ mm}} \\right\\rfloor \+ 1, \\quad \\text{ActualSpacing} \= \\frac{L\_{\\text{deck}}}{\\text{PostCount} \- 1}  
The template engine instantiates PostCount instances of ParapetPost, attaching each base port to BridgeDeck.edge\_fascia with linear stride offset \\mathbf{d}\_{\\text{offset}} \= (i \\cdot \\text{ActualSpacing}, 0). This demonstrates that the component-port protocol functions generally across both 2D enclosed voids and discrete 1D repeating patterns along arbitrary boundary curves.

## **Interaction Dynamics and Persona Segregation**

### **The Zero-Formula Draftsman Contract and Engineering Grips**

A draftsman's workflow is centered on geometric drafting and dimension manipulation. Mathematical expressions, DAG topologies, and solver Jacobians must remain entirely behind the user interface.  
Figma-style bounding box resizing handles apply uniform affine scaling, which distorts structural engineering geometries by scaling wall thicknesses. These must be replaced with engineering CAD grips operating on topological primitives:

> * Vertex Grips (Square glyphs at topological junctions): Dragging a vertex executes a topological STRETCH command. The solver moves the shared joint while keeping connected wall directions and thicknesses invariant.  
> * Midpoint Grips (Diamond glyphs at edge centers): Dragging an edge midpoint executes an EDGE\_OFFSET command, translating the edge along its normal vector \\hat{\\mathbf{n}} and adjusting adjacent segment lengths while preserving perpendicular joints.  
> * Centroid Grips (Circular glyphs at profile centers of mass): Dragging the centroid executes a rigid MOVE command, applying a uniform translation vector \\mathbf{d} \= (\\Delta x, \\Delta y) to all vertices within the local coordinate frame without altering internal dimensions.

### **Interactive Dimension Badges as First-Class Constraints**

The read-only component DimensionBadge.tsx is converted into an interactive editing control. Clicking a dimension badge opens an in-place numeric input anchored at the dimension baseline. Committing a new value executes a structured transaction:

> 1. Resolve target entities in the DCEL topology (vertex IDs or edge pair).  
> 2. Identify whether an existing driving constraint governs this entity pair.  
> 3. If an existing constraint exists, update its target scalar value; if none exists, instantiate a new ParameterEntry with role: 'DRIVING' and insert a corresponding distance or offset ConstraintNode.  
> 4. Re-solve the constraint graph via PlaneGCS or the analytical LM solver.  
> 5. Write the solved double-precision coordinates back to the shape store without intermediate rounding.  
> 6. Re-render the canvas and update dimension badges from the solved geometry.

The badge displays three distinct visual states based on its structural status:

> * Driving Dimension (Dark graphite text, solid dimension witness line): Represents an independent design parameter entered directly by the user.  
> * Derived Dimension (Muted grey text with a lock glyph): Represents a value determined by an underlying constraint chain (e.g., \\text{InnerWidth} \= \\text{OuterWidth} \- 2 \\cdot t\_{\\text{wall}}). Clicking a derived badge displays an informative prompt: *"This dimension is governed by OuterWidth and WallThickness. Would you like to override it and convert it into a driving dimension?"*  
> * Conflicting Dimension (Bright red highlight): Indicates that the constraint is over-constrained, conflicting with other active constraints. Over-constraint diagnostic messages translate internal solver IDs into user-facing parameter names: *"Setting ClearSpan to 700 conflicts with WallThickness and Haunch — try adjusting one of those dimensions first."*

### **Authoring Workflow, Candidate Clustering, and Disambiguation**

In Author Mode, the AutoFormula engine functions as an intelligent assistant, proposing structural relationships for review.  
Without clustering, relationship detection generates redundant formula proposals. When evaluating an octagonal void with four corner haunches, an unclustered detector generates four separate equality cards (L\_2 \= 49\\text{ mm}, L\_3 \= 49\\text{ mm}, L\_6 \= 50\\text{ mm}, L\_7 \= 49\\text{ mm}) alongside separate left and right offset formulas. The clustering pass groups these candidates prior to user presentation:

> 1. Group by Predicate Signature: Group candidates sharing the identical predicate type (HAUNCH\_LEG\_EQUALITY) and geometric parent context.  
> 2. Metric Tolerance Binning: Within each predicate group, cluster values within absolute tolerance \\epsilon\_{\\text{dist}} \= 1.0\\text{ mm}.  
> 3. Parameter Synthesis: Collapse the four individual haunch measurements into a single parameter card: HaunchSize \= 49 mm (Used by 4 corners: L2, L3, L6, L7).  
> 4. Sub-pixel Absorption: Minor discrepancies between measurements (49\\text{ mm} vs. 50\\text{ mm}) are resolved during the variational solve, absorbing small drafting inaccuracies into a consistent engineering parameter.

A fundamental ambiguity arises during parameter editing. Consider an internal opening of nominal width W\_{\\text{total}} \= 2000\\text{ mm} with corner chamfers of leg length h \= 49\\text{ mm}, where straight edge length L\_{\\text{straight}} \= W\_{\\text{total}} \- 2h \= 1902\\text{ mm}. The user increases the chamfer dimension from 49\\text{ mm} \\to 62\\text{ mm} (a 13\\text{ mm} increase).  
Geometric closure requires:  
W\_{\\text{total}} \= L\_{\\text{straight}} \+ 2h  
This single equation contains three variables. Modifying h leaves one degree of freedom undetermined, permitting two valid behaviors:

> * Case A: Hold total width W\_{\\text{total}} constant. The straight edge length absorbs the change, shrinking by 2 \\times 13 \= 26\\text{ mm} (L\_{\\text{straight}} \\to 1876\\text{ mm}).  
> * Case B: Hold straight edge length L\_{\\text{straight}} constant. The total envelope absorbs the change, expanding outward by 26\\text{ mm} (W\_{\\text{total}} \\to 2026\\text{ mm}).

The engine resolves this ambiguity deterministically through **acceptance order and parameter role tagging**:

> * If the author previously accepted the outer containment relationship (\\text{Inner\\\_Envelope} \= \\text{Outer} \- 2 \\cdot t\_{\\text{wall}}), total width W\_{\\text{total}} is locked as a FIXED or DERIVED target. Consequently, when the chamfer is adjusted, L\_{\\text{straight}} automatically absorbs the modification without ambiguity.  
> * If the author instead declared the straight span as a primary DRIVING parameter, modifying the chamfer pushes the outer boundaries outward.

Displaying explicit \[DRIVING\] and \[DERIVED\] tags on parameter cards communicates the governing parameter hierarchy directly to both draftsmen and authors.

## **Comprehensive Implementation Roadmap and Risk Mitigation**

### **Phased Execution Sequence**

The roadmap coordinates solver integration, UI restructuring, and template engine serialization into five sequential execution phases.

#### **Phase 1: Interactive Dimension Badges and AST Dependency Extraction**

> * Implementation Tasks:  
  1. Refactor features/canvas/DimensionBadge.tsx to handle click events, rendering an in-place numeric input styled to match the dark CAD design system.  
  2. Route badge commits to dispatch a SET\_DIMENSION\_OVERRIDE reducer action, instantiating a ParameterEntry with role: 'DRIVING' and generating a corresponding distance or offset ConstraintNode.  
  3. Replace the substring check in lib/parametric/dualGraphOrchestrator.ts with AST symbol extraction: parse expressions via expression.ts, walk the resulting abstract syntax tree, collect identifier nodes, and construct dependency edges strictly from verified symbol references.  
> * Verification Criterion: Automated test tests/unit/dual\_graph\_ast\_dependencies.test.ts passes, confirming that parameter W no longer registers false dependencies on WallThickness.

#### **Phase 2: Solver Layering and Dulmage-Mendelsohn Structural Decomposition**

> * Implementation Tasks:  
  1. Integrate @salusoft89/planegcs (WASM) as a core dependency, implementing PlaneGcsClient.ts as a wrapper mapping canvas primitives and constraints to the GcsWrapper API.  
  2. Retain SingleCellCulvertModel in lib/state/presets/singleCellCulvert.ts for specialized culvert solves, utilizing its analytical 24 \\times 24 hand-derived Jacobian.  
  3. Replace the scalar calculation in lib/parametric/graph/bipartiteGraph.ts with DulmageMendelsohnAnalyzer, implementing Hopcroft-Karp maximum bipartite matching to decompose systems into \\mathcal{G}\_{\\text{under}}, \\mathcal{G}\_{\\text{square}}, and \\mathcal{G}\_{\\text{over}} blocks.  
  4. Correct the rigid-motion degree-of-freedom calculation by subtracting 3 degrees of freedom once per floating connected component, leaving anchored components unpenalized.  
  5. Connect lib/inference/admissibilityFilter.ts into the candidate pipeline, executing SVD row-space projection prior to displaying inferred constraints.  
> * Verification Criterion: Test suites tests/unit/dulmage\_mendelsohn.test.ts and tests/unit/lm\_solver\_convergence.test.ts pass with zero failures.

#### **Phase 3: Implementation of GEOM-RP/1 Predicate Engine**

> * Implementation Tasks:  
  1. Implement lib/geometry/predicates/vectorPredicates.ts containing functions for predicates P1 through P8.  
  2. Refactor recognizeHaunches() in gadAssemblyEngine.ts to compute actual angles via \\operatorname{atan2}(\\mathbf{d}\_C \\times \\hat{\\mathbf{d}}\_A, \\mathbf{d}\_C \\cdot \\hat{\\mathbf{d}}\_A), supporting arbitrary splay angles.  
  3. Deprecate computeShapeBounds() across all relationship inference modules.  
  4. Implement pre-display candidate clustering in autoFormulaEngine.ts, grouping candidates by predicate signature and merging near-identical measured dimensions within \\epsilon\_{\\text{dist}} \= 1.0\\text{ mm}.  
> * Verification Criterion: Skewed and rotated test sketches (15^\\circ, 37^\\circ, 45^\\circ) correctly detect parallel wall offsets and chamfer dimensions without geometric distortion.

#### **Phase 4: Component-Port Protocol and Anisotropic Structural Assemblies**

> * Implementation Tasks:  
  1. Implement lib/parametric/component/portSolver.ts, utilizing 3 \\times 3 affine matrix composition from lib/geometry/lcs/affineMatrix.ts to attach child components to parent ports.  
  2. Implement Predicate P9 (Householder bilateral symmetry reflection).  
  3. Re-express rccBridgeTemplate.ts and SingleCellCulvertModel as declarative instances conforming to the Canonical Template Schema.  
  4. Remove hardcoded switch statements and magic string identifiers from model.ts.  
> * Verification Criterion: Multi-cell culvert benchmark passes; modifying ClearSpan on Bay 1 expands Bay 1 and translates Bay 2 rigidly while keeping intermediate web and external wall thicknesses constant.

#### **Phase 5: Draftsman Grips, Hardening, and Branch Merge**

> * Implementation Tasks:  
  1. Implement CAD grip rendering in features/canvas/SelectionOverlay.tsx (Vertex STRETCH, Midpoint EDGE\_OFFSET, Centroid MOVE).  
  2. Integrate SolveSpace-style Jacobian column scaling (s\_j \= 0.05) in dragSolver.ts for live grip dragging.  
  3. Validate full document import and export against standard RDSO GAD benchmark drawings.  
  4. Merge parametric\_formulation into main, resolving visual component styling differences.  
> * Verification Criterion: Full regression suite passes across all 41 test files with 170 passing tests and 1,036 assertions.

### **Risk Mitigation Matrix**

| Failure Mode | Root Cause | Engineering Guardrail |
| :---- | :---- | :---- |
| **Numerical Singularity in Planegcs** | Kinematic toggle positions or collinear segments causing rank deficiency. | Powell's Dogleg trust-region optimizer with SVD pseudo-inverse regularization; fall back to warm-start coordinates if residual norm fails to converge. |
| **Coordinate Drift Across Saves** | Premature rounding in heuristic inference (Math.round() in gadAssemblyEngine.ts). | Maintain state vector strictly as raw Float64Array values; restrict rounding exclusively to final SVG rasterization and dimension badge string formatting (toFixed(1)). |
| **Combinatorial Graph Explosion** | Global constraint solving over thousands of entities on large bridge GADs. | Subgraph partitioning via breadth-first search (bfsPartition.ts); isolate and solve only the modified connected component during edits, freezing uncoupled geometry. |
| **Draftsman Confusion via Redundant Inferences** | Inference engine proposing multiple unmerged candidate dimensions for repeated features. | Mandatory pre-display clustering; merge identical predicates within 1\\text{ mm} tolerance; gate all candidate proposals through Jacobian admissibility row-space projection. |
| **Circular Dependencies in DAG** | Procedural formula strings referencing variables circularly across nested features. | Tarjan's cycle-detection algorithm running in dependencyGraph.ts; block cyclical assignments and prompt the user to resolve the dependency loop. |
| **Model Inversion During Large Sweeps** | Non-linear distance constraints possessing dual algebraic roots (branch-jumping). | Solution hysteresis tracking; validate vertex signed cross-product chirality (\\tau\_{\\text{initial}} \\cdot \\tau\_{\\text{trial}} \> 0\) to reject steps that invert corner chamfers or wall normals. |

## **Technical Synthesis and Operational Outlook**

The architectural obstruction in the 2D-Canvas system was neither an absence of computational geometry concepts nor an unsolvable mathematical deficit. The codebase already possessed the necessary foundational components: DCEL topology, analytical Jacobians, Levenberg-Marquardt optimization, and SVD projection. The breakdown was caused by architectural disconnections: relying on axis-aligned bounding boxes that broke under rotation, using top-down procedural formula strings that prevented bidirectional interaction, and leaving core algebraic graph modules disconnected from the live canvas loop.  
By implementing the verified decisions established in this specification:

> * Adopting @salusoft89/planegcs for generic numerical constraint solving while retaining hand-derived analytical Jacobians for specialized culvert residuals,  
> * Replacing naive scalar degree-of-freedom calculations with Dulmage-Mendelsohn structural decomposition via Hopcroft-Karp bipartite matching,  
> * Upgrading heuristic detectors to the nine rotation-invariant vector and matrix predicates defined in GEOM-RP/1,  
> * Establishing a component-port protocol based on affine transformation frame composition to manage anisotropic multi-cell bridge expansion and repeating structural details, and  
> * Gating the interaction model through a strict persona separation where draftsmen work with CAD grips and editable dimension badges while authors curate clustered invariants,

the CAD engine eliminates procedural bottlenecks and establishes a deterministic parametric modeling system engineered to meet the operational demands of RDSO and IRC infrastructure drafting.

#### **Works cited**

1\. Aligning Constraint Generation with Design Intent in Parametric CAD, https://arxiv.org/html/2504.13178v1 2\. SketchGraphs: CAD Sketch Dataset \- Emergent Mind, https://www.emergentmind.com/topics/sketchgraphs-dataset 3\. A Single-Stage Architecture for Constrained CAD Sketch Inference, https://arxiv.org/html/2410.22857v1 4\. DAVINCI: A Single-Stage Architecture for Constrained CAD ... \- dblp, https://dblp.org/rec/conf/bmvc/KaradenizMMC0A24 5\. GitHub \- Salusoft89/planegcs: A webassembly wrapper for, https://github.com/Salusoft89/planegcs 6\. FreeCAD Sketcher constraint diagnosis and a clean long-term design, https://gist.github.com/tritao/c344bce33a241f8798d26829db1f8375 7\. A review on geometric constraint solving \- ResearchGate, https://www.researchgate.net/publication/358918504\_A\_review\_on\_geometric\_constraint\_solving 8\. A graph of constraints. | Download Scientific Diagram \- ResearchGate, https://www.researchgate.net/figure/A-graph-of-constraints\_fig3\_2580324