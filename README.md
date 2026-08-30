# 2D Canvas Studio — High-Performance Vector CAD Drawing System

> **A precision web-based 2D vector CAD drawing workspace built with Next.js 16 (App Router), Bun, React 19, TypeScript, Tailwind CSS v4, Motion, and Raw SVG DOM with Zero External Drawing Libraries.**

---

## 🚀 Quick Start

### Prerequisites
- **Bun 1.3+** installed on your system.

### Installation & Development
```bash
# 1. Install dependencies
bun install

# 2. Run unit test suite (31 automated unit tests)
bun run test

# 3. Launch local development server
bun --bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
bun run build
bun run start
```

---

## 🏛 Architecture & Engineering Philosophy

This application strictly adheres to the core requirement: **Zero canvas-rendering libraries** (no Konva, Fabric.js, Paper.js, Two.js, or p5.js). The entire rendering engine is built directly on top of native browser **SVG DOM**, utilizing mathematical coordinate projections, browser-native transformation matrices, and pure geometry calculations.

### Clean Layered Separation
```
├── lib/
│   ├── geometry/           # 100% PURE mathematical functions (zero DOM/React imports)
│   │   ├── types.ts        # Source of truth for points, shapes, metrics, viewports, snapping
│   │   ├── metrics.ts      # Line length/angle, Rect/Circle/Ellipse/Polygon/Star generators & centroids
│   │   ├── hitTest.ts      # Analytical point-to-segment distance, ray-casting polygon testing & rotation transforms
│   │   ├── transform.ts    # Screen-to-SVG CTM transforms & cursor-anchored zoom math
│   │   └── snapping.ts     # CAD-grade coordinate snapping: Endpoints, Corners, Midpoints, Centroids, Edges, Intersections, Perpendiculars
│   ├── serialization/      # Lossless vector data import / export
│   │   ├── schema.ts       # Strict Zod schemas validating document payloads (all 7 shape types)
│   │   ├── exportJson.ts   # ID-stripped specification-compliant JSON serializer
│   │   ├── importJson.ts   # Safe JSON parser with runtime error reporting
│   │   ├── exportSvg.ts    # Standalone clean SVG XML vector exporter
│   │   └── exportPng.ts    # 2x high-DPI offscreen SVG-to-Canvas rasterization
│   └── state/              # Immutable state & history management
│       ├── drawingReducer.ts # Pure reducer with 100-level past/present/future history stack & group transforms
│       └── drawingContext.tsx# React context provider and hook
├── features/
│   ├── canvas/             # SVG Canvas & Layered Rendering Pipeline
│   │   ├── DrawingCanvas.tsx    # Interactive SVG surface with pointer capture & gesture management
│   │   ├── ShapeRenderer.tsx    # Memoized committed shapes with pass-through hollow drawing
│   │   ├── DraftPreview.tsx     # High-contrast live dashed preview for all shape primitives
│   │   ├── SelectionOverlay.tsx # Figma-style 8-handle bounding box, top rotation handle & 15° snap
│   │   ├── DimensionBadge.tsx   # Floating dimension badges (live & persistent)
│   │   ├── GridLayer.tsx        # Viewport-aware scalable CAD grid
│   │   └── SnapIndicator.tsx    # Magnetic snap target badge & orthogonal alignment guides
│   ├── toolbar/            # Toolbars (Collapsible CAD tools, Viewport, Undo/Redo, Footer Export)
│   ├── inspector/          # Collapsible Property Inspector for coordinate & styling edits
│   ├── statusbar/          # Real-time coordinate readout (X, Y), counters, and embedded Export menu
│   └── theme/              # Light / Dark mode toggle
└── tests/                  # Exhaustive Vitest unit test suite (31 tests passing 100%)
```

---

## 📐 Mathematical Foundations

### 1. Coordinate Systems & Matrix Transformations
Raw screen events $(x_s, y_s)$ are projected into the infinite SVG world space $(x_w, y_w)$ via the browser's Current Transformation Matrix:
$$P_w = M_{\text{CTM}}^{-1} \cdot P_s$$

Given viewport pan $(T_x, T_y)$ and zoom scale $S$:
$$x_w = \frac{x_s - T_x}{S}, \qquad y_w = \frac{y_s - T_y}{S}$$

### 2. Cursor-Anchored Zoom
Zooming keeps the exact world point directly beneath the user's cursor invariant:
$$T_x' = x_s - (x_s - T_x) \cdot \frac{S'}{S}$$
$$T_y' = y_s - (y_s - T_y) \cdot \frac{S'}{S}$$

### 3. Rotation-Aware Coordinate Snapping
When shapes are rotated by angle $\theta$ around their centroid $C$, snap vertices (endpoints, corners, midpoints, quadrants) are extracted via 2D rotation matrix:
$$P_{\text{rotated}} = \begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix} (P - C) + C$$

### 4. Rigid Group Centroid Rotation
When rotating a multi-selection or group of shapes around the collective centroid $C_{\text{group}}$, every coordinate rotates rigidly without scattering connected vertices:
$$P' = \text{rotatePoint}(P, C_{\text{group}}, \Delta\theta)$$

### 5. Line-Line Intersections & Segment Projections
- **Intersection Point** $(x_I, y_I)$ between two segments $P_1P_2$ and $P_3P_4$:
  $$d = (x_2 - x_1)(y_4 - y_3) - (y_2 - y_1)(x_4 - x_3)$$
  $$u = \frac{(x_3 - x_1)(y_4 - y_3) - (y_3 - y_1)(x_4 - x_3)}{d}, \quad v = \frac{(x_3 - x_1)(y_2 - y_1) - (y_3 - y_1)(x_2 - x_1)}{d}$$
