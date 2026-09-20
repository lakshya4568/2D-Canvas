/**
 * AutoCAD Command Registry & Execution Engine
 * UPCE-MASTER-1.0 §3, §46, §66, Gate G0–G10
 */

import {
  CadCommandContext,
  CommandAlias,
  CommandCompletion,
  CommandExecutionResult,
} from "./types";
import { parseCommandLine, parseCoordinateInput, resolveCoordinate } from "./CommandParser";
import { LineShape, RectangleShape, CircleShape } from "../geometry/types";

export const COMMAND_ALIASES: CommandAlias[] = [
  // Drawing primitives
  { alias: "L", commandName: "LINE", description: "Creates straight line segments", category: "draw" },
  { alias: "LINE", commandName: "LINE", description: "Creates straight line segments", category: "draw" },
  { alias: "PL", commandName: "PLINE", description: "Creates 2D polylines", category: "draw" },
  { alias: "PLINE", commandName: "PLINE", description: "Creates 2D polylines", category: "draw" },
  { alias: "REC", commandName: "RECTANGLE", description: "Creates a rectangular polyline", category: "draw" },
  { alias: "RECT", commandName: "RECTANGLE", description: "Creates a rectangular polyline", category: "draw" },
  { alias: "RECTANGLE", commandName: "RECTANGLE", description: "Creates a rectangular polyline", category: "draw" },
  { alias: "C", commandName: "CIRCLE", description: "Creates a circle with center and radius", category: "draw" },
  { alias: "CIRCLE", commandName: "CIRCLE", description: "Creates a circle with center and radius", category: "draw" },
  { alias: "A", commandName: "ARC", description: "Creates a 3-point or center-radius arc", category: "draw" },
  { alias: "ARC", commandName: "ARC", description: "Creates a 3-point or center-radius arc", category: "draw" },
  { alias: "POL", commandName: "POLYGON", description: "Creates an equilateral closed polygon", category: "draw" },
  { alias: "POLYGON", commandName: "POLYGON", description: "Creates an equilateral closed polygon", category: "draw" },
  { alias: "EL", commandName: "ELLIPSE", description: "Creates an ellipse with major/minor axes", category: "draw" },
  { alias: "ELLIPSE", commandName: "ELLIPSE", description: "Creates an ellipse with major/minor axes", category: "draw" },

  // Modification tools
  { alias: "M", commandName: "MOVE", description: "Displaces objects at a specified distance and direction", category: "modify" },
  { alias: "MOVE", commandName: "MOVE", description: "Displaces objects at a specified distance and direction", category: "modify" },
  { alias: "CO", commandName: "COPY", description: "Copies objects at a specified distance and direction", category: "modify" },
  { alias: "CP", commandName: "COPY", description: "Copies objects at a specified distance and direction", category: "modify" },
  { alias: "COPY", commandName: "COPY", description: "Copies objects at a specified distance and direction", category: "modify" },
  { alias: "RO", commandName: "ROTATE", description: "Rotates objects around a base point", category: "modify" },
  { alias: "ROTATE", commandName: "ROTATE", description: "Rotates objects around a base point", category: "modify" },
  { alias: "SC", commandName: "SCALE", description: "Enlarges or reduces selected objects proportionally", category: "modify" },
  { alias: "SCALE", commandName: "SCALE", description: "Enlarges or reduces selected objects proportionally", category: "modify" },
  { alias: "TR", commandName: "TRIM", description: "Trims objects to meet the edges of other objects", category: "modify" },
  { alias: "TRIM", commandName: "TRIM", description: "Trims objects to meet the edges of other objects", category: "modify" },
  { alias: "EX", commandName: "EXTEND", description: "Extends objects to meet the edges of other objects", category: "modify" },
  { alias: "EXTEND", commandName: "EXTEND", description: "Extends objects to meet the edges of other objects", category: "modify" },
  { alias: "O", commandName: "OFFSET", description: "Creates concentric circles, parallel lines and curves", category: "modify" },
  { alias: "OFFSET", commandName: "OFFSET", description: "Creates concentric circles, parallel lines and curves", category: "modify" },
  { alias: "F", commandName: "FILLET", description: "Rounds and fillets the edges of objects", category: "modify" },
  { alias: "FILLET", commandName: "FILLET", description: "Rounds and fillets the edges of objects", category: "modify" },
  { alias: "CHA", commandName: "CHAMFER", description: "Bevels the edges of objects", category: "modify" },
  { alias: "CHAMFER", commandName: "CHAMFER", description: "Bevels the edges of objects", category: "modify" },
  { alias: "MI", commandName: "MIRROR", description: "Creates a mirrored copy of selected objects", category: "modify" },
  { alias: "MIRROR", commandName: "MIRROR", description: "Creates a mirrored copy of selected objects", category: "modify" },
  { alias: "AR", commandName: "ARRAY", description: "Creates copies of objects arranged in a pattern", category: "modify" },
  { alias: "ARRAY", commandName: "ARRAY", description: "Creates copies of objects arranged in a pattern", category: "modify" },
  { alias: "E", commandName: "ERASE", description: "Removes objects from a drawing", category: "modify" },
  { alias: "DEL", commandName: "ERASE", description: "Removes objects from a drawing", category: "modify" },
  { alias: "ERASE", commandName: "ERASE", description: "Removes objects from a drawing", category: "modify" },
  { alias: "G", commandName: "GROUP", description: "Combines selected objects into a group", category: "modify" },
  { alias: "GROUP", commandName: "GROUP", description: "Combines selected objects into a group", category: "modify" },
  { alias: "UNG", commandName: "UNGROUP", description: "Dissociates objects in a group", category: "modify" },
  { alias: "UNGROUP", commandName: "UNGROUP", description: "Dissociates objects in a group", category: "modify" },

  // Dimensions & Inspection
  { alias: "DI", commandName: "DIST", description: "Measures the distance and angle between two points", category: "dimension" },
  { alias: "DIST", commandName: "DIST", description: "Measures the distance and angle between two points", category: "dimension" },

  // Viewport navigation
  { alias: "Z", commandName: "ZOOM", description: "Increases or decreases the magnification of the view", category: "view" },
  { alias: "ZOOM", commandName: "ZOOM", description: "Increases or decreases the magnification of the view", category: "view" },
  { alias: "P", commandName: "PAN", description: "Shifts the view without changing the magnification", category: "view" },
  { alias: "PAN", commandName: "PAN", description: "Shifts the view without changing the magnification", category: "view" },

  // Utilities & State
  { alias: "U", commandName: "UNDO", description: "Reverses the most recent action", category: "utility" },
  { alias: "UNDO", commandName: "UNDO", description: "Reverses the most recent action", category: "utility" },
  { alias: "REDO", commandName: "REDO", description: "Reverses the effects of previous UNDO actions", category: "utility" },
  { alias: "CLS", commandName: "CLEAR", description: "Clears the canvas", category: "utility" },
  { alias: "CLEAR", commandName: "CLEAR", description: "Clears the canvas", category: "utility" },
  { alias: "TEMPLATES", commandName: "TEMPLATES", description: "Opens parametric bridge template catalog", category: "utility" },
  { alias: "HELP", commandName: "HELP", description: "Opens the CAD Instruction Manual & Guide", category: "utility" },
  { alias: "?", commandName: "HELP", description: "Opens the CAD Instruction Manual & Guide", category: "utility" },
  { alias: "ESC", commandName: "SELECT", description: "Cancels active tool and returns to selection mode", category: "utility" },
  { alias: "SELECT", commandName: "SELECT", description: "Select objects mode", category: "utility" },
  { alias: "DXFIN", commandName: "IMPORTDXF", description: "Imports geometry from an AutoCAD DXF file", category: "utility" },
  { alias: "IMPORTDXF", commandName: "IMPORTDXF", description: "Imports geometry from an AutoCAD DXF file", category: "utility" },
  { alias: "OPEN", commandName: "OPEN", description: "Opens a saved drawing (.mycad) with its parameters and rules", category: "utility" },
  { alias: "NEW", commandName: "NEW", description: "Starts a new drawing", category: "utility" },
  { alias: "SAVE", commandName: "SAVE", description: "Saves the drawing to its native file", category: "utility" },
  { alias: "QSAVE", commandName: "SAVE", description: "Saves the drawing to its native file", category: "utility" },
  { alias: "SAVEAS", commandName: "SAVEAS", description: "Saves the drawing to a new file", category: "utility" },

  // Drafting mode toggles
  { alias: "ORTHO", commandName: "ORTHO", description: "Toggles orthogonal lock (F8)", category: "utility" },
  { alias: "POLAR", commandName: "POLAR", description: "Toggles polar tracking (F10)", category: "utility" },
  { alias: "OSNAP", commandName: "OSNAP", description: "Toggles object snapping (F3)", category: "utility" },
  { alias: "GRID", commandName: "GRID", description: "Toggles grid display (F7)", category: "utility" },
  { alias: "SNAP", commandName: "SNAP", description: "Toggles grid snap mode (F9)", category: "utility" },
  { alias: "DYN", commandName: "DYNAMIC_INPUT", description: "Toggles dynamic input display (F12)", category: "utility" },
  { alias: "DYNMODE", commandName: "DYNAMIC_INPUT", description: "Toggles dynamic input display (F12)", category: "utility" },

  // Annotation
  { alias: "T", commandName: "TEXT", description: "Places single or multi-line text", category: "dimension" },
  { alias: "TEXT", commandName: "TEXT", description: "Places single or multi-line text", category: "dimension" },
  { alias: "MT", commandName: "TEXT", description: "Places multi-line text (type \\n for a new line)", category: "dimension" },
  { alias: "MTEXT", commandName: "TEXT", description: "Places multi-line text", category: "dimension" },
  { alias: "LE", commandName: "LEADER", description: "Creates a leader with a note", category: "dimension" },
  { alias: "MLEADER", commandName: "LEADER", description: "Creates a leader with a note", category: "dimension" },
  { alias: "DLI", commandName: "DIMLINEAR", description: "Horizontal or vertical dimension", category: "dimension" },
  { alias: "DIMLINEAR", commandName: "DIMLINEAR", description: "Horizontal or vertical dimension", category: "dimension" },
  { alias: "DAL", commandName: "DIMALIGNED", description: "Aligned dimension", category: "dimension" },
  { alias: "DIMALIGNED", commandName: "DIMALIGNED", description: "Aligned dimension", category: "dimension" },
  { alias: "DRA", commandName: "DIMRADIUS", description: "Radius dimension of a circle", category: "dimension" },
  { alias: "DIMRADIUS", commandName: "DIMRADIUS", description: "Radius dimension of a circle", category: "dimension" },
  { alias: "DAN", commandName: "DIMANGULAR", description: "Angular dimension", category: "dimension" },
  { alias: "DIMANGULAR", commandName: "DIMANGULAR", description: "Angular dimension", category: "dimension" },
  { alias: "LEVEL", commandName: "LEVEL", description: "Reduced-level marker read from the geometry", category: "dimension" },
  { alias: "RL", commandName: "LEVEL", description: "Reduced-level marker read from the geometry", category: "dimension" },
  { alias: "H", commandName: "HATCH", description: "Hatches a closed area with a material", category: "dimension" },
  { alias: "HATCH", commandName: "HATCH", description: "Hatches a closed area with a material", category: "dimension" },
  { alias: "NORTH", commandName: "NORTH", description: "Places a north arrow", category: "dimension" },
  { alias: "FLOW", commandName: "FLOW", description: "Direction of flow arrow", category: "dimension" },
  { alias: "KM", commandName: "KILOMETRAGE", description: "Direction of increasing kilometrage", category: "dimension" },
  { alias: "SECTION", commandName: "SECTIONMARK", description: "Section cut marker", category: "dimension" },
  { alias: "REVCLOUD", commandName: "REVCLOUD", description: "Revision cloud", category: "dimension" },
  { alias: "BR", commandName: "BREAK", description: "Breaks a line at a point", category: "modify" },
  { alias: "BREAK", commandName: "BREAK", description: "Breaks a line at a point", category: "modify" },
  { alias: "J", commandName: "JOIN", description: "Joins selected lines into a polyline", category: "modify" },
  { alias: "JOIN", commandName: "JOIN", description: "Joins selected lines into a polyline", category: "modify" },
  { alias: "X", commandName: "EXPLODE", description: "Explodes rectangles, polygons and polylines into lines", category: "modify" },
  { alias: "EXPLODE", commandName: "EXPLODE", description: "Explodes rectangles, polygons and polylines into lines", category: "modify" },

  // Layers, components, output
  { alias: "LA", commandName: "LAYER", description: "Layer properties manager", category: "utility" },
  { alias: "LAYER", commandName: "LAYER", description: "Layer properties manager", category: "utility" },
  { alias: "I", commandName: "INSERT", description: "Inserts a parametric component (bridge, culvert, pier…)", category: "utility" },
  { alias: "INSERT", commandName: "INSERT", description: "Inserts a parametric component (bridge, culvert, pier…)", category: "utility" },
  { alias: "AUDIT", commandName: "AUDIT", description: "Runs the GAD audit", category: "utility" },
  { alias: "PLOT", commandName: "PLOT", description: "Sheet preview and PDF plot", category: "utility" },
  { alias: "PUBLISH", commandName: "PLOT", description: "Sheet preview and PDF plot", category: "utility" },
  { alias: "DXFOUT", commandName: "DXFOUT", description: "Exports model space to DXF", category: "utility" },
  { alias: "PARAMETRIZE", commandName: "PARAMETRIZE", description: "Makes what you drew parametric: dimensions and levels become values", category: "utility" },
  { alias: "MAKEPARAM", commandName: "PARAMETRIZE", description: "Makes what you drew parametric: dimensions and levels become values", category: "utility" },
  { alias: "MP", commandName: "PARAMETRIZE", description: "Makes what you drew parametric: dimensions and levels become values", category: "utility" },
  { alias: "BEDIT", commandName: "BEDIT", description: "Turns the selected component back into editable geometry", category: "utility" },
  { alias: "EDITGEOM", commandName: "BEDIT", description: "Turns the selected component back into editable geometry", category: "utility" },

  // CAD Agent v2 Tools
  { alias: "AGENT", commandName: "CAD_AGENT", description: "Generates CAD drawing via CAD Agent v2", category: "utility" },
  { alias: "AI", commandName: "CAD_AGENT", description: "Generates CAD drawing via CAD Agent v2", category: "utility" },
  { alias: "DRAW", commandName: "CAD_AGENT", description: "Generates CAD drawing via CAD Agent v2", category: "utility" },
];

