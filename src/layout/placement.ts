// Hierarchical placement: recursive bottom-up layout with containment

import { CircuitBoard, Component } from '../analysis/circuit-ir'
import { CELL_W, CELL_H, computeCompSize } from './isometric'

export interface PlacedComponent {
  component: Component
  gridX: number
  gridY: number
  worldX: number
  worldY: number
  worldZ: number
  width: number
  height: number
  depth: number
  /** True if this is an expanded container with children placed inside */
  isContainer: boolean
  /** Platform slab thickness for containers */
  platformDepth: number
}

export interface PlacementResult {
  placed: PlacedComponent[]
  boardWidth: number
  boardHeight: number
}

interface ComputedSize {
  w: number  // world units
  h: number  // world units
  d: number  // world units (depth/height of the box)
  maxNestDepth: number  // deepest nesting below this component
}

const PLATFORM_Z_STEP = 30    // z-offset per nesting level
const CONTAINER_PAD = 25      // padding inside a container around children
const PLATFORM_SLAB = 12      // thickness of the platform slab itself
const LEVEL_COL_GAP = 60      // horizontal gap between topo-level columns
const LEVEL_ROW_GAP = 30      // vertical gap between components within a column

export function placeComponents(board: CircuitBoard): PlacementResult {
  const components = board.components
  if (components.length === 0) {
    return { placed: [], boardWidth: 0, boardHeight: 0 }
  }

  // 1. Recursively compute sizes for all components (bottom-up)
  const sizes = new Map<string, ComputedSize>()
  computeSizesForBoard(board, sizes)

  // Detect project-level board: most components are subcircuits with subCircuits
  const containerCount = components.filter(c => c.subCircuit).length
  const isProjectBoard = containerCount > 0 && containerCount >= components.length * 0.5

  if (isProjectBoard) {
    return placeByDependencyLevels(board, sizes)
  }

  // 2. Place components using column-per-topo-level layout
  const placed: PlacedComponent[] = []
  const { maxX, maxY } = placeByColumns(board, sizes, placed, 0, 0, 0)

  return {
    placed,
    boardWidth: maxX + CELL_W,
    boardHeight: maxY + CELL_H,
  }
}

const PROJECT_COL_GAP = 80
const PROJECT_ROW_GAP = 100

/** Place project-level components by dependency level — each level gets a centered row */
function placeByDependencyLevels(
  board: CircuitBoard,
  sizes: Map<string, ComputedSize>,
): PlacementResult {
  // Build adjacency and get topo levels
  const inEdges = new Map<string, Set<string>>()
  const pinToComp = new Map<string, string>()
  for (const comp of board.components) {
    for (const pin of [...comp.inputPins, ...comp.outputPins]) {
      pinToComp.set(pin.id, comp.id)
    }
    inEdges.set(comp.id, new Set())
  }
  for (const wire of board.wires) {
    const src = pinToComp.get(wire.sourcePin)
    const tgt = pinToComp.get(wire.targetPin)
    if (src && tgt && src !== tgt) {
      inEdges.get(tgt)!.add(src)
    }
  }

  const levels = topoLevels(board.components, inEdges)
  const placed: PlacedComponent[] = []

  // First pass: compute the width of each level row and find the max
  const levelRows: Array<{ level: number; comps: Component[] }> = []
  let maxRowWidth = 0

  for (const [level, comps] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    // Sort within level: entry points first, then by label
    comps.sort((a, b) => {
      if (a.isEntryPoint !== b.isEntryPoint) return a.isEntryPoint ? -1 : 1
      return a.label.localeCompare(b.label)
    })
    let rowW = 0
    for (const comp of comps) {
      const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }
      rowW += size.w + PROJECT_COL_GAP
    }
    rowW -= PROJECT_COL_GAP // no trailing gap
    maxRowWidth = Math.max(maxRowWidth, rowW)
    levelRows.push({ level, comps })
  }

  // Second pass: place each level row centered within the max width
  let curY = 0
  let maxX = 0
  let maxY = 0

  for (const { comps } of levelRows) {
    // Compute this row's total width
    let rowW = 0
    let rowH = 0
    for (const comp of comps) {
      const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }
      rowW += size.w + PROJECT_COL_GAP
      rowH = Math.max(rowH, size.h)
    }
    rowW -= PROJECT_COL_GAP

    // Center this row
    let curX = (maxRowWidth - rowW) / 2

    for (const comp of comps) {
      const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }
      const isContainer = !!(comp.subCircuit && comp.subCircuit.components.length > 0 && !comp.collapsed)

      const pc: PlacedComponent = {
        component: comp,
        gridX: Math.floor(curX / CELL_W),
        gridY: Math.floor(curY / CELL_H),
        worldX: curX,
        worldY: curY,
        worldZ: 0,
        width: size.w,
        height: size.h,
        depth: size.d,
        isContainer,
        platformDepth: isContainer ? PLATFORM_SLAB : 0,
      }
      placed.push(pc)

      if (isContainer && comp.subCircuit) {
        placeByColumns(comp.subCircuit, sizes, placed, curX + CONTAINER_PAD, curY + CONTAINER_PAD, PLATFORM_Z_STEP)
      }

      maxX = Math.max(maxX, curX + size.w)
      curX += size.w + PROJECT_COL_GAP
    }

    maxY = Math.max(maxY, curY + rowH)
    curY += rowH + PROJECT_ROW_GAP
  }

  return {
    placed,
    boardWidth: maxX + CELL_W,
    boardHeight: maxY + CELL_H,
  }
}

