// Multiplexer: ternary, if/else merge

import { PlacedComponent } from '../../layout/placement'
import { toIsometric } from '../../layout/isometric'
import { getComponentColor, COLORS } from '../colors'
import { drawIsoBox, drawTypePins } from './shared'

export function drawMux(
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
    ? highlighted ? COLORS.labelTextHi : COLORS.labelText
    : COLORS.deadLabel
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('MUX', Math.round(center.sx), Math.round(center.sy) - 2)

  ctx.font = '9px monospace'
  ctx.fillStyle = COLORS.pinText
  ctx.fillText(comp.label.slice(0, 12), Math.round(center.sx), Math.round(center.sy) + 10)

  drawTypePins(ctx, worldX, worldY, worldZ, width, height, depth,
    comp.inputPins, 'input', comp.isReachable)
  drawTypePins(ctx, worldX, worldY, worldZ, width, height, depth,
    comp.outputPins, 'output', comp.isReachable)
}
