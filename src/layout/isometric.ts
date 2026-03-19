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

// Mutable isometric projection — stored on globalThis to survive HMR
// tilt: 5° ≈ bird's-eye, 27° = standard iso (default), 45° = steep
// rotation: 0° = default, rotates view around vertical axis
interface IsoState {
  tilt: number; cosT: number; sinT: number
  rot: number; cosR: number; sinR: number
}
const g = globalThis as unknown as { __isoState?: IsoState }
if (!g.__isoState) {
  const tilt = 26.57
  const tRad = tilt * Math.PI / 180
  g.__isoState = { tilt, cosT: Math.cos(tRad), sinT: Math.sin(tRad), rot: 0, cosR: 1, sinR: 0 }
}
const isoState = g.__isoState

export function setIsoAngle(degrees: number): void {
  isoState.tilt = Math.max(5, Math.min(90, degrees))
  const rad = isoState.tilt * Math.PI / 180
  isoState.cosT = Math.cos(rad)
  isoState.sinT = Math.sin(rad)
}

export function getIsoAngle(): number {
  return isoState.tilt
}

export function setIsoRotation(degrees: number): void {
  isoState.rot = ((degrees % 360) + 360) % 360
  const rad = isoState.rot * Math.PI / 180
  isoState.cosR = Math.cos(rad)
  isoState.sinR = Math.sin(rad)
}

export function getIsoRotation(): number {
  return isoState.rot
}

export function toIsometric(p: Point3D): IsoPoint {
  // Rotate around z-axis, then project
  const rx = p.x * isoState.cosR - p.y * isoState.sinR
  const ry = p.x * isoState.sinR + p.y * isoState.cosR
  return {
    sx: Math.round((rx - ry) * isoState.cosT),
    sy: Math.round((rx + ry) * isoState.sinT - p.z),
  }
}

export function fromIsometric(screen: IsoPoint, z = 0): Point3D {
  const adjustedSy = screen.sy + z
  const rx_plus_ry = adjustedSy / isoState.sinT
  const rx_minus_ry = screen.sx / isoState.cosT
  const rx = (rx_plus_ry + rx_minus_ry) / 2
  const ry = (rx_plus_ry - rx_minus_ry) / 2
  // Inverse rotation
  return {
    x: rx * isoState.cosR + ry * isoState.sinR,
    y: -rx * isoState.sinR + ry * isoState.cosR,
    z,
  }
}

/** Isometric depth value — higher = further from camera = draw first */
export function isoDepth(p: Point3D): number {
  const rx = p.x * isoState.cosR - p.y * isoState.sinR
  const ry = p.x * isoState.sinR + p.y * isoState.cosR
  return (rx + ry) * isoState.sinT - p.z * isoState.cosT
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
  constant:   { w: 0.6, h: 0.5, d: 0.06 },
  connector:  { w: 1, h: 0.6, d: 0.3 },
  comparator: { w: 1, h: 1, d: 0.3 },
  latch:      { w: 1.2, h: 1, d: 0.4 },
  'named-wire': { w: 0.8, h: 0.5, d: 0.06 },
}

export function getCompSize(kind: string): { w: number; h: number; d: number } {
  return COMP_SIZES[kind] ?? { w: 1, h: 1, d: 0.3 }
}

const MIN_W = 60
const MIN_H = 40
const MIN_D = 15
const PIN_GAP = 8

// Flat component kinds — rendered as surface-level tags, not 3D buildings
const FLAT_KINDS: Set<string> = new Set(['constant', 'named-wire'])

/** Compute component size in world units based on pin type shapes */
export function computeCompSize(comp: Component): { w: number; h: number; d: number } {
  const inputUnits = comp.inputPins.reduce((sum, p) => sum + p.typeShape.units, 0)
  const outputUnits = comp.outputPins.reduce((sum, p) => sum + p.typeShape.units, 0)

  // Flat components: thin surface markers, not buildings
  if (FLAT_KINDS.has(comp.kind)) {
    const base = getCompSize(comp.kind)
    return { w: base.w * CELL_W, h: base.h * CELL_H, d: base.d * CELL_H }
  }

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
