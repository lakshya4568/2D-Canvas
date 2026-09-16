"""
UPCE CAD FastMCP Server Bridge.
CLI and JSON execution bridge for native integration with UPCE 2D Canvas CAD Agent.

Usage:
    uv run python -m src.bridge '<json_payload>'
    uv run python -m src.bridge payload.json
    cat payload.json | uv run python -m src.bridge

Returns JSON on stdout:
{
    "success": true,
    "dxf": "...",
    "previewPng": "...",
    "preview_png": "...",
    "entityCount": 10,
    "entity_count": 10,
    "bounds": { "minX": ..., "minY": ..., "maxX": ..., "maxY": ..., "width": ..., "height": ... },
    "toolResults": [...],
    "tool_results": [...]
}
"""

from __future__ import annotations

import io
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
import re
import sys
from typing import Any, Dict, List, Optional, Tuple, Union
import warnings

# Suppress non-critical library warnings so stdout stays pure JSON
warnings.filterwarnings("ignore")

# Ensure matplotlib runs headlessly
import matplotlib
matplotlib.use("Agg")

from src.tools.blocks import execute_manage_blocks
from src.tools.draw import execute_draw_entities
from src.tools.layers import execute_manage_layers
from src.tools.models import EntityInput, LayerOperationInput, TransformOperationInput
from src.tools.query import execute_query_drawing
from src.tools.render import execute_render_preview
from src.tools.session import DrawingSession
from src.tools.session_ops import execute_manage_session
from src.tools.transform import execute_transform_entities

