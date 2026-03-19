// Type-colored block pins on components

import Phaser from 'phaser'
import { Pin } from '../../analysis/circuit-ir'
import { toIsometric, UNIT_SIZE } from '../../layout/isometric'
import { getTypeColor, COLORS } from '../../shared/colors'
import { drawIsoBoxOnGraphics } from './IsoBox'
import { hexToNum, textStyle } from '../util'

const TYPE_BLOCK_PROTRUSION = 12
const TYPE_PIN_GAP = 8

/** Draw type pins on a graphics object, returns Text objects for labels */
export function drawTypePinsOnGraphics(
  scene: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  worldX: number,
  worldY: number,
  worldZ: number,
  w: number,
  h: number,
  d: number,
  pins: Pin[],
  side: 'input' | 'output',
  isReachable: boolean,
): Phaser.GameObjects.Text[] {
  if (pins.length === 0) return []

  const texts: Phaser.GameObjects.Text[] = []
  const totalUnits = pins.reduce((sum, p) => sum + p.typeShape.units, 0)
  const totalHeight = totalUnits * UNIT_SIZE + Math.max(0, pins.length - 1) * TYPE_PIN_GAP
  const startY = worldY + (h - totalHeight) / 2

  let curY = startY

  for (const pin of pins) {
    const blockH = Math.max(pin.typeShape.units * UNIT_SIZE, 4)
    const blockW = TYPE_BLOCK_PROTRUSION
    const color = getTypeColor(pin.typeShape.tag)

    const bx = side === 'input' ? worldX - blockW : worldX + w
    const bz = worldZ + d

    drawIsoBoxOnGraphics(g, bx, curY, bz, blockW, blockH, 4, color, isReachable)

    // Label on top of block
    const labelPos = toIsometric({
      x: bx + blockW / 2,
      y: curY + blockH / 2,
      z: bz + 5,
    })
    const labelColor = isReachable ? '#eeeeee' : COLORS.deadLabel
    const label = pin.typeShape.label.slice(0, 6)
    const text = scene.add.text(labelPos.sx, labelPos.sy, label, textStyle({
      fontSize: '10px',
      color: labelColor,
      align: 'center',
    }))
    text.setOrigin(0.5, 0.5)
    text.setAlpha(isReachable ? 1 : 0.4)
    texts.push(text)

    curY += blockH + TYPE_PIN_GAP
  }

  return texts
}
