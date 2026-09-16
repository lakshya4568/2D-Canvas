"""
Production-grade headless CADBackend implementation using ezdxf.
Supports cross-platform, deterministic 2D CAD operations with zero Windows COM dependency.
Enforces millimeter units and Y-up coordinate geometry.
"""

from __future__ import annotations

import io
import math
import os
from typing import Any, Dict, List, Optional, Set, Tuple, Union

import ezdxf
from ezdxf import colors, units
from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
import ezdxf.bbox
from ezdxf.document import Drawing
from ezdxf.layouts import Modelspace
from ezdxf.math import Matrix44, Vec2, Vec3, offset_vertices_2d
import matplotlib
from matplotlib.figure import Figure
from matplotlib.backends.backend_agg import FigureCanvasAgg

from src.cad_backend.base import (
    BatchOperationError,
    CADBackend,
    DrawingStats,
    EntityResult,
    EntitySpec,
    LayerInfo,
    LayerOp,
    QueryResult,
    TransformOp,
    TransformResult,
)


def _round_coord(val: float, precision: int = 4) -> float:
    return round(float(val), precision)


def _point_key(pt: Union[Tuple[float, ...], List[float], Vec2, Vec3], precision: int = 3) -> Tuple[float, float]:
    return (_round_coord(pt[0], precision), _round_coord(pt[1], precision))


