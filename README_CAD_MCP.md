# UPCE Production-Grade 2D CAD FastMCP Server

A production-grade **Model Context Protocol (MCP) server** enabling LLM clients (**Claude Desktop**, **Claude Code**, **Cursor**) to create, inspect, modify, and export precision 2D CAD engineering drawings through natural language.

Built with **FastMCP** over **STDIO transport** with a headless **`ezdxf`** backend and an extensible **`CADBackend` / `BackendAdapter`** abstraction layer.

---

## 1. System Architecture Diagram

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
│  │ • Entity Batch Caps   │  │ • 50-Step Atomic Rollback / Redo       │  │
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
│  + new_document(dxf_version, units) -> None                             │
│  + load_document(source) -> None                                        │
│  + save_document(path, fmt) -> str                                      │
│  + export_snapshot() -> str                                             │
│  + import_snapshot(data) -> None                                        │
│  + create_entities(specs, allow_duplicates) -> list[EntityResult]       │
│  + transform_entities(operations) -> list[TransformResult]             │
│  + manage_layers(operations) -> list[LayerInfo | dict]                  │
│  + manage_blocks(action, **kwargs) -> dict                              │
│  + query(filters...) -> QueryResult                                     │
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

## 2. Tool Reference Table

All tools assume coordinates and dimensions in **millimeters (mm)**, **2D Cartesian Y-up**, with origin `(0,0)` at bottom-left.

| Tool Name | Type | Key Operations / Parameters | Description & Best Practice When to Call |
| :--- | :--- | :--- | :--- |
| `draw_entities` | Mutating | `entities: list[EntityInput]`, `allow_duplicates: bool = False` | Batch-creates lines, circles, arcs, rectangles, polylines, splines, text, dimensions, and hatches. Default deduplication prevents duplicate primitives on repeat calls. |
| `manage_layers` | Mutating / Query | `operations: list[LayerOperationInput]` (actions: `create`, `rename`, `delete`, `set_visibility`, `list`) | Establishes discipline layers (`OUTLINE`, `CENTERLINE`, `DIMENSIONS`), renames layers with entity reassignment, toggles freeze/lock. |
| `manage_blocks` | Mutating / Query | `action: str` (`create`, `insert`, `list`, `audit`, `read_attributes`, `write_attributes`) | Creates reusable symbol definitions, places batch block references at specified coordinates with rotation/scaling, and inspects/updates attributes. |
| `transform_entities`| Mutating | `operations: list[TransformOperationInput]` (`move`, `rotate`, `scale`, `copy`, `mirror`, `offset`, `fillet`, `chamfer`) | Applies geometric transforms to existing entities by handle. Automatically records pre-transform snapshot for undo. |
| `query_drawing` | **Read-Only** | `filter_type`, `filter_layer`, `filter_color`, `include_geometry`, `calculate_bounds` | Extracts JSON entity geometry, modelspace bounds, layer counts, and drawing statistics. Crucial first step of self-verification loop. |
| `manage_session` | Mutating / Query | `action` (`new`, `open`, `save`, `export`, `close`, `undo`, `redo`, `diagnostics`), `filepath`, `export_format` | Controls lifecycle, sandboxed file saving (DXF, PDF), transactional 50-step undo/redo, and runtime engine health diagnostics. |
| `render_preview` | **Read-Only** | `width_px`, `height_px`, `background: "white"\|"dark"`, `show_grid: bool` | Generates high-resolution PNG image content block for LLM visual self-inspection and alignment checking before final delivery. |

---

## 3. The Self-Verification Loop Protocol

To ensure 100% precision without human intervention, the server is designed for a closed loop:

```
1. Describe Intent   ──► 2. draw_entities (batch)
                                │
                                ▼
                         3. query_drawing [read-only]
                            (verify bounds, clearances & entity counts)
                                │
                                ▼
                         4. render_preview [read-only]
                            (inspect visual PNG for overlap / aesthetic)
                                │
                 ┌──────────────┴──────────────┐
                 ▼ (if corrections needed)     ▼ (if verified)
          5a. transform_entities        5b. manage_session(save)
              or undo & redraft             -> DXF / PDF Artifact
```

---

## 4. Quickstart

### Prerequisites
- Python 3.10+ (tested on Python 3.11 / 3.12)
- `uv` package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)

### Installation & Test Suite
```bash
# 1. Sync dependencies with uv
uv sync --all-extras

# 2. Run test suite (16 tests covering all primitives, batching, undo, and DXF round-trips)
uv run pytest tests/test_mcp_server.py tests/test_mcp_edge_cases.py -v

# 3. Run autonomous end-to-end pipeline demo
uv run python scripts/demo_cad_mcp.py
```

### Running the Server
```bash
# Run over STDIO transport
uv run python -m server

# Or via FastMCP CLI
uv run fastmcp run server.py
```

---

## 5. Client Registration Snippets

### Claude Desktop (`claude_desktop_config.json`)
Add the following to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "cad": {
      "command": "uv",
      "args": [
        "run",
        "--directory",
        "/Users/proximus/Documents/Aagento Systems/2D Canvas",
        "python",
        "-m",
        "server"
      ]
    }
  }
}
```

### Claude Code (`.mcp.json`)
Save in your project root or workspace as `.mcp.json`:

```json
{
  "mcpServers": {
    "cad": {
      "command": "uv",
      "args": [
        "run",
        "python",
        "-m",
        "server"
      ]
    }
  }
}
```

---

## 6. Natural Language Prompt Examples

### Example 1: Title Block & Revision Table
> *"Draw a standard ISO title block 180x277 mm at the origin with a 5mm inner margin. At the top, add a 6-column revision table (REV, ZONE, DESCRIPTION, DATE, APPROVED, REMARKS) with row height 10mm. At the bottom, add a title box with project name 'UPCE CAD ENGINE' and drawing title 'ASSEMBLY DRAWING'. Query the bounds and render a preview."*

### Example 2: Precision Bolt Pattern
> *"Draw a bolt circle pattern: create 8 circles of radius 4mm equispaced on a 60mm diameter pitch circle centered at (100, 100). Add horizontal and vertical centerlines through the hub, an inner bore of diameter 30mm, and an outer flange rim of diameter 80mm. Add a linear dimension for the pitch circle diameter, query the drawing, and export to DXF."*

### Example 3: Parametric Transformation & Undo
> *"Move all entities on layer 'OUTLINE' by dx=50, dy=0. Mirror the entire assembly across the vertical axis x=100 keeping the original. Render a preview to verify the layout, and if it exceeds the sheet margins, undo the mirror."*

---

## 7. Swappable Backend (`CADBackend` / `BackendAdapter` ABC)

The server enforces clean architectural separation between MCP tool contracts and the geometric execution engine. To add a **FreeCAD RPC** or **AutoCAD Windows COM** backend:

1. Create a subclass in `src/cad_backend/` extending `CADBackend` (`src/cad_backend/base.py`).
2. Implement the required interface methods (`new_document`, `save_document`, `create_entities`, `transform_entities`, `manage_layers`, `manage_blocks`, `query`, `render_png`).
3. Point `DrawingSession.backend` to your adapter. None of the MCP tools require modification.

---

## 8. License & Governance

- Zero GPL/AGPL dependencies (passes `bun run license:scan`).
- Pure MIT licensed dependencies (`fastmcp`, `ezdxf`, `matplotlib`, `pydantic`).
- Strictly zero LLM geometric authority: all geometry is deterministically calculated and validated through the CAD backend kernel.