- **Edge Projection (Snap to Line Segment)**:
  $$P_{\text{proj}} = A + \operatorname{clamp}\left(\frac{(P - A) \cdot (B - A)}{\|B - A\|^2}, 0, 1\right)(B - A)$$

---

## 🎨 Feature Matrix

| Feature | Description | Status |
|---|---|:---:|
| **7 Vector Shape Tools** | Line, Arrow, Rectangle, Circle, Ellipse, Polygon/Triangle, Star | ✅ Complete |
| **Live Dimensions** | Real-time length + angle, width × height, radius, diameter updating with cursor | ✅ Complete |
| **Figma-Style Selection** | 8 corner/edge resize handles, top rotation stem, 15° Shift-snap, marquee box select | ✅ Complete |
| **Multi-Object Grouping** | Group (`Ctrl+G`), Ungroup (`Ctrl+Shift+G`), and unified multi-object move/rotate | ✅ Complete |
| **CAD Snapping Engine** | Rotation-aware magnetic snapping: `ENDPOINT`, `CORNER`, `MIDPOINT`, `CENTROID`, `EDGE`, `INTERSECTION`, `PERPENDICULAR`, `GRID` | ✅ Complete |
| **Pass-Through Hollow Drawing** | Draw inside, across, or from within hollow shapes without blocking | ✅ Complete |
| **Embedded Footer Export** | Export PNG (2x retina), SVG Vector, JSON Schema directly in footer bar | ✅ Complete |
| **JSON Export & Import** | Specification-compliant schema with clean internal ID stripping & Zod validation | ✅ Complete |
| **Full Undo / Redo** | Immutable 100-step history stack (`Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`) | ✅ Complete |
| **Pan & Zoom** | Non-passive wheel zoom anchored at cursor, Middle-click pan, Space+drag pan | ✅ Complete |
| **Theme System** | Dark Mode (White default stroke `#f8fafc`) & Light Mode (Black default stroke `#0f172a`) | ✅ Complete |
| **Property Inspector** | Numeric inputs for coordinates, dimensions, rotation degrees, stroke styling | ✅ Complete |

---

## 📄 JSON Export / Import Schema

Exported JSON conforms exactly to the specification format:

```json
{
  "shapes": [
    { "type": "line", "x1": 40, "y1": 60, "x2": 220, "y2": 140, "strokeColor": "#f8fafc", "strokeWidth": 1.5 },
    { "type": "rectangle", "x": 80, "y": 200, "width": 150, "height": 90, "strokeColor": "#f8fafc", "strokeWidth": 1.5 },
    { "type": "circle", "cx": 400, "cy": 150, "r": 60, "strokeColor": "#f8fafc", "strokeWidth": 1.5 },
    { "type": "polygon", "cx": 250, "cy": 250, "r": 80, "sides": 3, "strokeColor": "#f8fafc", "strokeWidth": 1.5 }
  ]
}
```

---

## ⌨️ Keyboard Shortcuts & Gestures

| Key / Gesture | Action |
|---|---|
| `V` | Select & Move Tool |
| `L` | Line Tool |
| `A` | Arrow Tool |
| `R` | Rectangle Tool |
| `C` | Circle Tool |
| `E` | Ellipse Tool |
| `T` | Triangle / Polygon Tool |
| `S` | Star Tool |
| `H` | Pan Canvas Tool |
| `Space + Drag` | Pan Canvas Viewport |
| `Middle Mouse Click` | Pan Canvas Viewport |
| `Mouse Wheel` | Cursor-Anchored Zoom In / Out |
| `Ctrl / ⌘ + G` | Group Selected Objects |
| `Ctrl / ⌘ + Shift + G` | Ungroup Selected Objects |
| `Ctrl / ⌘ + D` | Duplicate Selected Objects |
| `Ctrl / ⌘ + Z` | Undo Last Action |
| `Ctrl / ⌘ + Shift + Z` or `Ctrl + Y` | Redo Action |
| `Delete` / `Backspace` | Delete Selected Shape |
| `Escape` | Cancel Active Draft / Deselect Shape |

---

## 🧪 Unit Testing

Run the Vitest test suite with:
```bash
bun run test
```

Test coverage includes:
- **Geometry Metrics**: Line length, angle, midpoint, rectangle drag normalization, circle metrics, polygon & star vertices.
- **Analytical Hit-Testing**: Point-to-segment distance, ray-casting polygon testing, ellipse containment, rotation-aware hit-testing.
- **Transformations**: Screen-to-world inversion, cursor-anchored zoom invariants.
- **Snapping**: Grid snap, rotation-transformed key vertices, perpendicular alignment guides, line-line intersections.
- **Drawing Reducer**: State transitions, drafting, moving, deleting, layering, rigid group centroid rotation, and multi-step undo/redo stack.
- **Serialization**: Schema validation and corrupted file rejection.

---

## 💡 Known Limitations & Future Roadmap
- **Path / Pen Tool**: Freehand Bezier curves with control point manipulation.
- **Real-Time Multi-User Collaboration**: Live multi-cursor drawing synchronization via WebSockets / CRDTs.
- **Boolean Operations**: Path subtraction, union, and intersection algorithms.
