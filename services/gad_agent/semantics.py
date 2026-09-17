"""
GAD Text & Civil Semantics Understanding Module (§56).
Classifies civil engineering annotations and maps them into parametric constraints,
driving parameters, and formula dependencies (IRC:SP:13, IRC:112).
"""

from typing import Dict, List, Tuple
from services.models.schema_models import GADParameterModel, GADFormulaModel, GADConstraintModel

def extract_box_culvert_semantics(
    span: float = 10700.0,
    height: float = 4100.0,
    top_slab: float = 800.0,
    bot_slab: float = 800.0,
    wall_thk: float = 850.0,
    haunch: float = 600.0,
    cushion_thk: float = 4000.0,
    cushion_w: float = 11400.0,
) -> Tuple[Dict[str, GADParameterModel], List[GADFormulaModel], List[GADConstraintModel]]:
    """
    Constructs the canonical parameter dictionary, formula DAG, and constraint set.
    """
    parameters: Dict[str, GADParameterModel] = {
        "span": GADParameterModel(
            name="span",
            value=span,
            unit="mm",
            kind="scalar",
            role="DRIVING",
            description="Clear horizontal waterway span between inner wall faces",
            source={"text": "CLEAR SPAN: 10700", "confidence": 0.98},
        ),
        "height": GADParameterModel(
            name="height",
            value=height,
            unit="mm",
            kind="scalar",
            role="DRIVING",
            description="Clear vertical waterway height between invert and soffit",
            source={"text": "CLEAR HEIGHT: 4100", "confidence": 0.98},
        ),
        "wall_thk": GADParameterModel(
            name="wall_thk",
            value=wall_thk,
            unit="mm",
            kind="scalar",
            role="DRIVING",
            description="Side wall thickness (rigid, undriven by span)",
            source={"text": "WALL THICKNESS: 850", "confidence": 0.95},
        ),
        "top_slab": GADParameterModel(
            name="top_slab",
            value=top_slab,
            unit="mm",
            kind="scalar",
            role="DRIVING",
            description="Top roof slab structural thickness",
            source={"text": "TOP SLAB: 800", "confidence": 0.95},
        ),
        "bot_slab": GADParameterModel(
            name="bot_slab",
            value=bot_slab,
            unit="mm",
            kind="scalar",
            role="DRIVING",
            description="Bottom raft / invert slab structural thickness",
            source={"text": "BOTTOM SLAB: 800", "confidence": 0.95},
        ),
        "haunch": GADParameterModel(
            name="haunch",
            value=haunch,
            unit="mm",
            kind="scalar",
            role="DRIVING",
            description="Corner fillet/haunch leg dimension (45 deg relief)",
            source={"text": "HAUNCH 600x600", "confidence": 0.95},
        ),
        "cushion_thk": GADParameterModel(
            name="cushion_thk",
            value=cushion_thk,
            unit="mm",
            kind="scalar",
            role="DRIVING",
            description="Earth cushion depth above roof slab to road formation level",
            source={"text": "EARTH CUSHION 4000", "confidence": 0.92},
        ),
        "outer_w": GADParameterModel(
            name="outer_w",
            value=span + 2.0 * wall_thk,
            unit="mm",
            kind="scalar",
            role="DERIVED",
            expr="span + 2 * wall_thk",
            description="Total outer concrete structure width",
        ),
        "outer_h": GADParameterModel(
            name="outer_h",
            value=height + top_slab + bot_slab,
            unit="mm",
            kind="scalar",
            role="DERIVED",
            expr="height + top_slab + bot_slab",
            description="Total outer concrete structure height",
        ),
    }

    formulas: List[GADFormulaModel] = [
        GADFormulaModel(
            id="formula_outer_w",
            expression="outer_w = span + 2 * wall_thk",
            depends_on=["span", "wall_thk"],
            defines=["outer_w"],
            domain="culvert",
        ),
        GADFormulaModel(
            id="formula_outer_h",
            expression="outer_h = height + top_slab + bot_slab",
            depends_on=["height", "top_slab", "bot_slab"],
            defines=["outer_h"],
            domain="culvert",
        ),
    ]

    constraints: List[GADConstraintModel] = [
        GADConstraintModel(
            id="c_rigid_anchor",
            type="rigid_anchor",
            entities=["centerline"],
            status="active",
        ),
        GADConstraintModel(
            id="c_sym_outer",
            type="symmetry",
            entities=["culvert_outer_boundary", "centerline"],
            status="active",
        ),
        GADConstraintModel(
            id="c_sym_inner",
            type="symmetry",
            entities=["culvert_inner_chamber", "centerline"],
            status="active",
        ),
        GADConstraintModel(
            id="c_haunch_45",
            type="equal",
            entities=["haunch_bl", "haunch_br"],
            status="active",
        ),
    ]

    return parameters, formulas, constraints