/** Recursively compute sizes for all components in a board hierarchy */
function computeSizesForBoard(board: CircuitBoard, sizes: Map<string, ComputedSize>): void {
  for (const comp of board.components) {
    if (comp.subCircuit && comp.subCircuit.components.length > 0 && !comp.collapsed) {
      // Compute children first (bottom-up)
      computeSizesForBoard(comp.subCircuit, sizes)

      // Estimate footprint needed for children using column layout
      const footprint = estimateColumnFootprint(comp.subCircuit, sizes)

      const w = footprint.w + CONTAINER_PAD * 2
      const h = footprint.h + CONTAINER_PAD * 2
      const d = PLATFORM_SLAB + footprint.maxChildD

      sizes.set(comp.id, {
        w,
        h,
        d,
        maxNestDepth: footprint.maxNestDepth + 1,
      })
    } else {
      // Leaf component or collapsed container: chip-size
      const sz = computeCompSize(comp)
      sizes.set(comp.id, {
        w: sz.w,
        h: sz.h,
        d: sz.d,
        maxNestDepth: 0,
      })
    }
  }
}

/** Estimate footprint using column-per-topo-level layout */
function estimateColumnFootprint(
  board: CircuitBoard,
  sizes: Map<string, ComputedSize>,
): { w: number; h: number; maxChildD: number; maxNestDepth: number } {
  const components = board.components
  if (components.length === 0) {
    return { w: 0, h: 0, maxChildD: 0, maxNestDepth: 0 }
  }

  // Build adjacency
  const inEdges = new Map<string, Set<string>>()
  const pinToComp = new Map<string, string>()
  for (const comp of components) {
    for (const pin of [...comp.inputPins, ...comp.outputPins]) {
      pinToComp.set(pin.id, comp.id)
    }
    inEdges.set(comp.id, new Set())
  }
  for (const wire of board.wires) {
    const src = pinToComp.get(wire.sourcePin)
    const tgt = pinToComp.get(wire.targetPin)
    if (src && tgt && src !== tgt) {
      inEdges.get(tgt)!.add(src)
    }
  }
  for (const seg of board.clockLine) {
    if (seg.from && seg.to && seg.from !== seg.to) {
      if (inEdges.has(seg.to)) {
        inEdges.get(seg.to)!.add(seg.from)
      }
    }
  }

  const levels = topoLevels(components, inEdges)
  const sortedLevels = [...levels.entries()].sort((a, b) => a[0] - b[0])

  let totalW = 0
  let maxColHeight = 0
  let maxChildD = 0
  let maxNestDepth = 0

  for (const [, comps] of sortedLevels) {
    let colWidth = 0
    let colHeight = 0
    for (const comp of comps) {
      const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }
      colWidth = Math.max(colWidth, size.w)
      colHeight += size.h + LEVEL_ROW_GAP
      maxChildD = Math.max(maxChildD, size.d)
      maxNestDepth = Math.max(maxNestDepth, size.maxNestDepth)
    }
    colHeight -= LEVEL_ROW_GAP
    totalW += colWidth + LEVEL_COL_GAP
    maxColHeight = Math.max(maxColHeight, colHeight)
  }
  totalW -= LEVEL_COL_GAP // no trailing gap

  return {
    w: totalW,
    h: maxColHeight,
    maxChildD,
    maxNestDepth,
  }
}

