// Render orchestrator: clear → board bg → wires → components

import { PositionedBoard } from '../layout/layout'
import { PlacedComponent } from '../layout/placement'
import { toIsometric, CELL_W, CELL_H } from '../layout/isometric'
import { drawBoard, drawBoardOutline } from './board'
import { drawWires, WireRenderOptions } from './wires'
import { sortByDepth } from './z-order'
import { drawGate } from './components/gate'
import { drawMux } from './components/mux'
import { drawDemux } from './components/demux'
import { drawSubcircuit } from './components/subcircuit'
import { drawRegister } from './components/register'
import { drawConnector } from './components/connector'
import { drawLatch } from './components/latch'
import { drawIoPort } from './components/io-port'
import { drawIsoBox, drawTypePins } from './components/shared'
import { COLORS, getComponentColor } from './colors'

export interface RenderState {
  panX: number
  panY: number
  zoom: number
  showData: boolean
  showClock: boolean
  showException: boolean
  highlightedComponentId: string | null
  highlightedWires: Set<string>
  expandedSubcircuits: Set<string>
}

export function createDefaultRenderState(): RenderState {
  return {
    panX: 0,
    panY: 0,
    zoom: 1,
    showData: true,
    showClock: true,
    showException: true,
    highlightedComponentId: null,
    highlightedWires: new Set(),
    expandedSubcircuits: new Set(),
  }
}

export function render(
  canvas: HTMLCanvasElement,
  positioned: PositionedBoard,
  state: RenderState,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr

  // Clear with board background color before transforms
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#1a472a'
  ctx.fillRect(0, 0, w, h)

  // Apply pan and zoom
  ctx.save()
  ctx.translate(w / 2 + state.panX, h / 3 + state.panY)
  ctx.scale(state.zoom, state.zoom)

  const { placement, routing, board } = positioned
  const { boardWidth, boardHeight } = placement

  // 1. Board grid dots and outline
  drawBoard(ctx, w / state.zoom * 3, h / state.zoom * 3, boardWidth, boardHeight)
  drawBoardOutline(ctx, boardWidth, boardHeight)

  // 2. Wires (behind components)
  const wireOpts: WireRenderOptions = {
    showData: state.showData,
    showClock: state.showClock,
    showException: state.showException,
    highlightedWires: state.highlightedWires,
  }
  drawWires(ctx, routing.wires, wireOpts)

  // 3. Components (depth-sorted — containers drawn before children due to lower z)
  const sorted = sortByDepth(placement.placed)
  for (const pc of sorted) {
    const highlighted = pc.component.id === state.highlightedComponentId
    drawComponent(ctx, pc, highlighted)
  }

  ctx.restore() // zoom/pan
  ctx.restore() // dpr scale
}

function drawComponent(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  const { component } = pc

  switch (component.kind) {
    case 'gate':
      drawGate(ctx, pc, highlighted)
      break
    case 'mux':
      drawMux(ctx, pc, highlighted)
      break
    case 'demux':
      drawDemux(ctx, pc, highlighted)
      break
    case 'subcircuit':
      drawSubcircuit(ctx, pc, highlighted)
      break
    case 'register':
      drawRegister(ctx, pc, highlighted)
      break
    case 'connector':
      drawConnector(ctx, pc, highlighted)
      break
    case 'latch':
      drawLatch(ctx, pc, highlighted)
      break
    case 'io-port':
      drawIoPort(ctx, pc, highlighted)
      break
    case 'constant':
      drawConstant(ctx, pc, highlighted)
      break
    case 'comparator':
      drawComparator(ctx, pc, highlighted)
      break
    case 'named-wire':
      drawNamedWire(ctx, pc, highlighted)
      break
    default:
      drawGate(ctx, pc, highlighted)
  }
}

function drawConstant(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  const { component: comp, worldX, worldY, worldZ, width, height, depth } = pc

  const color = highlighted
    ? COLORS.compBodyHi
    : getComponentColor(comp.kind, comp.isReachable)

  drawIsoBox(ctx, worldX, worldY, worldZ, width, height, depth, color, comp.isReachable)

  const center = toIsometric({
    x: worldX + width / 2,
    y: worldY + height / 2,
    z: worldZ + depth,
  })

  ctx.fillStyle = comp.isReachable
    ? highlighted ? COLORS.labelTextHi : '#88bb88'
    : COLORS.deadLabel
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(comp.label.slice(0, 12), Math.round(center.sx), Math.round(center.sy))
}

