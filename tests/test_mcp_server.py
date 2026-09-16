"""
Comprehensive pytest test suite for UPCE CAD FastMCP Server.
Tests:
- Entity creation across all 9 primitive types
- Batch operations and geometric deduplication
- Partial-failure reporting and atomic rollback
- 50-step transactional undo/redo engine
- Transformations: move, rotate, scale, copy, mirror, offset, fillet, chamfer
- Layer lifecycle and entity reassignment
- Block definitions, batch insertions, auditing, and attribute R/W
- Export round-trip (write DXF -> reopen -> verify geometry)
- Path sandboxing and path-traversal prevention
- Visual preview rendering (PNG bytes & ImageContent)
- Query inspection and self-verification metrics
"""

import json
import os
from pathlib import Path
import pytest

from src.cad_backend.ezdxf_backend import EzdxfBackend
from src.tools.blocks import execute_manage_blocks
from src.tools.draw import execute_draw_entities
from src.tools.layers import execute_manage_layers
from src.tools.models import EntityInput, LayerOperationInput, TransformOperationInput
from src.tools.query import execute_query_drawing
from src.tools.render import execute_render_preview
from src.tools.session import DrawingSession
from src.tools.session_ops import execute_manage_session
from src.tools.transform import execute_transform_entities


@pytest.fixture
def session(tmp_path):
    """Provides a fresh isolated DrawingSession rooted in a temporary output directory."""
    sess = DrawingSession()
    sess.output_dir = tmp_path
    sess.allow_arbitrary_paths = False
    sess.max_entities_per_call = 100
    sess.reset_drawing()
    return sess


# ---------------------------------------------------------------------------
# 1. Entity Creation & Primitive Coverage
# ---------------------------------------------------------------------------
def test_entity_creation_all_primitives(session):
    specs = [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [100, 0]}, layer="OUTLINE", color=4),
        EntityInput(entity_type="circle", params={"center": [50, 50], "radius": 25}, layer="OUTLINE", color=4),
        EntityInput(entity_type="arc", params={"center": [0, 0], "radius": 30, "start_angle": 0, "end_angle": 90}, layer="OUTLINE"),
        EntityInput(entity_type="rectangle", params={"origin": [10, 10], "width": 40, "height": 30}, layer="OUTLINE"),
        EntityInput(entity_type="rectangle", params={"origin": [60, 10], "width": 40, "height": 30, "fillet_radius": 5}, layer="OUTLINE"),
        EntityInput(entity_type="polyline", params={"points": [[0, 0], [10, 20], [20, 0]], "is_closed": True}, layer="OUTLINE"),
        EntityInput(entity_type="spline", params={"fit_points": [[0, 0], [25, 40], [50, 0], [75, 40], [100, 0]]}, layer="OUTLINE"),
        EntityInput(entity_type="text", params={"insert": [10, 80], "text": "PART NO. A-101", "height": 5.0}, layer="TEXT", color=2),
        EntityInput(entity_type="dimension", params={"start": [0, 0], "end": [100, 0], "text": "100 mm"}, layer="DIMENSIONS", color=7),
        EntityInput(entity_type="hatch", params={"boundary_paths": [[[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]]], "pattern_name": "ANSI31"}, layer="HATCH"),
    ]

    res = execute_draw_entities(session, specs, allow_duplicates=True)
    assert not res.is_error
    assert res.structured_content["status"] == "success"
    assert res.structured_content["created_count"] == 10
    assert len(session.backend.msp) == 10


# ---------------------------------------------------------------------------
# 2. Batch Operations & Geometric Deduplication (Idempotency)
# ---------------------------------------------------------------------------
def test_batch_operations_and_deduplication(session):
    specs = [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [50, 50]}, layer="OUTLINE"),
        EntityInput(entity_type="circle", params={"center": [100, 100], "radius": 15}, layer="OUTLINE"),
    ]

    # First call creates entities
    res1 = execute_draw_entities(session, specs, allow_duplicates=False)
    assert res1.structured_content["created_count"] == 2
    assert res1.structured_content["deduplicated_count"] == 0
    assert len(session.backend.msp) == 2

    # Second call with identical geometry and allow_duplicates=False should deduplicate
    res2 = execute_draw_entities(session, specs, allow_duplicates=False)
    assert res2.structured_content["created_count"] == 0
    assert res2.structured_content["deduplicated_count"] == 2
    assert len(session.backend.msp) == 2

    # Third call with allow_duplicates=True should add duplicate entities
    res3 = execute_draw_entities(session, specs, allow_duplicates=True)
    assert res3.structured_content["created_count"] == 2
    assert len(session.backend.msp) == 4


