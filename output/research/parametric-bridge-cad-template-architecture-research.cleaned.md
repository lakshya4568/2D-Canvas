# Parametric Bridge CAD Template Architecture — Cleaned Session Analysis

## Purpose of this cleaned file

This is a normalized, audit-friendly summary of the supplied session export:

/Users/proximus/Downloads/parametric-bridge-cad-template-architecture-research.json

It preserves the important problem definition, research findings, formulas, subagent contributions, implementation outputs, verification evidence, and reasoning summary. It removes raw JSON, repeated tool payloads, shell commands, internal status noise, screenshots-as-log entries, and embedded command syntax.

The “thinking summary” below is a concise reconstruction from visible actions, decisions, findings, and outputs. It is not a private chain-of-thought transcript.

## 1. Session record

| Field | Recorded value |
|---|---|
| Session title | Parametric Bridge CAD Template Architecture Research |
| Session ID | ses_f8f406d88ffe7Z16wHhofG6GVZ |
| Recorded agent | Sisyphus — ultraworker |
| Recorded model | gemini-3.8-flash via Google Vertex |
| Source size | About 19.8 MB; 68,565 newline-delimited lines |
| Message count | 626 messages: 17 user, 609 assistant |
| Main project examined | 2D-Canvas / Parametric CAD |
| Main branch audited | parametric_formulation |
| Main implementation target | Bridge and culvert General Arrangement Drawings (GADs) |

## 2. The actual user problem

The central problem was not “how to expose more formulas.” It was how to preserve engineering intent while allowing a draftsman to work like a draftsman.

### Business and drafting problem

- Bridge GADs, culvert sections, plans, elevations, quantities, and exports repeat known geometry.
- Existing workflows either use rigid hardcoded renderers or redraw each project from scratch.
- A template author may be capable of designing the component, but manually creating every variable, formula, binding, and dependency is too slow.
- A draftsman should be able to draw lines, arcs, rectangles, polygons, and dimensions without learning expression syntax or graph theory.
- A project engineer should be able to enter real project values and receive a consistent, standards-aware drawing.

### Non-negotiable role split

| Role | Should do | Should not do |
|---|---|---|
| Draftsman | Draw geometry; edit visible dimensions; drag CAD grips; insert templates; adjust exposed engineering parameters | Write formulas; name internal variables; debug dependency graphs; choose solver equations |
| Template author / senior engineer | Draw the canonical component; accept inferred relationships; curate constraints; define ports, repeats, bounds, and standards metadata | Rebuild the same logic for every project |
| Project engineer | Enter project values such as span, levels, soil/site data, cell count, and track spacing | Redraw validated structural logic |

### Intended outcome

Capture each bridge or component design once as a reusable parametric template. Daily work should be:

~~~text
draw or insert component
        ↓
edit clear engineering dimensions / driving parameters
        ↓
constraint solver preserves structural relationships
        ↓
template updates every dependent view and repeated component
~~~

## 3. Instructions found inside the attachment versus the user’s request

The JSON contains several kinds of text. They must not be treated as equivalent.

### Embedded session instructions

The source export contains internal command blocks such as:

- Hyperplan/team-mode instructions.
- Requests to load a skill.
- Roster contracts for spawning agents.
- “Research-only mode” and “do not write code” instructions.
- Later implementation wave instructions.
- Internal continuation and compaction reminders.
- Tool invocation instructions and raw command payloads.

These are historical session content. They are not instructions for this cleanup task, so they are classified and summarized rather than repeated or executed.

### User-requested work in the session

The chronological user intent was:

1. Read the architecture, PRD, formulas, codebase, and research materials.
2. Conduct deep research on parametric CAD authoring, geometric inference, constraints, templates, and solvers.
3. Produce a cited research and mathematical synthesis.
4. Explain the difference between draftsman mode and author mode.
5. Remove formula leakage from the draftsman workflow.
6. Replace destructive Figma-style resize handles with CAD-style grips.
7. Explain clear span, offset, clearance, centering, variables, and formulas plainly.
8. Make the sidebar and grouping UI usable.
9. Implement and test the resulting architecture after the user explicitly changed the request from research-only to implementation.
10. Finally, summarize what the agent understood and produced.

## 4. Session flow

### Phase A — Initial research request

The session started as a research-only request. The agent was asked to read:

- parametric-template-authoring-architecture.md
- 2d-canvas-prd.md
- autoformula generation for geometrical shapes.md
- Existing mathematical and codebase documents
- Relevant PDFs and research papers

