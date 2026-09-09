# The Universal 2D Geometric Relationship Resolver
## Vector & Matrix Formulations for a Rotation-Agnostic Predicate Engine, and a Formal Protocol (GEOM-RP/1)

*Answers, in order: yes vectors and matrix algebra are exactly the right tool and here is precisely where each one is used; here is the full general predicate library that replaces the two narrow detectors verified in your code; here is the standard your draftsmen and your templates both follow; here is the phased plan to build it.*

---

## 1. The one idea everything below follows from

Your two working detectors both break under rotation for the same underlying reason: `computeShapeBounds` measures gaps along the **world's** X and Y axes (`Δx`, `Δy`), and `recognizeHaunches` checks a direction against a **fixed** 45°. Both are testing geometry against the *page's* frame instead of against *itself*. Spin the same physical configuration 15° and every one of those numbers changes, even though nothing about the actual relationship did.

The fix is not a bigger pattern library — it's switching what kind of quantity you measure. **Dot products, cross products, and distances between two vectors don't care what the world's axes are; they only depend on the vectors themselves.** That single property is what makes a predicate rotation-invariant for free, and it's the precise, provable answer to "can vectors and matrices help" — not a vague yes, but a specific mechanism you can point to in every formula below.

---

## 2. Primitives (formalized, not new)

Every shape you will ever draw reduces to three things — this doesn't change from what we discussed, it's just stated precisely now:

- **Point** `P = (x, y) ∈ ℝ²`
- **Edge** (straight): `(A, B)`, two points. Direction `d = B − A`. Unit direction `d̂ = d / |d|`. Unit normal `n̂ = (−d̂ᵧ, d̂ₓ)` (a 90° rotation of `d̂`).
- **Arc** (a circle is an arc spanning 360°): center `C`, radius `r`, start/end angle.

A polygon or polyline is not a fourth primitive — it's an ordered list of edges. Nothing in what follows ever asks "what shape is this." It only ever takes two primitives and asks a fixed question about them.

---

## 3. The general predicate library

Nine predicates. This replaces both of the detectors verified in your code — not by extending them, but by testing genuinely different, rotation-proof quantities.

**P1 — Parallel** *(edge A, edge B)*
`sin θ = (dA × dB) / (|dA| |dB|)` — parallel if `|sin θ| < ε_angle`.
*Generalizes:* the horizontal/vertical check, to any pair of edges at any shared angle, not just axis-aligned ones.

**P2 — Perpendicular** *(edge A, edge B)*
`cos θ = (dA · dB) / (|dA| |dB|)` — perpendicular if `|cos θ| < ε_angle`.

**P3 — Parallel offset** *(edge A, edge B, given P1 holds)*
`offset_start = (B.start − A.start) · n̂A`, `offset_end = (B.end − A.start) · n̂A`.
Consistent if `|offset_start − offset_end| < ε_dist`; candidate value = their average.
*This is the corrected, general form of "wall thickness."* It's a projection onto the edge's own normal — it works identically whether the wall is horizontal, vertical, or drawn at 37°. This is the single change that fixes rotation for the most common relationship in your drawings.

**P4 — Corner with chamfer** *(edge A ⟂ edge B, connecting edge C)*
Extract the actual angle instead of assuming one: `θ_C = atan2(dC × d̂A, dC · d̂A)`.
Leg projections onto each parent edge's own direction: `legA = (C.end − C.start) · d̂A`, `legB = (C.end − C.start) · d̂B`. Equal-leg if `||legA| − |legB|| < ε_dist`.
*Generalizes* `haunchRecognizer.ts` exactly: instead of testing `angle ≈ 45°`, it *measures* the angle and records it as the candidate's own parameter. A 30° chamfer, a 60° chamfer, and a 45° chamfer are all just "a chamfer" now — the angle itself becomes a value the draftsman can see and change, not a hidden assumption.

**P5 — Concentric radial offset** *(arc/circle A, arc/circle B)*
Concentric if `|CA − CB| < ε_dist`; radial offset = `|rA − rB|`.
*This is the one your bounding-box detector gets right only by accident* — a circle's bounding box happens to equal its diameter only when it's exactly centered and undistorted. Move it off-center, or put it inside a non-square opening, and P5 is the only version that still works, because it never looks at a bounding box at all.

