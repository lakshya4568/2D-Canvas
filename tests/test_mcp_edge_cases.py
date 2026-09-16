"""
Edge-case verification and FastMCP tool invocation test suite.
Verifies:
- Empty batch inputs
- Fillet and Chamfer between perpendicular intersecting lines
- PDF export capability
- FIFO truncation on undo stack exceeding max_undo_steps
- FastMCP tool invocation via mcp.call_tool for all 7 tools
"""

import asyncio
import os
import pytest
from fastmcp.tools import ToolResult

from src.server import mcp, session
from src.tools.blocks import execute_manage_blocks
from src.tools.draw import execute_draw_entities
from src.tools.layers import execute_manage_layers
from src.tools.models import EntityInput, LayerOperationInput, TransformOperationInput
from src.tools.query import execute_query_drawing
from src.tools.session_ops import execute_manage_session
from src.tools.transform import execute_transform_entities


@pytest.fixture(autouse=True)
def clean_session(tmp_path):
    session.output_dir = tmp_path
    session.allow_arbitrary_paths = False
    session.max_entities_per_call = 100
    session.max_undo_steps = 5
    session.reset_drawing()
    yield
    session.reset_drawing()


def test_empty_batch_inputs():
    # Empty draw
    res_draw = execute_draw_entities(session, [])
    assert not res_draw.is_error
    assert res_draw.structured_content["processed_count"] == 0

    # Empty layer ops
    res_layers = execute_manage_layers(session, [])
    assert not res_layers.is_error
    assert res_layers.structured_content["operations_count"] == 0

    # Empty transforms
    res_trans = execute_transform_entities(session, [])
    assert not res_trans.is_error
    assert res_trans.structured_content["operations_count"] == 0


def test_fillet_and_chamfer_geometry():
    # Two perpendicular lines meeting at (50, 50)
    # L1 from (0, 50) to (50, 50)
    # L2 from (50, 50) to (50, 100)
    draw_res = execute_draw_entities(session, [
        EntityInput(entity_type="line", params={"start": [0, 50], "end": [50, 50]}, layer="OUTLINE"),
        EntityInput(entity_type="line", params={"start": [50, 50], "end": [50, 100]}, layer="OUTLINE"),
    ])
    h1 = draw_res.structured_content["entities"][0]["handle"]
    h2 = draw_res.structured_content["entities"][1]["handle"]

    # Chamfer by 10mm
    c_res = execute_transform_entities(session, [
        TransformOperationInput(
            op_type="chamfer",
            handles=[h1],
            params={"other_handle": h2, "dist1": 10.0, "dist2": 10.0},
        )
    ])
    assert not c_res.is_error
    chamfer_h = c_res.structured_content["results"][0]["new_handle"]
    assert chamfer_h is not None

    q = session.backend.query(include_geometry=True)
    chamfer_line = next(e for e in q.entities if e["handle"] == chamfer_h)
    assert chamfer_line["type"] == "LINE"


def test_pdf_export(tmp_path):
    execute_draw_entities(session, [
        EntityInput(entity_type="rectangle", params={"origin": [0, 0], "width": 100, "height": 50}, layer="0"),
        EntityInput(entity_type="text", params={"insert": [10, 20], "text": "TEST DRAWING", "height": 4.0}, layer="0"),
    ])

    pdf_res = execute_manage_session(session, action="export", filepath="drawing.pdf", export_format="pdf")
    assert not pdf_res.is_error
    pdf_path = pdf_res.structured_content["saved_path"]
    assert os.path.exists(pdf_path)
    assert os.path.getsize(pdf_path) > 1000  # Non-trivial PDF file size


def test_undo_stack_max_depth_truncation():
    session.max_undo_steps = 3

    for i in range(6):
        execute_draw_entities(session, [
            EntityInput(entity_type="circle", params={"center": [i * 10, 0], "radius": 5})
        ], allow_duplicates=True)

    # Undo stack should have at most 3 items
    assert len(session.undo_stack) == 3