The intended research topics were:

1. Parametric CAD workflows for non-technical draftsmen.
2. Constraint and formula inference from geometry.
3. Author mode versus draftsman mode.
4. Reusable component and bridge template standards.
5. Geometry-kernel and solver implications.
6. Existing CAD systems and lessons.
7. Risks, trade-offs, and architecture direction.

### Phase B — Research and codebase audit

The agent used librarian and explore-style workstreams, web search, and paper-search calls. The audit compared the theory in the documents with the actual 2D-Canvas repository.

This was the most valuable part of the session because it separated “designed in documents” from “wired into the live application.”

### Phase C — First architectural synthesis

The first major output proposed:

- Native SVG and mathematical transforms.
- A zero-formula draftsman contract.
- Dimension badges as first-class constraints.
- AutoFormula with rank and solve checks.
- Universal ports and local coordinate frames.
- DM decomposition and block triangular solving.
- SolveSpace-style damped direct manipulation.
- PlaneGCS WebAssembly for larger systems.
- A seven-wave implementation roadmap.

### Phase D — Initial implementation and validation

The agent then implemented the first set of baseline fixes. The recorded test run reached:

~~~text
155 passing tests across 36 files
~~~

The subsequent implementation pass reached:

~~~text
166 passing tests across 40 files
~~~

### Phase E — User feedback and scope correction

The user then reported that:

- The formula bar was not visible or understandable.
- There was no clear AutoFormula / clear-span workflow.
- The user did not want structural buttons that should instead be created from line geometry and components.
- The sidebar and grouping controls needed to collapse and resize.
- The selection resize behavior was breaking engineering geometry.

The agent removed the two template buttons, changed the UI explanation, and continued into a larger CAD interaction redesign.

### Phase F — Standards reset and second architecture pass

The user explicitly restated the core requirement: “make it like real CAD or AutoCAD.” The second plan focused on:

- Zero-formula draftsman mode.
- AutoCAD vertex, midpoint, and center grips.
- Explicit MOVE and SCALE.
- Direct numeric dimension editing.
- Reactive solving without a manual Apply button.
- A universal port protocol.
- A bridge-specific RDSO template.

### Phase G — Final implementation claim and validation

The final recorded test run reached:

~~~text
170 passing tests across 41 files
~~~

Chrome DevTools snapshots showed the Draftsman / Author Mode controls and a loaded RDSO bridge template. The session then claimed that all waves were complete.

That claim is qualified in Section 13 because some proposed subsystems are not directly evidenced in the final patch inventory or interaction tests.

## 5. Ground-truth audit of the original codebase

The strongest codebase findings in the session were these.

| Subsystem | Finding before implementation |
|---|---|
| Dimension badges | DimensionBadge.tsx was read-only, pointer-events-disabled, and had no input or change handler. A draftsman could not edit a committed dimension by clicking it. |
| Dimension overlay | ParametricDimensionOverlay.tsx routed edits toward algebraic variable handling rather than creating a first-class geometric constraint. |
| Dependency extraction | dualGraphOrchestrator.ts used raw substring matching. A parameter named W could falsely match WallThickness, SkewWidth, or Weight. |
| DOF analysis | bipartiteGraph.ts used one global scalar formula and subtracted three planar rigid motions once for the whole drawing. This is wrong for disconnected or anchored assemblies. |
| DM decomposition | The graph module was not a true Dulmage–Mendelsohn decomposition despite its naming and tests. |
| Admissibility filter | The SVD row-space projection was mathematically sound but had no production callers. |
| BFS subgraph partition | Present and mostly correct, but not connected to the live solve path. |
| Analytical Jacobians | The analytical-Jacobian module was dead; the variational kernel used finite differences. |
| DCEL | A DCEL implementation existed, but runtime code used simpler closed-cycle detection instead. |
| Parameter manager | Clean parameter-role and DAG logic existed, but was instantiated only by tests rather than live application state. |
| Component templates | rccBridgeTemplate.ts was a hardcoded coordinate generator and was not connected to the general parameter/constraint architecture. |
| model.ts | Several large switch statements used magic shape IDs and bespoke resolvers. |
| main branch | The sophisticated parametric work was not merged there; it lived on parametric_formulation. |
| Baseline tests | Six failures were identified around GAD adjustment, template registration, inferred formula state, formula naming, and group renaming. |

### One-line diagnosis from the session

