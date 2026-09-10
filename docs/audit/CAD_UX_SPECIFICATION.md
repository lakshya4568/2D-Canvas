# AutoCAD-Style CAD/UX Specification
## Command Grammar, Grips, Snapping & Dynamic Input HUD

**Document Revision**: 1.0.0  
**Target Surface**: 2D Canvas Studio Presentation Layer (`features/shell/`, `features/canvas/`)  
**Design Reference**: Industry-Standard AutoCAD / Civil 3D Ergonomics & UPCE-MASTER-1.0 §34, §76  

---

## 1. Executive Summary

Professional draftsmen and civil engineers operate at high velocity using muscle memory developed over decades of AutoCAD and MicroStation usage. To achieve zero cognitive friction, the presentation layer must faithfully provide:
1. An AutoCAD-style Command Line Grammar supporting absolute, relative, polar, and direct distance entry.
2. A comprehensive Command Aliases Dictionary.
3. Interactive 3-State Grips (`warm`, `hover`, `hot`) with stretch, move, and rotate behaviors.
4. 11 Object Snap (OSNAP) Modes with magnetic visual glyphs.
5. Standard Function Key (F-Key) toggles (F1–F12).
6. A Dynamic Input Heads-Up Display (HUD) floating at the active crosshair.

---

## 2. Command Line Grammar & Parser Specification

The command parser processes user keystrokes into geometric instructions. It supports tokenization of commands, sub-options, and numerical coordinate strings.

### 2.1 Coordinate Input Grammar (EBNF)

```ebnf
CoordinateInput   ::= AbsoluteCoord | RelativeCoord | PolarCoord | DirectDistance ;

AbsoluteCoord     ::= Number "," Number ;
RelativeCoord     ::= "@" Number "," Number ;
PolarCoord        ::= ( "@" )? Number "<" Angle ;
DirectDistance    ::= Number ;

Number            ::= ["+"|"-"]? Digit+ ("." Digit+)? ;
Angle             ::= ["+"|"-"]? Digit+ ("." Digit+)? ;
Digit             ::= "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
```

### 2.2 Input Mode Semantics

| Syntax | Notation | Example | Semantics |
|---|---|---|---|
| `X,Y` | Absolute Cartesian | `250,500` | Places point at global world coordinate $(250, 500)$ mm from origin $(0,0)$. |
| `@dX,dY` | Relative Cartesian | `@100,-50` | Places point at displacement $\Delta x = +100$, $\Delta y = -50$ mm from the previous base point. |
| `Dist<Angle` | Absolute Polar | `300<45` | Places point at distance $300$ mm from origin along a $45^\circ$ counter-clockwise ray from positive X-axis. |
| `@Dist<Angle` | Relative Polar | `@250<30` | Places point at distance $250$ mm from previous point along a $30^\circ$ orientation vector. |
| `Distance` | Direct Distance Entry | `450` | Projects point at length $450$ mm along the current cursor tracking line / active Ortho direction. |

---

## 3. Command Aliases Dictionary

The command line matches user input against the standard CAD alias dictionary. Pressing `Spacebar` or `Enter` executes the command; `Escape` cancels execution.

