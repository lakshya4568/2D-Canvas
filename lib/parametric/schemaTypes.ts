/* tslint:disable */
/**
 * This file was automatically generated from parametric-sketch.schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSON Schema file,
 * and run `bun run generate:types` to regenerate this file.
 */

/**
 * Canonical data model for a 2D parametric geometry sketch with dual-graph architecture
 */
export interface ParametricSketch {
  sketchId: string;
  schemaVersion: "1.0";
  engineVersion?: string;
  name?: string;
  units: {
    length: "mm" | "m" | "in" | "ft";
    angle: "deg" | "rad";
    [k: string]: unknown;
  };
  tolerances: {
    units: "mm";
    weld_mm: number;
    geometry_mm: number;
    cluster_mm: number;
    angle_rad: number;
    collinear_rad?: number;
    solver_residual: number;
    singular_value_eps: number;
    independence_eps: number;
    snap_import_mm?: number;
    [k: string]: unknown;
  };
  parameters: {
    [k: string]: {
      id: string;
      name: string;
      role: "DRIVING" | "DERIVED" | "FIXED" | "MEASURED";
      type: "LENGTH" | "ANGLE" | "COUNT" | "RATIO" | "BOOLEAN";
      value: number;
      unit: "mm" | "m" | "deg" | "rad" | "count" | "ratio";
      minValue?: number;
      maxValue?: number;
      step?: number;
      expr?: string;
      semanticTag?: string;
      sourceGeometry?: string[];
      confidence?: number;
      provenance: "GeometricFact" | "Inference" | "UserConstraint" | "UserFormula" | "Measurement";
      codeRef?: string;
      uiGroup?: string;
      [k: string]: unknown;
    };
  };
  formulas: {
    targetParameterId: string;
    expression: string;
    dependencies: string[];
    description?: string;
    [k: string]: unknown;
  }[];
  primitives: {
    points: {
      [k: string]: {
        id: string;
        x: number;
        y: number;
        isConstruction?: boolean;
        fixed?: boolean;
        dofStatus?: "FREE" | "FIXED_X" | "FIXED_Y" | "FULLY_CONSTRAINED";
        [k: string]: unknown;
      };
    };
    lines: {
      [k: string]: {
        id: string;
        startPointId: string;
        endPointId: string;
        isConstruction?: boolean;
        semanticRole?: string;
        [k: string]: unknown;
      };
    };
    arcs: {
      [k: string]: {
        id: string;
        centerPointId: string;
        startPointId?: string;
        endPointId?: string;
        radius: number;
        startAngle: number;
        endAngle: number;
        isConstruction?: boolean;
        [k: string]: unknown;
      };
    };
    circles: {
      [k: string]: {
        id: string;
        centerPointId: string;
        radius: number;
        isConstruction?: boolean;
        [k: string]: unknown;
      };
    };
    polylines?: {
      [k: string]: {
        id: string;
        vertices: string[];
        closed: boolean;
        isConstruction?: boolean;
        [k: string]: unknown;
      };
    };
    [k: string]: unknown;
  };
  topology: {
    halfEdges: {
      [k: string]: {
        id: string;
        originPointId: string;
        twinHalfEdgeId: string | null;
        nextHalfEdgeId: string;
        prevHalfEdgeId?: string;
        faceId: string;
        primitiveId: string;
        [k: string]: unknown;
      };
    };
    faces: {
      [k: string]: {
        id: string;
        outerHalfEdgeId: string;
        innerHoles: string[];
        nestingDepth?: number;
        semanticCategory:
          | "VOID"
          | "TOP_SLAB"
          | "BOTTOM_SLAB"
          | "OUTER_WALL"
          | "INTERNAL_WEB"
          | "HAUNCH"
          | "FOOTING"
          | "BARRIER"
          | "DECK"
          | "PIER"
          | "UNCLASSIFIED";
        hatchPattern?: string;
        tags?: string[];
        [k: string]: unknown;
      };
    };
    [k: string]: unknown;
  };
  constraints: {
    [k: string]: {
      id: string;
      type:
        | "COINCIDENT"
        | "COLLINEAR"
        | "HORIZONTAL"
        | "VERTICAL"
        | "PARALLEL"
        | "PERPENDICULAR"
        | "EQUAL_LENGTH"
        | "EQUAL_RADIUS"
        | "CONCENTRIC"
        | "DISTANCE_POINT_TO_POINT"
        | "DISTANCE_POINT_TO_LINE"
        | "OFFSET_LINE_TO_LINE"
        | "SYMMETRIC"
        | "TANGENT"
        | "POINT_ON_OBJECT"
        | "MIDPOINT"
        | "ANGLE"
        | "RADIUS"
        | "DIAMETER"
        | "CHAMFER_EQUAL_LEG"
        | "FIXED";
      entities: string[];
      parameterBinding?: string | null;
      targetValue?: number | null;
      strength: "fixed" | "driving" | "hard" | "soft" | "reference" | "temporary";
      driving: boolean;
      isActive?: boolean;
      predicate?: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9";
      provenance: "GeometricFact" | "Inference" | "UserConstraint";
      confidence?: number;
      state: "active" | "suppressed" | "conflicting" | "redundant";
      diagnostic?: string;
      [k: string]: unknown;
    };
  };
  components?: {
    [k: string]: {
      instanceId: string;
      templateId: string;
      parameterOverrides: {
        [k: string]: string;
      };
      attachedVia?: {
        parentInstanceId: string;
        parentPortId: string;
        ownPortId: string;
        offsetExpr?: {
          along?: string;
          normal?: string;
          rotate?: string;
          [k: string]: unknown;
        };
        [k: string]: unknown;
      };
      [k: string]: unknown;
    };
  };
  ports?: {
    id: string;
    kind: "point" | "edge" | "axis";
    localFrame: {
      origin: {
        x: string;
        y: string;
        [k: string]: unknown;
      };
      angle: string;
      [k: string]: unknown;
    };
    direction?: "in" | "out" | "bidirectional";
    length?: string;
    [k: string]: unknown;
  }[];
  repeats?: {
    id: string;
    type: "linear_array" | "path_array" | "polar_array" | "mirror";
    sourceComponent: string;
    countParamRef: string;
    spacingExpr: string;
    spacingMode: "driven" | "derived";
    /**
     * @minItems 2
     * @maxItems 2
     */
    direction: [number, number];
    anchorPortId: string;
    indexVariable: string;
    [k: string]: unknown;
  }[];
  semantics?: {
    id: string;
    type: string;
    faces: string[];
    edges: string[];
    parent?: string;
    children: string[];
    params: string[];
    confirmedBy: "author" | "inference-pending";
    [k: string]: unknown;
  }[];
  dofReport?: {
    total?: number;
    status?: "UC" | "FC" | "OC" | "NotSolvable";
    byComponent?: {
      componentId?: string;
      dof?: number;
      block?: "under" | "square" | "over";
      [k: string]: unknown;
    }[];
    conflicting?: string[];
    redundant?: string[];
    maxResidual?: number;
    stable?: boolean;
    [k: string]: unknown;
  };
  provenance?: {
    timestamp: string;
    action: string;
    author: string;
    details?: {
      [k: string]: unknown;
    };
    [k: string]: unknown;
  }[];
  [k: string]: unknown;
}


