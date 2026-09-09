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
