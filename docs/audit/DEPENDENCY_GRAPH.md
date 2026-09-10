# UPCE-MASTER-1.0 Master Dependency Graph

## 1. Top-Level Layered Architecture

The Unified Parametric 2D CAD Engine (UPCE-MASTER-1.0) strictly enforces a unidirectional, acyclic dependency architecture (DAG). Business logic, geometric truth, and constraint solving remain isolated from presentation components.

```mermaid
graph TD
    subgraph UI_Presentation [Presentation Layer (Next.js / React)]
        CadShell[CadShell.tsx]
        DrawingCanvas[DrawingCanvas.tsx]
        CommandLine[CommandLine.tsx]
        ToolRail[ToolRail.tsx]
        StatusStrip[StatusStrip.tsx]
        DraftPanel[DraftPanel.tsx]
        AuthorPanel[AuthorPanel.tsx]
        RunPanel[RunPanel.tsx]
        DynamicInput[DynamicInputOverlay.tsx]
        InstructionManual[InstructionManualModal.tsx]
        ExportMenu[ExportMenu.tsx]
    end

    subgraph UI_Controllers [UI Controllers & Application State]
        DrawingContext[drawingContext.tsx]
        DrawingReducer[drawingReducer.ts]
        SnapEngine[snapping.ts]
        HitTest[hitTest.ts]
    end

    subgraph Command_System [Command Grammar & Dispatch Engine]
        CmdParser[CommandParser.ts]
        CmdRegistry[CommandRegistry.ts]
        CmdTypes[commands/types.ts]
    end

    subgraph Parametric_Core [Parametric & Constraint Core]
        AutonomousPipeline[autonomousCadDiscoveryPipeline.ts]
        DualGraph[dualGraphOrchestrator.ts]
        BipartiteGraph[bipartiteGraph.ts]
        DMDecomposition[dulmageMendelsohn.ts]
        VariationalKernel[variationalKernel.ts]
        PlaneGcs[planegcsClient.ts]
        Hysteresis[hysteresis.ts]
        DragSolver[dragSolver.ts]
    end

    subgraph Geometry_Kernel [Topological & Geometric Subsystems]
        DCEL[topology/dcel.ts]
        Adapters[adapters/*]
        CadSelection[cadSelection.ts]
        CadTracking[cadTracking.ts]
        Metrics[metrics/*]
        Tolerance[tolerance.ts (TolerancePolicy)]
    end

    subgraph Serialization_Persistence [Persistence & Exporters]
        ShapesToSketch[shapesToSketch.ts]
        DxfExport[offlineDxfExporter.ts]
        PdfExport[pdfSheetExporter.ts]
        SchemaValidator[parametricSketchSerializer.ts]
    end

    CadShell --> DrawingCanvas
    CadShell --> CommandLine
    CadShell --> ToolRail
    CadShell --> StatusStrip
    CadShell --> InstructionManual
    DrawingCanvas --> DynamicInput
    DrawingCanvas --> CadSelection
    DrawingCanvas --> CadTracking
    DrawingCanvas --> DrawingContext
    CommandLine --> CmdRegistry
    CmdRegistry --> CmdParser
    CmdRegistry --> DrawingContext
    DrawingContext --> DrawingReducer
    DrawingReducer --> SnapEngine
    DrawingReducer --> HitTest
    DrawingReducer --> AutonomousPipeline
    AutonomousPipeline --> DualGraph
    DualGraph --> BipartiteGraph
    DualGraph --> DMDecomposition
    DualGraph --> PlaneGcs
    DualGraph --> VariationalKernel
    ExportMenu --> ShapesToSketch
    ShapesToSketch --> DxfExport
    ShapesToSketch --> PdfExport
    PlaneGcs --> Tolerance
    DCEL --> Tolerance
```

## 2. Component Dependency Verification Matrix

| Layer | Source Module | Direct Dependencies | Consumed By | Architectural Invariant Enforced |
| :--- | :--- | :--- | :--- | :--- |
| **UI** | `CadShell.tsx` | `DrawingCanvas`, `CommandLine`, `ToolRail`, `StatusStrip`, `InstructionManualModal` | Root application page (`page.tsx`) | §3 Persona isolation & F-key routing |
| **UI** | `DrawingCanvas.tsx` | `cadSelection.ts`, `cadTracking.ts`, `DynamicInputOverlay.tsx`, `drawingContext.tsx` | `CadShell.tsx` | §8 Zero conformal scaling; CAD directional selection |
| **UI** | `CommandLine.tsx` | `CommandRegistry.ts`, `CommandParser.ts`, `drawingContext.tsx` | `CadShell.tsx` | §46 AutoCAD command prompt & autocomplete |
| **UI** | `StatusStrip.tsx` | `drawingContext.tsx`, `tolerance.ts`, `ConstraintStatus.tsx` | `CadShell.tsx` | §17 Canonical model-space mm readout; F-key tray |
| **Command**| `CommandRegistry.ts`| `CommandParser.ts`, `commands/types.ts`, `types.ts` (Geometry) | `CommandLine.tsx`, Unit Tests | Unified dispatch; no state bypassing |
| **Command**| `CommandParser.ts`  | `geometry/types.ts` | `CommandRegistry.ts`, Tests | Exact trigonometric polar/relative resolution |
| **Geometry**| `cadSelection.ts`   | `metrics.ts`, `geometry/types.ts` | `DrawingCanvas.tsx`, Tests | AutoCAD L->R Window vs R->L Crossing selection |
| **Geometry**| `cadTracking.ts`    | `geometry/types.ts` | `DrawingCanvas.tsx`, Tests | F8 Ortho & F10 Polar ray cardinal projection |
| **Kernel** | `dcel.ts`           | `tolerance.ts`, `geometry/types.ts` | `autonomousCadDiscoveryPipeline.ts`, `gate_g1.test.ts` | §5.1 Planar arrangement; Euler validation `V-E+F=1+C` |
| **Kernel** | `dualGraphOrchestrator.ts` | `bipartiteGraph.ts`, `dulmageMendelsohn.ts`, `planegcsClient.ts` | `autonomousCadDiscoveryPipeline.ts` | §30 Dulmage-Mendelsohn canonical decomposition |
| **Export** | `shapesToSketch.ts` | `geometry/types.ts`, `schemaTypes.ts` | `ExportMenu.tsx`, Tests | Canonical JSON schema lowering |
| **Export** | `offlineDxfExporter.ts` | `schemaTypes.ts` | `ExportMenu.tsx`, Tests | AutoCAD R2010 AC1024 pure vector offline output |
| **Export** | `pdfSheetExporter.ts`   | `schemaTypes.ts` | `ExportMenu.tsx`, Tests | ISO 32000-1 / PDF 1.4 A3 engineering drawing sheet |

## 3. Cross-Cutting Subsystems
- **State & Transactions**: `drawingReducer.ts` and `drawingContext.tsx` provide immutable state transitions with pre-move snapshot rollback stacks.
- **Tolerance Discipline**: All distances, angles, and tolerances are sourced strictly from `TolerancePolicy` in model-space millimeters (`policy.geometry_mm`, `policy.weld_mm`, `policy.solver_residual`). Zero locally hardcoded tolerance literals permitted.
- **License Discipline**: Verified by `scripts/license-scan.ts` — 18 declared packages, 0 copyleft/GPL/AGPL dependencies.
