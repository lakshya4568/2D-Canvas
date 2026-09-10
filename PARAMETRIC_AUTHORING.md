# Parametric authoring — what was wrong, what it does now, and how to check

This is the working record for the repair described in
`UPCE-MASTER-1.0_PARAMETRIC_AUTHORING_FIX_PROMPT.md`. It covers the failure
audit, the architecture that replaced the broken part, the migration verdict on
every shipped template, and how to reproduce all of it.

It is one document rather than the fifteen the brief lists, because the brief's
own priority order puts "a working, understandable draftsman workflow" above
"adding more documentation". Everything the fifteen asked for is here; none of it
is here twice.

---

## 1. The failure audit

### 1.1 The one-line diagnosis

**There were two parametric engines. The good one was unreachable from the UI,
and the one the draftsman actually used was a string-matching procedural
renderer.**

`features/**` imported from exactly two parametric modules:
`lib/inference/formulaSynthesizer.ts` and `lib/parametric/model.ts`. It never
imported the predicate library, the DCEL, the analytical Jacobians, the SVD
admissibility gate, the Dulmage–Mendelsohn analyser, the PlaneGCS client, the
edit pipeline or the dual-graph orchestrator — all of which existed, were
unit-tested, and were dead.

Everything the user reported follows from that.

### 1.2 Traced failures

| Reported symptom | Root cause | Evidence |
|---|---|---|
| "It suggests strange formulas" | `formulaSynthesizer` took the axis-aligned **bounding box** of every ordered pair of shapes, subtracted the four gaps, and emitted an expression. It named symbols — `LeftOffset`, `RightClearance`, `TopOffset` — that were never created as parameters. | The module's own source: 34 candidates on two rectangles, `R2_Width = R1_Width - LeftOffset - RightClearance` |
| "I can't tell which parameters are mine" | Drawing a rectangle silently registered `R1.width` and `R1.height`; a line registered `L1`. These sat in the same list as the author's own values, driving nothing. | `COMMIT_DRAFT` in `drawingReducer.ts` |
| "Changing a value does nothing / moves the wrong thing" | `ParametricModel.syncModel` resolved parameters by trying `${name}.width`, `${name}_width`, `${name}_Width`, `W`, `Width` … in turn against a global bag, then dispatched on hard-coded shape **ids** (`culvert_outer`, `b1_top`, `top_inner_rect`) with literal fallback constants (`?? 300`). | `lib/parametric/model.ts` |
| "It says fully constrained when it isn't" | The DOF chip computed `entities * 2 - constraints - 3`, clamped at zero. One free rectangle reported **0 DOF, "Fully defined"**. | `ConstraintStatus.tsx` |
| Templates don't demonstrate anything | All ten shipped templates are procedural coordinate generators with `constraints: []`. | §4 below |

### 1.3 Two correctness defects found in the kernel itself

Both were invisible to the existing tests and both are fixed.

**The analytical Jacobians were wrong whenever two edges shared a vertex.**
`evaluateParallelConstraint` and `evaluatePerpendicularConstraint` wrote
`jacobian[0][col] = …` rather than `+=`. When two of the four point indices
coincide — which is what "adjacent edges of a rectangle" means — the second write
overwrote the first and a derivative term vanished. Verified against central
differences; every rectangle, polygon and polyline in the system was affected.

**The admissibility gate compared an absolute threshold to unnormalised
gradients.** A parallel constraint's gradient entries are edge lengths, so on a
four-metre frame the row norm is around 1e6 and a row dependent to nine
significant figures still leaves a perpendicular component of 1e-3 — comfortably
past the 1e-6 threshold. The visible effect was a review list that refused to
shrink. Rows are now normalised before the test (`lib/upce/admissibility.ts`).

---

## 2. What replaced it

`lib/upce/` is the authoring kernel. It is the single source of parametric truth;
`features/parametric/upceContext.tsx` is the only place the UI touches it.

```
types.ts          the document: points, segments, constraints, parameters,
                  components, repeats — each with a role and a provenance
profile.ts        connected chains of edges: the unit the workflow reasons about
lower.ts          Shape[] <-> sketch, with deterministic ids and exact lifting
residuals.ts      constraint -> residual + Jacobian rows, with row scaling
solve.ts          the edit pipeline: DAG -> solve -> topology -> invariants
dof.ts            rank, null space, plain-language motions, conflict vs redundancy
detect.ts         GEOM-RP predicates -> constraint candidates, gated and minimised
completion.ts     the questions, their options, and their measured DOF impact
parameters.ts     the scalar DAG: AST dependencies, cycles, safe evaluation
derive.ts         derived-value inference, validated by perturbation
repeat.ts         components and count-driven arrays (topology, not constraints)
template.ts       readiness scorecard, publication, user-mode manifest
document.ts       regenerate(): the one pipeline every panel calls
```

