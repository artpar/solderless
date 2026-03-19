// Edge connector (import/export/return/throw)

import { PlacedComponent } from '../../layout/placement'
import { toIsometric } from '../../layout/isometric'
import { getComponentColor, COLORS } from '../colors'
import { drawIsoBox, drawTypePins } from './shared'

export function drawConnector(
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

  const isImport = comp.operation.startsWith('import')
  const isExport = comp.operation.startsWith('export')
  const isReturn = comp.operation === 'return'
  const isThrow = comp.operation === 'throw'

  ctx.fillStyle = comp.isReachable
    ? highlighted ? COLORS.labelTextHi : COLORS.labelText
    : COLORS.deadLabel
  ctx.font = 'bold 11px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let symbol = '●'
  if (isImport) symbol = '→'
  if (isExport) symbol = '←'
  if (isReturn) symbol = '↩'
  if (isThrow) symbol = '⚡'

  ctx.fillText(symbol, Math.round(center.sx) - 15, Math.round(center.sy))

  const label = comp.label.length > 15 ? comp.label.slice(0, 13) + '..' : comp.label
  ctx.font = '10px monospace'
  ctx.fillText(label, Math.round(center.sx) + 5, Math.round(center.sy))

  drawTypePins(ctx, worldX, worldY, worldZ, width, height, depth,
    comp.inputPins, 'input', comp.isReachable)
  drawTypePins(ctx, worldX, worldY, worldZ, width, height, depth,
    comp.outputPins, 'output', comp.isReachable)
}
