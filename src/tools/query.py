"""
query_drawing tool implementation.
Inspects drawing state, extracts geometry JSON, calculates bounding boxes, and audits statistics.
Read-only inspection tool for self-verification loop.
Coordinates: millimeters (mm), Y-up Cartesian system.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from fastmcp.tools import ToolResult
import mcp.types as types

from src.tools.session import DrawingSession


def execute_query_drawing(
    session: DrawingSession,
    filter_type: Optional[str] = None,
    filter_layer: Optional[str] = None,
    filter_color: Optional[int] = None,
    include_geometry: bool = True,
    calculate_bounds: bool = True,
    audit_stats: bool = True,
) -> ToolResult:
    """
    Executes inspection query on current modelspace entities.
    """
    try:
        res = session.backend.query(
            filter_type=filter_type,
            filter_layer=filter_layer,
            filter_color=filter_color,
            include_geometry=include_geometry,
            calculate_bounds=calculate_bounds,
        )

        matched_count = len(res.entities)
        layers_summary = ", ".join(f"{k}: {v}" for k, v in res.counts_by_layer.items()) or "none"
        types_summary = ", ".join(f"{k}: {v}" for k, v in res.counts_by_type.items()) or "none"

        bounds_text = "N/A"
        if res.bounding_box:
            b = res.bounding_box
            bounds_text = (
                f"[{b['min_x']}, {b['min_y']}] to [{b['max_x']}, {b['max_y']}] "
                f"({b['width']}mm x {b['height']}mm)"
            )

        summary_text = (
            f"Drawing Inspection Summary:\n"
            f"• Matched entities: {matched_count} (Total in drawing: {res.stats.entity_count})\n"
            f"• By Layer: {layers_summary}\n"
            f"• By Type: {types_summary}\n"
            f"• Query Bounding Box: {bounds_text}\n"
            f"• Layers Defined: {res.stats.layer_count}, Blocks Defined: {res.stats.block_count}\n"
            f"• Coordinate System: Millimeters (mm), Y-up, Origin (0,0)\n"
            f"Full entity geometry details available in structuredContent."
        )

        structured_data = {
            "status": "success",
            "matched_count": matched_count,
            "counts_by_layer": res.counts_by_layer,
            "counts_by_type": res.counts_by_type,
            "bounding_box": res.bounding_box,
            "drawing_stats": {
                "total_entities": res.stats.entity_count,
                "total_layers": res.stats.layer_count,
                "total_blocks": res.stats.block_count,
                "overall_bounds": res.stats.bounds,
                "dxf_version": res.stats.dxf_version,
                "units": res.stats.units,
            },
            "entities": res.entities,
        }

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content=structured_data,
        )

    except Exception as ex:
        return ToolResult(
            content=[types.TextContent(type="text", text=f"Query drawing failed: {str(ex)}")],
            structured_content={"status": "error", "message": str(ex)},
            is_error=True,
        )