| Alias | Canonical Command | Action & Workflow |
|---|---|---|
| **L** | `LINE` | Draws contiguous two-point line segments. Prompt: `Specify first point:` $\to$ `Specify next point:`. |
| **PL** | `PLINE` | Draws connected polylines with arc and segment sub-options. |
| **REC** | `RECTANGLE` | Prompts for corner 1 and diagonal corner 2, generating parametric orthogonal box. |
| **C** | `CIRCLE` | Prompts for center point and radius (or `[2P/3P/Ttr]` sub-options). |
| **A** | `ARC` | 3-point arc drafting: `Specify start point:` $\to$ `second point:` $\to$ `end point:`. |
| **POL** | `POLYGON` | Prompts for number of sides (3–12), center point, and inscribed/circumscribed radius. |
| **CHA** | `CHAMFER` | Creates angled transition between two non-parallel segments with distance/angle options. |
| **F** | `FILLET` | Creates tangent circular arc of specified radius between two segments. |
| **M** | `MOVE` | Prompts for selection, base point, and displacement target. |
| **CO / CP** | `COPY` | Creates duplicate shapes at specified displacement vector. |
| **RO** | `ROTATE` | Rotates selected entities around base point by typed angle or cursor direction. |
| **SC** | `SCALE` | Scales entities relative to base point (parametric models preserve structural member thicknesses). |
| **TR** | `TRIM` | Cuts intersecting segments back to adjacent boundary edges. |
| **EX** | `EXTEND` | Projects segments forward to intersect boundary edges. |
| **O** | `OFFSET` | Generates parallel offset segment or concentric curve at specified distance $t$. |
| **MI** | `MIRROR` | Reflects geometry across a two-point reflection line. |
| **E** | `ERASE` | Deletes selected entities from canvas. |
| **D / DIM** | `DIMENSION` | Automatically places smart linear, aligned, or radial dimension badge. |
| **DLI** | `DIMLINEAR` | Forces horizontal or vertical orthogonal dimension badge. |
| **DAL** | `DIMALIGNED` | Places dimension aligned with orientation of selected segment. |
| **DAN** | `DIMANGULAR` | Measures and annotates angle between two non-parallel lines. |
| **DRA** | `DIMRADIUS` | Places radial dimension leader on circle or arc. |
| **Z** | `ZOOM` | Viewport zoom sub-options: `[All/Extents/Window/Previous]`. |
| **P** | `PAN` | Interactive viewport translation hand tool. |
| **U** | `UNDO` | Steps back 1 transaction in the 100-step transactional history. |
| **REDO** | `REDO` | Re-applies next transaction in history. |
| **REG** | `REGEN` | Recomputes DCEL planar map and re-renders SVG viewport from clean state. |

---

## 4. 3-State Interactive CAD Grips

When an entity is selected, interactive glyphs ("Grips") appear at key topological vertices and reference points. Grips allow instantaneous direct manipulation without entering explicit command modes.

```
       [Warm Grip]                 [Hover Grip]                  [Hot Grip]
    ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
    │  Unselected   │           │ Cursor Hover  │           │ Clicked / Drag│
    │  Blue outline │ ──Hover─► │ Cyan glow     │ ──Click─► │ Solid Orange  │
    │  Transparent  │           │ Target cursor │           │ Active solver │
    └───────────────┘           └───────────────┘           └───────────────┘
```

### 4.1 Grip States & Color Styling

| State | Visual Appearance | Trigger | Behavior |
|---|---|---|---|
| **Warm** | $8\times 8$ px square, $1.5$ px blue border (`#3b82f6`), transparent fill. | Entity selection. | Passive indicator of editable geometry vertex. |
| **Hover** | $10\times 10$ px square, cyan border (`#06b6d4`), semi-transparent fill (`#06b6d433`). | Pointer enters grip hit-radius ($12$ px). | Cursor transforms to target crosshair; displays tooltip. |
| **Hot** | $10\times 10$ px square, solid crimson/orange fill (`#f97316`), white border. | Pointer `mousedown` on hover grip. | Becomes active drag origin; engages `dragSolver.ts` at 60 FPS. |

### 4.2 Grip Functional Allocations by Entity Type

| Entity Type | Grip Locations | Default Action (Drag) | Ctrl / Space Cycling Options |
|---|---|---|---|
| **Line / Arrow** | Endpoints ($V_0, V_1$), Midpoint ($M$). | Endpoint: `STRETCH` segment length/orientation. Midpoint: `MOVE` entire segment parallel. | Stretch $\to$ Move $\to$ Rotate $\to$ Scale. |
| **Rectangle** | 4 Corners, 4 Midpoints, 1 Centroid. | Corner: 2D Stretch width & height. Midpoint: 1D Stretch width or height. Centroid: `MOVE` box. | Stretch $\to$ Move $\to$ Rotate. |
| **Circle / Arc** | Center ($C$), 4 Quadrants ($0^\circ, 90^\circ, 180^\circ, 270^\circ$). | Center: `MOVE` circle. Quadrant: `STRETCH` radius/diameter. Arc endpoints: adjust subtended angle. | Radius $\to$ Move. |
| **Polygon** | All Vertices ($V_i$), All Edge Midpoints ($M_i$), Area Centroid ($\bar{V}$). | Vertex: stretch vertex. Midpoint: add/insert vertex. Centroid: `MOVE` entire polygon rigidly. | Stretch $\to$ Move. |

---

## 5. Object Snap (OSNAP) Modes & Glyphs

The snapping engine (`lib/geometry/snapping.ts`) searches an adaptive R-tree neighborhood ($\epsilon_{\text{snap}} = 20$ screen px) around the cursor, magnetizing the active drafting point to exact geometric features.

