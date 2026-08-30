"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape, Point, ToolId } from "@/lib/geometry/types";
import { rectFromDrag, circleFromDrag } from "@/lib/geometry/metrics";
import { hitTestShapes } from "@/lib/geometry/hitTest";
import { zoomAtPoint, screenToWorldPoint } from "@/lib/geometry/transform";
import { applySnapping } from "@/lib/geometry/snapping";
import { GridLayer } from "./GridLayer";
import { ShapeRenderer } from "./ShapeRenderer";
import { DraftPreview } from "./DraftPreview";
import { SelectionOverlay } from "./SelectionOverlay";
import { SnapIndicator } from "./SnapIndicator";

interface DrawingCanvasProps {
  onCursorChange?: (pos: Point | null) => void;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onCursorChange }) => {
  const {
    state,
    dispatch,
    setTool,
    selectShape,
    deleteSelected,
    selectedShape,
  } = useDrawing();

  const svgRef = useRef<SVGSVGElement>(null);

  // Interaction tracking refs to avoid stale closures in listeners
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isMovingRef = useRef(false);
  const isSpacePressedRef = useRef(false);
  const startWorldPointRef = useRef<Point>({ x: 0, y: 0 });
  const lastScreenPosRef = useRef<Point>({ x: 0, y: 0 });
  const preMoveShapesRef = useRef<Shape[] | null>(null);

  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isPanActive, setIsPanActive] = useState(false);

  /**
   * Translates screen client coordinates (clientX, clientY) to canvas world space.
   */
  const getWorldPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const screenPt: Point = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
      return screenToWorldPoint(screenPt, state.viewport);
    },
    [state.viewport]
  );

  /**
   * Pointer Down handler
   */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Middle click (button 1) or Space held or Pan tool triggers panning
      if (e.button === 1 || isSpacePressedRef.current || state.tool === "pan") {
        isPanningRef.current = true;
        setIsPanActive(true);
        lastScreenPosRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        return;
      }

      // Only respond to left clicks for drawing and selection
      if (e.button !== 0) return;

      const rawWorldPt = getWorldPoint(e.clientX, e.clientY);

      if (state.tool === "select") {
        // Hit test to see if user clicked directly on any shape
        const hitShape = hitTestShapes(state.shapes, rawWorldPt, 8 / state.viewport.scale);

        if (hitShape) {
          selectShape(hitShape.id);
          isMovingRef.current = true;
          preMoveShapesRef.current = state.shapes;
          dispatch({ type: "RECORD_PRE_MOVE_SNAPSHOT", shapes: state.shapes });
          lastScreenPosRef.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } else {
          // Clicked empty canvas -> deselect
          selectShape(null);
        }
        return;
      }

      // Drawing Tool (Line, Rectangle, Circle)
      const snapResult = applySnapping(rawWorldPt, {
        gridSnapEnabled: state.gridSnapEnabled,
        objectSnapEnabled: state.objectSnapEnabled,
        shapes: state.shapes,
        zoomScale: state.viewport.scale,
      });

      const startPt = snapResult.point;
      startWorldPointRef.current = startPt;
      isDrawingRef.current = true;

      const newId = "shape_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();

      let draftShape: Shape;
      switch (state.tool) {
        case "line":
          draftShape = {
            id: newId,
            type: "line",
            x1: startPt.x,
            y1: startPt.y,
            x2: startPt.x,
            y2: startPt.y,
            strokeColor: state.currentStyle.strokeColor,
            strokeWidth: state.currentStyle.strokeWidth,
            opacity: state.currentStyle.opacity,
          };
          break;
        case "rectangle":
          draftShape = {
            id: newId,
            type: "rectangle",
            x: startPt.x,
            y: startPt.y,
            width: 0,
            height: 0,
            strokeColor: state.currentStyle.strokeColor,
            strokeWidth: state.currentStyle.strokeWidth,
            fillColor: state.currentStyle.fillColor,
            opacity: state.currentStyle.opacity,
          };
          break;
        case "circle":
          draftShape = {
            id: newId,
            type: "circle",
            cx: startPt.x,
            cy: startPt.y,
            r: 0,
            strokeColor: state.currentStyle.strokeColor,
            strokeWidth: state.currentStyle.strokeWidth,
            fillColor: state.currentStyle.fillColor,
            opacity: state.currentStyle.opacity,
          };
          break;
      }

      dispatch({ type: "START_DRAFT", shape: draftShape });
      if (snapResult.snapped) {
        dispatch({ type: "SET_ACTIVE_SNAP", snap: snapResult });
      }
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [state.tool, state.shapes, state.viewport, state.gridSnapEnabled, state.objectSnapEnabled, state.currentStyle, getWorldPoint, selectShape, dispatch]
  );

  /**
   * Pointer Move handler
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rawWorldPt = getWorldPoint(e.clientX, e.clientY);
      onCursorChange?.(rawWorldPt);

      // 1. Handling Viewport Panning
      if (isPanningRef.current) {
        const dx = e.clientX - lastScreenPosRef.current.x;
        const dy = e.clientY - lastScreenPosRef.current.y;
        lastScreenPosRef.current = { x: e.clientX, y: e.clientY };

        dispatch({
          type: "SET_VIEWPORT",
          viewport: {
            ...state.viewport,
            x: state.viewport.x + dx,
            y: state.viewport.y + dy,
          },
        });
        return;
      }

      // 2. Handling Selected Shape Drag / Movement
      if (isMovingRef.current && state.selectedId) {
        const dxScreen = e.clientX - lastScreenPosRef.current.x;
        const dyScreen = e.clientY - lastScreenPosRef.current.y;
        lastScreenPosRef.current = { x: e.clientX, y: e.clientY };

        const dxWorld = dxScreen / state.viewport.scale;
        const dyWorld = dyScreen / state.viewport.scale;

        dispatch({
          type: "MOVE_SELECTED",
          dx: dxWorld,
          dy: dyWorld,
        });
        return;
      }

      // 3. Handling Live Shape Drafting
      if (isDrawingRef.current && state.draft) {
        const snapResult = applySnapping(rawWorldPt, {
          gridSnapEnabled: state.gridSnapEnabled,
          objectSnapEnabled: state.objectSnapEnabled,
          shapes: state.shapes,
          zoomScale: state.viewport.scale,
        });

        const currentPt = snapResult.point;
        const startPt = startWorldPointRef.current;
        let updatedShape: Shape;

        switch (state.draft.type) {
          case "line": {
            updatedShape = {
              ...state.draft,
              x1: startPt.x,
              y1: startPt.y,
              x2: currentPt.x,
              y2: currentPt.y,
            };
            break;
          }
          case "rectangle": {
            const rect = rectFromDrag(startPt, currentPt);
            updatedShape = {
              ...state.draft,
              ...rect,
            };
            break;
          }
          case "circle": {
            const circ = circleFromDrag(startPt, currentPt);
            updatedShape = {
              ...state.draft,
              ...circ,
            };
            break;
          }
        }

        dispatch({ type: "UPDATE_DRAFT", shape: updatedShape });
        dispatch({ type: "SET_ACTIVE_SNAP", snap: snapResult.snapped ? snapResult : null });
        return;
      }

      // 4. Hover state snap preview when idle
      if (state.tool !== "select" && state.tool !== "pan") {
        const snapResult = applySnapping(rawWorldPt, {
          gridSnapEnabled: state.gridSnapEnabled,
          objectSnapEnabled: state.objectSnapEnabled,
          shapes: state.shapes,
          zoomScale: state.viewport.scale,
        });
        if (snapResult.snapped !== !!state.activeSnap?.snapped) {
          dispatch({ type: "SET_ACTIVE_SNAP", snap: snapResult.snapped ? snapResult : null });
        }
      }
    },
    [state.draft, state.selectedId, state.shapes, state.viewport, state.gridSnapEnabled, state.objectSnapEnabled, state.tool, state.activeSnap, getWorldPoint, onCursorChange, dispatch]
  );

  /**
   * Pointer Up handler
   */
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanActive(false);
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {
          // ignore if already released
        }
        return;
      }

      if (isMovingRef.current) {
        isMovingRef.current = false;
        dispatch({ type: "COMMIT_MOVE" });
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        dispatch({ type: "COMMIT_DRAFT" });
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    },
    [dispatch]
  );

  /**
   * Wheel / Zoom handler
   */
  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const screenPt: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      // Zoom factor calculation
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.925;
      const nextViewport = zoomAtPoint(state.viewport, screenPt, zoomFactor, 0.1, 10);
      dispatch({ type: "SET_VIEWPORT", viewport: nextViewport });
    },
    [state.viewport, dispatch]
  );

  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside an input/textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea" || targetTag === "select") {
        return;
      }

      // Space hold for panning
      if (e.code === "Space" && !e.repeat) {
        isSpacePressedRef.current = true;
        setIsSpaceHeld(true);
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: "UNDO" });
      } else if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedId) {
          e.preventDefault();
          deleteSelected();
        }
      }

      // Escape -> Cancel draft or Deselect
      if (e.key === "Escape") {
        if (state.draft) {
          dispatch({ type: "CANCEL_DRAFT" });
        } else if (state.selectedId) {
          selectShape(null);
        }
      }

      // Tool shortcuts: V (select), L (line), R (rectangle), C (circle), H (pan)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === "v") setTool("select");
        if (e.key.toLowerCase() === "l") setTool("line");
        if (e.key.toLowerCase() === "r") setTool("rectangle");
        if (e.key.toLowerCase() === "c") setTool("circle");
        if (e.key.toLowerCase() === "h") setTool("pan");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpacePressedRef.current = false;
        setIsSpaceHeld(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [state.selectedId, state.draft, dispatch, deleteSelected, selectShape, setTool]);

  // Cursor styling
  let cursorStyle = "crosshair";
  if (state.tool === "select") {
    cursorStyle = isMovingRef.current ? "grabbing" : "default";
  } else if (state.tool === "pan" || isSpaceHeld) {
    cursorStyle = isPanActive ? "grabbing" : "grab";
  }

  const { x: panX, y: panY, scale } = state.viewport;

  return (
    <div className="w-full h-full relative overflow-hidden bg-[var(--bg-canvas)] touch-none">
      <svg
        ref={svgRef}
        className="w-full h-full block select-none outline-none"
        tabIndex={0}
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          onCursorChange?.(null);
        }}
        onWheel={handleWheel}
      >
        {/* Transform Group for Pan & Zoom */}
        <g
          id="world-layer"
          transform={`matrix(${scale} 0 0 ${scale} ${panX} ${panY})`}
        >
          {/* 1. Viewport-responsive CAD Grid & Origin axes */}
          <GridLayer viewport={state.viewport} showGrid={state.showGrid} />

          {/* 2. Committed Shapes */}
          <ShapeRenderer
            shapes={state.shapes}
            selectedId={state.selectedId}
            showDimensions={state.showDimensions}
            scale={scale}
            onSelectShape={(id) => {
              if (state.tool === "select") {
                selectShape(id);
              }
            }}
          />

          {/* 3. In-Progress Live Draft Shape with Live Dimensions */}
          <DraftPreview draft={state.draft} scale={scale} />

          {/* 4. Selection Bounding Box, Handles, and Dimensions */}
          <SelectionOverlay
            shape={selectedShape}
            scale={scale}
            onDelete={deleteSelected}
            onBringToFront={() => {
              if (state.selectedId) dispatch({ type: "BRING_TO_FRONT", id: state.selectedId });
            }}
            onSendToBack={() => {
              if (state.selectedId) dispatch({ type: "SEND_TO_BACK", id: state.selectedId });
            }}
          />

          {/* 5. Snap Target Indicator Ring */}
          <SnapIndicator snap={state.activeSnap} scale={scale} />
        </g>
      </svg>
    </div>
  );
};
