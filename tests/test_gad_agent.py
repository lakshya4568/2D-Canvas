"""
Tests for GAD Parametric Service & Invariants (§56, §8, §18).
"""

import pytest
from services.gad_agent import GADService, parse_drawing, update_parameters, query_drawing
from services.models.schema_models import GADModel

def test_gad_model_initialization():
    service = GADService()
    model = service.parse_drawing("image.png")

    assert isinstance(model, GADModel)
    assert model.project.type == "culvert"
    assert model.parameters["span"].value == 10700.0
    assert model.parameters["height"].value == 4100.0
    assert model.parameters["wall_thk"].value == 850.0
    assert model.parameters["outer_w"].value == 12400.0  # 10700 + 2 * 850
    assert model.parameters["outer_h"].value == 5700.0   # 4100 + 800 + 800

    # Verify rigid anchor constraint (§18)
    anchor = next((c for c in model.constraints if c.type == "rigid_anchor"), None)
    assert anchor is not None
    assert "centerline" in anchor.entities

def test_gad_zero_conformal_scaling_on_update():
    """
    §8: Undriven member lengths, wall thicknesses, and haunches must be strictly preserved
    during parameter changes.
    """
    service = GADService()
    model = service.parse_drawing()

    # Initial wall thickness & haunch
    assert model.parameters["wall_thk"].value == 850.0
    assert model.parameters["haunch"].value == 600.0

    # User expands span from 10700 to 25000 mm
    updated = service.update_parameters({"span": 25000.0})

    assert updated.parameters["span"].value == 25000.0
    # Outer width must update: 25000 + 2 * 850 = 26700 mm
    assert updated.parameters["outer_w"].value == 26700.0

    # CRITICAL INVARIANT: Wall thickness and haunch MUST NOT scale!
    assert updated.parameters["wall_thk"].value == 850.0
    assert updated.parameters["haunch"].value == 600.0
    assert updated.parameters["top_slab"].value == 800.0
    assert updated.parameters["cushion_thk"].value == 4000.0

def test_gad_query_hydraulics():
    service = GADService()
    service.parse_drawing()
    res = service.query("waterway area")

    assert res["status"] == "PASS"
    assert res["span_mm"] == 10700.0
    assert res["height_mm"] == 4100.0
    # Waterway area = (10.7 * 4.1) - (2 * 0.6^2) = 43.87 - 0.72 = 43.15 m²
    assert 43.0 <= res["waterway_area_m2"] <= 44.0