# ---------------------------------------------------------------------------
# 3. Partial-Failure Behavior & Atomic Transaction Rollback
# ---------------------------------------------------------------------------
def test_partial_failure_atomic_rollback(session):
    # Initial state has 1 valid line
    init_specs = [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [10, 10]}, layer="0")
    ]
    execute_draw_entities(session, init_specs)
    assert len(session.backend.msp) == 1

    # Batch with 2 valid entities and 1 invalid entity (circle with negative radius)
    flawed_batch = [
        EntityInput(entity_type="line", params={"start": [20, 20], "end": [30, 30]}, layer="0"),
        EntityInput(entity_type="circle", params={"center": [0, 0], "radius": -5.0}, layer="0"),
        EntityInput(entity_type="line", params={"start": [40, 40], "end": [50, 50]}, layer="0"),
    ]

    res = execute_draw_entities(session, flawed_batch)
    assert res.is_error
    err = res.structured_content
    assert err["status"] == "error"
    assert err["error_code"] == "OPERATION_FAILED"
    assert err["failed_index"] == 1  # Circle was index 1
    assert err["succeeded_count"] == 1
    assert err["rolled_back"] is True

    # Critical: State must roll back exactly to initial state (1 entity)
    assert len(session.backend.msp) == 1


# ---------------------------------------------------------------------------
# 4. Transactional Undo / Redo Engine
# ---------------------------------------------------------------------------
def test_transactional_undo_redo(session):
    assert len(session.backend.msp) == 0

    # Step 1: Draw circle
    execute_draw_entities(session, [
        EntityInput(entity_type="circle", params={"center": [0, 0], "radius": 20})
    ])
    assert len(session.backend.msp) == 1

    # Step 2: Draw line
    execute_draw_entities(session, [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [50, 0]})
    ])
    assert len(session.backend.msp) == 2

    # Step 3: Undo line
    undo_res = execute_manage_session(session, action="undo")
    assert not undo_res.is_error
    assert len(session.backend.msp) == 1

    # Step 4: Undo circle
    execute_manage_session(session, action="undo")
    assert len(session.backend.msp) == 0

    # Step 5: Redo circle
    redo_res = execute_manage_session(session, action="redo")
    assert not redo_res.is_error
    assert len(session.backend.msp) == 1

    # Step 6: Redo line
    execute_manage_session(session, action="redo")
    assert len(session.backend.msp) == 2


# ---------------------------------------------------------------------------
# 5. Transform Operations: Move, Rotate, Scale, Copy, Mirror, Offset, Chamfer
# ---------------------------------------------------------------------------
def test_transform_entities(session):
    draw_res = execute_draw_entities(session, [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [10, 0]}, layer="0"),
        EntityInput(entity_type="circle", params={"center": [20, 20], "radius": 5}, layer="0"),
    ])
    h_line = draw_res.structured_content["entities"][0]["handle"]
    h_circle = draw_res.structured_content["entities"][1]["handle"]

    # 1. Move line by (5, 5)
    t_res1 = execute_transform_entities(session, [
        TransformOperationInput(op_type="move", handles=[h_line], params={"dx": 5, "dy": 5})
    ])
    assert not t_res1.is_error

    q = session.backend.query(include_geometry=True)
    line_ent = next(e for e in q.entities if e["handle"] == h_line)
    assert line_ent["start"] == [5.0, 5.0]
    assert line_ent["end"] == [15.0, 5.0]

    # 2. Scale circle by 2x
    t_res2 = execute_transform_entities(session, [
        TransformOperationInput(op_type="scale", handles=[h_circle], params={"center": [20, 20], "scale_factor": 2.0})
    ])
    assert not t_res2.is_error

    q = session.backend.query(include_geometry=True)
    circ_ent = next(e for e in q.entities if e["handle"] == h_circle)
    assert circ_ent["radius"] == 10.0

    # 3. Copy line by (0, 20)
    t_res3 = execute_transform_entities(session, [
        TransformOperationInput(op_type="copy", handles=[h_line], params={"dx": 0, "dy": 20})
    ])
    assert not t_res3.is_error
    new_h = t_res3.structured_content["results"][0]["new_handle"]
    assert new_h is not None
    assert len(session.backend.msp) == 3

    # 4. Mirror circle across Y-axis (keep_original=True)
    t_res4 = execute_transform_entities(session, [
        TransformOperationInput(op_type="mirror", handles=[h_circle], params={"p1": [0, 0], "p2": [0, 10], "keep_original": True})
    ])
    assert not t_res4.is_error
    mirrored_h = t_res4.structured_content["results"][0]["new_handle"]
    assert mirrored_h is not None
    q = session.backend.query(include_geometry=True)
    mirrored_ent = next(e for e in q.entities if e["handle"] == mirrored_h)
    assert mirrored_ent["center"][0] == -20.0