# Setup rotating file logger (never stdout)
logs_dir = Path("logs")
logs_dir.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("cad_bridge")
logger.setLevel(logging.INFO)
if not logger.handlers:
    fh = RotatingFileHandler(logs_dir / "cad_bridge.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(logging.Formatter('{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}'))
    logger.addHandler(fh)


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _normalize_point(p: Any) -> List[float]:
    """Converts diverse point representations ({x, y}, [x, y], (x, y)) into [float, float]."""
    if isinstance(p, dict):
        return [_safe_float(p.get("x", 0.0)), _safe_float(p.get("y", 0.0))]
    if isinstance(p, (list, tuple)) and len(p) >= 2:
        return [_safe_float(p[0], 0.0), _safe_float(p[1], 0.0)]
    return [0.0, 0.0]


def _normalize_points(pts: Any) -> List[List[float]]:
    """Converts a collection of points into [[float, float], ...]."""
    if not isinstance(pts, (list, tuple)):
        return []
    return [_normalize_point(p) for p in pts]


def _normalize_entity_dict(e: Dict[str, Any]) -> EntityInput:
    """
    Sanitizes raw entity dicts from API / agent / tool inputs into valid EntityInput.
    Ensures polyline points are lists of floats, circular radiuses are extracted, etc.
    """
    etype = str(e.get("entity_type") or e.get("type") or "line").lower()
    raw_params = e.get("params") or e.get("parameters") or {}
    params: Dict[str, Any] = dict(raw_params) if isinstance(raw_params, dict) else {}

    # Promote unnested fields if present at root of entity
    for k in (
        "center", "radius", "origin", "width", "height", "start", "end",
        "points", "fit_points", "insert", "text", "is_closed", "closed",
        "start_angle", "end_angle", "startAngle", "endAngle", "cx", "cy", "r"
    ):
        if k in e and k not in params:
            params[k] = e[k]

    if etype == "polyline":
        raw_pts = params.get("points") or []
        params["points"] = _normalize_points(raw_pts)
        if "closed" in params and "is_closed" not in params:
            params["is_closed"] = bool(params["closed"])
        elif "isClosed" in params and "is_closed" not in params:
            params["is_closed"] = bool(params["isClosed"])

    elif etype == "spline":
        raw_pts = params.get("fit_points") or params.get("points") or []
        params["fit_points"] = _normalize_points(raw_pts)

    elif etype == "line":
        if "start" in params:
            params["start"] = _normalize_point(params["start"])
        elif "x1" in params and "y1" in params:
            params["start"] = [_safe_float(params["x1"]), _safe_float(params["y1"])]
        if "end" in params:
            params["end"] = _normalize_point(params["end"])
        elif "x2" in params and "y2" in params:
            params["end"] = [_safe_float(params["x2"]), _safe_float(params["y2"])]

    elif etype == "circle":
        if "center" in params:
            params["center"] = _normalize_point(params["center"])
        elif "cx" in params and "cy" in params:
            params["center"] = [_safe_float(params["cx"]), _safe_float(params["cy"])]
        if "r" in params and "radius" not in params:
            params["radius"] = _safe_float(params["r"])
        elif "diameter" in params and "radius" not in params:
            params["radius"] = _safe_float(params["diameter"]) / 2.0

    elif etype == "arc":
        if "center" in params:
            params["center"] = _normalize_point(params["center"])
        elif "cx" in params and "cy" in params:
            params["center"] = [_safe_float(params["cx"]), _safe_float(params["cy"])]
        if "radius" not in params and "r" in params:
            params["radius"] = _safe_float(params["r"])
        if "startAngle" in params and "start_angle" not in params:
            params["start_angle"] = _safe_float(params["startAngle"])
        if "endAngle" in params and "end_angle" not in params:
            params["end_angle"] = _safe_float(params["endAngle"])

    elif etype == "rectangle":
        if "origin" in params:
            params["origin"] = _normalize_point(params["origin"])
        elif "x" in params and "y" in params:
            params["origin"] = [_safe_float(params["x"]), _safe_float(params["y"])]

    elif etype == "text":
        if "insert" in params:
            params["insert"] = _normalize_point(params["insert"])
        elif "x" in params and "y" in params:
            params["insert"] = [_safe_float(params["x"]), _safe_float(params["y"])]

    layer = str(e.get("layer") or params.get("layer", "OUTLINE"))
    color = e.get("color") if e.get("color") is not None else params.get("color")
    linetype = e.get("linetype") or params.get("linetype")

    return EntityInput(
        entity_type=etype,
        params=params,
        layer=layer,
        color=color,
        linetype=linetype,
    )


def _parse_prompt_to_entities(prompt: str) -> Tuple[List[EntityInput], List[LayerOperationInput]]:
    """
    Translates natural-language CAD engineering prompts into FastMCP EntityInput objects.
    Supports civil bridges, box culverts, T-beams, steel plates, rebars, and primitives.
    """
    lower = prompt.lower()
    entities: List[EntityInput] = []
    layers: List[LayerOperationInput] = []

    # 1. Circle: "Draw a circle at (200, 150) with radius 50" or "diameter 100"
    if "circle" in lower:
        cx, cy, r = 0.0, 0.0, 50.0
        coord_match = re.search(r'(?:at|center)\s*\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?', prompt, re.IGNORECASE)
        if coord_match:
            cx = _safe_float(coord_match.group(1), 0.0)
            cy = _safe_float(coord_match.group(2), 0.0)
        radius_match = re.search(r'radius\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
        dia_match = re.search(r'diameter\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
        if radius_match:
            r = _safe_float(radius_match.group(1), 50.0)
        elif dia_match:
            r = _safe_float(dia_match.group(1), 100.0) / 2.0
        entities.append(EntityInput(
            entity_type="circle",
            params={"center": [cx, cy], "radius": r},
            layer="OUTLINE",
            color=4,
        ))
        return entities, layers

    # 2. Steel Plate with Corner Bolt Holes & Centerlines
    if ("plate" in lower or "bolt" in lower) and re.search(r'(\d+)\s*[xX*]\s*(\d+)', prompt):
        dim_match = re.search(r'(\d+)\s*[xX*]\s*(\d+)', prompt)
        w = _safe_float(dim_match.group(1), 400.0)
        h = _safe_float(dim_match.group(2), 250.0)
        r_hole = 15.0
        hole_match = re.search(r'(?:radius|r\s*=)\s*(\d+(?:\.\d+)?)', prompt, re.IGNORECASE)
        if hole_match:
            r_hole = _safe_float(hole_match.group(1), 15.0)

        # Outer plate rectangle
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [0.0, 0.0], "width": w, "height": h},
            layer="OUTLINE",
            color=7,
        ))

        # 4 Corner bolt holes (offset by 35mm from corners)
        margin = max(25.0, r_hole * 2.0)
        hole_centers = [
            [margin, margin],
            [w - margin, margin],
            [w - margin, h - margin],
            [margin, h - margin],
        ]
        for hc in hole_centers:
            entities.append(EntityInput(
                entity_type="circle",
                params={"center": hc, "radius": r_hole},
                layer="OUTLINE",
                color=4,
            ))

        # Centerlines
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [-20.0, h / 2.0], "end": [w + 20.0, h / 2.0]},
            layer="CENTERLINE",
            color=1,
            linetype="CENTER",
        ))
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [w / 2.0, -20.0], "end": [w / 2.0, h + 20.0]},
            layer="CENTERLINE",
            color=1,
            linetype="CENTER",
        ))
        return entities, layers

    # 3. RCC T-Beam Bridge: "Draw the cross-section of an RCC T-beam bridge, span 20 m"
    if "t-beam" in lower or "tee beam" in lower:
        span = 20000.0
        span_match = re.search(r'span\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*(m|mm)?', prompt, re.IGNORECASE)
        if span_match:
            val = _safe_float(span_match.group(1), 20.0)
            unit = span_match.group(2) or ("m" if val < 100 else "mm")
            span = val * 1000.0 if unit.lower() == "m" else val

        depth = round(span / 12.0)
        slab_thk = round(span / 25.0)
        flange_w = 2200.0
        web_thk = 350.0
        haunch = 150.0

        # Centerline
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [0.0, -200.0], "end": [0.0, depth + 200.0]},
            layer="CENTERLINE",
            color=1,
            linetype="CENTER",
        ))
        # Top Deck Slab
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [-flange_w / 2.0, depth - slab_thk], "width": flange_w, "height": slab_thk},
            layer="OUTLINE",
            color=7,
        ))
        # Girder Web
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [-web_thk / 2.0, 0.0], "width": web_thk, "height": depth - slab_thk},
            layer="OUTLINE",
            color=7,
        ))
        # Left & Right Haunches
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [-web_thk / 2.0, depth - slab_thk - haunch], "end": [-web_thk / 2.0 - haunch, depth - slab_thk]},
            layer="OUTLINE",
            color=8,
        ))
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [web_thk / 2.0, depth - slab_thk - haunch], "end": [web_thk / 2.0 + haunch, depth - slab_thk]},
            layer="OUTLINE",
            color=8,
        ))
        # Rebars
        entities.append(EntityInput(entity_type="circle", params={"center": [-web_thk / 2.0 + 50.0, 60.0], "radius": 16.0}, layer="REBAR", color=3))
        entities.append(EntityInput(entity_type="circle", params={"center": [0.0, 60.0], "radius": 16.0}, layer="REBAR", color=3))
        entities.append(EntityInput(entity_type="circle", params={"center": [web_thk / 2.0 - 50.0, 60.0], "radius": 16.0}, layer="REBAR", color=3))
        # Dimensions
        entities.append(EntityInput(
            entity_type="dimension",
            params={"start": [-web_thk / 2.0, -100.0], "end": [web_thk / 2.0, -100.0], "text": f"WEB: {web_thk} mm"},
            layer="DIMENSIONS",
            color=3,
        ))
        entities.append(EntityInput(
            entity_type="dimension",
            params={"start": [flange_w / 2.0 + 100.0, 0.0], "end": [flange_w / 2.0 + 100.0, depth], "text": f"DEPTH: {depth} mm"},
            layer="DIMENSIONS",
            color=3,
        ))
        return entities, layers

    # 4. Box Culvert (Single or Twin-Cell): "Draw a twin-cell RCC box culvert with span 4000 mm, height 3000 mm"
    if "culvert" in lower or ("box" in lower and "bridge" in lower):
        is_twin = bool(re.search(r'\b(?:twin|2-cell|two-cell|double)\b', prompt, re.IGNORECASE))
        span_match = re.search(r'span\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)', prompt, re.IGNORECASE)
        span = _safe_float(span_match.group(1), 4000.0) if span_match else 4000.0
        h_match = re.search(r'height\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)', prompt, re.IGNORECASE)
        h = _safe_float(h_match.group(1), 3000.0) if h_match else 3000.0

        wall_thk = 400.0
        slab_thk = 400.0
        haunch = 300.0
        web_mid = 400.0 if is_twin else 0.0

        total_w = (span * 2.0 + wall_thk * 2.0 + web_mid) if is_twin else (span + wall_thk * 2.0)
        total_h = h + slab_thk * 2.0

        # Outer boundary
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [0.0, 0.0], "width": total_w, "height": total_h},
            layer="OUTLINE",
            color=7,
        ))

        # Inner Cell 1
        x1 = wall_thk
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [x1, slab_thk], "width": span, "height": h},
            layer="OUTLINE",
            color=4,
        ))

        # Inner Cell 2 (if twin-cell)
        if is_twin:
            x2 = wall_thk + span + web_mid
            entities.append(EntityInput(
                entity_type="rectangle",
                params={"origin": [x2, slab_thk], "width": span, "height": h},
                layer="OUTLINE",
                color=4,
            ))
            # Intermediate web centerline
            entities.append(EntityInput(
                entity_type="line",
                params={"start": [wall_thk + span + web_mid / 2.0, -100.0], "end": [wall_thk + span + web_mid / 2.0, total_h + 100.0]},
                layer="CENTERLINE",
                color=1,
                linetype="CENTER",
            ))

        # Haunch witness lines in Cell 1
        entities.append(EntityInput(entity_type="line", params={"start": [x1, slab_thk + haunch], "end": [x1 + haunch, slab_thk]}, layer="OUTLINE", color=8))
        entities.append(EntityInput(entity_type="line", params={"start": [x1 + span - haunch, slab_thk], "end": [x1 + span, slab_thk + haunch]}, layer="OUTLINE", color=8))
        entities.append(EntityInput(entity_type="line", params={"start": [x1, slab_thk + h - haunch], "end": [x1 + haunch, slab_thk + h]}, layer="OUTLINE", color=8))
        entities.append(EntityInput(entity_type="line", params={"start": [x1 + span - haunch, slab_thk + h], "end": [x1 + span, slab_thk + h - haunch]}, layer="OUTLINE", color=8))

        # Overall Dimensions
        entities.append(EntityInput(
            entity_type="dimension",
            params={"start": [0.0, -150.0], "end": [total_w, -150.0], "text": f"TOTAL WIDTH: {total_w:.0f} mm"},
            layer="DIMENSIONS",
            color=3,
        ))
        entities.append(EntityInput(
            entity_type="dimension",
            params={"start": [total_w + 150.0, 0.0], "end": [total_w + 150.0, total_h], "text": f"TOTAL HEIGHT: {total_h:.0f} mm"},
            layer="DIMENSIONS",
            color=3,
        ))
        return entities, layers

    # 5. Beam Reinforcement Detail: "Draw beam longitudinal section with top 3-T20 rebars and bottom 4-T25 rebars"
    if "rebar" in lower or "stirrup" in lower or ("beam" in lower and "section" in lower):
        beam_len = 4000.0
        beam_depth = 600.0
        cover = 40.0

        # Beam Outline
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [0.0, 0.0], "width": beam_len, "height": beam_depth},
            layer="OUTLINE",
            color=7,
        ))

        # Top longitudinal rebars
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [cover, beam_depth - cover], "end": [beam_len - cover, beam_depth - cover]},
            layer="REBAR",
            color=1,
        ))
        # Bottom longitudinal rebars
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [cover, cover], "end": [beam_len - cover, cover]},
            layer="REBAR",
            color=1,
        ))

        # Stirrups along beam span (every 200 mm)
        spacing = 200.0
        x = cover + 50.0
        while x < beam_len - cover:
            entities.append(EntityInput(
                entity_type="line",
                params={"start": [x, cover], "end": [x, beam_depth - cover]},
                layer="REBAR",
                color=3,
            ))
            x += spacing

        entities.append(EntityInput(
            entity_type="dimension",
            params={"start": [0.0, -100.0], "end": [beam_len, -100.0], "text": f"SPAN: {beam_len} mm"},
            layer="DIMENSIONS",
            color=3,
        ))
        return entities, layers

    # 6. Bridge Pier / Substructure: "Draw an RCC bridge pier with cap beam 8500 mm wide, pier column diameter 1800 mm..."
    if "pier" in lower or "cap beam" in lower or "column" in lower:
        cap_w = 8500.0
        cap_h = 1800.0
        col_dia = 1800.0
        col_h = 6000.0
        footing_w = 6000.0
        footing_h = 1500.0

        # Centerline
        entities.append(EntityInput(
            entity_type="line",
            params={"start": [0.0, -500.0], "end": [0.0, footing_h + col_h + cap_h + 500.0]},
            layer="CENTERLINE",
            color=1,
            linetype="CENTER",
        ))
        # Footing
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [-footing_w / 2.0, 0.0], "width": footing_w, "height": footing_h},
            layer="OUTLINE",
            color=7,
        ))
        # Column
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [-col_dia / 2.0, footing_h], "width": col_dia, "height": col_h},
            layer="OUTLINE",
            color=7,
        ))
        # Cap Beam
        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [-cap_w / 2.0, footing_h + col_h], "width": cap_w, "height": cap_h},
            layer="OUTLINE",
            color=7,
        ))
        # Dimension
        entities.append(EntityInput(
            entity_type="dimension",
            params={"start": [-cap_w / 2.0, footing_h + col_h + cap_h + 200.0], "end": [cap_w / 2.0, footing_h + col_h + cap_h + 200.0], "text": f"PIER CAP: {cap_w} mm"},
            layer="DIMENSIONS",
            color=3,
        ))
        return entities, layers

    # 7. Arc: "Draw an arc at (100, 100) with radius 50 from 0 to 180"
    if "arc" in lower:
        cx, cy, r, sa, ea = 0.0, 0.0, 50.0, 0.0, 90.0
        coord_match = re.search(r'(?:at|center)\s*\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?', prompt, re.IGNORECASE)
        if coord_match:
            cx = _safe_float(coord_match.group(1), 0.0)
            cy = _safe_float(coord_match.group(2), 0.0)
        r_match = re.search(r'radius\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
        dia_match = re.search(r'diameter\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
        if r_match:
            r = _safe_float(r_match.group(1), 50.0)
        elif dia_match:
            r = _safe_float(dia_match.group(1), 100.0) / 2.0
        angles_match = re.search(r'(?:from|angles?)\s*([-\d.]+)\s*(?:to|and|-)\s*([-\d.]+)', prompt, re.IGNORECASE)
        if angles_match:
            sa = _safe_float(angles_match.group(1), 0.0)
            ea = _safe_float(angles_match.group(2), 90.0)
        entities.append(EntityInput(
            entity_type="arc",
            params={"center": [cx, cy], "radius": r, "start_angle": sa, "end_angle": ea},
            layer="OUTLINE",
            color=4,
        ))
        return entities, layers

    # 8. Polyline: "Draw a polyline with points (0,0), (100,0), (100,100), (0,100) closed"
    if "polyline" in lower or "polygon" in lower:
        pts = []
        for m in re.finditer(r'\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?', prompt):
            pts.append([_safe_float(m.group(1)), _safe_float(m.group(2))])
        is_closed = bool(re.search(r'\b(?:closed|close)\b', prompt, re.IGNORECASE))
        if len(pts) >= 2:
            entities.append(EntityInput(
                entity_type="polyline",
                params={"points": pts, "is_closed": is_closed},
                layer="OUTLINE",
                color=7,
            ))
            return entities, layers

    # 9. Text / Annotation: "Draw text 'FOUNDATION' at (100, 200) height 20"
    if re.search(r'\b(?:text|label|annotation|title)\b', lower):
        x, y = 0.0, 0.0
        coord_match = re.search(r'(?:at|origin|insert)\s*\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?', prompt, re.IGNORECASE)
        if coord_match:
            x = _safe_float(coord_match.group(1), 0.0)
            y = _safe_float(coord_match.group(2), 0.0)
        text_match = re.search(r'[\'"]([^\'"]+)[\'"]', prompt)
        txt = text_match.group(1) if text_match else "ANNOTATION"
        h_match = re.search(r'height\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
        th = _safe_float(h_match.group(1), 10.0) if h_match else 10.0
        entities.append(EntityInput(
            entity_type="text",
            params={"insert": [x, y], "text": txt, "height": th, "rotation": 0.0},
            layer="ANNOTATIONS",
            color=7,
        ))
        return entities, layers

    # 10. Dimension: "Add dimension from (0,0) to (100,0) text '100 mm'"
    if "dimension" in lower or re.search(r'\bdim\b', lower):
        pts = []
        for m in re.finditer(r'\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?', prompt):
            pts.append([_safe_float(m.group(1)), _safe_float(m.group(2))])
        text_match = re.search(r'[\'"]([^\'"]+)[\'"]', prompt)
        dim_text = text_match.group(1) if text_match else ""
        if len(pts) >= 2:
            entities.append(EntityInput(
                entity_type="dimension",
                params={"start": pts[0], "end": pts[1], "text": dim_text},
                layer="DIMENSIONS",
                color=3,
            ))
            return entities, layers

    # 11. Generic Rectangle: "Draw a rectangle with width 500 and height 300 at origin"
    if "rectangle" in lower or re.search(r'\b(?:rect|box)\b', lower):
        w, h = 500.0, 300.0
        w_match = re.search(r'width\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
        h_match = re.search(r'height\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
        if w_match:
            w = _safe_float(w_match.group(1), 500.0)
        if h_match:
            h = _safe_float(h_match.group(1), 300.0)

        x, y = 0.0, 0.0
        coord_match = re.search(r'(?:at|origin)\s*\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?', prompt, re.IGNORECASE)
        if coord_match:
            x = _safe_float(coord_match.group(1), 0.0)
            y = _safe_float(coord_match.group(2), 0.0)

        entities.append(EntityInput(
            entity_type="rectangle",
            params={"origin": [x, y], "width": w, "height": h},
            layer="OUTLINE",
            color=7,
        ))
        return entities, layers

    # 12. Generic Line: "Draw a line between (10, 20) and (80, 90)" or "Draw a line from (0,0) of length 1200 mm"
    if re.search(r'\bline\b', lower):
        coord_pairs = []
        for m in re.finditer(r'\(?\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)?', prompt):
            coord_pairs.append([_safe_float(m.group(1)), _safe_float(m.group(2))])

        if len(coord_pairs) >= 2:
            x1, y1 = coord_pairs[0]
            x2, y2 = coord_pairs[1]
        elif len(coord_pairs) == 1:
            x1, y1 = coord_pairs[0]
            len_match = re.search(r'length\s*(?:of|=|:)?\s*([-\d.]+)', prompt, re.IGNORECASE)
            length = _safe_float(len_match.group(1), 1000.0) if len_match else 1000.0
            x2 = x1 + length
            y2 = y1
        else:
            x1, y1, x2, y2 = 0.0, 0.0, 1000.0, 0.0

        entities.append(EntityInput(
            entity_type="line",
            params={"start": [x1, y1], "end": [x2, y2]},
            layer="OUTLINE",
            color=7,
        ))
        return entities, layers

    # Fallback default: clean bounding box and origin marker
    entities.append(EntityInput(
        entity_type="rectangle",
        params={"origin": [0.0, 0.0], "width": 500.0, "height": 300.0},
        layer="OUTLINE",
        color=7,
    ))
    return entities, layers


def _normalize_tool_operation(op: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Normalizes diverse tool call representations into standard FastMCP tool execution specs.
    Handles 'draw_entities', 'draw_circle', 'draw_line', 'draw_rectangle', 'draw_arc',
    'draw_polyline', 'draw_spline', 'draw_text', 'add_dimension', etc.
    Supports MCP arguments, parameters, input, args, or flattened keyword arguments.
    """
    tool_name = op.get("tool") or op.get("name") or ""
    args = (
        op.get("args")
        or op.get("parameters")
        or op.get("arguments")
        or op.get("input")
    )
    if args is None:
        args = {k: v for k, v in op.items() if k not in ("tool", "name")}
    elif not isinstance(args, dict):
        args = {"value": args}

    if not tool_name:
        return None

    # Already unified FastMCP tool
    if tool_name in (
        "draw_entities",
        "manage_layers",
        "manage_blocks",
        "transform_entities",
        "query_drawing",
        "manage_session",
        "render_preview",
    ):
        return {"tool": tool_name, "args": args}

    # Map single primitive tools into draw_entities
    layer = str(args.get("layer", "OUTLINE"))
    color = args.get("color")

    if tool_name == "draw_circle":
        cx = _safe_float(args.get("cx", args.get("x", 0)))
        cy = _safe_float(args.get("cy", args.get("y", 0)))
        r = _safe_float(args.get("r", args.get("radius", 25)))
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "circle", "params": {"center": [cx, cy], "radius": r}, "layer": layer, "color": color}
                ]
            },
        }

    if tool_name == "draw_rectangle":
        x = _safe_float(args.get("x", 0))
        y = _safe_float(args.get("y", 0))
        w = _safe_float(args.get("width", 100))
        h = _safe_float(args.get("height", 100))
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "rectangle", "params": {"origin": [x, y], "width": w, "height": h}, "layer": layer, "color": color}
                ]
            },
        }

    if tool_name == "draw_line":
        x1 = _safe_float(args.get("x1", 0))
        y1 = _safe_float(args.get("y1", 0))
        x2 = _safe_float(args.get("x2", 100))
        y2 = _safe_float(args.get("y2", 0))
        linetype = "CENTER" if args.get("isReference") or layer == "CENTERLINE" else "Continuous"
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "line", "params": {"start": [x1, y1], "end": [x2, y2]}, "layer": layer, "color": color, "linetype": linetype}
                ]
            },
        }

    if tool_name == "draw_arc":
        cx = _safe_float(args.get("cx", 0))
        cy = _safe_float(args.get("cy", 0))
        r = _safe_float(args.get("radius", args.get("r", 50)))
        sa = _safe_float(args.get("startAngle", args.get("start_angle", 0)))
        ea = _safe_float(args.get("endAngle", args.get("end_angle", 90)))
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "arc", "params": {"center": [cx, cy], "radius": r, "start_angle": sa, "end_angle": ea}, "layer": layer, "color": color}
                ]
            },
        }

    if tool_name == "draw_polyline":
        raw_pts = args.get("points", [])
        pts = _normalize_points(raw_pts)
        is_closed = bool(args.get("isClosed", args.get("closed", False)))
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "polyline", "params": {"points": pts, "is_closed": is_closed}, "layer": layer, "color": color}
                ]
            },
        }

    if tool_name == "draw_spline":
        raw_pts = args.get("fit_points", args.get("points", []))
        pts = _normalize_points(raw_pts)
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "spline", "params": {"fit_points": pts}, "layer": layer, "color": color}
                ]
            },
        }

    if tool_name == "draw_text":
        x = _safe_float(args.get("x", 0))
        y = _safe_float(args.get("y", 0))
        text = str(args.get("text", ""))
        height = _safe_float(args.get("height", 10))
        rot = _safe_float(args.get("rotation", 0))
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "text", "params": {"insert": [x, y], "text": text, "height": height, "rotation": rot}, "layer": layer, "color": color}
                ]
            },
        }

    if tool_name == "add_dimension":
        x1 = _safe_float(args.get("x1", 0))
        y1 = _safe_float(args.get("y1", 0))
        x2 = _safe_float(args.get("x2", 100))
        y2 = _safe_float(args.get("y2", 0))
        text = str(args.get("text", ""))
        return {
            "tool": "draw_entities",
            "args": {
                "entities": [
                    {"entity_type": "dimension", "params": {"start": [x1, y1], "end": [x2, y2], "text": text}, "layer": "DIMENSIONS", "color": 3}
                ]
            },
        }

    return None


def execute_bridge(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Core bridge execution engine.
    Initializes a DrawingSession, executes requested FastMCP tools,
    performs self-verification (query_drawing + render_preview),
    and returns complete DXF, Base64 PNG preview, and metrics.
    """
    session = DrawingSession(config_path="config.json")
    session.reset_drawing()

    raw_ops = payload.get("operations") or payload.get("steps") or payload.get("tool_calls") or []
    # If a single tool operation is passed at the root of payload
    if not raw_ops and ("tool" in payload or "name" in payload):
        raw_ops = [payload]

    prompt = payload.get("prompt")
    entities_direct = payload.get("entities")

    executed_results: List[Dict[str, Any]] = []

    # If direct entity list supplied
    if entities_direct:
        if isinstance(entities_direct, dict):
            entities_direct = [entities_direct]
        if isinstance(entities_direct, list):
            parsed_entities = [_normalize_entity_dict(e) if isinstance(e, dict) else e for e in entities_direct]
            res = execute_draw_entities(session, parsed_entities, allow_duplicates=payload.get("allow_duplicates", False))
            executed_results.append({
                "tool": "draw_entities",
                "success": not res.is_error,
                "result": res.structured_content,
            })

    # If operations supplied
    for op in raw_ops:
        normalized = _normalize_tool_operation(op)
        if not normalized:
            continue

        tool = normalized["tool"]
        args = normalized.get("args", {})

        try:
            if tool == "draw_entities":
                raw_e = args.get("entities")
                if raw_e is None:
                    raw_e = [args] if ("entity_type" in args or "type" in args) else []
                elif isinstance(raw_e, dict):
                    raw_e = [raw_e]
                e_list = [_normalize_entity_dict(e) if isinstance(e, dict) else e for e in raw_e]
                res = execute_draw_entities(session, e_list, allow_duplicates=args.get("allow_duplicates", False))
                executed_results.append({"tool": tool, "success": not res.is_error, "result": res.structured_content})

            elif tool == "manage_layers":
                ops_data = args.get("operations")
                if ops_data is None:
                    ops_data = [args] if ("action" in args or "name" in args or "layer" in args) else []
                elif isinstance(ops_data, dict):
                    ops_data = [ops_data]
                normalized_layer_ops = []
                for l in ops_data:
                    if isinstance(l, dict):
                        l_copy = dict(l)
                        if "layer" in l_copy and "name" not in l_copy:
                            l_copy["name"] = l_copy["layer"]
                        if "action" not in l_copy:
                            l_copy["action"] = "create"
                        normalized_layer_ops.append(LayerOperationInput(**l_copy))
                    else:
                        normalized_layer_ops.append(l)
                res = execute_manage_layers(session, normalized_layer_ops)
                executed_results.append({"tool": tool, "success": not res.is_error, "result": res.structured_content})

            elif tool == "manage_blocks":
                block_args = dict(args)
                if "base_point" in block_args:
                    block_args["base_point"] = _normalize_point(block_args["base_point"])
                if "insert" in block_args:
                    block_args["insert"] = _normalize_point(block_args["insert"])
                if "insertions" in block_args and isinstance(block_args["insertions"], list):
                    norm_ins = []
                    for ins in block_args["insertions"]:
                        if isinstance(ins, dict):
                            ins_copy = dict(ins)
                            if "insert" in ins_copy:
                                ins_copy["insert"] = _normalize_point(ins_copy["insert"])
                            norm_ins.append(ins_copy)
                        else:
                            norm_ins.append(ins)
                    block_args["insertions"] = norm_ins
                res = execute_manage_blocks(session, **block_args)
                executed_results.append({"tool": tool, "success": not res.is_error, "result": res.structured_content})

            elif tool == "transform_entities":
                ops_data = args.get("operations")
                if ops_data is None:
                    ops_data = [args] if ("op_type" in args or "op" in args or "type" in args) else []
                elif isinstance(ops_data, dict):
                    ops_data = [ops_data]
                normalized_transform_ops = []
                for t in ops_data:
                    if isinstance(t, dict):
                        t_copy = dict(t)
                        if "op" in t_copy and "op_type" not in t_copy:
                            t_copy["op_type"] = t_copy["op"]
                        elif "type" in t_copy and "op_type" not in t_copy:
                            t_copy["op_type"] = t_copy["type"]
                        if "handle" in t_copy and "handles" not in t_copy:
                            t_copy["handles"] = [str(t_copy["handle"])]
                        elif not t_copy.get("handles"):
                            t_copy["handles"] = [str(e.dxf.handle) for e in session.backend.msp if hasattr(e, "dxf") and hasattr(e.dxf, "handle")]
                        params = dict(t_copy.get("params") or {})
                        # Promote root transform parameters if params dict omitted
                        for pk in ("dx", "dy", "center", "angle_deg", "scale_factor", "p1", "p2", "dist1", "dist2", "radius", "other_handle", "vector", "keep_original"):
                            if pk in t_copy and pk not in params:
                                params[pk] = t_copy[pk]
                        if "center" in params:
                            params["center"] = _normalize_point(params["center"])
                        if "p1" in params:
                            params["p1"] = _normalize_point(params["p1"])
                        if "p2" in params:
                            params["p2"] = _normalize_point(params["p2"])
                        if "vector" in params:
                            v = _normalize_point(params["vector"])
                            if "dx" not in params:
                                params["dx"] = v[0]
                            if "dy" not in params:
                                params["dy"] = v[1]
                        t_copy["params"] = params
                        normalized_transform_ops.append(TransformOperationInput(**t_copy))
                    else:
                        normalized_transform_ops.append(t)
                res = execute_transform_entities(session, normalized_transform_ops)
                executed_results.append({"tool": tool, "success": not res.is_error, "result": res.structured_content})

            elif tool == "manage_session":
                res = execute_manage_session(session, **args)
                executed_results.append({"tool": tool, "success": not res.is_error, "result": res.structured_content})

            elif tool == "query_drawing":
                res = execute_query_drawing(session, **args)
                executed_results.append({"tool": tool, "success": not res.is_error, "result": res.structured_content})

            elif tool == "render_preview":
                res = execute_render_preview(session, **args)
                executed_results.append({"tool": tool, "success": not res.is_error, "result": res.structured_content})

        except Exception as tool_err:
            logger.error(f"Error executing tool {tool}: {tool_err}")
            executed_results.append({"tool": tool, "success": False, "error": str(tool_err)})

    # If no entities drawn yet and a prompt was provided, parse prompt into FastMCP entities
    if len(session.backend.msp) == 0 and prompt:
        prompt_entities, prompt_layers = _parse_prompt_to_entities(prompt)
        if prompt_layers:
            execute_manage_layers(session, prompt_layers)
        if prompt_entities:
            res = execute_draw_entities(session, prompt_entities, allow_duplicates=False)
            executed_results.append({
                "tool": "draw_entities",
                "success": not res.is_error,
                "result": res.structured_content,
            })

    # Visual Self-Verification Loop: query drawing and render preview
    query_res = execute_query_drawing(session, include_geometry=True, calculate_bounds=True, audit_stats=True)
    width_px = payload.get("width_px", 1280)
    height_px = payload.get("height_px", 720)
    background = payload.get("background", "white")
    render_res = execute_render_preview(session, width_px=width_px, height_px=height_px, background=background)

    # Extract DXF string from ezdxf drawing
    stream = io.StringIO()
    session.backend.doc.write(stream)
    raw_dxf = stream.getvalue()

    # Extract Base64 PNG preview
    preview_png = ""
    if not render_res.is_error:
        for c in render_res.content:
            if getattr(c, "type", None) == "image":
                preview_png = getattr(c, "data", "")
                break

    # Extract bounds and entity count
    q_content = query_res.structured_content or {}
    b_dict = q_content.get("bounding_box") or {}
    min_x = _safe_float(b_dict.get("min_x", 0.0))
    min_y = _safe_float(b_dict.get("min_y", 0.0))
    max_x = _safe_float(b_dict.get("max_x", 0.0))
    max_y = _safe_float(b_dict.get("max_y", 0.0))
    w = max_x - min_x
    h = max_y - min_y
    entity_count = q_content.get("entity_count", len(session.backend.msp))

    return {
        "success": True,
        "dxf": raw_dxf,
        "previewPng": preview_png,
        "preview_png": preview_png,
        "entityCount": entity_count,
        "entity_count": entity_count,
        "bounds": {
            "minX": min_x,
            "minY": min_y,
            "maxX": max_x,
            "maxY": max_y,
            "min_x": min_x,
            "min_y": min_y,
            "max_x": max_x,
            "max_y": max_y,
            "width": w,
            "height": h,
        },
        "toolResults": executed_results,
        "tool_results": executed_results,
        "queryResult": q_content,
        "query_result": q_content,
    }


def main():
    """Main CLI entrypoint for uv run python -m src.bridge."""
    raw_input = ""

    # Priority 1: Argument passed on CLI
    if len(sys.argv) > 1 and sys.argv[1] != "-":
        arg = sys.argv[1]
        if os.path.isfile(arg):
            with open(arg, "r", encoding="utf-8") as f:
                raw_input = f.read()
        else:
            raw_input = arg
    else:
        # Priority 2: Stdin pipe
        try:
            raw_input = sys.stdin.read()
        except Exception:
            raw_input = ""

    if not raw_input.strip():
        # Return fallback empty drawing instead of crashing
        payload = {"prompt": "Draw a circle at (200, 150) with radius 50"}
    else:
        try:
            payload = json.loads(raw_input)
        except Exception as parse_err:
            out = {
                "success": False,
                "error": f"Invalid JSON payload: {parse_err}",
                "dxf": "",
                "previewPng": "",
                "preview_png": "",
                "entityCount": 0,
                "entity_count": 0,
                "bounds": {"minX": 0, "minY": 0, "maxX": 0, "maxY": 0, "width": 0, "height": 0},
                "toolResults": [],
                "tool_results": [],
            }
            print(json.dumps(out))
            sys.exit(0)

    try:
        result = execute_bridge(payload)
        print(json.dumps(result))
    except Exception as ex:
        logger.exception("Bridge execution failure")
        out = {
            "success": False,
            "error": str(ex),
            "dxf": "",
            "previewPng": "",
            "preview_png": "",
            "entityCount": 0,
            "entity_count": 0,
            "bounds": {"minX": 0, "minY": 0, "maxX": 0, "maxY": 0, "width": 0, "height": 0},
            "toolResults": [],
            "tool_results": [],
        }
        print(json.dumps(out))


if __name__ == "__main__":
    main()
