import { Point2D, DcelVertex } from "./types";

/**
 * SpatialHashGrid provides O(1) amortized geometric vertex welding.
 * It hashes 2D points into grid cells and checks the 9 adjacent neighbor cells.
 */
export class SpatialHashGrid {
  private cellSize: number;
  private grid = new Map<string, DcelVertex[]>();
  private vertexCount = 0;

  constructor(cellSize: number = 1e-4) {
    this.cellSize = cellSize > 0 ? cellSize : 1e-4;
  }

  private getKey(x: number, y: number): string {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    return `${gx},${gy}`;
  }

  public size(): number {
    return this.vertexCount;
  }

  public clear(): void {
    this.grid.clear();
    this.vertexCount = 0;
  }

  /**
   * Finds an existing vertex within Euclidean distance tolerance.
   */
  public findNearby(pt: Point2D, tolerance: number): DcelVertex | null {
    const tolSq = tolerance * tolerance;
    const minGx = Math.floor((pt.x - tolerance) / this.cellSize);
    const maxGx = Math.floor((pt.x + tolerance) / this.cellSize);
    const minGy = Math.floor((pt.y - tolerance) / this.cellSize);
    const maxGy = Math.floor((pt.y + tolerance) / this.cellSize);

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const cell = this.grid.get(`${gx},${gy}`);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const v = cell[i];
          const dx = v.point.x - pt.x;
          const dy = v.point.y - pt.y;
          if (dx * dx + dy * dy <= tolSq) {
            return v;
          }
        }
      }
    }
    return null;
  }

  /**
   * Inserts a point or returns an existing welded vertex if within tolerance.
   */
  public insertOrFind(pt: Point2D, tolerance: number = 1e-4): DcelVertex {
    const existing = this.findNearby(pt, tolerance);
    if (existing) {
      return existing;
    }

    const id = `v_${++this.vertexCount}`;
    const vertex: DcelVertex = {
      id,
      point: { x: pt.x, y: pt.y },
      incidentHalfEdge: null,
    };

    const key = this.getKey(pt.x, pt.y);
    const cell = this.grid.get(key);
    if (cell) {
      cell.push(vertex);
    } else {
      this.grid.set(key, [vertex]);
    }

    return vertex;
  }
}
