import { ID, Shape, ToolId, Viewport, SnapResult } from "../geometry/types";
import { computeMultiShapeBounds, rotatePoint } from "../geometry/metrics";
import { ParametricModel, ParametricVariable } from "../parametric/model";
import { GeometricConstraint } from "../parametric/constraints";
import { BUILTIN_TEMPLATES } from "../parametric/templates";
import {
  detectGADAssemblies,
  isShapeInGADAssembly,
  solveGADAssemblyAdjustment,
} from "../geometry/gadAssemblyEngine";
import {
  BoundaryLimitMode,
  BoundaryLimitEvaluation,
  evaluateBoundaryLimits,
  getShapeCorners,
  getShapeBoundaryPolygon,
} from "../parametric/boundaryLimits";
import {
  InferredFormula,
  synthesizeFormulasFromGeometry,
} from "../inference/formulaSynthesizer";

const MAX_HISTORY_STEPS = 100;

export interface ShapeStyleConfig {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  opacity: number;
  strokeDasharray?: string;
}

export type ThemeMode = "dark" | "light";

export interface HistoryItem {
  id: string;
  timestamp: number;
  description: string;
  shapes: Shape[];
}

export interface DrawingState {
  shapes: Shape[];
  tool: ToolId;
  selectedId: ID | null;
  selectedIds: ID[]; // Multi-selection / Group selection
  draft: Shape | null;
  viewport: Viewport;
  gridSnapEnabled: boolean;
  objectSnapEnabled: boolean;
  showGrid: boolean;
  showDimensions: boolean;
  activeSnap: SnapResult | null;
  themeMode: ThemeMode;
  history: {
    past: HistoryItem[];
    future: HistoryItem[];
  };
  currentStyle: ShapeStyleConfig;
  // Parametric State Slice
  variables: Record<string, ParametricVariable>;
  constraints: GeometricConstraint[];
  parametricErrors: string[];
  // Intelligent CAD Kernel Slice
  boundaryMode: BoundaryLimitMode;
  inferredFormulas: InferredFormula[];
  boundaryEvaluations: BoundaryLimitEvaluation[];
}

export type DrawingAction =
  | { type: "SET_TOOL"; tool: ToolId }
  | { type: "START_DRAFT"; shape: Shape }
  | { type: "UPDATE_DRAFT"; shape: Shape }
  | { type: "COMMIT_DRAFT" }
  | { type: "CANCEL_DRAFT" }
  | { type: "SELECT"; id: ID | null; isMultiSelect?: boolean }
  | { type: "SELECT_MULTIPLE"; ids: ID[] }
  | { type: "GROUP_SELECTED" }
  | { type: "UNGROUP_SELECTED" }
  | { type: "MOVE_SELECTED"; dx: number; dy: number }
  | { type: "RESIZE_SHAPES"; updatedShapes: Shape[] }
  | { type: "ROTATE_SHAPES"; updatedShapes: Shape[] }
  | { type: "ROTATE_SELECTED_BY_ANGLE"; deltaDeg: number }
  | { type: "RECORD_PRE_MOVE_SNAPSHOT"; shapes: Shape[]; description?: string }
  | { type: "COMMIT_MOVE" }
  | { type: "UPDATE_SHAPE"; id: ID; updates: Partial<Shape> }
  | { type: "TOGGLE_SHAPE_LOCK"; id: ID }
  | { type: "TOGGLE_SHAPE_VISIBILITY"; id: ID }
  | { type: "DELETE_SELECTED" }
  | { type: "DELETE_SHAPE_BY_ID"; id: ID }
  | { type: "BRING_TO_FRONT"; id: ID }
  | { type: "SEND_TO_BACK"; id: ID }
  | { type: "DUPLICATE_SELECTED" }
  | { type: "CLEAR_ALL" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "JUMP_TO_HISTORY_INDEX"; index: number }
  | { type: "SET_VIEWPORT"; viewport: Viewport }
  | { type: "RESET_VIEWPORT" }
  | { type: "TOGGLE_GRID" }
  | { type: "TOGGLE_GRID_SNAP" }
  | { type: "TOGGLE_OBJECT_SNAP" }
  | { type: "TOGGLE_DIMENSIONS" }
  | { type: "SET_THEME_MODE"; mode: ThemeMode }
  | { type: "SET_ACTIVE_SNAP"; snap: SnapResult | null }
  | { type: "SET_CURRENT_STYLE"; style: Partial<ShapeStyleConfig> }
  | { type: "LOAD_SHAPES"; shapes: Shape[] }
  // Parametric Actions
  | { type: "SET_VARIABLE"; name: string; valueOrFormula: number | string; description?: string }
  | { type: "DELETE_VARIABLE"; name: string }
  | { type: "ADD_CONSTRAINT"; constraint: GeometricConstraint }
  | { type: "UPDATE_CONSTRAINT"; id: string; updates: Partial<GeometricConstraint> }
  | { type: "DELETE_CONSTRAINT"; id: string }
  | { type: "TOGGLE_CONSTRAINT"; id: string }
  | { type: "INSTANTIATE_TEMPLATE"; templateId: string; params?: Record<string, number> }
  | { type: "SYNC_PARAMETRIC_MODEL" }
  | {
      type: "ADJUST_GAD_ASSEMBLY";
      target: {
        shapeId?: string;
        assemblyId?: string;
        featureIndex?: number;
        newSpan?: number;
        newHeight?: number;
        newRadius?: number;
        deltaSpan?: number;
        deltaHeight?: number;
        deltaRadius?: number;
      };
    }
  // Intelligent CAD Kernel Actions
  | { type: "SET_BOUNDARY_MODE"; mode: BoundaryLimitMode }
  | { type: "ACCEPT_INFERRED_FORMULA"; id: string }
  | { type: "REJECT_INFERRED_FORMULA"; id: string }
  | { type: "UPDATE_INFERRED_FORMULA"; id: string; expression: string }
  | { type: "REFRESH_INTELLIGENCE" };