function drawComparator(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  drawGate(ctx, pc, highlighted)

  const center = toIsometric({
    x: pc.worldX + pc.width / 2,
    y: pc.worldY + pc.height / 2,
    z: pc.worldZ + pc.depth + 2,
  })

  // Small diamond on top
  const s = 4
  ctx.strokeStyle = COLORS.clockWire
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(center.sx, center.sy - s - 12)
  ctx.lineTo(center.sx + s, center.sy - 12)
  ctx.lineTo(center.sx, center.sy + s - 12)
  ctx.lineTo(center.sx - s, center.sy - 12)
  ctx.closePath()
  ctx.stroke()
}

function drawNamedWire(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  const { component: comp, worldX, worldY, worldZ, width, height, depth } = pc

  const color = highlighted
    ? COLORS.compBodyHi
    : getComponentColor(comp.kind, comp.isReachable)

  drawIsoBox(ctx, worldX, worldY, worldZ, width, height, depth, color, comp.isReachable)

  const center = toIsometric({
    x: worldX + width / 2,
    y: worldY + height / 2,
    z: worldZ + depth,
  })

  ctx.fillStyle = comp.isReachable
    ? highlighted ? COLORS.labelTextHi : COLORS.dataWire
    : COLORS.deadLabel
  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(comp.label.slice(0, 12), Math.round(center.sx), Math.round(center.sy))

  drawTypePins(ctx, worldX, worldY, worldZ, width, height, depth,
    comp.inputPins, 'input', comp.isReachable)
  drawTypePins(ctx, worldX, worldY, worldZ, width, height, depth,
    comp.outputPins, 'output', comp.isReachable)
}

/** Hit-test: find component at screen position */
export function hitTest(
  positioned: PositionedBoard,
  state: RenderState,
  canvasWidth: number,
  canvasHeight: number,
  screenX: number,
  screenY: number,
): string | null {
  // Undo viewport transform
  const x = (screenX - canvasWidth / 2 - state.panX) / state.zoom
  const y = (screenY - canvasHeight / 3 - state.panY) / state.zoom

  // Check each placed component (reverse order = front first)
  const sorted = sortByDepth(positioned.placement.placed)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pc = sorted[i]
    const topLeft = toIsometric({
      x: pc.worldX,
      y: pc.worldY,
      z: pc.worldZ,
    })
    const bottomRight = toIsometric({
      x: pc.worldX + pc.width,
      y: pc.worldY + pc.height,
      z: pc.worldZ,
    })

    // Approximate bounding box in screen space
    const minSx = Math.min(topLeft.sx, bottomRight.sx) - 20
    const maxSx = Math.max(topLeft.sx, bottomRight.sx) + 20
    const minSy = Math.min(topLeft.sy, bottomRight.sy) - 20
    const maxSy = Math.max(topLeft.sy, bottomRight.sy) + 20

    if (x >= minSx && x <= maxSx && y >= minSy && y <= maxSy) {
      return pc.component.id
    }
  }

  return null
}

/** Get all wire IDs connected to a component */
export function getConnectedWires(
  board: import('../analysis/circuit-ir').CircuitBoard,
  componentId: string,
): Set<string> {
  const pinIds = new Set<string>()
  for (const comp of board.components) {
    if (comp.id === componentId) {
      for (const pin of [...comp.inputPins, ...comp.outputPins]) {
        pinIds.add(pin.id)
      }
    }
  }

  const wireIds = new Set<string>()
  for (const wire of board.wires) {
    if (pinIds.has(wire.sourcePin) || pinIds.has(wire.targetPin)) {
      wireIds.add(wire.id)
    }
  }

  // Also include clock segments
  for (const seg of board.clockLine) {
    if (seg.from === componentId || seg.to === componentId) {
      wireIds.add(`clock_${seg.from}_${seg.to}`)
    }
  }

  return wireIds
}
