// Channel-based PCB-style wire routing

import { Wire, CircuitBoard } from '../analysis/circuit-ir'
import { PlacedComponent } from './placement'
import { Point3D, CELL_W, CELL_H, UNIT_SIZE } from './isometric'

export interface RoutedWire {
  wire: Wire
  points: Point3D[] // 3D world-space path, projected at render time
  layer: 'data' | 'control' | 'exception'
  /** If this wire is a bundled trunk, how many individual wires it represents */
  bundleCount?: number
  /** Label for bundled wires (e.g., "3 imports") */
  bundleLabel?: string
}

export interface RoutingResult {
  wires: RoutedWire[]
}

// --- Routing grid ---

interface RoutingGrid {
  columns: { left: number; right: number }[]
  channels: number[]          // X positions between adjacent columns
  boardTop: number
  boardBottom: number
  pinColumn: Map<string, number>  // pin ID → column index
  compColumn: Map<string, number> // component ID → column index
}

const LANE_SPACING = 8
const LANE_MARGIN = 20
const TYPE_BLOCK_PROTRUSION = 12
const TYPE_PIN_GAP = 8

/** Build a routing grid from placed components, scoped to a specific board's components */
function buildRoutingGrid(board: CircuitBoard, placed: PlacedComponent[]): RoutingGrid {
  // Only consider components that belong to this board's scope
  const boardCompIds = new Set(board.components.map(c => c.id))
  const scopedPlaced = placed.filter(pc => boardCompIds.has(pc.component.id))

  if (scopedPlaced.length === 0) {
    return { columns: [], channels: [], boardTop: 0, boardBottom: 0, pinColumn: new Map(), compColumn: new Map() }
  }

  // Group components into columns by X proximity.
  // Components whose X ranges overlap belong to the same column.
  const sorted = [...scopedPlaced].sort((a, b) => a.worldX - b.worldX)

  const columns: { left: number; right: number; compIds: Set<string> }[] = []

  for (const pc of sorted) {
    const left = pc.worldX
    const right = pc.worldX + pc.width

    // Try to merge into an existing column if X ranges overlap
    let merged = false
    for (const col of columns) {
      const overlap = Math.min(right, col.right) - Math.max(left, col.left)
      const minWidth = Math.min(right - left, col.right - col.left)
      // Merge if >50% overlap with smaller component, or within small gap
      if (overlap > minWidth * 0.5 || (left < col.right + 10 && right > col.left - 10 && overlap > 0)) {
        col.left = Math.min(col.left, left)
        col.right = Math.max(col.right, right)
        col.compIds.add(pc.component.id)
        merged = true
        break
      }
    }

    if (!merged) {
      columns.push({ left, right, compIds: new Set([pc.component.id]) })
    }
  }

  // Sort columns left to right
  columns.sort((a, b) => a.left - b.left)

  // Build channels between adjacent columns
  const channels: number[] = []
  for (let i = 0; i < columns.length - 1; i++) {
    channels.push((columns[i].right + columns[i + 1].left) / 2)
  }

  // Board extents — only from scoped components
  let boardTop = Infinity
  let boardBottom = -Infinity
  for (const pc of scopedPlaced) {
    boardTop = Math.min(boardTop, pc.worldY)
    boardBottom = Math.max(boardBottom, pc.worldY + pc.height)
  }

  // Map pin IDs and component IDs to column indices
  const pinColumn = new Map<string, number>()
  const compColumn = new Map<string, number>()
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    for (const compId of columns[colIdx].compIds) {
      compColumn.set(compId, colIdx)
      const pc = scopedPlaced.find(p => p.component.id === compId)
      if (pc) {
        for (const pin of [...pc.component.inputPins, ...pc.component.outputPins]) {
          pinColumn.set(pin.id, colIdx)
        }
      }
    }
  }

  return {
    columns: columns.map(c => ({ left: c.left, right: c.right })),
    channels,
    boardTop,
    boardBottom,
    pinColumn,
    compColumn,
  }
}

// --- Channel-aware routing ---