export function computeIntelligenceSlice(shapes: Shape[], boundaryMode: BoundaryLimitMode = "warning") {
  const inferredFormulas = synthesizeFormulasFromGeometry(shapes);
  const boundaryEvaluations: BoundaryLimitEvaluation[] = [];

  const assemblies = detectGADAssemblies(shapes);
  for (const asm of assemblies) {
    const outer = shapes.find((s) => s.id === asm.outer.id);
    if (!outer) continue;
    for (const feat of asm.features) {
      const inner = shapes.find((s) => s.id === feat.id);
      if (!inner) continue;
      boundaryEvaluations.push(evaluateBoundaryLimits(inner, outer, boundaryMode, shapes));
    }
  }

  // Also check for shapes inside any polygon/rectangle whose center is within outer boundary
  for (const inner of shapes) {
    if (boundaryEvaluations.some((b) => b.shapeId === inner.id)) continue;
    for (const outer of shapes) {
      if (outer.id === inner.id) continue;
      if (outer.type === "rectangle" || outer.type === "polygon") {
        const outerPoly = getShapeBoundaryPolygon(outer, shapes);
        if (!outerPoly) continue;
        const outerMinX = Math.min(...outerPoly.map((p) => p.x));
        const outerMaxX = Math.max(...outerPoly.map((p) => p.x));
        const outerMinY = Math.min(...outerPoly.map((p) => p.y));
        const outerMaxY = Math.max(...outerPoly.map((p) => p.y));

        const innerCorners = getShapeCorners(inner);
        if (innerCorners.length === 0) continue;
        const innerCenterX = innerCorners.reduce((acc, c) => acc + c.x, 0) / innerCorners.length;
        const innerCenterY = innerCorners.reduce((acc, c) => acc + c.y, 0) / innerCorners.length;

        // Check if inner center is geometrically inside the outer shape's bounding box
        if (
          innerCenterX >= outerMinX &&
          innerCenterX <= outerMaxX &&
          innerCenterY >= outerMinY &&
          innerCenterY <= outerMaxY
        ) {
          const evalRes = evaluateBoundaryLimits(inner, outer, boundaryMode, shapes);
          boundaryEvaluations.push(evalRes);
          break;
        }
      }
    }
  }

  return { inferredFormulas, boundaryEvaluations };
}

export const initialDrawingState: DrawingState = {
  shapes: [],
  tool: "select",
  selectedId: null,
  selectedIds: [],
  draft: null,
  viewport: { x: 0, y: 0, scale: 1 },
  gridSnapEnabled: false,
  objectSnapEnabled: true,
  showGrid: true,
  showDimensions: false,
  activeSnap: null,
  themeMode: "dark",
  history: {
    past: [],
    future: [],
  },
  currentStyle: {
    strokeColor: "#f8fafc",
    strokeWidth: 1.5,
    fillColor: "transparent",
    opacity: 1,
  },
  variables: {},
  constraints: [],
  parametricErrors: [],
  boundaryMode: "warning",
  inferredFormulas: [],
  boundaryEvaluations: [],
};

/**
 * Runs parametric formula evaluation and constraint solving on a shapes array
 */
function runParametricSync(
  shapes: Shape[],
  variables: Record<string, ParametricVariable>,
  constraints: GeometricConstraint[]
): { updatedShapes: Shape[]; updatedVariables: Record<string, ParametricVariable>; errors: string[] } {
  const model = new ParametricModel();
  for (const [name, v] of Object.entries(variables)) {
    model.setVariable(name, v.formula ?? v.value, v.description);
    if (v.unit) {
      const stored = model.variables.get(name);
      if (stored) stored.unit = v.unit;
    }
  }
  model.constraints = constraints;

  const { updatedShapes, errors } = model.syncModel(shapes);

  const updatedVars: Record<string, ParametricVariable> = {};
  for (const [name, v] of model.variables.entries()) {
    updatedVars[name] = { ...v };
  }

  return { updatedShapes, updatedVariables: updatedVars, errors };
}

/**
 * Pushes the current shapes array to history.past with a human-readable description.
 */
function pushHistory(
  state: DrawingState,
  description = "Edit Drawing",
  shapesToSave: Shape[] = state.shapes
): DrawingState["history"] {
  const item: HistoryItem = {
    id: "hist_" + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    description,
    shapes: shapesToSave,
  };
  const newPast = [...state.history.past, item];
  if (newPast.length > MAX_HISTORY_STEPS) {
    newPast.shift();
  }
  return {
    past: newPast,
    future: [],
  };
}

/**
 * Helper to find all shape IDs belonging to the same group as any of the given IDs.
 */
