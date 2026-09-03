export interface Point2D {
  x: number;
  y: number;
}

export interface DcelVertex {
  id: string;
  point: Point2D;
  incidentHalfEdge: string | null;
}

export interface DcelHalfEdge {
  id: string;
  origin: string; // Origin vertex ID
  target: string; // Target vertex ID
  twin: string;   // Twin half-edge ID
  next: string;   // Next half-edge in cycle
  prev: string;   // Previous half-edge in cycle
  face: string | null; // Associated face ID
  edge: string;   // Parent undirected edge ID
  angle: number;  // Polar angle from origin to target in radians (-pi to pi)
}

export interface DcelEdge {
  id: string;
  halfEdge: string; // Pointer to one of the twin half-edges
}

export interface DcelFace {
  id: string;
  outerBoundary: string | null; // Starting half-edge ID of outer CCW boundary
  innerHoles: string[];         // Starting half-edge IDs of inner CW hole cycles
  area: number;                 // Signed Shoelace area (positive = CCW, negative = CW)
  isExterior: boolean;          // True if unbounded exterior face
}
