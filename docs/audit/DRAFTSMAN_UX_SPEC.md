# Professional Draftsman UX Specification
## Workflow Ergonomics, Persona Boundary Isolation & Selection Mechanics

**Document Revision**: 1.0.0  
**Target User Persona**: Civil / Structural CAD Draftsman (95% of user base)  
**Governing Specification**: UPCE-MASTER-1.0 (§3, §59, §64)  

---

## 1. The Professional Draftsman Workflow Philosophy

In engineering offices drafting civil infrastructure—such as Indian Railways RDSO bridge GADs, highway culverts, and retaining walls—draftsmen produce dozens of complex production drawings weekly. Historically, attempts to introduce parametric tools have failed in drafting offices because they forced draftsmen to act like programmers: defining variable names, linking algebraic formulas, and debugging circular equation graphs.

### The Non-Negotiable Axiom (§3)
> **"A draftsman's job is to draft. It is not to build forms, write formulas, or wire fields."**  
> All mathematical relationships, topological constraints, and dimension bindings must be inferred autonomously by the engine kernel. The draftsman interacts exclusively with physical geometry, magnetic snaps, CAD grips, and on-canvas dimension badges.

---

## 2. Persona Boundary Isolation (§3, §59, §64)

The engine architecture enforces strict separation between three operational user personas:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DRAFTSMAN MODE (95% of Users)                          │
│ • Surface: DraftPanel & Canvas                                                         │
│ • Formula Exposure: STRICTLY ZERO (0 formula bars, 0 math expressions, 0 ASTs)        │
│ • Direct Manipulation: Click dimension badge, type nominal value ("700"), press Enter.│
│ • Visual Guidance: Under-constrained (Blue), Fully-constrained (Black/Green),          │
│   Over-constrained Conflict (Red with plain parameter names).                         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Escalates un-parameterized templates
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              TEMPLATE AUTHOR MODE (5% of Power Users)                  │
│ • Surface: AuthorPanel                                                                 │
│ • Formula Exposure: Full visibility. Curates inferred formulas, reviews confidence.    │
│ • Actions: Explicit Accept / Reject / Edit / Rename buttons.                           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Publishes certified template catalog
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PROJECT ENGINEER / RUN MODE                               │
│ • Surface: RunPanel                                                                    │
│ • Exposure: Driving parameters as standard form controls; derived metrics read-only.   │
│ • Actions: Site-specific span sweeps, standards validation, DXF / PDF export.          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Enforcement Rules for Draftsman Mode (`DraftPanel.tsx`)
1. **Zero Formula Strings**: No mathematical expressions (e.g. `Width - 2 * WallThickness`) shall ever be rendered in the DOM of `DraftPanel.tsx`.
2. **Zero Synthetic Parameter Names**: No raw UUIDs (`shape_9f4b`) or synthetic variable names (`R1_Width`, `L2_x2`) are displayed. Dimensions are presented by semantic role (`Span`, `Height`, `Wall Thickness`) or nominal measurement (`350.0 mm`).
3. **Locked Derived Dimensions**: Dimensions governed by equations appear with a lock icon ($\theta$). They display their evaluated numerical value and cite their driving source (e.g. *"Driven by ClearSpan"*), but never show the equation.
4. **Natural Dimension Badges**: Clicking a dimension badge opens a clean numeric input box pre-populated with the current scalar value. Typing a number and pressing `Enter` triggers the 13-step transactional solve pipeline.

---

## 3. Keyboard & Mouse Ergonomics

To support all-day drafting without physical strain, the interaction model adheres to standard CAD physical ergonomics:

### 3.1 Mouse Navigation & Button Mappings

| Mouse Input | Action | Behavior |
|---|---|---|
| **Left Click (Canvas)** | Selection / Pick Point | Selects entity under cursor, or establishes base point for active command. |
| **Left Drag (Empty Canvas)** | Box Selection | Initiates Window or Crossing selection rectangle (see Section 4). |
| **Left Drag (On Grip)** | Direct Manipulation | Engages SolveSpace 1/20 damped solver at 60 FPS. |
| **Middle Click Drag (Pan)** | Viewport Pan | Translates the canvas viewport smoothly in screen coordinates. |
| **Scroll Wheel (Zoom)** | Cursor-Anchored Zoom | Zooms smoothly ($0.1\times$ to $50\times$), keeping the world coordinates under the mouse fixed in place. |
| **Right Click** | Context Menu / Enter | If a command is active, acts as `Enter` / commit. If idle, opens contextual shortcut menu. |

