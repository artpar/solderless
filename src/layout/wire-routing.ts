// Manhattan routing for wires with crossing minimization

import { Wire, CircuitBoard } from '../analysis/circuit-ir'
import { PlacedComponent } from './placement'
import { Point3D, CELL_W, CELL_H, UNIT_SIZE } from './isometric'

export interface RoutedWire {
  wire: Wire
  points: Point3D[] // 3D world-space path, projected at render time
  layer: 'data' | 'control' | 'exception'
}

export interface RoutingResult {
  wires: RoutedWire[]
}

export function routeWires(
  board: CircuitBoard,
  placed: PlacedComponent[],
): RoutingResult {
  const pinPositions = buildPinPositions(placed)
  const routed: RoutedWire[] = []

  // Sort wires by kind for layered routing
  const sortedWires = [...board.wires].sort((a, b) => {
    const order = { data: 0, control: 1, exception: 2 }
    return (order[a.kind] ?? 0) - (order[b.kind] ?? 0)
  })

  // Layer offsets to separate wire types visually (added to component z)
  const layerZOffset: Record<string, number> = {
    data: 0,
    control: 5,
    exception: 10,
  }

  for (const wire of sortedWires) {
    const srcPos = pinPositions.get(wire.sourcePin)
    const tgtPos = pinPositions.get(wire.targetPin)

    if (!srcPos || !tgtPos) continue

    const zOffset = layerZOffset[wire.kind] ?? 0

    const points = manhattanRoute(
      { x: srcPos.x, y: srcPos.y, z: srcPos.z + zOffset },
      { x: tgtPos.x, y: tgtPos.y, z: tgtPos.z + zOffset },
    )

    routed.push({
      wire,
      points,
      layer: wire.kind === 'data' ? 'data' : wire.kind === 'control' ? 'control' : 'exception',
    })
  }

  // Also route clock line segments as control wires
  for (const seg of board.clockLine) {
    if (!seg.from || !seg.to) continue

    const fromComp = placed.find((p) => p.component.id === seg.from)
    const toComp = placed.find((p) => p.component.id === seg.to)
    if (!fromComp || !toComp) continue

    const zOffset = layerZOffset.control
    const srcZ = fromComp.worldZ + fromComp.depth + zOffset
    const tgtZ = toComp.worldZ + toComp.depth + zOffset
    const srcX = fromComp.worldX + fromComp.width
    const srcY = fromComp.worldY + fromComp.height / 2
    const tgtX = toComp.worldX
    const tgtY = toComp.worldY + toComp.height / 2

    const points = manhattanRoute(
      { x: srcX, y: srcY, z: srcZ },
      { x: tgtX, y: tgtY, z: tgtZ },
    )

    routed.push({
      wire: {
        id: `clock_${seg.from}_${seg.to}`,
        kind: 'control',
        sourcePin: seg.from,
        targetPin: seg.to,
        isLive: true,
      },
      points,
      layer: 'control',
    })
  }

  return { wires: routed }
}

const TYPE_BLOCK_PROTRUSION = 12
const TYPE_PIN_GAP = 8

function buildPinPositions(
  placed: PlacedComponent[],
): Map<string, { x: number; y: number; z: number }> {
  const positions = new Map<string, { x: number; y: number; z: number }>()

  for (const pc of placed) {
    const comp = pc.component
    const pinZ = pc.worldZ + pc.depth  // pins sit on top of the component

    // Input pins — type block stacking, centered on component height
    setPinPositionsForSide(positions, comp.inputPins, pc, pinZ, 'input')

    // Output pins — type block stacking, centered on component height
    setPinPositionsForSide(positions, comp.outputPins, pc, pinZ, 'output')
  }

  return positions
}

function setPinPositionsForSide(
  positions: Map<string, { x: number; y: number; z: number }>,
  pins: import('../analysis/circuit-ir').Pin[],
  pc: PlacedComponent,
  pinZ: number,
  side: 'input' | 'output',
): void {
  if (pins.length === 0) return

  const totalUnits = pins.reduce((sum, p) => sum + p.typeShape.units, 0)
  const totalHeight = totalUnits * UNIT_SIZE + Math.max(0, pins.length - 1) * TYPE_PIN_GAP
  const startY = pc.worldY + (pc.height - totalHeight) / 2

  let curY = startY
  for (const pin of pins) {
    const blockH = Math.max(pin.typeShape.units * UNIT_SIZE, 4)
    const yCenter = curY + blockH / 2

    positions.set(pin.id, {
      x: side === 'input'
        ? pc.worldX - TYPE_BLOCK_PROTRUSION
        : pc.worldX + pc.width + TYPE_BLOCK_PROTRUSION,
      y: yCenter,
      z: pinZ,
    })

    curY += blockH + TYPE_PIN_GAP
  }
}

function manhattanRoute(src: Point3D, tgt: Point3D): Point3D[] {
  // Simple L-shaped routing: horizontal then vertical
  // For loop-backs (tgt.x < src.x), route around

  if (tgt.x >= src.x) {
    // Forward route: right then adjust Y
    const midX = (src.x + tgt.x) / 2
    // If crossing z-levels, interpolate z at the midpoint
    const midZ = (src.z + tgt.z) / 2
    return [
      src,
      { x: midX, y: src.y, z: midZ },
      { x: midX, y: tgt.y, z: midZ },
      tgt,
    ]
  }

  // Backward route (loop-back): go down/up, left, then to target
  const offset = CELL_H * 1.5
  const midZ = (src.z + tgt.z) / 2
  return [
    src,
    { x: src.x + CELL_W * 0.5, y: src.y, z: src.z },
    { x: src.x + CELL_W * 0.5, y: Math.max(src.y, tgt.y) + offset, z: midZ },
    { x: tgt.x - CELL_W * 0.5, y: Math.max(src.y, tgt.y) + offset, z: midZ },
    { x: tgt.x - CELL_W * 0.5, y: tgt.y, z: tgt.z },
    tgt,
  ]
}
