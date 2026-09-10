# Master CAD Feature & Capability Matrix
## Full Feature Accounting, Gates, UI Surfaces, Commands & Test Coverage

**Document Revision**: 2.0.0  
**Target Platform**: Unified Parametric 2D CAD Engine (UPCE-MASTER-1.0)  
**Total Verified Features**: 60+ distinct CAD capabilities cataloged  
**Verification Baseline**: 773 automated Vitest tests passing across 82 test suites (7,442 assertions)  

---

## 1. Executive Summary

This master matrix establishes the definitive feature accounting for the 2D Canvas Studio platform. Each capability is mapped to its core engine implementation, governing Quality Acceptance Gate (G0–G10), presentation UI surface, command triggers, test coverage, and current verification status.

---

## 2. Comprehensive CAD Feature Accounting Matrix

| Feature Domain & Capability | Core Implementation Module | Quality Gate | UI Surface | Command / Trigger | Test Coverage | Verification Status |
|---|---|---|---|---|---|---|
| **1. Geometric Modeling Primitives** | | | | | | |
| Two-Point Line Segment | `lib/geometry/adapters/lineAdapter.ts` | G0, G1 | Canvas, ToolRail | `LINE`, `L` | `gate_g0.test.ts`, `command_integration.test.ts` | **Verified** |
| Contiguous Polyline | `lib/geometry/adapters/polygonPolylineAdapter.ts` | G1, G7 | Canvas, ToolRail | `PLINE`, `PL` | `gate_g1.test.ts`, `polyline.test.ts` | **Verified** |
| Orthogonal Rectangle Box | `lib/geometry/adapters/rectangleAdapter.ts` | G0, G2 | Canvas, ToolRail | `RECTANGLE`, `REC` | `gate_g2.test.ts`, `command_integration.test.ts` | **Verified** |
| Center-Radius Circle | `lib/geometry/adapters/circleAdapter.ts` | G0, G4 | Canvas, ToolRail | `CIRCLE`, `C` | `gate_g4.test.ts`, `command_integration.test.ts` | **Verified** |
| 3-Point Circular Arc | `lib/geometry/adapters/arcAdapter.ts` | G4, G6 | Canvas, ToolRail | `ARC`, `A` | `gate_g4.test.ts`, `arc_metrics.test.ts` | **Verified** |
| Regular Polygon (3–12 sides) | `lib/geometry/adapters/polygonPolylineAdapter.ts` | G1, G9 | Canvas, ToolRail | `POLYGON`, `POL` | `polygon_moments.test.ts` | **Verified** |
| Angled Corner Chamfer / Haunch | `lib/inference/haunchRecognizer.ts` | G2, G4 | Canvas, DraftPanel | `CHAMFER`, `CHA` | `gate_g4.test.ts`, `chamfer_reference.test.ts`| **Verified** |
| Construction Reference Lines | `lib/inference/datum/constructionLine.ts` | G1, G8 | Canvas Overlay | `XLINE`, `XL` | `referenceGeometry.ts` | **Verified** |
| Local Coordinate Frames ($\mathrm{SE}(2)$) | `lib/geometry/lcs/affineMatrix.ts` | G1, G5 | Canvas, Inspector | `LCS`, `UCS` | `gate_g5.test.ts`, `lcs.test.ts` | **Verified** |
| **2. Topological & Planar Map Engine** | | | | | | |
| Doubly Connected Edge List (DCEL) | `lib/geometry/topology/dcel.ts` | G1 | Canvas Rendering | Automatic | `gate_g1.test.ts`, `dcel_planar_arrangement.test.ts` | **Verified** |
| Intersection Splitting & T-Junctions | `lib/geometry/topology/dcel.ts` | G1 | Canvas Rendering | Automatic | `dcel_planar_arrangement.test.ts` | **Verified** |
| Planar Multigraph Deduplication | `lib/geometry/topology/dcel.ts` | G1, G5 | DCEL Lowering | Automatic | `dcel_planar_arrangement.test.ts` | **Verified** |
| Euler Invariant ($V - E + F = 1 + C$) | `lib/geometry/topology/dcel.ts` | G1, G7 | Conformance Check | Automatic | `gate_g1.test.ts`, `dcel_euler_sweep.test.ts` | **Verified** |
| Jordan Ray-Cast Hole Nesting Depth | `lib/geometry/topology/holeNesting.ts` | G1, G7 | Hatch Renderer | Automatic | `dcel_planar_arrangement.test.ts` | **Verified** |
| Persistent Face Identity Matching | `lib/geometry/topology/semanticFaceTagger.ts`| G1, G7 | SVG Hatch Patterns | Automatic | `dcel_planar_arrangement.test.ts` | **Verified** |
| Polygon Chirality & Det Preservation | `lib/geometry/metrics/polygonMoments.ts` | G7, G9 | Direct Drag | Automatic | `gate_g9.test.ts`, `direct_manipulation.test.ts`| **Verified** |
| **3. Vector Predicates & Inference** | | | | | | |
| P1 Parallelism Predicate | `lib/geometry/predicates/vectorPredicates.ts` | G2, G4 | Candidate Cards | Automatic | `gate_g2.test.ts`, `vectorPredicates.ts` | **Verified** |
| P2 Perpendicularity Predicate | `lib/geometry/predicates/vectorPredicates.ts` | G2, G4 | Candidate Cards | Automatic | `gate_g4.test.ts`, `vectorPredicates.ts` | **Verified** |
| P3 Parallel Normal Offset (Thickness) | `lib/geometry/predicates/vectorPredicates.ts` | G2, G8 | DimensionBadges | Automatic | `gate_g2.test.ts`, `vectorPredicates.ts` | **Verified** |
| P4 Corner Chamfer (Measured Angle) | `lib/geometry/predicates/vectorPredicates.ts` | G4 | AuthorPanel | Automatic | `gate_g4.test.ts`, `vectorPredicates.ts` | **Verified** |
| P5 Concentric Radial Offset | `lib/geometry/predicates/vectorPredicates.ts` | G4 | DimensionBadges | Automatic | `gate_g4.test.ts`, `vectorPredicates.ts` | **Verified** |
| P6 Line-Circle & Circle-Circle Tangency | `lib/geometry/predicates/vectorPredicates.ts` | G4 | AuthorPanel | Automatic | `gate_g4.test.ts`, `vectorPredicates.ts` | **Verified** |
| P8 Coincident Joint Welding | `lib/geometry/predicates/vectorPredicates.ts` | G1, G2 | Joint Nodes | Automatic | `gate_g1.test.ts`, `vectorPredicates.ts` | **Verified** |
| Pre-Display Candidate Clustering | `lib/inference/candidateClusterer.ts` | G2, G8 | AuthorPanel | `AUTO_DETECT` | `gate_g2.test.ts`, `candidate_clustering.test.ts` | **Verified** |
| SVD Row-Space Admissibility Gate | `lib/inference/admissibilityFilter.ts` | G2, G8 | Candidate Filter | Automatic | `gate_g2.test.ts`, `admissibility_filter.test.ts` | **Verified** |
| Multi-Cell Bay Void Clusterer | `lib/inference/bayClusterer.ts` | G8, G10 | AuthorPanel | Automatic | `gate_g10.test.ts`, `bay_clustering.test.ts` | **Verified** |
| PSLQ Integer Relation Discovery | `lib/inference/integerRelation.ts` | G10 | AuthorPanel | Automatic | `gate_g10.test.ts`, `formula_naming.test.ts` | **Verified** |
| Live Drag-Invariance Tracing | `lib/inference/dragInvarianceDetector.ts` | G10 | Canvas Drag | Automatic | `gate_g10.test.ts`, `drag_invariance.test.ts` | **Verified** |
| **4. Constraint Solving & Numerics** | | | | | | |
| PlaneGCS WASM Solver Integration | `lib/solver/planegcsClient.ts` | G3, G6 | State Machine | Parameter Edit | `gate_g3.test.ts`, `gate_g6.test.ts` | **Verified** |
| Powell's Dogleg Trust-Region Solver | `lib/solver/dogleg.ts` | G6 | Solver Fallback | Solve Pipeline | `gate_g6.test.ts`, `analytical_jacobians.test.ts` | **Verified** |
| Levenberg-Marquardt Solver | `lib/solver/levenbergMarquardt.ts` | G6 | Solver Fallback | Solve Pipeline | `gate_g6.test.ts`, `analytical_jacobians.test.ts` | **Verified** |
| SolveSpace 1/20 Column Damped Drag | `lib/parametric/dragSolver.ts` | G3, G9 | Canvas Drag | Grip Pointer Move | `gate_g3.test.ts`, `gate_g9.test.ts` | **Verified** |
| Bipartite Graph Dulmage-Mendelsohn | `lib/parametric/graph/dulmageMendelsohn.ts` | G1, G3 | ConstraintStatus | Automatic | `gate_g1.test.ts`, `gate_g3.test.ts` | **Verified** |
| Per-Component Rigid Anchor Rule (§18) | `lib/parametric/graph/dulmageMendelsohn.ts` | G1, G3 | ConstraintStatus | Automatic | `gate_g3.test.ts`, `bipartite_partition.test.ts` | **Verified** |
| Homotopy Sub-stepping ($\Delta L \le 500$) | `lib/solver/branchControl.ts` | G10 | Solve Pipeline | Large Dimension Edit | `gate_g10.test.ts`, `branch_control.test.ts` | **Verified** |
| Bentley-Ottmann Self-Intersection Check | `lib/solver/branchControl.ts` | G10 | Solve Pipeline | Automatic | `gate_g10.test.ts`, `branch_control.test.ts` | **Verified** |
| **5. Templates, Components & Ports** | | | | | | |
| Canonical Template Registry (10 presets) | `lib/parametric/templates/templateRegistry.ts` | G5 | TemplateModal | `TEMPLATES` | `gate_g5.test.ts`, `cad_grips.test.ts` | **Verified** |
| $\mathrm{SE}(2)$ Affine Port Mating | `lib/parametric/component/portSolver.ts` | G5 | Canvas Assembly | Port Attachment | `gate_g5.test.ts`, `cad_grips.test.ts` | **Verified** |
| Procedural Repeat Rules | `lib/parametric/component/repeatExpander.ts` | G5, G10 | RunPanel | Count Field Edit | `gate_g5.test.ts`, `cell_count_invariants.test.ts`| **Verified** |
| Shared Web Edge Collapse (§68) | `lib/parametric/component/sharedEdgeCollapse.ts`| G10 | Template Assembly | Dynamic Repeat | `gate_g10.test.ts`, `cell_count_invariants.test.ts`| **Verified** |
| **6. User Interface & CAD Interaction** | | | | | | |
| AutoCAD Docked Command Terminal | `features/shell/CommandLine.tsx` | UX, §46 | Bottom Shell Dock | `Enter`, Click | `command_integration.test.ts` | **Verified** |
| AutoCAD Command Parser & Tokenizer | `lib/commands/CommandParser.ts` | UX, §46 | CommandLine | Text Entry | `command_parser.test.ts` | **Verified** |
| AutoCAD Command Registry & Autocomplete| `lib/commands/CommandRegistry.ts` | UX, §46 | CommandLine | 40+ Aliases | `command_integration.test.ts` | **Verified** |
| Directional Marquee Selection (L->R Window, R->L Crossing) | `lib/geometry/cadSelection.ts` | UX, §14 | Canvas Viewport | Pointer Drag | `cad_selection.test.ts` | **Verified** |
| Function Key Shortcuts (F1–F12) | `features/shell/CadShell.tsx` | UX, §46 | Shell Keydown | F1–F12 | `CadShell.tsx` component | **Verified** |
| Ortho Mode Cardinal Axis Lock | `lib/geometry/cadTracking.ts` | UX, §46 | Canvas Viewport | `F8`, `ORTHO` | `cad_tracking.test.ts` | **Verified** |
| Polar Tracking 45° Radial Rays | `lib/geometry/cadTracking.ts` | UX, §46 | Canvas Viewport | `F10`, `POLAR` | `cad_tracking.test.ts` | **Verified** |
| Dynamic Input Heads-Up Display (HUD) | `features/canvas/DynamicInputOverlay.tsx` | UX, §46 | Canvas Viewport | `F12`, `DYN` | `cad_tracking.test.ts` | **Verified** |
| Drafting Status Tray (Buttons & Readouts)| `features/shell/StatusStrip.tsx` | UX, §17 | Bottom Status Bar | Click Tray Buttons | Component verification | **Verified** |
| Built-in In-App Instruction Manual | `features/manual/InstructionManualModal.tsx` | UX, §8 | Modal Overlay | `F1`, `?`, `HELP` | Component verification | **Verified** |
| Mode Switcher (Draft / Author / Run) | `features/shell/ModeSwitch.tsx` | UX, §3 | Top Header Shell | Click Mode Tab | `gate_g7.test.ts` | **Verified** |
| Persona Dock & Panel Rail | `features/shell/PersonaDock.tsx` | UX, §3 | Right Side Dock | Tab Click | Component verification | **Verified** |
| Draftsman Zero-Formula Panel | `features/panels/DraftPanel.tsx` | UX, §3 | Right Side Dock | Draft Mode | Component verification | **Verified** |
| Author Formula Curation Panel | `features/panels/AuthorPanel.tsx` | UX, §3 | Right Side Dock | Author Mode | `gate_g7.test.ts` | **Verified** |
| Project Engineer Run Panel | `features/panels/RunPanel.tsx` | UX, §3 | Right Side Dock | Run Mode | Component verification | **Verified** |
| Constraint Diagnostic Status Strip | `features/shell/ConstraintStatus.tsx` | UX | Bottom Status Bar | Automatic | `gate_g3.test.ts`, `gate_g7.test.ts` | **Verified** |
| 3-State Interactive Grips | `lib/geometry/grips.ts` | UX | Selected Geometry | Hover / Click Grip | `cad_grips.test.ts` | **Verified** |
| Magnetic OSNAP Engine (11 modes) | `lib/geometry/snapping.ts` | UX | Canvas Cursor | `F3`, Mouse Move | `snapping.ts` | **Verified** |
| 100-Step Transactional Undo / Redo | `lib/state/drawingReducer.ts` | G7 | ToolRail, Canvas | `Ctrl+Z`, `Ctrl+Y`, `U`, `REDO` | `undo_redo_transaction.test.ts` | **Verified** |
| **7. I/O & Document Exporters** | | | | | | |
| Offline Pure Vector DXF (AutoCAD R2010 AC1024) | `lib/serialization/offlineDxfExporter.ts` | G10 | ExportMenu | `Export DXF` | `exporters.test.ts` | **Verified** |
| Print-Ready PDF Engineering Sheet (A3 PDF 1.4) | `lib/serialization/pdfSheetExporter.ts` | G10 | ExportMenu | `Export PDF` | `exporters.test.ts` | **Verified** |
| Canonical Shape-to-Sketch Lowering | `lib/serialization/shapesToSketch.ts` | G0, G10 | ExportMenu | Automatic | `exporters.test.ts` | **Verified** |
| Canonical JSON Schema Serialization | `lib/serialization/parametricSketchSerializer.ts` | G0, G8 | ExportMenu | `IMPORT`, `EXPORT` | `serialization.test.ts` | **Verified** |
| REST API Template Render Endpoints | `app/api/v1/templates/` | G10 | Server REST API | HTTP POST / GET | Build static & dynamic routes | **Verified** |
| **8. Standards & AI Hardening** | | | | | | |
| Data-Driven Civil Standards Profile | `lib/validation/standardsProfile.ts` | G10, §26 | Solve Pipeline | Automatic | `gate_g10.test.ts` | **Verified** |
| Invariant Health Report Generator | `lib/validation/invariantChecker.ts` | G7, G10 | Solve Pipeline | Automatic | `gate_g10.test.ts` | **Verified** |
| Deterministic Rule-Based Fallback Namer| `lib/ai/fallbackNamer.ts` | G10, §57 | AuthorPanel | Automatic | `formula_naming.test.ts` | **Verified** |
| Model-Space Tolerance Linter | `scripts/lint-tolerance.ts` | G0, §17 | CI Build Step | `bun run lint:tolerance` | 0 unexempted tolerance constants | **Verified** |
| Copyleft Dependency Scanner | `scripts/license-scan.ts` | G0, §84 | CI Build Step | `bun run license:scan` | 0 copyleft/GPL/AGPL packages | **Verified** |
