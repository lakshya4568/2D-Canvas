"""
manage_layers tool implementation.
Batch management for CAD layers: create, rename, delete, set_visibility, list.
Units: millimeters (mm), Y-up Cartesian system.
"""

from __future__ import annotations

from typing import Any, Dict, List
from fastmcp.tools import ToolResult
import mcp.types as types

from src.cad_backend.base import LayerInfo, LayerOp
from src.tools.models import CADToolError, LayerOperationInput
from src.tools.session import DrawingSession


def execute_manage_layers(
    session: DrawingSession,
    operations: List[LayerOperationInput],
) -> ToolResult:
    """
    Executes batch layer management operations.
    """
    is_mutating = any(op.action != "list" for op in operations)
    pre_snapshot = session.snapshot()

    ops = [
        LayerOp(
            action=op.action,
            name=op.name,
            new_name=op.new_name,
            color=op.color,
            linetype=op.linetype,
            is_visible=op.is_visible,
            is_locked=op.is_locked,
            force=op.force,
        )
        for op in operations
    ]

    try:
        raw_results = session.backend.manage_layers(ops)

        if is_mutating and len(operations) > 0:
            session.record_undo_snapshot(pre_snapshot)

        formatted_results = []
        for r in raw_results:
            if isinstance(r, LayerInfo):
                formatted_results.append({
                    "name": r.name,
                    "color": r.color,
                    "linetype": r.linetype,
                    "is_visible": r.is_visible,
                    "is_locked": r.is_locked,
                    "entity_count": r.entity_count,
                })
            else:
                formatted_results.append(r)

        summary_text = (
            f"Successfully executed {len(operations)} layer operation(s). "
            f"Drawing now has {len(session.backend.doc.layers)} layer(s)."
        )

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content={
                "status": "success",
                "operations_count": len(operations),
                "layers": formatted_results,
            },
        )

    except Exception as ex:
        if is_mutating:
            session.restore_snapshot(pre_snapshot)

        err_payload = CADToolError(
            status="error",
            error_code="LAYER_OPERATION_FAILED",
            message=str(ex),
            rolled_back=is_mutating,
        ).model_dump()

        summary_text = f"Layer operation failed: {str(ex)}. " + (
            "Changes rolled back." if is_mutating else ""
        )

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content=err_payload,
            is_error=True,
        )
