// Wire rendering as Phaser Graphics objects

import Phaser from 'phaser'
import { RoutedWire } from '../../layout/wire-routing'
import { IsoPoint, toIsometric } from '../../layout/isometric'
import { getWireColor, COLORS } from '../../shared/colors'
import { ColorContext } from '../../shared/semantic-colors'
import { hexToNum, drawDashedPath, lighten, textStyle } from '../util'

export function createWireObject(
  scene: Phaser.Scene,
  routed: RoutedWire,
  highlighted: boolean,
  colorContext?: ColorContext,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  const { wire } = routed
  const points = routed.points.map(toIsometric)
  if (points.length < 2) return g

  // Scope-colored data wires: use colorContext if available
  let color: string
  const scopeColor = colorContext?.wireColor.get(wire.id)
  if (wire.isLive && wire.kind === 'data' && scopeColor) {
    color = highlighted ? lighten(scopeColor, 40) : scopeColor
  } else {
    color = getWireColor(wire.kind, wire.isLive, highlighted)
  }
  const colorNum = hexToNum(color)
  const lineWidth = wire.kind === 'control' ? 2.5 : wire.kind === 'exception' ? 2 : 1.5
  const alpha = wire.isLive ? 1 : 0.3
  const drawWidth = highlighted ? lineWidth + 1 : lineWidth

  // Glow effect for highlighted wires (thicker translucent line underneath)
  if (highlighted) {
    g.lineStyle(drawWidth + 4, colorNum, alpha * 0.3)
    drawWirePath(g, points, wire.kind)
  }

  // Main wire
  g.lineStyle(drawWidth, colorNum, alpha)
  drawWirePath(g, points, wire.kind)

  // Arrow at end
  if (points.length >= 2) {
    const last = points[points.length - 1]
    const prev = points[points.length - 2]
    drawArrow(g, prev, last, colorNum, lineWidth, alpha)
  }

  // Dead wire stub
  if (!wire.isLive) {
    const last = points[points.length - 1]
    g.fillStyle(hexToNum(COLORS.deadWire), alpha)
    g.fillCircle(last.sx, last.sy, 3)
  }

  // Bundle label for trunk wires
  if (routed.bundleCount && routed.bundleCount > 1 && routed.bundleLabel) {
    // Draw thicker trunk line
    g.lineStyle(drawWidth + 2, colorNum, alpha * 0.5)
    drawWirePath(g, points, 'data')

    // Place label at midpoint of wire path
    const midIdx = Math.floor(points.length / 2)
    const midPt = points[Math.min(midIdx, points.length - 1)]
    const label = scene.add.text(
      midPt.sx, midPt.sy - 10,
      routed.bundleLabel,
      textStyle({
        fontSize: '9px',
        color: '#88bbaa',
        backgroundColor: '#1a472a',
      }),
    )
    label.setOrigin(0.5, 0.5)
    // Destroy label when the graphics object is destroyed
    g.on('destroy', () => label.destroy())
  }

  return g
}

function drawWirePath(
  g: Phaser.GameObjects.Graphics,
  points: IsoPoint[],
  kind: string,
): void {
  if (kind === 'exception') {
    drawDashedPath(g, points, 6, 4)
  } else if (kind === 'control') {
    drawDashedPath(g, points, 3, 3)
  } else {
    // Solid line
    g.beginPath()
    g.moveTo(points[0].sx, points[0].sy)
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].sx, points[i].sy)
    }
    g.strokePath()
  }
}

function drawArrow(
  g: Phaser.GameObjects.Graphics,
  from: IsoPoint,
  to: IsoPoint,
  color: number,
  lineWidth: number,
  alpha: number,
): void {
  const dx = to.sx - from.sx
  const dy = to.sy - from.sy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 5) return

  const nx = dx / len
  const ny = dy / len
  const arrowSize = 5 + lineWidth

  g.fillStyle(color, alpha)
  g.fillTriangle(
    to.sx,
    to.sy,
    to.sx - arrowSize * nx + (arrowSize / 2) * ny,
    to.sy - arrowSize * ny - (arrowSize / 2) * nx,
    to.sx - arrowSize * nx - (arrowSize / 2) * ny,
    to.sy - arrowSize * ny + (arrowSize / 2) * nx,
  )
}
