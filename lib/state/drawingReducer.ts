import { ID, Shape, ToolId, Viewport, SnapResult } from "../geometry/types";

const MAX_HISTORY_STEPS = 100;

export interface ShapeStyleConfig {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  opacity: number;
  strokeDasharray?: string;
}

export type ThemeMode = "dark" | "light" | "blueprint";

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
  | { type: "LOAD_SHAPES"; shapes: Shape[] };

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
  showDimensions: true,
  activeSnap: null,
  themeMode: "dark",
  history: {
    past: [],
    future: [],
  },
  currentStyle: {
    strokeColor: "#0066ff",
    strokeWidth: 1.5,
    fillColor: "transparent",
    opacity: 1,
  },
};

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

      const committedShape: Shape = { ...state.draft, isVisible: true };
      const desc = `Draw ${committedShape.type.charAt(0).toUpperCase() + committedShape.type.slice(1)}`;

      return {
        ...state,
        shapes: [...state.shapes, committedShape],
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

      // Single select: if shape belongs to a group, select the whole group
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
        history: pushHistory(state, action.description || "Move Shapes", action.shapes),
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
        history: pushHistory(state, `Update ${currentShape.type}`),
      };
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

      return {
        ...state,
        shapes: nextShapes,
        selectedId: null,
        selectedIds: [],
        history: pushHistory(state, `Delete ${count > 1 ? `${count} Shapes` : "Shape"}`),
      };
    }

    case "DELETE_SHAPE_BY_ID": {
      const nextShapes = state.shapes.filter((s) => s.id !== action.id);
      return {
        ...state,
        shapes: nextShapes,
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
            return { ...s, id: newId, x1: s.x1 + 20, y1: s.y1 + 20, x2: s.x2 + 20, y2: s.y2 + 20 };
          case "rectangle":
            return { ...s, id: newId, x: s.x + 20, y: s.y + 20 };
          case "circle":
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
      return {
        ...state,
        themeMode: action.mode,
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
        selectedIds: [],
        draft: null,
        history: pushHistory(state, `Import ${action.shapes.length} Shapes`),
      };
    }

    default:
      return state;
  }
}
