"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape, Point, BoundingBox, SnapResult, CadGrip } from "@/lib/geometry/types";
import {
  rectFromDrag,
  circleFromDrag,
  ellipseFromDrag,
  computeMultiShapeBounds,
  computeShapeBounds,
  rotatePoint,
} from "@/lib/geometry/metrics";
import { hitTestShapes } from "@/lib/geometry/hitTest";
import {
  zoomAtPoint,
  screenToWorldPoint,
  MIN_ZOOM_SCALE,
  MAX_ZOOM_SCALE,
} from "@/lib/geometry/transform";
import { applySnapping, getShapeKeySnapPoints, snapToGrid } from "@/lib/geometry/snapping";
import { solveGADAssemblyAdjustment } from "@/lib/geometry/gadAssemblyEngine";
import { evaluateCadMarqueeSelection } from "@/lib/geometry/cadSelection";
import { applyOrthoProjection, applyPolarTrackingProjection } from "@/lib/geometry/cadTracking";
import { GridLayer } from "./GridLayer";
import { ShapeRenderer } from "./ShapeRenderer";
import { DraftPreview } from "./DraftPreview";
import { SelectionOverlay, HandleType } from "./SelectionOverlay";
import { SnapIndicator } from "./SnapIndicator";
import { ConstraintOverlays } from "./ConstraintOverlays";
import { ParametricDimensionOverlay } from "./ParametricDimensionOverlay";
import { BoundaryLimitsOverlay } from "./BoundaryLimitsOverlay";
import { DynamicInputOverlay } from "./DynamicInputOverlay";
import { CadViewportOverlays } from "./CadViewportOverlays";
import { importDxfToShapes } from "@/lib/io/dxfImporter";

