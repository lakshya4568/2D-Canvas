# 2D Canvas Studio Master Plan
## 7-Phase Execution Roadmap from Dependency Cleanup to Production Acceptance

**Document Revision**: 1.0.0  
**Target Milestone**: Production CAD Release (UPCE-MASTER-1.0)  
**Verification Baseline**: 726 automated test passes, 0 tolerance violations, 0 copyleft licenses  

---

## 1. Executive Roadmap Overview

The UPCE-MASTER-1.0 architectural roadmap establishes a disciplined, 7-phase implementation and verification schedule. This plan executes systematic codebase cleanup, ergonomics consolidation, interaction engineering, and production hardening without destabilizing existing passing test suites.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Dependency Cleanup, Package Hygiene & Cycle Breaking                        │
│  Prune dead packages (clsx, motion, next-themes, tailwind-merge) · Break 3 cycles      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: AutoCAD Command Grammar & Tokenizer Pipeline                                 │
│  Implement @dX,dY, Dist<Angle, direct distance entry · Wire command aliases dictionary│
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: 3-State Interactive Grips & Dynamic Input HUD                                │
│  Complete vertex/midpoint/centroid grip lifecycle · Float dynamic HUD at crosshair     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 4: OSNAP Consolidation & Function Key (F-Key) Subsystem                         │
│  Wire F1–F12 hotkeys · Consolidate 11 OSNAP modes · Polar & Ortho tracking             │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 5: Draftsman Ergonomics & Window vs. Crossing Selection Mechanics              │
│  Blue Window (L->R) vs Green Crossing (R->L) · Enforce §3 persona boundary isolation   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 6: Civil Standards Profile Expansion & Template Catalog Enrichment             │
│  Update IRC:112:2020 & RDSO profiles · Verify multi-cell box culvert signed residuals  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 7: Final Conformance Audit, Quality Gate Verification & Release Sign-Off        │
│  Re-verify Gates G0–G10 · Execute CI sweeps · Final merge to main                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase-by-Phase Technical Specifications

### Phase 1: Dependency Cleanup, Package Hygiene & Cycle Breaking
- **Goal**: Clean production bundle, eliminate dead code weight, and break the 3 circular dependency cycles identified in the static audit.
- **Tasks**:
  1. Remove 4 unused production dependencies from `package.json`: `clsx`, `motion`, `next-themes`, `tailwind-merge`. Saves $>150$ KB from bundle.
  2. Resolve Circular Dependency 1 (`bipartiteGraph.ts` $\longleftrightarrow$ `dulmageMendelsohn.ts`):
     - Extract common graph data structures (`IBipartiteConstraintGraph`, `EntityNode`, `ConstraintNode`, `DMResult`) to `lib/parametric/graph/types.ts`.
     - Decouple `DulmageMendelsohnSolver` invocation from `BipartiteConstraintGraph` class methods.
  3. Resolve Circular Dependencies 2 & 3 (`connectedComponentSolver.ts` $\longleftrightarrow$ `model.ts` and `structuralLoopSolver.ts` $\longleftrightarrow$ `model.ts`):
     - Extract `ParametricVariable` interface from `model.ts` into `lib/parametric/schemaTypes.ts`.
  4. Run `madge --circular` to confirm 0 circular dependencies remain.
- **Acceptance Criteria**:
  - `bun test` passes 100% (all 726 tests).
  - `madge --circular` returns 0 cycles.
  - `bun run license:scan` passes with 0 copyleft warnings.

### Phase 2: AutoCAD Command Grammar & Tokenizer Pipeline
- **Goal**: Provide the command terminal parser supporting absolute, relative, polar, and direct distance entry.
- **Tasks**:
  1. Author pure parser `lib/geometry/commandParser.ts`:
     - Tokenize coordinates: absolute `X,Y`, relative `@dX,dY`, polar `Dist<Angle`, relative polar `@Dist<Angle`, and direct distance `Distance`.
     - Tokenize aliases: `L`, `PL`, `REC`, `C`, `A`, `POL`, `M`, `CO`, `RO`, `SC`, `TR`, `EX`, `O`, `MI`, `E`, `D`, `DLI`, `DAL`, `DAN`, `DRA`, `Z`, `P`, `U`, `REDO`, `REG`.
  2. Wire parser into `features/shell/CommandBar.tsx`:
     - Implement floating terminal input line activated via `Ctrl+\`` or typing anywhere on canvas when idle.
     - Display autocomplete suggestion dropdown matching command tokens.
     - Implement 50-command history navigable via Up/Down arrow keys.
  3. Unit test parser in `tests/unit/command_parser.test.ts`.
- **Acceptance Criteria**:
  - All EBNF coordinate grammar variants parse accurately into world-coordinate displacements.
  - Pressing `Spacebar` or `Enter` executes command; `Escape` clears prompt.

