"""
UPCE CAD FastMCP Server.
Production-grade Model Context Protocol server exposing 7 unified 2D CAD engineering tools.
Designed for Claude Desktop, Claude Code, and Cursor via STDIO transport.
All coordinates use millimeters (mm), Y-up Cartesian system, with origin (0,0) at bottom-left.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastmcp import FastMCP
from fastmcp.tools import ToolResult

from src.tools.blocks import execute_manage_blocks
from src.tools.draw import execute_draw_entities
from src.tools.layers import execute_manage_layers
from src.tools.models import EntityInput, LayerOperationInput, TransformOperationInput
from src.tools.query import execute_query_drawing
from src.tools.render import execute_render_preview
from src.tools.session import DrawingSession
from src.tools.session_ops import execute_manage_session
from src.tools.transform import execute_transform_entities

# ---------------------------------------------------------------------------
# Logging Setup (Strictly to rotating file and stderr to protect STDIO transport)
# ---------------------------------------------------------------------------
logs_dir = Path("logs")
logs_dir.mkdir(parents=True, exist_ok=True)
log_file = logs_dir / "cad_mcp.log"

logger = logging.getLogger("cad_mcp")
logger.setLevel(logging.INFO)

file_handler = RotatingFileHandler(
    log_file, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
)
formatter = logging.Formatter(
    '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "module": "%(module)s", "message": "%(message)s"}'
)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# ---------------------------------------------------------------------------
# Session & Server Initialization
# ---------------------------------------------------------------------------
session = DrawingSession(config_path="config.json")

mcp = FastMCP(
    name="upce-cad-mcp",
    instructions=(
        "Production-grade 2D CAD drafting and engineering geometry server. "
        "Units: millimeters (mm). Coordinates: 2D Cartesian Y-up, origin (0,0) at bottom-left. "
        "Best practice verification loop: (1) describe intent, (2) call draw_entities or transform_entities, "
        "(3) query_drawing to inspect generated geometry & bounding boxes, "
        "(4) render_preview to visually verify layout and clearances, (5) correct if needed, "
        "(6) manage_session to export DXF/PDF."
    ),
)


# ---------------------------------------------------------------------------
# Tool 1: draw_entities
# ---------------------------------------------------------------------------
@mcp.tool(
    name="draw_entities",
    description=(
        "Batch-create 2D CAD engineering entities. Call this whenever adding new lines, circles, "
        "arcs, rectangles, polylines, splines, text, dimensions, or hatches. "
        "Units: millimeters (mm). Coordinate system: Y-up Cartesian, origin (0,0) at bottom-left. "
        "Supports compact batching of multiple entities in one call. Set allow_duplicates=False (default) "
        "for idempotent deduplication against existing geometry. "
        "Always follow drawing operations with query_drawing and render_preview to verify geometry."
    ),
)
def draw_entities(
    entities: List[EntityInput],
    allow_duplicates: bool = False,
) -> ToolResult:
    logger.info(f"draw_entities called with {len(entities)} specs, allow_duplicates={allow_duplicates}")
    return execute_draw_entities(session, entities, allow_duplicates=allow_duplicates)


# ---------------------------------------------------------------------------
# Tool 2: manage_layers
# ---------------------------------------------------------------------------
@mcp.tool(
    name="manage_layers",
    description=(
        "Batch-manage CAD layers (create, list, rename, delete, set_visibility). "
        "Call this to establish drawing layer standards (e.g. 'OUTLINE', 'CENTERLINE', 'DIMENSIONS') "
        "or to toggle layer visibility and lock states. "
        "Units: millimeters (mm), Y-up coordinate system."
    ),
)
def manage_layers(
    operations: List[LayerOperationInput],
) -> ToolResult:
    logger.info(f"manage_layers called with {len(operations)} operations")
    return execute_manage_layers(session, operations)


# ---------------------------------------------------------------------------
# Tool 3: manage_blocks
# ---------------------------------------------------------------------------
@mcp.tool(
    name="manage_blocks",
    description=(
        "Manage CAD block definitions, batch insertions, audits, and attribute inspection/modification. "
        "Call this to define reusable parametric symbols (e.g. standard fastener, title block stamp) "
        "and place them at multiple coordinate positions with rotation and scaling. "
        "Units: millimeters (mm), Y-up coordinate system."
    ),
)
def manage_blocks(
    action: Literal["create", "insert", "list", "audit", "read_attributes", "write_attributes"],
    name: Optional[str] = None,
    base_point: Optional[List[float]] = None,
    entity_handles: Optional[List[str]] = None,
    insertions: Optional[List[Dict[str, Any]]] = None,
    attributes: Optional[Dict[str, str]] = None,
    insert: Optional[List[float]] = None,
    rotation: float = 0.0,
    scale: float = 1.0,
) -> ToolResult:
    logger.info(f"manage_blocks called: action='{action}', name='{name}'")
    return execute_manage_blocks(
        session,
        action=action,
        name=name,
        base_point=base_point,
        entity_handles=entity_handles,
        insertions=insertions,
        attributes=attributes,
        insert=insert,
        rotation=rotation,
        scale=scale,
    )


# ---------------------------------------------------------------------------
# Tool 4: transform_entities
# ---------------------------------------------------------------------------
@mcp.tool(
    name="transform_entities",
    description=(
        "Batch geometric transformations: move, rotate, scale, copy, mirror, offset, fillet, chamfer. "
        "Call this to reposition, duplicate, bevel, or reflect existing entities referenced by handle. "
        "Units: millimeters (mm), angles in degrees counterclockwise, Y-up coordinate system. "
        "Mutations are tracked on the undo stack."
    ),
)
def transform_entities(
    operations: List[TransformOperationInput],
) -> ToolResult:
    logger.info(f"transform_entities called with {len(operations)} operations")
    return execute_transform_entities(session, operations)


# ---------------------------------------------------------------------------
# Tool 5: query_drawing (Read-Only)
# ---------------------------------------------------------------------------
@mcp.tool(
    name="query_drawing",
    annotations={"read_only_hint": True},
    description=(
        "Inspect active drawing entities, filter by type/layer/color, extract exact geometry JSON, "
        "calculate bounding boxes, and audit drawing statistics. "
        "Call this as part of the self-verification loop immediately after drawing to confirm "
        "entity coordinates, clearances, spans, and extents before exporting. "
        "Read-only tool: does not modify drawing state. Units: millimeters (mm), Y-up coordinate system."
    ),
)
def query_drawing(
    filter_type: Optional[str] = None,
    filter_layer: Optional[str] = None,
    filter_color: Optional[int] = None,
    include_geometry: bool = True,
    calculate_bounds: bool = True,
    audit_stats: bool = True,
) -> ToolResult:
    logger.info(f"query_drawing called: type={filter_type}, layer={filter_layer}")
    return execute_query_drawing(
        session,
        filter_type=filter_type,
        filter_layer=filter_layer,
        filter_color=filter_color,
        include_geometry=include_geometry,
        calculate_bounds=calculate_bounds,
        audit_stats=audit_stats,
    )


# ---------------------------------------------------------------------------
# Tool 6: manage_session
# ---------------------------------------------------------------------------
@mcp.tool(
    name="manage_session",
    description=(
        "Manage drawing session lifecycle, file persistence, diagnostics, and transactional undo/redo. "
        "Actions: 'new' (blank drawing), 'open' (load DXF), 'save'/'export' (write DXF or PDF), "
        "'close' (reset session), 'undo' (revert last change), 'redo' (reapply), 'diagnostics' (health). "
        "Paths are sandboxed within the configured output directory. Units: millimeters (mm), Y-up."
    ),
)
def manage_session(
    action: Literal["new", "open", "save", "export", "close", "undo", "redo", "diagnostics", "snapshot"],
    filepath: Optional[str] = None,
    export_format: str = "dxf",
    units: str = "mm",
    dxf_version: str = "R2010",
) -> ToolResult:
    logger.info(f"manage_session called: action='{action}', file='{filepath}'")
    return execute_manage_session(
        session,
        action=action,
        filepath=filepath,
        export_format=export_format,
        units=units,
        dxf_version=dxf_version,
    )


# ---------------------------------------------------------------------------
# Tool 7: render_preview (Read-Only)
# ---------------------------------------------------------------------------
@mcp.tool(
    name="render_preview",
    annotations={"read_only_hint": True},
    description=(
        "Render the current CAD modelspace to a high-resolution PNG image and return it as an image block. "
        "CRITICAL FOR SELF-VERIFICATION: Always invoke this tool after drafting or transforming "
        "to visually verify dimension lines, title blocks, clearances, and aesthetic alignment. "
        "Read-only tool: does not modify drawing state. Units: millimeters (mm), Y-up coordinate system."
    ),
)
def render_preview(
    width_px: int = 1280,
    height_px: int = 720,
    background: Literal["white", "dark"] = "white",
    show_grid: bool = False,
) -> ToolResult:
    logger.info(f"render_preview called: {width_px}x{height_px}, bg={background}")
    return execute_render_preview(
        session,
        width_px=width_px,
        height_px=height_px,
        background=background,
        show_grid=show_grid,
    )


def main():
    """Server entrypoint for stdio transport."""
    logger.info("Starting UPCE CAD FastMCP Server over STDIO transport")
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
