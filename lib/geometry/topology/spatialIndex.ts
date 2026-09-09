import { Point2D } from "./types";

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpatialItem<T = unknown> {
  id: string;
  box: BoundingBox2D;
  data: T;
}

export function doBoxesOverlap(a: BoundingBox2D, b: BoundingBox2D): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY
  );
}

export function pointInBox(pt: Point2D, b: BoundingBox2D): boolean {
  return pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY;
}

export function pointDistanceToBox(pt: Point2D, b: BoundingBox2D): number {
  const dx = Math.max(0, Math.max(b.minX - pt.x, pt.x - b.maxX));
  const dy = Math.max(0, Math.max(b.minY - pt.y, pt.y - b.maxY));
  return Math.hypot(dx, dy);
}

/**
 * PlanarSet provides an efficient broad-phase 2D spatial index for vertices, segments, and shapes.
 * Uses an adaptive spatial partitioning hash grid for O(1) amortized queries and pair candidate generation.
 */
export class PlanarSet<T = unknown> {
  private cellSize: number;
  private items = new Map<string, SpatialItem<T>>();
  private grid = new Map<string, Set<string>>();

  constructor(cellSize: number = 20.0) {
    this.cellSize = cellSize > 0 ? cellSize : 20.0;
  }

  private cellCoord(val: number): number {
    return Math.floor(val / this.cellSize);
  }

  private getKey(gx: number, gy: number): string {
    return `${gx},${gy}`;
  }

  private getCellRange(box: BoundingBox2D): { minGx: number; maxGx: number; minGy: number; maxGy: number } {
    return {
      minGx: this.cellCoord(box.minX),
      maxGx: this.cellCoord(box.maxX),
      minGy: this.cellCoord(box.minY),
      maxGy: this.cellCoord(box.maxY),
    };
  }

  public size(): number {
    return this.items.size;
  }

  public clear(): void {
    this.items.clear();
    this.grid.clear();
  }

  public insert(id: string, box: BoundingBox2D, data: T): void {
    if (this.items.has(id)) {
      this.remove(id);
    }

    const item: SpatialItem<T> = { id, box, data };
    this.items.set(id, item);

    const { minGx, maxGx, minGy, maxGy } = this.getCellRange(box);
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const key = this.getKey(gx, gy);
        let cell = this.grid.get(key);
        if (!cell) {
          cell = new Set<string>();
          this.grid.set(key, cell);
        }
        cell.add(id);
      }
    }
  }

  public remove(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;

    const { minGx, maxGx, minGy, maxGy } = this.getCellRange(item.box);
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const key = this.getKey(gx, gy);
        const cell = this.grid.get(key);
        if (cell) {
          cell.delete(id);
          if (cell.size === 0) {
            this.grid.delete(key);
          }
        }
      }
    }

    this.items.delete(id);
    return true;
  }

  public get(id: string): SpatialItem<T> | undefined {
    return this.items.get(id);
  }

  public getAll(): SpatialItem<T>[] {
    return Array.from(this.items.values());
  }

  /**
   * Queries all items whose bounding box intersects queryBox.
   */
  public query(queryBox: BoundingBox2D): SpatialItem<T>[] {
    const { minGx, maxGx, minGy, maxGy } = this.getCellRange(queryBox);
    const candidateIds = new Set<string>();

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const cell = this.grid.get(this.getKey(gx, gy));
        if (cell) {
          for (const id of cell) {
            candidateIds.add(id);
          }
        }
      }
    }

    const results: SpatialItem<T>[] = [];
    for (const id of candidateIds) {
      const item = this.items.get(id)!;
      if (doBoxesOverlap(item.box, queryBox)) {
        results.push(item);
      }
    }

    return results;
  }

  /**
   * Queries all items within radius of point pt.
   */
  public queryPoint(pt: Point2D, radius: number): SpatialItem<T>[] {
    const queryBox: BoundingBox2D = {
      minX: pt.x - radius,
      minY: pt.y - radius,
      maxX: pt.x + radius,
      maxY: pt.y + radius,
    };

    const candidates = this.query(queryBox);
    const results: SpatialItem<T>[] = [];
    const radSq = radius * radius;

    for (const item of candidates) {
      const dist = pointDistanceToBox(pt, item.box);
      if (dist <= radius) {
        results.push(item);
      }
    }

    return results;
  }

  /**
   * Finds all candidate pairs of items with overlapping bounding boxes (broad-phase).
   */
  public allCandidateOverlaps(): Array<[SpatialItem<T>, SpatialItem<T>]> {
    const checkedPairs = new Set<string>();
    const overlaps: Array<[SpatialItem<T>, SpatialItem<T>]> = [];

    for (const cell of this.grid.values()) {
      if (cell.size < 2) continue;
      const ids = Array.from(cell);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const idA = ids[i] < ids[j] ? ids[i] : ids[j];
          const idB = ids[i] < ids[j] ? ids[j] : ids[i];
          const pairKey = `${idA}::${idB}`;

          if (!checkedPairs.has(pairKey)) {
            checkedPairs.add(pairKey);
            const itemA = this.items.get(idA)!;
            const itemB = this.items.get(idB)!;
            if (doBoxesOverlap(itemA.box, itemB.box)) {
              overlaps.push([itemA, itemB]);
            }
          }
        }
      }
    }

    return overlaps;
  }
}
