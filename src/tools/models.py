"""
Pydantic schemas and models for UPCE CAD MCP tools.
Defines strict input and output contracts for LLM agents.
All units are in millimeters (mm) with Y-up Cartesian coordinates.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class EntityInput(BaseModel):
    """Specification for drawing an entity primitive."""
    entity_type: Literal[
        "line", "circle", "arc", "rectangle", "polyline", "spline", "text", "dimension", "hatch"
    ] = Field(
        ...,
        description="Type of entity: line, circle, arc, rectangle, polyline, spline, text, dimension, hatch",
    )
    params: Dict[str, Any] = Field(
        ...,
        description=(
            "Geometric parameters in mm (Y-up):\n"
            "- line: {start: [x1,y1], end: [x2,y2]}\n"
            "- circle: {center: [cx,cy], radius: r}\n"
            "- arc: {center: [cx,cy], radius: r, start_angle: deg1, end_angle: deg2}\n"
            "- rectangle: {origin: [x,y], width: w, height: h, fillet_radius: r?}\n"
            "- polyline: {points: [[x,y],...], is_closed: bool}\n"
            "- spline: {fit_points: [[x,y],...]}\n"
            "- text: {insert: [x,y], text: str, height: h, rotation: deg?}\n"
            "- dimension: {start: [x1,y1], end: [x2,y2], text_midpoint: [mx,my]?, text: str?}\n"
            "- hatch: {boundary_paths: [[[x,y],...]], pattern_name: 'ANSI31'?, scale: s?}"
        ),
    )
    layer: str = Field(default="0", description="Layer name (e.g. '0', 'OUTLINE', 'DIMENSIONS')")
    color: Optional[int] = Field(default=None, description="AutoCAD Color Index (ACI 1-255)")
    linetype: Optional[str] = Field(default=None, description="Linetype name (e.g. 'Continuous', 'CENTER', 'DASHED')")


class LayerOperationInput(BaseModel):
    """Operation specification for managing CAD layers."""
    action: Literal["create", "rename", "delete", "set_visibility", "toggle_visibility", "modify", "list"] = Field(
        ..., description="Layer action: create, rename, delete, set_visibility, toggle_visibility, modify, list"
    )
    name: str = Field(default="", description="Layer name to operate on")
    new_name: Optional[str] = Field(default=None, description="Target name when renaming a layer")
    color: Optional[int] = Field(default=None, description="ACI color index (1-255)")
    linetype: Optional[str] = Field(default=None, description="Linetype name")
    is_visible: Optional[bool] = Field(default=None, description="Visibility state (True=on, False=off)")
    is_locked: Optional[bool] = Field(default=None, description="Lock state (True=locked, False=unlocked)")
    force: bool = Field(default=False, description="If True, permits deleting layers containing entities")


class TransformOperationInput(BaseModel):
    """Operation specification for transforming existing entities."""
    op_type: Literal[
        "move", "rotate", "scale", "copy", "mirror", "offset", "fillet", "chamfer"
    ] = Field(
        ...,
        description="Transform operation: move, rotate, scale, copy, mirror, offset, fillet, chamfer",
    )
    handles: List[str] = Field(
        default_factory=list,
        description="List of entity handles to apply the transformation to",
    )
    params: Dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Transformation parameters (mm, Y-up):\n"
            "- move/copy: {dx: float, dy: float}\n"
            "- rotate: {center: [cx,cy], angle_deg: float}\n"
            "- scale: {center: [cx,cy], scale_factor: float}\n"
            "- mirror: {p1: [x1,y1], p2: [x2,y2], keep_original: bool}\n"
            "- offset: {distance: float, side: 'left'|'right'}\n"
            "- fillet: {other_handle: str, radius: float}\n"
            "- chamfer: {other_handle: str, dist1: float, dist2: float}"
        ),
    )


class CADToolError(BaseModel):
    """Structured error payload for partial-failure and diagnostics."""
    status: Literal["error"] = "error"
    error_code: str
    message: str
    failed_index: Optional[int] = None
    succeeded_count: int = 0
    completed_handles: List[str] = Field(default_factory=list)
    rolled_back: bool = False