The project had much of the right vocabulary and mathematical scaffolding, but the live UI, reducer, inference pipeline, solver dispatch, and reusable template layer were not consistently connected.

## 6. Architecture the research converged on

### 6.1 Dual model: scalar dependencies plus geometric constraints

The most important architectural distinction is:

~~~text
Scalar parameter DAG
    resolves values such as ClearSpan, WallThickness, CellCount,
    SlabThickness, TrackSpacing, and derived lengths

Geometric ConstraintGraph
    preserves relationships such as coincident, horizontal,
    vertical, parallel, perpendicular, equal length, offset,
    fixed, centered, tangent, and 45-degree haunch behavior

Template runner
    combines both systems and materializes shapes/components
~~~

Formulas are useful inside the authoring and template layers. They should not be the ordinary draftsman interface.

### 6.2 Draftsman mode

The intended Draftsman Mode contract is:

- No formula strings.
- No synthetic names such as R1_Width or R2_Centering.
- No dependency graph editor.
- Numeric dimension badges such as 2000 mm, 350 mm, or 360 × 260 mm.
- Direct numeric edit creates or updates a driving dimension constraint.
- Vertex grip means STRETCH.
- Midpoint grip means edge offset or segment adjustment.
- Center grip means rigid MOVE.
- Whole-object scaling is explicit SCALE, never an accidental selection behavior.

### 6.3 Author mode

The intended Author Mode exposes:

- AutoFormula suggestions.
- Parameter roles: DRIVING, DERIVED/DEPENDENT, FIXED.
- Constraint acceptance/rejection.
- Port and local-frame definition.
- Repeat rules and index-aware expressions.
- Standards reference, bounds, and validation reports.
- Template save, versioning, and provenance.

### 6.4 Component and port protocol

A component is no longer just a hardcoded bridge renderer. It has:

- A component definition.
- Parameters.
- Local geometry.
- Constraints.
- Named ports.
- Compatible port kinds.
- Optional repeat rules.
- Optional child component instances.
- A parent/child attachment relationship.

The port protocol is the mechanism that allows the same architecture to support box cells, piers, deck modules, wing walls, return walls, parapets, railings, and user-created line/arc/polygon components.

### 6.5 Local coordinate systems

Each component is authored in a local frame. A child attaches to a parent by aligning a child port with a parent port:

~~~text
parent component
  └── parent port
        + relative rotation / offset
              └── child port
                    └── child local geometry
~~~

This avoids manually recomputing every world coordinate and makes repeated components composable.

### 6.6 Inference pipeline

The proposed five-stage inference pipeline is:

~~~text
raw lines / arcs / rectangles / polygons
        ↓
topological vertex welding and loop detection
        ↓
structural invariant extraction
        ↓
candidate relationships:
parallel, perpendicular, containment, offset, centering,
concentricity, repeated bays, chamfers
        ↓
rank / solvability / stability filtering
        ↓
author suggestions or silent draftsman constraints
~~~

The important safety principle is that inference produces candidates. It must not blindly assert that every visually plausible relation is engineering intent.

## 7. Important formulas and mathematical results

### 7.1 Basic containment formulas

For an outer rectangle with width OuterWidth, height OuterHeight, and a uniform wall thickness:

$$
InnerWidth = OuterWidth - 2 \cdot WallThickness
$$

$$
InnerHeight = OuterHeight - 2 \cdot WallThickness
$$

For independently measured margins:

$$
InnerWidth = OuterWidth - LeftOffset - RightClearance
$$

$$
InnerHeight = OuterHeight - TopOffset - BottomClearance
$$

For a centered inner feature:

$$
InnerX = OuterX + \frac{OuterWidth - InnerWidth}{2}
$$

and equivalently:

$$
t_{left} = t_{right}
$$

### 7.2 Position and partition formulas

Typical inferred bindings in the session included:

$$
InnerX = OuterX + WallThickness
$$

$$
InnerY = OuterY + SlabThickness
$$

For an adjacent bay:

$$
Bay2X = Bay1X + Bay1Width + WebThickness
$$

### 7.3 RDSO multi-cell span formula

For N cells, clear span ClearSpan, wall/web thickness WallThickness, and inter-cell gap Gap:

$$
TotalSpan =
N \cdot ClearSpan
 + (N+1) \cdot WallThickness
 + (N-1) \cdot Gap
$$

The session used the example:

- CellCount = 3
- ClearSpan = 2000 mm
- WallThickness = 350 mm
- Gap = 10 mm

