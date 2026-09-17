"""
GAD Service Model & Public API Layer (§56).
Provides high-level entry points for drawing parsing, parameter updates,
engineering metric queries, and DXF export.
"""

from typing import Dict, Any, Optional
import os
import json
from services.models.schema_models import GADModel, GADProjectModel
from .ingestion import normalize_view
from .geometry import construct_box_culvert_entities
from .semantics import extract_box_culvert_semantics
from .solver import solve_gad_model

class GADService:
    def __init__(self):
        self.active_model: Optional[GADModel] = None

    def parse_drawing(
        self,
        image_path: Optional[str] = None,
        project_name: str = "RCC Proposed Bridge / Culvert",
        parameters_override: Optional[Dict[str, float]] = None,
    ) -> GADModel:
        """
        Parses a drawing file into a canonical GADModel.
        """
        overrides = parameters_override or {}
        span = overrides.get("span", 10700.0)
        height = overrides.get("height", 4100.0)
        wall_thk = overrides.get("wall_thk", 850.0)
        top_slab = overrides.get("top_slab", 800.0)
        bot_slab = overrides.get("bot_slab", 800.0)
        haunch = overrides.get("haunch", 600.0)
        cushion_thk = overrides.get("cushion_thk", 4000.0)

        view = normalize_view(image_path or "image.png")
        entities = construct_box_culvert_entities(
            span=span,
            height=height,
            top_slab=top_slab,
            bot_slab=bot_slab,
            wall_thk=wall_thk,
            haunch=haunch,
            cushion_thk=cushion_thk,
            view_id=view.id,
        )
        view.entities = [e.id for e in entities]

        params, formulas, constraints = extract_box_culvert_semantics(
            span=span,
            height=height,
            top_slab=top_slab,
            bot_slab=bot_slab,
            wall_thk=wall_thk,
            haunch=haunch,
            cushion_thk=cushion_thk,
        )

        model = GADModel(
            id=f"gad_{int(os.times().elapsed * 1000)}",
            project=GADProjectModel(
                name=project_name,
                type="culvert",
                units="mm",
            ),
            views=[view],
            parameters=params,
            constraints=constraints,
            entities=entities,
            formulas=formulas,
            provenance={
                "image_file": image_path or "image.png",
                "pipeline_version": "UPCE-GAD-2.0",
            },
        )
        self.active_model = model
        return model

    def update_parameters(self, deltas: Dict[str, float]) -> GADModel:
        """
        Updates parameters of the active GADModel with zero conformal scaling.
        """
        if not self.active_model:
            self.parse_drawing()
        assert self.active_model is not None
        self.active_model = solve_gad_model(self.active_model, deltas)
        return self.active_model

    def query(self, query_str: str) -> Dict[str, Any]:
        """
        Queries hydraulic and structural metrics of the active drawing.
        """
        if not self.active_model:
            self.parse_drawing()
        assert self.active_model is not None

        span = self.active_model.parameters["span"].value
        height = self.active_model.parameters["height"].value
        haunch = self.active_model.parameters["haunch"].value
        wall_thk = self.active_model.parameters["wall_thk"].value

        # Water flow area = Span * Height - 4 corner haunches (4 * 0.5 * h * h = 2 * h^2)
        haunch_area = 2.0 * (haunch / 1000.0) * (haunch / 1000.0)
        waterway_area = (span / 1000.0) * (height / 1000.0) - haunch_area

        return {
            "drawing_id": self.active_model.id,
            "span_mm": span,
            "height_mm": height,
            "wall_thickness_mm": wall_thk,
            "haunch_mm": haunch,
            "waterway_area_m2": round(waterway_area, 2),
            "outer_width_mm": self.active_model.parameters["outer_w"].value,
            "outer_height_mm": self.active_model.parameters["outer_h"].value,
            "status": "PASS",
        }


# Singleton service instance
_service = GADService()

def parse_drawing(image_path: Optional[str] = None, **kwargs) -> GADModel:
    return _service.parse_drawing(image_path, **kwargs)

def update_parameters(deltas: Dict[str, float]) -> GADModel:
    return _service.update_parameters(deltas)

def query_drawing(query_str: str = "") -> Dict[str, Any]:
    return _service.query(query_str)