/** Place components in columns by topo level, recursing into containers */
function placeByColumns(
  board: CircuitBoard,
  sizes: Map<string, ComputedSize>,
  placed: PlacedComponent[],
  originX: number,
  originY: number,
  originZ: number,
): { maxX: number; maxY: number } {
  const components = board.components
  if (components.length === 0) return { maxX: originX, maxY: originY }

  // Build adjacency and get topo levels
  const inEdges = new Map<string, Set<string>>()
  const pinToComp = new Map<string, string>()
  for (const comp of components) {
    for (const pin of [...comp.inputPins, ...comp.outputPins]) {
      pinToComp.set(pin.id, comp.id)
    }
    inEdges.set(comp.id, new Set())
  }
  for (const wire of board.wires) {
    const src = pinToComp.get(wire.sourcePin)
    const tgt = pinToComp.get(wire.targetPin)
    if (src && tgt && src !== tgt) {
      inEdges.get(tgt)!.add(src)
    }
  }
  for (const seg of board.clockLine) {
    if (seg.from && seg.to && seg.from !== seg.to) {
      if (inEdges.has(seg.to)) {
        inEdges.get(seg.to)!.add(seg.from)
      }
    }
  }

  const levels = topoLevels(components, inEdges)
  const sortedLevels = [...levels.entries()].sort((a, b) => a[0] - b[0])

  // First pass: compute each column's width and total height to find max column height
  let maxColHeight = 0
  const columnInfos: Array<{ comps: Component[]; colWidth: number; colHeight: number }> = []

  for (const [, comps] of sortedLevels) {
    // Sort within level: entry points first, then by source line
    comps.sort((a, b) => {
      if (a.isEntryPoint !== b.isEntryPoint) return a.isEntryPoint ? -1 : 1
      return (a.sourceLocation?.line ?? 0) - (b.sourceLocation?.line ?? 0)
    })

    let colWidth = 0
    let colHeight = 0
    for (const comp of comps) {
      const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }
      colWidth = Math.max(colWidth, size.w)
      colHeight += size.h + LEVEL_ROW_GAP
    }
    colHeight -= LEVEL_ROW_GAP // no trailing gap
    maxColHeight = Math.max(maxColHeight, colHeight)
    columnInfos.push({ comps, colWidth, colHeight })
  }

  // Second pass: place each column, centering components vertically within maxColHeight
  let curX = originX
  let maxX = originX
  let maxY = originY

  for (const { comps, colWidth, colHeight } of columnInfos) {
    // Center this column vertically within the tallest column's height
    let curY = originY + (maxColHeight - colHeight) / 2

    for (const comp of comps) {
      const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }
      const isContainer = !!(comp.subCircuit && comp.subCircuit.components.length > 0 && !comp.collapsed)

      // Center component horizontally within the column width
      const compX = curX + (colWidth - size.w) / 2

      const pc: PlacedComponent = {
        component: comp,
        gridX: Math.floor(compX / CELL_W),
        gridY: Math.floor(curY / CELL_H),
        worldX: compX,
        worldY: curY,
        worldZ: originZ,
        width: size.w,
        height: size.h,
        depth: size.d,
        isContainer,
        platformDepth: isContainer ? PLATFORM_SLAB : 0,
      }
      placed.push(pc)

      // Recurse into expanded containers
      if (isContainer && comp.subCircuit) {
        placeByColumns(comp.subCircuit, sizes, placed,
          compX + CONTAINER_PAD, curY + CONTAINER_PAD, originZ + PLATFORM_Z_STEP)
      }

      maxX = Math.max(maxX, compX + size.w)
      maxY = Math.max(maxY, curY + size.h)
      curY += size.h + LEVEL_ROW_GAP
    }

    curX += colWidth + LEVEL_COL_GAP
  }

  return { maxX, maxY }
}

function topoLevels(
  components: Component[],
  inEdges: Map<string, Set<string>>,
): Map<number, Component[]> {
  const compMap = new Map(components.map((c) => [c.id, c]))
  const inDegree = new Map<string, number>()
  const remaining = new Set(components.map((c) => c.id))

  for (const comp of components) {
    const deps = inEdges.get(comp.id) ?? new Set()
    let count = 0
    for (const dep of deps) {
      if (remaining.has(dep)) count++
    }
    inDegree.set(comp.id, count)
  }

  const levels = new Map<number, Component[]>()
  let level = 0

  while (remaining.size > 0) {
    const ready: string[] = []
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) <= 0) {
        ready.push(id)
      }
    }

    if (ready.length === 0) {
      const first = remaining.values().next().value!
      ready.push(first)
    }

    const levelComps: Component[] = []
    for (const id of ready) {
      remaining.delete(id)
      const comp = compMap.get(id)
      if (comp) levelComps.push(comp)

      for (const [depId, deps] of inEdges) {
        if (deps.has(id) && remaining.has(depId)) {
          inDegree.set(depId, (inDegree.get(depId) ?? 1) - 1)
        }
      }
    }

    levels.set(level, levelComps)
    level++
  }

  return levels
}
