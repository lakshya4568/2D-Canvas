"""
UPCE CAD FastMCP Demo Script.
Proves the pipeline end-to-end using ONLY the MCP tools themselves:
1. Establishes engineering layers via `manage_layers`.
2. Draws an engineering Title Block (180x277 mm) with a 6-column revision table via `draw_entities`.
3. Draws an 8-hole bolt pattern (r=4 on 60mm bolt circle centered at 100,100) with centerlines via `draw_entities`.
4. Executes self-verification via `query_drawing` to audit bounds and counts.
5. Performs visual verification via `render_preview` (saves PNG).
6. Exports final DXF artifact via `manage_session`.
"""

import asyncio
import base64
import math
import os
from pathlib import Path

from src.server import mcp, session


async def run_end_to_end_demo():
    print("=================================================================")
    print("🚀 UPCE CAD MCP Server — End-to-End Autonomous Pipeline Demo")
    print("=================================================================\n")

    output_dir = Path("output")
    output_dir.mkdir(parents=True, exist_ok=True)
    session.output_dir = output_dir.resolve()
    session.allow_arbitrary_paths = True
    session.reset_drawing()

    # Step 1: Initialize Session and Setup Layers
    print("[1/6] Setting up engineering layers...")
    layer_res = await mcp.call_tool("manage_layers", {
        "operations": [
            {"action": "create", "name": "TITLE_BLOCK", "color": 7, "linetype": "Continuous"},
            {"action": "create", "name": "OUTLINE", "color": 4, "linetype": "Continuous"},      # Cyan
            {"action": "create", "name": "CENTERLINE", "color": 1, "linetype": "CENTER"},       # Red
            {"action": "create", "name": "BOLTS", "color": 2, "linetype": "Continuous"},            # Yellow
            {"action": "create", "name": "DIMENSIONS", "color": 3, "linetype": "Continuous"},       # Green
            {"action": "create", "name": "ANNOTATIONS", "color": 7, "linetype": "Continuous"},      # White
        ]
    })
    print(" ->", layer_res.content[0].text)

    # Step 2: Draw Title Block (180x277 mm) with 6-Column Revision Table
    print("\n[2/6] Drawing Title Block (180x277 mm) with 6-column revision table...")
    # Geometry:
    # Outer sheet border: 180 x 277 mm
    # Inner border margin: 5 mm (origin: 5, 5; w: 170, h: 267)
    # Revision table at top: y = 267 down to y = 237 (height 30mm)
    # 6 columns: REV (15mm), ZONE (15mm), DESCRIPTION (70mm), DATE (25mm), APPROVED (25mm), REMARKS (20mm)
    tb_entities = [
        # Outer border
        {"entity_type": "rectangle", "params": {"origin": [0.0, 0.0], "width": 180.0, "height": 277.0}, "layer": "TITLE_BLOCK", "color": 7},
        # Inner margin border
        {"entity_type": "rectangle", "params": {"origin": [5.0, 5.0], "width": 170.0, "height": 267.0}, "layer": "TITLE_BLOCK", "color": 7},
        # Revision Table Outer Box (top right/full span of inner border)
        {"entity_type": "rectangle", "params": {"origin": [5.0, 242.0], "width": 170.0, "height": 30.0}, "layer": "TITLE_BLOCK", "color": 7},
        # Revision Table Header Horizontal Line (y = 262)
        {"entity_type": "line", "params": {"start": [5.0, 262.0], "end": [175.0, 262.0]}, "layer": "TITLE_BLOCK", "color": 7},
        # Revision Row 1 Line (y = 252)
        {"entity_type": "line", "params": {"start": [5.0, 252.0], "end": [175.0, 252.0]}, "layer": "TITLE_BLOCK", "color": 7},
    ]

    # Column dividers (x coordinates: 5 + 15=20, +15=35, +70=105, +25=130, +25=155)
    col_x_offsets = [20.0, 35.0, 105.0, 130.0, 155.0]
    for x in col_x_offsets:
        tb_entities.append({
            "entity_type": "line",
            "params": {"start": [x, 242.0], "end": [x, 272.0]},
            "layer": "TITLE_BLOCK",
            "color": 7,
        })

    # Header labels
    headers = [
        ("REV", [7.0, 265.0]),
        ("ZONE", [22.0, 265.0]),
        ("DESCRIPTION", [40.0, 265.0]),
        ("DATE", [108.0, 265.0]),
        ("APPROVED", [132.0, 265.0]),
        ("REMARKS", [157.0, 265.0]),
    ]
    for text, pos in headers:
        tb_entities.append({
            "entity_type": "text",
            "params": {"insert": pos, "text": text, "height": 3.0},
            "layer": "ANNOTATIONS",
            "color": 7,
        })

    # Sample revision row entries
    rev_entries = [
        ("A", [9.0, 255.0]),
        ("B2", [23.0, 255.0]),
        ("INITIAL RELEASE (UPCE MASTER 1.0)", [38.0, 255.0]),
        ("2026-09-16", [106.0, 255.0]),
        ("CHIEF ENG", [131.0, 255.0]),
        ("PROD-OK", [158.0, 255.0]),
    ]
    for text, pos in rev_entries:
        tb_entities.append({
            "entity_type": "text",
            "params": {"insert": pos, "text": text, "height": 2.5},
            "layer": "ANNOTATIONS",
            "color": 7,
        })

    # Bottom Title Block Box (y = 5 to y = 45)
    tb_entities.extend([
        {"entity_type": "rectangle", "params": {"origin": [5.0, 5.0], "width": 170.0, "height": 40.0}, "layer": "TITLE_BLOCK", "color": 7},
        {"entity_type": "line", "params": {"start": [5.0, 25.0], "end": [175.0, 25.0]}, "layer": "TITLE_BLOCK", "color": 7},
        {"entity_type": "line", "params": {"start": [100.0, 5.0], "end": [100.0, 45.0]}, "layer": "TITLE_BLOCK", "color": 7},
        {"entity_type": "text", "params": {"insert": [10.0, 32.0], "text": "PROJECT: UNIFIED PARAMETRIC 2D CAD ENGINE", "height": 3.5}, "layer": "ANNOTATIONS", "color": 7},
        {"entity_type": "text", "params": {"insert": [10.0, 12.0], "text": "DRAWING TITLE: FLANGE BOLT PATTERN ASSEMBLY", "height": 3.0}, "layer": "ANNOTATIONS", "color": 7},
        {"entity_type": "text", "params": {"insert": [105.0, 32.0], "text": "DWG NO: UPCE-FLANGE-001", "height": 3.5}, "layer": "ANNOTATIONS", "color": 7},
        {"entity_type": "text", "params": {"insert": [105.0, 12.0], "text": "SCALE: 1:1   UNITS: MM", "height": 3.0}, "layer": "ANNOTATIONS", "color": 7},
    ])

    tb_res = await mcp.call_tool("draw_entities", {"entities": tb_entities})
    print(" ->", tb_res.content[0].text)

    # Step 3: Draw Bolt Pattern: 8 circles of r=4 on a 60mm bolt circle centered at (100, 100)
    print("\n[3/6] Drawing Bolt Pattern: 8 circles (r=4) on a 60mm pitch circle at (100, 100)...")
    cx, cy = 100.0, 100.0
    bc_diameter = 60.0
    bc_radius = bc_diameter / 2.0  # 30 mm
    bolt_radius = 4.0
    num_bolts = 8

    bolt_entities = [
        # Centerlines through hub
        {"entity_type": "line", "params": {"start": [cx - 45.0, cy], "end": [cx + 45.0, cy]}, "layer": "CENTERLINE", "color": 1, "linetype": "CENTER"},
        {"entity_type": "line", "params": {"start": [cx, cy - 45.0], "end": [cx, cy + 45.0]}, "layer": "CENTERLINE", "color": 1, "linetype": "CENTER"},
        # Pitch circle (B.C.D. 60mm)
        {"entity_type": "circle", "params": {"center": [cx, cy], "radius": bc_radius}, "layer": "CENTERLINE", "color": 1, "linetype": "CENTER"},
        # Inner shaft bore
        {"entity_type": "circle", "params": {"center": [cx, cy], "radius": 15.0}, "layer": "OUTLINE", "color": 4},
        # Outer flange rim
        {"entity_type": "circle", "params": {"center": [cx, cy], "radius": 40.0}, "layer": "OUTLINE", "color": 4},
    ]

    # 8 Bolt holes
    for i in range(num_bolts):
        angle_rad = i * (2.0 * math.pi / num_bolts)
        bx = cx + bc_radius * math.cos(angle_rad)
        by = cy + bc_radius * math.sin(angle_rad)
        bolt_entities.append({
            "entity_type": "circle",
            "params": {"center": [round(bx, 4), round(by, 4)], "radius": bolt_radius},
            "layer": "BOLTS",
            "color": 2,
        })

    # Dimensions & Annotations
    bolt_entities.extend([
        {"entity_type": "dimension", "params": {"start": [cx - bc_radius, cy], "end": [cx + bc_radius, cy], "text": "PCD 60 mm"}, "layer": "DIMENSIONS", "color": 3},
        {"entity_type": "text", "params": {"insert": [cx - 30.0, cy - 50.0], "text": "8 HOLES DIA 8.0 EQUISPACED ON 60 PCD", "height": 3.0}, "layer": "ANNOTATIONS", "color": 7},
    ])

    bolt_res = await mcp.call_tool("draw_entities", {"entities": bolt_entities})
    print(" ->", bolt_res.content[0].text)

    # Step 4: Self-Verification Loop via query_drawing
    print("\n[4/6] Executing Self-Verification via `query_drawing`...")
    query_res = await mcp.call_tool("query_drawing", {
        "include_geometry": False,
        "calculate_bounds": True,
        "audit_stats": True,
    })
    print(" ->", query_res.content[0].text)
    stats = query_res.structured_content["drawing_stats"]
    print(f"    Total Entities in Modelspace: {stats['total_entities']}")
    print(f"    Layers Configured: {stats['total_layers']}")
    print(f"    Modelspace Extents: {stats['overall_bounds']}")

    # Step 5: Visual Verification via render_preview
    print("\n[5/6] Generating raster preview via `render_preview` for visual inspection...")
    preview_res = await mcp.call_tool("render_preview", {
        "width_px": 1280,
        "height_px": 720,
        "background": "white",
        "show_grid": True,
    })
    print(" ->", preview_res.content[0].text)

    # Save preview image to output folder
    img_content = preview_res.content[1]
    img_bytes = base64.b64decode(img_content.data)
    preview_path = output_dir / "demo_pipeline_preview.png"
    with open(preview_path, "wb") as f:
        f.write(img_bytes)
    print(f"    Preview saved: {preview_path.resolve()} ({len(img_bytes)} bytes)")

    # Step 6: Export Drawing via manage_session
    print("\n[6/6] Exporting production DXF via `manage_session`...")
    dxf_filename = "demo_pipeline.dxf"
    export_res = await mcp.call_tool("manage_session", {
        "action": "save",
        "filepath": dxf_filename,
        "export_format": "dxf",
    })
    print(" ->", export_res.content[0].text)
    saved_dxf_path = export_res.structured_content["saved_path"]
    print(f"    DXF saved: {saved_dxf_path} ({os.path.getsize(saved_dxf_path)} bytes)")

    print("\n=================================================================")
    print("✅ DEMO COMPLETED SUCCESSFULLY: End-to-end MCP pipeline proven!")
    print("=================================================================")


if __name__ == "__main__":
    asyncio.run(run_end_to_end_demo())