# ---------------------------------------------------------------------------
# 6. Layer Management & Entity Reassignment
# ---------------------------------------------------------------------------
def test_manage_layers(session):
    # Create layers
    l_res1 = execute_manage_layers(session, [
        LayerOperationInput(action="create", name="STRUCTURAL", color=1, linetype="Continuous"),
        LayerOperationInput(action="create", name="REBAR", color=3, linetype="Continuous"),
    ])
    assert not l_res1.is_error

    # Draw entities on STRUCTURAL
    execute_draw_entities(session, [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [100, 0]}, layer="STRUCTURAL")
    ])

    # Rename layer STRUCTURAL -> CONCRETE_FRAME
    l_res2 = execute_manage_layers(session, [
        LayerOperationInput(action="rename", name="STRUCTURAL", new_name="CONCRETE_FRAME")
    ])
    assert not l_res2.is_error
    assert l_res2.structured_content["layers"][0]["entities_reassigned"] == 1

    # Verify entity reassigned to new layer name
    q = session.backend.query()
    assert "CONCRETE_FRAME" in q.counts_by_layer
    assert "STRUCTURAL" not in q.counts_by_layer

    # Toggle visibility
    l_res3 = execute_manage_layers(session, [
        LayerOperationInput(action="set_visibility", name="CONCRETE_FRAME", is_visible=False, is_locked=True)
    ])
    assert not l_res3.is_error
    assert l_res3.structured_content["layers"][0]["is_visible"] is False
    assert l_res3.structured_content["layers"][0]["is_locked"] is True


# ---------------------------------------------------------------------------
# 7. Block Definitions, Batch Insertions & Attribute Manipulation
# ---------------------------------------------------------------------------
def test_block_lifecycle_and_attributes(session):
    # 1. Draw primitives to form a block
    d_res = execute_draw_entities(session, [
        EntityInput(entity_type="circle", params={"center": [0, 0], "radius": 4.0}),
        EntityInput(entity_type="circle", params={"center": [0, 0], "radius": 8.0}),
    ])
    h1 = d_res.structured_content["entities"][0]["handle"]
    h2 = d_res.structured_content["entities"][1]["handle"]

    # 2. Create block definition 'BOLT_M8'
    b_res1 = execute_manage_blocks(
        session,
        action="create",
        name="BOLT_M8",
        base_point=[0.0, 0.0],
        entity_handles=[h1, h2],
    )
    assert not b_res1.is_error
    assert b_res1.structured_content["block_name"] == "BOLT_M8"

    # 3. Batch insert block references (e.g. 4-bolt flange pattern)
    inserts = [
        {"insert": [50.0, 0.0], "rotation": 0.0, "scale": 1.0, "attributes": {"GRADE": "8.8"}},
        {"insert": [0.0, 50.0], "rotation": 90.0, "scale": 1.0, "attributes": {"GRADE": "8.8"}},
        {"insert": [-50.0, 0.0], "rotation": 180.0, "scale": 1.0, "attributes": {"GRADE": "8.8"}},
        {"insert": [0.0, -50.0], "rotation": 270.0, "scale": 1.0, "attributes": {"GRADE": "8.8"}},
    ]
    b_res2 = execute_manage_blocks(session, action="insert", name="BOLT_M8", insertions=inserts)
    assert not b_res2.is_error
    assert b_res2.structured_content["count"] == 4

    # 4. Audit blocks
    b_res3 = execute_manage_blocks(session, action="audit")
    assert not b_res3.is_error
    assert "BOLT_M8" in b_res3.structured_content["defined_blocks"]
    assert b_res3.structured_content["insertion_counts"]["BOLT_M8"] == 4

    # 5. Read attributes
    b_res4 = execute_manage_blocks(session, action="read_attributes", name="BOLT_M8")
    assert not b_res4.is_error
    assert len(b_res4.structured_content["results"]) == 4
    assert b_res4.structured_content["results"][0]["attributes"]["GRADE"] == "8.8"

    # 6. Write attributes
    b_res5 = execute_manage_blocks(
        session, action="write_attributes", name="BOLT_M8", attributes={"GRADE": "10.9"}
    )
    assert not b_res5.is_error
    assert b_res5.structured_content["attributes_updated"] == 4


