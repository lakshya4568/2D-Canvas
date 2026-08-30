# 2D Canvas Studio — High-Performance Vector CAD Drawing System

> **A precision web-based 2D vector drawing workspace built with Next.js 16 (App Router), Bun, React 19, TypeScript, Tailwind CSS v4, Motion, and Raw SVG DOM with Zero External Drawing Libraries.**

---

## 🚀 Quick Start

### Prerequisites
- **Bun 1.3+** installed on your system.

### Installation & Development
```bash
# 1. Install dependencies
bun install

# 2. Run unit tests
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
│   │   ├── types.ts        # Source of truth for points, shapes, metrics, viewports
│   │   ├── metrics.ts      # Line length/angle, Rect normalization, Circle metrics, AABB bounds
│   │   ├── hitTest.ts      # Analytical point-to-segment distance & shape containment
│   │   ├── transform.ts    # Screen-to-SVG CTM transforms & cursor-anchored zoom math
│   │   └── snapping.ts     # Discrete grid snapping & CAD-grade vertex proximity snapping
│   ├── serialization/      # Lossless vector data import / export
│   │   ├── schema.ts       # Strict Zod schemas validating document payloads
│   │   ├── exportJson.ts   # ID-stripped specification-compliant JSON serializer
│   │   ├── importJson.ts   # Safe JSON parser with runtime error reporting
│   │   └── exportPng.ts    # 2x high-DPI offscreen SVG-to-Canvas rasterization
│   └── state/              # Immutable state & history management
│       ├── drawingReducer.ts # Pure reducer with 100-level past/present/future history stack
│       └── drawingContext.tsx# React context provider and hook
├── features/
│   ├── canvas/             # SVG Canvas & Layered Rendering Pipeline
│   │   ├── DrawingCanvas.tsx    # Interactive SVG surface with pointer capture
│   │   ├── ShapeRenderer.tsx    # Memoized committed shapes with custom stroke/fill
│   │   ├── DraftPreview.tsx     # High-contrast live dashed preview
│   │   ├── SelectionOverlay.tsx # Bounding box & transform handles
│   │   ├── DimensionBadge.tsx   # Floating dimension badges (live & persistent)
│   │   ├── GridLayer.tsx        # Viewport-aware scalable CAD grid
│   │   └── SnapIndicator.tsx    # Snapped vertex ring indicator
│   ├── toolbar/            # Toolbars (Tools, Viewport, Undo/Redo, Export/Import)
│   ├── inspector/          # Collapsible Property Inspector for coordinate & styling edits
│   ├── statusbar/          # Real-time coordinate readout (X, Y) & shape counters
│   └── theme/              # Light / Dark mode toggle
└── tests/                  # Exhaustive Vitest unit test suite (25 tests)
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

### 3. Shape Geometry & Live Dimension Calculations
- **Line Length & Angle**:
  $$L = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2} = \operatorname{hypot}(\Delta x, \Delta y)$$
  $$\theta = \left(\operatorname{atan2}(\Delta y, \Delta x) \cdot \frac{180}{\pi} + 360\right) \bmod 360$$
- **Rectangle Normalization (Supporting all 4 drag quadrants)**:
  $$x = \min(x_1, x_2), \quad y = \min(y_1, y_2)$$
  $$W = |x_2 - x_1|, \quad H = |y_2 - y_1|$$
- **Circle Center & Radius**:
  $$\text{Center } (cx, cy) = (x_1, y_1)$$
  $$R = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}, \quad D = 2R$$

### 4. Analytical Hit-Testing Math
To hit-test a line segment $AB$ against a click point $P$:
$$\vec{v} = B - A, \qquad \vec{w} = P - A$$
$$t = \operatorname{clamp}\left(\frac{\vec{w} \cdot \vec{v}}{\vec{v} \cdot \vec{v}}, 0, 1\right)$$
$$P_{\text{proj}} = A + t\vec{v}$$
$$\text{Hit condition: } \|P - P_{\text{proj}}\| \le \varepsilon_{\text{stroke}}$$

---

## 🎨 Feature Matrix

| Feature | Description | Status |
|---|---|:---:|
| **Core Shape Tools** | Line, Rectangle, Circle with click-drag-release interaction | ✅ Complete |
| **Live Dimensions** | Real-time length + angle, width × height, radius / diameter updating with cursor | ✅ Complete |
| **Selection & Manipulation** | Select by clicking shape or bounding box, drag-to-move in world space, delete | ✅ Complete |
| **JSON Export** | Specification-compliant schema with clean internal ID stripping | ✅ Complete |
| **JSON Import** | Upload and validate `.json` files via Zod with runtime error toasts | ✅ Complete |
| **PNG Export** | 2x high-resolution crisp offscreen rasterization to PNG download | ✅ Complete |
| **Full Undo / Redo** | Immutable 100-step past/present/future history stack (`Ctrl+Z`, `Ctrl+Shift+Z`) | ✅ Complete |
| **Snapping Engine** | Grid snapping and vertex/endpoint proximity locking with indicator ring | ✅ Complete |
| **Pan & Zoom** | Mouse-wheel zoom anchored at cursor, Middle-click pan, Space+drag pan | ✅ Complete |
| **Light & Dark Mode** | Instant theme toggle with dark OLED canvas and crisp light mode | ✅ Complete |
| **Property Inspector** | Direct numeric input editing for coordinates, dimensions, stroke colors/widths | ✅ Complete |
| **Layer Ordering** | Bring to Front and Send to Back depth ordering | ✅ Complete |
| **Persistent Dimensions** | Toggle to keep dimension badges visible on all committed shapes | ✅ Complete |

---

## 📄 JSON Export / Import Schema

Exported JSON conforms exactly to the required specification format:

```json
{
  "shapes": [
    { "type": "line", "x1": 40, "y1": 60, "x2": 220, "y2": 140 },
    { "type": "rectangle", "x": 80, "y": 200, "width": 150, "height": 90 },
    { "type": "circle", "cx": 400, "cy": 150, "r": 60 }
  ]
}
```

---

## ⌨️ Keyboard Shortcuts & Gestures

| Key / Gesture | Action |
|---|---|
| `V` | Select & Move Tool |
| `L` | Line Tool |
| `R` | Rectangle Tool |
| `C` | Circle Tool |
| `H` | Pan Canvas Tool |
| `Space + Drag` | Pan Canvas Viewport |
| `Middle Mouse Click` | Pan Canvas Viewport |
| `Mouse Wheel` | Cursor-Anchored Zoom In / Out |
| `Ctrl / ⌘ + Z` | Undo Last Action |
| `Ctrl / ⌘ + Shift + Z` or `Ctrl + Y` | Redo Action |
| `Delete` / `Backspace` | Delete Selected Shape |
| `Escape` | Cancel Active Draft / Deselect Shape |

---

## 🧪 Unit Testing

Run the test suite with:
```bash
bun run test
```

Test coverage includes:
- **Geometry Metrics**: Line length, angle, midpoint, rectangle drag normalization, circle metrics.
- **Analytical Hit-Testing**: Point-to-segment distance, bounding box containment, circle containment, z-index resolution.
- **Transformations**: Screen-to-world inversion, cursor-anchored zoom invariants.
- **Snapping**: Grid snap rounding and vertex proximity snapping.
- **Drawing Reducer**: State transitions, drafting, moving, deleting, layering, and multi-step undo/redo stack.
- **Serialization**: Schema validation and corrupted file rejection.

---

## 💡 Known Limitations & Future Roadmap
- **Multi-Shape Marquee Selection**: Rubber-band selection box to select and move multiple shapes simultaneously.
- **Rotation Transform**: Arbitrary angle rotation handles for rectangles and groups.
- **Path / Pen Tool**: Freehand Bezier curves with control point manipulation.
- **Real-Time Collaboration**: Multi-user concurrent drawing via WebSockets / CRDTs.