class EzdxfBackend(CADBackend):
    """
    Headless ezdxf implementation of CADBackend.
    Provides fast, deterministic in-memory CAD document operations with snapshotting.
    """

    def __init__(self, dxf_version: str = "R2010", default_units: str = "mm"):
        self._dxf_version = dxf_version
        self._units_str = default_units
        self.doc: Drawing = ezdxf.new(dxfversion=dxf_version, setup=True)
        self.doc.units = units.MM
        self.msp: Modelspace = self.doc.modelspace()
        self._ensure_default_layers()

    @property
    def backend_name(self) -> str:
        return f"ezdxf-headless (ezdxf {ezdxf.__version__})"

    def _ensure_default_layers(self) -> None:
        """Create standard engineering layers if not already present."""
        standard_layers = {
            "0": {"color": colors.WHITE, "linetype": "Continuous"},
            "OUTLINE": {"color": colors.CYAN, "linetype": "Continuous"},
            "CENTERLINE": {"color": colors.RED, "linetype": "CENTER"},
            "HIDDEN": {"color": colors.MAGENTA, "linetype": "DASHED"},
            "DIMENSIONS": {"color": colors.GREEN, "linetype": "Continuous"},
            "TEXT": {"color": colors.YELLOW, "linetype": "Continuous"},
            "HATCH": {"color": colors.GRAY, "linetype": "Continuous"},
        }
        for name, attribs in standard_layers.items():
            if name not in self.doc.layers:
                self.doc.layers.add(name, color=attribs["color"])

    def new_document(self, dxf_version: str = "R2010", default_units: str = "mm") -> None:
        self._dxf_version = dxf_version
        self._units_str = default_units
        self.doc = ezdxf.new(dxfversion=dxf_version, setup=True)
        self.doc.units = units.MM
        self.msp = self.doc.modelspace()
        self._ensure_default_layers()

    def load_document(self, source: Union[str, bytes]) -> None:
        if isinstance(source, bytes):
            stream = io.StringIO(source.decode("utf-8", errors="replace"))
            self.doc = ezdxf.read(stream)
        elif isinstance(source, str):
            if os.path.isfile(source):
                if source.lower().endswith(".dwg"):
                    try:
                        import ezdxf.addons.odafc as odafc
                        if not odafc.is_installed():
                            raise RuntimeError(
                                "ODA File Converter is not installed or not found in PATH. "
                                "Loading DWG files requires ODA File Converter. "
                                "Convert the file to DXF format or install ODA File Converter."
                            )
                        self.doc = odafc.readfile(source)
                    except ImportError:
                        raise RuntimeError("ezdxf.addons.odafc is unavailable for DWG loading.")
                else:
                    self.doc = ezdxf.readfile(source)
            else:
                self.doc = ezdxf.read(io.StringIO(source))
        else:
            raise ValueError(f"Unsupported document source type: {type(source)}")
        self.msp = self.doc.modelspace()
        self._dxf_version = self.doc.dxfversion

    def save_document(self, filepath: str, fmt: str = "dxf") -> str:
        abs_path = os.path.abspath(filepath)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        fmt_lower = fmt.lower()

        if fmt_lower == "dxf":
            self.doc.saveas(abs_path)
            return abs_path
        elif fmt_lower == "pdf":
            fig = Figure(figsize=(11.69, 8.27), dpi=300)
            canvas = FigureCanvasAgg(fig)
            ax = fig.add_axes([0, 0, 1, 1])
            ctx = RenderContext(self.doc)
            out = MatplotlibBackend(ax)
            Frontend(ctx, out).draw_layout(self.msp, finalize=True)
            canvas.print_figure(abs_path, format="pdf")
            return abs_path
        elif fmt_lower == "dwg":
            try:
                import ezdxf.addons.odafc as odafc
                if not odafc.is_installed():
                    raise RuntimeError(
                        "ODA File Converter is not installed or not found in PATH. "
                        "DWG binary export requires ODA File Converter. "
                        "Use export_format='dxf' or export_format='pdf' for native headless export."
                    )
                odafc.export_dwg(self.doc, abs_path, version=self._dxf_version)
                return abs_path
            except ImportError:
                raise RuntimeError("ezdxf.addons.odafc is unavailable for DWG export.")
        else:
            raise ValueError(f"Unsupported export format '{fmt}'. Supported: 'dxf', 'pdf', 'dwg'")

    def export_snapshot(self) -> str:
        stream = io.StringIO()
        self.doc.write(stream)
        return stream.getvalue()

    def import_snapshot(self, snapshot: str) -> None:
        self.doc = ezdxf.read(io.StringIO(snapshot))
        self.msp = self.doc.modelspace()

    def _get_entity_signature(self, entity_type: str, params: Dict[str, Any], layer: str) -> Tuple[Any, ...]:
        """Compute normalized canonical signature for geometric deduplication."""
        etype = entity_type.lower()
        if etype == "line":
            p1 = _point_key(params.get("start", [0, 0]))
            p2 = _point_key(params.get("end", [0, 0]))
            pts = tuple(sorted([p1, p2]))
            return (layer, "line", pts)
        elif etype == "circle":
            center = _point_key(params.get("center", [0, 0]))
            radius = _round_coord(params.get("radius", 0))
            return (layer, "circle", center, radius)
        elif etype == "arc":
            center = _point_key(params.get("center", [0, 0]))
            radius = _round_coord(params.get("radius", 0))
            sa = _round_coord(params.get("start_angle", 0), 2)
            ea = _round_coord(params.get("end_angle", 0), 2)
            return (layer, "arc", center, radius, sa, ea)
        elif etype == "rectangle":
            origin = params.get("origin", params.get("start", [0, 0]))
            x0, y0 = float(origin[0]), float(origin[1])
            w = _round_coord(params.get("width", 0))
            h = _round_coord(params.get("height", 0))
            fillet_r = _round_coord(params.get("fillet_radius", 0))
            pts = tuple(sorted([
                _point_key((x0, y0)),
                _point_key((x0 + w, y0)),
                _point_key((x0 + w, y0 + h)),
                _point_key((x0, y0 + h)),
            ]))
            return (layer, "rectangle", pts, fillet_r)
        elif etype == "polyline":
            raw_pts = params.get("points", [])
            pts = tuple(_point_key(p) for p in raw_pts)
            closed = bool(params.get("is_closed", params.get("closed", False)))
            return (layer, "polyline", pts, closed)
        elif etype == "text":
            insert = _point_key(params.get("insert", [0, 0]))
            text = str(params.get("text", "")).strip()
            height = _round_coord(params.get("height", 2.5))
            return (layer, "text", insert, text, height)
        elif etype == "spline":
            raw_pts = params.get("fit_points", [])
            pts = tuple(_point_key(p) for p in raw_pts)
            return (layer, "spline", pts)
        elif etype == "dimension":
            p1 = _point_key(params.get("start", [0, 0]))
            p2 = _point_key(params.get("end", [10, 0]))
            pts = tuple(sorted([p1, p2]))
            txt = str(params.get("text", "")).strip()
            return (layer, "dimension", pts, txt)
        elif etype == "hatch":
            pat = str(params.get("pattern_name", "ANSI31")).upper()
            raw_paths = params.get("boundary_paths", [])
            paths = tuple(tuple(_point_key(p) for p in path) for path in raw_paths)
            return (layer, "hatch", pat, paths)
        return (layer, etype, str(params))

    def _find_existing_entity_handle(self, signature: Tuple[Any, ...]) -> Optional[str]:
        """Search modelspace for an entity matching the given signature."""
        target_layer, target_type = signature[0], signature[1]
        for e in self.msp:
            try:
                dxftype = e.dxftype().lower()
                layer = e.dxf.layer
                if layer != target_layer:
                    continue

                if dxftype == "line" and target_type == "line":
                    p1 = _point_key((e.dxf.start.x, e.dxf.start.y))
                    p2 = _point_key((e.dxf.end.x, e.dxf.end.y))
                    if tuple(sorted([p1, p2])) == signature[2]:
                        return str(e.dxf.handle)

                elif dxftype == "circle" and target_type == "circle":
                    wcs_c = e.ocs().to_wcs(e.dxf.center)
                    c = _point_key((wcs_c.x, wcs_c.y))
                    r = _round_coord(e.dxf.radius)
                    if c == signature[2] and abs(r - signature[3]) < 1e-4:
                        return str(e.dxf.handle)

                elif dxftype == "arc" and target_type == "arc":
                    wcs_c = e.ocs().to_wcs(e.dxf.center)
                    c = _point_key((wcs_c.x, wcs_c.y))
                    r = _round_coord(e.dxf.radius)
                    sa = _round_coord(e.dxf.start_angle, 2)
                    ea = _round_coord(e.dxf.end_angle, 2)
                    if c == signature[2] and abs(r - signature[3]) < 1e-4 and abs(sa - signature[4]) < 1e-2 and abs(ea - signature[5]) < 1e-2:
                        return str(e.dxf.handle)

                elif dxftype == "text" and target_type == "text":
                    ins = _point_key((e.dxf.insert.x, e.dxf.insert.y))
                    txt = str(e.dxf.text).strip()
                    ht = _round_coord(e.dxf.height)
                    if ins == signature[2] and txt == signature[3] and abs(ht - signature[4]) < 1e-2:
                        return str(e.dxf.handle)

                elif dxftype == "lwpolyline" and target_type == "rectangle":
                    if bool(e.closed):
                        pts = e.get_points(format="xy")
                        if len(pts) in (4, 8):
                            e_corners = tuple(sorted([_point_key(p) for p in pts[:4]]))
                            if e_corners == signature[2]:
                                return str(e.dxf.handle)

                elif dxftype == "lwpolyline" and target_type == "polyline":
                    e_pts = tuple(_point_key(p) for p in e.get_points(format="xy"))
                    if e_pts == signature[2] and bool(e.closed) == signature[3]:
                        return str(e.dxf.handle)

                elif dxftype == "spline" and target_type == "spline":
                    if hasattr(e, "fit_points") and len(e.fit_points) > 0:
                        e_pts = tuple(_point_key((float(p[0]), float(p[1]))) for p in e.fit_points)
                        if e_pts == signature[2]:
                            return str(e.dxf.handle)

                elif dxftype == "dimension" and target_type == "dimension":
                    if hasattr(e.dxf, "defpoint2") and hasattr(e.dxf, "defpoint3"):
                        p1 = _point_key((e.dxf.defpoint2.x, e.dxf.defpoint2.y))
                        p2 = _point_key((e.dxf.defpoint3.x, e.dxf.defpoint3.y))
                        if tuple(sorted([p1, p2])) == signature[2]:
                            return str(e.dxf.handle)

                elif dxftype == "hatch" and target_type == "hatch":
                    pat = str(getattr(e.dxf, "pattern_name", "")).upper()
                    if pat == signature[2] and len(e.paths) == len(signature[3]):
                        return str(e.dxf.handle)

            except Exception:
                continue
        return None

    def create_entities(
        self, entities: List[EntitySpec], allow_duplicates: bool = False
    ) -> List[EntityResult]:
        results: List[EntityResult] = []

        for idx, spec in enumerate(entities):
            etype = spec.entity_type.lower()
            layer = spec.layer or "0"
            params = spec.params or {}

            # Ensure target layer exists
            if layer not in self.doc.layers:
                self.doc.layers.add(layer)

            # Deduplication check
            if not allow_duplicates:
                sig = self._get_entity_signature(etype, params, layer)
                existing_handle = self._find_existing_entity_handle(sig)
                if existing_handle:
                    results.append(
                        EntityResult(
                            handle=existing_handle,
                            entity_type=etype.upper(),
                            layer=layer,
                            status="existing",
                            geometry_summary={"deduplicated": True, "params": params},
                        )
                    )
                    continue

            dxfattribs: Dict[str, Any] = {"layer": layer}
            if spec.color is not None:
                dxfattribs["color"] = int(spec.color)
            if spec.linetype is not None:
                dxfattribs["linetype"] = str(spec.linetype)

            try:
                if etype == "line":
                    start = tuple(params.get("start", [0.0, 0.0]))
                    end = tuple(params.get("end", [1.0, 0.0]))
                    entity = self.msp.add_line(start, end, dxfattribs=dxfattribs)

                elif etype == "circle":
                    center = tuple(params.get("center", [0.0, 0.0]))
                    radius = float(params.get("radius", 1.0))
                    if radius <= 0:
                        raise ValueError(f"Circle radius must be positive, got {radius}")
                    entity = self.msp.add_circle(center, radius, dxfattribs=dxfattribs)

                elif etype == "arc":
                    center = tuple(params.get("center", [0.0, 0.0]))
                    radius = float(params.get("radius", 1.0))
                    start_angle = float(params.get("start_angle", 0.0))
                    end_angle = float(params.get("end_angle", 90.0))
                    if radius <= 0:
                        raise ValueError(f"Arc radius must be positive, got {radius}")
                    entity = self.msp.add_arc(
                        center, radius, start_angle, end_angle, dxfattribs=dxfattribs
                    )

                elif etype == "rectangle":
                    origin = params.get("origin", [0.0, 0.0])
                    x0, y0 = float(origin[0]), float(origin[1])
                    w = float(params.get("width", 10.0))
                    h = float(params.get("height", 10.0))
                    fillet_r = float(params.get("fillet_radius", 0.0))

                    if fillet_r > 0 and fillet_r < min(abs(w), abs(h)) / 2.0:
                        bulge = math.tan(math.radians(90.0) / 4.0)
                        pts = [
                            (x0 + fillet_r, y0, 0, 0, 0),
                            (x0 + w - fillet_r, y0, 0, 0, bulge),
                            (x0 + w, y0 + fillet_r, 0, 0, 0),
                            (x0 + w, y0 + h - fillet_r, 0, 0, bulge),
                            (x0 + w - fillet_r, y0 + h, 0, 0, 0),
                            (x0 + fillet_r, y0 + h, 0, 0, bulge),
                            (x0, y0 + h - fillet_r, 0, 0, 0),
                            (x0, y0 + fillet_r, 0, 0, bulge),
                        ]
                        entity = self.msp.add_lwpolyline(pts, close=True, dxfattribs=dxfattribs)
                    else:
                        pts = [(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)]
                        entity = self.msp.add_lwpolyline(pts, close=True, dxfattribs=dxfattribs)

                elif etype == "polyline":
                    points = params.get("points", [])
                    if len(points) < 2:
                        raise ValueError(f"Polyline requires at least 2 points, got {len(points)}")
                    close = bool(params.get("is_closed", False))
                    entity = self.msp.add_lwpolyline(points, close=close, dxfattribs=dxfattribs)

                elif etype == "spline":
                    fit_points = params.get("fit_points", [])
                    if len(fit_points) < 2:
                        raise ValueError(f"Spline requires at least 2 fit points, got {len(fit_points)}")
                    entity = self.msp.add_spline(fit_points, dxfattribs=dxfattribs)

                elif etype == "text":
                    text_str = str(params.get("text", ""))
                    insert = tuple(params.get("insert", [0.0, 0.0]))
                    height = float(params.get("height", 2.5))
                    rotation = float(params.get("rotation", 0.0))
                    text_attribs = {**dxfattribs, "height": height, "rotation": rotation}
                    entity = self.msp.add_text(text_str, dxfattribs=text_attribs)
                    entity.set_placement(insert)

                elif etype == "dimension":
                    dim_type = params.get("dim_type", "aligned").lower()
                    p1 = tuple(params.get("start", [0.0, 0.0]))
                    p2 = tuple(params.get("end", [10.0, 0.0]))
                    text_midpoint = params.get("text_midpoint")
                    override_text = params.get("text")
                    dx = p2[0] - p1[0]
                    dy = p2[1] - p1[1]

                    if text_midpoint:
                        base_pt = tuple(text_midpoint)
                        dim_angle = float(params.get("angle", math.degrees(math.atan2(dy, dx))))
                        dim = self.msp.add_linear_dim(
                            base=base_pt,
                            p1=p1,
                            p2=p2,
                            angle=dim_angle,
                            text=override_text,
                            dxfattribs=dxfattribs,
                        )
                    else:
                        offset_dist = float(params.get("offset", 5.0))
                        dim = self.msp.add_aligned_dim(
                            p1=p1,
                            p2=p2,
                            distance=offset_dist,
                            text=override_text,
                            dxfattribs=dxfattribs,
                        )
                    dim.render()
                    entity = dim.dimension

                elif etype == "hatch":
                    pattern = str(params.get("pattern_name", "ANSI31"))
                    scale = float(params.get("scale", 1.0))
                    boundary_paths = params.get("boundary_paths", [])
                    if not boundary_paths:
                        raise ValueError("Hatch requires boundary_paths")

                    hatch = self.msp.add_hatch(color=dxfattribs.get("color", colors.GRAY), dxfattribs=dxfattribs)
                    hatch.set_pattern_fill(pattern, scale=scale)
                    for path_pts in boundary_paths:
                        hatch.paths.add_polyline_path(path_pts, is_closed=True)
                    entity = hatch

                else:
                    raise ValueError(f"Unknown entity type: '{etype}'")

                handle = str(entity.dxf.handle)
                results.append(
                    EntityResult(
                        handle=handle,
                        entity_type=entity.dxftype(),
                        layer=layer,
                        status="created",
                        geometry_summary=params,
                    )
                )

            except Exception as ex:
                raise BatchOperationError(
                    message=f"Failed to create entity at index {idx} ({etype}): {str(ex)}",
                    failed_index=idx,
                    completed_results=results,
                ) from ex

        return results

    def _get_entity_by_handle(self, handle: str) -> Optional[Any]:
        try:
            return self.doc.entitydb.get(handle)
        except Exception:
            return None

    def transform_entities(
        self, operations: List[TransformOp]
    ) -> List[TransformResult]:
        results: List[TransformResult] = []

        for op in operations:
            op_type = op.op_type.lower()
            params = op.params or {}
            handles = op.handles

            if op_type in ("fillet", "chamfer"):
                # Binary operation between pairs of line entities
                pairs: List[Tuple[str, str]] = []
                if params.get("other_handle"):
                    h2 = str(params["other_handle"])
                    t_handles = [h for h in handles if h != h2]
                    if not t_handles and handles:
                        t_handles = [handles[0]]
                    pairs = [(h, h2) for h in t_handles]
                elif len(handles) >= 2:
                    if len(handles) == 2:
                        pairs = [(handles[0], handles[1])]
                    else:
                        pairs = [(handles[i], handles[i + 1]) for i in range(0, len(handles) - 1, 2)]
                else:
                    results.append(
                        TransformResult(
                            handle=handles[0] if handles else "",
                            op_type=op_type,
                            status="failed",
                            error=f"'{op_type}' requires two line entity handles (e.g. handles=[h1, h2] or other_handle in params)",
                        )
                    )
                    continue

                for h1, h2 in pairs:
                    e1 = self._get_entity_by_handle(h1)
                    e2 = self._get_entity_by_handle(h2)
                    if not e1:
                        results.append(TransformResult(handle=h1, op_type=op_type, status="failed", error=f"Entity '{h1}' not found"))
                        continue
                    if not e2:
                        results.append(TransformResult(handle=h2, op_type=op_type, status="failed", error=f"Entity '{h2}' not found"))
                        continue
                    if e1.dxftype().lower() != "line" or e2.dxftype().lower() != "line":
                        results.append(TransformResult(handle=h1, op_type=op_type, status="failed", error=f"'{op_type}' currently requires two line entities"))
                        continue

                    try:
                        p1a = Vec2(e1.dxf.start.x, e1.dxf.start.y)
                        p1b = Vec2(e1.dxf.end.x, e1.dxf.end.y)
                        p2a = Vec2(e2.dxf.start.x, e2.dxf.start.y)
                        p2b = Vec2(e2.dxf.end.x, e2.dxf.end.y)

                        denom = (p1a.x - p1b.x) * (p2a.y - p2b.y) - (p1a.y - p1b.y) * (p2a.x - p2b.x)
                        if abs(denom) < 1e-9:
                            raise ValueError("Lines are parallel or collinear; cannot fillet/chamfer")

                        ix = ((p1a.x * p1b.y - p1a.y * p1b.x) * (p2a.x - p2b.x) - (p1a.x - p1b.x) * (p2a.x * p2b.y - p2a.y * p2b.x)) / denom
                        iy = ((p1a.x * p1b.y - p1a.y * p1b.x) * (p2a.y - p2b.y) - (p1a.y - p1b.y) * (p2a.x * p2b.y - p2a.y * p2b.x)) / denom
                        inter = Vec2(ix, iy)

                        far1 = p1a if (p1a - inter).magnitude > (p1b - inter).magnitude else p1b
                        far2 = p2a if (p2a - inter).magnitude > (p2b - inter).magnitude else p2b
                        len1 = (far1 - inter).magnitude
                        len2 = (far2 - inter).magnitude

                        if op_type == "chamfer":
                            d1 = float(params.get("dist1", 5.0))
                            d2 = float(params.get("dist2", d1))
                            if d1 > len1 + 1e-4 or d2 > len2 + 1e-4:
                                raise ValueError(f"Chamfer distances ({d1}mm, {d2}mm) exceed line lengths ({len1:.2f}mm, {len2:.2f}mm)")

                            dir1 = (far1 - inter).normalize()
                            cham1 = inter + dir1 * d1
                            dir2 = (far2 - inter).normalize()
                            cham2 = inter + dir2 * d2

                            if (p1a - inter).magnitude < (p1b - inter).magnitude:
                                e1.dxf.start = Vec3(cham1.x, cham1.y, 0)
                            else:
                                e1.dxf.end = Vec3(cham1.x, cham1.y, 0)

                            if (p2a - inter).magnitude < (p2b - inter).magnitude:
                                e2.dxf.start = Vec3(cham2.x, cham2.y, 0)
                            else:
                                e2.dxf.end = Vec3(cham2.x, cham2.y, 0)

                            cham_line = self.msp.add_line(
                                (cham1.x, cham1.y),
                                (cham2.x, cham2.y),
                                dxfattribs={"layer": e1.dxf.layer, "color": getattr(e1.dxf, "color", 7)},
                            )
                            results.append(
                                TransformResult(
                                    handle=h1,
                                    op_type=op_type,
                                    status="success",
                                    new_handle=str(cham_line.dxf.handle),
                                )
                            )
                        else:  # fillet
                            radius = float(params.get("radius", 5.0))
                            v1 = (far1 - inter).normalize()
                            v2 = (far2 - inter).normalize()
                            cos_a = max(-1.0, min(1.0, v1.dot(v2)))
                            alpha = math.acos(cos_a)
                            if alpha < 1e-4 or abs(alpha - math.pi) < 1e-4:
                                raise ValueError("Angle between lines is too close to 0 or 180 degrees")

                            t = radius / math.tan(alpha / 2.0)
                            if t > len1 + 1e-4 or t > len2 + 1e-4:
                                raise ValueError(f"Fillet radius {radius}mm is too large for line segments (tangent offset {t:.2f}mm exceeds line lengths {len1:.2f}mm and {len2:.2f}mm)")

                            tan1 = inter + v1 * t
                            tan2 = inter + v2 * t

                            bisector = (v1 + v2).normalize()
                            center_dist = radius / math.sin(alpha / 2.0)
                            arc_center = inter + bisector * center_dist

                            sa = math.degrees(math.atan2(tan1.y - arc_center.y, tan1.x - arc_center.x))
                            ea = math.degrees(math.atan2(tan2.y - arc_center.y, tan2.x - arc_center.x))

                            # Guarantee minor arc (< 180 degrees)
                            sweep = (ea - sa) % 360
                            if sweep >= 180:
                                sa, ea = ea, sa

                            if (p1a - inter).magnitude < (p1b - inter).magnitude:
                                e1.dxf.start = Vec3(tan1.x, tan1.y, 0)
                            else:
                                e1.dxf.end = Vec3(tan1.x, tan1.y, 0)

                            if (p2a - inter).magnitude < (p2b - inter).magnitude:
                                e2.dxf.start = Vec3(tan2.x, tan2.y, 0)
                            else:
                                e2.dxf.end = Vec3(tan2.x, tan2.y, 0)

                            arc = self.msp.add_arc(
                                (arc_center.x, arc_center.y),
                                radius,
                                sa,
                                ea,
                                dxfattribs={"layer": e1.dxf.layer, "color": getattr(e1.dxf, "color", 7)},
                            )
                            results.append(
                                TransformResult(
                                    handle=h1,
                                    op_type=op_type,
                                    status="success",
                                    new_handle=str(arc.dxf.handle),
                                )
                            )
                    except Exception as ex:
                        results.append(
                            TransformResult(
                                handle=h1,
                                op_type=op_type,
                                status="failed",
                                error=str(ex),
                            )
                        )
                continue

            for handle in handles:
                entity = self._get_entity_by_handle(handle)
                if not entity:
                    results.append(
                        TransformResult(
                            handle=handle,
                            op_type=op_type,
                            status="failed",
                            error=f"Entity handle '{handle}' not found in drawing",
                        )
                    )
                    continue

                try:
                    if op_type == "move":
                        dx = float(params.get("dx", 0.0))
                        dy = float(params.get("dy", 0.0))
                        m = Matrix44.translate(dx, dy, 0.0)
                        entity.transform(m)
                        results.append(TransformResult(handle=handle, op_type=op_type, status="success"))

                    elif op_type == "rotate":
                        cx, cy = params.get("center", [0.0, 0.0])
                        angle_deg = float(params.get("angle_deg", 0.0))
                        rad = math.radians(angle_deg)
                        m = Matrix44.chain(
                            Matrix44.translate(-cx, -cy, 0.0),
                            Matrix44.z_rotate(rad),
                            Matrix44.translate(cx, cy, 0.0),
                        )
                        entity.transform(m)
                        results.append(TransformResult(handle=handle, op_type=op_type, status="success"))

                    elif op_type == "scale":
                        cx, cy = params.get("center", [0.0, 0.0])
                        s = float(params.get("scale_factor", 1.0))
                        if s <= 0:
                            raise ValueError(f"Scale factor must be positive, got {s}")
                        m = Matrix44.chain(
                            Matrix44.translate(-cx, -cy, 0.0),
                            Matrix44.scale(s, s, 1.0),
                            Matrix44.translate(cx, cy, 0.0),
                        )
                        entity.transform(m)
                        results.append(TransformResult(handle=handle, op_type=op_type, status="success"))

                    elif op_type == "copy":
                        dx = float(params.get("dx", 0.0))
                        dy = float(params.get("dy", 0.0))
                        new_entity = self.doc.entitydb.duplicate_entity(entity)
                        self.msp.add_entity(new_entity)
                        m = Matrix44.translate(dx, dy, 0.0)
                        new_entity.transform(m)
                        new_handle = str(new_entity.dxf.handle)
                        results.append(
                            TransformResult(
                                handle=handle,
                                op_type=op_type,
                                status="success",
                                new_handle=new_handle,
                            )
                        )

                    elif op_type == "mirror":
                        p1 = tuple(params.get("p1", [0.0, 0.0]))
                        p2 = tuple(params.get("p2", [0.0, 1.0]))
                        keep_original = bool(params.get("keep_original", False))

                        dx = p2[0] - p1[0]
                        dy = p2[1] - p1[1]
                        if abs(dx) < 1e-9 and abs(dy) < 1e-9:
                            raise ValueError("Mirror line points p1 and p2 cannot be identical")
                        theta = math.atan2(dy, dx)

                        m = Matrix44.chain(
                            Matrix44.translate(-p1[0], -p1[1], 0.0),
                            Matrix44.z_rotate(-theta),
                            Matrix44.scale(1.0, -1.0, 1.0),
                            Matrix44.z_rotate(theta),
                            Matrix44.translate(p1[0], p1[1], 0.0),
                        )

                        if keep_original:
                            mirrored = self.doc.entitydb.duplicate_entity(entity)
                            self.msp.add_entity(mirrored)
                            mirrored.transform(m)
                            new_h = str(mirrored.dxf.handle)
                            results.append(
                                TransformResult(
                                    handle=handle,
                                    op_type=op_type,
                                    status="success",
                                    new_handle=new_h,
                                )
                            )
                        else:
                            entity.transform(m)
                            results.append(TransformResult(handle=handle, op_type=op_type, status="success"))

                    elif op_type == "offset":
                        distance = float(params.get("distance", 5.0))
                        side = str(params.get("side", "left")).lower()
                        dxftype = entity.dxftype().lower()

                        if dxftype == "line":
                            p1 = (entity.dxf.start.x, entity.dxf.start.y)
                            p2 = (entity.dxf.end.x, entity.dxf.end.y)
                            vx = p2[0] - p1[0]
                            vy = p2[1] - p1[1]
                            length = math.hypot(vx, vy)
                            if length < 1e-9:
                                raise ValueError("Cannot offset zero-length line")
                            ux, uy = vx / length, vy / length
                            nx, ny = (-uy, ux) if side == "left" else (uy, -ux)
                            off_p1 = (p1[0] + nx * distance, p1[1] + ny * distance)
                            off_p2 = (p2[0] + nx * distance, p2[1] + ny * distance)
                            new_line = self.msp.add_line(
                                off_p1,
                                off_p2,
                                dxfattribs={"layer": entity.dxf.layer, "color": getattr(entity.dxf, "color", 7)},
                            )
                            results.append(
                                TransformResult(
                                    handle=handle,
                                    op_type=op_type,
                                    status="success",
                                    new_handle=str(new_line.dxf.handle),
                                )
                            )
                        elif dxftype == "circle":
                            r = entity.dxf.radius
                            is_outward = side in ("outside", "out", "left", "expand")
                            delta = distance if is_outward else -distance
                            new_r = r + delta
                            if new_r <= 0:
                                raise ValueError(f"Offset resulted in non-positive radius: {new_r}")
                            wcs_c = entity.ocs().to_wcs(entity.dxf.center)
                            new_circle = self.msp.add_circle(
                                (wcs_c.x, wcs_c.y),
                                new_r,
                                dxfattribs={"layer": entity.dxf.layer, "color": getattr(entity.dxf, "color", 7)},
                            )
                            results.append(
                                TransformResult(
                                    handle=handle,
                                    op_type=op_type,
                                    status="success",
                                    new_handle=str(new_circle.dxf.handle),
                                )
                            )
                        elif dxftype == "arc":
                            r = entity.dxf.radius
                            is_outward = side in ("outside", "out", "left", "expand")
                            delta = distance if is_outward else -distance
                            new_r = r + delta
                            if new_r <= 0:
                                raise ValueError(f"Offset resulted in non-positive radius: {new_r}")
                            wcs_c = entity.ocs().to_wcs(entity.dxf.center)
                            new_arc = self.msp.add_arc(
                                (wcs_c.x, wcs_c.y),
                                new_r,
                                entity.dxf.start_angle,
                                entity.dxf.end_angle,
                                dxfattribs={"layer": entity.dxf.layer, "color": getattr(entity.dxf, "color", 7)},
                            )
                            results.append(
                                TransformResult(
                                    handle=handle,
                                    op_type=op_type,
                                    status="success",
                                    new_handle=str(new_arc.dxf.handle),
                                )
                            )
                        elif dxftype == "lwpolyline":
                            raw_verts = entity.get_points(format="xy")
                            if len(raw_verts) < 2:
                                raise ValueError("Cannot offset polyline with fewer than 2 vertices")
                            verts = [Vec2(p[0], p[1]) for p in raw_verts]
                            off_dist = distance if side == "left" else -distance
                            off_pts = list(offset_vertices_2d(verts, offset=off_dist, closed=bool(entity.closed)))
                            new_poly = self.msp.add_lwpolyline(
                                [(v.x, v.y) for v in off_pts],
                                close=bool(entity.closed),
                                dxfattribs={"layer": entity.dxf.layer, "color": getattr(entity.dxf, "color", 7)},
                            )
                            results.append(
                                TransformResult(
                                    handle=handle,
                                    op_type=op_type,
                                    status="success",
                                    new_handle=str(new_poly.dxf.handle),
                                )
                            )
                        else:
                            raise ValueError(f"Offset not supported for entity type '{dxftype}'")

                    else:
                        raise ValueError(f"Unknown transform operation: '{op_type}'")

                except Exception as ex:
                    results.append(
                        TransformResult(
                            handle=handle,
                            op_type=op_type,
                            status="failed",
                            error=str(ex),
                        )
                    )

        return results

    def manage_layers(
        self, operations: List[LayerOp]
    ) -> List[Union[LayerInfo, Dict[str, Any]]]:
        results: List[Union[LayerInfo, Dict[str, Any]]] = []

        entity_counts: Dict[str, int] = {}
        for e in self.msp:
            l = e.dxf.layer
            entity_counts[l] = entity_counts.get(l, 0) + 1

        for op in operations:
            action = op.action.lower()

            if action == "list":
                for layer in self.doc.layers:
                    results.append(
                        LayerInfo(
                            name=layer.dxf.name,
                            color=layer.color,
                            linetype=layer.dxf.linetype,
                            is_visible=layer.is_on(),
                            is_locked=layer.is_locked(),
                            entity_count=entity_counts.get(layer.dxf.name, 0),
                        )
                    )

            elif action == "create":
                name = op.name.strip()
                if not name:
                    raise ValueError("Layer name cannot be empty")
                if name not in self.doc.layers:
                    color = op.color if op.color is not None else colors.WHITE
                    linetype = op.linetype or "Continuous"
                    layer = self.doc.layers.add(name, color=color, linetype=linetype)
                    results.append({
                        "action": "create",
                        "status": "created",
                        "layer": name,
                        "color": layer.color,
                        "linetype": layer.dxf.linetype,
                    })
                else:
                    results.append({
                        "action": "create",
                        "status": "exists",
                        "layer": name,
                    })

            elif action == "rename":
                name = op.name.strip()
                new_name = (op.new_name or "").strip()
                if not name or not new_name:
                    raise ValueError("Both 'name' and 'new_name' required for layer rename")
                if name not in self.doc.layers:
                    raise ValueError(f"Source layer '{name}' does not exist")
                if new_name in self.doc.layers:
                    raise ValueError(f"Destination layer '{new_name}' already exists")

                old_layer = self.doc.layers.get(name)
                new_layer = self.doc.layers.add(
                    new_name,
                    color=old_layer.color,
                    linetype=old_layer.dxf.linetype,
                )
                reassigned = 0
                for e in self.msp:
                    if e.dxf.layer == name:
                        e.dxf.layer = new_name
                        reassigned += 1
                self.doc.layers.remove(name)
                results.append({
                    "action": "rename",
                    "status": "renamed",
                    "old_layer": name,
                    "new_layer": new_name,
                    "entities_reassigned": reassigned,
                })

            elif action == "delete":
                name = op.name.strip()
                if name in ("0", "DEFPOINTS"):
                    raise ValueError(f"Cannot delete reserved layer '{name}'")
                if name not in self.doc.layers:
                    results.append({"action": "delete", "status": "not_found", "layer": name})
                    continue

                cnt = entity_counts.get(name, 0)
                if cnt > 0 and not op.force:
                    raise ValueError(
                        f"Layer '{name}' contains {cnt} entities. Use force=True to delete with entities."
                    )

                if cnt > 0 and op.force:
                    to_remove = [e for e in self.msp if e.dxf.layer == name]
                    for e in to_remove:
                        self.msp.delete_entity(e)

                self.doc.layers.remove(name)
                results.append({"action": "delete", "status": "deleted", "layer": name, "deleted_entities": cnt})

            elif action in ("set_visibility", "toggle_visibility", "modify"):
                name = op.name.strip()
                if name not in self.doc.layers:
                    raise ValueError(f"Layer '{name}' does not exist")
                layer = self.doc.layers.get(name)
                if action == "toggle_visibility" and op.is_visible is None:
                    if layer.is_on():
                        layer.off()
                    else:
                        layer.on()
                elif op.is_visible is not None:
                    if op.is_visible:
                        layer.on()
                    else:
                        layer.off()

                if op.is_locked is not None:
                    if op.is_locked:
                        layer.lock()
                    else:
                        layer.unlock()

                if op.color is not None:
                    layer.color = int(op.color)
                if op.linetype is not None:
                    layer.dxf.linetype = str(op.linetype)

                results.append({
                    "action": action,
                    "status": "updated",
                    "layer": name,
                    "is_visible": layer.is_on(),
                    "is_locked": layer.is_locked(),
                    "color": layer.color,
                    "linetype": layer.dxf.linetype,
                })

            else:
                raise ValueError(f"Unknown layer action: '{action}'")

        return results

    def manage_blocks(
        self,
        action: str,
        name: Optional[str] = None,
        base_point: Tuple[float, float] = (0.0, 0.0),
        entity_handles: Optional[List[str]] = None,
        insertions: Optional[List[Dict[str, Any]]] = None,
        attributes: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        act = action.lower()

        if act == "create":
            if not name:
                raise ValueError("Block name is required for 'create'")
            if name in self.doc.blocks:
                raise ValueError(f"Block '{name}' already exists")

            block = self.doc.blocks.new(name=name, base_point=base_point)

            copied = 0
            if entity_handles:
                for h in entity_handles:
                    ent = self._get_entity_by_handle(h)
                    if ent:
                        dup = self.doc.entitydb.duplicate_entity(ent)
                        m = Matrix44.translate(-base_point[0], -base_point[1], 0.0)
                        dup.transform(m)
                        block.add_entity(dup)
                        copied += 1

            return {
                "action": "create",
                "status": "created",
                "block_name": name,
                "base_point": list(base_point),
                "entities_included": copied,
            }

        elif act == "insert":
            if not name:
                raise ValueError("Block name is required for 'insert'")
            if name not in self.doc.blocks:
                raise ValueError(f"Block '{name}' not found in drawing")

            insert_list = insertions or [{}]
            inserted_handles = []

            for ins in insert_list:
                loc = tuple(ins.get("insert", [0.0, 0.0]))
                rot = float(ins.get("rotation", 0.0))
                scale = float(ins.get("scale", 1.0))
                layer = str(ins.get("layer", "0"))
                block_ref = self.msp.add_blockref(
                    name,
                    insert=loc,
                    dxfattribs={"rotation": rot, "xscale": scale, "yscale": scale, "layer": layer},
                )
                attr_dict = ins.get("attributes") or attributes
                if attr_dict:
                    for tag, val in attr_dict.items():
                        block_ref.add_attrib(tag, str(val))

                inserted_handles.append(str(block_ref.dxf.handle))

            return {
                "action": "insert",
                "status": "inserted",
                "block_name": name,
                "count": len(inserted_handles),
                "inserted_handles": inserted_handles,
            }

        elif act == "list":
            blocks_info = []
            for b in self.doc.blocks:
                if not b.name.startswith("*"):
                    blocks_info.append({
                        "name": b.name,
                        "base_point": [b.base_point.x, b.base_point.y],
                        "entity_count": len(b),
                        "description": getattr(b.block, "dxf", {}).get("description", ""),
                    })
            return {"action": "list", "blocks": blocks_info, "total_blocks": len(blocks_info)}

        elif act == "audit":
            counts: Dict[str, int] = {}
            for e in self.msp:
                if e.dxftype() == "INSERT":
                    bname = e.dxf.name
                    counts[bname] = counts.get(bname, 0) + 1

            unreferenced = []
            for b in self.doc.blocks:
                if not b.name.startswith("*") and counts.get(b.name, 0) == 0:
                    unreferenced.append(b.name)

            return {
                "action": "audit",
                "defined_blocks": [b.name for b in self.doc.blocks if not b.name.startswith("*")],
                "insertion_counts": counts,
                "unreferenced_blocks": unreferenced,
            }

        elif act == "read_attributes":
            found_attributes = []
            for e in self.msp:
                if e.dxftype() == "INSERT":
                    if entity_handles and str(e.dxf.handle) not in entity_handles:
                        continue
                    if name and e.dxf.name != name:
                        continue
                    attribs = {att.dxf.tag: att.dxf.text for att in e.attribs}
                    found_attributes.append({
                        "handle": str(e.dxf.handle),
                        "block_name": e.dxf.name,
                        "attributes": attribs,
                    })
            return {"action": "read_attributes", "results": found_attributes}

        elif act == "write_attributes":
            if not attributes:
                raise ValueError("Attributes dictionary required for 'write_attributes'")
            updated_count = 0
            for e in self.msp:
                if e.dxftype() == "INSERT":
                    if entity_handles and str(e.dxf.handle) not in entity_handles:
                        continue
                    if name and e.dxf.name != name:
                        continue
                    existing_tags = set()
                    for att in e.attribs:
                        existing_tags.add(att.dxf.tag)
                        if att.dxf.tag in attributes:
                            att.dxf.text = str(attributes[att.dxf.tag])
                            updated_count += 1
                    for tag, val in attributes.items():
                        if tag not in existing_tags:
                            e.add_attrib(tag, str(val))
                            updated_count += 1
            return {
                "action": "write_attributes",
                "status": "updated",
                "attributes_updated": updated_count,
            }

        else:
            raise ValueError(f"Unknown block action: '{action}'")

    def query(
        self,
        filter_type: Optional[str] = None,
        filter_layer: Optional[str] = None,
        filter_color: Optional[int] = None,
        include_geometry: bool = True,
        calculate_bounds: bool = True,
    ) -> QueryResult:
        ftype = filter_type.upper() if filter_type else None
        flayer = filter_layer if filter_layer else None
        fcolor = int(filter_color) if filter_color is not None else None

        TYPE_ALIASES = {
            "RECTANGLE": {"LWPOLYLINE"},
            "POLYLINE": {"LWPOLYLINE", "POLYLINE"},
            "SPLINE": {"SPLINE"},
            "TEXT": {"TEXT", "MTEXT"},
            "DIMENSION": {"DIMENSION"},
            "DIM": {"DIMENSION"},
            "HATCH": {"HATCH"},
            "BLOCK": {"INSERT"},
            "INSERT": {"INSERT"},
            "BLOCK_REFERENCE": {"INSERT"},
        }
        target_types = TYPE_ALIASES.get(ftype, {ftype}) if ftype else None

        filtered_entities: List[Dict[str, Any]] = []
        counts_by_layer: Dict[str, int] = {}
        counts_by_type: Dict[str, int] = {}
        matched_ezdxf_entities = []

        for e in self.msp:
            etype = e.dxftype()
            layer = e.dxf.layer
            color = getattr(e.dxf, "color", None)

            if target_types and etype not in target_types:
                continue
            if flayer and layer != flayer:
                continue
            if fcolor is not None and color != fcolor:
                continue

            matched_ezdxf_entities.append(e)
            counts_by_layer[layer] = counts_by_layer.get(layer, 0) + 1
            counts_by_type[etype] = counts_by_type.get(etype, 0) + 1

            if include_geometry:
                geom: Dict[str, Any] = {
                    "handle": str(e.dxf.handle),
                    "type": etype,
                    "layer": layer,
                    "color": color,
                }
                try:
                    if etype == "LINE":
                        geom["start"] = [e.dxf.start.x, e.dxf.start.y]
                        geom["end"] = [e.dxf.end.x, e.dxf.end.y]
                        geom["length"] = _round_coord(math.hypot(e.dxf.end.x - e.dxf.start.x, e.dxf.end.y - e.dxf.start.y))
                    elif etype == "CIRCLE":
                        wcs_c = e.ocs().to_wcs(e.dxf.center)
                        geom["center"] = [_round_coord(wcs_c.x), _round_coord(wcs_c.y)]
                        geom["radius"] = _round_coord(e.dxf.radius)
                    elif etype == "ARC":
                        wcs_c = e.ocs().to_wcs(e.dxf.center)
                        geom["center"] = [_round_coord(wcs_c.x), _round_coord(wcs_c.y)]
                        geom["radius"] = _round_coord(e.dxf.radius)
                        geom["start_angle"] = _round_coord(e.dxf.start_angle, 2)
                        geom["end_angle"] = _round_coord(e.dxf.end_angle, 2)
                    elif etype == "LWPOLYLINE":
                        geom["points"] = [[p[0], p[1]] for p in e.get_points()]
                        geom["is_closed"] = e.closed
                    elif etype == "TEXT":
                        geom["insert"] = [e.dxf.insert.x, e.dxf.insert.y]
                        geom["text"] = str(e.dxf.text)
                        geom["height"] = _round_coord(e.dxf.height)
                    elif etype == "MTEXT":
                        geom["insert"] = [_round_coord(e.dxf.insert.x), _round_coord(e.dxf.insert.y)]
                        geom["text"] = str(getattr(e, "text", ""))
                        geom["height"] = _round_coord(getattr(e.dxf, "char_height", 2.5))
                    elif etype == "SPLINE":
                        if hasattr(e, "fit_points") and len(e.fit_points) > 0:
                            geom["fit_points"] = [
                                [_round_coord(p[0]), _round_coord(p[1])] for p in e.fit_points
                            ]
                        elif hasattr(e, "control_points") and len(e.control_points) > 0:
                            geom["control_points"] = [
                                [_round_coord(p[0]), _round_coord(p[1])] for p in e.control_points
                            ]
                        geom["degree"] = getattr(e.dxf, "degree", 3)
                        geom["is_closed"] = bool(getattr(e, "closed", False))
                    elif etype == "DIMENSION":
                        geom["dim_type"] = getattr(e.dxf, "dimtype", "linear")
                        if hasattr(e.dxf, "defpoint2"):
                            geom["start"] = [_round_coord(e.dxf.defpoint2.x), _round_coord(e.dxf.defpoint2.y)]
                        if hasattr(e.dxf, "defpoint3"):
                            geom["end"] = [_round_coord(e.dxf.defpoint3.x), _round_coord(e.dxf.defpoint3.y)]
                        geom["text"] = getattr(e.dxf, "text", "")
                    elif etype == "HATCH":
                        geom["pattern_name"] = getattr(e.dxf, "pattern_name", "SOLID")
                        geom["pattern_scale"] = _round_coord(getattr(e.dxf, "pattern_scale", 1.0))
                        geom["paths_count"] = len(e.paths)
                    elif etype == "INSERT":
                        geom["block_name"] = e.dxf.name
                        geom["insert"] = [e.dxf.insert.x, e.dxf.insert.y]
                        geom["rotation"] = _round_coord(getattr(e.dxf, "rotation", 0.0))
                except Exception:
                    pass

                filtered_entities.append(geom)

        # Bounding box
        bounds_dict: Optional[Dict[str, float]] = None
        if calculate_bounds and matched_ezdxf_entities:
            try:
                box = ezdxf.bbox.extents(matched_ezdxf_entities)
                if box.has_data:
                    bounds_dict = {
                        "min_x": _round_coord(box.extmin.x),
                        "min_y": _round_coord(box.extmin.y),
                        "max_x": _round_coord(box.extmax.x),
                        "max_y": _round_coord(box.extmax.y),
                        "width": _round_coord(box.extmax.x - box.extmin.x),
                        "height": _round_coord(box.extmax.y - box.extmin.y),
                    }
            except Exception:
                bounds_dict = None

        overall_box = ezdxf.bbox.extents(self.msp) if len(self.msp) > 0 else None
        overall_bounds = {
            "min_x": _round_coord(overall_box.extmin.x) if overall_box and overall_box.has_data else 0.0,
            "min_y": _round_coord(overall_box.extmin.y) if overall_box and overall_box.has_data else 0.0,
            "max_x": _round_coord(overall_box.extmax.x) if overall_box and overall_box.has_data else 0.0,
            "max_y": _round_coord(overall_box.extmax.y) if overall_box and overall_box.has_data else 0.0,
            "width": _round_coord(overall_box.extmax.x - overall_box.extmin.x) if overall_box and overall_box.has_data else 0.0,
            "height": _round_coord(overall_box.extmax.y - overall_box.extmin.y) if overall_box and overall_box.has_data else 0.0,
        }

        stats = DrawingStats(
            entity_count=len(self.msp),
            layer_count=len(self.doc.layers),
            block_count=len([b for b in self.doc.blocks if not b.name.startswith("*")]),
            bounds=overall_bounds,
            dxf_version=self._dxf_version,
            units=self._units_str,
        )

        return QueryResult(
            entities=filtered_entities,
            counts_by_layer=counts_by_layer,
            counts_by_type=counts_by_type,
            bounding_box=bounds_dict,
            stats=stats,
        )

    def render_png(
        self,
        width_px: int = 1280,
        height_px: int = 720,
        background: str = "white",
        show_grid: bool = False,
    ) -> bytes:
        dpi = 120
        fig_w = width_px / dpi
        fig_h = height_px / dpi

        fig = Figure(figsize=(fig_w, fig_h), dpi=dpi)
        canvas = FigureCanvasAgg(fig)
        ax = fig.add_axes([0.05, 0.05, 0.9, 0.9])

        bg_color = "white" if background.lower() == "white" else "#1a1a1a"
        fig.patch.set_facecolor(bg_color)
        ax.set_facecolor(bg_color)

        if show_grid:
            ax.grid(True, linestyle=":", alpha=0.5, color="#888888")
        else:
            ax.axis("off")

        if len(self.msp) > 0:
            ctx = RenderContext(self.doc)
            out = MatplotlibBackend(ax)
            Frontend(ctx, out).draw_layout(self.msp, finalize=True)
            ax.autoscale(True)
            ax.set_aspect("equal", adjustable="datalim")
        else:
            ax.text(
                0.5,
                0.5,
                "Blank Drawing",
                ha="center",
                va="center",
                color="#888888",
                fontsize=16,
                transform=ax.transAxes,
            )

        buf = io.BytesIO()
        canvas.print_figure(buf, format="png", facecolor=bg_color, edgecolor="none", dpi=dpi)
        return buf.getvalue()

    def get_diagnostics(self) -> Dict[str, Any]:
        return {
            "backend": self.backend_name,
            "dxf_version": self._dxf_version,
            "units": self._units_str,
            "entities_in_modelspace": len(self.msp),
            "layers_count": len(self.doc.layers),
            "blocks_count": len([b for b in self.doc.blocks if not b.name.startswith("*")]),
            "status": "healthy",
        }
