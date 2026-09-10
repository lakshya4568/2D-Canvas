/**
 * AutoCAD-Style Coordinate & Command Grammar Parser
 * UPCE-MASTER-1.0 §3, §86
 *
 * Supports:
 *   - Absolute Cartesian:   `X,Y` (e.g., `100,200`)
 *   - Relative Cartesian:   `@dX,dY` (e.g., `@50,-30`)
 *   - Polar:                `Dist<Angle` (e.g., `100<45`)
 *   - Relative Polar:       `@Dist<Angle` (e.g., `@100<45`)
 *   - Direct Distance:      `Distance` (e.g., `150`)
 */

import { Point } from "../geometry/types";
import { CoordinateParseResult } from "./types";

export function parseCoordinateInput(input: string): CoordinateParseResult {
  const s = input.trim();
  if (!s) {
    return { type: "invalid", error: "Empty input" };
  }

  // 1. Relative Polar: @Dist<Angle
  const relPolarMatch = s.match(/^@\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*<\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)$/);
  if (relPolarMatch) {
    const dist = parseFloat(relPolarMatch[1]);
    const angleDeg = parseFloat(relPolarMatch[2]);
    if (!Number.isNaN(dist) && !Number.isNaN(angleDeg)) {
      return { type: "relative_polar", dist, angleDeg };
    }
  }

  // 2. Polar: Dist<Angle
  const polarMatch = s.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*<\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)$/);
  if (polarMatch) {
    const dist = parseFloat(polarMatch[1]);
    const angleDeg = parseFloat(polarMatch[2]);
    if (!Number.isNaN(dist) && !Number.isNaN(angleDeg)) {
      return { type: "polar", dist, angleDeg };
    }
  }

  // 3. Relative Cartesian: @dX,dY
  const relCartMatch = s.match(/^@\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)$/);
  if (relCartMatch) {
    const dx = parseFloat(relCartMatch[1]);
    const dy = parseFloat(relCartMatch[2]);
    if (!Number.isNaN(dx) && !Number.isNaN(dy)) {
      return { type: "relative", dx, dy };
    }
  }

  // 4. Absolute Cartesian: X,Y
  const absCartMatch = s.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*,\s*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)$/);
  if (absCartMatch) {
    const x = parseFloat(absCartMatch[1]);
    const y = parseFloat(absCartMatch[2]);
    if (!Number.isNaN(x) && !Number.isNaN(y)) {
      return { type: "absolute", x, y };
    }
  }

  // 5. Direct Distance Entry: Pure scalar number
  const distMatch = s.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)$/);
  if (distMatch) {
    const dist = parseFloat(distMatch[1]);
    if (!Number.isNaN(dist)) {
      return { type: "distance", dist };
    }
  }

  return { type: "invalid", error: `Unrecognized coordinate syntax: "${s}"` };
}

/**
 * Resolves a parsed coordinate into absolute 2D world coordinates.
 *
 * @param parsed The coordinate parse result
 * @param basePoint Base anchor point for relative coordinates or distance entry
 * @param cursorPoint Current cursor position (used for direction in direct distance entry)
 */
export function resolveCoordinate(
  parsed: CoordinateParseResult,
  basePoint: Point | null = null,
  cursorPoint: Point | null = null
): Point | null {
  if (parsed.type === "invalid") return null;

  if (parsed.type === "absolute") {
    return { x: parsed.x, y: parsed.y };
  }

  const base = basePoint ?? { x: 0, y: 0 };

  if (parsed.type === "relative") {
    return { x: base.x + parsed.dx, y: base.y + parsed.dy };
  }

  if (parsed.type === "polar" || parsed.type === "relative_polar") {
    // In CAD standard, 0° is East (+X), 90° is North (-Y in SVG screen coords)
    const rad = (parsed.angleDeg * Math.PI) / 180;
    const dx = parsed.dist * Math.cos(rad);
    const dy = -parsed.dist * Math.sin(rad); // invert for standard screen Cartesian orientation
    return { x: base.x + dx, y: base.y + dy };
  }

  if (parsed.type === "distance") {
    if (cursorPoint && (cursorPoint.x !== base.x || cursorPoint.y !== base.y)) {
      const vx = cursorPoint.x - base.x;
      const vy = cursorPoint.y - base.y;
      const len = Math.hypot(vx, vy);
      if (len > 1e-9) {
        const ux = vx / len;
        const uy = vy / len;
        return { x: base.x + ux * parsed.dist, y: base.y + uy * parsed.dist };
      }
    }
    // Fallback if no direction available: displace along +X
    return { x: base.x + parsed.dist, y: base.y };
  }

  return null;
}

/**
 * Parses a raw command string into command name and argument payload.
 * Examples:
 *   "L"               -> { command: "L", args: "" }
 *   "LINE 100,200"    -> { command: "LINE", args: "100,200" }
 *   "REC @50,30"      -> { command: "REC", args: "@50,30" }
 */
export function parseCommandLine(raw: string): { command: string; args: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { command: "", args: "" };

  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) {
    return { command: trimmed.toUpperCase(), args: "" };
  }

  const command = trimmed.slice(0, firstSpace).toUpperCase();
  const args = trimmed.slice(firstSpace + 1).trim();
  return { command, args };
}