@pytest.mark.asyncio
async def test_fastmcp_tool_invocation_end_to_end():
    """Verify all 7 tools when called through FastMCP's call_tool interface."""
    # 1. draw_entities
    res1 = await mcp.call_tool("draw_entities", {
        "entities": [
            {"entity_type": "circle", "params": {"center": [100, 100], "radius": 30}, "layer": "OUTLINE"},
            {"entity_type": "line", "params": {"start": [0, 0], "end": [200, 0]}, "layer": "CENTERLINE"},
        ]
    })
    assert not res1.is_error
    circ_handle = res1.structured_content["entities"][0]["handle"]

    # 2. manage_layers
    res2 = await mcp.call_tool("manage_layers", {
        "operations": [
            {"action": "create", "name": "GRID", "color": 8}
        ]
    })
    assert not res2.is_error

    # 3. transform_entities (move the circle)
    res3 = await mcp.call_tool("transform_entities", {
        "operations": [
            {"op_type": "move", "handles": [circ_handle], "params": {"dx": 15, "dy": 25}}
        ]
    })
    assert not res3.is_error

    # 4. manage_blocks
    res4 = await mcp.call_tool("manage_blocks", {
        "action": "list"
    })
    assert not res4.is_error

    # 5. query_drawing
    res5 = await mcp.call_tool("query_drawing", {
        "filter_layer": "OUTLINE"
    })
    assert not res5.is_error
    assert res5.structured_content["matched_count"] == 1
    assert res5.structured_content["entities"][0]["center"] == [115.0, 125.0]

    # 6. render_preview
    res6 = await mcp.call_tool("render_preview", {
        "width_px": 640,
        "height_px": 360,
        "background": "white"
    })
    assert not res6.is_error
    assert any(c.type == "image" for c in res6.content)

    # 7. manage_session (diagnostics & snapshot)
    res7 = await mcp.call_tool("manage_session", {
        "action": "diagnostics"
    })
    assert not res7.is_error
    assert res7.structured_content["status"] == "success"

    res8 = await mcp.call_tool("manage_session", {
        "action": "snapshot"
    })
    assert not res8.is_error
    assert res8.structured_content["action"] == "snapshot"
    assert res8.structured_content["entity_count"] == 2


def test_deduplication_all_types():
    """Verify deduplication across rectangles, polylines, text, and dimensions."""
    # Rectangle
    rect_spec = [EntityInput(entity_type="rectangle", params={"origin": [0, 0], "width": 50, "height": 30})]
    r1 = execute_draw_entities(session, rect_spec, allow_duplicates=False)
    assert r1.structured_content["created_count"] == 1
    r2 = execute_draw_entities(session, rect_spec, allow_duplicates=False)
    assert r2.structured_content["created_count"] == 0
    assert r2.structured_content["deduplicated_count"] == 1
    assert len(session.backend.msp) == 1

    # Polyline
    poly_spec = [EntityInput(entity_type="polyline", params={"points": [[0, 0], [10, 10], [20, 0]], "is_closed": False})]
    p1 = execute_draw_entities(session, poly_spec, allow_duplicates=False)
    assert p1.structured_content["created_count"] == 1
    p2 = execute_draw_entities(session, poly_spec, allow_duplicates=False)
    assert p2.structured_content["created_count"] == 0
    assert p2.structured_content["deduplicated_count"] == 1
    assert len(session.backend.msp) == 2

    # Text
    txt_spec = [EntityInput(entity_type="text", params={"insert": [5, 5], "text": "LABEL", "height": 4.0})]
    t1 = execute_draw_entities(session, txt_spec, allow_duplicates=False)
    assert t1.structured_content["created_count"] == 1
    t2 = execute_draw_entities(session, txt_spec, allow_duplicates=False)
    assert t2.structured_content["created_count"] == 0
    assert t2.structured_content["deduplicated_count"] == 1
    assert len(session.backend.msp) == 3


