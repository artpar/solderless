import { Component, UNKNOWN_TYPE } from '../analysis/circuit-ir'

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
    sx: Math.round((p.x - p.y) * COS_A),
    sy: Math.round((p.x + p.y) * SIN_A - p.z),
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

// 1 type unit = 20 world units
export const UNIT_SIZE = 20

// Component sizes in grid cells (fallback for unresolved types)
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

const MIN_W = 60
const MIN_H = 40
const MIN_D = 15
const PIN_GAP = 8

/** Compute component size in world units based on pin type shapes */
export function computeCompSize(comp: Component): { w: number; h: number; d: number } {
  const inputUnits = comp.inputPins.reduce((sum, p) => sum + p.typeShape.units, 0)
  const outputUnits = comp.outputPins.reduce((sum, p) => sum + p.typeShape.units, 0)

  // Check if all pins are unknown type — fall back to fixed sizes
  const allUnknown = [...comp.inputPins, ...comp.outputPins].every(
    p => p.typeShape === UNKNOWN_TYPE || p.typeShape.tag === 'any'
  )
  if (allUnknown && comp.inputPins.length + comp.outputPins.length > 0) {
    const base = getCompSize(comp.kind)
    return { w: base.w * CELL_W, h: base.h * CELL_H, d: base.d * CELL_H }
  }

  const inputHeight = inputUnits * UNIT_SIZE + Math.max(0, comp.inputPins.length - 1) * PIN_GAP
  const outputHeight = outputUnits * UNIT_SIZE + Math.max(0, comp.outputPins.length - 1) * PIN_GAP

  const h = Math.max(inputHeight, outputHeight, MIN_H)
  const w = Math.max(MIN_W, h * 0.6)
  const maxUnits = Math.max(inputUnits, outputUnits, 1)
  const d = Math.max(MIN_D, maxUnits * 3)

  return { w, h, d }
}