### 2.1 The five ideas that make it work

**Relationships are constraints, not formulas.** "The opening stays 300 mm off
the wall" is a `point_line_distance` row in a solved system, not
`R2_X = R1_X + 300`. That is what lets the outer frame follow when you drag the
inner wall, and it is why the formula list stopped being nonsense: there is
almost nothing left for a formula to do.

**Profiles, not shapes.** A culvert cell drawn as a roof, a floor, two walls and
four haunches is eight `Shape` records and **one thing**. Asking "what holds this
in place?" eight times produced eight unrelated clearances named
`SideThickness`, `SideThickness2`, `EndThickness`, `EndThickness2` with values
like 98 and 186. The authoring layer now groups edges into connected profiles
first, and asks once.

**Every number on screen is measured.** DOF comes from the rank of the assembled
Jacobian. "Removes 2 degrees of freedom" on a card comes from applying that
option to a scratch copy and recomputing. "All 15 relationships hold" comes from
re-measuring all 15 on the solved geometry.

**Nothing is applied without being asked, and where several answers are valid the
system asks rather than choosing.** Detection produces candidates. The completion
assistant produces questions with options, one of which is always "leave it
free on purpose".

**A count is topology.** Changing a repeat count regenerates the flat geometry
from the rule and hands the result to the solver. The solver never sees the
integer.

### 2.2 The edit pipeline

Every change — a typed parameter, an accepted candidate, a dragged grip — goes
through `regenerate()` and only that:

```
lift the previous solve onto the shapes      (so copies are copies of what IS)
  -> expand repeat rules                     (topology settles first)
  -> lower to points and segments            (deterministic ids)
  -> evaluate the parameter DAG              (derived values become targets)
  -> Levenberg-Marquardt, with homotopy sub-stepping and Gauss-Newton polish
  -> topology check   (inversion, self-intersection, collapse)
  -> invariant check  (every declared relationship, re-measured in mm)
  -> commit, or refuse the whole edit and say which requirements disagree
```

A refusal is atomic. The geometry that comes back is the geometry that went in.

---

## 3. The multi-cell problem, specifically

This is the case that was still broken and is the reason for most of the second
half of the work.

### 3.1 What was going wrong

Three separate things, all real:

1. **The container knew nothing about the array.** Raising the count stamped out
   more cells; the outer frame kept the width it was drawn with, so the second
   cell landed outside it. Nothing on screen offered to fix this, and because the
   sketch reported "Fully defined", nothing suggested anything was wrong.

2. **The cell was not a thing.** Eight lines, eight sets of questions, meaningless
   parameters.

3. **The first cell's far-side clearance fought the array.** "Cell 1 sits 75 mm
   from the right wall" and "cell 2 sits one pitch to the right" are two answers
   to the same question. They agree at count 1 — the DOF report calls the extra
   row redundant — and contradict outright at count 2.

There was also a fourth, subtler one: copies were generated from the author's
**original** coordinates rather than the solved ones, so a profile with any
internal freedom (a haunch whose angle is implied rather than stated) could settle
on the **mirrored** solution. Congruent, and visibly wrong.

### 3.2 What it does now

Once a repeat exists, the assistant asks — always, even at DOF 0, because this is
not a question about degrees of freedom:

> **When CellCount changes, what should happen to Outer_Frame?**
>
> - **Outer_Frame grows to fit the copies** — `Outer_FrameWidth` becomes
>   `(CellCount - 1) * CellPitch + CellWidth + 2 * WallThickness`
> - **Outer_Frame stays the size it is and the copies close up** — `CellPitch`
>   becomes `(Outer_FrameWidth - CellWidth - 2 * WallThickness) / max(1, CellCount - 1)`
> - **They are independent**

Every term in those expressions is a value that already exists and already has a
name. There is no magic constant: change `WallThickness` and the frame still
comes out right, which a hand-written `Count * Pitch + 120` does not.

Choosing "grows to fit" also switches off the far-end clearance rule and says so,
because the width formula now guarantees it and holding both would contradict
itself at count 2.

### 3.3 Measured result

From `tests/upce/authoring_workflow.test.ts`, on a frame containing a haunched
cell drawn as eight separate lines:

| CellCount | cells | frame width | pitch | DOF | invariants |
|---|---|---|---|---|---|
| 1 | 1 | 400.0 | – | 0 | all hold |
| 2 | 2 | 680.0 | 280.0 | 0 | all hold |
| 3 | 3 | 960.0 | 280.0, 280.0 | 0 | all hold |
| 4 | 4 | 1240.0 | 280.0 × 3 | 0 | all hold |