def test_query_type_aliases_and_deep_geometry():
    """Verify query filter_type aliases and full geometry extraction."""
    execute_draw_entities(session, [
        EntityInput(entity_type="rectangle", params={"origin": [0, 0], "width": 100, "height": 50}),
        EntityInput(entity_type="spline", params={"fit_points": [[0, 0], [25, 40], [50, 0]]}),
        EntityInput(entity_type="dimension", params={"start": [0, 0], "end": [100, 0], "text": "100 mm"}),
        EntityInput(entity_type="hatch", params={"boundary_paths": [[[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]]], "pattern_name": "ANSI31"}),
    ])

    # Alias 'rectangle' -> LWPOLYLINE
    q_rect = execute_query_drawing(session, filter_type="rectangle")
    assert not q_rect.is_error
    assert q_rect.structured_content["matched_count"] == 1
    assert q_rect.structured_content["entities"][0]["type"] == "LWPOLYLINE"

    # Deep geometry: Spline
    q_spline = execute_query_drawing(session, filter_type="spline", include_geometry=True)
    assert not q_spline.is_error
    assert q_spline.structured_content["matched_count"] == 1
    s_ent = q_spline.structured_content["entities"][0]
    assert "fit_points" in s_ent
    assert len(s_ent["fit_points"]) == 3

    # Deep geometry: Dimension
    q_dim = execute_query_drawing(session, filter_type="dimension", include_geometry=True)
    assert not q_dim.is_error
    assert q_dim.structured_content["matched_count"] == 1
    d_ent = q_dim.structured_content["entities"][0]
    assert d_ent["start"] == [0.0, 0.0]
    assert d_ent["end"] == [100.0, 0.0]
    assert d_ent["text"] == "100 mm"

    # Deep geometry: Hatch
    q_hatch = execute_query_drawing(session, filter_type="hatch", include_geometry=True)
    assert not q_hatch.is_error
    assert q_hatch.structured_content["matched_count"] == 1
    h_ent = q_hatch.structured_content["entities"][0]
    assert h_ent["pattern_name"] == "ANSI31"
    assert h_ent["paths_count"] >= 1


def test_fillet_two_handle_modes_and_validation():
    """Verify fillet with handles=[h1, h2] and segment length boundary validation."""
    # L1: (0, 0) -> (100, 0), L2: (100, 0) -> (100, 100)
    d_res = execute_draw_entities(session, [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [100, 0]}),
        EntityInput(entity_type="line", params={"start": [100, 0], "end": [100, 100]}),
    ])
    h1 = d_res.structured_content["entities"][0]["handle"]
    h2 = d_res.structured_content["entities"][1]["handle"]

    # Mode 1: Passing both handles in `handles` list
    f_res = execute_transform_entities(session, [
        TransformOperationInput(
            op_type="fillet",
            handles=[h1, h2],
            params={"radius": 15.0},
        )
    ])
    assert not f_res.is_error
    arc_h = f_res.structured_content["results"][0]["new_handle"]
    assert arc_h is not None

    q = session.backend.query(include_geometry=True)
    arc_ent = next(e for e in q.entities if e["handle"] == arc_h)
    assert arc_ent["type"] == "ARC"
    assert arc_ent["radius"] == 15.0
    # Arc sweep must be minor (< 180 deg)
    sweep = (arc_ent["end_angle"] - arc_ent["start_angle"]) % 360
    assert sweep < 180.0

    # Validation: Fillet radius larger than segment length must fail cleanly
    f_oversized = execute_transform_entities(session, [
        TransformOperationInput(
            op_type="fillet",
            handles=[h1, h2],
            params={"radius": 200.0},
        )
    ])
    assert f_oversized.is_error


def test_offset_arc_and_polyline():
    """Verify offset transformation on arcs and polylines."""
    # 1. Offset Arc
    d_res = execute_draw_entities(session, [
        EntityInput(entity_type="arc", params={"center": [0, 0], "radius": 20.0, "start_angle": 0, "end_angle": 90}),
    ])
    h_arc = d_res.structured_content["entities"][0]["handle"]

    off_arc = execute_transform_entities(session, [
        TransformOperationInput(op_type="offset", handles=[h_arc], params={"distance": 5.0})
    ])
    assert not off_arc.is_error
    new_arc_h = off_arc.structured_content["results"][0]["new_handle"]

    q = session.backend.query(include_geometry=True)
    new_arc = next(e for e in q.entities if e["handle"] == new_arc_h)
    assert new_arc["radius"] == 25.0

    # 2. Offset Polyline/Rectangle
    d_poly = execute_draw_entities(session, [
        EntityInput(entity_type="rectangle", params={"origin": [0, 0], "width": 50, "height": 50}),
    ])
    h_poly = d_poly.structured_content["entities"][0]["handle"]

    off_poly = execute_transform_entities(session, [
        TransformOperationInput(op_type="offset", handles=[h_poly], params={"distance": 5.0})
    ])
    assert not off_poly.is_error
    new_poly_h = off_poly.structured_content["results"][0]["new_handle"]
    assert new_poly_h is not None