### 3.2 Keyboard Hotkeys & Efficiency Rules
- **Spacebar $\equiv$ Enter**: In all drafting contexts, the Spacebar acts as an instantaneous synonym for Enter, allowing the left hand to commit coordinates without reaching across the keyboard.
- **Escape (Cancel)**:
  - If a command is active $\to$ cancels the command and restores crosshair.
  - If grips are hot $\to$ releases the grip and restores warm selection.
  - If entities are selected $\to$ deselects all entities.
- **Repeat Command (Spacebar on Idle)**: Pressing Spacebar or Enter when no command is active repeats the immediately preceding drafting command (e.g. repeating `LINE` or `DIMENSION`).

---

## 4. Window vs. Crossing Selection Mechanics

Selection in 2D Canvas Studio follows the standard CAD directional selection discipline:

```
            Left-to-Right Drag                          Right-to-Left Drag
         [WINDOW SELECTION - BLUE]                  [CROSSING SELECTION - GREEN]
    ┌─────────────────────────────────┐        ┌ - - - - - - - - - - - - - - - - ┐
    │  Solid Blue Border              │        :  Dashed Green Border            :
    │  Semi-transparent Blue Fill     │        :  Semi-transparent Green Fill    :
    │  Selects entities COMPLETELY    │        :  Selects entities INSIDE        :
    │  contained inside the box       │        :  OR TOUCHING / INTERSECTING     :
    └─────────────────────────────────┘        └ - - - - - - - - - - - - - - - - ┘
```

### 4.1 Window Selection (Left-to-Right Drag)
- **Trigger**: User presses mouse button on empty canvas and drags to the **right** ($\Delta x > 0$).
- **Visual Appearance**: Solid blue border (`#3b82f6`, 1.5 px) with translucent blue interior fill (`rgba(59, 130, 246, 0.15)`).
- **Selection Criterion**: An entity is selected **if and only if** its entire bounding geometry is strictly contained inside the selection rectangle:
  $$\forall \mathbf{P} \in \mathrm{Vertices}(\mathcal{S}), \quad \mathbf{P} \in [x_{\text{min}}, x_{\text{max}}] \times [y_{\text{min}}, y_{\text{max}}]$$

### 4.2 Crossing Selection (Right-to-Left Drag)
- **Trigger**: User presses mouse button on empty canvas and drags to the **left** ($\Delta x < 0$).
- **Visual Appearance**: Dashed green border (`#22c55e`, 1.5 px, dasharray `4,4`) with translucent green interior fill (`rgba(34, 197, 94, 0.15)`).
- **Selection Criterion**: An entity is selected if it is either **contained inside** the rectangle OR if any of its boundary segments **intersect** any of the four borders of the selection rectangle:
  $$\mathcal{S} \cap \mathcal{B}_{\text{box}} \neq \emptyset$$

---

## 5. Visual Degree-of-Freedom (DOF) Feedback

Rather than presenting complex algebraic status messages, the canvas communicates structural solvability through intuitive entity color codings:

| Color Code | State | Technical Meaning | Draftsman Guidance |
|---|---|---|---|
| **Blue** (`#3b82f6`) | **Under-Constrained** | Entity possesses free degrees of freedom ($\mathrm{DOF} > 0$). | Entity can be moved or stretched freely by dragging. |
| **Black / White** (`#f8fafc`) | **Fully-Constrained** | Entity is fully anchored relative to its reference frame ($\mathrm{DOF} = 0$). | Geometry is locked in place and fully defined. |
| **Amber** (`#f59e0b`) | **Standards Warning** | Geometry is mathematically sound but deviates from design code (e.g. IRC:112 cover). | Advisory notification; drafting is not blocked. |
| **Red** (`#ef4444`) | **Over-Constrained Conflict** | Two or more constraints are mathematically incompatible. | Constraint status bar highlights conflicting parameters with single-click suppression. |
