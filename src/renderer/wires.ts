// Wire rendering: data wires, clock line, exception lines

import { RoutedWire } from '../layout/wire-routing'
import { getWireColor, COLORS } from './colors'
import { IsoPoint } from '../layout/isometric'

export interface WireRenderOptions {
  showData: boolean
  showClock: boolean
  showException: boolean
  highlightedWires: Set<string>
}

export function drawWires(
  ctx: CanvasRenderingContext2D,
  wires: RoutedWire[],
  options: WireRenderOptions,
): void {
  for (const routed of wires) {
    // Layer visibility
    if (routed.layer === 'data' && !options.showData) continue
    if (routed.layer === 'control' && !options.showClock) continue
    if (routed.layer === 'exception' && !options.showException) continue

    const highlighted = options.highlightedWires.has(routed.wire.id)
    drawSingleWire(ctx, routed, highlighted)
  }
}

function drawSingleWire(
  ctx: CanvasRenderingContext2D,
  routed: RoutedWire,
  highlighted: boolean,
): void {
  const { wire, points } = routed
  if (points.length < 2) return

  const color = getWireColor(wire.kind, wire.isLive, highlighted)
  const lineWidth = wire.kind === 'control' ? 2.5 : wire.kind === 'exception' ? 2 : 1.5
  const alpha = wire.isLive ? 1 : 0.3

  ctx.save()
  ctx.globalAlpha = alpha

  // Wire glow for highlighted
  if (highlighted) {
    ctx.shadowColor = color
    ctx.shadowBlur = 8
  }

  // Draw wire path
  ctx.strokeStyle = color
  ctx.lineWidth = highlighted ? lineWidth + 1 : lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Dash pattern for exception wires
  if (wire.kind === 'exception') {
    ctx.setLineDash([6, 4])
  } else if (wire.kind === 'control') {
    ctx.setLineDash([3, 3])
  } else {
    ctx.setLineDash([])
  }

  ctx.beginPath()
  ctx.moveTo(points[0].sx, points[0].sy)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].sx, points[i].sy)
  }
  ctx.stroke()

  // Draw arrow at end
  if (points.length >= 2) {
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    drawArrow(ctx, prev, last, color, lineWidth)
  }

  // Draw dead wire stub indicator
  if (!wire.isLive) {
    const last = points[points.length - 1]
    ctx.fillStyle = COLORS.deadWire
    ctx.beginPath()
    ctx.arc(last.sx, last.sy, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.setLineDash([])
  ctx.restore()
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: IsoPoint,
  to: IsoPoint,
  color: string,
  lineWidth: number,
): void {
  const dx = to.sx - from.sx
  const dy = to.sy - from.sy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 5) return

  const nx = dx / len
  const ny = dy / len
  const arrowSize = 5 + lineWidth

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(to.sx, to.sy)
  ctx.lineTo(
    to.sx - arrowSize * nx + (arrowSize / 2) * ny,
    to.sy - arrowSize * ny - (arrowSize / 2) * nx,
  )
  ctx.lineTo(
    to.sx - arrowSize * nx - (arrowSize / 2) * ny,
    to.sy - arrowSize * ny + (arrowSize / 2) * nx,
  )
  ctx.closePath()
  ctx.fill()
}