### Phase 3: 3-State Interactive Grips & Dynamic Input HUD
- **Goal**: Enable instantaneous direct manipulation via on-canvas vertex/midpoint grips and floating numeric input.
- **Tasks**:
  1. Expand `features/canvas/DrawingCanvas.tsx` to render interactive CAD grips:
     - Render $8\times 8$ px blue squares (`warm`) at entity vertices, midpoints, and centroids upon selection.
     - Implement hover hit-testing ($12$ px radius) with cyan glow and target crosshair cursor.
     - On `mousedown`, transition grip to `hot` (solid orange square) and engage `DirectManipulationDragSolver` (`lib/parametric/dragSolver.ts`).
  2. Implement Dynamic Input HUD overlay component (`features/canvas/DynamicInputOverlay.tsx`):
     - Float $16$ px offset from active crosshair.
     - Render primary metric input (Length/Distance) and secondary metric input (Angle).
     - Wire `Tab` key to toggle active field focus with lock glyph.
     - Wire `Enter` to commit values to drawing state.
- **Acceptance Criteria**:
  - 60 FPS drag performance with zero frame drops.
  - SolveSpace 1/20 column damping prevents shape distortion during grip movement.

### Phase 4: OSNAP Consolidation & Function Key (F-Key) Subsystem
- **Goal**: Full magnetic object snapping and standard CAD keyboard toggles.
- **Tasks**:
  1. Consolidate OSNAP glyph renderers in `features/canvas/SnapIndicator.tsx`:
     - Endpoint (square), Midpoint (triangle), Center (circle), Centroid (inscribed circle), Quadrant (diamond), Intersection (cross), Perpendicular (right angle), Tangent (circle-line).
  2. Implement global keyboard hook in `CadShell.tsx` for standard F-keys:
     - `F1` (Help / Shortcuts), `F2` (Command History Window), `F3` (Toggle OSNAP), `F7` (Toggle Grid), `F8` (Toggle Ortho 0°/90°), `F9` (Toggle Grid Snap), `F10` (Polar Tracking), `F12` (Toggle Dynamic Input).
  3. Wire Ortho mode constraint into pointer event projection:
     - When `Ortho` is active, project cursor delta to nearest cardinal axis ($\Delta x = 0$ or $\Delta y = 0$).
- **Acceptance Criteria**:
  - Toggling F3/F8/F12 updates status indicators instantly.
  - Snapping to endpoints/intersections locks coordinate within `policy.weld_mm`.

### Phase 5: Draftsman Ergonomics & Window vs. Crossing Selection Mechanics
- **Goal**: Professional selection box mechanics and strict §3 persona boundary isolation.
- **Tasks**:
  1. Implement directional selection box in `features/canvas/SelectionOverlay.tsx`:
     - Drag Left-to-Right ($\Delta x > 0$): Blue translucent box (`#3b82f615`) with solid border $\to$ strict inclusion selection (all vertices inside box).
     - Drag Right-to-Left ($\Delta x < 0$): Green translucent box (`#22c55e15`) with dashed border $\to$ crossing selection (inside OR intersecting border).
  2. Audit and enforce Persona Boundaries across dock panels:
     - `DraftPanel.tsx`: Strictly zero formula bars, zero AST graphs, zero synthetic variable names. Dimensions editable only by nominal scalar values.
     - `AuthorPanel.tsx`: Full visibility of candidate cards, confidence metrics, and Accept/Reject buttons.
     - `RunPanel.tsx`: Project engineer mode with input sliders, read-only derived values, and zero mathematical expressions.
- **Acceptance Criteria**:
  - Selection box accurately differentiates complete inclusion vs edge intersection.
  - Automated tests verify zero formula rendering in Draftsman mode.

### Phase 6: Civil Standards Profile Expansion & Template Catalog Enrichment
- **Goal**: Enrich data-driven civil profiles and resolve multi-cell culvert open conformance gaps.
- **Tasks**:
  1. Enrich `standards/profiles/rdso_culvert.json` with multi-barrel span formulas and minimum slab thickness rules per Indian Railways Bridge Manual.
  2. Enrich `standards/profiles/irc_structural.json` with IRC:112 concrete cover rules and crack-width limit states.
  3. Address GAP-001 in `lib/solver/planegcsClient.ts`:
     - Implement signed point-to-line residual formulation for parallel offset predicates, closing the 10 free DOFs on multi-bay culvert horizontal span expansions.
  4. Register new canonical civil bridge templates in `lib/parametric/templates/canonicalTemplates.ts` (Composite Plate Girder, Bowstring Arch Rib).
- **Acceptance Criteria**:
  - Standards evaluation emits non-blocking amber audit notifications citing specific clauses.
  - Multi-cell culvert expands horizontally with zero vertical drift.

### Phase 7: Final Conformance Audit, Quality Gate Verification & Release Sign-Off
- **Goal**: End-to-end verification sweep across all 11 quality gates, build verification, and production sign-off.
- **Tasks**:
  1. Execute full verification suite:
     - `bun test` (all unit and integration tests passing).
     - `bun x tsc --noEmit` (0 TypeScript type errors).
     - `bun run lint:tolerance` (0 illegal tolerance constants or shape-type branching).
     - `bun run license:scan` (0 GPL/AGPL packages).
  2. Generate auditable release conformance report using `lib/serialization/conformanceReporter.ts`.
  3. Validate clean export outputs: DXF R2010 file integrity in external CAD, PDF vector sheets, SVG rendering.
  4. Sign off production readiness for UPCE-MASTER-1.0.
- **Acceptance Criteria**:
  - 100% test passing rate across all gates G0–G10.
  - Formal audit documents approved under `docs/audit/`.