| Mode | Token | Indicator Glyph | Snapping Target |
|---|---|---|---|
| **Endpoint** | `END` | Green Square ($\Box$) | Endpoints of lines, arcs, polyline vertices, and polygon corners. |
| **Midpoint** | `MID` | Green Triangle ($\triangle$) | Exact geometric midpoint of any linear segment or arc chord. |
| **Center** | `CEN` | Green Circle ($\bigcirc$) | Mathematical center of circle, circular arc, or ellipse. |
| **Centroid** | `GCE` | Circle with Inscribed Plus ($\oplus$) | Analytical center of mass $\bar{V} = \frac{1}{6A}\sum(x_i + x_{i+1})(x_i y_{i+1} - x_{i+1}y_i)$ of closed polygon. |
| **Quadrant** | `QUA` | Green Diamond ($\Diamond$) | Cardinal perimeter points of circle/arc at $0^\circ, 90^\circ, 180^\circ, 270^\circ$. |
| **Intersection** | `INT` | Green Cross ($\times$) | Exact mathematical intersection point of two crossing or touching segments. |
| **Perpendicular** | `PER` | Right Angle Symbol ($\llcorner$) | Foot of perpendicular dropped from active point onto target segment carrier line. |
| **Tangent** | `TAN` | Circle with Tangent Line ($\overline{\bigcirc}$) | Point on circular arc where line from active point forms exact $90^\circ$ to radius. |
| **Nearest** | `NEA` | Hourglass ($\bowtie$) | Nearest point on the carrier curve of any visible geometry. |
| **Extension** | `EXT` | Dashed Extension Line ($\dots$) | Collinear projection along the unbounded trajectory of a segment. |
| **Grid** | `GRID` | Green Dot ($\cdot$) | Nearest coordinate grid node based on active grid spacing ($20$ mm). |

---

## 6. Function Key (F-Key) Assignments

Standard keyboard ergonomics provide rapid toggles without breaking mouse drafting flow:

| F-Key | Name | Function & Runtime Effect |
|---|---|---|
| **F1** | Help | Opens the Shortcuts and Command Grammar Reference Modal. |
| **F2** | Command Window | Expands floating Command Bar history buffer showing previous inputs and solver diagnostics. |
| **F3** | Object Snap (OSNAP) | Globally enables / disables magnetic object snapping (`toggleObjectSnap()`). |
| **F7** | Grid Display | Toggles SVG background grid lines visibility (`toggleGrid()`). |
| **F8** | Ortho Mode | Restricts cursor motion strictly to horizontal or vertical axes ($0^\circ, 90^\circ, 180^\circ, 270^\circ$). |
| **F9** | Grid Snap | Toggles cursor quantization to grid coordinates (`toggleGridSnap()`). |
| **F10** | Polar Tracking | Guides cursor along preset angular increments (e.g. $15^\circ, 30^\circ, 45^\circ, 90^\circ$). |
| **F11** | Object Snap Tracking | Projects alignment dashed tracking guides from acquired OSNAP points. |
| **F12** | Dynamic Input (DYN) | Toggles floating Heads-Up Display (HUD) input boxes at active cursor. |

---

## 7. Dynamic Input HUD (Heads-Up Display) Specification

When Dynamic Input (`F12`) is active, numerical input fields follow the mouse cursor directly on the SVG canvas, eliminating the need to look away to a separate command line or inspector panel.

```
                  Cursor Crosshair
                         │
                         ▼
                         +──────────────────────────────┐
                         │  Length: [ 500.00 ] mm       │ ◄── Active Input Focus
                         ├──────────────────────────────┤
                         │  Angle:    37.0°             │ ◄── Tab switches focus
                         └──────────────────────────────┘
```

### 7.1 Component Layout & Behavior
- **Positioning**: Offsets $16$ px right and $16$ px below the active cursor crosshair in viewport space.
- **Input Fields**:
  - **Field 1 (Primary Metric)**: Displays live measured distance/length (e.g. `500.00 mm`) in real time as the mouse moves.
  - **Field 2 (Secondary Orientation)**: Displays live orientation angle (e.g. `37.0°`) relative to the horizontal datum.
- **Keyboard Interaction**:
  - Typing numbers immediately replaces the value in the active focused field.
  - Pressing `Tab` locks the current field value (renders lock icon $\theta$) and shifts input focus to the second field.
  - Pressing `Enter` or `Spacebar` commits both values and places the point.
  - Pressing `Escape` cancels input and releases the cursor.
