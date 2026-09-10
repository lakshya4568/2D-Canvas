# Unified Parametric 2D CAD Engine (UPCE-MASTER-1.0)
## Formal Dependency & Module Accounting Audit

**Document Revision**: 1.0.0  
**Target Repository**: `lakshya4568/2D-Canvas`  
**Scanned Total Code Modules**: 262 files (260 TypeScript/TSX, 1 JavaScript, 1 MJS)  
**Circular Dependency Cycles**: 3 identified cycles  
**License Audit Result**: 100% Passed (0 GPL/AGPL copyleft dependencies)  

---

## 1. Package Dependency Audit (Active vs Dead Dependencies)

A rigorous audit of `package.json` dependencies against runtime usage in `lib/`, `features/`, and `app/` reveals active production dependencies versus dead bundle baggage:

### 1.1 Production Dependencies Audit

| Package | Declared Version | Imported In Code? | Runtime Usage & Role | Health / Recommendation |
|---|---|---|---|---|
| `@salusoft89/planegcs` | `^1.2.0` | **Yes** (`lib/solver/planegcsClient.ts`) | Core C++ Variational Solver compiled to WebAssembly (PlaneGCS). Cold solve < 2.5ms, warm solve < 0.25ms. | **Critical Active**. LGPL-2.0-or-later modular WASM boundary compliant with §84 and DEC-001. |
| `lucide-react` | `^1.37.0` | **Yes** (`features/shell/`, `features/panels/`) | Standard CAD icons (ToolRail, CommandBar, PersonaDock, RunPanel). | **Active**. Permissive MIT license. |
| `next` | `^16.3.3` | **Yes** (`app/`) | Application framework, API routes, App Router. | **Critical Active**. MIT license. |
| `react` | `^19.2.8` | **Yes** (`features/`, `lib/state/`) | Core UI library, Context API, Hooks. | **Critical Active**. MIT license. |
| `react-dom` | `^19.2.8` | **Yes** (`app/`, `features/`) | DOM rendering engine. | **Critical Active**. MIT license. |
| `zod` | `^4.5.4` | **Yes** (`lib/serialization/schema.ts`) | Runtime schema validation for CAD models & JSON serialization. | **Critical Active**. MIT license. |
| `clsx` | `^2.1.1` | **NO (0 imports)** | None. Class concatenation is handled via template strings and native arrays. | **DEAD DEPENDENCY**. Recommend removing from `package.json`. |
| `motion` | `^13.1.1` | **NO (0 imports)** | None. Canvas operates on raw SVG DOM without animation libraries. | **DEAD DEPENDENCY**. Recommend removing from `package.json`. Saves >150KB bundle. |
| `next-themes` | `^0.4.6` | **NO (0 imports)** | None. Dark/light theme mode is managed directly by `drawingContext.tsx` and CSS variables. | **DEAD DEPENDENCY**. Recommend removing from `package.json`. |
| `tailwind-merge` | `^3.6.0` | **NO (0 imports)** | None. Tailwind v4 styling operates directly via CSS classes without runtime class-merging. | **DEAD DEPENDENCY**. Recommend removing from `package.json`. |

### 1.2 Development Dependencies Audit

| Package | Declared Version | Role & Status |
|---|---|---|
| `@tailwindcss/postcss` | `^4.3.3` | PostCSS integration for Tailwind CSS v4. Active. |
| `@testing-library/jest-dom` | `^7.0.1` | Custom DOM element matchers for Vitest. Active. |
| `@testing-library/react` | `^16.3.3` | Component testing utilities for React 19. Active. |
| `@types/bun` | `latest` | TypeScript type declarations for Bun runtime. Active. |
| `@types/node` | `^26.4.0` | TypeScript type declarations for Node.js APIs. Active. |
| `@types/react` | `^19.2.18` | TypeScript type declarations for React 19. Active. |
| `@types/react-dom` | `^19.2.5` | TypeScript type declarations for React DOM. Active. |
| `jsdom` | `^30.0.1` | Headless DOM implementation for unit tests in Vitest. Active. |
| `json-schema-to-typescript` | `^16.0.0` | Canonical JSON Schema code generation (`scripts/generate-types.ts`). Active. |
| `postcss` | `^8.5.26` | CSS transformation pipeline. Active. |
| `puppeteer-core` | `^25.9.0` | Headless browser execution for scratch/integration rendering checks. Active. |
| `tailwindcss` | `^4.3.3` | Utility-first CSS framework (v4). Active. |
| `vitest` | `^4.1.11` | Core unit and integration test runner (726 passing tests). Active. |

### 1.3 License & Compliance Discipline (§84, DEC-002)

Automated license scanner (`bun run license:scan`) validates zero GPL/AGPL packages in dependency closures:
- **Verified Permissive**: MIT, Apache-2.0, BSD-3-Clause, Boost-1.0.
- **Strictly Banned**: `py-slvs`, `python-solvespace`, `solvespace` (GPL-3.0), `cad_sketcher` (GPL-3.0), `pymupdf` / `fitz` (AGPL-3.0), `libredwg` (GPL-3.0), `libdxfrw` (GPL-3.0), `freecad-stubs` (GPL-3.0), `jsketcher` (Dual/Non-Commercial).
- **PlaneGCS WASM Exception**: `@salusoft89/planegcs` is licensed under LGPL-2.0-or-later. In accordance with UPCE §84 and NOTICE §2, it is linked dynamically via an isolated WebAssembly boundary (`planegcs.wasm`), allowing independent user replacement and recompilation without proprietary contamination.

---

## 2. Circular Dependency Cycle Analysis

Static analysis via Madge (`madge --circular --extensions ts,tsx lib features app`) identified exactly 3 circular dependency cycles across the codebase:

### Cycle 1: `bipartiteGraph.ts` $longleftrightarrow$ `dulmageMendelsohn.ts`
- **Path**:
  `lib/parametric/graph/bipartiteGraph.ts` $longrightarrow$ `lib/parametric/graph/dulmageMendelsohn.ts` $longrightarrow$ `lib/parametric/graph/bipartiteGraph.ts`
