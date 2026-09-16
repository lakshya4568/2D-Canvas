"""
Pytest test suite for FastMCP Python Bridge (src/bridge.py).
Tests:
1. Direct tool operations (draw_entities, manage_layers, transform_entities, query_drawing, render_preview)
2. Prompt-based CAD entity synthesis (circle, rectangle, steel plate, T-beam bridge, twin-cell culvert)
3. CLI argument, JSON string, and file payload parsing
4. Self-verification loop (DXF extraction, Base64 preview PNG, entity counts, bounds)
"""

import base64
import json
import subprocess
import sys
import pytest
from src.bridge import execute_bridge


def test_bridge_direct_draw_entities():
    """Verify bridge executes draw_entities with batch primitives."""
    payload = {
        "operations": [
            {
                "tool": "draw_entities",
                "args": {
                    "entities": [
                        {"entity_type": "line", "params": {"start": [0, 0], "end": [500, 0]}, "layer": "OUTLINE"},
                        {"entity_type": "circle", "params": {"center": [250, 150], "radius": 50}, "layer": "OUTLINE"},
                        {"entity_type": "rectangle", "params": {"origin": [0, 0], "width": 500, "height": 300}, "layer": "OUTLINE"},
                    ]
                },
            }
        ]
    }

    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 3
    assert res["entity_count"] == 3
    assert "SECTION" in res["dxf"]
    assert "ENTITIES" in res["dxf"]
    assert len(res["previewPng"]) > 100
    assert len(res["preview_png"]) > 100

    # Verify PNG magic bytes
    png_bytes = base64.b64decode(res["previewPng"])
    assert png_bytes.startswith(b"\x89PNG\r\n\x1a\n")

    # Verify bounds
    b = res["bounds"]
    assert b["minX"] <= 0
    assert b["maxX"] >= 500
    assert b["maxY"] >= 300


def test_bridge_manage_layers_and_transforms():
    """Verify layer creation and transform operations executed through bridge."""
    payload = {
        "operations": [
            {
                "tool": "manage_layers",
                "args": {
                    "operations": [
                        {"action": "create", "name": "FOUNDATION", "color": 1},
                        {"action": "create", "name": "REBAR", "color": 3},
                    ]
                },
            },
            {
                "tool": "draw_entities",
                "args": {
                    "entities": [
                        {"entity_type": "rectangle", "params": {"origin": [0, 0], "width": 600, "height": 400}, "layer": "FOUNDATION"},
                    ]
                },
            },
        ]
    }

    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] >= 1
    assert "FOUNDATION" in res["dxf"]
    assert len(res["toolResults"]) >= 2


def test_bridge_prompt_circle():
    """Verify natural-language circle prompt."""
    payload = {"prompt": "Draw a circle at (200, 150) with radius 50"}
    res = execute_bridge(payload)

    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "CIRCLE" in res["dxf"]
    b = res["bounds"]
    assert b["minX"] == 150.0
    assert b["maxX"] == 250.0
    assert b["minY"] == 100.0
    assert b["maxY"] == 200.0


def test_bridge_prompt_rectangle():
    """Verify natural-language rectangle prompt."""
    payload = {"prompt": "Draw a rectangle with width 500 and height 300 at origin"}
    res = execute_bridge(payload)

    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "LWPOLYLINE" in res["dxf"]
    b = res["bounds"]
    assert b["width"] == 500.0
    assert b["height"] == 300.0


def test_bridge_prompt_steel_plate():
    """Verify steel plate with 4 corner bolt holes and centerlines."""
    payload = {"prompt": "Draw a rectangular steel plate 400x250 with 4 corner bolt holes r=15 and centerlines"}
    res = execute_bridge(payload)

    assert res["success"] is True
    # 1 plate rectangle + 4 bolt holes + 2 centerlines = 7 entities
    assert res["entityCount"] == 7
    assert "CENTERLINE" in res["dxf"]
    assert len(res["previewPng"]) > 200


def test_bridge_prompt_rcc_tbeam_bridge():
    """Verify RCC T-beam bridge cross-section prompt."""
    payload = {"prompt": "Draw the cross-section of an RCC T-beam bridge, span 20 m"}
    res = execute_bridge(payload)

    assert res["success"] is True
    assert res["entityCount"] >= 8
    assert "DIMENSIONS" in res["dxf"]
    assert "REBAR" in res["dxf"]
    assert "CENTERLINE" in res["dxf"]


