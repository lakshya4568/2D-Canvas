"use client";

import React, { createContext, useContext, useReducer, ReactNode } from "react";
import {
  DrawingState,
  DrawingAction,
  drawingReducer,
  initialDrawingState,
  ThemeMode,
} from "./drawingReducer";
import { Shape, ToolId, Viewport, ID } from "../geometry/types";

interface DrawingContextType {
  state: DrawingState;
  dispatch: React.Dispatch<DrawingAction>;
  // Helper methods
  setTool: (tool: ToolId) => void;
  selectShape: (id: ID | null, isMultiSelect?: boolean) => void;
  selectMultiple: (ids: ID[]) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;
  toggleGrid: () => void;
  toggleGridSnap: () => void;
  toggleObjectSnap: () => void;
  toggleOrtho: () => void;
  togglePolarTracking: () => void;
  toggleDynamicInput: () => void;
  toggleDimensions: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  clearAll: () => void;
  selectedShape: Shape | null;
  selectedShapes: Shape[];
  isGroupSelected: boolean;
}

const DrawingContext = createContext<DrawingContextType | null>(null);

export function DrawingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(drawingReducer, initialDrawingState);

  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;

  const selectedShape = state.shapes.find((s) => s.id === state.selectedId) || null;
  const selectedShapes = state.shapes.filter((s) => state.selectedIds.includes(s.id));
  const groupIds = new Set(selectedShapes.map((s) => s.groupId).filter(Boolean));
  const isGroupSelected = selectedShapes.length > 1 && groupIds.size === 1 && selectedShapes.every((s) => !!s.groupId);

  if (typeof window !== "undefined") {
    (window as any).__DRAWING_CONTEXT__ = { state, dispatch };
  }

  const value: DrawingContextType = {
    state,
    dispatch,
    setTool: (tool: ToolId) => dispatch({ type: "SET_TOOL", tool }),
    selectShape: (id: ID | null, isMultiSelect = false) =>
      dispatch({ type: "SELECT", id, isMultiSelect }),
    selectMultiple: (ids: ID[]) => dispatch({ type: "SELECT_MULTIPLE", ids }),
    groupSelected: () => dispatch({ type: "GROUP_SELECTED" }),
    ungroupSelected: () => dispatch({ type: "UNGROUP_SELECTED" }),
    deleteSelected: () => dispatch({ type: "DELETE_SELECTED" }),
    duplicateSelected: () => dispatch({ type: "DUPLICATE_SELECTED" }),
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
    jumpToHistory: (index: number) => dispatch({ type: "JUMP_TO_HISTORY_INDEX", index }),
    canUndo,
    canRedo,
    setViewport: (viewport: Viewport) => dispatch({ type: "SET_VIEWPORT", viewport }),
    resetViewport: () => dispatch({ type: "RESET_VIEWPORT" }),
    toggleGrid: () => dispatch({ type: "TOGGLE_GRID" }),
    toggleGridSnap: () => dispatch({ type: "TOGGLE_GRID_SNAP" }),
    toggleObjectSnap: () => dispatch({ type: "TOGGLE_OBJECT_SNAP" }),
    toggleOrtho: () => dispatch({ type: "TOGGLE_ORTHO" }),
    togglePolarTracking: () => dispatch({ type: "TOGGLE_POLAR_TRACKING" }),
    toggleDynamicInput: () => dispatch({ type: "TOGGLE_DYNAMIC_INPUT" }),
    toggleDimensions: () => dispatch({ type: "TOGGLE_DIMENSIONS" }),
    setThemeMode: (mode: ThemeMode) => dispatch({ type: "SET_THEME_MODE", mode }),
    clearAll: () => dispatch({ type: "CLEAR_ALL" }),
    selectedShape,
    selectedShapes,
    isGroupSelected,
  };

  return <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>;
}

export function useDrawing() {
  const context = useContext(DrawingContext);
  if (!context) {
    throw new Error("useDrawing must be used within a DrawingProvider");
  }
  return context;
}