function routeOnGrid(
  src: Point3D,
  tgt: Point3D,
  srcCol: number,
  tgtCol: number,
  grid: RoutingGrid,
  laneOffset: number,
): Point3D[] {
  const midZ = (src.z + tgt.z) / 2

  // Same column — short L-shape through nearest channel or direct
  if (srcCol === tgtCol) {
    if (Math.abs(src.x - tgt.x) < 2) {
      return [src, tgt]
    }
    // Use the channel to the right if it exists, otherwise left
    const chIdx = srcCol < grid.channels.length ? srcCol : srcCol - 1
    if (chIdx >= 0 && chIdx < grid.channels.length) {
      const chX = grid.channels[chIdx] + laneOffset
      return [
        src,
        { x: chX, y: src.y, z: midZ },
        { x: chX, y: tgt.y, z: midZ },
        tgt,
      ]
    }
    // Fallback: midpoint L-shape
    const midX = (src.x + tgt.x) / 2
    return [
      src,
      { x: midX, y: src.y, z: midZ },
      { x: midX, y: tgt.y, z: midZ },
      tgt,
    ]
  }

  // Adjacent columns (tgtCol = srcCol + 1) — 4-point L-shape through single channel
  if (tgtCol === srcCol + 1) {
    const chX = grid.channels[srcCol] + laneOffset
    return [
      src,
      { x: chX, y: src.y, z: midZ },
      { x: chX, y: tgt.y, z: midZ },
      tgt,
    ]
  }

  // Forward multi-hop (tgtCol > srcCol + 1) — 6-point path via horizontal lane above
  if (tgtCol > srcCol + 1) {
    const ch1 = grid.channels[srcCol] + laneOffset
    const ch2 = grid.channels[tgtCol - 1] + laneOffset
    const laneY = grid.boardTop - LANE_MARGIN - Math.abs(laneOffset) * 2
    return [
      src,
      { x: ch1, y: src.y, z: midZ },
      { x: ch1, y: laneY, z: midZ },
      { x: ch2, y: laneY, z: midZ },
      { x: ch2, y: tgt.y, z: midZ },
      tgt,
    ]
  }

  // Backward wires (tgtCol < srcCol) — route below the board
  // Use channel to the right of source (or left if at last column)
  const ch1Idx = Math.min(srcCol, grid.channels.length - 1)
  // Use channel to the left of target (or first channel if at col 0)
  const ch2Idx = Math.max(0, tgtCol - 1)
  const ch1 = ch1Idx >= 0 && ch1Idx < grid.channels.length
    ? grid.channels[ch1Idx] + laneOffset
    : src.x + 20
  const ch2 = ch2Idx >= 0 && ch2Idx < grid.channels.length
    ? grid.channels[ch2Idx] + laneOffset
    : tgt.x - 20
  const laneY = grid.boardBottom + LANE_MARGIN + Math.abs(laneOffset) * 2
  return [
    src,
    { x: ch1, y: src.y, z: midZ },
    { x: ch1, y: laneY, z: midZ },
    { x: ch2, y: laneY, z: midZ },
    { x: ch2, y: tgt.y, z: midZ },
    tgt,
  ]
}

// --- Lane assignment ---

interface PendingWire {
  wire: Wire
  src: Point3D
  tgt: Point3D
  srcCol: number
  tgtCol: number
  layer: 'data' | 'control' | 'exception'
}

/** Assign lane offsets to wires sharing the same channel */
function assignLaneOffsets(pending: PendingWire[]): Map<string, number> {
  // Group wires by their primary channel (the first channel they enter)
  const channelGroups = new Map<number, PendingWire[]>()

  for (const pw of pending) {
    let chIdx: number
    if (pw.srcCol === pw.tgtCol) {
      // Same column — use nearest channel
      chIdx = pw.srcCol  // may be out of range, that's fine for grouping
    } else if (pw.tgtCol > pw.srcCol) {
      chIdx = pw.srcCol
    } else {
      chIdx = pw.srcCol < Infinity ? pw.srcCol : 0
    }
    if (!channelGroups.has(chIdx)) channelGroups.set(chIdx, [])
    channelGroups.get(chIdx)!.push(pw)
  }

  const offsets = new Map<string, number>()
  for (const [, group] of channelGroups) {
    if (group.length <= 1) {
      if (group.length === 1) offsets.set(group[0].wire.id, 0)
      continue
    }
    // Sort by target Y for visual ordering
    group.sort((a, b) => a.tgt.y - b.tgt.y)
    for (let i = 0; i < group.length; i++) {
      offsets.set(group[i].wire.id, LANE_SPACING * (i - (group.length - 1) / 2))
    }
  }

  return offsets
}

// --- Main entry point ---

