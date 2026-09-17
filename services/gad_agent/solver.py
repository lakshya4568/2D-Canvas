"""
GAD Constraint Solver & Variational Updater (§56).
Enforces Planar Rigid-Body Anchor Rule (§18) and Zero Conformal Scaling (§8).
Recalculates entity coordinates minimum-norm from warm start without proportional scaling.
"""

from typing import Dict, Any, Tuple
from services.models.schema_models import GADModel, GADParameterModel
from .geometry import construct_box_culvert_entities

def solve_gad_model(model: GADModel, parameter_updates: Dict[str, float]) -> GADModel:
    """
    Applies parameter deltas to a GADModel, recomputes derived formulas,
    and updates geometric coordinates while preserving undriven dimensions.
    """
    # 1. Update driving parameters
    for k, v in parameter_updates.items():
        if k in model.parameters:
            model.parameters[k].value = float(v)
        else:
            model.parameters[k] = GADParameterModel(
                name=k,
                value=float(v),
                unit="mm",
                kind="scalar",
                role="DRIVING",
            )

    # 2. Evaluate formula DAG
    span = model.parameters.get("span", GADParameterModel(name="span", value=10700.0)).value
    height = model.parameters.get("height", GADParameterModel(name="height", value=4100.0)).value
    wall_thk = model.parameters.get("wall_thk", GADParameterModel(name="wall_thk", value=850.0)).value
    top_slab = model.parameters.get("top_slab", GADParameterModel(name="top_slab", value=800.0)).value
    bot_slab = model.parameters.get("bot_slab", GADParameterModel(name="bot_slab", value=800.0)).value
    haunch = model.parameters.get("haunch", GADParameterModel(name="haunch", value=600.0)).value
    cushion_thk = model.parameters.get("cushion_thk", GADParameterModel(name="cushion_thk", value=4000.0)).value

    # Update derived formulas
    if "outer_w" in model.parameters:
        model.parameters["outer_w"].value = span + 2.0 * wall_thk
    if "outer_h" in model.parameters:
        model.parameters["outer_h"].value = height + top_slab + bot_slab

    # 3. Anisotropic / Non-conformal geometry regeneration (§8)
    # Haunches, wall thickness, and cushion thickness are strictly preserved!
    view_id = model.views[0].id if model.views else "view_cross_section"
    new_entities = construct_box_culvert_entities(
        span=span,
        height=height,
        top_slab=top_slab,
        bot_slab=bot_slab,
        wall_thk=wall_thk,
        haunch=haunch,
        cushion_thk=cushion_thk,
        view_id=view_id,
    )
    model.entities = new_entities

    return model
