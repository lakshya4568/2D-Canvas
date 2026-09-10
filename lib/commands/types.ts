/**
 * CAD Command Engine Types
 * AutoCAD-compatible command grammar and prompt execution interfaces.
 * UPCE-MASTER-1.0 §3, §46, §66
 */

import { Point, Shape } from "../geometry/types";
import { DrawingState } from "../state/drawingReducer";

export type CoordinateParseResult =
  | { type: "absolute"; x: number; y: number }
  | { type: "relative"; dx: number; dy: number }
  | { type: "polar"; dist: number; angleDeg: number }
  | { type: "relative_polar"; dist: number; angleDeg: number }
  | { type: "distance"; dist: number }
  | { type: "invalid"; error: string };

export interface CommandAlias {
  alias: string;
  commandName: string;
  description: string;
  category: "draw" | "modify" | "dimension" | "view" | "utility";
}

export interface CommandCompletion {
  alias: string;
  commandName: string;
  description: string;
  category: string;
}

export interface CadCommandContext {
  state?: DrawingState;
  shapes: Shape[];
  selectedIds: string[];
  lastPoint: Point | null;
  cursorPos: Point | null;
  dispatch: (action: any) => void;
  setTool: (tool: any) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  openHelp?: () => void;
  openTemplates?: () => void;
  notify?: (msg: { text: string; type: "success" | "error" | "info" }) => void;
}

export interface CommandExecutionResult {
  success: boolean;
  message?: string;
  nextPrompt?: string;
  activeCommand?: string;
  awaitingInput?: "point" | "distance" | "option" | null;
}
