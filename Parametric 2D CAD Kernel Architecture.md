# **Architectural Specification for a Variational 2D CAD Geometry Kernel and Constraint Solver**

## **Section A: Understanding of the Geometric Parameterization Problem**

The parameterization of arbitrary two-dimensional computer-aided design geometry presents a classic dilemma in computational geometry: the mathematical tension between procedural drafting and declarative variational modeling. When a human designer or engineer sketches a physical profile on an interactive canvas, the initial digital representation is purely geometric and coordinate-driven. Each entity is instantiated as a collection of Euclidean coordinates in \\mathbb{R}^2, producing lines defined by endpoint pairs, polygons defined by ordered vertex arrays, and circles defined by center-radius tuples. However, the engineering intent embedded within the drawing is fundamentally qualitative, topological, and relational. The designer sketches two segments that touch to represent a continuous physical boundary; they sketch lines roughly parallel to represent a constant wall thickness; and they sketch diagonal corners to represent structural haunches or chamfers intended to mitigate stress concentrations.  
The uploaded engineering sketches illustrate the exact point where procedural geometry breaks down. The primary sketch details a reinforced concrete box culvert cross-section, characterized by an outer rectangular boundary and an internal octagonal void formed by four primary orthogonal wall faces and four corner haunches angled at forty-five degrees. A secondary sketch expands this domain into a two-span, multi-cell culvert featuring two adjacent octagonal voids separated by an intermediate structural dividing wall. The engineering requirement stipulates that modifying a single functional parameter—specifically, the internal horizontal clear span of a cell from a nominal dimension to an expanded width of 500 units—must propagate through the entire structural assembly.  
The physical structure must expand along its deformation axis, shifting the exterior sidewalls and intermediate partitions while preserving:

> * The specified structural slab and wall thicknesses (t\_{\\text{top}}, t\_{\\text{bot}}, t\_{\\text{ext}}, t\_{\\text{mid}}).  
> * The fixed geometric leg lengths and forty-five-degree angular orientations of the corner haunches.  
> * The strict collinearity and slope continuity of the continuous exterior boundaries.  
> * The topological closure of all participating boundary loops without tearing coincident joints or displacing vertices into free space.

When an authoring tool relies on explicit, user-authored formulas (such as declaring that a right-hand vertex coordinate equals a left-hand coordinate plus five intermediate variables), the parametric authoring workflow collapses under cognitive and combinatorial burden. The user is forced to anticipate every algebraic relationship, establish a rigid evaluation order, and manually resolve bidirectional dependencies. The fundamental objective of an intelligent 2D geometric modeling kernel is to eliminate this manual formula construction. The kernel must autonomously discover topological connectivity, deduce implicit geometric relationships, formulate the underlying simultaneous algebraic equations, analyze available degrees of freedom, and solve for new equilibrium coordinates upon parameter perturbation, all while preserving the intuitive behavior of the sketch.

## **Section B: Critical Evaluation of the Existing Implementation**

A rigorous technical analysis of the existing codebase reveals that its mathematical underpinnings are fundamentally procedural rather than variational. The existing system treats parametric modeling as an evaluation pipeline where formulas are parsed into an Abstract Syntax Tree, evaluated via Directed Acyclic Graph topological sorting, and applied as one-directional assignments to shape coordinate properties. While this pattern is sufficient for basic hierarchical graphics, it cannot support closed-loop kinematic or architectural structures.

