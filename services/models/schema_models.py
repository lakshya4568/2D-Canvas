"""
This file is generated from canonical schemas:
- schemas/parametric-sketch.schema.json
- schemas/template.schema.json
DO NOT MODIFY DIRECTLY.
"""
from typing import List, Dict, Optional, Any, Literal
from pydantic import BaseModel, Field

class TolerancePolicyModel(BaseModel):
    units: Literal["mm"] = "mm"
    weld_mm: float = 0.5
    geometry_mm: float = 0.5
    cluster_mm: float = 1.0
    angle_rad: float = 0.008726
    collinear_rad: float = 0.05
    solver_residual: float = 1e-8
    singular_value_eps: float = 1e-10
    independence_eps: float = 1e-6
    snap_import_mm: float = 2.0

class ParameterModel(BaseModel):
    id: str
    name: str
    role: Literal["DRIVING", "DERIVED", "FIXED", "MEASURED"]
    type: Literal["LENGTH", "ANGLE", "COUNT", "RATIO", "BOOLEAN"]
    value: float
    unit: Literal["mm", "m", "deg", "rad", "count", "ratio"]
    minValue: Optional[float] = None
    maxValue: Optional[float] = None
    step: Optional[float] = None
    expr: Optional[str] = None
    semanticTag: Optional[str] = None
    sourceGeometry: Optional[List[str]] = None
    confidence: Optional[float] = None
    provenance: Literal["GeometricFact", "Inference", "UserConstraint", "UserFormula", "Measurement"]
    codeRef: Optional[str] = None
    uiGroup: Optional[str] = None

class FormulaModel(BaseModel):
    targetParameterId: str
    expression: str
    dependencies: List[str]
    description: Optional[str] = None

class ConstraintModel(BaseModel):
    id: str
    type: str
    entities: List[str]
    parameterBinding: Optional[str] = None
    targetValue: Optional[float] = None
    strength: Literal["fixed", "driving", "hard", "soft", "reference", "temporary"]
    driving: bool
    isActive: bool = True
    predicate: Optional[str] = None
    provenance: Literal["GeometricFact", "Inference", "UserConstraint"]
    confidence: Optional[float] = None
    state: Literal["active", "suppressed", "conflicting", "redundant"]
    diagnostic: Optional[str] = None

class ParametricSketchModel(BaseModel):
    sketchId: str
    schemaVersion: Literal["1.0"] = "1.0"
    engineVersion: Optional[str] = None
    name: Optional[str] = None
    units: Dict[str, str]
    tolerances: TolerancePolicyModel
    parameters: Dict[str, ParameterModel]
    formulas: List[FormulaModel]
    primitives: Dict[str, Any]
    topology: Dict[str, Any]
    constraints: Dict[str, ConstraintModel]
    components: Optional[Dict[str, Any]] = None
    ports: Optional[List[Any]] = None
    repeats: Optional[List[Any]] = None
    semantics: Optional[List[Any]] = None
    dofReport: Optional[Dict[str, Any]] = None
    provenance: Optional[List[Dict[str, Any]]] = None

class TemplateDefinitionModel(BaseModel):
    id: str
    name: str
    category: Literal["component", "bridge", "detail", "assembly"]
    schemaVersion: Literal["1.0"] = "1.0"
    engineVersion: Optional[str] = None
    standardsReference: Optional[str] = None
    parameters: List[ParameterModel]
    expressions: List[FormulaModel]
    geometry: Dict[str, Any]
    constraints: List[ConstraintModel]
    ports: List[Any]
    semantics: List[Any]
    validation: List[Any]
    provenance: List[Any]
    repeats: Optional[List[Any]] = None
    components: Optional[List[Any]] = None

# ===========================================================================
# Civil General Arrangement Drawing (GAD) Models (§56, gad-model.schema.json)
# ===========================================================================

class GADProjectModel(BaseModel):
    name: str
    type: Literal["bridge", "culvert", "building", "foundation", "road", "retaining_wall", "other"]
    units: Literal["mm", "m"] = "mm"
    standardsReference: Optional[str] = "IRC:SP:13 / IRC:112 / IS 456"

class GADViewModel(BaseModel):
    id: str
    type: Literal["plan", "elevation", "cross_section", "longitudinal_section", "detail"]
    sheet_index: int = 0
    bbox_pixels: Optional[List[float]] = None
    transform: Dict[str, Any] = Field(default_factory=lambda: {
        "pixel_to_world": [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        "world_origin": [0.0, 0.0],
        "scale": 1.0
    })
    entities: List[str] = Field(default_factory=list)

class GADParameterModel(BaseModel):
    name: str
    value: float
    unit: Literal["mm", "m", "deg", "rad", "count", "ratio"] = "mm"
    kind: Literal["scalar", "vector", "enum"] = "scalar"
    role: Literal["DRIVING", "DERIVED", "FIXED", "MEASURED"] = "DRIVING"
    minValue: Optional[float] = None
    maxValue: Optional[float] = None
    expr: Optional[str] = None
    description: Optional[str] = None
    source: Optional[Dict[str, Any]] = None

class GADConstraintModel(BaseModel):
    id: str
    type: Literal[
        "distance", "coincident", "parallel", "perpendicular",
        "aligned_to_grid", "equal", "symmetry", "rigid_anchor",
        "horizontal", "vertical"
    ]
    entities: List[str]
    params: Optional[Dict[str, Any]] = None
    status: Literal["active", "violated", "redundant", "suppressed"] = "active"
    source: Optional[Dict[str, Any]] = None

class GADEntityModel(BaseModel):
    id: str
    type: Literal[
        "GridLine", "Column", "Beam", "Slab", "Foundation", "Pier",
        "Abutment", "CulvertBarrel", "Haunch", "Cushion", "WingWall",
        "TextNote", "Dimension", "GenericShape"
    ]
    view_id: Optional[str] = None
    geom: Dict[str, Any]  # {"kind": "Line"|"Rectangle"|..., "coords": [[x, y], ...]}
    params: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    meta: Optional[Dict[str, Any]] = None
    source: Optional[Dict[str, Any]] = None

class GADFormulaModel(BaseModel):
    id: str
    expression: str
    depends_on: List[str]
    defines: List[str]
    domain: Optional[str] = None
    source: Optional[Dict[str, Any]] = None

class GADModel(BaseModel):
    id: str
    project: GADProjectModel
    views: List[GADViewModel] = Field(default_factory=list)
    parameters: Dict[str, GADParameterModel] = Field(default_factory=dict)
    constraints: List[GADConstraintModel] = Field(default_factory=list)
    entities: List[GADEntityModel] = Field(default_factory=list)
    formulas: List[GADFormulaModel] = Field(default_factory=list)
    provenance: Optional[Dict[str, Any]] = None

