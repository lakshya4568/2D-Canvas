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
        ctx.setTool("rect");
        return {
          success: true,
          activeCommand: "RECTANGLE",
          message: "RECTANGLE: Specify first corner point or [Dimensions]",
          nextPrompt: "Specify other corner point:",
          awaitingInput: "point",
        };

      case "CIRCLE":
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
        ctx.dispatch({ type: "DUPLICATE_SELECTED" });
        ctx.notify?.({ text: "Duplicated selected entities", type: "success" });
        return {
          success: true,
          message: "COPIED: Duplicated selection with 20mm offset",
        };

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
        ctx.dispatch({ type: "RESET_VIEWPORT" });
        return { success: true, message: "ZOOM: View reset to extents" };

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

      case "HELP":
        ctx.openHelp?.();
        return { success: true, message: "Opened Instruction Manual" };

      case "SELECT":
      default:
        ctx.setTool("select");
        ctx.dispatch({ type: "SELECT", id: null });
        return { success: true, message: "Command cancelled" };
    }
  }
}