/* tslint:disable */
/**
 * This file was automatically generated from template.schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSON Schema file,
 * and run `bun run generate:types` to regenerate this file.
 */

/**
 * Canonical data model for a deliverable, reusable parametric CAD template definition
 */
export interface TemplateDefinition {
  id: string;
  name: string;
  category: "component" | "bridge" | "detail" | "assembly";
  schemaVersion: "1.0";
  engineVersion: string;
  standardsReference?: string;
  parameters: {
    id: string;
    name: string;
    role: "DRIVING" | "DERIVED" | "FIXED" | "MEASURED";
    type: "LENGTH" | "ANGLE" | "COUNT" | "RATIO" | "BOOLEAN";
    value: number;
    unit: "mm" | "m" | "deg" | "rad" | "count" | "ratio";
    min?: number;
    max?: number;
    step?: number;
    expr?: string;
    semanticTag?: string;
    sourceGeometry?: string[];
    confidence?: number;
    provenance: "GeometricFact" | "Inference" | "UserConstraint" | "UserFormula" | "Measurement";
    codeRef?: string;
    uiGroup?: string;
    [k: string]: unknown;
  }[];
  expressions: {
    targetParameterId: string;
    expression: string;
    dependencies: string[];
    description?: string;
    [k: string]: unknown;
  }[];
  geometry: {
    points: {
      id: string;
      x: number;
      y: number;
      fixed?: boolean;
      construction?: boolean;
      [k: string]: unknown;
    }[];
    lines: {
      id: string;
      p1: string;
      p2: string;
      construction?: boolean;
      semanticRole?: string;
      [k: string]: unknown;
    }[];
    arcs: {
      id: string;
      center: string;
      radius: number;
      startAngle: number;
      endAngle: number;
      startPoint?: string;
      endPoint?: string;
      construction?: boolean;
      [k: string]: unknown;
    }[];
    circles: {
      id: string;
      center: string;
      radius: number;
      construction?: boolean;
      [k: string]: unknown;
    }[];
    polylines: {
      id: string;
      vertices: string[];
      closed: boolean;
      construction?: boolean;
      [k: string]: unknown;
    }[];
    [k: string]: unknown;
  };
  constraints: {
    id: string;
    kind:
      | "coincident"
      | "collinear"
      | "parallel"
      | "perpendicular"
      | "horizontal"
      | "vertical"
      | "equal_length"
      | "equal_radius"
      | "symmetric"
      | "tangent"
      | "point_on_object"
      | "midpoint"
      | "concentric"
      | "offset"
      | "distance"
      | "distance_x"
      | "distance_y"
      | "angle"
      | "radius"
      | "diameter"
      | "chamfer_equal_leg"
      | "fixed";
    refs: string[];
    value?: number;
    paramRef?: string;
    strength: "fixed" | "driving" | "hard" | "soft" | "reference" | "temporary";
    driving: boolean;
    predicate?: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9";
    clause?: string;
    provenance: "GeometricFact" | "Inference" | "UserConstraint";
    confidence?: number;
    state: "active" | "suppressed" | "conflicting" | "redundant";
    diagnostic?: string;
    [k: string]: unknown;
  }[];
  ports: {
    id: string;
    kind: "point" | "edge" | "axis";
    localFrame: {
      origin: {
        x: string;
        y: string;
        [k: string]: unknown;
      };
      angle: string;
      [k: string]: unknown;
    };
    direction?: "in" | "out" | "bidirectional";
    length?: string;
    [k: string]: unknown;
  }[];
  repeats?: {
    id: string;
    type: "linear_array" | "path_array" | "polar_array" | "mirror";
    sourceComponent: string;
    countParamRef: string;
    spacingExpr: string;
    spacingMode: "driven" | "derived";
    /**
     * @minItems 2
     * @maxItems 2
     */
    direction: [number, number];
    anchorPortId: string;
    indexVariable: string;
    parameterOverrides?: {
      [k: string]: string;
    };
    pathGeometryId?: string;
    [k: string]: unknown;
  }[];
  components?: {
    instanceId: string;
    templateId: string;
    parameterOverrides: {
      [k: string]: string;
    };
    attachedVia?: {
      parentInstanceId: string;
      parentPortId: string;
      ownPortId: string;
      offsetExpr?: {
        along?: string;
        normal?: string;
        rotate?: string;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    };
    [k: string]: unknown;
  }[];
  semantics: {
    id: string;
    type: string;
    faces: string[];
    edges: string[];
    parent?: string;
    children: string[];
    params: string[];
    confirmedBy: "author" | "inference-pending";
    [k: string]: unknown;
  }[];
  validation: {
    ruleId: string;
    type: "BOUNDS" | "CROSS_PARAM" | "STANDARDS" | "TOPOLOGY";
    severity: "ERROR" | "WARNING" | "INFO";
    expression: string;
    message: string;
    codeRef?: string;
    [k: string]: unknown;
  }[];
  provenance: {
    timestamp: string;
    action: string;
    author: string;
    details?: {
      [k: string]: unknown;
    };
    [k: string]: unknown;
  }[];
  [k: string]: unknown;
}
