"""
transform_entities tool implementation.
Batch geometric transformations: move, rotate, scale, copy, mirror, offset, fillet, chamfer.
Coordinates: millimeters (mm), Y-up Cartesian system.
"""

from __future__ import annotations

from typing import Any, Dict, List
from fastmcp.tools import ToolResult
import mcp.types as types

from src.cad_backend.base import TransformOp
from src.tools.models import CADToolError, TransformOperationInput
from src.tools.session import DrawingSession


def execute_transform_entities(
    session: DrawingSession,
    operations: List[TransformOperationInput],
) -> ToolResult:
    """
    Executes batch transformations on existing entities.
    """
    pre_snapshot = session.snapshot()

    ops = [
        TransformOp(
            op_type=op.op_type,
            handles=op.handles,
            params=op.params,
        )
        for op in operations
    ]

    try:
        results = session.backend.transform_entities(ops)

        success_count = sum(1 for r in results if r.status == "success")
        fail_count = sum(1 for r in results if r.status == "failed")

        if success_count > 0:
            session.record_undo_snapshot(pre_snapshot)
        else:
            session.restore_snapshot(pre_snapshot)

        summary_parts = [f"{success_count} succeeded"]
        if fail_count > 0:
            summary_parts.append(f"{fail_count} failed")

        summary_text = (
            f"Executed {len(operations)} transform operation(s) across {len(results)} target(s): "
            f"{', '.join(summary_parts)}."
        )

        overall_status = "success" if fail_count == 0 else ("failed" if success_count == 0 else "partial_success")
        is_error = fail_count > 0 and success_count == 0

        structured_data = {
            "status": overall_status,
            "operations_count": len(operations),
            "total_targets": len(results),
            "success_count": success_count,
            "failure_count": fail_count,
            "results": [
                {
                    "handle": r.handle,
                    "op_type": r.op_type,
                    "status": r.status,
                    "new_handle": r.new_handle,
                    "error": r.error,
                }
                for r in results
            ],
        }

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content=structured_data,
            is_error=is_error,
        )

    except Exception as ex:
        session.restore_snapshot(pre_snapshot)

        err_payload = CADToolError(
            status="error",
            error_code="TRANSFORM_FAILED",
            message=str(ex),
            rolled_back=True,
        ).model_dump()

        summary_text = f"Transformation failed: {str(ex)}. Drawing rolled back to pre-batch state."

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content=err_payload,
            is_error=True,
        )