When clear span changes, the intended behavior is horizontal expansion only; walls, slabs, haunch legs, gaps, and angles remain invariant.

### 7.4 Variational state and residual system

For n topologically unique 2D vertices:

$$
\mathbf{X}
 =
[x_1, y_1, x_2, y_2, \ldots, x_n, y_n]^T
 \in \mathbb{R}^{2n}
$$

Geometric constraints are residual equations:

$$
\mathbf{F}(\mathbf{X}) = 0
$$

The configuration is considered satisfied when:

$$
\|\mathbf{F}(\mathbf{X})\|_\infty < \epsilon_{tol}
$$

### 7.5 Distance constraint

For points Pi = (xi, yi) and Pj = (xj, yj) with target distance D:

$$
r_{dist}
 =
(x_j-x_i)^2 + (y_j-y_i)^2 - D^2
 = 0
$$

This squared form avoids a square-root singularity when points coincide.

Important derivatives:

$$
\frac{\partial r}{\partial x_i} = -2(x_j-x_i),
\quad
\frac{\partial r}{\partial y_i} = -2(y_j-y_i)
$$

$$
\frac{\partial r}{\partial x_j} = 2(x_j-x_i),
\quad
\frac{\partial r}{\partial y_j} = 2(y_j-y_i)
$$

### 7.6 Horizontal and vertical constraints

Horizontal:

$$
r_h = y_j-y_i = 0
$$

Vertical:

$$
r_v = x_j-x_i = 0
$$

### 7.7 Perpendicular offset / wall-thickness constraint

For a datum line from Pa to Pb, and a point Pp that must be offset by T:

$$
\Delta x = x_b-x_a,\qquad
\Delta y = y_b-y_a,\qquad
L=\sqrt{\Delta x^2+\Delta y^2}
$$

Signed offset numerator:

$$
N =
-\Delta y(x_p-x_a)
 + \Delta x(y_p-y_a)
$$

Residual:

$$
r_{offset} = \frac{N}{L} - T = 0
$$

The key point is semantic: wall thickness is a perpendicular distance, not a global scale factor.

### 7.8 45-degree haunch constraint

For a chamfer whose horizontal and vertical legs should be equal:

$$
r_{haunch}
 =
(x_1-x_c)^2 - (y_2-y_c)^2
 = 0
$$

This quadratic relation avoids the derivative discontinuity caused by absolute values.

### 7.9 Dulmage–Mendelsohn decomposition

Build a bipartite graph:

~~~text
coordinate variables V  ↔  constraint equations C
~~~

Use maximum matching to partition the graph into:

- G_under: unmatched-variable side; free degrees of freedom.
- G_square: well-constrained matched blocks.
- G_over: unmatched-constraint side; redundant or conflicting constraints.

The proposed implementation uses Hopcroft–Karp matching and Tarjan strongly connected components for block triangular form.

The session correctly criticized the old global scalar:

$$
DOF_{scalar}
 =
\max(0,\sum entityDOF-\sum constraintDOF-3)
$$

Subtracting three rigid motions once is invalid for multiple disconnected assemblies or anchored geometry. DOF must be diagnosed per connected structural block.

### 7.10 Powell Dogleg and LM

The Gauss–Newton step is:

$$
h_{GN}=-J^+F
$$

The Cauchy step is based on:

$$
g=J^TF,
\qquad
\alpha=\frac{\|g\|^2}{\|Jg\|^2},
\qquad
h_{SD}=-\alpha g
$$

Dogleg chooses a trust-region path between the steepest-descent and Gauss–Newton steps.

The Levenberg–Marquardt predicted reduction must include the factor one-half:

$$
\Delta L
 =
\frac{1}{2}\Delta X^T(\lambda\Delta X-g)
$$

The audit found that omitting the one-half corrupts the gain ratio and can keep damping too high.

Convergence must require a small residual, not only a small step:

~~~text
max residual < tolerance  → converged
small step but large residual → stagnated / failed
~~~

### 7.11 SolveSpace-style direct manipulation damping

Let S scale the Jacobian columns:

$$
s_j =
\begin{cases}
1/20 & \text{for the dragged coordinate}\\
1 & \text{for other coordinates}
\end{cases}
$$

The squared penalty ratio is:

$$
\left(\frac{1}{0.05}\right)^2 = 400
$$

This makes the dragged entity track the cursor while free geometry absorbs compatible motion instead of the whole structure being uniformly distorted.

