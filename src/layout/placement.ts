// Hierarchical placement: recursive bottom-up layout with containment

import { CircuitBoard, Component } from '../analysis/circuit-ir'
import { CELL_W, CELL_H, getCompSize } from './isometric'

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
const COL_GAP = 15            // horizontal gap between siblings
const ROW_GAP = 15            // vertical gap between rows

export function placeComponents(board: CircuitBoard): PlacementResult {
  const components = board.components
  if (components.length === 0) {
    return { placed: [], boardWidth: 0, boardHeight: 0 }
  }

  // 1. Recursively compute sizes for all components (bottom-up)
  const sizes = new Map<string, ComputedSize>()
  computeSizesForBoard(board, sizes)

  // 2. Build topo order for this board's components
  const ordered = topoOrder(board)

  // 3. Place components using variable-width row packing
  const placed: PlacedComponent[] = []
  const { maxX, maxY } = packComponents(ordered, sizes, placed, 0, 0, 0)

  return {
    placed,
    boardWidth: maxX + CELL_W,
    boardHeight: maxY + CELL_H,
  }
}

/** Recursively compute sizes for all components in a board hierarchy */
function computeSizesForBoard(board: CircuitBoard, sizes: Map<string, ComputedSize>): void {
  for (const comp of board.components) {
    if (comp.subCircuit && comp.subCircuit.components.length > 0) {
      // Compute children first (bottom-up)
      computeSizesForBoard(comp.subCircuit, sizes)

      // Estimate footprint needed for children
      const childOrdered = topoOrder(comp.subCircuit)
      const footprint = estimateFootprint(childOrdered, sizes)

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
      // Leaf component: use fixed size from COMP_SIZES, converted to world units
      const base = getCompSize(comp.kind)
      sizes.set(comp.id, {
        w: base.w * CELL_W,
        h: base.h * CELL_H,
        d: base.d * CELL_H,
        maxNestDepth: 0,
      })
    }
  }
}

/** Estimate the footprint needed to pack a list of components */
function estimateFootprint(
  ordered: Component[],
  sizes: Map<string, ComputedSize>,
): { w: number; h: number; maxChildD: number; maxNestDepth: number } {
  if (ordered.length === 0) {
    return { w: 0, h: 0, maxChildD: 0, maxNestDepth: 0 }
  }

  // Row-pack to estimate total size
  const maxRowWidth = estimateMaxRowWidth(ordered, sizes)
  let curX = 0
  let curY = 0
  let rowHeight = 0
  let maxW = 0
  let maxChildD = 0
  let maxNestDepth = 0

  for (const comp of ordered) {
    const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }

    if (curX + size.w > maxRowWidth && curX > 0) {
      curX = 0
      curY += rowHeight + ROW_GAP
      rowHeight = 0
    }

    maxW = Math.max(maxW, curX + size.w)
    rowHeight = Math.max(rowHeight, size.h)
    maxChildD = Math.max(maxChildD, size.d)
    maxNestDepth = Math.max(maxNestDepth, size.maxNestDepth)

    curX += size.w + COL_GAP
  }

  return {
    w: maxW,
    h: curY + rowHeight,
    maxChildD,
    maxNestDepth,
  }
}

function estimateMaxRowWidth(ordered: Component[], sizes: Map<string, ComputedSize>): number {
  // Aim for roughly square layouts
  let totalW = 0
  for (const comp of ordered) {
    const size = sizes.get(comp.id)
    totalW += (size?.w ?? CELL_W) + COL_GAP
  }
  return Math.max(
    300,
    Math.sqrt(totalW * (sizes.get(ordered[0]?.id ?? '')?.h ?? CELL_H)) * 1.5,
  )
}

/** Place components using row packing, recursing into containers */
function packComponents(
  ordered: Component[],
  sizes: Map<string, ComputedSize>,
  placed: PlacedComponent[],
  originX: number,
  originY: number,
  originZ: number,
): { maxX: number; maxY: number } {
  if (ordered.length === 0) {
    return { maxX: originX, maxY: originY }
  }

  const maxRowWidth = estimateMaxRowWidth(ordered, sizes)
  let curX = originX
  let curY = originY
  let rowHeight = 0
  let maxX = originX
  let maxY = originY

  for (const comp of ordered) {
    const size = sizes.get(comp.id) ?? { w: CELL_W, h: CELL_H, d: CELL_H * 0.3, maxNestDepth: 0 }
    const isContainer = !!(comp.subCircuit && comp.subCircuit.components.length > 0)

    // Row wrapping
    if (curX - originX + size.w > maxRowWidth && curX > originX) {
      curX = originX
      curY += rowHeight + ROW_GAP
      rowHeight = 0
    }

    const pc: PlacedComponent = {
      component: comp,
      gridX: Math.floor(curX / CELL_W),
      gridY: Math.floor(curY / CELL_H),
      worldX: curX,
      worldY: curY,
      worldZ: originZ,
      width: size.w,
      height: size.h,
      depth: size.d,
      isContainer,
      platformDepth: isContainer ? PLATFORM_SLAB : 0,
    }
    placed.push(pc)

    // If this is a container, place its children inside at elevated z
    if (isContainer && comp.subCircuit) {
      const childOrdered = topoOrder(comp.subCircuit)
      const childZ = originZ + PLATFORM_Z_STEP
      const childOriginX = curX + CONTAINER_PAD
      const childOriginY = curY + CONTAINER_PAD

      packComponents(childOrdered, sizes, placed, childOriginX, childOriginY, childZ)
    }

    maxX = Math.max(maxX, curX + size.w)
    maxY = Math.max(maxY, curY + size.h)
    rowHeight = Math.max(rowHeight, size.h)
    curX += size.w + COL_GAP
  }

  return { maxX, maxY }
}

/** Topological sort of components on a board, returns ordered list */
function topoOrder(board: CircuitBoard): Component[] {
  const components = board.components
  if (components.length === 0) return []

  // Build adjacency from wires
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

  // Kahn's algorithm for topological levels
  const levels = topoLevels(components, inEdges)

  const ordered: Component[] = []
  for (const [, comps] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    comps.sort(
      (a, b) => (a.sourceLocation?.line ?? 0) - (b.sourceLocation?.line ?? 0),
    )
    ordered.push(...comps)
  }

  return ordered
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
