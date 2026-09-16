"""
manage_blocks tool implementation.
Block definition, batch insertion, auditing, and attribute inspection/modification.
Coordinates: millimeters (mm), Y-up Cartesian system.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastmcp.tools import ToolResult
import mcp.types as types

from src.tools.models import CADToolError
from src.tools.session import DrawingSession


def execute_manage_blocks(
    session: DrawingSession,
    action: str,
    name: Optional[str] = None,
    base_point: Optional[List[float]] = None,
    entity_handles: Optional[List[str]] = None,
    insertions: Optional[List[Dict[str, Any]]] = None,
    attributes: Optional[Dict[str, str]] = None,
    insert: Optional[List[float]] = None,
    rotation: float = 0.0,
    scale: float = 1.0,
) -> ToolResult:
    """
    Executes block lifecycle and attribute operations.
    """
    act = action.lower()
    is_mutating = act in ("create", "insert", "write_attributes")
    pre_snapshot = session.snapshot()

    bp = tuple(base_point) if base_point else (0.0, 0.0)

    # Wrap single insert convenience parameters if insertions was omitted
    if act == "insert" and not insertions and insert is not None:
        insertions = [{
            "insert": insert,
            "rotation": rotation,
            "scale": scale,
            "attributes": attributes,
        }]

    try:
        result = session.backend.manage_blocks(
            action=act,
            name=name,
            base_point=bp,
            entity_handles=entity_handles,
            insertions=insertions,
            attributes=attributes,
        )

        if is_mutating:
            session.record_undo_snapshot(pre_snapshot)

        # Generate summary
        if act == "create":
            summary = f"Created block definition '{name}' containing {result.get('entities_included', 0)} entity(s)."
        elif act == "insert":
            summary = f"Inserted {result.get('count', 0)} instance(s) of block '{name}' into modelspace."
        elif act == "list":
            summary = f"Listed {result.get('total_blocks', 0)} block definition(s) in drawing."
        elif act == "audit":
            unref = len(result.get("unreferenced_blocks", []))
            summary = f"Audited blocks: {len(result.get('defined_blocks', []))} defined, {unref} unreferenced."
        elif act == "read_attributes":
            summary = f"Retrieved attributes for {len(result.get('results', []))} block reference(s)."
        elif act == "write_attributes":
            summary = f"Updated {result.get('attributes_updated', 0)} block attribute value(s)."
        else:
            summary = f"Completed block action '{action}'."

        return ToolResult(
            content=[types.TextContent(type="text", text=summary)],
            structured_content={"status": "success", **result},
        )

    except Exception as ex:
        if is_mutating:
            session.restore_snapshot(pre_snapshot)

        err_payload = CADToolError(
            status="error",
            error_code="BLOCK_OPERATION_FAILED",
            message=str(ex),
            rolled_back=is_mutating,
        ).model_dump()

        summary = f"Block operation '{action}' failed: {str(ex)}. " + (
            "Drawing rolled back." if is_mutating else ""
        )

        return ToolResult(
            content=[types.TextContent(type="text", text=summary)],
            structured_content=err_payload,
            is_error=True,
        )