function expandGroupIds(shapes: Shape[], ids: ID[]): ID[] {
  const selectedSet = new Set(ids);
  const groupIds = new Set<string>();

  for (const s of shapes) {
    if (selectedSet.has(s.id) && s.groupId) {
      groupIds.add(s.groupId);
    }
  }

  if (groupIds.size === 0) return ids;

  for (const s of shapes) {
    if (s.groupId && groupIds.has(s.groupId)) {
      selectedSet.add(s.id);
    }
  }

  return Array.from(selectedSet);
}

export function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
  switch (action.type) {
    case "SET_TOOL": {
      return {
        ...state,
        tool: action.tool,
        draft: null,
        activeSnap: null,
        selectedId: action.tool === "select" ? state.selectedId : null,
        selectedIds: action.tool === "select" ? state.selectedIds : [],
      };
    }

    case "START_DRAFT": {
      return {
        ...state,
        draft: action.shape,
      };
    }

    case "UPDATE_DRAFT": {
      return {
        ...state,
        draft: action.shape,
      };
    }

    case "COMMIT_DRAFT": {
      if (!state.draft) return state;

      let isValid = true;
      if (state.draft.type === "line") {
        const len = Math.hypot(state.draft.x2 - state.draft.x1, state.draft.y2 - state.draft.y1);
        if (len < 2) isValid = false;
      } else if (state.draft.type === "rectangle") {
        if (state.draft.width < 2 && state.draft.height < 2) isValid = false;
      } else if (state.draft.type === "circle") {
        if (state.draft.r < 2) isValid = false;
      }

      if (!isValid) {
        return {
          ...state,
          draft: null,
          activeSnap: null,
        };
      }

      const prefix =
        state.draft.type === "line" || state.draft.type === "arrow"
          ? "L"
          : state.draft.type === "rectangle"
          ? "R"
          : state.draft.type === "circle"
          ? "C"
          : "S";

      let defaultName = state.draft.name;
      if (!defaultName) {
        let counter = 1;
        defaultName = `${prefix}${counter}`;
        while (state.shapes.some((s) => s.name === defaultName)) {
          counter++;
          defaultName = `${prefix}${counter}`;
        }
      }

      const committedShape: Shape = { ...state.draft, name: defaultName, isVisible: true };
      const desc = `Draw ${defaultName}`;

      // Register default variable matching the freshly drawn shape's length/dimensions
      const nextVars = { ...state.variables };
      if (committedShape.type === "line" || committedShape.type === "arrow") {
        const len = Math.round(Math.hypot(committedShape.x2 - committedShape.x1, committedShape.y2 - committedShape.y1));
        nextVars[defaultName] = { name: defaultName, value: len, unit: "mm" };
      } else if (committedShape.type === "rectangle") {
        const wVar = `${defaultName}.width`;
        const hVar = `${defaultName}.height`;
        nextVars[wVar] = { name: wVar, value: Math.round(committedShape.width), unit: "mm" };
        nextVars[hVar] = { name: hVar, value: Math.round(committedShape.height), unit: "mm" };
      } else if (committedShape.type === "circle") {
        const rVar = `${defaultName}.r`;
        nextVars[rVar] = { name: rVar, value: Math.round(committedShape.r), unit: "mm" };
      }

      return {
        ...state,
        shapes: [...state.shapes, committedShape],
        variables: nextVars,
        draft: null,
        selectedId: committedShape.id,
        selectedIds: [committedShape.id],
        activeSnap: null,
        history: pushHistory(state, desc),
      };
    }

    case "CANCEL_DRAFT": {
      return {
        ...state,
        draft: null,
        activeSnap: null,
      };
    }

    case "SELECT": {
      if (!action.id) {
        return {
          ...state,
          selectedId: null,
          selectedIds: [],
        };
      }

      if (action.isMultiSelect) {
        const exists = state.selectedIds.includes(action.id);
        const nextIds = exists
          ? state.selectedIds.filter((i) => i !== action.id)
          : [...state.selectedIds, action.id];
        const expanded = expandGroupIds(state.shapes, nextIds);
        return {
          ...state,
          selectedId: expanded[expanded.length - 1] || null,
          selectedIds: expanded,
        };
      }

      // Single select: auto-expand to entire group if shape is in a group
      const expanded = expandGroupIds(state.shapes, [action.id]);
      return {
        ...state,
        selectedId: action.id,
        selectedIds: expanded,
      };
    }

    case "SELECT_MULTIPLE": {
      const expanded = expandGroupIds(state.shapes, action.ids);
      return {
        ...state,
        selectedId: expanded[0] || null,
        selectedIds: expanded,
      };
    }

    case "GROUP_SELECTED": {
      if (state.selectedIds.length < 2) return state;

      const newGroupId = "group_" + Math.random().toString(36).substring(2, 9);
      const groupName = `Group (${state.selectedIds.length} items)`;

      const nextShapes = state.shapes.map((s) => {
        if (state.selectedIds.includes(s.id)) {
          return {
            ...s,
            groupId: newGroupId,
            name: s.name || groupName,
          };
        }
        return s;
      });

      return {
        ...state,
        shapes: nextShapes,
        history: pushHistory(state, `Group ${state.selectedIds.length} Shapes`),
      };
    }

    case "UNGROUP_SELECTED": {
      if (state.selectedIds.length === 0) return state;

      const nextShapes = state.shapes.map((s) => {
        if (state.selectedIds.includes(s.id)) {
          const { groupId, ...rest } = s;
          return rest as Shape;
        }
        return s;
      });

      return {
        ...state,
        shapes: nextShapes,
        history: pushHistory(state, "Ungroup Shapes"),
      };
    }

    case "MOVE_SELECTED": {
      if (state.selectedIds.length === 0) return state;
      const { dx, dy } = action;
      const idSet = new Set(state.selectedIds);

      const nextShapes = state.shapes.map((shape) => {
        if (!idSet.has(shape.id) || shape.isLocked) return shape;
        switch (shape.type) {
          case "line":
          case "arrow":
            return {
              ...shape,
              x1: shape.x1 + dx,
              y1: shape.y1 + dy,
              x2: shape.x2 + dx,
              y2: shape.y2 + dy,
            };
          case "rectangle":
            return {
              ...shape,
              x: shape.x + dx,
              y: shape.y + dy,
            };
          case "circle":
          case "ellipse":
          case "polygon":
          case "star":
            return {
              ...shape,
              cx: shape.cx + dx,
              cy: shape.cy + dy,
            };
        }
      });

      return {
        ...state,
        shapes: nextShapes,
      };
    }

    case "RESIZE_SHAPES":
    case "ROTATE_SHAPES": {
      const updatedMap = new Map(action.updatedShapes.map((s) => [s.id, s]));
      const nextShapes = state.shapes.map((s) => updatedMap.get(s.id) || s);

      return {
        ...state,
        shapes: nextShapes,
      };
    }

    case "ROTATE_SELECTED_BY_ANGLE": {
      if (state.selectedIds.length === 0) return state;
      const idSet = new Set(state.selectedIds);
      const selectedShapes = state.shapes.filter((s) => idSet.has(s.id));

      if (selectedShapes.length === 1) {
        const s = selectedShapes[0];
        const nextRot = (((s.rotation || 0) + action.deltaDeg) % 360 + 360) % 360;
        const nextShapes = state.shapes.map((shape) =>
          shape.id === s.id ? { ...shape, rotation: nextRot } : shape
        );
        return {
          ...state,
          shapes: nextShapes,
          history: pushHistory(state, `Rotate Shape by ${action.deltaDeg}°`),
        };
      }

      // Multi-Shape / Group Rotation around collective centroid
      const bounds = computeMultiShapeBounds(selectedShapes);
      const groupCenter = bounds ? { x: bounds.centerX, y: bounds.centerY } : { x: 0, y: 0 };

      const nextShapes = state.shapes.map((s) => {
        if (!idSet.has(s.id)) return s;
        switch (s.type) {
          case "line":
          case "arrow": {
            const p1 = rotatePoint({ x: s.x1, y: s.y1 }, groupCenter, action.deltaDeg);
            const p2 = rotatePoint({ x: s.x2, y: s.y2 }, groupCenter, action.deltaDeg);
            return {
              ...s,
              x1: p1.x,
              y1: p1.y,
              x2: p2.x,
              y2: p2.y,
            };
          }
          case "rectangle": {
            const rectCenter = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
            const newCenter = rotatePoint(rectCenter, groupCenter, action.deltaDeg);
            const nextRot = (((s.rotation || 0) + action.deltaDeg) % 360 + 360) % 360;
            return {
              ...s,
              x: newCenter.x - s.width / 2,
              y: newCenter.y - s.height / 2,
              rotation: nextRot,
            };
          }
          case "circle": {
            const newCenter = rotatePoint({ x: s.cx, y: s.cy }, groupCenter, action.deltaDeg);
            return {
              ...s,
              cx: newCenter.x,
              cy: newCenter.y,
            };
          }
          case "ellipse":
          case "polygon":
          case "star": {
            const newCenter = rotatePoint({ x: s.cx, y: s.cy }, groupCenter, action.deltaDeg);
            const nextRot = (((s.rotation || 0) + action.deltaDeg) % 360 + 360) % 360;
            return {
              ...s,
              cx: newCenter.x,
              cy: newCenter.y,
              rotation: nextRot,
            };
          }
        }
      });

      return {
        ...state,
        shapes: nextShapes,
        history: pushHistory(state, `Rotate Group by ${action.deltaDeg}°`),
      };
    }

    case "RECORD_PRE_MOVE_SNAPSHOT": {
      return {
        ...state,
        history: pushHistory(state, action.description || "Transform Shapes", action.shapes),
      };
    }

    case "COMMIT_MOVE": {
      return {
        ...state,
        activeSnap: null,
      };
    }

    case "UPDATE_SHAPE": {
      const targetIndex = state.shapes.findIndex((s) => s.id === action.id);
      if (targetIndex === -1) return state;

      const currentShape = state.shapes[targetIndex];
      const updatedShape = { ...currentShape, ...action.updates } as Shape;

      // 1. Check if shape belongs to an autonomous GAD assembly
      const roleInfo = isShapeInGADAssembly(state.shapes, action.id);
      if (roleInfo.inAssembly && roleInfo.role === "inner") {
        const rawUpdates = action.updates as any;
        if (
          currentShape.type === "rectangle" &&
          rawUpdates.width !== undefined &&
          rawUpdates.width !== currentShape.width
        ) {
          const res = solveGADAssemblyAdjustment(state.shapes, {
            shapeId: action.id,
            newSpan: rawUpdates.width,
            newHeight:
              rawUpdates.height !== undefined
                ? rawUpdates.height
                : (currentShape as any).height,
          });
          if (res.solved) {
            return {
              ...state,
              shapes: res.updatedShapes,
              history: pushHistory(state, res.description),
            };
          }
        } else if (
          currentShape.type === "circle" &&
          rawUpdates.r !== undefined &&
          rawUpdates.r !== currentShape.r
        ) {
          const res = solveGADAssemblyAdjustment(state.shapes, {
            shapeId: action.id,
            newRadius: rawUpdates.r,
          });
          if (res.solved) {
            return {
              ...state,
              shapes: res.updatedShapes,
              history: pushHistory(state, res.description),
            };
          }
        } else if (
          currentShape.type === "ellipse" &&
          ((rawUpdates.rx !== undefined && rawUpdates.rx !== currentShape.rx) ||
            (rawUpdates.ry !== undefined && rawUpdates.ry !== currentShape.ry))
        ) {
          const res = solveGADAssemblyAdjustment(state.shapes, {
            shapeId: action.id,
            newSpan: (rawUpdates.rx ?? currentShape.rx) * 2,
            newHeight: (rawUpdates.ry ?? currentShape.ry) * 2,
          });
          if (res.solved) {
            return {
              ...state,
              shapes: res.updatedShapes,
              history: pushHistory(state, res.description),
            };
          }
        } else if (
          (currentShape.type === "line" || currentShape.type === "arrow") &&
          (roleInfo.edgeType === "top" || roleInfo.edgeType === "bottom")
        ) {
          const x1 = rawUpdates.x1 ?? (currentShape as any).x1;
          const x2 = rawUpdates.x2 ?? (currentShape as any).x2;
          const y1 = rawUpdates.y1 ?? (currentShape as any).y1;
          const y2 = rawUpdates.y2 ?? (currentShape as any).y2;
          const curLen = Math.hypot(
            (currentShape as any).x2 - (currentShape as any).x1,
            (currentShape as any).y2 - (currentShape as any).y1
          );
          const nextLen = Math.hypot(x2 - x1, y2 - y1);
          if (Math.abs(nextLen - curLen) > 0.5) {
            const res = solveGADAssemblyAdjustment(state.shapes, {
              shapeId: action.id,
              deltaSpan: nextLen - curLen,
            });
            if (res.solved) {
              return {
                ...state,
                shapes: res.updatedShapes,
                history: pushHistory(state, res.description),
              };
            }
          }
        }
      }

      const nextShapes = [...state.shapes];
      nextShapes[targetIndex] = updatedShape;
      const slice = computeIntelligenceSlice(nextShapes, state.boundaryMode);

      return {
        ...state,
        shapes: nextShapes,
        inferredFormulas: slice.inferredFormulas,
        boundaryEvaluations: slice.boundaryEvaluations,
        history: pushHistory(state, `Update ${currentShape.type}`),
      };
    }

    case "ADJUST_GAD_ASSEMBLY": {
      const res = solveGADAssemblyAdjustment(state.shapes, action.target);
      if (res.solved) {
        const slice = computeIntelligenceSlice(res.updatedShapes, state.boundaryMode);
        return {
          ...state,
          shapes: res.updatedShapes,
          inferredFormulas: slice.inferredFormulas,
          boundaryEvaluations: slice.boundaryEvaluations,
          history: pushHistory(state, res.description),
        };
      }
      return state;
    }

    case "TOGGLE_SHAPE_LOCK": {
      const nextShapes = state.shapes.map((s) =>
        s.id === action.id ? { ...s, isLocked: !s.isLocked } : s
      );
      return {
        ...state,
        shapes: nextShapes,
      };
    }

    case "TOGGLE_SHAPE_VISIBILITY": {
      const nextShapes = state.shapes.map((s) =>
        s.id === action.id ? { ...s, isVisible: s.isVisible === false ? true : false } : s
      );
      return {
        ...state,
        shapes: nextShapes,
      };
    }

    case "DELETE_SELECTED": {
      if (state.selectedIds.length === 0) return state;
      const delSet = new Set(state.selectedIds);
      const nextShapes = state.shapes.filter((s) => !delSet.has(s.id));
      const count = state.selectedIds.length;

      // Clean up variables belonging to deleted shapes
      const nextVars = { ...state.variables };
      for (const s of state.shapes) {
        if (delSet.has(s.id) && s.name && nextVars[s.name] && !nextVars[s.name].formula) {
          delete nextVars[s.name];
          delete nextVars[`${s.name}.length`];
          delete nextVars[`${s.name}.width`];
          delete nextVars[`${s.name}.height`];
          delete nextVars[`${s.name}.r`];
        }
      }

      return {
        ...state,
        shapes: nextShapes,
        variables: nextVars,
        selectedId: null,
        selectedIds: [],
        history: pushHistory(state, `Delete ${count > 1 ? `${count} Shapes` : "Shape"}`),
      };
    }

    case "DELETE_SHAPE_BY_ID": {
      const deletedShape = state.shapes.find((s) => s.id === action.id);
      const nextShapes = state.shapes.filter((s) => s.id !== action.id);
      const nextVars = { ...state.variables };
      if (deletedShape?.name && nextVars[deletedShape.name] && !nextVars[deletedShape.name].formula) {
        delete nextVars[deletedShape.name];
        delete nextVars[`${deletedShape.name}.length`];
        delete nextVars[`${deletedShape.name}.width`];
        delete nextVars[`${deletedShape.name}.height`];
        delete nextVars[`${deletedShape.name}.r`];
      }

      return {
        ...state,
        shapes: nextShapes,
        variables: nextVars,
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        selectedIds: state.selectedIds.filter((i) => i !== action.id),
        history: pushHistory(state, "Delete Shape"),
      };
    }

    case "BRING_TO_FRONT": {
      const shape = state.shapes.find((s) => s.id === action.id);
      if (!shape) return state;
      const others = state.shapes.filter((s) => s.id !== action.id);
      return {
        ...state,
        shapes: [...others, shape],
        history: pushHistory(state, "Bring to Front"),
      };
    }

    case "SEND_TO_BACK": {
      const shape = state.shapes.find((s) => s.id === action.id);
      if (!shape) return state;
      const others = state.shapes.filter((s) => s.id !== action.id);
      return {
        ...state,
        shapes: [shape, ...others],
        history: pushHistory(state, "Send to Back"),
      };
    }

    case "DUPLICATE_SELECTED": {
      if (state.selectedIds.length === 0) return state;
      const selShapes = state.shapes.filter((s) => state.selectedIds.includes(s.id));
      const newDuplicates: Shape[] = selShapes.map((s) => {
        const newId = "shape_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
        switch (s.type) {
          case "line":
          case "arrow":
            return { ...s, id: newId, x1: s.x1 + 20, y1: s.y1 + 20, x2: s.x2 + 20, y2: s.y2 + 20 };
          case "rectangle":
            return { ...s, id: newId, x: s.x + 20, y: s.y + 20 };
          case "circle":
          case "ellipse":
          case "polygon":
          case "star":
            return { ...s, id: newId, cx: s.cx + 20, cy: s.cy + 20 };
        }
      });

      return {
        ...state,
        shapes: [...state.shapes, ...newDuplicates],
        selectedId: newDuplicates[0].id,
        selectedIds: newDuplicates.map((d) => d.id),
        history: pushHistory(state, `Duplicate ${newDuplicates.length} Shapes`),
      };
    }

    case "CLEAR_ALL": {
      if (state.shapes.length === 0) return state;
      return {
        ...state,
        shapes: [],
        variables: {},
        selectedId: null,
        selectedIds: [],
        draft: null,
        history: pushHistory(state, "Clear Canvas"),
      };
    }

    case "UNDO": {
      const previous = state.history.past[state.history.past.length - 1];
      if (!previous) return state;

      const currentSnapshot: HistoryItem = {
        id: "hist_" + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        description: "Current State",
        shapes: state.shapes,
      };

      const newPast = state.history.past.slice(0, -1);
      const newFuture = [currentSnapshot, ...state.history.future];

      const nextSelectedId = previous.shapes.some((s) => s.id === state.selectedId) ? state.selectedId : null;

      return {
        ...state,
        shapes: previous.shapes,
        selectedId: nextSelectedId,
        selectedIds: state.selectedIds.filter((id) => previous.shapes.some((s) => s.id === id)),
        draft: null,
        history: {
          past: newPast,
          future: newFuture,
        },
      };
    }

    case "REDO": {
      const next = state.history.future[0];
      if (!next) return state;

      const currentSnapshot: HistoryItem = {
        id: "hist_" + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        description: "Undo State",
        shapes: state.shapes,
      };

      const newFuture = state.history.future.slice(1);
      const newPast = [...state.history.past, currentSnapshot];

      const nextSelectedId = next.shapes.some((s) => s.id === state.selectedId) ? state.selectedId : null;

      return {
        ...state,
        shapes: next.shapes,
        selectedId: nextSelectedId,
        selectedIds: state.selectedIds.filter((id) => next.shapes.some((s) => s.id === id)),
        draft: null,
        history: {
          past: newPast,
          future: newFuture,
        },
      };
    }

    case "JUMP_TO_HISTORY_INDEX": {
      const target = state.history.past[action.index];
      if (!target) return state;

      return {
        ...state,
        shapes: target.shapes,
        selectedId: null,
        selectedIds: [],
        draft: null,
      };
    }

    case "SET_VIEWPORT": {
      return {
        ...state,
        viewport: action.viewport,
      };
    }

    case "RESET_VIEWPORT": {
      return {
        ...state,
        viewport: { x: 0, y: 0, scale: 1 },
      };
    }

    case "TOGGLE_GRID": {
      return {
        ...state,
        showGrid: !state.showGrid,
      };
    }

    case "TOGGLE_GRID_SNAP": {
      return {
        ...state,
        gridSnapEnabled: !state.gridSnapEnabled,
      };
    }

    case "TOGGLE_OBJECT_SNAP": {
      return {
        ...state,
        objectSnapEnabled: !state.objectSnapEnabled,
      };
    }

    case "TOGGLE_DIMENSIONS": {
      return {
        ...state,
        showDimensions: !state.showDimensions,
      };
    }

    case "SET_THEME_MODE": {
      const nextMode = action.mode;
      const isSwitchingToLight = nextMode === "light";
      const oldDefaultColor = isSwitchingToLight ? "#f8fafc" : "#0f172a";
      const newDefaultColor = isSwitchingToLight ? "#0f172a" : "#f8fafc";

      const nextCurrentStyle = {
        ...state.currentStyle,
        strokeColor:
          state.currentStyle.strokeColor === oldDefaultColor ||
          state.currentStyle.strokeColor === "#0066ff"
            ? newDefaultColor
            : state.currentStyle.strokeColor,
      };

      const nextShapes = state.shapes.map((s) => {
        if (!s.strokeColor || s.strokeColor === oldDefaultColor || s.strokeColor === "#0066ff") {
          return {
            ...s,
            strokeColor: newDefaultColor,
          };
        }
        return s;
      });

      return {
        ...state,
        themeMode: nextMode,
        shapes: nextShapes,
        currentStyle: nextCurrentStyle,
      };
    }

    case "SET_ACTIVE_SNAP": {
      return {
        ...state,
        activeSnap: action.snap,
      };
    }

    case "SET_CURRENT_STYLE": {
      return {
        ...state,
        currentStyle: {
          ...state.currentStyle,
          ...action.style,
        },
      };
    }

    case "LOAD_SHAPES": {
      const nextVars = { ...state.variables };
      for (const s of action.shapes) {
        if (s.name) {
          if (s.type === "line" || s.type === "arrow") {
            const len = Math.round(Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
            nextVars[s.name] = { name: s.name, value: len, unit: "mm" };
          }
        }
      }
      const slice = computeIntelligenceSlice(action.shapes, state.boundaryMode);
      return {
        ...state,
        shapes: action.shapes,
        variables: nextVars,
        selectedId: null,
        selectedIds: [],
        draft: null,
        inferredFormulas: slice.inferredFormulas,
        boundaryEvaluations: slice.boundaryEvaluations,
        history: pushHistory(state, `Import ${action.shapes.length} Shapes`),
      };
    }

    case "SET_VARIABLE": {
      let val = 0;
      let formulaStr: string | undefined = undefined;

      if (typeof action.valueOrFormula === "number") {
        val = action.valueOrFormula;
      } else if (typeof action.valueOrFormula === "string") {
        const trimmed = action.valueOrFormula.trim();
        const parsedNum = Number(trimmed);
        if (!isNaN(parsedNum) && trimmed !== "") {
          val = parsedNum;
          formulaStr = undefined; // Numeric constant
        } else {
          formulaStr = trimmed; // Mathematical formula expression
          val = state.variables[action.name]?.value ?? 0;
        }
      }

      const OCTAGON_TWIN_PAIRS: Record<string, string> = {
        edge_top: "top_edge_length",
        top_edge_length: "edge_top",
        edge_tr: "tr_chamfer_length",
        tr_chamfer_length: "edge_tr",
        edge_right: "right_edge_length",
        right_edge_length: "edge_right",
        edge_br: "br_chamfer_length",
        br_chamfer_length: "edge_br",
        edge_bottom: "bottom_edge_length",
        bottom_edge_length: "edge_bottom",
        edge_bl: "bl_chamfer_length",
        bl_chamfer_length: "edge_bl",
        edge_left: "left_edge_length",
        left_edge_length: "edge_left",
        edge_tl: "tl_chamfer_length",
        tl_chamfer_length: "edge_tl",
      };

      const twin = OCTAGON_TWIN_PAIRS[action.name];
      const nextVars = {
        ...state.variables,
        [action.name]: {
          name: action.name,
          value: val,
          formula: formulaStr,
          description: action.description ?? state.variables[action.name]?.description,
          unit: state.variables[action.name]?.unit,
        },
      };

      if (twin && state.variables[twin]) {
        nextVars[twin] = {
          ...state.variables[twin],
          value: val,
          formula: formulaStr,
        };
      }
      const { updatedShapes, updatedVariables, errors } = runParametricSync(
        state.shapes,
        nextVars,
        state.constraints
      );
      return {
        ...state,
        variables: updatedVariables,
        shapes: updatedShapes,
        parametricErrors: errors,
        history: pushHistory(state, `Set Variable ${action.name}`),
      };
    }

    case "DELETE_VARIABLE": {
      const nextVars = { ...state.variables };
      delete nextVars[action.name];
      const { updatedShapes, updatedVariables, errors } = runParametricSync(
        state.shapes,
        nextVars,
        state.constraints
      );
      return {
        ...state,
        variables: updatedVariables,
        shapes: updatedShapes,
        parametricErrors: errors,
        history: pushHistory(state, `Delete Variable ${action.name}`),
      };
    }

    case "ADD_CONSTRAINT": {
      const nextConstraints = [...state.constraints, action.constraint];
      const { updatedShapes, updatedVariables, errors } = runParametricSync(
        state.shapes,
        state.variables,
        nextConstraints
      );
      return {
        ...state,
        constraints: nextConstraints,
        shapes: updatedShapes,
        variables: updatedVariables,
        parametricErrors: errors,
        history: pushHistory(state, `Add Constraint ${action.constraint.type}`),
      };
    }

    case "UPDATE_CONSTRAINT": {
      const nextConstraints = state.constraints.map((c) =>
        c.id === action.id ? { ...c, ...action.updates } : c
      );
      const { updatedShapes, updatedVariables, errors } = runParametricSync(
        state.shapes,
        state.variables,
        nextConstraints
      );
      return {
        ...state,
        constraints: nextConstraints,
        shapes: updatedShapes,
        variables: updatedVariables,
        parametricErrors: errors,
        history: pushHistory(state, `Update Constraint`),
      };
    }

    case "DELETE_CONSTRAINT": {
      const nextConstraints = state.constraints.filter((c) => c.id !== action.id);
      return {
        ...state,
        constraints: nextConstraints,
        history: pushHistory(state, `Delete Constraint`),
      };
    }

    case "TOGGLE_CONSTRAINT": {
      const nextConstraints = state.constraints.map((c) =>
        c.id === action.id ? { ...c, enabled: !c.enabled } : c
      );
      const { updatedShapes, updatedVariables, errors } = runParametricSync(
        state.shapes,
        state.variables,
        nextConstraints
      );
      return {
        ...state,
        constraints: nextConstraints,
        shapes: updatedShapes,
        variables: updatedVariables,
        parametricErrors: errors,
        history: pushHistory(state, `Toggle Constraint`),
      };
    }

    case "INSTANTIATE_TEMPLATE": {
      const template = BUILTIN_TEMPLATES.find((t) => t.id === action.templateId);
      if (!template) return state;

      const defaultParams: Record<string, number> = {};
      template.parameters.forEach((p) => {
        defaultParams[p.name] = p.defaultValue;
      });
      const finalParams = { ...defaultParams, ...(action.params || {}) };

      const instance = template.generator(finalParams);
      const incomingIds = new Set(instance.shapes.map((s) => s.id));
      const isCulvert = action.templateId.includes("culvert");
      const culvertPrefixes = ["culvert_", "two_span_", "b1_", "b2_"];

      const filteredShapes = state.shapes.filter((s) => {
        if (incomingIds.has(s.id)) return false;
        if (isCulvert && culvertPrefixes.some((prefix) => s.id.startsWith(prefix))) {
          return false;
        }
        return true;
      });

      const nextShapes = [...filteredShapes, ...instance.shapes];
      const nextVars = { ...state.variables, ...instance.variables };
      const nextConstraints = [...state.constraints, ...instance.constraints];

      const { updatedShapes, updatedVariables, errors } = runParametricSync(
        nextShapes,
        nextVars,
        nextConstraints
      );

      const slice = computeIntelligenceSlice(updatedShapes, state.boundaryMode);

      return {
        ...state,
        shapes: updatedShapes,
        variables: updatedVariables,
        constraints: nextConstraints,
        parametricErrors: errors,
        selectedIds: [],
        selectedId: null,
        inferredFormulas: slice.inferredFormulas,
        boundaryEvaluations: slice.boundaryEvaluations,
        history: pushHistory(state, `Instantiate Template: ${template.name}`),
      };
    }

    case "SYNC_PARAMETRIC_MODEL": {
      const { updatedShapes, updatedVariables, errors } = runParametricSync(
        state.shapes,
        state.variables,
        state.constraints
      );
      const slice = computeIntelligenceSlice(updatedShapes, state.boundaryMode);
      return {
        ...state,
        shapes: updatedShapes,
        variables: updatedVariables,
        parametricErrors: errors,
        inferredFormulas: slice.inferredFormulas,
        boundaryEvaluations: slice.boundaryEvaluations,
      };
    }

    case "SET_BOUNDARY_MODE": {
      const slice = computeIntelligenceSlice(state.shapes, action.mode);
      return {
        ...state,
        boundaryMode: action.mode,
        inferredFormulas: slice.inferredFormulas,
        boundaryEvaluations: slice.boundaryEvaluations,
      };
    }

    case "ACCEPT_INFERRED_FORMULA": {
      const formula = state.inferredFormulas.find((f) => f.id === action.id);
      if (!formula) return state;

      const nextFormulas = state.inferredFormulas.map((f) =>
        f.id === action.id ? { ...f, status: "accepted" as const } : f
      );

      const nextVars = { ...state.variables };
      nextVars[formula.targetProperty] = {
        name: formula.targetProperty,
        value: formula.evaluatedValue,
        formula: formula.expression,
        description: `Automatically derived: ${formula.reason}`,
      };

      for (const v of formula.variables) {
        if (!nextVars[v.name]) {
          nextVars[v.name] = {
            name: v.name,
            value: v.value,
            description: v.role,
          };
        }
      }

      return {
        ...state,
        inferredFormulas: nextFormulas,
        variables: nextVars,
        history: pushHistory(state, `Accept Derived Formula: ${formula.displayTarget}`),
      };
    }

    case "REJECT_INFERRED_FORMULA": {
      const nextFormulas = state.inferredFormulas.map((f) =>
        f.id === action.id ? { ...f, status: "rejected" as const } : f
      );
      return {
        ...state,
        inferredFormulas: nextFormulas,
      };
    }

    case "UPDATE_INFERRED_FORMULA": {
      const nextFormulas = state.inferredFormulas.map((f) =>
        f.id === action.id
          ? { ...f, expression: action.expression, provenance: "user" as const, status: "accepted" as const }
          : f
      );
      return {
        ...state,
        inferredFormulas: nextFormulas,
        history: pushHistory(state, `Edit Derived Formula`),
      };
    }

    case "REFRESH_INTELLIGENCE": {
      const slice = computeIntelligenceSlice(state.shapes, state.boundaryMode);
      return {
        ...state,
        inferredFormulas: slice.inferredFormulas,
        boundaryEvaluations: slice.boundaryEvaluations,
      };
    }

    default:
      return state;
  }
}
