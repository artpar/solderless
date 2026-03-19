// Phaser rendering utilities

import { IsoPoint } from '../layout/isometric'

/** Convert '#RRGGBB' hex string to 0xRRGGBB number for Phaser */
export function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

/** Draw a dashed path on a Phaser Graphics object (Phaser lacks setLineDash) */
export function drawDashedPath(
  g: Phaser.GameObjects.Graphics,
  points: IsoPoint[],
  dashLen: number,
  gapLen: number,
): void {
  if (points.length < 2) return

  let drawing = true
  let remaining = dashLen

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]
    const to = points[i + 1]
    const dx = to.sx - from.sx
    const dy = to.sy - from.sy
    const segLen = Math.sqrt(dx * dx + dy * dy)
    if (segLen === 0) continue

    const nx = dx / segLen
    const ny = dy / segLen
    let traveled = 0

    while (traveled < segLen) {
      const step = Math.min(remaining, segLen - traveled)
      const startX = from.sx + nx * traveled
      const startY = from.sy + ny * traveled
      const endX = startX + nx * step
      const endY = startY + ny * step

      if (drawing) {
        g.lineBetween(startX, startY, endX, endY)
      }

      traveled += step
      remaining -= step

      if (remaining <= 0) {
        drawing = !drawing
        remaining = drawing ? dashLen : gapLen
      }
    }
  }
}

/** Lighten a hex color by amount (per channel) */
export function lighten(hex: string, amount: number): string {
  return adjustColor(hex, amount)
}

/** Darken a hex color by amount (per channel) */
export function darken(hex: string, amount: number): string {
  return adjustColor(hex, -amount)
}

/** Create a text style with shared defaults */
export function textStyle(overrides: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#ffffff',
    ...overrides,
  }
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