interface DrawingCanvasProps {
  onCursorChange?: (pos: Point | null) => void;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onCursorChange }) => {
  const {
    state,
    dispatch,
    setTool,
    selectShape,
    selectMultiple,
    groupSelected,
    ungroupSelected,
    deleteSelected,
    duplicateSelected,
    selectedShapes,
  } = useDrawing();

  const svgRef = useRef<SVGSVGElement>(null);

  // Interaction refs
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isMovingRef = useRef(false);
  const isResizingRef = useRef(false);
  const isRotatingRef = useRef(false);
  const isMarqueeRef = useRef(false);
  const isSpacePressedRef = useRef(false);

  const startWorldPointRef = useRef<Point>({ x: 0, y: 0 });
  const lastScreenPosRef = useRef<Point>({ x: 0, y: 0 });
  const activeResizeHandleRef = useRef<HandleType | null>(null);
  const activeGripRef = useRef<CadGrip | null>(null);
  const activeResizeCursorRef = useRef<string | null>(null);
  const initialBoundsRef = useRef<BoundingBox | null>(null);
  const initialShapesRef = useRef<Shape[]>([]);

  // Rotation refs
  const rotationCenterRef = useRef<Point>({ x: 0, y: 0 });
  const startAngleRef = useRef<number>(0);
  const initialRotationsRef = useRef<Map<string, number>>(new Map());

  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isPanActive, setIsPanActive] = useState(false);
  const [activeCursor, setActiveCursor] = useState<string | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    isCrossing: boolean;
  } | null>(null);

  // AutoCAD Move Tool States
  const [currentCursorWorld, setCurrentCursorWorld] = useState<Point | null>(null);
  const [moveBasePoint, setMoveBasePoint] = useState<Point | null>(null);
  const [moveDisplacement, setMoveDisplacement] = useState<{ dx: number; dy: number; targetPt: Point } | null>(null);
  const isMoveDraggingRef = useRef(false);
  const hasMovedDuringDragRef = useRef(false);

  const cancelMove = useCallback(() => {
    if (moveBasePoint && initialShapesRef.current.length > 0) {
      dispatch({ type: "RESIZE_SHAPES", updatedShapes: initialShapesRef.current });
    }
    setMoveBasePoint(null);
    setMoveDisplacement(null);
    isMovingRef.current = false;
    isMoveDraggingRef.current = false;
    hasMovedDuringDragRef.current = false;
  }, [moveBasePoint, dispatch]);

  // Cancel move if tool switches away from move
  useEffect(() => {
    if (state.tool !== "move" && moveBasePoint) {
      cancelMove();
    }
  }, [state.tool, moveBasePoint, cancelMove]);

  // Zoom-extents needs the canvas's pixel size, and the reducer must not touch
  // the DOM. Report it on mount and on every resize.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const report = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        dispatch({ type: "SET_CANVAS_SIZE", width: rect.width, height: rect.height });
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dispatch]);

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

  const handleMoveStart = useCallback(
    (pt: Point, e?: React.PointerEvent) => {
      const targetShapes = state.shapes.filter(
        (s) => state.selectedIds.includes(s.id) || (s.groupId && s.groupId === state.shapes.find(x => state.selectedIds.includes(x.id))?.groupId)
      );
      if (targetShapes.length === 0) return;

      const snapResult = applySnapping(pt, {
        gridSnapEnabled: state.gridSnapEnabled,
        objectSnapEnabled: state.objectSnapEnabled,
        shapes: state.shapes,
        zoomScale: state.viewport.scale,
        vertexThresholdPx: 20,
      });

      const basePt = snapResult.point;
      setMoveBasePoint(basePt);
      setMoveDisplacement({ dx: 0, dy: 0, targetPt: basePt });
      startWorldPointRef.current = basePt;
      initialShapesRef.current = JSON.parse(JSON.stringify(targetShapes));
      initialBoundsRef.current = computeMultiShapeBounds(targetShapes);

      isMovingRef.current = true;
      isMoveDraggingRef.current = true;
      hasMovedDuringDragRef.current = false;

      dispatch({
        type: "RECORD_PRE_MOVE_SNAPSHOT",
        shapes: state.shapes,
        description: "Move Shapes",
      });

      if (e && svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId);
      }
    },
    [state.shapes, state.selectedIds, state.gridSnapEnabled, state.objectSnapEnabled, state.viewport, dispatch]
  );

  const handleMoveCommit = useCallback(
    (destPt: Point) => {
      if (!moveBasePoint || initialShapesRef.current.length === 0) return;

      const unselectedShapes = state.shapes.filter((s) => !state.selectedIds.includes(s.id));
      const snapResult = applySnapping(destPt, {
        gridSnapEnabled: state.gridSnapEnabled,
        objectSnapEnabled: state.objectSnapEnabled,
        shapes: unselectedShapes,
        zoomScale: state.viewport.scale,
        startPoint: moveBasePoint,
        vertexThresholdPx: 20,
      });

      const finalPt = snapResult.point;
      const dx = finalPt.x - moveBasePoint.x;
      const dy = finalPt.y - moveBasePoint.y;

      const movedShapes = initialShapesRef.current.map((orig) => {
        switch (orig.type) {
          case "line":
          case "arrow":
            return { ...orig, x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy };
          case "rectangle":
            return { ...orig, x: orig.x + dx, y: orig.y + dy };
          case "circle":
          case "ellipse":
          case "polygon":
          case "star":
            return { ...orig, cx: orig.cx + dx, cy: orig.cy + dy };
        }
      });

      dispatch({ type: "RESIZE_SHAPES", updatedShapes: movedShapes });
      dispatch({ type: "COMMIT_MOVE" });

      setMoveBasePoint(null);
      setMoveDisplacement(null);
      isMovingRef.current = false;
      isMoveDraggingRef.current = false;
      hasMovedDuringDragRef.current = false;
    },
    [moveBasePoint, state.shapes, state.selectedIds, state.gridSnapEnabled, state.objectSnapEnabled, state.viewport, dispatch]
  );

  /**
   * Handle Direct Shape Click in Select Mode or Move Mode
   */
  const handleShapeSelect = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (state.tool === "select") {
        // Select tool ONLY selects object
        const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;
        selectShape(id, isShiftOrCtrl);
        isMovingRef.current = false;
        isMarqueeRef.current = false;
        return;
      }

      if (state.tool === "move") {
        const rawWorldPt = getWorldPoint(e.clientX, e.clientY);
        if (state.selectedIds.length === 0 || !state.selectedIds.includes(id)) {
          // If unselected shape is clicked, select it as the target to move
          selectShape(id, false);
          return;
        }

        // Target shape is already selected:
        if (!moveBasePoint) {
          handleMoveStart(rawWorldPt, e);
        } else {
          handleMoveCommit(rawWorldPt);
        }
      }
    },
    [state.tool, state.selectedIds, selectShape, moveBasePoint, getWorldPoint, handleMoveStart, handleMoveCommit]
  );

  const handleGripPointerDown = useCallback(
    (grip: CadGrip, e: React.PointerEvent) => {
      if (state.tool === "move") {
        const gripPt = { x: grip.x, y: grip.y };
        if (!moveBasePoint) {
          handleMoveStart(gripPt, e);
        } else {
          handleMoveCommit(gripPt);
        }
        return;
      }

      const targetShape = state.shapes.find((s) => s.id === grip.shapeId);
      if (!targetShape) return;

      isResizingRef.current = true;
      isMovingRef.current = false;
      isMarqueeRef.current = false;
      activeGripRef.current = grip;
      setActiveCursor(grip.cursor);
      initialShapesRef.current = JSON.parse(JSON.stringify(state.shapes));
      startWorldPointRef.current = getWorldPoint(e.clientX, e.clientY);

      dispatch({
        type: "RECORD_PRE_MOVE_SNAPSHOT",
        shapes: state.shapes,
        description: `Stretch ${grip.type} grip on ${targetShape.name || targetShape.type}`,
      });

      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId);
      }
    },
    [state.tool, state.shapes, moveBasePoint, getWorldPoint, handleMoveStart, handleMoveCommit, dispatch]
  );

  /**
   * Handle Start of Handle Resize
   */
  const handleResizeStart = useCallback(
    (handle: HandleType, cursor: string, e: React.PointerEvent) => {
      if (selectedShapes.length === 0) return;
      const bounds = computeMultiShapeBounds(selectedShapes);
      if (!bounds) return;

      isResizingRef.current = true;
      isMovingRef.current = false;
      isMarqueeRef.current = false;
      activeResizeHandleRef.current = handle;
      activeResizeCursorRef.current = cursor;
      setActiveCursor(cursor);
      initialBoundsRef.current = bounds;
      initialShapesRef.current = JSON.parse(JSON.stringify(selectedShapes));
      startWorldPointRef.current = getWorldPoint(e.clientX, e.clientY);

      dispatch({
        type: "RECORD_PRE_MOVE_SNAPSHOT",
        shapes: state.shapes,
        description: `Resize ${selectedShapes.length > 1 ? "Group" : selectedShapes[0].type}`,
      });

      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId);
      }
    },
    [selectedShapes, state.shapes, getWorldPoint, dispatch]
  );

  /**
   * Handle Start of Object Rotation
   */
  const handleRotateStart = useCallback(
    (e: React.PointerEvent) => {
      if (selectedShapes.length === 0) return;
      const bounds = computeMultiShapeBounds(selectedShapes);
      if (!bounds) return;

      isRotatingRef.current = true;
      isMovingRef.current = false;
      isMarqueeRef.current = false;
      setActiveCursor("grabbing");
      const center = { x: bounds.centerX, y: bounds.centerY };
      rotationCenterRef.current = center;
      initialShapesRef.current = JSON.parse(JSON.stringify(selectedShapes));

      const clickPt = getWorldPoint(e.clientX, e.clientY);
      startAngleRef.current = Math.atan2(clickPt.y - center.y, clickPt.x - center.x) * (180 / Math.PI);

      const rotMap = new Map<string, number>();
      selectedShapes.forEach((s) => rotMap.set(s.id, s.rotation || 0));
      initialRotationsRef.current = rotMap;

      dispatch({
        type: "RECORD_PRE_MOVE_SNAPSHOT",
        shapes: state.shapes,
        description: `Rotate ${selectedShapes.length > 1 ? "Group" : selectedShapes[0].type}`,
      });

      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId);
      }
    },
    [selectedShapes, state.shapes, getWorldPoint, dispatch]
  );

  /**
   * Pointer Down on Background Canvas
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
          isMovingRef.current = false;
          isMarqueeRef.current = false;
        } else {
          isMarqueeRef.current = true;
          isMovingRef.current = false;
          isResizingRef.current = false;
          isRotatingRef.current = false;
          startWorldPointRef.current = rawWorldPt;
          setMarqueeBox({ x: rawWorldPt.x, y: rawWorldPt.y, width: 0, height: 0, isCrossing: false });
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }
        return;
      }

      if (state.tool === "move") {
        if (state.selectedIds.length === 0) {
          const hitShape = hitTestShapes(state.shapes, rawWorldPt, 8 / state.viewport.scale);
          if (hitShape) {
            selectShape(hitShape.id, false);
          }
          return;
        }

        if (!moveBasePoint) {
          handleMoveStart(rawWorldPt, e);
        } else {
          handleMoveCommit(rawWorldPt);
        }
        return;
      }

      // Drawing Tools (Line, Arrow, Rectangle, Circle, Ellipse, Polygon, Star)
      const snapResult = applySnapping(rawWorldPt, {
        gridSnapEnabled: state.gridSnapEnabled,
        objectSnapEnabled: state.objectSnapEnabled,
        shapes: state.shapes,
        zoomScale: state.viewport.scale,
        vertexThresholdPx: 20,
      });

      const startPt = snapResult.point;
      startWorldPointRef.current = startPt;
      isDrawingRef.current = true;

      const newId = "shape_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
      const defaultStroke = state.currentStyle.strokeColor || "#f8fafc";

      let draftShape: Shape;
      switch (state.tool) {
        case "line":
        case "polyline":
        case "dimension":
          draftShape = {
            id: newId,
            type: "line",
            x1: startPt.x,
            y1: startPt.y,
            x2: startPt.x,
            y2: startPt.y,
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
        case "chamfer":
          draftShape = {
            id: newId,
            type: "line",
            x1: startPt.x,
            y1: startPt.y,
            x2: startPt.x,
            y2: startPt.y,
            strokeColor: "#a855f7",
            strokeWidth: 2,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
        case "construction":
          draftShape = {
            id: newId,
            type: "line",
            x1: startPt.x,
            y1: startPt.y,
            x2: startPt.x,
            y2: startPt.y,
            strokeColor: "#f59e0b",
            strokeWidth: 1,
            strokeDasharray: "4 4",
            opacity: 0.8,
            rotation: 0,
          };
          break;
        case "arrow":
          draftShape = {
            id: newId,
            type: "arrow",
            x1: startPt.x,
            y1: startPt.y,
            x2: startPt.x,
            y2: startPt.y,
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            opacity: state.currentStyle.opacity,
            rotation: 0,
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
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            fillColor: state.currentStyle.fillColor,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
        case "circle":
          draftShape = {
            id: newId,
            type: "circle",
            cx: startPt.x,
            cy: startPt.y,
            r: 0,
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            fillColor: state.currentStyle.fillColor,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
        case "ellipse":
          draftShape = {
            id: newId,
            type: "ellipse",
            cx: startPt.x,
            cy: startPt.y,
            rx: 0,
            ry: 0,
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            fillColor: state.currentStyle.fillColor,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
        case "polygon":
          draftShape = {
            id: newId,
            type: "polygon",
            cx: startPt.x,
            cy: startPt.y,
            r: 0,
            sides: 3,
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            fillColor: state.currentStyle.fillColor,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
        case "star":
          draftShape = {
            id: newId,
            type: "star",
            cx: startPt.x,
            cy: startPt.y,
            innerR: 0,
            outerR: 0,
            points: 5,
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            fillColor: state.currentStyle.fillColor,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
        default:
          draftShape = {
            id: newId,
            type: "line",
            x1: startPt.x,
            y1: startPt.y,
            x2: startPt.x,
            y2: startPt.y,
            strokeColor: defaultStroke,
            strokeWidth: state.currentStyle.strokeWidth,
            opacity: state.currentStyle.opacity,
            rotation: 0,
          };
          break;
      }

      dispatch({ type: "START_DRAFT", shape: draftShape });
      if (snapResult.snapped) {
        dispatch({ type: "SET_ACTIVE_SNAP", snap: snapResult });
      }
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [state.tool, state.shapes, state.selectedIds, state.viewport, state.gridSnapEnabled, state.objectSnapEnabled, state.currentStyle, moveBasePoint, getWorldPoint, selectShape, handleMoveStart, handleMoveCommit, dispatch]
  );

  /**
   * Pointer Move
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rawWorldPt = getWorldPoint(e.clientX, e.clientY);
      onCursorChange?.(rawWorldPt);
      setCurrentCursorWorld(rawWorldPt);

      // 1. Panning
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

      // 2. Interactive Rotation (Individual & Rigid Group Centroid Rotation)
      if (isRotatingRef.current && initialShapesRef.current.length > 0) {
        const center = rotationCenterRef.current;
        const currentAngle = Math.atan2(rawWorldPt.y - center.y, rawWorldPt.x - center.x) * (180 / Math.PI);
        let deltaAngle = currentAngle - startAngleRef.current;

        if (e.shiftKey) {
          deltaAngle = Math.round(deltaAngle / 15) * 15;
        }

        const isMultiOrGroup = initialShapesRef.current.length > 1;

        const rotatedShapes = initialShapesRef.current.map((orig) => {
          if (!isMultiOrGroup) {
            // Single shape rotates around its own center
            const initRot = initialRotationsRef.current.get(orig.id) || 0;
            let nextRot = (initRot + deltaAngle) % 360;
            if (nextRot < 0) nextRot += 360;
            return {
              ...orig,
              rotation: nextRot,
            };
          }

          // Group / Multi-selection: Rotate geometry coordinates around the Group Centroid!
          switch (orig.type) {
            case "line":
            case "arrow": {
              const p1 = rotatePoint({ x: orig.x1, y: orig.y1 }, center, deltaAngle);
              const p2 = rotatePoint({ x: orig.x2, y: orig.y2 }, center, deltaAngle);
              return {
                ...orig,
                x1: p1.x,
                y1: p1.y,
                x2: p2.x,
                y2: p2.y,
              };
            }
            case "rectangle": {
              const rectCenter = { x: orig.x + orig.width / 2, y: orig.y + orig.height / 2 };
              const newCenter = rotatePoint(rectCenter, center, deltaAngle);
              const initRot = initialRotationsRef.current.get(orig.id) || 0;
              let nextRot = (initRot + deltaAngle) % 360;
              if (nextRot < 0) nextRot += 360;
              return {
                ...orig,
                x: newCenter.x - orig.width / 2,
                y: newCenter.y - orig.height / 2,
                rotation: nextRot,
              };
            }
            case "circle": {
              const newCenter = rotatePoint({ x: orig.cx, y: orig.cy }, center, deltaAngle);
              return {
                ...orig,
                cx: newCenter.x,
                cy: newCenter.y,
              };
            }
            case "ellipse":
            case "polygon":
            case "star": {
              const newCenter = rotatePoint({ x: orig.cx, y: orig.cy }, center, deltaAngle);
              const initRot = initialRotationsRef.current.get(orig.id) || 0;
              let nextRot = (initRot + deltaAngle) % 360;
              if (nextRot < 0) nextRot += 360;
              return {
                ...orig,
                cx: newCenter.x,
                cy: newCenter.y,
                rotation: nextRot,
              };
            }
          }
        });

        dispatch({ type: "ROTATE_SHAPES", updatedShapes: rotatedShapes });
        return;
      }

      if (isResizingRef.current && activeGripRef.current) {
        const grip = activeGripRef.current;
        const startPt = startWorldPointRef.current;
        const dx = rawWorldPt.x - startPt.x;
        const dy = rawWorldPt.y - startPt.y;

        const updatedShapes = initialShapesRef.current.map((orig) => {
          if (orig.id !== grip.shapeId) return orig;

          switch (orig.type) {
            case "line":
            case "arrow": {
              if (grip.type === "midpoint") {
                return { ...orig, x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy };
              }
              if (grip.vertexIndex === 0) {
                return { ...orig, x1: orig.x1 + dx, y1: orig.y1 + dy };
              }
              if (grip.vertexIndex === 1) {
                return { ...orig, x2: orig.x2 + dx, y2: orig.y2 + dy };
              }
              return orig;
            }

            case "rectangle": {
              if (grip.type === "center") {
                return { ...orig, x: orig.x + dx, y: orig.y + dy };
              }

              if (grip.type === "vertex") {
                let newX = orig.x;
                let newY = orig.y;
                let newW = orig.width;
                let newH = orig.height;

                if (grip.vertexIndex === 0) {
                  const pinnedX = orig.x + orig.width;
                  const pinnedY = orig.y + orig.height;
                  newX = Math.min(pinnedX - 10, orig.x + dx);
                  newY = Math.min(pinnedY - 10, orig.y + dy);
                  newW = pinnedX - newX;
                  newH = pinnedY - newY;
                } else if (grip.vertexIndex === 1) {
                  const pinnedX = orig.x;
                  const pinnedY = orig.y + orig.height;
                  newY = Math.min(pinnedY - 10, orig.y + dy);
                  newW = Math.max(10, orig.width + dx);
                  newH = pinnedY - newY;
                } else if (grip.vertexIndex === 2) {
                  newW = Math.max(10, orig.width + dx);
                  newH = Math.max(10, orig.height + dy);
                } else if (grip.vertexIndex === 3) {
                  const pinnedX = orig.x + orig.width;
                  newX = Math.min(pinnedX - 10, orig.x + dx);
                  newW = pinnedX - newX;
                  newH = Math.max(10, orig.height + dy);
                }

                return { ...orig, x: newX, y: newY, width: newW, height: newH };
              }

              if (grip.type === "midpoint") {
                if (grip.segmentIndex === 0) {
                  const pinnedY = orig.y + orig.height;
                  const newY = Math.min(pinnedY - 10, orig.y + dy);
                  return { ...orig, y: newY, height: pinnedY - newY };
                }
                if (grip.segmentIndex === 1) {
                  return { ...orig, width: Math.max(10, orig.width + dx) };
                }
                if (grip.segmentIndex === 2) {
                  return { ...orig, height: Math.max(10, orig.height + dy) };
                }
                if (grip.segmentIndex === 3) {
                  const pinnedX = orig.x + orig.width;
                  const newX = Math.min(pinnedX - 10, orig.x + dx);
                  return { ...orig, x: newX, width: pinnedX - newX };
                }
              }

              return orig;
            }

            case "circle": {
              if (grip.type === "center") {
                return { ...orig, cx: orig.cx + dx, cy: orig.cy + dy };
              }
              const newR = Math.max(5, Math.hypot(rawWorldPt.x - orig.cx, rawWorldPt.y - orig.cy));
              return { ...orig, r: newR };
            }

            case "ellipse": {
              if (grip.type === "center") {
                return { ...orig, cx: orig.cx + dx, cy: orig.cy + dy };
              }
              if (grip.vertexIndex === 0 || grip.vertexIndex === 2) {
                return { ...orig, rx: Math.max(5, Math.abs(rawWorldPt.x - orig.cx)) };
              }
              return { ...orig, ry: Math.max(5, Math.abs(rawWorldPt.y - orig.cy)) };
            }

            default:
              return orig;
          }
        });

        const gadAdjustment = solveGADAssemblyAdjustment(updatedShapes, {
          shapeId: grip.shapeId,
        });

        const finalShapes = gadAdjustment.solved ? gadAdjustment.updatedShapes : updatedShapes;

        dispatch({ type: "RESIZE_SHAPES", updatedShapes: finalShapes });
        return;
      }


      // 4. AutoCAD Directional Window vs Crossing Selection
      if (isMarqueeRef.current) {
        const startPt = startWorldPointRef.current;
        const rect = rectFromDrag(startPt, rawWorldPt);
        const isCrossing = rawWorldPt.x < startPt.x;
        setMarqueeBox({ ...rect, isCrossing });
        return;
      }

      // 5. Moving Selected Shapes / Group with Magnetic Snapping Connection
      if (isMovingRef.current && initialShapesRef.current.length > 0) {
        const currentWorldPt = getWorldPoint(e.clientX, e.clientY);
        const originPt = moveBasePoint || startWorldPointRef.current;
        let rawDx = currentWorldPt.x - originPt.x;
        let rawDy = currentWorldPt.y - originPt.y;

        // Apply AutoCAD Ortho Mode (F8) or Polar Tracking (F10)
        if (state.orthoEnabled) {
          const orthoPt = applyOrthoProjection({ x: 0, y: 0 }, { x: rawDx, y: rawDy });
          rawDx = orthoPt.x;
          rawDy = orthoPt.y;
        } else if (state.polarTrackingEnabled) {
          const polarRes = applyPolarTrackingProjection({ x: 0, y: 0 }, { x: rawDx, y: rawDy });
          rawDx = polarRes.point.x;
          rawDy = polarRes.point.y;
        }

        const selIds = new Set(initialShapesRef.current.map((s) => s.id));
        const unselectedShapes = state.shapes.filter((s) => !selIds.has(s.id));

        if (state.objectSnapEnabled && unselectedShapes.length > 0) {
          const movingPoints = initialShapesRef.current.flatMap(getShapeKeySnapPoints);
          let bestSnap: SnapResult | null = null;
          let minSnapDist = 20 / state.viewport.scale;

          for (const msp of movingPoints) {
            const candidatePt = { x: msp.point.x + rawDx, y: msp.point.y + rawDy };
            const snapRes = applySnapping(candidatePt, {
              gridSnapEnabled: state.gridSnapEnabled,
              objectSnapEnabled: true,
              shapes: unselectedShapes,
              zoomScale: state.viewport.scale,
              vertexThresholdPx: 20,
            });

            if (snapRes.snapped && snapRes.targetPoint) {
              const dist = Math.hypot(candidatePt.x - snapRes.targetPoint.x, candidatePt.y - snapRes.targetPoint.y);
              if (dist < minSnapDist) {
                minSnapDist = dist;
                rawDx = snapRes.targetPoint.x - msp.point.x;
                rawDy = snapRes.targetPoint.y - msp.point.y;
                bestSnap = snapRes;
              }
            }
          }

          dispatch({ type: "SET_ACTIVE_SNAP", snap: bestSnap });
        } else if (state.gridSnapEnabled) {
          const initBounds = initialBoundsRef.current;
          if (initBounds) {
            const snappedCorner = snapToGrid({ x: initBounds.minX + rawDx, y: initBounds.minY + rawDy }, 20);
            rawDx = snappedCorner.x - initBounds.minX;
            rawDy = snappedCorner.y - initBounds.minY;
          }
        }

        if (Math.hypot(rawDx, rawDy) > 3) {
          hasMovedDuringDragRef.current = true;
        }

        if (state.tool === "move" && moveBasePoint) {
          setMoveDisplacement({
            dx: rawDx,
            dy: rawDy,
            targetPt: { x: originPt.x + rawDx, y: originPt.y + rawDy },
          });
        }

        const movedShapes = initialShapesRef.current.map((orig) => {
          switch (orig.type) {
            case "line":
            case "arrow":
              return { ...orig, x1: orig.x1 + rawDx, y1: orig.y1 + rawDy, x2: orig.x2 + rawDx, y2: orig.y2 + rawDy };
            case "rectangle":
              return { ...orig, x: orig.x + rawDx, y: orig.y + rawDy };
            case "circle":
            case "ellipse":
            case "polygon":
            case "star":
              return { ...orig, cx: orig.cx + rawDx, cy: orig.cy + rawDy };
          }
        });

        dispatch({ type: "RESIZE_SHAPES", updatedShapes: movedShapes });
        return;
      }

      // 6. Live Shape Drafting with Smart Magnetic Connection Snapping & Ortho/Polar Modes
      if (isDrawingRef.current && state.draft) {
        const startPt = startWorldPointRef.current;
        let candidatePt = rawWorldPt;

        // Apply AutoCAD Ortho Mode (F8) or Polar Tracking (F10)
        if (state.orthoEnabled) {
          candidatePt = applyOrthoProjection(startPt, candidatePt);
        } else if (state.polarTrackingEnabled) {
          const polarRes = applyPolarTrackingProjection(startPt, candidatePt);
          candidatePt = polarRes.point;
        }

        const snapResult = applySnapping(candidatePt, {
          gridSnapEnabled: state.gridSnapEnabled,
          objectSnapEnabled: state.objectSnapEnabled,
          shapes: state.shapes,
          zoomScale: state.viewport.scale,
          startPoint: startPt,
          vertexThresholdPx: 20,
        });

        const currentPt = snapResult.point;
        let updatedShape: Shape;

        switch (state.draft.type) {
          case "line":
          case "arrow": {
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
          case "ellipse": {
            const ell = ellipseFromDrag(startPt, currentPt);
            updatedShape = {
              ...state.draft,
              ...ell,
            };
            break;
          }
          case "polygon": {
            const r = Math.hypot(currentPt.x - startPt.x, currentPt.y - startPt.y);
            updatedShape = {
              ...state.draft,
              cx: startPt.x,
              cy: startPt.y,
              r,
            };
            break;
          }
          case "star": {
            const outerR = Math.hypot(currentPt.x - startPt.x, currentPt.y - startPt.y);
            updatedShape = {
              ...state.draft,
              cx: startPt.x,
              cy: startPt.y,
              innerR: outerR * 0.45,
              outerR,
            };
            break;
          }
        }

        dispatch({ type: "UPDATE_DRAFT", shape: updatedShape });
        dispatch({ type: "SET_ACTIVE_SNAP", snap: snapResult.snapped ? snapResult : null });
        return;
      }

      // Hover Snap Preview
      if (state.tool !== "select" && state.tool !== "pan") {
        const snapResult = applySnapping(rawWorldPt, {
          gridSnapEnabled: state.gridSnapEnabled,
          objectSnapEnabled: state.objectSnapEnabled,
          shapes: state.shapes,
          zoomScale: state.viewport.scale,
          vertexThresholdPx: 20,
        });
        if (snapResult.snapped !== !!state.activeSnap?.snapped || snapResult.category !== state.activeSnap?.category) {
          dispatch({ type: "SET_ACTIVE_SNAP", snap: snapResult.snapped ? snapResult : null });
        }
      }
    },
    [state.draft, state.selectedIds, state.shapes, state.viewport, state.gridSnapEnabled, state.objectSnapEnabled, state.tool, state.activeSnap, selectedShapes, moveBasePoint, getWorldPoint, onCursorChange, dispatch]
  );

  /**
   * Pointer Up
   */
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      setActiveCursor(null);

      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanActive(false);
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (isRotatingRef.current) {
        isRotatingRef.current = false;
        dispatch({ type: "COMMIT_MOVE" });
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (isResizingRef.current) {
        isResizingRef.current = false;
        activeGripRef.current = null;
        activeResizeHandleRef.current = null;
        activeResizeCursorRef.current = null;
        initialBoundsRef.current = null;
        dispatch({ type: "COMMIT_MOVE" });
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (isMovingRef.current) {
        if (state.tool === "move") {
          if (hasMovedDuringDragRef.current) {
            // Drag-and-drop displacement finished on release
            isMovingRef.current = false;
            isMoveDraggingRef.current = false;
            hasMovedDuringDragRef.current = false;
            setMoveBasePoint(null);
            setMoveDisplacement(null);
            dispatch({ type: "COMMIT_MOVE" });
          } else {
            // Flow 1: Clicked base point without dragging, keeping base point for 2nd click
            isMoveDraggingRef.current = false;
          }
        } else {
          isMovingRef.current = false;
          dispatch({ type: "COMMIT_MOVE" });
        }
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (isMarqueeRef.current) {
        isMarqueeRef.current = false;
        if (marqueeBox && marqueeBox.width > 5 && marqueeBox.height > 5) {
          const matchedIds = evaluateCadMarqueeSelection(state.shapes, marqueeBox);
          if (matchedIds.length > 0) {
            selectMultiple(matchedIds);
          } else {
            selectShape(null);
          }
        } else {
          selectShape(null);
        }
        setMarqueeBox(null);
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
        return;
      }

      if (isDrawingRef.current && state.draft) {
        isDrawingRef.current = false;

        const rawWorldPt = getWorldPoint(e.clientX, e.clientY);
        const startPt = startWorldPointRef.current;
        const finalSnap = applySnapping(rawWorldPt, {
          gridSnapEnabled: state.gridSnapEnabled,
          objectSnapEnabled: state.objectSnapEnabled,
          shapes: state.shapes,
          zoomScale: state.viewport.scale,
          startPoint: startPt,
          vertexThresholdPx: 20,
        });

        const endPt = finalSnap.point;
        let finalizedShape: Shape;

        switch (state.draft.type) {
          case "line":
          case "arrow": {
            finalizedShape = {
              ...state.draft,
              x1: startPt.x,
              y1: startPt.y,
              x2: endPt.x,
              y2: endPt.y,
            };
            break;
          }
          case "rectangle": {
            const rect = rectFromDrag(startPt, endPt);
            finalizedShape = {
              ...state.draft,
              ...rect,
            };
            break;
          }
          case "circle": {
            const circ = circleFromDrag(startPt, endPt);
            finalizedShape = {
              ...state.draft,
              ...circ,
            };
            break;
          }
          case "ellipse": {
            const ell = ellipseFromDrag(startPt, endPt);
            finalizedShape = {
              ...state.draft,
              ...ell,
            };
            break;
          }
          case "polygon": {
            const r = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
            finalizedShape = {
              ...state.draft,
              cx: startPt.x,
              cy: startPt.y,
              r,
            };
            break;
          }
          case "star": {
            const outerR = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
            finalizedShape = {
              ...state.draft,
              cx: startPt.x,
              cy: startPt.y,
              innerR: outerR * 0.45,
              outerR,
            };
            break;
          }
        }

        dispatch({ type: "UPDATE_DRAFT", shape: finalizedShape });
        dispatch({ type: "COMMIT_DRAFT" });
        try {
          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        } catch {}
      }
    },
    [marqueeBox, state.shapes, state.draft, state.gridSnapEnabled, state.objectSnapEnabled, state.viewport, selectMultiple, selectShape, getWorldPoint, dispatch]
  );

  /**
   * Native Non-Passive Wheel & Pinch-Zoom Listener
   */
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = svgEl.getBoundingClientRect();
      const screenPt: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.01);
        const nextViewport = zoomAtPoint(state.viewport, screenPt, zoomFactor, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
        dispatch({ type: "SET_VIEWPORT", viewport: nextViewport });
        return;
      }

      if (e.shiftKey) {
        dispatch({
          type: "SET_VIEWPORT",
          viewport: {
            ...state.viewport,
            x: state.viewport.x - e.deltaY,
          },
        });
        return;
      }

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.925;
      const nextViewport = zoomAtPoint(state.viewport, screenPt, zoomFactor, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
      dispatch({ type: "SET_VIEWPORT", viewport: nextViewport });
    };

    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    svgEl.addEventListener("wheel", handleNativeWheel, { passive: false });
    svgEl.addEventListener("gesturestart", handleGesture, { passive: false });
    svgEl.addEventListener("gesturechange", handleGesture, { passive: false });
    svgEl.addEventListener("gestureend", handleGesture, { passive: false });

    return () => {
      svgEl.removeEventListener("wheel", handleNativeWheel);
      svgEl.removeEventListener("gesturestart", handleGesture);
      svgEl.removeEventListener("gesturechange", handleGesture);
      svgEl.removeEventListener("gestureend", handleGesture);
    };
  }, [state.viewport, dispatch]);

  /**
   * Keyboard Shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea" || targetTag === "select") {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "0")) {
        e.preventDefault();
        if (e.key === "+" || e.key === "=") {
          dispatch({
            type: "SET_VIEWPORT",
            viewport: { ...state.viewport, scale: Math.min(MAX_ZOOM_SCALE, state.viewport.scale * 1.2) },
          });
        } else if (e.key === "-") {
          dispatch({
            type: "SET_VIEWPORT",
            viewport: { ...state.viewport, scale: Math.max(MIN_ZOOM_SCALE, state.viewport.scale / 1.2) },
          });
        } else if (e.key === "0") {
          dispatch({ type: "ZOOM_EXTENTS" });
        }
        return;
      }

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
        if (state.tool === "move" && moveBasePoint) {
          cancelMove();
          return;
        }
        if (state.draft) {
          dispatch({ type: "CANCEL_DRAFT" });
        } else if (state.selectedIds.length > 0) {
          selectShape(null);
        }
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key.toLowerCase() === "v") setTool("select");
        if (e.key.toLowerCase() === "m") setTool("move");
        if (e.key.toLowerCase() === "l") setTool("line");
        if (e.key.toLowerCase() === "p") setTool("polyline");
        if (e.key.toLowerCase() === "r") setTool("rectangle");
        if (e.key.toLowerCase() === "c") setTool("circle");
        if (e.key.toLowerCase() === "e") setTool("ellipse");
        if (e.key.toLowerCase() === "g" || e.key.toLowerCase() === "t") setTool("polygon");
        if (e.key.toLowerCase() === "s") setTool("star");
        if (e.key.toLowerCase() === "a") setTool("arrow");
        if (e.key.toLowerCase() === "d") setTool("dimension");
        if (e.key.toLowerCase() === "x") setTool("construction");
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
  }, [state.selectedIds, state.draft, state.tool, state.viewport, moveBasePoint, cancelMove, dispatch, deleteSelected, duplicateSelected, groupSelected, ungroupSelected, selectShape, setTool]);

  let cursorStyle = "crosshair";
  if (activeCursor) {
    cursorStyle = activeCursor;
  } else if (state.tool === "select") {
    cursorStyle = "default";
  } else if (state.tool === "move") {
    cursorStyle = moveBasePoint ? "crosshair" : "move";
  } else if (state.tool === "pan" || isSpaceHeld) {
    cursorStyle = isPanActive ? "grabbing" : "grab";
  }

  const { x: panX, y: panY, scale } = state.viewport;

  return (
    <div
      className="w-full h-full relative overflow-hidden bg-[var(--bg-canvas)] touch-none"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (file.name.toLowerCase().endsWith(".dxf")) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            if (text) {
              try {
                const shapes = importDxfToShapes(text);
                if (shapes.length > 0) {
                  dispatch({ type: "LOAD_SHAPES", shapes });
                }
              } catch (err) {
                console.error("Failed to parse dropped DXF:", err);
              }
            }
          };
          reader.readAsText(file);
        }
      }}
    >
      <CadViewportOverlays />
      <svg
        id="drawing-canvas-svg"
        ref={svgRef}
        className="w-full h-full block select-none outline-none touch-none"
        tabIndex={0}
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          onCursorChange?.(null);
          setCurrentCursorWorld(null);
        }}
      >
        <g
          id="world-layer"
          transform={`matrix(${scale} 0 0 ${scale} ${panX} ${panY})`}
        >
          {/* CAD Grid */}
          <GridLayer
            viewport={state.viewport}
            showGrid={state.showGrid}
          />

          {/* Committed Shapes */}
          <ShapeRenderer
            shapes={state.shapes}
            selectedIds={state.selectedIds}
            showDimensions={state.showDimensions}
            scale={scale}
            isSelectTool={state.tool === "select" || state.tool === "move"}
            themeMode={state.themeMode}
            onSelectShape={handleShapeSelect}
          />

          {/* In-Progress Live Draft */}
          <DraftPreview draft={state.draft} scale={scale} />

          {/* AutoCAD 3-State Geometric Grips Selection Overlay */}
          {(state.tool === "select" || state.tool === "move") && (
            <SelectionOverlay
              shapes={selectedShapes}
              scale={scale}
              activeGripId={activeGripRef.current?.id}
              onGripPointerDown={handleGripPointerDown}
              onHandlePointerDown={handleResizeStart}
              onRotatePointerDown={handleRotateStart}
            />
          )}

          {/* AutoCAD Move Tool Overlay: Base Point Marker, Rubber-Band Tracking Line, & Dynamic HUD */}
          {state.tool === "move" && moveBasePoint && (
            <g id="autocad-move-overlay" className="pointer-events-none">
              {/* Base Point Marker: Crosshair & Target Ring */}
              <circle
                cx={moveBasePoint.x}
                cy={moveBasePoint.y}
                r={6 / scale}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={1.5 / scale}
              />
              <circle
                cx={moveBasePoint.x}
                cy={moveBasePoint.y}
                r={1.5 / scale}
                fill="#f59e0b"
              />
              <line
                x1={moveBasePoint.x - 10 / scale}
                y1={moveBasePoint.y}
                x2={moveBasePoint.x + 10 / scale}
                y2={moveBasePoint.y}
                stroke="#f59e0b"
                strokeWidth={1.2 / scale}
              />
              <line
                x1={moveBasePoint.x}
                y1={moveBasePoint.y - 10 / scale}
                x2={moveBasePoint.x}
                y2={moveBasePoint.y + 10 / scale}
                stroke="#f59e0b"
                strokeWidth={1.2 / scale}
              />

              {/* Rubber-band tracking line from base point to current target */}
              {moveDisplacement && (
                <>
                  <line
                    x1={moveBasePoint.x}
                    y1={moveBasePoint.y}
                    x2={moveDisplacement.targetPt.x}
                    y2={moveDisplacement.targetPt.y}
                    stroke="#f59e0b"
                    strokeWidth={1.5 / scale}
                    strokeDasharray={`${5 / scale}, ${3 / scale}`}
                  />

                  {/* Second Point Target Marker */}
                  <circle
                    cx={moveDisplacement.targetPt.x}
                    cy={moveDisplacement.targetPt.y}
                    r={4 / scale}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.5 / scale}
                  />

                  {/* AutoCAD Dynamic Dimension HUD Badge near cursor */}
                  <g
                    transform={`translate(${moveDisplacement.targetPt.x + 16 / scale}, ${moveDisplacement.targetPt.y - 16 / scale})`}
                  >
                    <rect
                      x={0}
                      y={-28 / scale}
                      width={132 / scale}
                      height={28 / scale}
                      rx={4 / scale}
                      fill="rgba(15, 23, 42, 0.92)"
                      stroke="#f59e0b"
                      strokeWidth={1 / scale}
                    />
                    <text
                      x={6 / scale}
                      y={-16 / scale}
                      fill="#f59e0b"
                      fontSize={9 / scale}
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {`ΔX: ${moveDisplacement.dx >= 0 ? "+" : ""}${moveDisplacement.dx.toFixed(1)} ΔY: ${moveDisplacement.dy >= 0 ? "+" : ""}${moveDisplacement.dy.toFixed(1)}`}
                    </text>
                    <text
                      x={6 / scale}
                      y={-6 / scale}
                      fill="#38bdf8"
                      fontSize={8.5 / scale}
                      fontFamily="monospace"
                    >
                      {`L: ${Math.hypot(moveDisplacement.dx, moveDisplacement.dy).toFixed(1)} ∠${(
                        (Math.atan2(-moveDisplacement.dy, moveDisplacement.dx) * (180 / Math.PI) + 360) % 360
                      ).toFixed(1)}°`}
                    </text>
                  </g>
                </>
              )}
            </g>
          )}

          {/* Geometric Constraint Visual Glyphs */}
          <ConstraintOverlays />

          {/* Interactive On-Canvas Parametric Dimension Badges & Inline Editor */}
          <ParametricDimensionOverlay scale={scale} />

          {/* Span Boundary & Limits Warning Badges */}
          <BoundaryLimitsOverlay scale={scale} />

          {/* Floating AutoCAD Dynamic Input HUD */}
          <DynamicInputOverlay
            cursorPos={currentCursorWorld}
            basePoint={moveBasePoint || (state.draft ? startWorldPointRef.current : null)}
            active={Boolean(state.dynamicInputEnabled && (state.draft || moveBasePoint || isMovingRef.current))}
            scale={scale}
          />

          {/* Smart Magnetic Connection & Snap Target Indicator */}
          <SnapIndicator snap={state.activeSnap} scale={scale} />

          {/* AutoCAD Directional Marquee Box Selection: Blue Window (L->R) vs Green Crossing (R->L) */}
          {marqueeBox && (
            <rect
              x={marqueeBox.x}
              y={marqueeBox.y}
              width={marqueeBox.width}
              height={marqueeBox.height}
              fill={marqueeBox.isCrossing ? "rgba(34, 197, 94, 0.16)" : "rgba(59, 130, 246, 0.16)"}
              stroke={marqueeBox.isCrossing ? "#22c55e" : "#3b82f6"}
              strokeWidth={1.2 / scale}
              strokeDasharray={marqueeBox.isCrossing ? `${5 / scale}, ${3 / scale}` : undefined}
              className="pointer-events-none"
            />
          )}
        </g>
      </svg>
    </div>
  );
};