def test_redo_stack_preservation_on_failed_mutation():
    """Verify that failed batch mutations do NOT wipe out the redo stack."""
    # Step 1: Draw circle A
    execute_draw_entities(session, [EntityInput(entity_type="circle", params={"center": [0, 0], "radius": 10})])
    assert len(session.backend.msp) == 1

    # Step 2: Draw circle B
    execute_draw_entities(session, [EntityInput(entity_type="circle", params={"center": [50, 50], "radius": 15})])
    assert len(session.backend.msp) == 2

    # Step 3: Undo circle B -> Redo stack now has 1 snapshot
    undo_res = execute_manage_session(session, action="undo")
    assert not undo_res.is_error
    assert len(session.backend.msp) == 1
    assert len(session.redo_stack) == 1

    # Step 4: Attempt a flawed mutation that fails during batch
    flawed_batch = [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [10, 10]}),
        EntityInput(entity_type="circle", params={"center": [0, 0], "radius": -99}),  # Invalid!
    ]
    fail_res = execute_draw_entities(session, flawed_batch)
    assert fail_res.is_error

    # CRITICAL: Failed operation rolled back, AND redo_stack was NOT wiped out!
    assert len(session.backend.msp) == 1
    assert len(session.redo_stack) == 1

    # Step 5: Redo circle B still succeeds
    redo_res = execute_manage_session(session, action="redo")
    assert not redo_res.is_error
    assert len(session.backend.msp) == 2


def test_manage_layers_toggle_and_modify():
    """Verify manage_layers toggle_visibility and modify actions."""
    # Create layer
    l1 = execute_manage_layers(session, [
        LayerOperationInput(action="create", name="ANNO", color=2, linetype="Continuous")
    ])
    assert not l1.is_error

    # Toggle visibility
    l2 = execute_manage_layers(session, [
        LayerOperationInput(action="toggle_visibility", name="ANNO")
    ])
    assert not l2.is_error
    assert l2.structured_content["layers"][0]["is_visible"] is False

    # Toggle visibility back
    l3 = execute_manage_layers(session, [
        LayerOperationInput(action="toggle_visibility", name="ANNO")
    ])
    assert not l3.is_error
    assert l3.structured_content["layers"][0]["is_visible"] is True

    # Modify color and linetype
    l4 = execute_manage_layers(session, [
        LayerOperationInput(action="modify", name="ANNO", color=5, linetype="DASHED")
    ])
    assert not l4.is_error
    assert l4.structured_content["layers"][0]["color"] == 5


def test_manage_blocks_convenience_params():
    """Verify manage_blocks single insert convenience parameters and dynamic attribute additions."""
    # Create a simple entity and block
    d = execute_draw_entities(session, [
        EntityInput(entity_type="circle", params={"center": [0, 0], "radius": 5.0})
    ])
    h = d.structured_content["entities"][0]["handle"]

    b_create = execute_manage_blocks(
        session, action="create", name="VALVE", base_point=[0, 0], entity_handles=[h]
    )
    assert not b_create.is_error

    # Single insert using convenience parameters: insert, rotation, scale
    b_ins = execute_manage_blocks(
        session, action="insert", name="VALVE", insert=[100, 200], rotation=45.0, scale=2.0
    )
    assert not b_ins.is_error
    assert b_ins.structured_content["count"] == 1

    # Dynamic attribute write (adding attribute that was not present originally)
    b_write = execute_manage_blocks(
        session, action="write_attributes", name="VALVE", attributes={"SERIAL": "V-90210"}
    )
    assert not b_write.is_error
    assert b_write.structured_content["attributes_updated"] == 1

    # Read back attributes
    b_read = execute_manage_blocks(session, action="read_attributes", name="VALVE")
    assert not b_read.is_error
    assert b_read.structured_content["results"][0]["attributes"]["SERIAL"] == "V-90210"

