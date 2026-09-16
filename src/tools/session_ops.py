"""
manage_session tool implementation.
Session lifecycle, file persistence (DXF/PDF), diagnostics, and undo/redo snapshots.
Coordinates: millimeters (mm), Y-up Cartesian system.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional
from fastmcp.tools import ToolResult
import mcp.types as types

from src.tools.models import CADToolError
from src.tools.session import DrawingSession


def execute_manage_session(
    session: DrawingSession,
    action: str,
    filepath: Optional[str] = None,
    export_format: str = "dxf",
    units: str = "mm",
    dxf_version: str = "R2010",
) -> ToolResult:
    """
    Executes session management, file I/O, diagnostics, or transaction rollback.
    """
    act = action.lower()

    try:
        if act == "new":
            session.reset_drawing(dxf_version=dxf_version, units=units)
            summary = f"Created new blank CAD drawing ({dxf_version}, units: {units})."
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content={
                    "status": "success",
                    "action": "new",
                    "dxf_version": dxf_version,
                    "units": units,
                },
            )

        elif act == "open":
            if not filepath:
                raise ValueError("Parameter 'filepath' is required for 'open'")
            resolved_path = session.validate_and_resolve_path(filepath, for_reading=True)
            session.push_undo_snapshot()
            session.backend.load_document(str(resolved_path))
            q = session.backend.query(include_geometry=False)
            summary = (
                f"Opened CAD drawing from '{resolved_path.name}'. "
                f"Loaded {q.stats.entity_count} entities across {q.stats.layer_count} layers."
            )
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content={
                    "status": "success",
                    "action": "open",
                    "filepath": str(resolved_path),
                    "entity_count": q.stats.entity_count,
                    "layer_count": q.stats.layer_count,
                },
            )

        elif act in ("save", "export"):
            if not filepath:
                # Default file name if omitted
                filename = f"drawing.{export_format.lower()}"
                resolved_path = session.output_dir / filename
            else:
                resolved_path = session.validate_and_resolve_path(filepath, for_reading=False)

            saved_path = session.backend.save_document(str(resolved_path), fmt=export_format)
            q = session.backend.query(include_geometry=False)
            summary = (
                f"Successfully saved drawing ({q.stats.entity_count} entities) to '{Path(saved_path).name}' "
                f"in format '{export_format.upper()}'."
            )
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content={
                    "status": "success",
                    "action": act,
                    "saved_path": saved_path,
                    "export_format": export_format,
                    "entity_count": q.stats.entity_count,
                },
            )

        elif act == "close":
            session.reset_drawing()
            summary = "Active CAD drawing session closed. Reset to blank document."
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content={"status": "success", "action": "close"},
            )

        elif act == "undo":
            res = session.undo()
            summary = res.get("message", "Undid last operation.")
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content=res,
            )

        elif act == "redo":
            res = session.redo()
            summary = res.get("message", "Redid operation.")
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content=res,
            )

        elif act == "snapshot":
            snap = session.snapshot()
            q = session.backend.query(include_geometry=False)
            summary = (
                f"Captured drawing snapshot ({q.stats.entity_count} entities, "
                f"{q.stats.layer_count} layers). Undo depth: {len(session.undo_stack)}."
            )
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content={
                    "status": "success",
                    "action": "snapshot",
                    "entity_count": q.stats.entity_count,
                    "layer_count": q.stats.layer_count,
                    "undo_steps": len(session.undo_stack),
                    "snapshot": snap,
                },
            )

        elif act == "diagnostics":
            diag = session.backend.get_diagnostics()
            diag.update({
                "output_directory": str(session.output_dir),
                "allow_arbitrary_paths": session.allow_arbitrary_paths,
                "max_entities_per_call": session.max_entities_per_call,
                "undo_steps_cached": len(session.undo_stack),
                "redo_steps_available": len(session.redo_stack),
            })
            summary = (
                f"CAD MCP Server Diagnostics: Backend={diag['backend']}, "
                f"Active Entities={diag['entities_in_modelspace']}, "
                f"Layers={diag['layers_count']}, Blocks={diag['blocks_count']}, "
                f"Undo Stack Depth={diag['undo_steps_cached']}."
            )
            health_val = diag.pop("status", "healthy")
            return ToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structured_content={
                    "status": "success",
                    "health": health_val,
                    **diag,
                },
            )

        else:
            raise ValueError(f"Unknown session action: '{action}'")

    except Exception as ex:
        err_payload = CADToolError(
            status="error",
            error_code="SESSION_OPERATION_FAILED",
            message=str(ex),
            rolled_back=False,
        ).model_dump()

        summary = f"Session operation '{action}' failed: {str(ex)}"
        return ToolResult(
            content=[types.TextContent(type="text", text=summary)],
            structured_content=err_payload,
            is_error=True,
        )
