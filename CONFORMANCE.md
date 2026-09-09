# GEOM-RP/1 Protocol Conformance Specification

This document defines the conformance levels under **GEOM-RP/1** (Universal Geometric Resolver Protocol) and maps the level required by each civil template and implemented by each engine module.

---

## 1. Conformance Levels Definition (UPCE-MASTER-1.0 §43 Clause 14)

| Conformance Level | Predicates Required | Geometric Capabilities | Primary Target Typologies |
|---|---|---|---|
| **Level 1** | **P1** (Parallel), **P3** (Parallel Offset), **P8** (Coincidence) | Arbitrary rotated straight-edge assemblies with uniform wall thickness and welded topological joints. | Basic rectangular boxes, uniform-thickness ducts, planar plates. |
| **Level 2** | Level 1 + **P2** (Perpendicular), **P4** (Corner Chamfer w/ measured angle), **P5** (Concentric Radial Offset), **P6** (Tangency) | Orthogonal corners, chamfered transitions at arbitrary angles (30°, 45°, 60°), circular ducts/pipes, filleted arch boundaries. | Single-cell box culverts with haunches, pipe culverts, filleted piers. |
| **Level 3** | Level 2 + **P7** (Cross-Drawing Equal Length), **P9** (Bilateral Symmetry) | Multi-bay balanced spans, cross-assembly symmetry axes, modular components with ports and repeat rules. | Multi-cell box culverts, balanced railway bridges, parapet/railing arrays. |

---

## 2. Module Implementation Conformance

| Engine Module | Target Level | Current Status | Notes |
|---|---|---|---|
| `lib/geometry/predicates/vectorPredicates.ts` | **Level 3** | In Progress (Phase 2 & 4) | Pure rotation-invariant vector/matrix formulation. Zero axis-aligned bounding boxes. |
| `lib/geometry/topology/dcel.ts` | **Level 1** | Operational (Gate G1 Verified) | Planar arrangement with intersection splitting, vertex welding at `weld_mm`, Euler characteristic $V - E + F = 1 + C$, face tracing, nesting depth, and face persistence. |
| `lib/parametric/graph/dulmageMendelsohn.ts` | **Level 3** | Operational | Bipartite matching (Hopcroft-Karp) + Tarjan BTF + connected-component DOF. |
| `lib/inference/admissibilityFilter.ts` | **Level 3** | Operational | SVD row-space projection `(I - J⁺J)g`. Wired into candidate pipeline in Phase 2. |
| `lib/solver/planegcsClient.ts` | **Level 3** | Planned (Phase 3) | PlaneGCS WASM client adapter + analytical Levenberg-Marquardt domain layer. |
| `lib/parametric/component/portSolver.ts` | **Level 3** | Planned (Phase 7) | 3x3 homogeneous affine composition for modular components. |
| `lib/parametric/repeats/repeatEngine.ts` | **Level 3** | Planned (Phase 7) | Procedural count-driven regeneration (counts as topology, not solver variables). |

---

## 3. Template Conformance Requirements

| Template / Archetype | Required Level | Required Predicates | Invariants Preserved Under Anisotropic Solve |
|---|---|---|---|
| **Single-Cell Box Culvert** | **Level 2** | P1, P2, P3, P4, P8 | `WallThickness`, `SlabThickness`, `HaunchSize`, `HaunchAngle` |
| **Multi-Cell Culvert (N-Bay)** | **Level 3** | P1, P2, P3, P4, P7, P8, P9 | Bay spans, intermediate web thickness `t_mid`, outer walls, inter-cell gap |
| **Pipe Culvert** | **Level 2** | P5, P8 | Barrel thickness `|r_outer - r_inner|`, invert levels |
| **Parapet & Railing Run** | **Level 3** | P1, P7, P8 | `PostHeight`, `PostSpacing`, procedural count `ceil(L/Spacing) + 1` |
| **Retaining Wall / Pier Cap** | **Level 2** | P1, P2, P3, P4, P8 | Stem batter angle, base slab thickness, toe/heel dimensions |
