# Architecture Design Document: Production-Grade Unified Parametric 2D CAD MCP Server

**Version:** 1.0.0  
**Status:** Approved for Implementation  
**Standard:** FastMCP (Python 3.10+) / Model Context Protocol (STDIO Transport)  
**Backend:** Headless `ezdxf` with modular `CADBackend` / `BackendAdapter` ABC  
**License Compliance:** Strict MIT / Apache-2.0 (Zero GPL/AGPL dependencies)  

---

## 1. System Context & Reference Synthesis

Existing CAD MCP implementations suffer from three critical bottlenecks:
1. **Tool Flooding (Context Exhaustion):** Servers exposing one tool per CAD command (50+ tools) overwhelm LLM tool-selection heuristics and burn context tokens. *Solution (multiCAD-mcp pattern):* 7 unified tools accepting batch operation arrays with shorthand parameter schemas.
2. **The Perception Gap (Blind Mutation):** LLMs cannot visually evaluate CAD geometry or verify dimension placements without closing the loop. *Solution (Onshape FeatureScript pattern):* A closed self-verification loop combining deep JSON geometry inspection (`query_drawing`) and rendered raster visual feedback (`render_preview`).
3. **OS / Vendor Lock-in:** COM bridges require Windows and live AutoCAD licenses. *Solution (Headless ezdxf + Backend ABC):* Cross-platform, deterministic, headless execution with a swappable `CADBackend` interface enabling future FreeCAD RPC or AutoCAD COM drivers without modifying tool contracts.

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      LLM Client (Desktop / IDE)                         │
│               Claude Desktop / Cursor / Claude Code                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ STDIO JSON-RPC Transport
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               FastMCP CAD Server (src/server.py)                        │
│                                                                         │
│  ┌───────────────────────┐  ┌────────────────────────────────────────┐  │
│  │ Security & Config     │  │ Session & Undo Manager                 │  │
│  │ • Path Sandboxing     │  │ • In-Memory Document State             │  │
│  │ • Traversal Defense   │  │ • In-Memory DXF Snapshot Stack         │  │
│  │ • Entity Batch Caps   │  │ • Atomic Batch Rollback / Redo         │  │
│  └───────────────────────┘  └────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Unified Tool Surface                         │  │
│  │  1. draw_entities       (batch entity creation & dedup)           │  │
│  │  2. manage_layers       (batch layer lifecycle & visibility)      │  │
│  │  3. manage_blocks       (definitions, batch inserts, attributes)  │  │
│  │  4. transform_entities  (move/rotate/scale/mirror/fillet/chamfer) │  │
│  │  5. query_drawing       [readOnly] (stats, JSON geometry, bounds) │  │
│  │  6. manage_session      (new/open/save/export/undo/diagnostics)   │  │
│  │  7. render_preview      [readOnly] (raster PNG visual feedback)   │  │
│  └───────────────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              CADBackend Abstraction Layer (src/cad_backend/)            │
│                 <<Abstract Base Class / Protocol>>                      │
│                                                                         │
│  + new_drawing(dxf_version, units) -> None                              │
│  + open_drawing(stream_or_path) -> None                                 │
│  + save_drawing(path) -> None                                           │
│  + get_snapshot() -> bytes / str                                        │
│  + restore_snapshot(data) -> None                                       │
│  + add_entities(specs, allow_duplicates) -> list[EntityResult]          │
│  + transform_entities(operations) -> list[TransformResult]              │
│  + manage_layers(operations) -> list[LayerResult]                       │
│  + manage_blocks(action, **params) -> BlockResult                       │
│  + query_entities(filters) -> DrawingQueryReport                        │
│  + render_png(width, height, options) -> bytes                          │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
┌───────────────────────────────┐             ┌───────────────────────────┐
│     EzdxfBackend (Active)     │             │ Future Adapters (Plug-in) │
│ • Pure Python Headless Kernel │             │ • FreeCAD RPC Adapter     │
│ • DXF R2010 / R2018 native    │             │ • AutoCAD Windows COM     │
│ • Matplotlib Vector Renderer  │             │ • WebAssembly UPCE Kernel │
└───────────────────────────────┘             └───────────────────────────┘
```

---

## 3. Tool Surface & Parameter Schemas

All coordinates and dimensions use **millimeters (mm)**, **Y-up Cartesian system**, with origin $(0,0)$ at bottom-left.

### 3.1 `draw_entities`
- **When to call:** Draw geometric primitives in batch.
- **Deduplication:** When `allow_duplicates=False` (default), identical primitives on the same layer are deduplicated.
- **Supported types:**
  - `line`: `{"start": [x1, y1], "end": [x2, y2]}`
  - `circle`: `{"center": [cx, cy], "radius": r}`
  - `arc`: `{"center": [cx, cy], "radius": r, "start_angle": a1, "end_angle": a2}`
  - `rectangle`: `{"origin": [x, y], "width": w, "height": h, "fillet_radius": r?}`
  - `polyline`: `{"points": [[x, y], ...], "is_closed": bool}`
  - `spline`: `{"fit_points": [[x, y], ...]}`
  - `text`: `{"insert": [x, y], "text": str, "height": h, "rotation": deg?}`
  - `dimension`: `{"dim_type": "linear"|"aligned", "start": [x1, y1], "end": [x2, y2], "text_midpoint": [mx, my], "text": str?}`
  - `hatch`: `{"pattern_name": "ANSI31", "boundary_paths": [...], "scale": s?}`
- **Common attributes:** `layer: str = "0"`, `color: int?` (ACI 1-255), `linetype: str?`.

### 3.2 `manage_layers`
- **When to call:** Organize drawing structure, isolate disciplines (e.g. `OUTLINE`, `DIMENSIONS`, `CENTERLINE`).
- **Actions:**
  - `create`: `{"name": str, "color": int?, "linetype": str?}`
  - `rename`: `{"name": str, "new_name": str}`
  - `delete`: `{"name": str, "force": bool}`
  - `set_visibility`: `{"name": str, "is_visible": bool, "is_locked": bool?}`
  - `list`: Retrieve all layers with colors, visibility, and entity counts.

### 3.3 `manage_blocks`
- **When to call:** Define reusable component symbols (e.g., standard bolt, title block stamp) and insert them at scale.
- **Actions:**
  - `create`: Group existing handles or entity specs into named block with base point.
  - `insert`: Batch place block references at `[[x, y], ...]` with `rotation`, `scale`.
  - `list`: Return defined block names, insertion counts, and attribute tags.
  - `audit`: Check for unreferenced blocks or missing definitions.
  - `read_attributes` / `write_attributes`: Inspect or update block attribute values.

### 3.4 `transform_entities`
- **When to call:** Perform geometric modifications on existing elements.
- **Operations:**
  - `move`: `{"handles": [...], "dx": dx, "dy": dy}`
  - `rotate`: `{"handles": [...], "center": [cx, cy], "angle_deg": deg}`
  - `scale`: `{"handles": [...], "center": [cx, cy], "scale_factor": s}`
  - `copy`: `{"handles": [...], "dx": dx, "dy": dy}`
  - `mirror`: `{"handles": [...], "p1": [x1, y1], "p2": [x2, y2], "keep_original": bool}`
  - `offset`: `{"handles": [...], "distance": dist, "side": "left"|"right"}`
  - `fillet`: `{"handle_1": h1, "handle_2": h2, "radius": r}`
  - `chamfer`: `{"handle_1": h1, "handle_2": h2, "dist1": d1, "dist2": d2}`

### 3.5 `query_drawing` `[readOnlyHint: true]`
- **When to call:** Inspect existing state before drawing or verify geometry after mutations.
- **Parameters:** `filter_type`, `filter_layer`, `filter_color`, `include_geometry: bool = True`, `calculate_bounds: bool = True`.
- **Response:** Concise summary text in `content` (< 2KB), complete JSON hierarchy in `structuredContent`.

### 3.6 `manage_session`
- **When to call:** Initialize, save, reopen, undo/redo, or audit system health.
- **Actions:**
  - `new`: Blank drawing with specified standard units and DXF version.
  - `open`: Load DXF from disk (path-sanitized).
  - `save`: Commit drawing to DXF or PDF.
  - `close`: Reset memory session.
  - `undo` / `redo`: Step backwards or forwards in the transaction stack.
  - `diagnostics`: Return engine version, memory stats, backend status.

### 3.7 `render_preview` `[readOnlyHint: true]`
- **When to call:** Perform visual self-verification of the active drawing.
- **Parameters:** `width_px: int = 1280`, `height_px: int = 720`, `show_grid: bool = False`.
- **Response:** FastMCP `Image` block (PNG) + structured metadata (modelspace bounds, aspect ratio).

---

## 4. State & Transaction Model

1. **Stateful In-Memory Session (`DrawingSession`):**
   - Holds reference to active `CADBackend`.
   - Maintains `undo_stack: list[str]` and `redo_stack: list[str]` storing serialized DXF document snapshots.
2. **Atomic Batch Snapshotting:**
   - Prior to executing any mutating tool call (`draw_entities`, `transform_entities`, `manage_layers`), `session.snapshot()` serializes the document.
   - If any catastrophic failure occurs during the batch, the transaction rolls back cleanly to the snapshot, preserving drawing integrity.
3. **Undo / Redo Semantics:**
   - `undo` pops state from `undo_stack`, pushes current state to `redo_stack`, and restores backend document.
   - Any new mutating operation clears `redo_stack`.

---

## 5. Security & Path Sandboxing Model

1. **Path Traversal Defense:**
   - All input paths (`filepath`, `output_path`) are resolved against `config.json -> output_dir`.
   - Any path attempting directory traversal (`../`) outside the configured boundary raises `SecurityException` unless `allow_arbitrary_paths: true` is explicitly enabled in config.
2. **Denial-of-Service Caps:**
   - `max_entities_per_call: 500` enforces bounding on batch sizes.
   - `max_undo_steps: 50` prevents unbounded memory growth.

---

## 6. Structured Error Model (Partial-Failure Reporting)

Every tool failure returns a machine-readable JSON structure:

```json
{
  "status": "error",
  "error_code": "OPERATION_FAILED",
  "message": "Failed to create spline: fit points must have at least 2 distinct vertices",
  "failing_index": 3,
  "succeeded_count": 3,
  "completed_handles": ["2A", "2B", "2C"],
  "rolled_back": true
}
```

This tells the LLM precisely which operation failed in the batch, what succeeded beforehand, and whether the document rolled back to the pre-batch snapshot.

---

## 7. Self-Verification Loop Protocol

```
┌─────────────────────────────────────────────────────────────┐
│ 1. LLM Client interprets user intent                       │
│    (e.g., "draw 8-hole bolt pattern on 120mm circle")       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. LLM invokes `draw_entities` (batch)                      │
│    -> Server returns handles & concise summary              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Self-Inspection via `query_drawing`                      │
│    -> Verify bounding box, layer entity counts, radius      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Visual Inspection via `render_preview`                   │
│    -> Inspect rendered PNG for overlap or alignment errors  │
└──────────────────────────────┬──────────────────────────────┘
                               │
         ┌─────────────────────┴─────────────────────┐
         ▼ [If error detected]                       ▼ [If valid]
┌──────────────────────────────────┐        ┌──────────────────┐
│ 5a. Call `manage_session(undo)`  │        │ 5b. Save / Export│
│     or `transform_entities` to   │        │     Ready for    │
│     correct coordinates          │        │     user delivery│
└──────────────────────────────────┘        └──────────────────┘
```
