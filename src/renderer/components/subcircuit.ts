// IC chip / function platform (expandable container)

import { PlacedComponent } from '../../layout/placement'
import { toIsometric } from '../../layout/isometric'
import { getComponentColor, COLORS } from '../colors'
import { drawIsoBox, drawPins } from './shared'

export function drawSubcircuit(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  if (pc.isContainer) {
    drawPlatform(ctx, pc, highlighted)
  } else {
    drawChip(ctx, pc, highlighted)
  }
}

/** Expanded container: large platform slab that children sit on */
function drawPlatform(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  const { component: comp, worldX, worldY, worldZ, width, height, platformDepth } = pc
  const color = highlighted
    ? COLORS.compBodyHi
    : getComponentColor(comp.kind, comp.isReachable)

  // Draw the platform slab (thin box at this z-level)
  drawIsoBox(ctx, worldX, worldY, worldZ, width, height, platformDepth, color, comp.isReachable)

  // Label on the front face (bottom-left edge of the platform)
  const labelPos = toIsometric({
    x: worldX + 8,
    y: worldY + height,
    z: worldZ + platformDepth / 2,
  })

  ctx.fillStyle = comp.isReachable
    ? highlighted ? COLORS.labelTextHi : COLORS.labelText
    : COLORS.deadLabel
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  const label = comp.label.length > 30 ? comp.label.slice(0, 28) + '..' : comp.label
  ctx.fillText(label, Math.round(labelPos.sx), Math.round(labelPos.sy))

  // Operation type next to label
  ctx.font = '9px monospace'
  ctx.fillStyle = COLORS.pinText
  const opPos = toIsometric({
    x: worldX + 8,
    y: worldY + height,
    z: worldZ + platformDepth / 2 - 6,
  })
  ctx.fillText(comp.operation, Math.round(opPos.sx), Math.round(opPos.sy) + 12)
}

/** Collapsed chip: small IC with notch (original behavior) */
function drawChip(
  ctx: CanvasRenderingContext2D,
  pc: PlacedComponent,
  highlighted: boolean,
): void {
  const { component: comp, worldX, worldY, worldZ, width, height, depth } = pc
  const color = highlighted
    ? COLORS.compBodyHi
    : getComponentColor(comp.kind, comp.isReachable)

  drawIsoBox(ctx, worldX, worldY, worldZ, width, height, depth, color, comp.isReachable)

  // IC notch on top
  const notchLeft = toIsometric({
    x: worldX + width * 0.35,
    y: worldY,
    z: worldZ + depth + 1,
  })
  const notchRight = toIsometric({
    x: worldX + width * 0.65,
    y: worldY,
    z: worldZ + depth + 1,
  })
  ctx.strokeStyle = comp.isReachable ? COLORS.compBorder : COLORS.deadComp
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(
    (notchLeft.sx + notchRight.sx) / 2,
    (notchLeft.sy + notchRight.sy) / 2,
    6, 0, Math.PI,
  )
  ctx.stroke()

  // Label
  const center = toIsometric({
    x: worldX + width / 2,
    y: worldY + height / 2,
    z: worldZ + depth,
  })

  ctx.fillStyle = comp.isReachable
    ? highlighted ? COLORS.labelTextHi : COLORS.labelText
    : COLORS.deadLabel
  ctx.font = 'bold 11px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const label = comp.label.length > 20 ? comp.label.slice(0, 18) + '..' : comp.label
  ctx.fillText(label, Math.round(center.sx), Math.round(center.sy) - 4)

  // Operation type below
  ctx.font = '9px monospace'
  ctx.fillStyle = COLORS.pinText
  ctx.fillText(comp.operation, Math.round(center.sx), Math.round(center.sy) + 8)

  // Has sub-circuit indicator
  if (comp.subCircuit) {
    ctx.fillStyle = comp.isReachable ? '#5a5' : COLORS.deadComp
    ctx.font = '8px monospace'
    ctx.fillText('▶ expand', Math.round(center.sx), Math.round(center.sy) + 18)
  }

  drawPins(ctx, worldX, worldY, worldZ, width, height, depth,
    comp.inputPins.length, comp.outputPins.length, comp.isReachable)
}
