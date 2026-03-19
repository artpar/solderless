// Operator gates: +, -, &&, ||, !, ==, etc.

import { PlacedComponent } from '../../layout/placement'
import { toIsometric } from '../../layout/isometric'
import { getComponentColor, COLORS } from '../colors'
import { drawIsoBox } from './shared'

export function drawGate(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  const { component: comp, worldX, worldY, worldZ, width, height, depth } = pc
  const color = highlighted
    ? COLORS.compBodyHi
    : getComponentColor(comp.kind, comp.isReachable)

  drawIsoBox(ctx, worldX, worldY, worldZ, width, height, depth, color, comp.isReachable)

  // Draw gate symbol
  const center = toIsometric({
    x: worldX + width / 2,
    y: worldY + height / 2,
    z: worldZ + depth,
  })

  ctx.fillStyle = comp.isReachable
    ? highlighted ? COLORS.labelTextHi : COLORS.labelText
    : COLORS.deadLabel
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(comp.operation, Math.round(center.sx), Math.round(center.sy) - 2)

  // Label below
  if (comp.label !== comp.operation) {
    ctx.font = '10px monospace'
    ctx.fillStyle = COLORS.pinText
    ctx.fillText(comp.label.slice(0, 15), Math.round(center.sx), Math.round(center.sy) + 12)
  }
}
