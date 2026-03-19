// Monospace text on isometric plane

import { toIsometric } from '../layout/isometric'
import { COLORS } from './colors'

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  worldZ: number,
  text: string,
  fontSize = 10,
  color = COLORS.labelText,
): void {
  const pos = toIsometric({ x: worldX, y: worldY, z: worldZ })
  ctx.fillStyle = color
  ctx.font = `${fontSize}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, Math.round(pos.sx), Math.round(pos.sy))
}

export function drawScopeLabel(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  worldZ: number,
  text: string,
): void {
  const pos = toIsometric({ x: worldX, y: worldY, z: worldZ })
  ctx.fillStyle = COLORS.scopeBorder
  ctx.font = 'italic 11px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(text, Math.round(pos.sx) + 4, Math.round(pos.sy) - 4)
}