def test_bridge_prompt_twin_cell_box_culvert():
    """Verify twin-cell RCC box culvert prompt."""
    payload = {"prompt": "Draw a twin-cell RCC box culvert with span 4000 mm, height 3000 mm"}
    res = execute_bridge(payload)

    assert res["success"] is True
    # Outer box, 2 inner cells, haunches, centerline, dimensions
    assert res["entityCount"] >= 6
    assert "CENTERLINE" in res["dxf"]
    assert "DIMENSIONS" in res["dxf"]


def test_bridge_cli_json_string():
    """Verify CLI execution using uv run python -m src.bridge '<json>'."""
    cmd = [
        sys.executable,
        "-m",
        "src.bridge",
        json.dumps({"prompt": "Draw a circle at (200, 150) with radius 50"}),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    assert proc.returncode == 0

    data = json.loads(proc.stdout)
    assert data["success"] is True
    assert data["entityCount"] == 1
    assert "CIRCLE" in data["dxf"]
    assert len(data["previewPng"]) > 100


def test_bridge_cli_file_argument(tmp_path):
    """Verify CLI execution with file argument."""
    payload_file = tmp_path / "payload.json"
    payload_file.write_text(
        json.dumps({"prompt": "Draw a rectangle with width 500 and height 300 at origin"}),
        encoding="utf-8",
    )

    cmd = [sys.executable, "-m", "src.bridge", str(payload_file)]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    assert proc.returncode == 0

    data = json.loads(proc.stdout)
    assert data["success"] is True
    assert data["entityCount"] == 1
    assert data["bounds"]["width"] == 500.0


def test_bridge_arguments_key_compatibility():
    """Verify MCP standard 'arguments' key is supported interchangeably with 'args'."""
    payload = {
        "operations": [
            {
                "name": "draw_entities",
                "arguments": {
                    "entities": [
                        {"entity_type": "circle", "params": {"center": [100, 100], "radius": 25}},
                    ]
                },
            }
        ]
    }
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "CIRCLE" in res["dxf"]


def test_bridge_unwrapped_entity_dict():
    """Verify single entity directly in args/arguments without wrapping list."""
    payload = {
        "operations": [
            {
                "tool": "draw_entities",
                "args": {
                    "entity_type": "circle",
                    "center": [50, 50],
                    "radius": 30,
                },
            }
        ]
    }
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "CIRCLE" in res["dxf"]


def test_bridge_polyline_dict_points():
    """Verify polyline with points given as list of {x, y} dicts."""
    payload = {
        "operations": [
            {
                "tool": "draw_entities",
                "args": {
                    "entities": [
                        {
                            "entity_type": "polyline",
                            "params": {
                                "points": [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 100, "y": 100}],
                                "is_closed": True,
                            },
                        }
                    ]
                },
            }
        ]
    }
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "LWPOLYLINE" in res["dxf"]


def test_bridge_prompt_arc():
    """Verify natural-language arc prompt extraction."""
    payload = {"prompt": "Draw an arc at (100, 100) with radius 50 from 0 to 180"}
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "ARC" in res["dxf"]


def test_bridge_prompt_polyline_not_confused_with_line():
    """Verify polyline prompt is not incorrectly parsed as a single line."""
    payload = {"prompt": "Draw a polyline with points (0,0), (100,0), (100,100), (0,100) closed"}
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "LWPOLYLINE" in res["dxf"]


def test_bridge_prompt_text():
    """Verify text annotation prompt extraction."""
    payload = {"prompt": "Draw text 'FOUNDATION A1' at (100, 200) height 20"}
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "TEXT" in res["dxf"]
    assert "FOUNDATION A1" in res["dxf"]


def test_bridge_prompt_circle_diameter():
    """Verify diameter recognition in circle prompt."""
    payload = {"prompt": "Draw a circle at (100, 100) with diameter 80"}
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    assert "CIRCLE" in res["dxf"]
    # Radius must be 40
    b = res["bounds"]
    assert b["width"] == 80.0
    assert b["height"] == 80.0


def test_bridge_transform_move_dict_vector():
    """Verify transform move with vector normalization."""
    payload = {
        "operations": [
            {
                "tool": "draw_entities",
                "args": {
                    "entities": [
                        {"entity_type": "circle", "params": {"center": [0, 0], "radius": 20}},
                    ]
                },
            },
            {
                "tool": "transform_entities",
                "args": {
                    "operations": [
                        {"op": "move", "vector": {"x": 50, "y": 50}},
                    ]
                },
            },
        ]
    }
    res = execute_bridge(payload)
    assert res["success"] is True
    assert res["entityCount"] == 1
    # Check transformed circle bounds center moved to 50, 50
    b = res["bounds"]
    assert b["minX"] == 30.0
    assert b["maxX"] == 70.0