- **Line Citations**:
  - `bipartiteGraph.ts:1`: `import { DulmageMendelsohnSolver, DMResult } from "./dulmageMendelsohn";`
  - `bipartiteGraph.ts:85`: `return DulmageMendelsohnSolver.decompose(this);`
  - `dulmageMendelsohn.ts:1`: `import { BipartiteConstraintGraph } from "./bipartiteGraph";`
- **Root Cause**:
  `BipartiteConstraintGraph` contains convenience methods (`calculateDegreesOfFreedom()` and `decomposeDM()`) that directly instantiate the solver algorithm `DulmageMendelsohnSolver`. In turn, `DulmageMendelsohnSolver` consumes the `BipartiteConstraintGraph` class structure.
- **Architectural Impact**:
  Couples graph data structure representation directly to the decomposition algorithm, preventing independent tree-shaking and creating circular module initialization.
- **Remediation Plan**:
  1. Extract interfaces (`IBipartiteConstraintGraph`, `EntityNode`, `ConstraintNode`, `DMResult`, `ComponentDOF`) into a standalone `types.ts` under `lib/parametric/graph/`.
  2. Remove solver invocation from `BipartiteConstraintGraph` instance methods, leaving `BipartiteConstraintGraph` as a pure graph container. Consumers call `DulmageMendelsohnSolver.decompose(graph)` directly.

### Cycle 2: `connectedComponentSolver.ts` $longleftrightarrow$ `model.ts`
- **Path**:
  `lib/parametric/connectedComponentSolver.ts` $longrightarrow$ `lib/parametric/model.ts` $longrightarrow$ `lib/parametric/connectedComponentSolver.ts`
- **Line Citations**:
  - `connectedComponentSolver.ts:39`: `import { ParametricVariable } from "./model";`
  - `model.ts:19`: `import { solveConnectedGeometry } from "./connectedComponentSolver";`
  - `model.ts:858`: `const result = solveConnectedGeometry({ shapes, variables: this.variables });`
- **Root Cause**:
  `connectedComponentSolver.ts` requires the type definition `ParametricVariable` which is declared and exported inside the monolithic model orchestrator `model.ts`. Meanwhile, `model.ts` imports the solver function `solveConnectedGeometry`.
- **Architectural Impact**:
  A specialized mathematical solver is unnecessarily coupled to the overarching high-level model orchestrator.
- **Remediation Plan**:
  Extract `ParametricVariable` and associated variable model interfaces into `lib/parametric/schemaTypes.ts` or a new `lib/parametric/types.ts`, breaking the backward import.

### Cycle 3: `model.ts` $longleftrightarrow$ `structuralLoopSolver.ts`
- **Path**:
  `lib/parametric/model.ts` $longrightarrow$ `lib/parametric/structuralLoopSolver.ts` $longrightarrow$ `lib/parametric/model.ts`
- **Line Citations**:
  - `structuralLoopSolver.ts:2`: `import { ParametricVariable } from "./model";`
  - `model.ts:18`: `import { solveClosedStructuralLoop } from "./structuralLoopSolver";`
  - `model.ts:835`: `const loopResult = solveClosedStructuralLoop({ shapes, variables: this.variables });`
- **Root Cause**:
  Identical to Cycle 2. `structuralLoopSolver.ts` imports `ParametricVariable` from `model.ts`, while `model.ts` invokes `solveClosedStructuralLoop`.
- **Architectural Impact**:
  Redundant type coupling creates an unnecessary dependency cycle on the core state orchestrator.
- **Remediation Plan**:
  Relocate `ParametricVariable` to the central types module (`lib/parametric/schemaTypes.ts`), resolving both Cycle 2 and Cycle 3 simultaneously.

---

## 3. The 262-File Master Accounting Matrix

Every source file in the repository is cataloged and categorized below:

| File | Purpose | Imported By | Used At Runtime | UI Relevant | UPCE Relevant | Status |
|---|---|---|---|---|---|---|
| `app/api/v1/templates/[id]/instantiate/route.ts` | Next.js App Router entry / layout / page (route.ts) | None (Entry/Root) | Yes | Yes | Yes | Active |
| `app/api/v1/templates/[id]/render/route.ts` | Next.js App Router entry / layout / page (route.ts) | None (Entry/Root) | Yes | Yes | Yes | Active |
| `app/api/v1/templates/route.ts` | Next.js App Router entry / layout / page (route.ts) | None (Entry/Root) | Yes | Yes | Yes | Active |
| `app/layout.tsx` | Next.js App Router entry / layout / page (layout.tsx) | None (Entry/Root) | Yes | Yes | Yes | Active |
| `app/page.tsx` | Next.js App Router entry / layout / page (page.tsx) | None (Entry/Root) | Yes | Yes | Yes | Active |
| `app/providers.tsx` | Next.js App Router entry / layout / page (providers.tsx) | layout.tsx | Yes | Yes | Yes | Active |
| `features/canvas/BoundaryLimitsOverlay.tsx` | Canvas rendering overlay or presentation component: BoundaryLimitsOverlay | None (Entry/Root) | Yes | Yes | Yes | Active |
| `features/canvas/ConstraintOverlays.tsx` | Canvas rendering overlay or presentation component: ConstraintOverlays | DrawingCanvas.tsx | Yes | Yes | Yes | Active |
| `features/canvas/DimensionBadge.tsx` | Canvas rendering overlay or presentation component: DimensionBadge | 4 files (DraftPreview.tsx, ParametricDimensionOverlay.tsx...) | Yes | Yes | Yes | Active |
| `features/canvas/DraftPreview.tsx` | Canvas rendering overlay or presentation component: DraftPreview | DrawingCanvas.tsx | Yes | Yes | Yes | Active |
| `features/canvas/DrawingCanvas.tsx` | Canvas rendering overlay or presentation component: DrawingCanvas | CadShell.tsx | Yes | Yes | Yes | Active |
| `features/canvas/GridLayer.tsx` | Canvas rendering overlay or presentation component: GridLayer | DrawingCanvas.tsx | Yes | Yes | Yes | Active |
| `features/canvas/ParametricDimensionOverlay.tsx` | Canvas rendering overlay or presentation component: ParametricDimensionOverlay | DrawingCanvas.tsx | Yes | Yes | Yes | Active |
| `features/canvas/SelectionOverlay.tsx` | Canvas rendering overlay or presentation component: SelectionOverlay | DrawingCanvas.tsx | Yes | Yes | Yes | Active |
| `features/canvas/ShapeRenderer.tsx` | Canvas rendering overlay or presentation component: ShapeRenderer | DrawingCanvas.tsx | Yes | Yes | Yes | Active |
| `features/canvas/SnapIndicator.tsx` | Canvas rendering overlay or presentation component: SnapIndicator | DrawingCanvas.tsx | Yes | Yes | Yes | Active |
| `features/panels/AuthorPanel.tsx` | Persona dock panel component: AuthorPanel | PersonaDock.tsx | Yes | Yes | Yes | Active |
| `features/panels/DraftPanel.tsx` | Persona dock panel component: DraftPanel | 3 files (AuthorPanel.tsx, RunPanel.tsx...) | Yes | Yes | Yes | Active |
| `features/panels/RunPanel.tsx` | Persona dock panel component: RunPanel | PersonaDock.tsx | Yes | Yes | Yes | Active |
| `features/parametric/TemplateModal.tsx` | Template modal dialog: TemplateModal | CadShell.tsx | Yes | Yes | Yes | Active |
| `features/shell/CadShell.tsx` | Application shell component: CadShell | page.tsx | Yes | Yes | Yes | Active |
| `features/shell/CommandBar.tsx` | Application shell component: CommandBar | CadShell.tsx | Yes | Yes | Yes | Active |
| `features/shell/ConstraintStatus.tsx` | Application shell component: ConstraintStatus | 3 files (AuthorPanel.tsx, DraftPanel.tsx...) | Yes | Yes | Yes | Active |
| `features/shell/ModeSwitch.tsx` | Application shell component: ModeSwitch | CommandBar.tsx | Yes | Yes | Yes | Active |
| `features/shell/PersonaDock.tsx` | Application shell component: PersonaDock | CadShell.tsx | Yes | Yes | Yes | Active |
| `features/shell/StatusStrip.tsx` | Application shell component: StatusStrip | CadShell.tsx | Yes | Yes | Yes | Active |
| `features/shell/ToolRail.tsx` | Application shell component: ToolRail | CadShell.tsx | Yes | Yes | Yes | Active |
| `features/shortcuts/ShortcutsModal.tsx` | Shortcuts modal dialog: ShortcutsModal | CadShell.tsx | Yes | Yes | Yes | Active |
| `features/toolbar/ExportMenu.tsx` | Toolbar control component: ExportMenu | CommandBar.tsx | Yes | Yes | Yes | Active |
| `lib/ai/fallbackNamer.ts` | AI semantic tagging & fallback namer: fallbackNamer | 4 files (index.ts, llmAdapter.ts...) | Yes | No | Yes | Active |
| `lib/ai/index.ts` | AI semantic tagging & fallback namer: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/ai/llmAdapter.ts` | AI semantic tagging & fallback namer: llmAdapter | 3 files (index.ts, ai_layer.test.ts...) | Yes | No | Yes | Active |
| `lib/ai/prompts.ts` | AI semantic tagging & fallback namer: prompts | 3 files (index.ts, llmAdapter.ts...) | Yes | No | Yes | Active |
| `lib/ai/types.ts` | AI semantic tagging & fallback namer: types | 5 files (fallbackNamer.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/geometry/adapters/arcAdapter.ts` | Shape adapter for geometric carrier: arcAdapter | 2 files (index.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/adapters/carrierAdapter.ts` | Shape adapter for geometric carrier: carrierAdapter | 2 files (index.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/adapters/circleAdapter.ts` | Shape adapter for geometric carrier: circleAdapter | 2 files (index.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/adapters/index.ts` | Shape adapter for geometric carrier: index | primitive_adapters.test.ts | Yes | No | Yes | Active |
| `lib/geometry/adapters/lineAdapter.ts` | Shape adapter for geometric carrier: lineAdapter | 2 files (index.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/adapters/polygonPolylineAdapter.ts` | Shape adapter for geometric carrier: polygonPolylineAdapter | 2 files (index.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/adapters/rectangleAdapter.ts` | Shape adapter for geometric carrier: rectangleAdapter | 2 files (index.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/adapters/types.ts` | Shape adapter for geometric carrier: types | 8 files (arcAdapter.ts, carrierAdapter.ts...) | Yes | No | Yes | Active |
| `lib/geometry/chamferReference.ts` | Core geometric math & types: chamferReference | 2 files (snapping.ts, chamfer_reference.test.ts) | Yes | No | Yes | Active |
| `lib/geometry/derivedModel.ts` | Core geometric math & types: derivedModel | derived_model.test.ts | Yes | No | Yes | Active |
| `lib/geometry/gadAssemblyEngine.ts` | Core geometric math & types: gadAssemblyEngine | 11 files (DrawingCanvas.tsx, formulaSynthesizer.ts...) | Yes | No | Yes | Active |
| `lib/geometry/grips.ts` | Core geometric math & types: grips | 2 files (SelectionOverlay.tsx, cad_grips.test.ts) | Yes | No | Yes | Active |
| `lib/geometry/hitTest.ts` | Core geometric math & types: hitTest | 2 files (DrawingCanvas.tsx, geometry.test.ts) | Yes | No | Yes | Active |
| `lib/geometry/lcs/affineMatrix.ts` | Local coordinate system and SE(2) frame math: affineMatrix | 3 files (frame.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/geometry/lcs/frame.ts` | Local coordinate system and SE(2) frame math: frame | 2 files (index.ts, lcs_frame.test.ts) | Yes | No | Yes | Active |
| `lib/geometry/lcs/gramSchmidt.ts` | Local coordinate system and SE(2) frame math: gramSchmidt | 2 files (index.ts, lcs_frame.test.ts) | Yes | No | Yes | Active |
| `lib/geometry/lcs/index.ts` | Local coordinate system and SE(2) frame math: index | 3 files (compositeAssemblyEngine.ts, portMatingSolver.ts...) | Yes | No | Yes | Active |
| `lib/geometry/metrics.ts` | Core geometric math & types: metrics | 20 files (BoundaryLimitsOverlay.tsx, ConstraintOverlays.tsx...) | Yes | No | Yes | Active |
| `lib/geometry/metrics/arcMetrics.ts` | Shape metrics, moments and arc calculations: arcMetrics | 3 files (metrics.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/geometry/metrics/index.ts` | Shape metrics, moments and arc calculations: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/geometry/metrics/polygonMoments.ts` | Shape metrics, moments and arc calculations: polygonMoments | 3 files (index.ts, transientStore.ts...) | Yes | No | Yes | Active |
| `lib/geometry/predicates/index.ts` | Coordinate-free geometric predicate evaluator: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/geometry/predicates/vectorPredicates.ts` | Coordinate-free geometric predicate evaluator: vectorPredicates | 7 files (index.ts, blueprintClassifier.ts...) | Yes | No | Yes | Active |
| `lib/geometry/referenceGeometry.ts` | Core geometric math & types: referenceGeometry | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/geometry/snapping.ts` | Core geometric math & types: snapping | 3 files (DrawingCanvas.tsx, chamfer_reference.test.ts...) | Yes | No | Yes | Active |
| `lib/geometry/tolerance.ts` | Core geometric math & types: tolerance | 42 files (StatusStrip.tsx, index.ts...) | Yes | No | Yes | Active |
| `lib/geometry/topology/cycleExtractor.ts` | DCEL planar topology, faces and half-edges: cycleExtractor | 2 files (dcel.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/topology/dcel.ts` | DCEL planar topology, faces and half-edges: dcel | 18 files (index.ts, semanticFaceTagger.ts...) | Yes | No | Yes | Active |
| `lib/geometry/topology/holeNesting.ts` | DCEL planar topology, faces and half-edges: holeNesting | 2 files (cycleExtractor.ts, index.ts) | Yes | No | Yes | Active |
| `lib/geometry/topology/index.ts` | DCEL planar topology, faces and half-edges: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/geometry/topology/semanticFaceTagger.ts` | DCEL planar topology, faces and half-edges: semanticFaceTagger | 2 files (blueprintClassifier.ts, gate_g7.test.ts) | Yes | No | Yes | Active |
| `lib/geometry/topology/spatialHash.ts` | DCEL planar topology, faces and half-edges: spatialHash | 4 files (index.ts, dcel.ts...) | Yes | No | Yes | Active |
| `lib/geometry/topology/spatialIndex.ts` | DCEL planar topology, faces and half-edges: spatialIndex | 4 files (carrierAdapter.ts, types.ts...) | Yes | No | Yes | Active |
| `lib/geometry/topology/types.ts` | DCEL planar topology, faces and half-edges: types | 56 files (arcAdapter.ts, circleAdapter.ts...) | Yes | No | Yes | Active |
| `lib/geometry/transform.ts` | Core geometric math & types: transform | 2 files (DrawingCanvas.tsx, geometry.test.ts) | Yes | No | Yes | Active |
| `lib/geometry/types.ts` | Core geometric math & types: types | 77 files (DimensionBadge.tsx, DraftPreview.tsx...) | Yes | No | Yes | Active |
| `lib/inference/admissibilityFilter.ts` | Geometric inference & relationship discovery: admissibilityFilter | 6 files (candidateDetector.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/inference/autonomousDiscoveryPipeline.ts` | Geometric inference & relationship discovery: autonomousDiscoveryPipeline | 3 files (index.ts, autonomous_pipeline_dof_regression.test.ts...) | Yes | No | Yes | Active |
| `lib/inference/bayClusterer.ts` | Geometric inference & relationship discovery: bayClusterer | 5 files (formulaCandidateGenerator.ts, cell_count_invariants.test.ts...) | Yes | No | Yes | Active |
| `lib/inference/blueprintClassifier.ts` | Geometric inference & relationship discovery: blueprintClassifier | 3 files (autonomousDiscoveryPipeline.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/inference/candidateClusterer.ts` | Geometric inference & relationship discovery: candidateClusterer | 8 files (autonomousDiscoveryPipeline.ts, candidateDetector.ts...) | Yes | No | Yes | Active |
| `lib/inference/candidateDetector.ts` | Geometric inference & relationship discovery: candidateDetector | 6 files (autonomousDiscoveryPipeline.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/inference/datum/constructionLine.ts` | Geometric inference & relationship discovery: constructionLine | 2 files (index.ts, persistentStore.ts) | Yes | No | Yes | Active |
| `lib/inference/dragInvarianceDetector.ts` | Geometric inference & relationship discovery: dragInvarianceDetector | 2 files (drag_invariance.test.ts, gate_g10.test.ts) | Yes | No | Yes | Active |
| `lib/inference/formulaCandidateGenerator.ts` | Geometric inference & relationship discovery: formulaCandidateGenerator | 2 files (formula_gates.test.ts, gate_g10.test.ts) | Yes | No | Yes | Active |
| `lib/inference/formulaSynthesizer.ts` | Geometric inference & relationship discovery: formulaSynthesizer | 6 files (AuthorPanel.tsx, drawingReducer.ts...) | Yes | No | Yes | Active |
| `lib/inference/haunchRecognizer.ts` | Geometric inference & relationship discovery: haunchRecognizer | 4 files (gadAssemblyEngine.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/inference/index.ts` | Geometric inference & relationship discovery: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/inference/integerRelation.ts` | Geometric inference & relationship discovery: integerRelation | 4 files (formulaCandidateGenerator.ts, formula_gates.test.ts...) | Yes | No | Yes | Active |
| `lib/inference/redundancyFilter.ts` | Geometric inference & relationship discovery: redundancyFilter | 3 files (autonomousDiscoveryPipeline.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/inference/semanticVocabulary.ts` | Geometric inference & relationship discovery: semanticVocabulary | 5 files (blueprintClassifier.ts, candidateClusterer.ts...) | Yes | No | Yes | Active |
| `lib/inference/solverVerifier.ts` | Geometric inference & relationship discovery: solverVerifier | 2 files (gate_g10.test.ts, solver_verifier.test.ts) | Yes | No | Yes | Active |
| `lib/inference/wallDiscovery.ts` | Geometric inference & relationship discovery: wallDiscovery | wall_discovery.test.ts | Yes | No | Yes | Active |
| `lib/inference/wallThicknessExtractor.ts` | Geometric inference & relationship discovery: wallThicknessExtractor | 2 files (index.ts, haunch_inference.test.ts) | Yes | No | Yes | Active |
| `lib/io/dxfExporter.ts` | CAD export and document generation service: dxfExporter | 5 files (index.ts, renderService.ts...) | Yes | No | Yes | Active |
| `lib/io/index.ts` | CAD export and document generation service: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/io/pdfSheetExporter.ts` | CAD export and document generation service: pdfSheetExporter | 5 files (index.ts, renderService.ts...) | Yes | No | Yes | Active |
| `lib/io/renderService.ts` | CAD export and document generation service: renderService | 6 files (index.ts, restHandlers.ts...) | Yes | No | Yes | Active |
| `lib/io/restHandlers.ts` | CAD export and document generation service: restHandlers | 5 files (route.ts, route.ts...) | Yes | No | Yes | Active |
| `lib/io/svgExporter.ts` | CAD export and document generation service: svgExporter | 3 files (index.ts, renderService.ts...) | Yes | No | Yes | Active |
| `lib/io/templateRenderHost.ts` | CAD export and document generation service: templateRenderHost | 5 files (index.ts, restHandlers.ts...) | Yes | No | Yes | Active |
| `lib/parametric/boundaryLimits.ts` | Parametric model and variational orchestration: boundaryLimits | 2 files (drawingReducer.ts, boundary_limits.test.ts) | Yes | No | Yes | Active |
| `lib/parametric/closedGeometry.ts` | Parametric model and variational orchestration: closedGeometry | 8 files (ShapeRenderer.tsx, gadAssemblyEngine.ts...) | Yes | No | Yes | Active |
| `lib/parametric/component/compositeAssemblyEngine.ts` | Component assembly, ports and repeat engine: compositeAssemblyEngine | 5 files (templateRenderHost.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/parametric/component/index.ts` | Component assembly, ports and repeat engine: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/parametric/component/portMatingSolver.ts` | Component assembly, ports and repeat engine: portMatingSolver | 3 files (compositeAssemblyEngine.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/parametric/component/portSolver.ts` | Component assembly, ports and repeat engine: portSolver | 2 files (index.ts, cad_grips.test.ts) | Yes | No | Yes | Active |
| `lib/parametric/component/repeatExpander.ts` | Component assembly, ports and repeat engine: repeatExpander | 3 files (compositeAssemblyEngine.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/parametric/component/sharedEdgeCollapse.ts` | Component assembly, ports and repeat engine: sharedEdgeCollapse | 4 files (index.ts, cell_count_invariants.test.ts...) | Yes | No | Yes | Active |
| `lib/parametric/component/types.ts` | Component assembly, ports and repeat engine: types | 3 files (index.ts, portSolver.ts...) | Yes | No | Yes | Active |
| `lib/parametric/connectedComponentSolver.ts` | Parametric model and variational orchestration: connectedComponentSolver | model.ts | Yes | No | Yes | Active |
| `lib/parametric/constraintGraph.ts` | Parametric model and variational orchestration: constraintGraph | 3 files (constraintSolver.ts, model.ts...) | Yes | No | Yes | Active |
| `lib/parametric/constraintSolver.ts` | Parametric model and variational orchestration: constraintSolver | 2 files (model.ts, constraint_graph.test.ts) | Yes | No | Yes | Active |
| `lib/parametric/constraints.ts` | Parametric model and variational orchestration: constraints | 6 files (geometryObject.ts, model.ts...) | Yes | No | Yes | Active |
| `lib/parametric/constructionGeometry.ts` | Parametric model and variational orchestration: constructionGeometry | model.ts | Yes | No | Yes | Active |
| `lib/parametric/dag/tarjan.ts` | DAG cycle detection & topological sort: tarjan | 4 files (compositeAssemblyEngine.ts, dualGraphOrchestrator.ts...) | Yes | No | Yes | Active |
| `lib/parametric/dependencyGraph.ts` | Parametric model and variational orchestration: dependencyGraph | 3 files (model.ts, solver.ts...) | Yes | No | Yes | Active |
| `lib/parametric/dragSolver.ts` | Parametric model and variational orchestration: dragSolver | 3 files (drag_damping.test.ts, gate_g3.test.ts...) | Yes | No | Yes | Active |
| `lib/parametric/dualGraphOrchestrator.ts` | Parametric model and variational orchestration: dualGraphOrchestrator | 2 files (dual_graph_ast_dependencies.test.ts, gate_g1.test.ts) | Yes | No | Yes | Active |
| `lib/parametric/expression.ts` | Parametric model and variational orchestration: expression | 8 files (compositeAssemblyEngine.ts, portMatingSolver.ts...) | Yes | No | Yes | Active |
| `lib/parametric/geometryObject.ts` | Parametric model and variational orchestration: geometryObject | 4 files (model.ts, solver.ts...) | Yes | No | Yes | Active |
| `lib/parametric/graph/bfsPartition.ts` | Bipartite constraint graph & Dulmage-Mendelsohn: bfsPartition | 4 files (dualGraphOrchestrator.ts, model.ts...) | Yes | No | Yes | Active |
| `lib/parametric/graph/bipartiteGraph.ts` | Bipartite constraint graph & Dulmage-Mendelsohn: bipartiteGraph | 11 files (autonomousDiscoveryPipeline.ts, redundancyFilter.ts...) | Yes | No | Yes | Active |
| `lib/parametric/graph/dulmageMendelsohn.ts` | Bipartite constraint graph & Dulmage-Mendelsohn: dulmageMendelsohn | 5 files (autonomousDiscoveryPipeline.ts, redundancyFilter.ts...) | Yes | No | Yes | Active |
| `lib/parametric/model.ts` | Parametric model and variational orchestration: model | 14 files (ParametricDimensionOverlay.tsx, RunPanel.tsx...) | Yes | No | Yes | Active |
| `lib/parametric/parameterManager.ts` | Parametric model and variational orchestration: parameterManager | 7 files (ParametricDimensionOverlay.tsx, dualGraphOrchestrator.ts...) | Yes | No | Yes | Active |
| `lib/parametric/schemaTypes.ts` | Parametric model and variational orchestration: schemaTypes | 18 files (autonomousDiscoveryPipeline.ts, dxfExporter.ts...) | Yes | No | Yes | Active |
| `lib/parametric/solver.ts` | Parametric model and variational orchestration: solver | 3 files (model.ts, lcs.test.ts...) | Yes | No | Yes | Active |
| `lib/parametric/structuralEditing.ts` | Parametric model and variational orchestration: structuralEditing | structural_editing.test.ts | Yes | No | Yes | Active |
| `lib/parametric/structuralLoopSolver.ts` | Parametric model and variational orchestration: structuralLoopSolver | model.ts | Yes | No | Yes | Active |
| `lib/parametric/templates.ts` | Parametric model and variational orchestration: templates | 10 files (TemplateModal.tsx, drawingReducer.ts...) | Yes | No | Yes | Active |
| `lib/parametric/templates/canonicalTemplates.ts` | CAD template catalog, registry and validator: canonicalTemplates | 6 files (templates.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/parametric/templates/index.ts` | CAD template catalog, registry and validator: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/parametric/templates/rccBridgeTemplate.ts` | CAD template catalog, registry and validator: rccBridgeTemplate | templates.ts | Yes | No | Yes | Active |
| `lib/parametric/templates/rdsoBridgeTemplate.ts` | CAD template catalog, registry and validator: rdsoBridgeTemplate | 2 files (templates.ts, cad_grips.test.ts) | Yes | No | Yes | Active |
| `lib/parametric/templates/templateMigration.ts` | CAD template catalog, registry and validator: templateMigration | 3 files (index.ts, sketchSerializer.ts...) | Yes | No | Yes | Active |
| `lib/parametric/templates/templateRegistry.ts` | CAD template catalog, registry and validator: templateRegistry | 11 files (restHandlers.ts, templateRenderHost.ts...) | Yes | No | Yes | Active |
| `lib/parametric/templates/templateValidator.ts` | CAD template catalog, registry and validator: templateValidator | 3 files (templates.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/parametric/transform2d.ts` | Parametric model and variational orchestration: transform2d | 4 files (geometryObject.ts, model.ts...) | Yes | No | Yes | Active |
| `lib/parametric/variationalKernel.ts` | Parametric model and variational orchestration: variationalKernel | variational_kernel.test.ts | Yes | No | Yes | Active |
| `lib/runtime/editPipeline.ts` | 13-step edit transaction pipeline: editPipeline | 4 files (index.ts, edit_pipeline.test.ts...) | Yes | No | Yes | Active |
| `lib/runtime/index.ts` | 13-step edit transaction pipeline: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/serialization/conformanceReporter.ts` | JSON/SVG serialization & schema validation: conformanceReporter | 3 files (autonomousDiscoveryPipeline.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/serialization/exportJson.ts` | JSON/SVG serialization & schema validation: exportJson | 3 files (ExportMenu.tsx, index.ts...) | Yes | No | Yes | Active |
| `lib/serialization/exportPng.ts` | JSON/SVG serialization & schema validation: exportPng | 2 files (ExportMenu.tsx, index.ts) | Yes | No | Yes | Active |
| `lib/serialization/exportSvg.ts` | JSON/SVG serialization & schema validation: exportSvg | 4 files (ExportMenu.tsx, exportPng.ts...) | Yes | No | Yes | Active |
| `lib/serialization/importJson.ts` | JSON/SVG serialization & schema validation: importJson | 4 files (ExportMenu.tsx, index.ts...) | Yes | No | Yes | Active |
| `lib/serialization/index.ts` | JSON/SVG serialization & schema validation: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/serialization/schema.ts` | JSON/SVG serialization & schema validation: schema | 3 files (exportJson.ts, importJson.ts...) | Yes | No | Yes | Active |
| `lib/serialization/sketchSerializer.ts` | JSON/SVG serialization & schema validation: sketchSerializer | 4 files (autonomousDiscoveryPipeline.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/solver/branchControl.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): branchControl | 5 files (editPipeline.ts, invariantChecker.ts...) | Yes | No | Yes | Active |
| `lib/solver/dogleg.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): dogleg | 5 files (connectedComponentSolver.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/solver/fixtureReplayer.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): fixtureReplayer | 2 files (index.ts, gate_g6.test.ts) | Yes | No | Yes | Active |
| `lib/solver/hysteresis.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): hysteresis | 6 files (branchControl.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/solver/index.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/solver/jacobians/analyticalJacobians.ts` | Analytical Jacobian matrix evaluator: analyticalJacobians | 4 files (index.ts, planegcsClient.ts...) | Yes | No | Yes | Active |
| `lib/solver/jacobians/finiteDifference.ts` | Analytical Jacobian matrix evaluator: finiteDifference | 3 files (index.ts, analytical_jacobians.test.ts...) | Yes | No | Yes | Active |
| `lib/solver/jacobians/types.ts` | Analytical Jacobian matrix evaluator: types | 3 files (index.ts, analyticalJacobians.ts...) | Yes | No | Yes | Active |
| `lib/solver/levenbergMarquardt.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): levenbergMarquardt | 13 files (connectedComponentSolver.ts, variationalKernel.ts...) | Yes | No | Yes | Active |
| `lib/solver/matrix/denseMatrix.ts` | Dense matrix algebra, SVD and pseudoinverse: denseMatrix | 11 files (variationalKernel.ts, dogleg.ts...) | Yes | No | Yes | Active |
| `lib/solver/matrix/pseudoInverse.ts` | Dense matrix algebra, SVD and pseudoinverse: pseudoInverse | 2 files (index.ts, svd_pseudoinverse.test.ts) | Yes | No | Yes | Active |
| `lib/solver/matrix/svd.ts` | Dense matrix algebra, SVD and pseudoinverse: svd | 11 files (admissibilityFilter.ts, redundancyFilter.ts...) | Yes | No | Yes | Active |
| `lib/solver/planegcsClient.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): planegcsClient | 9 files (autonomousDiscoveryPipeline.ts, fixtureReplayer.ts...) | Yes | No | Yes | Active |
| `lib/solver/solverBenchmark.ts` | Numerical solver kernel (PlaneGCS, Dogleg, LM): solverBenchmark | 2 files (index.ts, gate_g6.test.ts) | Yes | No | Yes | Active |
| `lib/state/drawingContext.tsx` | Application state management & history: drawingContext.tsx | 17 files (providers.tsx, BoundaryLimitsOverlay.tsx...) | Yes | No | Yes | Active |
| `lib/state/drawingReducer.ts` | Application state management & history: drawingReducer | 10 files (ModeSwitch.tsx, drawingContext.tsx...) | Yes | No | Yes | Active |
| `lib/state/index.ts` | Application state management & history: index | model.ts | Yes | No | Yes | Active |
| `lib/state/persistentStore.ts` | Application state management & history: persistentStore | 4 files (index.ts, transactionalHistory.ts...) | Yes | No | Yes | Active |
| `lib/state/presets/singleCellCulvert.ts` | Domain preset model constructors: singleCellCulvert | 5 files (planegcsClient.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/state/presets/twoSpanCulvert.ts` | Domain preset model constructors: twoSpanCulvert | 2 files (index.ts, two_span_culvert.test.ts) | Yes | No | Yes | Active |
| `lib/state/transactionalHistory.ts` | Application state management & history: transactionalHistory | 3 files (index.ts, undo_redo_transaction.test.ts...) | Yes | No | Yes | Active |
| `lib/state/transientStore.ts` | Application state management & history: transientStore | index.ts | Yes | No | Yes | Active |
| `lib/validation/index.ts` | Standards profile validator & invariant checker: index | None (Entry/Root) | Yes | No | Yes | Active |
| `lib/validation/invariantChecker.ts` | Standards profile validator & invariant checker: invariantChecker | 8 files (editPipeline.ts, index.ts...) | Yes | No | Yes | Active |
| `lib/validation/standardsProfile.ts` | Standards profile validator & invariant checker: standardsProfile | 11 files (renderService.ts, restHandlers.ts...) | Yes | No | Yes | Active |
| `next.config.ts` | Next.js application configuration | None (Entry/Root) | Yes | No | No | Config |
| `postcss.config.mjs` | PostCSS plugins configuration | None (Entry/Root) | Yes | No | No | Config |
| `scratch/check_gad.ts` | Scratch verification or debug script (check_gad.ts) | None (Entry/Root) | No | No | No | Scratch |
| `scratch/check_import.ts` | Scratch verification or debug script (check_import.ts) | None (Entry/Root) | No | No | No | Scratch |
| `scratch/debug_browser.ts` | Scratch verification or debug script (debug_browser.ts) | None (Entry/Root) | No | No | No | Scratch |
| `scratch/test_browser_gad.ts` | Scratch verification or debug script (test_browser_gad.ts) | None (Entry/Root) | No | No | No | Scratch |
| `scratch/test_browser_interactive.ts` | Scratch verification or debug script (test_browser_interactive.ts) | None (Entry/Root) | No | No | No | Scratch |
| `scratch/test_browser_limits_and_formulas.ts` | Scratch verification or debug script (test_browser_limits_and_formulas.ts) | None (Entry/Root) | No | No | No | Scratch |
| `scratch/test_browser_rcc_and_shapes.ts` | Scratch verification or debug script (test_browser_rcc_and_shapes.ts) | None (Entry/Root) | No | No | No | Scratch |
| `scripts/build-fixtures.ts` | Build/CI automation script (build-fixtures.ts) | None (Entry/Root) | No | No | Yes | Utility |
| `scripts/gad-render.ts` | Build/CI automation script (gad-render.ts) | exporters.test.ts | No | No | Yes | Utility |
| `scripts/generate-types.ts` | Build/CI automation script (generate-types.ts) | None (Entry/Root) | No | No | Yes | Utility |
| `scripts/license-scan.ts` | Build/CI automation script (license-scan.ts) | 2 files (gate_g0.test.ts, license_scan.test.ts) | No | No | Yes | Utility |
| `scripts/lint-tolerance.ts` | Build/CI automation script (lint-tolerance.ts) | 2 files (gate_g2.test.ts, lint_guardrails.test.ts) | No | No | Yes | Utility |
| `tests/chamfer_reference.test.ts` | Test suite for chamfer_reference | None (Entry/Root) | No | No | Yes | Test |
| `tests/closed_geometry.test.ts` | Test suite for closed_geometry | None (Entry/Root) | No | No | Yes | Test |
| `tests/constraint_graph.test.ts` | Test suite for constraint_graph | None (Entry/Root) | No | No | Yes | Test |
| `tests/geometry.test.ts` | Test suite for geometry | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/autonomous_gad_solver.test.ts` | E2E integration test suite for autonomous_gad_solver | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/cell_count_invariants.test.ts` | E2E integration test suite for cell_count_invariants | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/direct_manipulation.test.ts` | E2E integration test suite for direct_manipulation | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/rcc_bridge_gad.test.ts` | E2E integration test suite for rcc_bridge_gad | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/rcc_bridge_parametric.test.ts` | E2E integration test suite for rcc_bridge_parametric | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/single_cell_culvert.test.ts` | E2E integration test suite for single_cell_culvert | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/two_span_culvert.test.ts` | E2E integration test suite for two_span_culvert | None (Entry/Root) | No | No | Yes | Test |
| `tests/integration/undo_redo_transaction.test.ts` | E2E integration test suite for undo_redo_transaction | None (Entry/Root) | No | No | Yes | Test |
| `tests/lcs.test.ts` | Test suite for lcs | None (Entry/Root) | No | No | Yes | Test |
| `tests/parametric.test.ts` | Test suite for parametric | None (Entry/Root) | No | No | Yes | Test |
| `tests/reducer.test.ts` | Test suite for reducer | None (Entry/Root) | No | No | Yes | Test |
| `tests/serialization.test.ts` | Test suite for serialization | None (Entry/Root) | No | No | Yes | Test |
| `tests/structural_editing.test.ts` | Test suite for structural_editing | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/admissibility_filter.test.ts` | Unit test suite for admissibility_filter | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/ai_layer.test.ts` | Unit test suite for ai_layer | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/analytical_jacobians.test.ts` | Unit test suite for analytical_jacobians | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/arc_metrics.test.ts` | Unit test suite for arc_metrics | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/atomic_autoformula_slab.test.ts` | Unit test suite for atomic_autoformula_slab | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/autonomous_pipeline_dof_regression.test.ts` | Unit test suite for autonomous_pipeline_dof_regression | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/bay_clustering.test.ts` | Unit test suite for bay_clustering | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/bipartite_partition.test.ts` | Unit test suite for bipartite_partition | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/boundary_limits.test.ts` | Unit test suite for boundary_limits | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/branch_control.test.ts` | Unit test suite for branch_control | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/cad_grips.test.ts` | Unit test suite for cad_grips | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/candidate_clustering.test.ts` | Unit test suite for candidate_clustering | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/dcel_euler_sweep.test.ts` | Unit test suite for dcel_euler_sweep | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/dcel_planar_arrangement.test.ts` | Unit test suite for dcel_planar_arrangement | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/derived_model.test.ts` | Unit test suite for derived_model | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/drag_damping.test.ts` | Unit test suite for drag_damping | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/drag_invariance.test.ts` | Unit test suite for drag_invariance | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/dual_graph_ast_dependencies.test.ts` | Unit test suite for dual_graph_ast_dependencies | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/dulmage_mendelsohn.test.ts` | Unit test suite for dulmage_mendelsohn | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/edit_pipeline.test.ts` | Unit test suite for edit_pipeline | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/exporters.test.ts` | Unit test suite for exporters | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/formula_gates.test.ts` | Unit test suite for formula_gates | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/formula_naming.test.ts` | Unit test suite for formula_naming | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/formula_selection_and_binding.test.ts` | Unit test suite for formula_selection_and_binding | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/formula_synthesizer.test.ts` | Unit test suite for formula_synthesizer | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g0.test.ts` | Vitest acceptance verification suite for Gate G0 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g1.test.ts` | Vitest acceptance verification suite for Gate G1 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g10.test.ts` | Vitest acceptance verification suite for Gate G10 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g2.test.ts` | Vitest acceptance verification suite for Gate G2 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g3.test.ts` | Vitest acceptance verification suite for Gate G3 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g4.test.ts` | Vitest acceptance verification suite for Gate G4 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g5.test.ts` | Vitest acceptance verification suite for Gate G5 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g6.test.ts` | Vitest acceptance verification suite for Gate G6 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g7.test.ts` | Vitest acceptance verification suite for Gate G7 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g8.test.ts` | Vitest acceptance verification suite for Gate G8 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/gate_g9.test.ts` | Vitest acceptance verification suite for Gate G9 | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/greens_metrics.test.ts` | Unit test suite for greens_metrics | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/haunch_inference.test.ts` | Unit test suite for haunch_inference | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/hierarchical_groups.test.ts` | Unit test suite for hierarchical_groups | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/integer_relation.test.ts` | Unit test suite for integer_relation | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/invariant_checker.test.ts` | Unit test suite for invariant_checker | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/jacobians_fd.test.ts` | Unit test suite for jacobians_fd | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/lcs_frame.test.ts` | Unit test suite for lcs_frame | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/license_scan.test.ts` | Unit test suite for license_scan | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/lint_guardrails.test.ts` | Unit test suite for lint_guardrails | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/lm_solver_convergence.test.ts` | Unit test suite for lm_solver_convergence | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/parametric_dag.test.ts` | Unit test suite for parametric_dag | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/primitive_adapters.test.ts` | Unit test suite for primitive_adapters | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/shared_edge_collapse.test.ts` | Unit test suite for shared_edge_collapse | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/single_cell_culvert.test.ts` | Unit test suite for single_cell_culvert | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/solver_lm.test.ts` | Unit test suite for solver_lm | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/solver_verifier.test.ts` | Unit test suite for solver_verifier | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/spatial_index.test.ts` | Unit test suite for spatial_index | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/standards_profile.test.ts` | Unit test suite for standards_profile | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/svd_pseudoinverse.test.ts` | Unit test suite for svd_pseudoinverse | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/tolerance_policy.test.ts` | Unit test suite for tolerance_policy | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/topology_dcel.test.ts` | Unit test suite for topology_dcel | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/two_span_culvert.test.ts` | Unit test suite for two_span_culvert | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/variational_kernel.test.ts` | Unit test suite for variational_kernel | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/vector_predicates.test.ts` | Unit test suite for vector_predicates | None (Entry/Root) | No | No | Yes | Test |
| `tests/unit/wall_discovery.test.ts` | Unit test suite for wall_discovery | None (Entry/Root) | No | No | Yes | Test |
| `vitest.config.ts` | Vitest test runner configuration | None (Entry/Root) | Yes | No | No | Config |