**P6 — Tangent** *(edge, circle)*
`dist = |(C − edge.start) × d̂edge|` — tangent if `|dist − r| < ε_dist`.

**P7 — Equal length** *(edge A, edge B, non-adjacent, anywhere in the drawing)*
`|len(A) − len(B)| < ε_dist`.

**P8 — Coincident** *(point A, point B)*
`|A − B| < ε_dist` — this is your existing DCEL welder, reused, not reinvented.

**P9 — Symmetry about an axis** *(point A, point B, candidate axis through O with unit normal n̂)*
Reflection matrix about a line through the origin with unit normal `n̂`: `R = I − 2 n̂n̂ᵀ`. Reflect: `A' = O + R(A − O)`. Symmetric if `|A' − B| < ε_dist`.
*Why this earns its place:* bridge cross-sections are very often symmetric by design. This is the one predicate that's genuinely matrix-native rather than dot/cross-product native — it's a real, if small, 2×2 linear map, and it's the cleanest way to state "these two things are mirror images" without hand-rolling coordinate arithmetic.

That's the complete list. Every one of them takes two primitives and a tolerance, and returns a candidate constraint with a measured value — never a shape name, never an assumed orientation.

---

## 4. Rotation at the assembly level — a subtlety worth stating explicitly

A natural question: do you need to transform everything into each component's own local frame *before* running P1–P9? **No** — and this is worth being precise about, because it resolves a real ambiguity. Every predicate above is built from `dA · dB`, `dA × dB`, or a distance between two points. All three are already invariant to a shared rotation of both operands — they only depend on the *relative* geometry between the two primitives being compared, never on the world frame either one happens to sit in. You can run P1–P9 directly in world coordinates and they will detect the relationship correctly no matter how the whole drawing is rotated.

Local coordinate frames (`lib/geometry/lcs/`, already in your repo) matter for a *different* job: once a relationship is found and accepted, storing it relative to its own component's frame is what lets that whole component be moved, rotated, or repeated later — Bay 2 = Bay 1 shifted — without re-running detection. Composition of nested frames is standard affine algebra:

```
M = ⎡ s·cosθ   −s·sinθ   x₀ ⎤
    ⎢ s·sinθ    s·cosθ   y₀ ⎥      Pworld = Mparent · Mlocal · Plocal
    ⎣   0          0      1 ⎦
```

So: **vectors and cross/dot products solve detection-under-rotation; matrices (affine composition) solve reuse-under-rotation.** Both are needed, for different halves of the problem, and neither substitutes for the other.

---

## 5. Tolerance — one rule, stated once

Every `ε` above must be an absolute real-world unit (millimeters), never a pixel count or a percentage of screen zoom. This isn't a stylistic preference — it's the direct fix for a bug already confirmed in your repo (five different vertex-welding tolerances across five files, several of them pixel-based, none agreeing with each other). One tolerance constant, in real units, shared by every predicate and by the DCEL welder, is a precondition for any of this being consistent.

---

## 6. Confidence and admissibility — no new mechanism, just where it plugs in

Every candidate from P1–P9 carries a measured deviation (how close to exactly parallel, how close to exactly equal). That deviation sets its confidence tier — exact match reads as strong, a near match reads as weak and displayed differently, reusing the taxonomy your Kernel PDF already defines (Geometric Fact / Inference / User Constraint). Before any candidate is shown, it passes the SVD/Jacobian rank test your `admissibilityFilter.ts` already implements correctly but that nothing currently calls. This is also where the clustering step from your screenshots belongs: candidates of the same predicate type with near-equal measured values merge into one parameter before display, so nine near-duplicate cards become the one real independent value they actually represent.

---

## 7. The protocol — GEOM-RP/1

A short, numbered specification, in the style of an engineering standard, so "how a draftsman follows the rules" has one place to point to. `MUST` / `SHOULD` / `MAY` used in the conventional (RFC 2119) sense.

**Clause 1 — Scope.** This protocol governs how 2D drafted geometry is decomposed, how relationships between its elements are detected, and how those relationships are exposed to a draftsman, independent of drawing scale, rotation, or shape identity.

