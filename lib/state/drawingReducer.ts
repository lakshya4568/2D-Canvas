import { ID, Shape, ToolId, Viewport, SnapResult } from "../geometry/types";

const MAX_HISTORY_STEPS = 100;

export interface ShapeStyleConfig {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  opacity: number;
}

export interface DrawingState {
  shapes: Shape[];
  tool: ToolId;
  selectedId: ID | null;
  draft: Shape | null;
  viewport: Viewport;
  gridSnapEnabled: boolean;
  objectSnapEnabled: boolean;
  showGrid: boolean;
  showDimensions: boolean; // Persistent dimension badges toggle
  activeSnap: SnapResult | null;
  history: {
    past: Shape[][];
    future: Shape[][];
  };
  currentStyle: ShapeStyleConfig;
}

export type DrawingAction =
  | { type: "SET_TOOL"; tool: ToolId }
  | { type: "START_DRAFT"; shape: Shape }
  | { type: "UPDATE_DRAFT"; shape: Shape }
  | { type: "COMMIT_DRAFT" }
  | { type: "CANCEL_DRAFT" }
  | { type: "SELECT"; id: ID | null }
  | { type: "MOVE_SELECTED"; dx: number; dy: number }
  | { type: "RECORD_PRE_MOVE_SNAPSHOT"; shapes: Shape[] }
  | { type: "COMMIT_MOVE" }
  | { type: "UPDATE_SHAPE"; id: ID; updates: Partial<Shape> }
  | { type: "DELETE_SELECTED" }
  | { type: "DELETE_SHAPE_BY_ID"; id: ID }
  | { type: "BRING_TO_FRONT"; id: ID }
  | { type: "SEND_TO_BACK"; id: ID }
  | { type: "CLEAR_ALL" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_VIEWPORT"; viewport: Viewport }
  | { type: "RESET_VIEWPORT" }
  | { type: "TOGGLE_GRID" }
  | { type: "TOGGLE_GRID_SNAP" }
  | { type: "TOGGLE_OBJECT_SNAP" }
  | { type: "TOGGLE_DIMENSIONS" }
  | { type: "SET_ACTIVE_SNAP"; snap: SnapResult | null }
  | { type: "SET_CURRENT_STYLE"; style: Partial<ShapeStyleConfig> }
  | { type: "LOAD_SHAPES"; shapes: Shape[] };

export const initialDrawingState: DrawingState = {
  shapes: [],
  tool: "select",
  selectedId: null,
  draft: null,
  viewport: { x: 0, y: 0, scale: 1 },
  gridSnapEnabled: false,
  objectSnapEnabled: true,
  showGrid: true,
  showDimensions: true,
  activeSnap: null,
  history: {
    past: [],
    future: [],
  },
  currentStyle: {
    strokeColor: "#3b82f6",
    strokeWidth: 2,
    fillColor: "transparent",
    opacity: 1,
  },
};

/**
 * Pushes the current shapes array to history.past and clears history.future.
 */
function pushHistory(state: DrawingState, shapesToSave: Shape[] = state.shapes): DrawingState["history"] {
  const newPast = [...state.history.past, shapesToSave];
  if (newPast.length > MAX_HISTORY_STEPS) {
    newPast.shift();
  }
  return {
    past: newPast,
    future: [],
  };
}

export function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
  switch (action.type) {
    case "SET_TOOL": {
      return {
        ...state,
        tool: action.tool,
        draft: null,
        activeSnap: null,
        // If switching to a drawing tool, we can preserve or deselect
        selectedId: action.tool === "select" ? state.selectedId : null,
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

      // Filter out degenerate/zero-size drafts
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

      const committedShape = { ...state.draft };
      return {
        ...state,
        shapes: [...state.shapes, committedShape],
        draft: null,
        selectedId: committedShape.id,
        activeSnap: null,
        history: pushHistory(state),
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
      return {
        ...state,
        selectedId: action.id,
      };
    }

    case "MOVE_SELECTED": {
      if (!state.selectedId) return state;
      const { dx, dy } = action;
      const nextShapes = state.shapes.map((shape) => {
        if (shape.id !== state.selectedId) return shape;
        switch (shape.type) {
          case "line":
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

    case "RECORD_PRE_MOVE_SNAPSHOT": {
      return {
        ...state,
        history: pushHistory(state, action.shapes),
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

      const nextShapes = [...state.shapes];
      nextShapes[targetIndex] = updatedShape;

      return {
        ...state,
        shapes: nextShapes,
        history: pushHistory(state),
      };
    }

    case "DELETE_SELECTED": {
      if (!state.selectedId) return state;
      const nextShapes = state.shapes.filter((s) => s.id !== state.selectedId);
      return {
        ...state,
        shapes: nextShapes,
        selectedId: null,
        history: pushHistory(state),
      };
    }

    case "DELETE_SHAPE_BY_ID": {
      const nextShapes = state.shapes.filter((s) => s.id !== action.id);
      return {
        ...state,
        shapes: nextShapes,
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        history: pushHistory(state),
      };
    }

    case "BRING_TO_FRONT": {
      const shape = state.shapes.find((s) => s.id === action.id);
      if (!shape) return state;
      const others = state.shapes.filter((s) => s.id !== action.id);
      return {
        ...state,
        shapes: [...others, shape],
        history: pushHistory(state),
      };
    }

    case "SEND_TO_BACK": {
      const shape = state.shapes.find((s) => s.id === action.id);
      if (!shape) return state;
      const others = state.shapes.filter((s) => s.id !== action.id);
      return {
        ...state,
        shapes: [shape, ...others],
        history: pushHistory(state),
      };
    }

    case "CLEAR_ALL": {
      if (state.shapes.length === 0) return state;
      return {
        ...state,
        shapes: [],
        selectedId: null,
        draft: null,
        history: pushHistory(state),
      };
    }

    case "UNDO": {
      const previous = state.history.past[state.history.past.length - 1];
      if (!previous) return state;

      const newPast = state.history.past.slice(0, -1);
      const newFuture = [state.shapes, ...state.history.future];

      // Keep selection if shape still exists in previous state
      const nextSelectedId = previous.some((s) => s.id === state.selectedId) ? state.selectedId : null;

      return {
        ...state,
        shapes: previous,
        selectedId: nextSelectedId,
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

      const newFuture = state.history.future.slice(1);
      const newPast = [...state.history.past, state.shapes];

      const nextSelectedId = next.some((s) => s.id === state.selectedId) ? state.selectedId : null;

      return {
        ...state,
        shapes: next,
        selectedId: nextSelectedId,
        draft: null,
        history: {
          past: newPast,
          future: newFuture,
        },
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
      return {
        ...state,
        shapes: action.shapes,
        selectedId: null,
        draft: null,
        history: pushHistory(state),
      };
    }

    default:
      return state;
  }
}
