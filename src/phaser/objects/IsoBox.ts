// Isometric box drawing on Phaser Graphics

import Phaser from 'phaser'
import { toIsometric } from '../../layout/isometric'
import { COLORS } from '../../shared/colors'
import { hexToNum, lighten, darken } from '../util'

/** Draw an isometric box onto a Graphics object */
export function drawIsoBoxOnGraphics(
  g: Phaser.GameObjects.Graphics,
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

  // 8 corners
  const tfl = toIsometric({ x: worldX, y: worldY, z: worldZ + d })
  const tfr = toIsometric({ x: worldX + w, y: worldY, z: worldZ + d })
  const tbl = toIsometric({ x: worldX, y: worldY + h, z: worldZ + d })
  const tbr = toIsometric({ x: worldX + w, y: worldY + h, z: worldZ + d })
  const bfl = toIsometric({ x: worldX, y: worldY, z: worldZ })
  const bfr = toIsometric({ x: worldX + w, y: worldY, z: worldZ })
  const bbl = toIsometric({ x: worldX, y: worldY + h, z: worldZ })
  const bbr = toIsometric({ x: worldX + w, y: worldY + h, z: worldZ })

  const borderColor = hexToNum(isReachable ? COLORS.compBorder : COLORS.deadComp)

  // Top face (lightest)
  g.fillStyle(hexToNum(lighten(color, 20)), alpha)
  g.beginPath()
  g.moveTo(tfl.sx, tfl.sy)
  g.lineTo(tfr.sx, tfr.sy)
  g.lineTo(tbr.sx, tbr.sy)
  g.lineTo(tbl.sx, tbl.sy)
  g.closePath()
  g.fillPath()
  g.lineStyle(1, borderColor, alpha)
  g.strokePath()

  // Right face (medium)
  g.fillStyle(hexToNum(color), alpha)
  g.beginPath()
  g.moveTo(tfr.sx, tfr.sy)
  g.lineTo(bfr.sx, bfr.sy)
  g.lineTo(bbr.sx, bbr.sy)
  g.lineTo(tbr.sx, tbr.sy)
  g.closePath()
  g.fillPath()
  g.lineStyle(1, borderColor, alpha)
  g.strokePath()

  // Left face (darkest)
  g.fillStyle(hexToNum(darken(color, 20)), alpha)
  g.beginPath()
  g.moveTo(tfl.sx, tfl.sy)
  g.lineTo(bfl.sx, bfl.sy)
  g.lineTo(bbl.sx, bbl.sy)
  g.lineTo(tbl.sx, tbl.sy)
  g.closePath()
  g.fillPath()
  g.lineStyle(1, borderColor, alpha)
  g.strokePath()
}

/** Get the isometric polygon points for the top face (for hit area) */
export function getTopFacePoints(
  worldX: number,
  worldY: number,
  worldZ: number,
  w: number,
  h: number,
  d: number,
): Phaser.Geom.Polygon {
  const tfl = toIsometric({ x: worldX, y: worldY, z: worldZ + d })
  const tfr = toIsometric({ x: worldX + w, y: worldY, z: worldZ + d })
  const tbl = toIsometric({ x: worldX, y: worldY + h, z: worldZ + d })
  const tbr = toIsometric({ x: worldX + w, y: worldY + h, z: worldZ + d })

  // Expand hit area to include full box height
  const bfl = toIsometric({ x: worldX, y: worldY, z: worldZ })
  const bfr = toIsometric({ x: worldX + w, y: worldY, z: worldZ })
  const bbl = toIsometric({ x: worldX, y: worldY + h, z: worldZ })
  const bbr = toIsometric({ x: worldX + w, y: worldY + h, z: worldZ })

  // Full isometric box outline (hexagonal hit area)
  return new Phaser.Geom.Polygon([
    tfl.sx, tfl.sy,
    tfr.sx, tfr.sy,
    bfr.sx, bfr.sy,
    bbr.sx, bbr.sy,
    bbl.sx, bbl.sy,
    tbl.sx, tbl.sy,
  ])
}
