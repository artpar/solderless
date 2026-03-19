// Shared isometric drawing primitives

import { toIsometric } from '../../layout/isometric'
import { COLORS } from '../colors'

/** Draw an isometric box (3D rectangular prism) */
export function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  worldZ: number,
  w: number,
  h: number,
  d: number,
  color: string,
  isReachable: boolean,
): void {
  const alpha = isReachable ? 1 : 0.4

  // 8 corners of the box
  const tfl = toIsometric({ x: worldX, y: worldY, z: worldZ + d })
  const tfr = toIsometric({ x: worldX + w, y: worldY, z: worldZ + d })
  const tbl = toIsometric({ x: worldX, y: worldY + h, z: worldZ + d })
  const tbr = toIsometric({ x: worldX + w, y: worldY + h, z: worldZ + d })
  const bfl = toIsometric({ x: worldX, y: worldY, z: worldZ })
  const bfr = toIsometric({ x: worldX + w, y: worldY, z: worldZ })
  const bbl = toIsometric({ x: worldX, y: worldY + h, z: worldZ })
  const bbr = toIsometric({ x: worldX + w, y: worldY + h, z: worldZ })

  ctx.save()
  ctx.globalAlpha = alpha

  // Top face (lightest)
  ctx.fillStyle = lighten(color, 20)
  ctx.beginPath()
  ctx.moveTo(tfl.sx, tfl.sy)
  ctx.lineTo(tfr.sx, tfr.sy)
  ctx.lineTo(tbr.sx, tbr.sy)
  ctx.lineTo(tbl.sx, tbl.sy)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = isReachable ? COLORS.compBorder : COLORS.deadComp
  ctx.lineWidth = 1
  ctx.stroke()

  // Right face (medium)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(tfr.sx, tfr.sy)
  ctx.lineTo(bfr.sx, bfr.sy)
  ctx.lineTo(bbr.sx, bbr.sy)
  ctx.lineTo(tbr.sx, tbr.sy)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Left face (darkest)
  ctx.fillStyle = darken(color, 20)
  ctx.beginPath()
  ctx.moveTo(tfl.sx, tfl.sy)
  ctx.lineTo(bfl.sx, bfl.sy)
  ctx.lineTo(bbl.sx, bbl.sy)
  ctx.lineTo(tbl.sx, tbl.sy)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}

/** Draw pin indicators on a component */
export function drawPins(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  worldZ: number,
  w: number,
  h: number,
  d: number,
  inputCount: number,
  outputCount: number,
  isReachable: boolean,
): void {
  const pinColor = isReachable ? COLORS.dataWire : COLORS.deadWire

  // Input pins on left side
  for (let i = 0; i < inputCount; i++) {
    const yOff = inputCount === 1
      ? h / 2
      : (i / (inputCount - 1)) * h
    const pos = toIsometric({ x: worldX - 4, y: worldY + yOff, z: worldZ + d })
    ctx.fillStyle = pinColor
    ctx.beginPath()
    ctx.arc(pos.sx, pos.sy, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Output pins on right side
  for (let i = 0; i < outputCount; i++) {
    const yOff = outputCount === 1
      ? h / 2
      : (i / (outputCount - 1)) * h
    const pos = toIsometric({ x: worldX + w + 4, y: worldY + yOff, z: worldZ + d })
    ctx.fillStyle = pinColor
    ctx.beginPath()
    ctx.arc(pos.sx, pos.sy, 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function lighten(hex: string, amount: number): string {
  return adjustColor(hex, amount)
}

function darken(hex: string, amount: number): string {
  return adjustColor(hex, -amount)
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