Numerically, scale the Jacobian columns directly rather than forming normal equations that square the condition number.

### 7.12 SVD row-space admissibility filter

For a new candidate constraint gradient g and existing Jacobian J:

$$
g_{\perp}
 =
(I-J^+J)g
$$

Interpretation:

- Large ||g_perp||: new independent constraint; admissible.
- Small ||g_perp|| and already satisfied residual: redundant; discard.
- Small ||g_perp|| and non-zero residual: conflicting; reject and explain.

### 7.13 Affine port composition

The intended local-to-world transform is:

$$
M_{world}
 =
M_{parent}
 \cdot T(parentPort)
 \cdot R(\theta)
 \cdot T(ownPort)^{-1}
$$

The homogeneous transform form is:

$$
\begin{bmatrix}
s\cos\theta & -s\sin\theta & x_0\\
s\sin\theta & s\cos\theta & y_0\\
0 & 0 & 1
\end{bmatrix}
$$

### 7.14 Generic geometry formulas retained by the AutoFormula research

The attached AutoFormula research also catalogued deterministic formulas for ordinary shape metrics:

| Shape | Important formulas |
|---|---|
| Circle | Area = πr²; Circumference = 2πr |
| Rectangle | Area = l·w; Perimeter = 2(l+w) |
| Triangle | Area = 1/2·b·h; Heron area = sqrt(s(s-a)(s-b)(s-c)); perimeter = a+b+c |
| Square | Area = a²; Perimeter = 4a |
| Cylinder | Curved surface = 2πrh; total surface = 2πr(r+h) |
| Cone | Curved surface = πr√(r²+h²); total surface = πr(r+√(r²+h²)) |
| Sphere | Surface area = 4πr² |
| Cuboid | Surface area = 2(lw+wh+hl) |
| Cube | Surface area = 6a² |

These are calculation formulas, not substitutes for geometric design intent. CAD constraints should govern relationships such as parallelism, offset, coincidence, and fixed thickness.

## 8. AutoFormula findings: how variables are created

The original inference code generated identifiers from shape names:

1. Read a shape name such as R1 or Inner.
2. Sanitize it into a legal identifier.
3. Combine it with a property such as _Width, _Height, _X, or _Y.
4. Add shared names such as WallThickness, SlabThickness, TopOffset, and RightClearance.

That is why names such as R1_Width and R2_Centering appeared. They were implementation identifiers, not concepts a draftsman should have to learn.

The original synthesizer inferred patterns such as:

- Uniform four-sided containment.
- Uniform top/bottom slab thickness.
- Equal left/right wall clearances.
- Independent margins.
- Adjacent bays separated by a web.
- Concentric circles and radial thickness.

The right design is:

~~~text
internal identifier exists
        ↓
semantic label is mapped
        ↓
Draftsman sees “Clear Span”, “Wall Thickness”, “Overall Span”
        ↓
Author can inspect or curate the underlying binding
~~~

### Important limitation

Geometry alone can detect a likely opening, width, offset, or repeated bay. It cannot always know that the width is specifically a civil-engineering “clear span” rather than a window, void, slot, or decorative feature. The safe flow is:

1. Detect candidate relation.
2. Assign confidence and a structural type.
3. Let the author confirm semantic meaning once.
4. Store that semantic meaning in the reusable template.
5. Let draftsmen consume the semantic parameter without seeing the internal expression.

## 9. The RDSO bridge example produced by the session

The final implementation report described an RDSO-style multi-cell bridge / balancing culvert layout with:

- CellCount
- ClearSpan
- WallThickness
- BarrelLength
- CurtainWallSpan
- TrackSpacing
- DropWallThickness
- Return walls
- Curtain wall
- Drop wall
- 45-degree flares
- Bridge and track centerlines
- Repeated box units and 10 mm gaps

Recorded example values:

| Parameter | Example |
|---|---:|
| Cell count | 3 |
| Clear span | 2000 mm |
| Wall thickness | 350 mm |
| Barrel length | 6850 mm |
| Curtain wall span | 9150 mm |
| Track spacing | 6260 mm |
| Drop wall thickness | 250 mm |
| Inter-cell gap | 10 mm |

Intended behavior:

- Changing clear span expands openings horizontally.
- Wall thickness remains 350 mm.
- Gaps remain 10 mm.
- Haunch/flaring angles remain invariant.
- Increasing cell count instantiates another unit through ports.
- Return walls and the drop wall expand with the assembly.

## 10. Research data and cited sources recorded in the session

