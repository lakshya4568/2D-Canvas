"""
DrawingSession: In-memory session, transactional undo/redo engine, and security sandboxing.
Guarantees state persistence between MCP tool invocations and prevents directory traversal.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.cad_backend.base import CADBackend
from src.cad_backend.ezdxf_backend import EzdxfBackend

logger = logging.getLogger("cad_mcp.session")


class DrawingSession:
    """
    Manages in-memory state, undo/redo history, and path validation for CAD MCP server.
    """

    def __init__(self, config_path: Optional[str] = "config.json"):
        self.config = self._load_config(config_path)
        self.output_dir = Path(self.config.get("output_dir", "./output")).resolve()
        self.allow_arbitrary_paths = bool(self.config.get("allow_arbitrary_paths", False))
        self.max_entities_per_call = int(self.config.get("max_entities_per_call", 500))
        self.max_undo_steps = int(self.config.get("max_undo_steps", 50))
        self.units = str(self.config.get("default_units", "mm"))
        self.default_dxf_version = str(self.config.get("default_dxf_version", "R2010"))

        # Ensure output directory exists
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Active CAD backend
        self.backend: CADBackend = EzdxfBackend(
            dxf_version=self.default_dxf_version, default_units=self.units
        )

        # Undo / Redo Stacks (Serialized DXF document snapshots)
        self.undo_stack: List[str] = []
        self.redo_stack: List[str] = []

    def _load_config(self, config_path: Optional[str]) -> Dict[str, Any]:
        default_cfg = {
            "output_dir": "./output",
            "allow_arbitrary_paths": False,
            "logging_level": "INFO",
            "max_entities_per_call": 500,
            "max_undo_steps": 50,
            "default_units": "mm",
            "default_dxf_version": "R2010",
        }
        if config_path and os.path.isfile(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    default_cfg.update(loaded)
            except Exception as e:
                logger.warning(f"Could not load config file '{config_path}': {e}. Using defaults.")
        return default_cfg

    def validate_and_resolve_path(self, filepath: str, for_reading: bool = False) -> Path:
        """
        Validates that a path is safe and does not escape the configured output directory,
        unless allow_arbitrary_paths is enabled.
        """
        path = Path(filepath).expanduser()
        if not path.is_absolute():
            resolved = (self.output_dir / path).resolve()
        else:
            resolved = path.resolve()

        if not self.allow_arbitrary_paths:
            try:
                # Must be inside output_dir
                resolved.relative_to(self.output_dir)
            except ValueError:
                raise PermissionError(
                    f"Path traversal denied: '{filepath}' resolves outside the allowed "
                    f"output directory '{self.output_dir}'. Configure allow_arbitrary_paths to override."
                )

        if for_reading and not resolved.exists():
            raise FileNotFoundError(f"File not found: {resolved}")

        return resolved

    def check_entity_batch_limit(self, count: int) -> None:
        """Enforces denial-of-service cap on entity batch operations."""
        if count > self.max_entities_per_call:
            raise ValueError(
                f"Batch size {count} exceeds maximum allowed entities per call ({self.max_entities_per_call})."
            )

    def snapshot(self) -> str:
        """Capture current document snapshot."""
        return self.backend.export_snapshot()

    def record_undo_snapshot(self, snap: str) -> None:
        """Commits a pre-mutation snapshot onto the undo stack and clears redo stack."""
        self.undo_stack.append(snap)
        if len(self.undo_stack) > self.max_undo_steps:
            self.undo_stack.pop(0)
        self.redo_stack.clear()

    def push_undo_snapshot(self, snap: Optional[str] = None) -> None:
        """Pushes state onto the undo stack and clears redo stack."""
        snapshot_to_push = snap if snap is not None else self.snapshot()
        self.record_undo_snapshot(snapshot_to_push)

    def undo(self) -> Dict[str, Any]:
        """Undo the last mutating operation."""
        if not self.undo_stack:
            return {"status": "noop", "message": "Undo stack is empty; nothing to undo."}

        # Save current state for redo
        current_state = self.snapshot()
        self.redo_stack.append(current_state)

        # Restore previous state
        prev_state = self.undo_stack.pop()
        self.backend.import_snapshot(prev_state)

        return {
            "status": "success",
            "message": "Undid last operation.",
            "undo_steps_remaining": len(self.undo_stack),
            "redo_steps_available": len(self.redo_stack),
        }

    def redo(self) -> Dict[str, Any]:
        """Redo the last undone operation."""
        if not self.redo_stack:
            return {"status": "noop", "message": "Redo stack is empty; nothing to redo."}

        # Save current state for undo
        current_state = self.snapshot()
        self.undo_stack.append(current_state)

        # Restore redone state
        next_state = self.redo_stack.pop()
        self.backend.import_snapshot(next_state)

        return {
            "status": "success",
            "message": "Redid operation.",
            "undo_steps_remaining": len(self.undo_stack),
            "redo_steps_available": len(self.redo_stack),
        }

    def restore_snapshot(self, snapshot: str) -> None:
        """Restore backend state to a given snapshot."""
        self.backend.import_snapshot(snapshot)

    def reset_drawing(self, dxf_version: Optional[str] = None, units: Optional[str] = None) -> None:
        """Create a fresh blank drawing session."""
        ver = dxf_version or self.default_dxf_version
        u = units or self.units
        self.backend.new_document(dxf_version=ver, default_units=u)
        self.undo_stack.clear()
        self.redo_stack.clear()
