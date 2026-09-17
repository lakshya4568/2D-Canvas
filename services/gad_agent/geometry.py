"""
GAD Geometry & Civil Entity Clustering Module (§56).
Reconstructs geometric entities in model-space millimeters (mm) with coordinate geometry,
extracting design intent without uniform similarity scaling (§8).
"""

from typing import List, Dict, Any, Optional
from services.models.schema_models import GADEntityModel

def construct_box_culvert_entities(
    span: float = 10700.0,
    height: float = 4100.0,
    top_slab: float = 800.0,
    bot_slab: float = 800.0,
    wall_thk: float = 850.0,
    haunch: float = 600.0,
    cushion_thk: float = 4000.0,
    cushion_w: float = 11400.0,
    view_id: str = "view_cross_section",
) -> List[GADEntityModel]:
    """
    Constructs clean, un-hatched civil CAD geometry for an RCC Box Culvert Half-Section.
    Adheres strictly to IRC:SP:13 and UPCE-MASTER-1.0 invariants:
    - Origin at Centerline / Invert level (0, 0)
    - Symmetry about X = 0 (Centerline)
    - 3-DOF anchored datum
    """
    entities: List[GADEntityModel] = []

    half_span = span / 2.0
    outer_half_w = half_span + wall_thk

    # 1. Centerline Reference Entity
    cl_top = height + top_slab + cushion_thk + 1200.0
    cl_bot = -bot_slab - 1600.0
    entities.append(
        GADEntityModel(
            id="centerline",
            type="GridLine",
            view_id=view_id,
            geom={"kind": "Line", "coords": [[0.0, cl_bot], [0.0, cl_top]]},
            tags=["CENTERLINE", "PROP_BRIDGE_AXIS"],
            meta={"role": "datum", "level": "DATUM_0"},
        )
    )

    # 2. Outer Concrete Perimeter (Culvert Outer Box)
    outer_coords = [
        [-outer_half_w, -bot_slab],
        [outer_half_w, -bot_slab],
        [outer_half_w, height + top_slab],
        [-outer_half_w, height + top_slab],
        [-outer_half_w, -bot_slab],
    ]
    entities.append(
        GADEntityModel(
            id="culvert_outer_boundary",
            type="CulvertBarrel",
            view_id=view_id,
            geom={"kind": "Polyline", "coords": outer_coords},
            params={"width": outer_half_w * 2, "height": height + top_slab + bot_slab},
            tags=["CONCRETE_OUTLINE", "OUTER_ENVELOPE"],
            meta={"material": "M30 Concrete", "role": "primary"},
        )
    )

    # 3. Inner Opening with 4 Corner Haunches (600x600 mm at 45°)
    inner_coords = [
        [-half_span + haunch, 0.0],
        [-half_span, haunch],
        [-half_span, height - haunch],
        [-half_span + haunch, height],
        [half_span - haunch, height],
        [half_span, height - haunch],
        [half_span, haunch],
        [half_span - haunch, 0.0],
        [-half_span + haunch, 0.0],
    ]
    entities.append(
        GADEntityModel(
            id="culvert_inner_chamber",
            type="CulvertBarrel",
            view_id=view_id,
            geom={"kind": "Polyline", "coords": inner_coords},
            params={"clear_span": span, "clear_height": height, "haunch": haunch},
            tags=["CONCRETE_SECTION", "WATERWAY_OPENING"],
            meta={"material": "Void / Waterway", "role": "hydraulic"},
        )
    )

    # 4. Corner Haunches (individual civil elements)
    haunch_defs = [
        ("haunch_bl", [[-half_span, haunch], [-half_span + haunch, 0.0]]),
        ("haunch_tl", [[-half_span, height - haunch], [-half_span + haunch, height]]),
        ("haunch_tr", [[half_span - haunch, height], [half_span, height - haunch]]),
        ("haunch_br", [[half_span, haunch], [half_span - haunch, 0.0]]),
    ]
    for h_id, h_pts in haunch_defs:
        entities.append(
            GADEntityModel(
                id=h_id,
                type="Haunch",
                view_id=view_id,
                geom={"kind": "Line", "coords": h_pts},
                params={"leg_x": haunch, "leg_y": haunch, "angle_deg": 45.0},
                tags=["CONCRETE_SECTION", "CORNER_HAUNCH"],
                meta={"clause": "IRC:SP:13 Cl 9.4", "role": "structural_relief"},
            )
        )

    # 5. Top Slab & Bottom Slab representations
    entities.append(
        GADEntityModel(
            id="top_slab",
            type="Slab",
            view_id=view_id,
            geom={
                "kind": "Rectangle",
                "coords": [[-outer_half_w, height], [outer_half_w, height + top_slab]],
            },
            params={"thickness": top_slab, "length": outer_half_w * 2},
            tags=["CONCRETE_OUTLINE", "ROOF_SLAB"],
            meta={"material": "M30 Concrete"},
        )
    )
    entities.append(
        GADEntityModel(
            id="bottom_slab",
            type="Slab",
            view_id=view_id,
            geom={
                "kind": "Rectangle",
                "coords": [[-outer_half_w, -bot_slab], [outer_half_w, 0.0]],
            },
            params={"thickness": bot_slab, "length": outer_half_w * 2},
            tags=["FOUNDATION", "BASE_SLAB"],
            meta={"material": "M30 Concrete"},
        )
    )

    # 6. Earth Cushion Layer (above top slab)
    cush_half_w = cushion_w / 2.0
    cush_bot_y = height + top_slab
    cush_top_y = cush_bot_y + cushion_thk
    cushion_coords = [
        [-cush_half_w, cush_bot_y],
        [cush_half_w, cush_bot_y],
        [cush_half_w, cush_top_y],
        [-cush_half_w, cush_top_y],
        [-cush_half_w, cush_bot_y],
    ]
    entities.append(
        GADEntityModel(
            id="earth_cushion",
            type="Cushion",
            view_id=view_id,
            geom={"kind": "Polyline", "coords": cushion_coords},
            params={"thickness": cushion_thk, "width": cushion_w},
            tags=["EARTH_CUSHION", "ROAD_FORMATION"],
            meta={"material": "Compacted Granular Soil"},
        )
    )

    return entities