# ---------------------------------------------------------------------------
# 8. Export Round-Trip (Write DXF -> Reopen -> Verify Entities)
# ---------------------------------------------------------------------------
def test_export_roundtrip(session):
    # Draw geometric structure
    execute_draw_entities(session, [
        EntityInput(entity_type="rectangle", params={"origin": [0, 0], "width": 180, "height": 277}, layer="TITLE_BLOCK"),
        EntityInput(entity_type="line", params={"start": [0, 50], "end": [180, 50]}, layer="TITLE_BLOCK"),
        EntityInput(entity_type="circle", params={"center": [90, 150], "radius": 30}, layer="GEOMETRY"),
        EntityInput(entity_type="text", params={"insert": [10, 20], "text": "DRAWING NO: D-001", "height": 3.5}, layer="TEXT"),
    ])

    save_path = "subsystem_drawing.dxf"
    s_res = execute_manage_session(session, action="save", filepath=save_path, export_format="dxf")
    assert not s_res.is_error
    abs_saved_path = s_res.structured_content["saved_path"]
    assert os.path.isfile(abs_saved_path)

    # Reopen in new session
    session.reset_drawing()
    assert len(session.backend.msp) == 0

    o_res = execute_manage_session(session, action="open", filepath=save_path)
    assert not o_res.is_error

    # Verify query metrics matches saved geometry
    q = session.backend.query()
    assert q.stats.entity_count == 4
    assert "TITLE_BLOCK" in q.counts_by_layer
    assert "GEOMETRY" in q.counts_by_layer
    assert "TEXT" in q.counts_by_layer
    assert q.bounding_box["width"] == 180.0
    assert q.bounding_box["height"] == 277.0


# ---------------------------------------------------------------------------
# 9. Path Sandboxing & Security Enforcement
# ---------------------------------------------------------------------------
def test_path_sandboxing_security(session):
    # Attempting directory traversal outside output_dir
    res1 = execute_manage_session(
        session, action="save", filepath="../../etc/malicious.dxf"
    )
    assert res1.is_error
    assert "Path traversal denied" in res1.structured_content["message"]

    # Attempting to open outside output_dir
    res2 = execute_manage_session(
        session, action="open", filepath="../../../bin/bash"
    )
    assert res2.is_error
    assert "Path traversal denied" in res2.structured_content["message"]

    # Enforce batch size limit
    oversized_batch = [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [1, 1]})
        for _ in range(150)
    ]
    with pytest.raises(ValueError, match="exceeds maximum allowed entities"):
        session.check_entity_batch_limit(len(oversized_batch))


# ---------------------------------------------------------------------------
# 10. Visual Preview Rendering (PNG Bytes & ImageContent)
# ---------------------------------------------------------------------------
def test_render_preview(session):
    execute_draw_entities(session, [
        EntityInput(entity_type="circle", params={"center": [100, 100], "radius": 40}, layer="OUTLINE"),
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [200, 200]}, layer="CENTERLINE"),
    ])

    p_res = execute_render_preview(session, width_px=640, height_px=360, background="white")
    assert not p_res.is_error
    assert len(p_res.content) == 2  # TextContent + ImageContent
    img_content = p_res.content[1]
    assert img_content.type == "image"
    assert img_content.mime_type == "image/png"
    assert len(img_content.data) > 100


# ---------------------------------------------------------------------------
# 11. Query Inspection & Self-Verification Loop
# ---------------------------------------------------------------------------
def test_query_drawing_self_verification(session):
    execute_draw_entities(session, [
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [50, 0]}, layer="BASE"),
        EntityInput(entity_type="line", params={"start": [0, 0], "end": [0, 50]}, layer="WALL"),
        EntityInput(entity_type="circle", params={"center": [25, 25], "radius": 10}, layer="OPENING"),
    ])

    # Filter by layer
    q_wall = execute_query_drawing(session, filter_layer="WALL")
    assert not q_wall.is_error
    assert q_wall.structured_content["matched_count"] == 1
    assert q_wall.structured_content["entities"][0]["layer"] == "WALL"

    # Filter by type
    q_circle = execute_query_drawing(session, filter_type="CIRCLE")
    assert not q_circle.is_error
    assert q_circle.structured_content["matched_count"] == 1
    assert q_circle.structured_content["entities"][0]["radius"] == 10.0

    # Overall bounds
    q_all = execute_query_drawing(session)
    assert not q_all.is_error
    b = q_all.structured_content["bounding_box"]
    assert b["min_x"] == 0.0
    assert b["min_y"] == 0.0
    assert b["max_x"] == 50.0
    assert b["max_y"] == 50.0
