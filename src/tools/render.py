"""
render_preview tool implementation.
Renders the active modelspace to a PNG image for visual self-verification.
Returns an image content block so the LLM can visually inspect its drawings.
Coordinates: millimeters (mm), Y-up Cartesian system.
"""

from __future__ import annotations

import base64
from typing import Any, Dict
from fastmcp.tools import ToolResult
import mcp.types as types

from src.tools.session import DrawingSession


def execute_render_preview(
    session: DrawingSession,
    width_px: int = 1280,
    height_px: int = 720,
    background: str = "white",
    show_grid: bool = False,
) -> ToolResult:
    """
    Renders current CAD drawing into a PNG image for visual self-inspection.
    """
    try:
        png_bytes = session.backend.render_png(
            width_px=width_px,
            height_px=height_px,
            background=background,
            show_grid=show_grid,
        )

        b64_data = base64.b64encode(png_bytes).decode("ascii")

        # Query overall extents for summary
        q = session.backend.query(include_geometry=False, calculate_bounds=True)
        bounds = q.bounding_box or q.stats.bounds

        summary_text = (
            f"Rendered visual preview ({width_px}x{height_px} px, {background} background). "
            f"Drawing contains {q.stats.entity_count} entities across {q.stats.layer_count} layers. "
            f"Modelspace bounds: [{bounds.get('min_x', 0)}, {bounds.get('min_y', 0)}] to "
            f"[{bounds.get('max_x', 0)}, {bounds.get('max_y', 0)}] mm. "
            f"Inspect the attached image to visually verify alignments, clearances, and dimensions."
        )

        image_content = types.ImageContent(
            type="image",
            data=b64_data,
            mime_type="image/png",
        )

        return ToolResult(
            content=[
                types.TextContent(type="text", text=summary_text),
                image_content,
            ],
            structured_content={
                "status": "success",
                "width_px": width_px,
                "height_px": height_px,
                "background": background,
                "entity_count": q.stats.entity_count,
                "bounds": bounds,
            },
        )

    except Exception as ex:
        return ToolResult(
            content=[types.TextContent(type="text", text=f"Failed to render preview: {str(ex)}")],
            structured_content={"status": "error", "message": str(ex)},
            is_error=True,
        )