export function routeWires(
  board: CircuitBoard,
  placed: PlacedComponent[],
): RoutingResult {
  const pinPositions = buildPinPositions(placed)
  const grid = buildRoutingGrid(board, placed)
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

  // Build pending wires with column info
  const pending: PendingWire[] = []
  for (const wire of sortedWires) {
    const srcPos = pinPositions.get(wire.sourcePin)
    const tgtPos = pinPositions.get(wire.targetPin)
    if (!srcPos || !tgtPos) continue

    const zOffset = layerZOffset[wire.kind] ?? 0
    const srcCol = grid.pinColumn.get(wire.sourcePin) ?? 0
    const tgtCol = grid.pinColumn.get(wire.targetPin) ?? 0

    pending.push({
      wire,
      src: { x: srcPos.x, y: srcPos.y, z: srcPos.z + zOffset },
      tgt: { x: tgtPos.x, y: tgtPos.y, z: tgtPos.z + zOffset },
      srcCol,
      tgtCol,
      layer: wire.kind === 'data' ? 'data' : wire.kind === 'control' ? 'control' : 'exception',
    })
  }

  // Assign lane offsets
  const laneOffsets = assignLaneOffsets(pending)

  // Route each wire
  for (const pw of pending) {
    const offset = laneOffsets.get(pw.wire.id) ?? 0
    const points = grid.channels.length > 0
      ? routeOnGrid(pw.src, pw.tgt, pw.srcCol, pw.tgtCol, grid, offset)
      : fallbackRoute(pw.src, pw.tgt)

    routed.push({
      wire: pw.wire,
      points,
      layer: pw.layer,
    })
  }

  // Route clock line segments through the grid too
  for (const seg of board.clockLine) {
    if (!seg.from || !seg.to) continue

    const fromComp = placed.find((p) => p.component.id === seg.from)
    const toComp = placed.find((p) => p.component.id === seg.to)
    if (!fromComp || !toComp) continue

    const zOffset = layerZOffset.control
    const srcZ = fromComp.worldZ + fromComp.depth + zOffset
    const tgtZ = toComp.worldZ + toComp.depth + zOffset
    const src: Point3D = {
      x: fromComp.worldX + fromComp.width,
      y: fromComp.worldY + fromComp.height / 2,
      z: srcZ,
    }
    const tgt: Point3D = {
      x: toComp.worldX,
      y: toComp.worldY + toComp.height / 2,
      z: tgtZ,
    }

    const srcCol = grid.compColumn.get(seg.from) ?? 0
    const tgtCol = grid.compColumn.get(seg.to) ?? 0

    const points = grid.channels.length > 0
      ? routeOnGrid(src, tgt, srcCol, tgtCol, grid, 0)
      : fallbackRoute(src, tgt)

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

  // Bundle cross-container wires that share source and target containers
  const bundled = bundleCrossContainerWires(routed, placed, grid)

  return { wires: bundled }
}

/** Fallback L-shape route when no grid is available (single component, etc.) */
function fallbackRoute(src: Point3D, tgt: Point3D): Point3D[] {
  const midZ = (src.z + tgt.z) / 2
  const midX = (src.x + tgt.x) / 2
  return [
    src,
    { x: midX, y: src.y, z: midZ },
    { x: midX, y: tgt.y, z: midZ },
    tgt,
  ]
}

/** Group wires between the same pair of top-level containers into bundled trunks */
function bundleCrossContainerWires(
  routed: RoutedWire[],
  placed: PlacedComponent[],
  grid: RoutingGrid,
): RoutedWire[] {
  // Build pin → container mapping (top-level placed components only)
  const pinToContainer = new Map<string, string>()
  for (const pc of placed) {
    for (const pin of [...pc.component.inputPins, ...pc.component.outputPins]) {
      pinToContainer.set(pin.id, pc.component.id)
    }
  }

  // Group routed wires by (sourceContainer, targetContainer)
  const bundleGroups = new Map<string, RoutedWire[]>()
  const unbundled: RoutedWire[] = []

  for (const rw of routed) {
    const srcContainer = pinToContainer.get(rw.wire.sourcePin)
    const tgtContainer = pinToContainer.get(rw.wire.targetPin)

    if (srcContainer && tgtContainer && srcContainer !== tgtContainer) {
      const key = `${srcContainer}:${tgtContainer}`
      if (!bundleGroups.has(key)) bundleGroups.set(key, [])
      bundleGroups.get(key)!.push(rw)
    } else {
      unbundled.push(rw)
    }
  }

  // For groups with 2+ wires, replace with a single trunk wire
  const result = [...unbundled]
  for (const [, group] of bundleGroups) {
    if (group.length <= 1) {
      result.push(...group)
      continue
    }

    // Use the first wire's route as the trunk path (roughly central)
    // Average the start/end positions for a better trunk route
    const avgSrcY = group.reduce((s, rw) => s + rw.points[0].y, 0) / group.length
    const avgTgtY = group.reduce((s, rw) => s + rw.points[rw.points.length - 1].y, 0) / group.length
    const first = group[0]
    const last = group[0].points
    const src = { ...last[0], y: avgSrcY }
    const tgt = { ...last[last.length - 1], y: avgTgtY }

    const srcCol = grid.pinColumn.get(first.wire.sourcePin) ?? 0
    const tgtCol = grid.pinColumn.get(first.wire.targetPin) ?? 0
    const trunkPoints = grid.channels.length > 0
      ? routeOnGrid(src, tgt, srcCol, tgtCol, grid, 0)
      : fallbackRoute(src, tgt)

    const count = group.length
    result.push({
      wire: {
        id: `bundle_${first.wire.id}`,
        kind: 'data',
        sourcePin: first.wire.sourcePin,
        targetPin: first.wire.targetPin,
        isLive: true,
      },
      points: trunkPoints,
      layer: 'data',
      bundleCount: count,
      bundleLabel: `${count} imports`,
    })
  }

  return result
}

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

  // File/directory subcircuits: pin blocks aren't rendered, so distribute pins evenly within chip bounds
  const op = pc.component.operation
  if (pc.component.subCircuit && (op === 'file' || op === 'directory')) {
    const step = pc.height / (pins.length + 1)
    for (let i = 0; i < pins.length; i++) {
      positions.set(pins[i].id, {
        x: side === 'input'
          ? pc.worldX
          : pc.worldX + pc.width,
        y: pc.worldY + step * (i + 1),
        z: pinZ,
      })
    }
    return
  }

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
