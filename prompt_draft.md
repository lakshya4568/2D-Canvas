# Handover & Next Step Prompt Draft: Phase 9 Direct Manipulation & Hysteresis Engine

## Task Overview
Following the successful completion and verification of **Phase 7** (Gate G7 verified with 16/16 tests passing) and **Phase 8** (Gate G8 verified with 13/13 tests passing, 380 total tests green across 60 files, 4,696 assertions passing with 0 errors), the next milestone is **Phase 9: Direct Manipulation & Solution Hysteresis Engine** (UPCE-MASTER-1.0 §86, §34, Gate G9 / Phase 9).

## Scope for Phase 9:
1. **Interactive 60 FPS Dragging & Hysteresis Stability**:
   - Deliver real-time mouse drag updates while strictly preserving constraint invariants and topology.
   - Implement minimum-norm coordinate updates via Levenberg-Marquardt with diagonal coordinate damping ($S_{jj}$).
   - Prevent solution branch flipping by using the previous frame's coordinates as the initial guess ($X_0$).
2. **Topological Invariant Preservation During Drag**:
   - Guarantee DCEL face chirality, non-inversion of polygon loops, and weld tolerances ($0.5$ mm) under extreme direct manipulation pulls.
   - Automatic rollback/clamping when drag inputs push mechanisms past kinematic limits or cause self-intersection.
3. **Canvas React UI Integration**:
   - Wire drag event stream from canvas overlay into `PlaneGcsClient.solveDragPreview`.
   - Ensure clean purge of temporary constraints upon drag commit (`pointerup`) or cancel (`Escape`).
4. **Verification & Acceptance**:
   - Implement comprehensive verification suite (`tests/unit/gate_g9.test.ts`).
   - Run `bun test` ensuring 100% green across all existing and new test suites.
   - Run `bun x tsc --noEmit` ensuring zero type errors.
   - Maintain strict license discipline (§84 ban list).