And `WallThickness + 45` widens the frame by exactly 90 — two end walls — which
is the check that a baked-in constant fails.

---

## 4. Template migration audit

Every shipped template was run through the generic workflow: load its geometry,
accept the detected relationships, answer the design questions. No template is
given special treatment anywhere in the code.

| Template | Shapes | Declared constraints | DOF after workflow | Parameters created | Verdict |
|---|---|---|---|---|---|
| Parametric Frame with Inner Cutout | 2 | **0** | 0 | 6 | Fully parametric through the generic workflow |
| Two-Span Multi-Cell Culvert | 17 | **0** | **0** | 10 | Fully parametric — this is the multi-cell proof |
| Single-Cell Box Culvert (45° haunches) | 9 | **0** | 1 | 7 | One freedom left for the author to decide |
| RDSO Standard Multi-Cell Box Bridge | 15 | **0** | 12 | 23 | Partly — see below |
| Standard RCC Bridge | 8 | **0** | 14 | 0 | Not a template; see below |
| Square Box Tube, Bolt Circle Flange, Slab (lines), Slab (miters), Chamfered Octagon | 2–12 | **0** | — | — | Geometry only |

**Every shipped template declares zero constraints.** They are procedural
coordinate generators: `generator(params)` computes absolute coordinates and
returns shapes. Their apparent parametric behaviour came entirely from the
string-matching resolver described in §1.2, which is why editing them moved the
wrong geometry.

What changed for them:

- Template insertion now loads **geometry only**. It no longer writes into a
  second parameter store, no longer runs the string-matching resolver, and no
  longer contains `if (isCulvert)` in the reducer.
- Their parametric behaviour comes from the same workflow a draftsman uses on
  their own geometry — which is the evidence that the engine is general.

**RDSO Standard Multi-Cell Box Bridge** deserves its own note, since it was
called out specifically. It contains three bridge centrelines mixed in with the
structure. Until those were treated as construction geometry (§36) the detector
was proposing relationships between annotation and concrete; with that fixed it
goes from 60 to 12 degrees of freedom with 23 named parameters and no questions
left to ask. The remaining 12 are genuine: the drawing is eight disconnected
profiles, and how they relate is a design decision nobody has made. It is a
picture of a bridge, not a model of one, and making it a template is drafting
work rather than a code change.

**Standard RCC Bridge** is a loose collection of five unconnected profiles. The
assistant runs out of questions with 14 degrees of freedom left. Same verdict.

---

## 5. How to check any of this

```bash
bun run test tests/upce/authoring_workflow.test.ts
```

24 tests covering the brief's acceptance scenarios: anisotropic deformation,
perturbation-validated derived values, the eight-line profile, the count sweep,
the railing generality proof, atomic refusal, behavioural readiness, provenance,
and honest DOF.

```bash
bun run test
```

722 pass. Two fail and both predate this work: `primitive_adapters` uses
`require()` under ESM, and an exporter test compares `Uint8Array` identity across
realms. Neither touches the authoring path.

Test files run one at a time (`fileParallelism: false`). Gate G6 asserts a warm
solve under 5 ms, which is a wall-clock measurement; running the behavioural
suite alongside it starved that measurement and made the gate fail perhaps two
runs in three.

### In the app

Author dock, in order: **Analyse geometry** → accept the cards → answer the
questions → **Find derived values** → **Check it** → **Publish** → switch the
persona to **Run**.

The status chip says *Not analysed* until you press Analyse. It is not pretending.

---

## 6. What is still open

Stated plainly, because the brief asks for no fake completeness.

- **Arcs and circles** lower and solve, but no detector proposes tangency or
  concentricity beyond shared centres, so a drawing built from arcs will reach
  fewer questions than one built from lines.
- **Ellipses and splines** are carrier geometry: drawn, exported, never
  constrained. The readiness check says so rather than ignoring them.
- **Grip dragging** does not yet route through `dragPoint()`. The function exists
  and is correct — a temporary target row plus a preview solve — but the canvas
  still moves shapes directly and the sketch catches up on the next regenerate.
  Editing a dimension badge *does* go through the solver.
- **The in-app manual** still describes the old workflow.
- **Multi-view drawings** (plan, elevation, section sharing parameters) are not
  implemented; one document is one sketch.
- **`lib/parametric/model.ts`** still exists with its magic strings. Nothing in
  the UI reaches it any more and the reducer no longer calls it, but it has not
  been deleted, and some older tests still exercise it directly.