**Clause 2 — Definitions.** *Primitive*: a Point, Edge, or Arc per §2. *Predicate*: one of P1–P9. *Candidate*: a predicate result not yet accepted. *Driving parameter*: a value a person set directly. *Derived value*: a value computed from others via an accepted constraint.

**Clause 3 — Primitive conformance.** Every drawn entity MUST reduce to Points, Edges, and Arcs within tolerance ε before any predicate runs. An implementation MUST NOT introduce a shape-specific code path for detection (no `if (shape.type === 'rectangle')`); shape identity MAY be used for rendering only.

**Clause 4 — Predicate vocabulary.** Predicate evaluation MUST use the vector/matrix forms in §3, not axis-aligned bounding-box comparisons. A conforming implementation MUST NOT hardcode a specific angle (e.g., 45°) where a predicate is capable of measuring the actual angle instead.

**Clause 5 — Tolerance.** ε values MUST be expressed in absolute real-world units. Implementations MUST NOT scale tolerance by viewport zoom or express it in pixels.

**Clause 6 — Confidence and admissibility.** Every candidate MUST carry a measured deviation and a confidence tier. No candidate SHALL be presented to a draftsman before passing the admissibility (Jacobian rank) test against the currently accepted set. Candidates of identical predicate type and near-equal value MUST be merged before presentation.

**Clause 7 — Draftsman interaction.** A draftsman MUST NOT be required to write or read a symbolic formula to accomplish an ordinary edit. An accepted relationship MUST be edit-able by direct manipulation of the geometry it constrains. Conflicts MUST be surfaced using the names of driving parameters, never raw constraint or predicate identifiers.

**Clause 8 — Component interoperability.** A component's internal relationships MUST be stored relative to its own local frame (§4), not world coordinates, so that translation, rotation, and repetition of the whole component preserve them without re-detection.

**Clause 9 — Conformance levels**, used as the basis for the implementation plan below:
- **Level 1**: P1, P3, P8 only (parallel-offset and coincidence) — covers axis-agnostic straight-edge assemblies.
- **Level 2**: adds P2, P4 (generalized angle), P5, P6 — covers corners, circles, tangency.
- **Level 3**: adds P7, P9 — covers cross-drawing equality and symmetry.

---

## 8. Implementation plan, staged by conformance level

| Phase | Target | What changes | Verified starting point |
|---|---|---|---|
| **0 (now)** | — | Bounding-box offset (`computeShapeBounds`) + hardcoded 45° (`recognizeHaunches`) | Confirmed live, both narrower than Level 1 |
| **1** | Level 1 | Replace bounding-box offset with true edge-to-edge P3, computed from the DCEL boundary graph, not `computeShapeBounds`. This alone fixes rotation for the most common relationship type. | `lib/geometry/topology/dcel.ts` already exists; not currently read by the detector |
| **2** | Level 1, cleaned | Add the merge/clustering pass (§6) and wire `admissibilityFilter.ts` into the candidate pipeline before display | Both pieces exist in isolation today; this phase is wiring, not new math |
| **3** | Level 2 | Add P2, P4 (replacing the fixed-45° test with measured angle), P5, P6 | `recognizeHaunches` becomes the reference implementation to generalize, not discard |
| **4** | Level 3 | Add P7 (cross-drawing equal-length) and P9 (symmetry) — the two predicates most specific to bridge cross-sections | New; no equivalent exists in the current code |
| **5** | Protocol tooling | A conformance report per template declaring which level it requires; one test file per predicate, mirroring your existing `tests/unit/` pattern | Extends existing test conventions rather than introducing a new one |

Each phase is independently shippable and independently testable — Level 1 alone is a complete, correct, useful system for a large fraction of real bridge cross-sections; Levels 2–3 extend coverage without requiring any earlier phase to be redone.

---

## 9. Where this honestly stops

Freeform or organic curves (splines, hand-drawn irregular boundaries) aren't covered by P1–P9 — they'd need curve-fitting, which is a different mathematical problem, and is arguably out of scope for RDSO-style precision drafting in the first place, where boundaries are supposed to be exact lines and arcs. Genuine design ambiguity — two edges that happen to match by coincidence rather than intent — still needs a human decision; no predicate resolves that, it only surfaces it faster. And everything above is scoped to 2D; nothing here implies anything about extending to 3D geometry or elevation data.