export class CadCommandRegistry {
  private static aliasMap: Map<string, CommandAlias> = new Map();

  static {
    for (const item of COMMAND_ALIASES) {
      this.aliasMap.set(item.alias.toUpperCase(), item);
    }
  }

  public static getCompletions(partial: string): CommandCompletion[] {
    const q = partial.trim().toUpperCase();
    if (!q) return [];

    const results: CommandCompletion[] = [];
    const seen = new Set<string>();

    for (const item of COMMAND_ALIASES) {
      if (item.alias.startsWith(q) || item.commandName.startsWith(q)) {
        if (!seen.has(item.commandName)) {
          seen.add(item.commandName);
          results.push(item);
        }
      }
    }

    return results.slice(0, 8);
  }

  public static execute(rawText: string, ctx: CadCommandContext): CommandExecutionResult {
    const { command, args } = parseCommandLine(rawText);
    if (!command) {
      return { success: true };
    }
    const argTokens = args ? args.split(/\s+/).filter(Boolean) : [];

    // Check if the input is a standalone coordinate entry while an interactive command might be awaiting points
    const coordCheck = parseCoordinateInput(rawText);
    if (coordCheck.type !== "invalid" && !this.aliasMap.has(command)) {
      const resolved = resolveCoordinate(coordCheck, ctx.lastPoint, ctx.cursorPos);
      if (resolved) {
        return {
          success: true,
          message: `Point entered: (${resolved.x.toFixed(2)}, ${resolved.y.toFixed(2)})`,
          nextPrompt: "Specify next point:",
        };
      }
    }

    const matched = this.aliasMap.get(command);
    if (!matched) {
      return {
        success: false,
        message: `Unknown command "${command}". Press '?' or type HELP for guide.`,
      };
    }

    switch (matched.commandName) {
      case "LINE":
        if (argTokens.length >= 2) {
          const c1 = parseCoordinateInput(argTokens[0]);
          const p1 = resolveCoordinate(c1, null, null);
          const c2 = parseCoordinateInput(argTokens[1]);
          const p2 = resolveCoordinate(c2, p1, null);
          if (p1 && p2) {
            const style = ctx.state?.currentStyle;
            const newShape: LineShape = {
              id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: "line",
              x1: p1.x,
              y1: p1.y,
              x2: p2.x,
              y2: p2.y,
              strokeColor: style?.strokeColor ?? "#38bdf8",
              strokeWidth: style?.strokeWidth ?? 2,
              opacity: style?.opacity ?? 1,
            };
            ctx.dispatch({ type: "ADD_SHAPE", shape: newShape });
            return {
              success: true,
              message: `LINE created from (${p1.x}, ${p1.y}) to (${p2.x}, ${p2.y})`,
            };
          }
        }
        ctx.setTool("line");
        return {
          success: true,
          activeCommand: "LINE",
          message: "LINE: Specify first point or drag on canvas",
          nextPrompt: "Specify first point:",
          awaitingInput: "point",
        };

      case "PLINE":
        ctx.setTool("polyline");
        return {
          success: true,
          activeCommand: "PLINE",
          message: "PLINE: Specify start point",
          nextPrompt: "Specify start point:",
          awaitingInput: "point",
        };

      case "RECTANGLE":
        if (argTokens.length >= 2) {
          const c1 = parseCoordinateInput(argTokens[0]);
          const p1 = resolveCoordinate(c1, null, null);
          const c2 = parseCoordinateInput(argTokens[1]);
          const p2 = resolveCoordinate(c2, p1, null);
          if (p1 && p2) {
            const minX = Math.min(p1.x, p2.x);
            const minY = Math.min(p1.y, p2.y);
            const w = Math.abs(p2.x - p1.x);
            const h = Math.abs(p2.y - p1.y);
            const style = ctx.state?.currentStyle;
            const newShape: RectangleShape = {
              id: `rect_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: "rectangle",
              x: minX,
              y: minY,
              width: w,
              height: h,
              strokeColor: style?.strokeColor ?? "#38bdf8",
              strokeWidth: style?.strokeWidth ?? 2,
              fillColor: style?.fillColor ?? "transparent",
              opacity: style?.opacity ?? 1,
              rotation: 0,
            };
            ctx.dispatch({ type: "ADD_SHAPE", shape: newShape });
            return {
              success: true,
              message: `RECTANGLE created: (${minX}, ${minY}) ${w}x${h}mm`,
            };
          }
        }
        ctx.setTool("rect");
        return {
          success: true,
          activeCommand: "RECTANGLE",
          message: "RECTANGLE: Specify first corner point or [Dimensions]",
          nextPrompt: "Specify other corner point:",
          awaitingInput: "point",
        };

      case "CIRCLE":
        if (argTokens.length >= 2) {
          const c1 = parseCoordinateInput(argTokens[0]);
          const p1 = resolveCoordinate(c1, null, null);
          const radius = parseFloat(argTokens[1]);
          if (p1 && !isNaN(radius) && radius > 0) {
            const style = ctx.state?.currentStyle;
            const newShape: CircleShape = {
              id: `circle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: "circle",
              cx: p1.x,
              cy: p1.y,
              r: radius,
              strokeColor: style?.strokeColor ?? "#38bdf8",
              strokeWidth: style?.strokeWidth ?? 2,
              fillColor: style?.fillColor ?? "transparent",
              opacity: style?.opacity ?? 1,
              rotation: 0,
            };
            ctx.dispatch({ type: "ADD_SHAPE", shape: newShape });
            return {
              success: true,
              message: `CIRCLE created at (${p1.x}, ${p1.y}) r=${radius}mm`,
            };
          }
        }
        ctx.setTool("circle");
        return {
          success: true,
          activeCommand: "CIRCLE",
          message: "CIRCLE: Specify center point for circle",
          nextPrompt: "Specify radius of circle:",
          awaitingInput: "distance",
        };

      case "ARC":
        ctx.setTool("arc");
        return {
          success: true,
          activeCommand: "ARC",
          message: "ARC: Specify start point of arc or [Center]",
          nextPrompt: "Specify second point of arc:",
          awaitingInput: "point",
        };

      case "POLYGON":
        ctx.setTool("polygon");
        return {
          success: true,
          activeCommand: "POLYGON",
          message: "POLYGON: Click vertices on canvas, double click to close",
          nextPrompt: "Specify vertex:",
          awaitingInput: "point",
        };

      case "ELLIPSE":
        ctx.setTool("ellipse");
        return {
          success: true,
          activeCommand: "ELLIPSE",
          message: "ELLIPSE: Drag bounding radius on canvas",
          nextPrompt: "Specify endpoint of axis:",
          awaitingInput: "point",
        };

      case "MOVE":
        ctx.setTool("move");
        return {
          success: true,
          activeCommand: "MOVE",
          message: "MOVE: Specify base point or displacement vector",
          nextPrompt: "Specify base point:",
          awaitingInput: "point",
        };

      case "COPY":
        ctx.setTool("copy");
        return { success: true, activeCommand: "COPY", message: "COPY: pick the base point, then destinations", awaitingInput: "point" };

      case "TEXT":
      case "LEADER":
      case "DIMLINEAR":
      case "DIMALIGNED":
      case "DIMRADIUS":
      case "DIMANGULAR":
      case "LEVEL":
      case "HATCH":
      case "NORTH":
      case "FLOW":
      case "KILOMETRAGE":
      case "SECTIONMARK":
      case "REVCLOUD":
      case "BREAK":
      case "JOIN":
      case "EXPLODE": {
        const tool = ({ SECTIONMARK: "section" } as Record<string, string>)[matched.commandName] ?? matched.commandName.toLowerCase();
        ctx.setTool(tool);
        return { success: true, activeCommand: matched.commandName, message: `${matched.commandName}: follow the prompt at the top of the drawing` };
      }

      case "LAYER":
      case "INSERT":
      case "AUDIT":
      case "PLOT":
      case "PARAMETRIZE":
      case "BEDIT":
      case "OPEN":
      case "NEW":
      case "SAVE":
      case "SAVEAS":
      case "DXFOUT": {
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cad:open", { detail: matched.commandName }));
        return { success: true, message: matched.description };
      }

      case "ROTATE":
        ctx.setTool("rotate");
        return {
          success: true,
          activeCommand: "ROTATE",
          message: "ROTATE: Specify base point and rotation angle",
          nextPrompt: "Specify rotation angle:",
          awaitingInput: "distance",
        };

      case "SCALE":
        ctx.setTool("select");
        return {
          success: true,
          message: "SCALE: Drag corner handles or edit nominal dimensions in panel",
        };

      case "TRIM":
        ctx.setTool("trim");
        return {
          success: true,
          activeCommand: "TRIM",
          message: "TRIM: Click segment between intersections to trim",
          nextPrompt: "Select object to trim:",
          awaitingInput: "option",
        };

      case "EXTEND":
        ctx.setTool("extend");
        return {
          success: true,
          activeCommand: "EXTEND",
          message: "EXTEND: Click line segment toward boundary to extend",
          nextPrompt: "Select object to extend:",
          awaitingInput: "option",
        };

      case "OFFSET":
        ctx.setTool("offset");
        return {
          success: true,
          activeCommand: "OFFSET",
          message: "OFFSET: Specify offset distance in mm",
          nextPrompt: "Specify offset distance:",
          awaitingInput: "distance",
        };

      case "FILLET":
        ctx.setTool("fillet");
        return {
          success: true,
          activeCommand: "FILLET",
          message: "FILLET: Select first object or specify radius",
          nextPrompt: "Select first object:",
          awaitingInput: "option",
        };

      case "CHAMFER":
        ctx.setTool("chamfer");
        return {
          success: true,
          activeCommand: "CHAMFER",
          message: "CHAMFER: Select first line or specify distance",
          nextPrompt: "Select first line:",
          awaitingInput: "option",
        };

      case "MIRROR":
        ctx.setTool("mirror");
        return {
          success: true,
          activeCommand: "MIRROR",
          message: "MIRROR: Specify first point of mirror line",
          nextPrompt: "Specify first point of mirror line:",
          awaitingInput: "point",
        };

      case "ARRAY":
        ctx.setTool("array");
        return {
          success: true,
          activeCommand: "ARRAY",
          message: "ARRAY: Specify count and spacing",
          nextPrompt: "Enter number of items:",
          awaitingInput: "distance",
        };

      case "ERASE":
        ctx.dispatch({ type: "DELETE_SELECTED" });
        ctx.notify?.({ text: "Erased selected entities", type: "info" });
        return {
          success: true,
          message: "ERASE: Removed selected entities",
        };

      case "GROUP":
        ctx.dispatch({ type: "GROUP_SELECTED" });
        return { success: true, message: "GROUP: Objects grouped" };

      case "UNGROUP":
        ctx.dispatch({ type: "UNGROUP_SELECTED" });
        return { success: true, message: "UNGROUP: Objects ungrouped" };

      case "DIST":
        ctx.setTool("measure");
        return {
          success: true,
          activeCommand: "DIST",
          message: "DIST: Specify first point to measure",
          nextPrompt: "Specify first point:",
          awaitingInput: "point",
        };

      case "ZOOM":
        ctx.dispatch({ type: "ZOOM_EXTENTS" });
        return { success: true, message: "ZOOM: Extents — all entities framed" };

      case "PAN":
        ctx.setTool("pan");
        return { success: true, message: "PAN: Click and drag canvas to pan" };

      case "UNDO":
        ctx.undo();
        return { success: true, message: "UNDO: Reverted last action" };

      case "REDO":
        ctx.redo();
        return { success: true, message: "REDO: Restored action" };

      case "CLEAR":
        if (confirm("Clear all canvas shapes?")) {
          ctx.clearAll();
          return { success: true, message: "Canvas cleared" };
        }
        return { success: true, message: "Clear cancelled" };

      case "TEMPLATES":
        ctx.openTemplates?.();
        return { success: true, message: "Opened parametric template catalog" };

      case "ORTHO":
        ctx.dispatch({ type: "TOGGLE_ORTHO" });
        return { success: true, message: `ORTHO: ${ctx.state ? (!ctx.state.orthoEnabled ? "ON" : "OFF") : "TOGGLED"}` };

      case "POLAR":
        ctx.dispatch({ type: "TOGGLE_POLAR_TRACKING" });
        return { success: true, message: `POLAR TRACKING: ${ctx.state ? (!ctx.state.polarTrackingEnabled ? "ON" : "OFF") : "TOGGLED"}` };

      case "OSNAP":
        ctx.dispatch({ type: "TOGGLE_OBJECT_SNAP" });
        return { success: true, message: `OBJECT SNAP: ${ctx.state ? (!ctx.state.objectSnapEnabled ? "ON" : "OFF") : "TOGGLED"}` };

      case "GRID":
        ctx.dispatch({ type: "TOGGLE_GRID" });
        return { success: true, message: `GRID: ${ctx.state ? (!ctx.state.showGrid ? "ON" : "OFF") : "TOGGLED"}` };

      case "SNAP":
        ctx.dispatch({ type: "TOGGLE_GRID_SNAP" });
        return { success: true, message: `SNAP: ${ctx.state ? (!ctx.state.gridSnapEnabled ? "ON" : "OFF") : "TOGGLED"}` };

      case "DYNAMIC_INPUT":
        ctx.dispatch({ type: "TOGGLE_DYNAMIC_INPUT" });
        return { success: true, message: `DYNAMIC INPUT: ${ctx.state ? (!ctx.state.dynamicInputEnabled ? "ON" : "OFF") : "TOGGLED"}` };

      case "HELP":
        ctx.openHelp?.();
        return { success: true, message: "Opened Instruction Manual" };

      case "IMPORTDXF":
        if (ctx.openDxfImport) {
          ctx.openDxfImport();
          return { success: true, message: "Opening AutoCAD DXF import..." };
        }
        return { success: false, message: "DXF import handler not available" };

      case "CAD_AGENT": {
        const promptText = args?.trim();
        if (!promptText) {
          return { success: false, message: "Usage: AGENT <drawing description>" };
        }
        fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: promptText }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.shapes) {
              ctx.dispatch({ type: "LOAD_SHAPES", shapes: data.shapes });
              ctx.notify?.({
                text: `CAD Agent v2: Rendered ${data.shapes.length} CAD entities`,
                type: "success",
              });
            } else if (data.error) {
              ctx.notify?.({ text: `CAD Agent error: ${data.error}`, type: "error" });
            }
          })
          .catch((err) => {
            ctx.notify?.({ text: `CAD Agent failed: ${err.message}`, type: "error" });
          });

        return {
          success: true,
          message: `CAD Agent v2 processing: "${promptText}"...`,
        };
      }

      case "SELECT":
      default:
        ctx.setTool("select");
        ctx.dispatch({ type: "SELECT", id: null });
        return { success: true, message: "Command cancelled" };
    }
  }
}