| Subsystem | Existing Implementation Mechanism | Theoretical Breakdown at CAD Scale | Architectural Remediation |
| :---- | :---- | :---- | :---- |
| **Relational Model** | Unidirectional string expression parsing evaluating assignment statements. | Enforces single-direction causality (y \\leftarrow f(x)); cannot accommodate bidirectional driving dimensions or cyclic geometric constraints. | Replace with a declarative residual equation system (f\_i(\\mathbf{X}) \= 0\) evaluated via simultaneous numerical relaxation. |
| **Connected Scaling** | Isotropic conformal similarity scaling based on a single edge length ratio (k \= L\_{\\text{target}} / L\_{\\text{orig}}). | Scales all dimensions uniformly; doubling the clear span erroneously doubles the structural wall thickness and haunch sizes. | Replace with an anisotropic degree-of-freedom constraint solver preserving metric invariants. |
| **Loop Closure** | Linear residual distribution vector (\\mathbf{V}\_i' \= \\mathbf{V}\_i \- \\frac{i}{N}\\vec{\\delta}) over closed vertex loops. | Treats closure gaps as cumulative artifacts; shears angles, breaks orthogonal wall perpendicularity, and distorts haunches. | Enforce topological vertex sharing and exact geometric closure via non-linear constraints. |
| **Coordinate Hierarchy** | Flat global Cartesian coordinates per primitive shape, paired with an uncoupled Local Coordinate System (LCS) transform. | Shapes do not define boundaries relative to adjacent boundaries; modifying a parent shape requires global coordinate recalculations. | Implement a scene-graph hierarchy using 3 \\times 3 homogeneous affine transformation matrices. |
| **Topological Reasoning** | Proximity-based endpoint snapping using Disjoint-Set Union (DSU) clustering with a 20-pixel threshold. | Prone to clustering ambiguity; lacks half-edge orientation, face definitions, and boundary-interior winding validation. | Replace with a rigorous Doubly Connected Edge List (DCEL) planar map data structure. |
| **State Synchronization** | Model synchronizer prioritizing explicit variables over shape properties via an immutable reducer. | Canvas dragging can fight active formula evaluation, resulting in coordinate snapping wars or frozen parameters. | Establish a strict separation between persistent invariants and transient solved caches. |

The core flaw in the current architecture is the conceptual conflation of equations with formulas. A formula is an imperative procedural instruction that assigns a value to a single variable based on known inputs. An engineering relationship, by contrast, is a declarative invariant: it asserts that two segments must remain parallel, that a normal offset must equal a specified wall thickness, or that the angle between two lines must remain exactly forty-five degrees. Attempting to resolve such invariants through linear distribution and conformal scaling inevitably corrupts complex drawings.  
The system architecture must transition to a proper geometric kernel. What should be retained is the clean, modular separation of concerns, the high-performance native SVG DOM presentation layer, and the non-destructive command history. What must be completely replaced is the conformal scaling logic, the heuristic loop distribution algorithm, and the flat coordinate storage. The missing components are a true boundary-representation topology layer, an undirected bipartite constraint graph, a non-linear variational solver, and an automated geometric relationship inference engine.

## **Section C: Proposed Multi-Layered Conceptual Architecture**

To construct an industrial-grade modeling kernel, the software must be organized into nine distinct architectural layers. Each layer encapsulates a specific mathematical abstraction, maintaining clean architectural boundaries from raw topology up to rendering.  
The architectural flow progresses through the following layers:

> 1. **Topology Layer (Planar Map / Half-Edge DCEL)**: Manages combinatorial connectivity, topological vertices, directed half-edges, boundary loops, and faces without reference to continuous Euclidean metrics.  
> 2. **Geometry Layer (Geometric Primitives & Carriers)**: Binds topological entities to continuous spatial curves and surfaces in \\mathbb{R}^2, including points, line segments, circular arcs, and parametric splines.  
> 3. **Local Coordinate Systems (LCS & Affine Transforms)**: Establishes hierarchical reference frames using 3 \\times 3 homogeneous transformation matrices, defining relative spatial placements and nested assemblies.  
> 4. **Parameter System (Scalar Variables)**: Encapsulates all scalar degrees of freedom, distinguishing between free, driving, dependent, and fixed variables.  
> 5. **Geometric Relationships (Predicates & Semantic Facts)**: Discovers and stores qualitative relationships between geometric primitives, such as parallelism, perpendicularity, tangency, and concentricity.  
> 6. **Constraint System (Declarative Invariants & Equations)**: Formulates qualitative relationships and dimensional annotations as simultaneous non-linear residual equations of the form f\_j(\\mathbf{X}) \= 0\.  
> 7. **Dependency and Constraint Graph (Dual-Graph Orchestration)**: Combines a Directed Acyclic Graph (DAG) for functional variable assignments with a Bipartite Graph for simultaneous variational geometry.  
> 8. **Constraint Solver (Variational Numerical Kernel)**: Computes state updates using damped Levenberg-Marquardt optimization combined with Singular Value Decomposition (SVD) for minimum-norm under-constrained projection.  
> 9. **Resolved Geometry, Derived Properties, and Presentation Layer**: Evaluates post-solve analytical metrics (Shoelace area, centroids, moments of inertia) and projects the resolved model to the native SVG DOM.

The fundamental role of each layer ensures that topological invariants (such as whether two edges share a vertex) are separated from geometric metrics (such as the length or angle of those edges). When topology is treated as an independent layer, operations like dragging a vertex or expanding a wall cannot accidentally split a joint or alter the connectivity of the structural frame.

## **Section D: Automated Relationship and Constraint Discovery Engine**

A central objective of the proposed architecture is to eliminate the need for manual formula authoring by automatically deriving mathematical representations directly from sketched geometry. When a designer sketches a geometric primitive, the kernel automatically instantiates its mathematical properties as queryable variables and derives its internal invariants.  
For a line segment connecting points \\mathbf{P}\_A and \\mathbf{P}\_B, the system automatically instantiates the endpoints as primary parameters while exposing derived quantities: the direction vector \\mathbf{d} \= \\mathbf{P}\_B \- \\mathbf{P}\_A, the Euclidean length L \= \\Vert{}\\mathbf{d}\\Vert{}, the orientation angle \\theta \= \\text{atan2}(d\_y, d\_x), the midpoint \\mathbf{M} \= \\frac{1}{2}(\\mathbf{P}\_A \+ \\mathbf{P}\_B), the outward unit normal \\hat{\\mathbf{n}} \= (-d\_y, d\_x)^T / \\Vert{}\\mathbf{d}\\Vert{}, and the axis-aligned bounding box. For a circular arc, the kernel instantiates the center \\m\[span\_120\](start\_span)\[span\_120\](end\_span)athbf{P}\_C, radius R, start angle \\theta\_1, and end angle \\theta\_2, exposing arc length, chord length, sagitta, and tangent vectors at both boundaries. Closed polygons automatically expose edge length arrays, interior angles, total perimeter, winding order, analytical area, and geometric centroid.  
To convert a freehand sketch into a fully parametric CAD model, the kernel executes an automated relationship discovery pipeline upon each user interaction. This pipeline follows a structured sequence:

> * **Spatial Indexing and Proximity Querying**: All newly drafted or translated entities are queried against an spatial R-tree index within an adaptive snap radius \\epsilon\_{\\text{snap}}.  
> * **Topological Fact Extraction**: Coincident endpoints within distance tolerance \\epsilon\_{\\text{coincident}} are welded into a single topological vertex record within the Doubly Connected Edge List, eliminating redundant degrees of freedom at the data structure level.  
> * **Geometric Fact Deduction**: Structural regularities inherent to primitive creation are asserted as hard invariants. A rectangle primitive automatically generates four internal perpendicularity constraints and two parallel-pair constraints.  
> * **Heuristic Geometric Inference**: Segments exhibiting near-orthogonal alignments (\\vert{}\\theta \- 0\\vert{} \\le \\epsilon\_\\theta, \\vert{}\\theta \- \\frac{\\pi}{2}\\vert{} \\le \\epsilon\_\\t\[span\_65\](start\_span)\[span\_65\](end\_span)heta) generate candidate horizontal or vertical constraints. Pairs of segments with matching slopes generate candidate parallelism constraints, while near-equal lengths generate candidate equal-length constraints.  
> * **Structural Haunch and Chamfer Recognition**: Diagonal segments that bridge mutually perpendicular boundaries and form angles of 45^\\circ \\pm \\epsilon\_\\theta with both incident boundaries are classified as structural haunches. The engine establishes a haunch invariant:(\\mathbf{P}\_{\\text{end}} \- \\mathbf{P}\_{\\text{start}}) \\cdot (\\hat{\\mathbf{i}} \\pm \\hat{\\mathbf{j}}) \= 0 which locks the haunch inclination to forty-five degrees regardless of frame translations.  
> * **Parallel Offset and Wall Thickness Extraction**: When two parallel linear chains are detected separated by distance t \\in \[t\_{\\text{min}}, t\_{\\text{max}}\], the system extracts a candidate wall thickness constraint:(\\mathbf{P}\_j \- \\mathbf{P}\_i) \\cdot \\hat{\\mathbf{n}}\_i \- t\_{\\text{\[span\_114\](start\_span)\[span\_114\](end\_span)wall}} \= 0  
> * **Admissibility Filtering via Degree-of-Freedom Analysis**: Candidate constraints are evaluated against the current system Jacobian matrix. If a candidate constraint row is linearly dependent on existing rows, it is discarded if redundant, or flagged if contradictory, preventing inadvertent over-constraint.

The system distinguishes between different levels of geometric assertions through a structured classification framework:

| Assertion Class | Mathematical Origin | Invariant Strength | DOF Impact | Engine Lifecycle Behavior |
| :---- | :---- | :---- | :---- | :---- |
| **Geometric Fact** | Intrinsic topology (e.g., shared vertices, closed loop boundaries, rectangle corners). | Structural / Inviolable | Permanently eliminates 2 DOFs per coincidence at the topological data level. | Maintained indefinitely through DCEL connectivity records. |
| **Geometric Inference** | Heuristic alignments detected during drafting within defined tolerances. | Soft / Heuristic | Proposes removal of 1 DOF per equation, subject to rank analysis. | Displayed as candidate visual guides; discarded if overridden by user transformations. |
| **User Constraint** | Explicit engineering declarations applied by the user (e.g., clear span \= 500, wall thickness \= 40). | Hard / Inviolable | Removes 1 to 2 DOFs per equation. | Formulates hard residual equations in the active solver matrix. |
| **User Formula** | Explicit algebraic relations linking independent variables (e.g., t\_{\\text{bot}} \= t\_{\\text{top}} \\times 1.25). | Functional Dependency | Eliminates 1 DOF by converting a variable into a dependent state. | Evaluated via DAG topological sorting prior to the variational solve. |
| **Derived Measurement** | Analytical metrics evaluated from the solved state (e.g., total culvert void area, section modulus). | Passive Observer | 0 DOF impact on the geometry. | Evaluated in the post-solve update cycle; read-only data binding. |

## **Section E: Dual-Graph Architecture: Dependency DAG and Bipartite Constraint Graph**

A fundamental limitation in basic CAD architectures is using a single graph to handle both functional variable evaluations and simultaneous geometric constraints. In a functional dependency graph, edges indicate directional data flow (A \\rightarrow B means B is computed from A). In geometric modeling, however, constraints are non-directional invariants: an assertion of perpendicularity between two walls binds both entities mutually, without an intrinsic input or output. Attempting to represent variational geometry in a directed graph leads to artificial cycle errors whenever geometry forms closed loops.  
The proposed architecture resolves this challenge using a dual-graph engine:  
User Input: Parameter Edit or Direct Drag  
                │  
                ▼  
┌─────────────────────────────────────────────────────────────┐  
│ Directed Acyclic Graph (DAG) — Pre-Solve Evaluation         │  
│ 1\. Evaluates user symbolic formulas (e.g., Span\_2 \= Span\_1) │  
│ 2\. Detects expression cycles via Tarjan's algorithm         │  
│ 3\. Propagates driving dimension targets to constraint graph │  
└──────────────────────────────┬──────────────────────────────┘  
                               │  
                               ▼  
┌─────────────────────────────────────────────────────────────┐  
│ Bipartite Graph — Simultaneous Variational Solving          │  
│ 1\. Disjoint node sets: Geometries (V) and Constraints (C)   │  
│ 2\. Decomposes connected topological subgraphs               │  
│ 3\. Executes Levenberg-Marquardt numerical relaxation        │  
│ 4\. Computes minimum-norm coordinate updates                 │  
└─────────────\[span\_3\](start\_span)\[span\_3\](end\_span)\[span\_13\](start\_span)\[span\_13\](end\_span)─────────────────┬──────────────────────────────┘  
                               │  
                               ▼  
┌─────────────────────────────────────────────────────────────┐  
│ Directed Acyclic Graph (DAG) — Post-Solve Evaluation        │  
│ 1\. Ingests resolved Cartesian coordinates (x, y)            │  
│ 2\. Re-evaluates derived geometric metrics (Area, Centroid)  │  
│ 3\. Emits dirty bounding boxes to native SVG renderer        │  
└─────────────────────────────────────────────────────────────┘

The Directed Acyclic Graph (DAG) manages explicit functional assignments. Nodes represent named scalar parameters, and directed edges define computational dependencies. Tarjan's algorithm for strongly connected components continuously monitors this graph to prevent cyclic deadlocks during formula editing.  
The Constraint Graph is an undirected bipartite graph G \= (V\_G, C\_G, E\_G)\[span\_157\](start\_span)\[span\_157\](end\_span)\[span\_161\](start\_span)\[span\_161\](end\_span). The node set V\_G represents geometric entities (such as vertices, line carriers, and local coordinate frames), the node set C\_G represents geometric constraints, and the edge set E\_G links constraints to the geometric entities they govern. The constraint graph operates variationally: it has no fixed directionality or predefined causal sequence.  
When a user modifies a dimension, the execution pipeline coordinates the two graphs in a clear lifecycle:

> 1. **Pre-Solve DAG Pass**: The modified parameter triggers a forward sweep through the DAG, evaluating all explicit symbolic expressions and producing target numerical values for driving dimensions.  
> 2. **Target Binding**: The resulting values are bound into the corresponding constraint nodes within the bipartite graph as target constants.  
> 3. **Variational Solve Pass**: The numerical solver executes across the active connected subgraphs of the bipartite graph, adjusting geometric entity coordinates to satisfy all residual equations.  
> 4. **Post-Solve DAG Pass**: The newly resolved coordinates are returned to the DAG as inputs for downstream, read-only derived properties such as loop areas, perimeters, and section centroids.  
> 5. **Render Dispatch**: The updated geometry and derived metrics are dispatched to the native SVG DOM rendering layer.

\---

## **Section F: Variational Constraint Solver and Degree-of-Freedom Mobility Engine**

### **Degree-of-Freedom Mobility Engine**

To maintain physical consistency, the kernel must continuously determine how many degrees of freedom remain available within the drawing. For a planar sketch containing V free geometric vertices, the unconstrained system possesses 2V degrees of freedom, representing independent translations along the X and Y axes for every point. Under planar rigidity theory (derived from Laman's theorem and Grübler's mobility criterion), the net mobility of the system is given by:  
\\text{DOF} \= 2V \- \\text{rank}(\\mathbf{J}) \- D\_{\\text{rigid}}  
where \\mathbf{J} is the constraint Jacobian matrix and D\_{\\text{rigid}} \= 3 accounts for the trivial rigid-body motions of the plane (two translations, one rotation), unless the sketch is anchored to the global coordinate origin.  
The system's degree-of-freedom state governs how the solver responds:

> * **Under-Constrained (\\text{DOF} \> 0\)**: The sketch retains internal mobility. Perturbing a parameter allows infinite mathematically valid configurations. The solver must compute a unique solution that minimizes structural distortion relative to the prior sketch configuration.  
> * **Well-Constrained (\\text{DOF} \= 0\)**: The geometric configuration is locally rigid and uniquely determined up to discrete algebraic branches.  
> * **Over-Constrained (\\text{DOF} \< 0 or \\text{rank}(\\mathbf{J}) \< C)**: The system contains redundant or mutually contradictory constraints, requiring algorithmic identification and diagnostic isolation.

### **Mathematical Formulation of the Variational Solver**

The geometric constraint satisfaction problem is formulated as finding a parameter state vector \\mathbf{X} \\in \\mathbb{R}^n (containing all active vertex coordinates) such that the system of non-linear residual equations vanishes:  
\\mathbf{F}(\\mathbf{X}) \= \\begin{bmatrix} f\_1(\\mathbf{X}) \\\\ f\_2(\\mathbf{X}) \\\\ \\vdots \\\\ f\_m(\\mathbf{X}) \\end{bmatrix} \= \\mathbf{0}  
Because closed boundaries, angular haunches, and dimensional offsets introduce non-linear polynomial and trigonometric terms, direct analytical inversion is intractable. The kernel executes iterative non-linear least-squares minimization:  
\\min\_{\\mathbf{X}} \\Phi(\\mathbf{X}) \= \\frac{1}{2} \\|\\mathbf{F}(\\mathbf{X})\\|^2 \= \\frac{1}{2} \\mathbf{F}(\\mathbf{X})^T \\mathbf{F}(\\mathbf{X})  
The Jacobian matrix \\mathbf{J}(\\mathbf{X}) \\in \\mathbb{R}^{m \\times n} contains the partial derivatives of all constraint residuals with respect to the state variables:  
\\mathbf{J}\_{ij} \= \\frac{\\partial f\_i(\\mathbf{X})}{\\partial X\_j}  
To ensure numerical stability when approaching kinematic singularities (such as toggle positions or collinear segments), the solver employs the Levenberg-Marquardt formulation, which adaptively interpolates between Gauss-Newton descent and gradient descent:  
\\left( \\mathbf{J}(\\mathbf{X}\_k)^T \\mathbf{J}(\\mathbf{X}\_k) \+ \\lambda\_k \\text{diag}(\\mathbf{J}^T \\mathbf{J}) \\right) \\Delta \\mathbf{X}\_k \= \-\\mathbf{J}(\\mathbf{X}\_k)^T \\mathbf{F}(\\mathbf{X}\_k)  
where \\lambda\_k \> 0 is a dynamic damping factor adjusted according to the ratio of actual to predicted residual reduction.  
The iterative numerical relaxation cycle proceeds through distinct steps:

> 1. Evaluate constraint residuals \\mathbf{F}(\\mathbf{X}\_k) and Jacobian matrix \\mathbf{J}(\\mathbf{X}\_k)\[span\_215\](start\_span)\[span\_215\](end\_span)\[span\_222\](start\_span)\[span\_222\](end\_span) at the current state vector \\mathbf{X}\_k.  
> 2. Assess convergence: if the infinity norm \\|\\mathbf{F}(\\mathbf{X}\_k)\\|\_\\infty \< \\epsilon\_{\\text{tol}} (typically 10^{\[span\_225\](start\_span)\[span\_225\](end\_span)\[span\_226\](start\_span)\[span\_226\](end\_span)-8}), terminate and commit the state vector.  
> 3. Compute Singular Value Decomposition of the Jacobian: \\mathbf{J\[span\_227\](start\_span)\[span\_227\](end\_span)\[span\_229\](start\_span)\[span\_229\](end\_span)} \= \\mathbf{U} \\mathbf{\\Sigma} \\mathbf{V}^T.  
> 4. If the system is under-constrained (m \< n or singular values \\sigma\_i \< \\epsilon\_{\\text{sing}}), evaluate the minimum-norm update step using the Moore-Penrose pseudo-inverse: \\Delta \\mathbf{X}^\* \= \-\\mathbf{V} \\mathbf{\\Sigma}^+ \\mathbf{U}^T \\mathbf{F}(\\mathbf{X}\_k).  
> 5. If the system is fully determined, solve the damped normal equations directly for \\Del\[span\_216\](start\_span)\[span\_216\](end\_span)\[span\_223\](start\_span)\[span\_223\](end\_span)ta \\mathbf{X}\_k.  
> 6. Perform line-search validation on trial state \\mathbf{X}\_{\\text{trial}} \= \\mathbf{X}\_k \+ \\Delta \\mathbf{X}: if residual norm decreases, accept step (\\mathbf{X}\_{k+1} \= \\mathbf{X}\_{\\text{trial}}) and decrease damping parameter \\lambda; if residual increases, reject step, increase \\lambda\[span\_217\](start\_span)\[span\_217\](end\_span)\[span\_224\](start\_span)\[span\_224\](end\_span), and recompute.

### **Minimum-Norm Projection for Interactive Manipulation**

Interactive sketching systems are predominantly under-constrained (\\text{DOF} \> 0). When a designer edits a parameter (such as expanding the culvert inner span), solving the under-determined linear system \\mathbf{J} \\Delta \\mathbf{X} \= \-\\mathbf{F} allows an infinite space of valid coordinate displacements.  
To produce natural, intuitive behavior, the kernel isolates the *minimum-norm solution* via the Moore-Penrose pseudo-inverse \\mathbf{J}^+:  
\\Delta \\mathbf{X}^\* \= \-\\mathbf{J}^+ \\mathbf{F}(\\mathbf{X}) \= \-\\mathbf{V} \\mathbf{\\Sigma}^+ \\mathbf{U}^T \\mathbf{F}(\\mathbf{\[span\_192\](start\_span)\[span\_192\](end\_span)\[span\_198\](start\_span)\[span\_198\](end\_span)\[span\_204\](start\_span)\[span\_204\](end\_span)X})  
This formulation minimizes the total squared Euclidean displacement across all sketch vertices:  
\\min \\|\\Delta \\mathbf{X}\\|^2 \= \\sum\_{i=1}^V \\left( (x\_i^{\\text{new}} \- x\_i^{\\text{old}})^2 \+ (y\_i^{\\text{new}} \- y\_i^{\\text{old}})^2 \\right)  
subject to satisfying all hard engineering constraints. As a direct result, geometry that is not mechanically coupled to the modified dimension remains stationary, preventing the global drift and unexpected distortions that occur in naive solvers.

### **Bidirectional Solving Dynamics**

In a variational modeling kernel, parameters are not hardcoded as inputs or outputs. The role of driving versus dependent variable is determined dynamically at runtime by user context.

> * **Engineering Relationship Invariant**: A relationship such as \\text{Span}\_{\\text{total}} \= \\text{Span}\_1 \+ \\text{Span}\_2 \+ t\_{\\text{mid}} is stored internally as a zero-residual equation:f(\\text{Span}\_{\\text{total}}, \\text{Span}\_1, \\text{Span}\_2, t\_{\\text{mid}}) \= \\text{Span}\_{\\text{total}} \- (\\text{Span}\_1 \+ \\text{Span}\_2 \+ t\_{\\text{mid}}) \= 0  
> * **Inspector Numerical Update**: When a designer enters a value for \\text{Span}\_1 in the property panel, \\text{Span}\_1 is locked as a temporary fixed parameter for the duration of the solve cycle. The solver calculates the adjustment to \\text{Span}\_{\\text{total}} while preserving t\_{\\text{mid}} and \\text{Span}\_2 according to their constraint definitions.  
> * **Direct Manipulation Drag**: When the designer interactively drags the exterior right wall, the coordinate of that wall becomes the driving variable. The solver preserves the external wall thickness constraints and updates the internal spans accordingly, reversing the data flow without requiring formulas to be rewritten.

## **Section G: Hierarchical Local Coordinate Systems and Orthonormal Framing**

To prevent global coordinate coupling and eliminate complex trigonometric expressions during the evaluation of multi-component assemblies, the kernel uses a hierarchical Local Coordinate System (LCS) architecture based on homogeneous transformation matrices.

### **Affine Frame Representation and Transformations**

Every composite profile, sub-cell, or virtual reference entity maintains a local 2D reference frame \\mathcal{F} \= (\\mathbf{O}, \\mat\[span\_74\](start\_span)\[span\_74\](end\_span)hbf{u}, \[span\_5\](start\_span)\[span\_5\](end\_span)\[span\_15\](start\_span)\[span\_15\](end\_span)\\mathbf{v}), where \\mathbf{O} \= (x\_0, y\_0)^T represents the local frame origin in parent coordinates and \\mathbf{u}, \\mathbf{v} \\in \\mathbb{R}^2 form an orthonormal basis:  
\\|\\mathbf{u}\\| \= 1, \\quad \\|\\mathbf{v}\\| \= 1, \\quad \\mathbf{u} \\cdot \\mathbf{v} \= 0  
The forward transformation mapping a point from local coordinates \[span\_75\](start\_span)\[span\_75\](end\_span)\\mathbf{P}\_l \= (x\_l, y\_l, 1)^T to world coordinates \\mathbf{P}\_w \= (x\_w, y\_w, 1)^T is evaluated via a 3 \\times 3 homogeneous affine matrix \\mathbf{M}\_{\\text{local} \\to \\text{world}}:  
\\mathbf{P}\_w \= \\mathbf{M}\_{\\text{local} \\to \\text{world}} \\mathbf{P}\_l \= \\begin{bmatrix} u\_x &\[span\_92\](start\_span)\[span\_92\](end\_span) v\_x & x\_0 \\\\ u\_y & v\_y & y\_0 \\\\ 0 & 0 & 1 \\end{bmatrix} \\begin{bmatrix} x\_l \\\\ y\_l \\\\ 1 \\end{bmatrix}  
For planar frames rotated by angle \\theta relative to their parent frame, the basis vectors simplify to \\mathbf{u} \= (\\cos\\theta, \\sin\\theta)^T and \\mathbf{v} \= (-\\sin\\theta, \\cos\\theta)^T. The inverse projection is computed using the rigid-body inverse:

\\mathbf{M}^{-1} \= \\begin{bmatrix} u\_x & u\_y & \-\\mathbf{O} \\cdot \\mathbf{u} \\\\ v\_x & v\_y & \-\\mathbf{O} \\cdot \\mathbf{v} \\\\ 0 & 0 & 1 \\end{bmatrix}

### **Relative Framing and Gram-Schmidt Orthonormalization**

When creating local coordinate frames aligned with arbitrary construction lines or angled boundaries (such as a roof pitch, haunch axis, or skew bridge centerline), the kernel constructs an orthonormal basis using the Gram-Schmidt process. Given an arbitrary, non-zero directional vector \\mathbf{w}\_1 aligned with a guide segment:  
\\mathbf{u} \= \\frac{\\mathbf{w}\_1}{\\|\\mathbf{w}\_1\\|}  
The orthogonal transverse vector \\mathbf{v} is evaluated directly in the 2D plane by computing the positive normal:  
\\mathbf{v} \= \\begin{bmatrix} \-u\_y \\\\ u\_x \\end{bmatrix}  
Gram-Schmidt orthonormalization operates here as an algebraic frame constructor, not as a constraint solver. It establishes local reference systems where relative geometric relationships can be expressed without coupling them to global axes.  
The transformation hierarchy organizes spatial relationships across nested assemblies:

> * **World Coordinate Frame (\\mathcal{F}\_{\\text{world}})**: The root Euclidean coordinate space of the canvas document.  
> * **Structural Assembly Frame (\\mathcal{F}\_{\\text{culvert}})**: Positioned at origin (X\_{\\text{base}}, Y\_{\\text{base}}) with rotation \\theta\_{\\text{culvert}}, defining the overall position of the culvert structure.  
> * **Cell 1 Local Frame (\\mathcal{F}\_{\\text{cell1}})**: Nested within \\mathcal{F}\_{\\text{culvert}} at offset (t\_{\\text{ext}}, t\_{\\text{bot}}), owning the octagonal boundary loop of the first internal void.  
> * **Cell 2 Local Frame (\\mathcal{F}\_{\\text{cell2}})**: Nested within \\mathcal{F}\_{\\text{culvert}} at dynamic offset (t\_{\\text{ext}} \+ \\text{Span}\_1 \+ t\_{\\text{mid}}, t\_{\\text{bot}}), owning the octagonal boundary loop of the adjacent void.

When the clear span of Cell 1 expands, Cell 2 shifts automatically through matrix composition:  
\\mathbf{M}\_{\\text{cell2}} \= \\mathbf{M}\_{\\text{culvert}} \\cdot \\mathbf{T}(\\Delta x, 0\)  
where \\Delta x \= t\_{\\text{ext}} \+ \\text{Span}\_1 \+ t\_{\\text{mid}}. The internal vertices of Cell 2 undergo zero local displacement, maintaining internal haunch geometries and wall perpendicularity without requiring vertex-level calculations.

## **Section H: Irregular Shape Solving and Multi-Cell Structural Culvert Expansion**

The structural box culvert sketches provide concrete benchmarks for evaluating how the variational constraint kernel solves complex closed shapes.

### **Benchmark Case 1: Single-Cell Culvert with Haunched Chamfers**

The single-cell profile consists of an outer rectangular loop (vertices \\mathbf{V}\_0, \\mathbf{V}\_1, \\mathbf{V}\_2, \\mathbf{V}\_3) and an inner octagonal void loop (vertices \\mathbf{U}\_0 through \\mathbf{U}\_7). The four diagonal segments (\\mathbf{U}\_1\\mathbf{U}\_2, \\mathbf{U}\_3\\mathbf{U}\_4, \\mathbf{U}\_5\\mathbf{U}\_6, \\mathbf{U}\_7\\mathbf{U}\_0) form forty-five-degree haunches.  
In the single-cell structure, the outer boundary forms a closed rectangle with vertices arranged counter-clockwise from the top-left \\mathbf{V}\_0 through \\mathbf{V}\_3. The interior octagonal void comprises horizontal roof and floor segments \\mathbf{U}\_0\\mathbf{U}\_1 and \\mathbf{U}\_4\\mathbf{U}\_5, vertical sidewall segments \\mathbf{U}\_2\\mathbf{U}\_3 and \\mathbf{U}\_6\\mathbf{U}\_7, and four diagonal haunches.  
When the user increases the internal clear span dimension from W\_{\\text{initial}} to W\_{\\text{target}}:

> 1. **Constraint System Assembly**:  
   * *Clear Span Target Constraint*: (\\mathbf{U}\_2 \- \\mathbf{U}\_7) \\cdot \\hat{\\mathbf{i}} \- W\_{\\text{target}} \= 0\.  
   * *Horizontal Slab Thickness Constraints*: Distance constraints enforce that horizontal interior segments remain separated from outer edges by constant scalar offsets:(\\mathbf{U}\_0 \- \\mathbf{V}\_0) \\cdot \\hat{\\mathbf{j}} \- t\_{\\text{top}} \= 0, \\quad (\\mathbf{V}\_3 \- \\mathbf{U}\_5) \\cdot \\hat{\\mathbf{j}} \- t\_{\\text{bot}} \= 0  
   * *Sidewall Thickness Constraints*: Distance constraints lock the lateral offsets:(\\mathbf{U}\_7 \- \\mathbf{V}\_0) \\cdot \\hat{\\mathbf{i}} \- t\_{\\text{left}} \= 0, \\quad (\\mathbf{V}\_1 \- \\mathbf{U}\_2) \\cdot \\hat{\\mathbf{i}} \- t\_{\\text{right}} \= 0  
   * *Haunch Metric Invariants*: The four diagonal haunches are governed by invariant leg projections:|(\\mathbf{U}\_1 \- \\mathbf{U}\_2) \\cdot \\hat{\\mathbf{i}}| \= h\_x, \\quad |(\\mathbf{U}\_1 \- \\mathbf{U}\_2) \\cdot \\hat{\\mathbf{j}}| \= h\_y, \\quad h\_x \= h\_y  
> 2. **Solver Execution**:  
   * With vertex \\mathbf{V}\_0 anchored as the datum origin, the solver evaluates the minimum-norm update vector \\Delta \\mathbf{X}^\*\[span\_228\](start\_span)\[span\_228\](end\_span)\[span\_230\](start\_span)\[span\_230\](end\_span).  
   * Horizontal edges \\mathbf{U}\_0\\mathbf{U}\_1 and \\mathbf{U}\_5\\mathbf{U}\_4 elongate along the X-axis by \\Delta W \= W\_{\\text{target}} \- W\_{\\text{initial}}.  
   * Vertices \\mathbf{U}\_1, \\mathbf{U}\_2, \\mathbf{U}\_3, \\mathbf{U}\_4 translate horizontally by \\Delta W, while their vertical coordinates remain unchanged, preserving haunch dimensions and angles.  
   * The outer boundary vertices \\mathbf{V}\_1 and \\mathbf{V}\_2 translate horizontally by \\Delta W, maintaining the right sidewall thickness t\_{\\text{right}}.  
   * The thickness of the top and bottom slabs remains unaffected, preventing the distortion caused by similarity scaling.

### **Benchmark Case 2: Two-Span Multi-Cell Culvert**

In the two-span configuration, the structural frame contains two adjacent voids separated by a common interior wall of thickness t\_{\\text{mid}}.  
The geometry comprises three closed loops: one outer rectangular loop and two interior octagonal void loops. The governing constraints link the clear spans of both cells and enforce the intermediate dividing wall thickness:  
\\text{ClearSpan}\_1 \= (\\mathbf{U}\_{1,2} \- \\mathbf{U}\_{1,7}) \\cdot \\hat{\\mathbf{i}} \\text{ClearSpan}\_2 \= (\\mathbf{U}\_{2,2} \- \\mathbf{U}\_{2,7}) \\cdot \\hat{\\mathbf{i}} \\text{WallOffset}\_{\\text{mid}} \= (\\mathbf{U}\_{2,7} \- \\mathbf{U}\_{1,2}) \\cdot \\hat{\\mathbf{i}} \- t\_{\\text{mid}} \= 0  
When the user updates the clear span of Cell 1:

> * The solver calculates the updated span for Cell 1, extending its internal horizontal segments.  
> * Because the common wall constraint links the right interior edge of Cell 1 to the left interior edge of Cell 2 across fixed distance t\_{\\text{mid}}, Cell 2 is displaced horizontally as a rigid cluster.  
> * Cell 2 retains its internal dimensions, haunches, and clear span.  
> * The outer right frame boundary translates to preserve the exterior wall thickness t\_{\\text{ext}}, expanding the total structural width automatically without requiring user-defined formulas.

## **Section I: State Management Architecture: Persistent Invariants versus Transient State**

To maintain data integrity and prevent race conditions or synchronization drift during interactive editing, the kernel enforces a strict boundary between persistent state and calculated transient caches.  
PERSISTENT STATE (Immutable Single Source of Truth)  
├── Topology Store: Planar Map DCEL (Vertices, Half-Edges, Faces)  
├── Parameter Store: Scalar variables, driving dimensions, explicit assignments  
├── Constraint Store: Relational records (Type, Target, Entity Reference IDs)  
├── User Formulas: Symbolic mathematical AST expressions  
└── Construction Store: Datum lines, reference points, symmetry centerlines

                       │  
                       ▼ (Evaluated via Numerical Solver & Matrix Pipelines)

TRANSIENT STATE (Calculated / Runtime In-Memory Caches)  
├── Affine Matrix Cache: Local-to-world 3x3 transformation matrices  
├── Coordinate Buffers: Evaluated Euclidean coordinates (x, y)  
├── Jacobian Cache: Sparse J matrix, factorization trees (QR / SVD)  
├── Metric Cache: Shoelace areas, centroids, perimeters, moments of inertia  
└── Presentation Cache: Native SVG path strings, handles, snap glyphs

Persistent state is serialized to document storage and managed via transactional state actions. Transient state is fully derivable from persistent state and can be discarded and reconstructed at any time. Coordinate values in persistent storage are parameterized exclusively by topological vertex identifiers, ensuring that shared joints cannot store conflicting coordinates across different primitives. When an edit causes numerical divergence or topological invalidity, the transaction is rejected, and the application state reverts cleanly without corrupting the drawing.

## **Section J: Incremental Subgraph Solving and Dirty-Set Partitioning**

To support complex industrial drawings containing thousands of entities at interactive framerates (exceeding sixty frames per second), the kernel avoids full-system global re-solving on every user event. Instead, it uses incremental subgraph solving:

> * **Dirty Parameter Identification**: When a parameter is edited or dragged, the Directed Acyclic Graph executes a forward reachability sweep to identify directly and indirectly affected parameters.  
> * **Bipartite Graph Partitioning**: Using breadth-first search on the undirected bipartite constraint graph, the kernel extracts the connected components that contain the dirty parameters. Subgraphs that do not share constraint edges with the modified parameters remain untouched.  
> * **Decomposition-Recombination (DR-Plan)**: Within the affected component, the engine identifies rigid sub-clusters (subsets of entities whose internal degrees of freedom equal zero). These clusters are condensed into super-nodes with three rigid-body degrees of freedom, reducing the dimension of the active numerical problem.  
> * **Local Numerical Assembly**: The Jacobian matrix and residual vector are assembled exclusively for the reduced, active sub-problem. For an edit to a single culvert bay, the solver operates on a low-order matrix (n \\approx 16 variables) rather than the global matrix of the entire drawing (N \> 2000), keeping re-solve times below two milliseconds.  
> * **Targeted DOM Reconciliation**: Upon solver convergence, dirty bounding box flags are propagated to the presentation layer, updating only the affected SVG elements in the browser DOM.

## **Section K: Disambiguation, Kinematic Bifurcations, and Conflict Diagnostics**

Because geometric constraint equations are non-linear, systems frequently possess multiple mathematically valid solutions. For example, a point-to-point distance constraint intersecting a line produces two valid roots corresponding to opposite sides of the line. The solver must select the branch that matches user intent reliably and predictably.  
The kernel applies several complementary strategies to resolve ambiguity:

> * **Solution Continuity (Hysteresis)**: Iterative descent algorithms naturally converge to the root closest to their starting point \\mathbf{X}\_0. The kernel initializes each solve cycle using the coordinates from the immediately preceding frame, preventing sudden state flips between distant branches during interactive dragging.  
> * **Chirality and Handedness Preservation**: For closed polygons and haunched corners, the signed cross-product between consecutive edge vectors must maintain its sign:\\text{sgn}((\\mathbf{V}\_{i} \- \\mathbf{V}\_{i-1}) \\times (\\mathbf{V}\_{i+1} \- \\mathbf{V}\_{i})) \= \\text{sgn}\_{\\text{initial}} This prevents interior chamfers from inverting into exterior points during parameter sweeps.  
> * **Topological Invariant Checking**: Following convergence, candidate solutions are validated against half-edge topological rules. If the solve causes edge crossing or loop self-intersection (detected via the Bentley-Ottmann sweep-line algorithm), the step is rejected, the damping factor \\lambda is increased, and the solver searches along an alternate gradient direction.

When constraint sets are mathematically unresolvable, the engine isolates and communicates the source of the conflict:

> * **Over-Constraint Diagnostics**: If the rank of the constraint Jacobian is less than the number of active constraint equations (\\text{rank}(\\mathbf{J}) \< m), the constraints are linearly dependent. The kernel performs QR decomposition with column pivoting on \\mathbf{J}^T to isolate the exact redundant or contradictory constraint rows. The UI highlights the conflicting dimensions in red, allowing the user to resolve the over-specification.  
> * **Degeneracy Barrier Penalties**: If an edge length approaches zero (\\Vert{}\\mathbf{V}\_{i+1} \- \\mathbf{V}\_\[span\_134\](start\_span)\[span\_134\](end\_span)i\\Vert{} \\le \\epsilon\_{\\text{deg}}), an internal logarithmic barrier penalty is added to the objective function:\\Phi\_{\\text{barrier}} \= \-\\mu \\ln(\\|\\mathbf{V}\_{i+1} \- \\mathbf{V}\_i\\|) This prevents geometric collapse and preserves structural topology during large dimensional changes.

## **Section L: Reference and Construction Geometry Framework**

To support engineering workflows without complicating the primary physical boundary, the architecture incorporates a first-class Reference and Construction Geometry layer.  
Reference geometry participates fully in the bipartite constraint graph, providing alignment targets, dimensions, and angle references, but is excluded from boundary loop generation, face definitions, and surface area evaluations:

> * **Theoretical Sharp Corner Projection**: Haunches truncate the sharp corners of a frame. A reference point \\m\[span\_7\](start\_span)\[span\_7\](end\_span)\[span\_17\](start\_span)\[span\_17\](end\_span)athbf{P}\_{\\text{sharp}} is defined as the virtual intersection of the extensions of two orthogonal wall edges with direction vectors \\mathbf{d}\_1 and \\mathbf{d}\_2:(\\mathbf{P}\_{\\text{sharp}} \- \\\[span\_135\](start\_span)\[span\_135\](end\_span)mathbf{V}\_{\\text{wall1}}) \\times \\mathbf{d}\_1 \= 0, \\quad (\\mathbf{P}\_{\\text{sharp}} \- \\mathbf{V}\_{\\text{wall2}}) \\times \\mathbf{d}\_2 \= 0 The chamfer can then be dimensioned directly from this theoretical intersection point using standard drafting conventions.  
> * **Bilateral Symmetry Planes**: A reference centerline \\mathcal{L}\_{\\text{sym}} defined by point \\mathbf{P}\_0 and unit vector \\hat{\\mathbf{d}} establishes bilateral reflection constraints across symmetric pairs of vertices (\\mathbf{P}\_A, \\mathbf{P}\_B):\\frac{\\mathbf{P}\_A \+ \\mathbf{P}\_B}{2} \= \\mathbf{P}\_0 \+ \\left( \\left(\\frac{\\mathbf{P}\_A \+ \\mathbf{P}\_B}{2} \- \\mathbf{P}\_0\\right) \\cdot \\hat{\\mathbf{d}} \\right) \\hat{\\mathbf{d}} (\\mathbf{P}\_B \- \\mathbf{P}\_A) \\cdot \\hat{\\mathbf{d}} \= 0 This ensures that edits to the left wall expand the right wall symmetrically around the centerline without requiring manual formulas.

## **Section M: Closed-Shape Intelligence and Derived Analytical Metrics**

Derived geometric calculations are read-only metrics computed from the resolved state vector \\mathbf{X} during the post-solve update cycle. These values are exposed to the DAG formula parser, enabling expressions such as \\text{TotalArea} \= \\text{area}(\\text{Outer}) \- \\text{area}(\\text{Hole}\_1) \- \\text{area}(\\text{Hole}\_2).  
The core analytical metrics are evaluated using standard formulations:

> * **Euclidean Segment Length and Perpendicular Distance**: For two vertices \\mathbf{P}\_1 \= (x\_1, y\_1) and \\mathbf{P}\_2 \= (x\_2, y\_2):L \= \\|\\mathbf{P}\_2 \- \\mathbf{P}\_1\\| \= \\sqrt{(x\_2 \- x\_1)^2 \+ (y\_2 \- y\_1)^2} The perpendicular distance from point \\mathbf{P}\_0 to a line segment defined by \\mat\[span\_137\](start\_span)\[span\_137\](end\_span)hbf{P}\_1 and \\mathbf{P}\_2 with unit direction \\hat{\\mathbf{u}} \= \\frac{\\mathbf{P}\_2 \- \\mathbf{P}\_1}{\\|\\mathbf{P}\_2 \- \\mathbf{P}\_1\\|} is given by:d\_{\\perp} \= |(\\mathbf{P}\_0 \- \\mathbf{P}\_1) \\times \\hat{\\mathbf{u}}| \= |(x\_0 \- x\_1)u\_y \- (y\_0 \- y\_1)u\_x|  
> * **Directed Angle Evaluation**: The directed angle \\theta from vector \\mathbf{d}\_1 to vector \\mathbf{d}\_2 is calculated using the two-argument arctangent of the cross and dot products:\\theta \= \\text{atan2}(\\mathbf{d}\_1 \\times \\mathbf{d}\_2, \\mathbf{d}\_1 \\cdot \\mathbf{d}\_2) \= \\text{atan2}(d\_{1x}d\_{2y} \- d\_{1y}d\_{2x}, d\_{1x}d\_{2x} \+ d\_{1y}d\_{2y})  
> * **Polygon Area via the Shoelace Formula**: For an arbitrary, non-self-intersecting closed loop with N vertices \\mathbf{V}\_0, \\mathbf{V}\_1, \\dots, \\mathbf{V}\_{N-1} where \\mathbf{V}\_N \\equiv \\mathbf{V}\_0:A \= \\frac{1}{2} \\sum\_{i=0}^{N-1} (x\_i y\_{i+1} \- x\_{i+1} y\_i) The sign of A establishes topological winding order: A \> 0 indicates Counter-Clockwise (CCW) orientation, while A \< 0 indicates Clockwise (CW) orientation. For composite structures containing internal cutouts (such as the multi-span culvert voids), the net material area is calculated by subtracting hole areas from the outer boundary area:A\_{\\text{net}} \= |A\_{\\text{outer}}| \- \\sum\_{k=1}^M |A\_{\\text{hole}, k}|  
> * **Analytical Centroid and Center of Mass**: The centroid coordinates (C\_x, C\_y) of a single closed polygonal loop are computed via Green's theorem:C\_x \= \\frac{1}{6A} \\sum\_{i=0}^{N-1} (x\_i \+ x\_{i+1})(x\_i y\_{i+1} \- x\_{i+1} y\_i) C\_y \= \\frac{1}{6A} \\sum\_{i=0}^{N-1} (y\_i \+ y\_{i+1})(x\_i y\_{i+1} \- x\_{i+1} y\_i) For composite cross-sections containing internal voids and structural partitions, the combined centroid is evaluated via area-weighted superposition:C\_{x, \\text{composite}} \= \\frac{A\_{\\text{outer}} C\_{x, \\text{outer}} \- \\sum\_{k=1}^M A\_{\\text{hole}, k} C\_{x, \\text{hole}, k}}{A\_{\\text{net}}} C\_{y, \\text{composite}} \= \\frac{A\_{\\text{outer}} C\_{y, \\text{outer}} \- \\sum\_{k=1}^M A\_{\\text{hole}, k} C\_{y, \\text{hole}, k}}{A\_{\\text{net}}} When non-uniform material mass densities \\rho\_j are assigned to sub-components, the Center of Mass \\mathbf{R}\_{\\text{CM}} is calculated by weighting the integrals by density:\\mathbf{R}\_{\\text{CM}} \= \\frac{\\sum\_j \\rho\_j A\_j \\mathbf{C}\_j}{\\sum\_j \\rho\_j A\_j}  
> * **Second Moments of Area (Structural Rigidity)**: For structural sections such as box culverts subjected to soil and hydraulic overburden, the area moments of inertia (I\_{xx}, I\_{yy}) characterize bending capacity:I\_{xx} \= \\frac{1}{12} \\sum\_{i=0}^{N-1} (y\_i^2 \+ y\_i y\_{i+1} \+ y\_{i+1}^2)(x\_i y\_{i+1} \- x\_{i+1} y\_i) I\_{yy} \= \\frac{1}{12} \\sum\_{i=0}^{N-1} (x\_i^2 \+ x\_i x\_{i+1} \+ x\_{i+1}^2)(x\_i y\_{i+1} \- x\_{i+1} y\_i) Holes are subtracted using the parallel axis theorem:I\_{xx, \\text{net}} \= \\left( I\_{xx, \\text{outer}} \+ A\_{\\text{outer}} (C\_{y, \\text{outer}} \- C\_{y, \\text{net}})^2 \\right) \- \\sum\_{k=1}^M \\left( I\_{xx, \\text{hole}, k} \+ A\_{\\text{hole}, k} (C\_{y, \\text{hole}, k} \- C\_{y, \\text{net}})^2 \\right)

## **Section N: Comprehensive Implementation Roadmap**

The transition from the existing formula-based canvas to a full variational parametric CAD kernel is structured into twelve sequential development phases.

| Phase | Core Subsystem Description | Prerequisites | Target Technical Milestone | Automated Verification Suite |
| :---- | :---- | :---- | :---- | :---- |
| **Phase 1** | **Topological Half-Edge (DCEL) Foundation** | None | Establishes planar map connectivity; welds shared vertices into single persistent records. | Euler characteristic validation (V \- E \+ F \= 2); half-edge twin pairing verification; zero disconnected joints. |
| **Phase 2** | **Hierarchical Local Coordinate Systems** | Phase 1 | Implements 3 \\times 3 affine matrix stacks, nested frames, and Gram-Schmidt frame construction. | Matrix round-trip inversion precision: \\Vert{}\\mathbf{P} \- \\mathbf{M}^{-1}\\mathbf{M}\\mathbf{P}\\Vert{} \< 10^{-12}; orthonormal basis stability. |
| **Phase 3** | **Unified Parameter Management System** | Phase 2 | Bridges scalar coordinate parameters, driving dimensions, and state managers. | Parameter classification validation; memory leak tests on parameter allocation and deallocation. |
| **Phase 4** | **Analytical Derived Geometry Layer** | Phase 1, 3 | Implements Green's theorem integrals for area, centroid, perimeter, and second moments. | Metric accuracy tests against closed octagons, irregular polygons, and composite shapes with holes. |
| **Phase 5** | **Directed Acyclic Graph (DAG) Engine** | Phase 3, 4 | Manages explicit user formulas and propagates target dimensions to constraint systems. | Tarjan cycle detection validation; forward dirty propagation recomputation on subgraphs. |
| **Phase 6** | **Declarative Constraint Representation** | Phase 1, 3 | Encapsulates geometric intents into analytical residual equations and exact analytical Jacobians. | Residual verification on exact sketches; analytical Jacobian validation against numerical finite differences. |
| **Phase 7** | **Non-Linear Levenberg-Marquardt Solver** | Phase 5, 6 | Solves non-linear constraint systems simultaneously using SVD pseudo-inverse projection. | Residual norm convergence (\\Vert{}\\mathbf{F}\\Vert{} \\le 1\[span\_32\](start\_span)\[span\_32\](end\_span)0^{-8}); degree-of-freedom rank tests for under-constrained systems. |
| **Phase 8** | **Automatic Relationship Discovery Pipeline** | Phase 1, 6, 7 | Infers constraints (coincidence, orthogonality, parallel offsets, chamfers) automatically. | Auto-generation of governing constraints from raw sketches without user formulas; redundant constraint rejection. |
| **Phase 9** | **Direct Manipulation & Hysteresis Engine** | Phase 7, 8 | Delivers real-time mouse drag updates while preserving constraint invariants. | Interactive dragging at 60 FPS without geometry flipping; minimum-norm updates eliminate unconstrained drift. |
| **Phase 10** | **Complex Shape & Multi-Cell Culvert Solving** | Phase 8, 9 | Handles multi-loop, multi-cell geometries with non-uniform anisotropic expansion. | Modifying culvert clear span expands internal opening and outer walls while keeping wall thickness constant. |
| **Phase 11** | **Reference & Construction Geometry Layer** | Phase 6, 10 | Supports theoretical sharp intersection points, symmetry centerlines, and datum guides. | Construction geometry constrains physical geometry without contributing to boundary loops or area calculations. |
| **Phase 12** | **Incremental Subgraph Partitioning** | Phase 7, 10 | Optimizes performance on large assemblies (N \> 1000 entities) via BFS connected-component solving. | Re-solve latency under 5ms on large drawings; dirty subgraphs recompute without triggering global solves. |

## **Section O: Foundational Architectural Decisions**

The successful realization of this parametric 2D CAD kernel relies on making fifteen foundational design decisions correctly prior to implementation:

> 1. **Variational Simultaneous Solver over Procedural Formula Evaluation**: The system must abandon text-based formula evaluation as the foundation of geometry generation. Formulas are restricted to setting target parameters, while geometry is resolved by a variational simultaneous solver.  
> 2. **Planar Map (Half-Edge DCEL) over Flat Coordinate Arrays**: Topological connectivity must be modeled explicitly through a Doubly Connected Edge List. Vertices that meet at a junction share a single topological record, enforcing coincidence inherently rather than approximating it via iterative distance constraints.  
> 3. **Deprecation of Conformal Similarity Scaling**: The isotropic scaling factor k \= L\_{\\text{target}} / L\_{\\text{orig}} must be replaced by variational solving. Structural assemblies require anisotropic deformation where certain elements (slabs, haunches) translate rigidly while others (span bays) elongate.  
> 4. **Damped Levenberg-Marquardt with SVD over Standard Newton-Raphson**: Pure Newton-Raphson solvers diverge near kinematic singularities or when systems are under-constrained. A damped Levenberg-Marquardt solver using Singular Value Decomposition calculates the minimum-norm update vector \\Delta \\mathbf{X}^\*, providing stability during interactive dragging.  
> 5. **Strict Boundary between Persistent and Calculated State**: Persistent state is restricted to topological connectivity, user driving dimensions, and constraint declarations. Global Cartesian coordinates, affine transform matrices, Jacobians, and derived areas are treated as transient cached properties recomputed by the kernel.  
> 6. **Dual-Graph Separation (DAG for Causality, Bipartite Graph for Variational Invariants)**: Explicit mathematical functions are evaluated by a Directed Acyclic Graph, while geometric alignments are resolved by an undirected Bipartite Constraint Graph. This separation eliminates circular dependency bugs.  
> 7. **Analytical Jacobians over Numerical Finite-Difference Quotients**: The Jacobian matrix \\mathbf{J} must be populated using exact analytical partial derivatives. Numerical finite differencing introduces floating-point truncation error, requires 2n residual evaluations per iteration, and degrades solver performance.  
> 8. **Automated Inference Pipeline with Rank-Based Admissibility Filtering**: Inferred constraints must pass a linear independence check against the existing Jacobian before insertion into the active graph. This prevents automated drafting assistants from inadvertently over-constraining the drawing.  
> 9. **Local Frame Affine Hierarchies over Global Coordinate Lists**: Multi-cell configurations (such as twin culvert bays) must be modeled in local reference frames linked to the parent assembly by 3 \\times 3 affine transformation matrices, enabling modular replication and translation.  
> 10. **Hysteresis and Solution Continuity over Arbitrary Root Jumping**: Non-linear systems with multiple mathematical roots must use the previous frame's coordinates as the initial guess \\mathbf{X}\_0, minimizing coordinate movement and preventing sudden geometric flipping.  
> 11. **Native Geometric Chamfer Primitives with Fixed-Angle Invariants**: Corner haunches must be modeled with invariant projection equations linking them to adjacent boundary normals, preserving their forty-five-degree orientation when adjacent walls translate.  
> 12. **Incremental Subgraph Partitioning via Connected Component Decomposition**: The solver must decompose the global bipartite graph into disjoint subgraphs, re-solving only the affected connected component when a parameter changes.  
> 13. **Zero External Visual Runtime Dependencies**: The kernel must operate as a pure TypeScript mathematical library isolated from UI frameworks, outputting standard SVG path data directly to the DOM to ensure testability and performance.  
> 14. **First-Class Construction Geometry Support**: Virtual reference entities (datum axes, pitch circles, theoretical sharp corners) must be fully supported by the constraint graph without contributing to physical boundary loops or engineering volume calculations.  
> 15. **Area-Weighted Centroid Superposition for Composite Geometries**: Geometric centers of mass for structures with internal voids must be calculated using first-moment area integration with hole subtractions, providing accurate structural metrics for engineering analysis.

## **Section P: Strategic Conclusions**

The evaluation confirms that procedural, formula-driven approaches (y \= f(x)) or isotropic scaling heuristics cannot meet the requirements of parametric computer-aided drafting. Complex engineering drawings—such as the single-cell and two-span haunched box culverts examined here—are inherently variational: they represent systems of simultaneous, non-linear geometric invariants that must accommodate non-uniform anisotropic deformations while preserving uniform wall thicknesses, chamfer angles, and shared-joint connectivity.  
Implementing the proposed architecture—combining a Half-Edge (DCEL) topological structure, a dual-graph engine (bipartite constraint graph paired with a DAG), a damped Levenberg-Marquardt solver with SVD minimum-norm projection, and hierarchical local coordinate systems—transforms the software into an industrial-grade 2D CAD kernel. The system automatically deduces connectivity and geometry from natural sketching gestures, instantiates the underlying equation system, and maintains mathematical consistency during interactive dimension adjustments. Users are freed from manually writing coordinate formulas, allowing the CAD engine to automatically maintain the geometric and topological integrity of the design.

#### **Works cited**

1\. A Geometric Constraint Solver \- Purdue e-Pubs, https://docs.lib.purdue.edu/cgi/viewcontent.cgi?article=2067\&context=cstech 2\. Design Software History: From Sketchpad to D-Cubed ... \- Novedge, https://novedge.com/blogs/design-news/design-software-history-from-sketchpad-to-d-cubed-the-evolution-and-algorithms-of-constraint-based-sketchers 3\. Boundary Loop to Surface Hole Filling in CAD \- RapidMade, https://rapidmade.com/boundary-loop-to-surface-hole-filling-in-cad/ 4\. A Workbench for Geometric Constraint Solving \- SolveSpace, https://solvespace.com/forum.pl?action=attachment\&id=1054 5\. Characteristics of 3D Solid Modeling Software Libraries for Non, https://cad-journal.net/files/vol\_16/CAD\_16(3)\_2019\_496-518.pdf 6\. Vector Graphics Complexes \- Boris Dalstein, https://www.borisdalstein.com/research/vgc/vgc.pdf 7\. Siemens Announces D-Cubed Releases \- Digital Engineering 24/7, https://www.digitalengineering247.com/article/siemens-releases-d-cubed-2d-components-v75 8\. A Comprehensive Evaluation of the DFP Method for Geometric, https://hrcak.srce.hr/file/446424 9\. 3D Face Reconstruction with Geometry Details from a Single Image, https://arxiv.org/html/1702.05619v2 10\. A Statistical Method for Robust 3D Surface Reconstruction from, https://mi.informatik.uni-siegen.de/publications/blanz\_3dpvt04.pdf 11\. Variable-Radius Circles of Cluster Merging in geometric constraints, https://www.cs.purdue.edu/cgvlab/papers/cmh/VarRadCirclea.pdf 12\. A New Era for Mechanical CAD | Hacker News, https://news.ycombinator.com/item?id=27517503 13\. Decomposition of Geometric Constraint Systems: a Survey \- LIRMM, https://www.lirmm.fr/\~trombetton/publis/survey\_ijcga\_2006.pdf 14\. Constrained multifidelity optimization using model calibration, https://www.researchgate.net/publication/257334760\_Constrained\_multifidelity\_optimization\_using\_model\_calibration