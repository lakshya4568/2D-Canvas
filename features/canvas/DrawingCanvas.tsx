"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape, Point } from "@/lib/geometry/types";
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
    groupSelected,
    ungroupSelected,
    deleteSelected,
    duplicateSelected,
    selectedShapes,
  } = useDrawing();

  const svgRef = useRef<SVGSVGElement>(null);

  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isMovingRef = useRef(false);
  const isSpacePressedRef = useRef(false);
  const startWorldPointRef = useRef<Point>({ x: 0, y: 0 });
  const lastScreenPosRef = useRef<Point>({ x: 0, y: 0 });

  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isPanActive, setIsPanActive] = useState(false);

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
   * Pointer Down
   */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button === 1 || isSpacePressedRef.current || state.tool === "pan") {
        isPanningRef.current = true;
        setIsPanActive(true);
        lastScreenPosRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;

      const rawWorldPt = getWorldPoint(e.clientX, e.clientY);

      if (state.tool === "select") {
        const hitShape = hitTestShapes(state.shapes, rawWorldPt, 8 / state.viewport.scale);

        if (hitShape) {
          const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;
          selectShape(hitShape.id, isShiftOrCtrl);
          isMovingRef.current = true;
          dispatch({
            type: "RECORD_PRE_MOVE_SNAPSHOT",
            shapes: state.shapes,
            description: "Move Shapes",
          });
          lastScreenPosRef.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } else {
          // Deselect
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
   * Pointer Move
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rawWorldPt = getWorldPoint(e.clientX, e.clientY);
      onCursorChange?.(rawWorldPt);

      // Panning
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

      // Moving All Selected Shapes (or Group)
      if (isMovingRef.current && state.selectedIds.length > 0) {
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

      // Live Drafting
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

      // Hover Snap Feedback
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
    [state.draft, state.selectedIds, state.shapes, state.viewport, state.gridSnapEnabled, state.objectSnapEnabled, state.tool, state.activeSnap, getWorldPoint, onCursorChange, dispatch]
  );

  /**
   * Pointer Up
   */
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanActive(false);
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (isMovingRef.current) {
        isMovingRef.current = false;
        dispatch({ type: "COMMIT_MOVE" });
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        dispatch({ type: "COMMIT_DRAFT" });
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
      }
    },
    [dispatch]
  );

  /**
   * Mouse Wheel (Cursor-Anchored Zoom)
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

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.925;
      const nextViewport = zoomAtPoint(state.viewport, screenPt, zoomFactor, 0.1, 10);
      dispatch({ type: "SET_VIEWPORT", viewport: nextViewport });
    },
    [state.viewport, dispatch]
  );

  /**
   * Keyboard Shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea" || targetTag === "select") {
        return;
      }

      // Space hold for panning
      if (e.code === "Space" && !e.repeat) {
        isSpacePressedRef.current = true;
        setIsSpaceHeld(true);
      }

      // Group: Ctrl/Cmd + G
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        groupSelected();
        return;
      }

      // Ungroup: Ctrl/Cmd + Shift + G
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        ungroupSelected();
        return;
      }

      // Duplicate: Ctrl/Cmd + D
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
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

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedIds.length > 0) {
          e.preventDefault();
          deleteSelected();
        }
      }

      // Escape
      if (e.key === "Escape") {
        if (state.draft) {
          dispatch({ type: "CANCEL_DRAFT" });
        } else if (state.selectedIds.length > 0) {
          selectShape(null);
        }
      }

      // Tool shortcuts
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
  }, [state.selectedIds, state.draft, dispatch, deleteSelected, duplicateSelected, groupSelected, ungroupSelected, selectShape, setTool]);

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
        <g
          id="world-layer"
          transform={`matrix(${scale} 0 0 ${scale} ${panX} ${panY})`}
        >
          {/* CAD Grid */}
          <GridLayer
            viewport={state.viewport}
            showGrid={state.showGrid}
            themeMode={state.themeMode}
          />

          {/* Committed Shapes */}
          <ShapeRenderer
            shapes={state.shapes}
            selectedIds={state.selectedIds}
            showDimensions={state.showDimensions}
            scale={scale}
            onSelectShape={(id, e) => {
              if (state.tool === "select") {
                const isShift = e.shiftKey || e.ctrlKey || e.metaKey;
                selectShape(id, isShift);
              }
            }}
          />

          {/* In-Progress Live Draft */}
          <DraftPreview draft={state.draft} scale={scale} />

          {/* Multi-Shape & Group Selection Overlay */}
          <SelectionOverlay
            shapes={selectedShapes}
            scale={scale}
            onGroup={groupSelected}
            onUngroup={ungroupSelected}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
          />

          {/* Snap Target Indicator */}
          <SnapIndicator snap={state.activeSnap} scale={scale} />
        </g>
      </svg>
    </div>
  );
};
