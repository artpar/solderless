// Cartesian ↔ Isometric projection (2:1 ratio)

export interface Point2D {
  x: number
  y: number
}

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface IsoPoint {
  sx: number // screen x
  sy: number // screen y
}

// 2:1 isometric projection
// x-axis goes right-down, y-axis goes left-down, z goes up
const ISO_ANGLE = Math.atan(0.5) // ~26.57°
const COS_A = Math.cos(ISO_ANGLE) // ~0.894
const SIN_A = Math.sin(ISO_ANGLE) // ~0.447

export function toIsometric(p: Point3D): IsoPoint {
  return {
    sx: (p.x - p.y) * COS_A,
    sy: (p.x + p.y) * SIN_A - p.z,
  }
}

export function fromIsometric(screen: IsoPoint, z = 0): Point3D {
  // Inverse of toIsometric (assumes known z)
  const adjustedSy = screen.sy + z
  const xPlusY = adjustedSy / SIN_A
  const xMinusY = screen.sx / COS_A
  return {
    x: (xPlusY + xMinusY) / 2,
    y: (xPlusY - xMinusY) / 2,
    z,
  }
}

/** Isometric depth value — higher = further from camera = draw first */
export function isoDepth(p: Point3D): number {
  return p.x + p.y - p.z
}

// Grid cell size in world units
export const CELL_W = 80
export const CELL_H = 80

// Component sizes in grid cells
export const COMP_SIZES: Record<string, { w: number; h: number; d: number }> = {
  gate:       { w: 1, h: 1, d: 0.3 },
  mux:        { w: 1, h: 1.5, d: 0.3 },
  demux:      { w: 1, h: 1.5, d: 0.3 },
  register:   { w: 1.2, h: 0.8, d: 0.4 },
  subcircuit: { w: 2, h: 1.5, d: 0.5 },
  'io-port':  { w: 1, h: 0.6, d: 0.2 },
  constant:   { w: 0.8, h: 0.6, d: 0.2 },
  connector:  { w: 1, h: 0.6, d: 0.3 },
  comparator: { w: 1, h: 1, d: 0.3 },
  latch:      { w: 1.2, h: 1, d: 0.4 },
  'named-wire': { w: 1, h: 0.6, d: 0.2 },
}

export function getCompSize(kind: string): { w: number; h: number; d: number } {
  return COMP_SIZES[kind] ?? { w: 1, h: 1, d: 0.3 }
}
