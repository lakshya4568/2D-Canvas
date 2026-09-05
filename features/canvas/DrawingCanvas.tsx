"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { Shape, Point, BoundingBox, SnapResult } from "@/lib/geometry/types";
import {
  rectFromDrag,
  circleFromDrag,
  ellipseFromDrag,
  computeMultiShapeBounds,
  computeShapeBounds,
  rotatePoint,
} from "@/lib/geometry/metrics";
import { hitTestShapes } from "@/lib/geometry/hitTest";
import { zoomAtPoint, screenToWorldPoint } from "@/lib/geometry/transform";
import { applySnapping, getShapeKeySnapPoints, snapToGrid } from "@/lib/geometry/snapping";
import { GridLayer } from "./GridLayer";
import { ShapeRenderer } from "./ShapeRenderer";
import { DraftPreview } from "./DraftPreview";
import { SelectionOverlay, HandleType } from "./SelectionOverlay";
import { SnapIndicator } from "./SnapIndicator";
import { ConstraintOverlays } from "./ConstraintOverlays";
import { ParametricDimensionOverlay } from "./ParametricDimensionOverlay";

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
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

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
   * Handle Direct Shape Click in Select Mode
   */
  const handleShapeSelect = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (state.tool === "select") {
        const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;
        selectShape(id, isShiftOrCtrl);

        isMovingRef.current = true;
        isMarqueeRef.current = false;
        setActiveCursor("grabbing");
        lastScreenPosRef.current = { x: e.clientX, y: e.clientY };

        const targetShapes = state.shapes.filter(
          (s) => s.id === id || state.selectedIds.includes(s.id) || (s.groupId && s.groupId === state.shapes.find(x => x.id === id)?.groupId)
        );
        initialShapesRef.current = JSON.parse(JSON.stringify(targetShapes.length > 0 ? targetShapes : state.shapes.filter(x => x.id === id)));
        initialBoundsRef.current = computeMultiShapeBounds(initialShapesRef.current);
        startWorldPointRef.current = getWorldPoint(e.clientX, e.clientY);

        dispatch({
          type: "RECORD_PRE_MOVE_SNAPSHOT",
          shapes: state.shapes,
          description: "Move Shapes",
        });

        if (svgRef.current) {
          svgRef.current.setPointerCapture(e.pointerId);
        }
      }
    },
    [state.tool, state.shapes, state.selectedIds, selectShape, getWorldPoint, dispatch]
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
          isMovingRef.current = true;
          isMarqueeRef.current = false;
          setActiveCursor("grabbing");

          const targetShapes = state.shapes.filter(
            (s) => s.id === hitShape.id || (hitShape.groupId && s.groupId === hitShape.groupId)
          );
          initialShapesRef.current = JSON.parse(JSON.stringify(targetShapes));
          initialBoundsRef.current = computeMultiShapeBounds(targetShapes);
          startWorldPointRef.current = rawWorldPt;

          dispatch({
            type: "RECORD_PRE_MOVE_SNAPSHOT",
            shapes: state.shapes,
            description: "Move Shapes",
          });
          lastScreenPosRef.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } else {
          isMarqueeRef.current = true;
          isMovingRef.current = false;
          isResizingRef.current = false;
          isRotatingRef.current = false;
          startWorldPointRef.current = rawWorldPt;
          setMarqueeBox({ x: rawWorldPt.x, y: rawWorldPt.y, width: 0, height: 0 });
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
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
    [state.tool, state.shapes, state.viewport, state.gridSnapEnabled, state.objectSnapEnabled, state.currentStyle, getWorldPoint, selectShape, dispatch]
  );

  /**
   * Pointer Move
   */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rawWorldPt = getWorldPoint(e.clientX, e.clientY);
      onCursorChange?.(rawWorldPt);

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

      // 3. Corner & Edge Handle Resizing
      if (isResizingRef.current && initialBoundsRef.current && activeResizeHandleRef.current) {
        const handle = activeResizeHandleRef.current;
        const initB = initialBoundsRef.current;
        const startPt = startWorldPointRef.current;
        const dx = rawWorldPt.x - startPt.x;
        const dy = rawWorldPt.y - startPt.y;

        let newMinX = initB.minX;
        let newMinY = initB.minY;
        let newMaxX = initB.maxX;
        let newMaxY = initB.maxY;

        if (handle.includes("e")) newMaxX = Math.max(initB.minX + 5, initB.maxX + dx);
        if (handle.includes("w")) newMinX = Math.min(initB.maxX - 5, initB.minX + dx);
        if (handle.includes("s")) newMaxY = Math.max(initB.minY + 5, initB.maxY + dy);
        if (handle.includes("n")) newMinY = Math.min(initB.maxY - 5, initB.minY + dy);

        if (e.shiftKey) {
          const initRatio = initB.width / Math.max(1, initB.height);
          const currentW = newMaxX - newMinX;
          const currentH = newMaxY - newMinY;
          if (handle === "se" || handle === "nw" || handle === "ne" || handle === "sw") {
            const targetH = currentW / initRatio;
            if (handle.includes("s")) newMaxY = newMinY + targetH;
            else newMinY = newMaxY - targetH;
          }
        }

        const newW = Math.max(5, newMaxX - newMinX);
        const newH = Math.max(5, newMaxY - newMinY);
        const scaleX = newW / Math.max(1, initB.width);
        const scaleY = newH / Math.max(1, initB.height);

        const scaledShapes: Shape[] = initialShapesRef.current.map((orig) => {
          switch (orig.type) {
            case "rectangle": {
              if (initialShapesRef.current.length === 1) {
                return {
                  ...orig,
                  x: newMinX,
                  y: newMinY,
                  width: newW,
                  height: newH,
                };
              }
              const relX = (orig.x - initB.minX) * scaleX;
              const relY = (orig.y - initB.minY) * scaleY;
              return {
                ...orig,
                x: newMinX + relX,
                y: newMinY + relY,
                width: orig.width * scaleX,
                height: orig.height * scaleY,
              };
            }
            case "circle": {
              if (initialShapesRef.current.length === 1) {
                const newRadius = Math.min(newW, newH) / 2;
                return {
                  ...orig,
                  cx: newMinX + newW / 2,
                  cy: newMinY + newH / 2,
                  r: newRadius,
                };
              }
              const relCX = (orig.cx - initB.minX) * scaleX;
              const relCY = (orig.cy - initB.minY) * scaleY;
              return {
                ...orig,
                cx: newMinX + relCX,
                cy: newMinY + relCY,
                r: orig.r * ((scaleX + scaleY) / 2),
              };
            }
            case "ellipse": {
              return {
                ...orig,
                cx: newMinX + newW / 2,
                cy: newMinY + newH / 2,
                rx: newW / 2,
                ry: newH / 2,
              };
            }
            case "polygon": {
              return {
                ...orig,
                cx: newMinX + newW / 2,
                cy: newMinY + newH / 2,
                r: Math.min(newW, newH) / 2,
              };
            }
            case "star": {
              const baseR = Math.min(newW, newH) / 2;
              return {
                ...orig,
                cx: newMinX + newW / 2,
                cy: newMinY + newH / 2,
                innerR: baseR * 0.45,
                outerR: baseR,
              };
            }
            case "line":
            case "arrow": {
              const relX1 = (orig.x1 - initB.minX) * scaleX;
              const relY1 = (orig.y1 - initB.minY) * scaleY;
              const relX2 = (orig.x2 - initB.minX) * scaleX;
              const relY2 = (orig.y2 - initB.minY) * scaleY;
              return {
                ...orig,
                x1: newMinX + relX1,
                y1: newMinY + relY1,
                x2: newMinX + relX2,
                y2: newMinY + relY2,
              };
            }
          }
        });

        dispatch({ type: "RESIZE_SHAPES", updatedShapes: scaledShapes });
        return;
      }

      // 4. Marquee Box Selection
      if (isMarqueeRef.current) {
        const startPt = startWorldPointRef.current;
        const rect = rectFromDrag(startPt, rawWorldPt);
        setMarqueeBox(rect);
        return;
      }

      // 5. Moving Selected Shapes / Group with Magnetic Snapping Connection
      if (isMovingRef.current && initialShapesRef.current.length > 0) {
        const currentWorldPt = getWorldPoint(e.clientX, e.clientY);
        const startWorldPt = startWorldPointRef.current;
        let rawDx = currentWorldPt.x - startWorldPt.x;
        let rawDy = currentWorldPt.y - startWorldPt.y;

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

      // 6. Live Shape Drafting with Smart Magnetic Connection Snapping
      if (isDrawingRef.current && state.draft) {
        const startPt = startWorldPointRef.current;
        const snapResult = applySnapping(rawWorldPt, {
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
    [state.draft, state.selectedIds, state.shapes, state.viewport, state.gridSnapEnabled, state.objectSnapEnabled, state.tool, state.activeSnap, selectedShapes, getWorldPoint, onCursorChange, dispatch]
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
        activeResizeHandleRef.current = null;
        activeResizeCursorRef.current = null;
        initialBoundsRef.current = null;
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

      if (isMarqueeRef.current) {
        isMarqueeRef.current = false;
        if (marqueeBox && marqueeBox.width > 5 && marqueeBox.height > 5) {
          const mMinX = marqueeBox.x;
          const mMaxX = marqueeBox.x + marqueeBox.width;
          const mMinY = marqueeBox.y;
          const mMaxY = marqueeBox.y + marqueeBox.height;

          const matchedIds: string[] = [];
          for (const shape of state.shapes) {
            const b = computeShapeBounds(shape);
            const intersects =
              b.maxX >= mMinX &&
              b.minX <= mMaxX &&
              b.maxY >= mMinY &&
              b.minY <= mMaxY;
            if (intersects) {
              matchedIds.push(shape.id);
            }
          }

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
        const nextViewport = zoomAtPoint(state.viewport, screenPt, zoomFactor, 0.05, 20);
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
      const nextViewport = zoomAtPoint(state.viewport, screenPt, zoomFactor, 0.05, 20);
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
            viewport: { ...state.viewport, scale: Math.min(20, state.viewport.scale * 1.2) },
          });
        } else if (e.key === "-") {
          dispatch({
            type: "SET_VIEWPORT",
            viewport: { ...state.viewport, scale: Math.max(0.05, state.viewport.scale / 1.2) },
          });
        } else if (e.key === "0") {
          dispatch({ type: "RESET_VIEWPORT" });
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
        if (e.key.toLowerCase() === "a") setTool("arrow");
        if (e.key.toLowerCase() === "r") setTool("rectangle");
        if (e.key.toLowerCase() === "c") setTool("circle");
        if (e.key.toLowerCase() === "e") setTool("ellipse");
        if (e.key.toLowerCase() === "t") setTool("polygon");
        if (e.key.toLowerCase() === "s") setTool("star");
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
  }, [state.selectedIds, state.draft, state.viewport, dispatch, deleteSelected, duplicateSelected, groupSelected, ungroupSelected, selectShape, setTool]);

  let cursorStyle = "crosshair";
  if (activeCursor) {
    cursorStyle = activeCursor;
  } else if (state.tool === "select") {
    cursorStyle = isMovingRef.current ? "grabbing" : isRotatingRef.current ? "grabbing" : "default";
  } else if (state.tool === "pan" || isSpaceHeld) {
    cursorStyle = isPanActive ? "grabbing" : "grab";
  }

  const { x: panX, y: panY, scale } = state.viewport;

  return (
    <div className="w-full h-full relative overflow-hidden bg-[var(--bg-canvas)] touch-none">
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
            isSelectTool={state.tool === "select"}
            themeMode={state.themeMode}
            onSelectShape={handleShapeSelect}
          />

          {/* In-Progress Live Draft */}
          <DraftPreview draft={state.draft} scale={scale} />

          {/* Figma-Style Selection Overlay */}
          {state.tool === "select" && (
            <SelectionOverlay
              shapes={selectedShapes}
              scale={scale}
              onHandlePointerDown={handleResizeStart}
              onRotatePointerDown={handleRotateStart}
            />
          )}

          {/* Geometric Constraint Visual Glyphs */}
          <ConstraintOverlays />

          {/* Interactive On-Canvas Parametric Dimension Badges & Inline Editor */}
          <ParametricDimensionOverlay scale={scale} />

          {/* Smart Magnetic Connection & Snap Target Indicator */}
          <SnapIndicator snap={state.activeSnap} scale={scale} />

          {/* Figma-Style Marquee Box Selection Overlay */}
          {marqueeBox && (
            <rect
              x={marqueeBox.x}
              y={marqueeBox.y}
              width={marqueeBox.width}
              height={marqueeBox.height}
              fill="rgba(0, 102, 255, 0.08)"
              stroke="#0066ff"
              strokeWidth={1 / scale}
              strokeDasharray={`${4 / scale}, ${3 / scale}`}
              className="pointer-events-none"
            />
          )}
        </g>
      </svg>
    </div>
  );
};
