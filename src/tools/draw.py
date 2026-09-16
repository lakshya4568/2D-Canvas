"""
draw_entities tool implementation.
Batch-creates 2D CAD entities with deduplication and partial-failure rollback.
Coordinates: millimeters (mm), Y-up Cartesian system.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple
from fastmcp.tools import ToolResult
import mcp.types as types

from src.cad_backend.base import BatchOperationError, EntitySpec
from src.tools.models import CADToolError, EntityInput
from src.tools.session import DrawingSession


def execute_draw_entities(
    session: DrawingSession,
    entities: List[EntityInput],
    allow_duplicates: bool = False,
) -> ToolResult:
    """
    Executes batch creation of drawing primitives.
    """
    session.check_entity_batch_limit(len(entities))

    # Save state before mutating
    pre_snapshot = session.snapshot()

    specs = [
        EntitySpec(
            entity_type=e.entity_type,
            params=e.params,
            layer=e.layer,
            color=e.color,
            linetype=e.linetype,
        )
        for e in entities
    ]

    try:
        results = session.backend.create_entities(specs, allow_duplicates=allow_duplicates)
        completed_handles = [r.handle for r in results if r.handle]

        # Summarize results
        created_count = sum(1 for r in results if r.status == "created")
        existing_count = sum(1 for r in results if r.status == "existing")

        # Record undo snapshot if changes were made or batch was processed
        if created_count > 0 or len(specs) > 0:
            session.record_undo_snapshot(pre_snapshot)

        summary_parts = []
        if created_count:
            summary_parts.append(f"Created {created_count} new entities")
        if existing_count:
            summary_parts.append(f"Deduplicated {existing_count} existing entities")
        summary_text = (
            f"Successfully processed {len(results)} entities: {', '.join(summary_parts)}. "
            f"Active modelspace total: {len(session.backend.msp)} entities."
        )

        structured_data = {
            "status": "success",
            "processed_count": len(results),
            "created_count": created_count,
            "deduplicated_count": existing_count,
            "entities": [
                {
                    "handle": r.handle,
                    "type": r.entity_type,
                    "layer": r.layer,
                    "status": r.status,
                }
                for r in results
            ],
        }

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content=structured_data,
        )

    except BatchOperationError as boe:
        # Atomic rollback on batch failure
        session.restore_snapshot(pre_snapshot)

        completed_handles = [r.handle for r in boe.completed_results if r.handle]
        err_payload = CADToolError(
            status="error",
            error_code="OPERATION_FAILED",
            message=boe.message,
            failed_index=boe.failed_index,
            succeeded_count=len(completed_handles),
            completed_handles=completed_handles,
            rolled_back=True,
        ).model_dump()

        summary_text = (
            f"Batch entity creation failed at operation index {boe.failed_index}: {boe.message}. "
            f"Drawing rolled back to pre-batch snapshot."
        )

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content=err_payload,
            is_error=True,
        )

    except Exception as ex:
        # Generic fallback
        session.restore_snapshot(pre_snapshot)

        err_payload = CADToolError(
            status="error",
            error_code="OPERATION_FAILED",
            message=str(ex),
            failed_index=0,
            succeeded_count=0,
            completed_handles=[],
            rolled_back=True,
        ).model_dump()

        summary_text = (
            f"Batch entity creation failed: {str(ex)}. "
            f"Drawing rolled back to pre-batch snapshot."
        )

        return ToolResult(
            content=[types.TextContent(type="text", text=summary_text)],
            structured_content=err_payload,
            is_error=True,
        )
