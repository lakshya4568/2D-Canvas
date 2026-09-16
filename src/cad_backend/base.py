"""
CADBackend Abstraction Layer & BackendAdapter Protocol/ABC.
Defines the standard interface that all CAD engine implementations (ezdxf, FreeCAD RPC,
AutoCAD COM, WebAssembly UPCE) must implement.
Units: millimeters (mm).
Coordinate system: 2D Cartesian Y-up, origin at bottom-left (0,0).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union


class BatchOperationError(Exception):
    """Exception raised when an operation fails midway through a batch."""
    def __init__(self, message: str, failed_index: int, completed_results: List[EntityResult]):
        super().__init__(message)
        self.message = message
        self.failed_index = failed_index
        self.completed_results = completed_results


@dataclass
class EntitySpec:
    """Specification for creating a single CAD entity."""
    entity_type: str  # line, circle, arc, rectangle, polyline, spline, text, dimension, hatch
    params: Dict[str, Any]
    layer: str = "0"
    color: Optional[int] = None  # ACI color index (1-255)
    linetype: Optional[str] = None
    tag: Optional[str] = None


@dataclass
class EntityResult:
    """Result of creating or manipulating an entity."""
    handle: str
    entity_type: str
    layer: str
    status: str = "created"  # created, existing, failed, skipped
    error: Optional[str] = None
    geometry_summary: Optional[Dict[str, Any]] = None


@dataclass
class TransformOp:
    """Specification for transforming one or more entities."""
    op_type: str  # move, rotate, scale, copy, mirror, offset, fillet, chamfer
    handles: List[str] = field(default_factory=list)
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TransformResult:
    """Result of transforming an entity."""
    handle: str
    op_type: str
    status: str = "success"  # success, failed, skipped
    new_handle: Optional[str] = None  # for copy or offset that creates new entity
    error: Optional[str] = None


@dataclass
class LayerOp:
    """Specification for layer management."""
    action: str  # create, rename, delete, set_visibility, list
    name: str = ""
    new_name: Optional[str] = None
    color: Optional[int] = None
    linetype: Optional[str] = None
    is_visible: Optional[bool] = None
    is_locked: Optional[bool] = None
    force: bool = False


@dataclass
class LayerInfo:
    """Structured information about a CAD layer."""
    name: str
    color: int
    linetype: str
    is_visible: bool
    is_locked: bool
    entity_count: int


@dataclass
class DrawingStats:
    """Drawing-level statistics and metadata."""
    entity_count: int
    layer_count: int
    block_count: int
    bounds: Dict[str, float]  # min_x, min_y, max_x, max_y, width, height
    dxf_version: str
    units: str


@dataclass
class QueryResult:
    """Structured response from query_drawing."""
    entities: List[Dict[str, Any]]
    counts_by_layer: Dict[str, int]
    counts_by_type: Dict[str, int]
    bounding_box: Optional[Dict[str, float]]
    stats: DrawingStats


class CADBackend(ABC):
    """
    Abstract Base Class defining the contract for all CAD engine backends.
    All implementations must be thread-safe or support synchronized in-memory operations.
    """

    @property
    @abstractmethod
    def backend_name(self) -> str:
        """Name of the backend implementation (e.g. 'ezdxf-headless')."""
        pass

    @abstractmethod
    def new_document(self, dxf_version: str = "R2010", units: str = "mm") -> None:
        """Initialize a new blank CAD drawing session."""
        pass

    @abstractmethod
    def load_document(self, source: Union[str, bytes]) -> None:
        """Load a drawing from DXF file path or in-memory DXF bytes/string."""
        pass

    @abstractmethod
    def save_document(self, filepath: str, fmt: str = "dxf") -> str:
        """Save active drawing to a file. Returns absolute path saved."""
        pass

    @abstractmethod
    def export_snapshot(self) -> str:
        """Export serialized drawing state (e.g. DXF string) for undo snapshotting."""
        pass

    @abstractmethod
    def import_snapshot(self, snapshot: str) -> None:
        """Restore drawing state from a serialized snapshot."""
        pass

    @abstractmethod
    def create_entities(
        self, entities: List[EntitySpec], allow_duplicates: bool = False
    ) -> List[EntityResult]:
        """
        Batch-create CAD entities in modelspace.
        Returns a list of EntityResult records.
        """
        pass

    @abstractmethod
    def transform_entities(
        self, operations: List[TransformOp]
    ) -> List[TransformResult]:
        """
        Batch-transform entities (move, rotate, scale, copy, mirror, offset, fillet, chamfer).
        """
        pass

    @abstractmethod
    def manage_layers(
        self, operations: List[LayerOp]
    ) -> List[Union[LayerInfo, Dict[str, Any]]]:
        """Batch-manage layers (create, rename, delete, set_visibility, list)."""
        pass

    @abstractmethod
    def manage_blocks(
        self,
        action: str,
        name: Optional[str] = None,
        base_point: Tuple[float, float] = (0.0, 0.0),
        entity_handles: Optional[List[str]] = None,
        insertions: Optional[List[Dict[str, Any]]] = None,
        attributes: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Manage block definitions and block reference insertions.
        Actions: create, insert, list, audit, read_attributes, write_attributes.
        """
        pass

    @abstractmethod
    def query(
        self,
        filter_type: Optional[str] = None,
        filter_layer: Optional[str] = None,
        filter_color: Optional[int] = None,
        include_geometry: bool = True,
        calculate_bounds: bool = True,
    ) -> QueryResult:
        """Query entities matching filters, calculating counts and bounding box."""
        pass

    @abstractmethod
    def render_png(
        self,
        width_px: int = 1280,
        height_px: int = 720,
        background: str = "white",
        show_grid: bool = False,
    ) -> bytes:
        """Render modelspace to PNG bytes for visual self-verification."""
        pass

    @abstractmethod
    def get_diagnostics(self) -> Dict[str, Any]:
        """Return runtime health, backend diagnostics, and session telemetry."""
        pass


# Alias for compatibility with the Deliverables specification
BackendAdapter = CADBackend
