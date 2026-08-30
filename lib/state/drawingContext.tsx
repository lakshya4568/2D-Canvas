"use client";

import React, { createContext, useContext, useReducer, ReactNode } from "react";
import {
  DrawingState,
  DrawingAction,
  drawingReducer,
  initialDrawingState,
} from "./drawingReducer";
import { Shape, ToolId, Viewport, SnapResult, ID } from "../geometry/types";

interface DrawingContextType {
  state: DrawingState;
  dispatch: React.Dispatch<DrawingAction>;
  // Helper methods
  setTool: (tool: ToolId) => void;
  selectShape: (id: ID | null) => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;
  toggleGrid: () => void;
  toggleGridSnap: () => void;
  toggleObjectSnap: () => void;
  toggleDimensions: () => void;
  clearAll: () => void;
  selectedShape: Shape | null;
}

const DrawingContext = createContext<DrawingContextType | null>(null);

export function DrawingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(drawingReducer, initialDrawingState);

  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;
  const selectedShape = state.shapes.find((s) => s.id === state.selectedId) || null;

  const value: DrawingContextType = {
    state,
    dispatch,
    setTool: (tool: ToolId) => dispatch({ type: "SET_TOOL", tool }),
    selectShape: (id: ID | null) => dispatch({ type: "SELECT", id }),
    deleteSelected: () => dispatch({ type: "DELETE_SELECTED" }),
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
    canUndo,
    canRedo,
    setViewport: (viewport: Viewport) => dispatch({ type: "SET_VIEWPORT", viewport }),
    resetViewport: () => dispatch({ type: "RESET_VIEWPORT" }),
    toggleGrid: () => dispatch({ type: "TOGGLE_GRID" }),
    toggleGridSnap: () => dispatch({ type: "TOGGLE_GRID_SNAP" }),
    toggleObjectSnap: () => dispatch({ type: "TOGGLE_OBJECT_SNAP" }),
    toggleDimensions: () => dispatch({ type: "TOGGLE_DIMENSIONS" }),
    clearAll: () => dispatch({ type: "CLEAR_ALL" }),
    selectedShape,
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
