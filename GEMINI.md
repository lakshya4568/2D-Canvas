# UPCE Architectural Guidelines & Kernel Invariants

This repository implements the Unified Parametric 2D CAD Engine (UPCE-MASTER-1.0). All modifications to this codebase must adhere to the following non-negotiable invariants:

## 1. Zero Conformal Scaling on Solve Paths (§8, §29.4, §81)
- Never apply uniform or proportional similarity scaling ($k = L_{\text{target}} / L_{\text{original}}$) to engineering geometry.
- Undriven member lengths, wall thicknesses, and haunches must be strictly preserved during parameter changes.
- Variational solves must compute minimum-norm updates ($\Delta X^* = -J^+ F$) via SVD/Dogleg from warm starts ($X_0$).

## 2. Planar Rigid-Body Anchor Rule (§18)
- Every 2D planar mechanism requires fixing 3 degrees of freedom (2 translation + 1 rotation) to eliminate rigid body motion.
- Fixing a single point only removes translation. Rotation must be explicitly anchored (e.g. horizontal/vertical baseline constraint) so that solver null spaces do not cause rotational drift.
- Bipartite constraint graphs and Dulmage-Mendelsohn analyses must propagate the anchor datum so that $d_{\text{anchor}} = 0$ is accurately reflected.

## 3. Persona Boundary Isolation (§3, §59, §64)
- **Draftsman Mode (`DraftPanel`)**: Formula exposure is strictly zero. No formula bars, no math expressions, no AST graphs, no synthetic names like `R1_Width`. Dimensions are editable by typing nominal values.
- **Author Mode (`AuthorPanel`)**: The only surface where expressions and formulas are visible. Candidates are reviewed with evidence, confidence, and explicit Accept/Reject actions.
- **Project Engineer Mode (`RunPanel`)**: Driving parameters appear as form inputs; derived parameters are displayed as read-only values without mathematical expressions.

## 4. Variable Scoping in Bidirectional Sync (`model.ts`)
- In `syncModel`, never allow inner cutouts, voids, or nested sub-shapes to fall back to global un-scoped dimensions (`Width`, `Height`, `W`, `H`).
- Discriminate inner shapes (`/inner|cutout/i`) so they bind exclusively to scoped variables (`InnerWidth`, `Inner_Cutout.width`, etc.).
- Template definitions must provide explicit scoped variables for each constituent shape.

## 5. Tolerance & Unit Discipline (§17, §84)
- All geometric tolerances must be injected from `TolerancePolicy` in model-space millimeters (`policy.geometry_mm`, `policy.weld_mm`, `policy.solver_residual`), never hardcoded or expressed in screen pixels.
- The tolerance linter (`bun run lint:tolerance`) enforces zero locally defined tolerance constants.
- Zero GPL/AGPL dependencies are permitted; dependencies must pass `bun run license:scan`.

## 6. Zero LLM Geometric Authority (§2.1, §56)
- AI adapters must have strictly zero authority over geometric coordinates, constraints, or topology.
- AI naming patches must be reconstructed field-by-field rather than spread, and restricted purely to semantic tags, friendly names, and UI groups.