The source session cited or consulted the following categories of material.

### Solver and CAD systems

- [Salusoft89 / planegcs](https://github.com/Salusoft89/planegcs) — WebAssembly wrapper around FreeCAD’s 2D geometric constraint solver.
- [Planegcs npm package](https://www.npmjs.com/package/@salusoft89/planegcs).
- [FreeCAD PlaneGCS source](https://github.com/FreeCAD/FreeCAD/tree/main/src/Mod/Sketcher/App/planegcs).
- [FreeCAD Sketcher](https://wiki.freecad.org/Sketcher_Workbench).
- [Onshape Custom Features](https://www.onshape.com/en/features/custom-features).
- [RBush spatial index](https://github.com/mourner/rbush).
- [Math.js derivative reference](https://mathjs.org/docs/reference/functions/derivative.html).

### Constraint inference and design intent

- [Autodesk Research: Aligning Constraint Generation with Design Intent in Parametric CAD](https://www.research.autodesk.com/publications/aligning-constraint-generation-design-intent-parametric-cad/).
- [Autodesk research paper PDF](https://www.research.autodesk.com/app/uploads/2025/10/Aligning-Constraint-Generation-with-Design-Intent-in-Parametric-CAD.pdf).
- [ArXiv version](https://arxiv.org/abs/2504.13178).
- [Autodesk project page](https://autodeskailab.github.io/aligning-constraint-generation/).
- [DOI record](https://doi.org/10.1109/iccv51701.2025.00806).
- [Autodesk CadVLM page](https://www.research.autodesk.com/publications/cad-vlm/).
- [AlphaGeometry overview](https://deepmind.google/blog/alphageometry-an-olympiad-level-ai-system-for-geometry/).

### Decomposition and structural analysis

- [Dulmage–Mendelsohn decomposition](https://en.wikipedia.org/wiki/Dulmage%E2%80%93Mendelsohn_decomposition).
- [Pyomo incidence / DM documentation](https://pyomo.readthedocs.io/en/stable/explanation/analysis/incidence/dulmage_mendelsohn.html).
- [JGraphT DM decomposition reference](https://jgrapht.org/javadoc/org.jgrapht.core/org/jgrapht/alg/decomposition/DulmageMendelsohnDecomposition.html).

### Codebase and bridge context

- [2D-Canvas repository](https://github.com/lakshya4568/2D-Canvas).
- [Parametric formulation branch](https://github.com/lakshya4568/2D-Canvas/tree/parametric_formulation).
- The session also referenced RDSO/IRC culvert material and bridge GAD examples.

### Research-quality caveat

The paper-search calls were noisy: the recorded search returned unrelated future-dated arXiv results for some CAD queries. The useful CAD findings came from the attached documents, direct code audit, the Planegcs/FreeCAD sources, and the Autodesk constraint-alignment paper found through web search. The source export should not be treated as a clean literature review without rechecking each citation independently.

## 11. Subagents and what each contributed

The session used multiple agents and two rounds of adversarial team deliberation. The table keeps the contribution summary without reproducing internal orchestration commands.

| Agent / role | Contribution preserved in the output |
|---|---|
| Librarian | Researched Planegcs, FreeCAD GCS, DM decomposition, Autodesk/CadVLM-style constraint generation, and lessons from CAD systems. |
| Explore / codebase auditor | Read the repository and identified the read-only dimension badge, dead inference/solver modules, switch statements, substring dependency bug, branch split, and failing tests. |
| Mathematical solver specialist | Developed the residual/Jacobian model, DM/BTF direction, Dogleg/LM reasoning, pseudoinverse use, and direct-manipulation damping. |
| Draftsman UX advocate / zero-formula advocate | Enforced the zero-formula contract, direct dimensions, plain-language conflicts, and the Draftsman/Author split. |
| Protocol architect / standardizer | Proposed reusable component definitions, ports, local coordinate frames, nested assemblies, repeat rules, and cross-view identity. |
| Geometric inference researcher | Proposed static and dynamic inference, wall/haunch/centering recognition, rank filtering, and confidence-based suggestions. |
| Code pragmatist | Challenged theoretical overreach and grounded the work in actual files, active/dead code, performance, reducer wiring, and tests. |
| Plan agent | Compiled the first seven-wave roadmap and the later AutoCAD-grips-focused plan. |
| Multimodal-looker | Requested in the initial prompt, but the export does not provide a reliable completed research result from this role; no unsupported contribution is attributed here. |

### Adversarial process

The team process had three intended rounds:

~~~text
Round 1: independent specialist analysis
        ↓
Round 2: attack weaknesses, magical inference, and over-engineering
        ↓
Round 3: defend, refine, or concede
        ↓
Plan agent: sequence work and define verification gates
~~~

The important outcome of the adversarial process was not unanimity. It was the recognition that:

- Auto-inference cannot be trusted without rejection and stability checks.
- A draftsman must not be exposed to the mathematical machinery.
- A universal template protocol must use local frames and ports, not more switch statements.
- The theoretical architecture must be tied to a working reducer and tested interaction path.

## 12. Implementation outputs recorded in the session

### Created or substantially added

- lib/geometry/grips.ts
- lib/parametric/graph/dulmageMendelsohn.ts
- lib/parametric/dragSolver.ts
- lib/parametric/component/types.ts
- lib/parametric/component/portSolver.ts
- lib/parametric/templates/rdsoBridgeTemplate.ts
- tests/unit/cad_grips.test.ts
- tests/unit/drag_damping.test.ts
- tests/unit/dual_graph_ast_dependencies.test.ts
- tests/unit/dulmage_mendelsohn.test.ts
- tests/unit/lm_solver_convergence.test.ts
- RESEARCH_SYNTHESIS_AND_MATHEMATICAL_ARCHITECTURE.md

### Modified areas

- lib/geometry/types.ts
- lib/state/drawingReducer.ts
- lib/parametric/dualGraphOrchestrator.ts
- lib/parametric/graph/bipartiteGraph.ts
- lib/parametric/templates.ts
- lib/parametric/templates/rccBridgeTemplate.ts
- lib/inference/formulaSynthesizer.ts
- lib/solver/levenbergMarquardt.ts
- lib/parametric/boundaryLimits.ts
- features/canvas/DrawingApp.tsx
- features/canvas/DrawingCanvas.tsx
- features/canvas/ParametricDimensionOverlay.tsx
- features/canvas/SelectionOverlay.tsx
- features/inspector/PropertyInspector.tsx
- features/parametric/BottomFormulaBar.tsx
- features/toolbar/MainToolbar.tsx
- Related visual, status, sidebar, and overlay components.

### Specific changes claimed and supported by the log

1. Registered the RCC bridge template.
2. Added inferred-formula state and acceptance handling.
3. Added group renaming / hierarchy handling.
4. Wired GAD adjustment into shape updates.
5. Corrected the LM reduction factor and residual convergence condition.
6. Replaced raw formula substring matching with AST dependency extraction.
7. Added DM decomposition and associated tests.
8. Added SolveSpace-style drag damping and tests.
9. Removed the two bottom-bar culvert buttons.
10. Added Draftsman / Author mode controls.
11. Replaced the Figma-style eight-handle selection box with CAD grip infrastructure.
12. Added direct numeric dimension overlay behavior.
13. Added a port protocol and RDSO bridge template.
14. Made the inspector resizable/collapsible.
15. Changed the visual theme away from electric blue toward a graphite/amber/emerald CAD palette.

## 13. Verification evidence and limitations

### Directly evidenced in the export

| Evidence | Recorded result |
|---|---|
| Baseline test run | 155 passing tests across 36 files |
| Intermediate test run | 166 passing tests across 40 files |
| Final test run | 170 passing tests across 41 files; 0 failures; 1,036 expectations |
| Live UI | Chrome DevTools snapshots showed Draftsman and Author Mode controls |
| Template instantiation | The RDSO bridge template was dispatched with the recorded structural parameters |
| UI screenshots | Screenshots were captured after reloads, template instantiation, and viewport changes |
| Grip tests | The final report states cad_grips.test.ts passed 4/4 |

### Evidence that is partial or not demonstrated end to end

- The log does not show a complete direct-dimension edit test on a committed shape from click through solver update.
- The log does not show a complete CellCount: 3 → 4 interaction with measured invariant checks.
- A stale Chrome DevTools element ID caused one fill attempt to fail before the element was re-snapshotted and the action retried.
- The original plan proposed a PlaneGCS WebAssembly worker, planegcsClient, and rank-preserving filter. These files are not present in the recorded final patch inventory, and the final implementation summary does not list them as completed.
- The final summary says “all waves completed,” but its waves were redefined: the original seven-wave plan’s PlaneGCS integration and broad civil benchmark wave were not clearly evidenced as implemented.
- No production merge, commit hash, or deployment proof is recorded.
- “Zero formula leakage” is a stated contract and UI goal; the final snapshot supports mode separation, but the export does not include the full DOM-regex result for every relevant screen.

### Practical interpretation

The implementation clearly progressed from a failing 155-test baseline to a passing 170-test state and addressed substantial architecture and UI work. It should be described as a strong tested prototype milestone, not yet as a fully proven production civil CAD kernel.

## 14. What the agent understood correctly

1. The core problem was workflow design, not merely formula syntax.
2. Formulas and geometric constraints are different layers and should not be conflated.
3. Draftsman mode and Author mode are different products for different users.
4. Figma-style affine scaling is structurally unsafe for civil geometry.
5. AutoCAD-style grips are the right interaction model for stretch, offset, and move.
6. Geometry inference must be conservative and solver-verified.
7. A global scalar DOF count is insufficient for disconnected assemblies.
8. Component ports and local frames are a better generalization mechanism than hardcoded shape-ID switches.
9. The solver must preserve invariants such as wall thickness, haunch geometry, gaps, and centering.
10. Tests and live browser checks are necessary to connect the mathematical design to the actual application.

## 15. Where the reasoning or execution was weak

### Scope drift

When the user initially requested a narrow button removal and a plain explanation, the agent also continued with solver fixes, theme changes, and broad architecture work. Some of those changes were useful, but they did not strictly respect the “only these buttons” boundary.

### Overclaiming semantic inference

The session often spoke as if the engine could know that a particular opening “needs clear span.” Geometry can suggest width, containment, and offset. It cannot safely infer civil meaning without a semantic role, template context, or author confirmation.

### Conflating formula visibility with formula existence

Removing formula text from Draftsman Mode is correct. Removing formulas from the entire system is not. Derived scalar relationships, template bindings, validation bounds, and repeat rules still need an internal representation. The correct goal is hidden and curated complexity, not no complexity.

### Research retrieval quality

The paper-search tool produced unrelated records for some queries. Source quality control should have been stricter: primary paper, authors, venue, DOI, and claim should be checked before treating a result as evidence.

### Implementation completeness

The final test count is real evidence of progress, but it does not prove that all proposed research architecture was implemented. PlaneGCS WASM, dynamic cell-count verification, full semantic inference, and production template interoperability remain areas requiring explicit tests and code inspection.

## 16. Recommended canonical workflow after this session

~~~text
1. Draftsman draws or inserts geometry.
2. Topology pass welds near-coincident endpoints and forms local loops.
3. Inference proposes relationships with confidence and provenance.
4. Author confirms semantic roles once:
     “this opening is Clear Span”
     “these offsets are Wall Thickness”
     “these lines form a repeated cell”
5. Template stores:
     driving parameters
     derived relationships
     geometric constraints
     ports
     repeats
     standards/bounds
6. Draftsman consumes only semantic dimensions and approved grips.
7. Every edit runs:
     parameter update
       → DAG resolution
       → dirty subgraph selection
       → constraint diagnosis
       → solver
       → invariant checks
       → updated views
8. Failed or ambiguous edits return plain-language guidance.
~~~

### Minimum invariant report for each edit

Every important parametric edit should report, internally or in Author Mode:

- Maximum residual.
- Solver status.
- Under/well/over-constrained block counts.
- Wall-thickness deviation.
- Slab-depth deviation.
- Haunch-angle or leg deviation.
- Topology closure status.
- Port alignment error.
- Repeated-instance count.
- Standards-bound violations.

## 17. Final distilled conclusion

The session’s durable architectural answer is:

> Let the draftsman work in geometry and dimensions. Let the author curate inferred design intent once. Keep formulas, dependency graphs, constraints, ports, and solver diagnostics behind the appropriate mode boundary. Use a real constraint solver and invariant checks to preserve civil meaning during edits.

The most credible result in the export is the combination of:

- Ground-truth code audit.
- Dual DAG plus ConstraintGraph model.
- Conservative AutoFormula suggestions.
- DM/rank-based diagnostics.
- AutoCAD-style grips.
- Universal ports and local coordinate frames.
- RDSO multi-cell template direction.
- 170 passing tests and live UI verification.

The main remaining work is not another large theory document. It is explicit end-to-end proof that the semantic workflow works on arbitrary line/arc components, that cell repetition and local frames remain correct through edits, and that any PlaneGCS/WebAssembly integration claimed by the architecture is actually present, tested, and memory-safe.

