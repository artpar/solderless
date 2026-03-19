// PCB background: grid dots + board outline

import Phaser from 'phaser'
import { toIsometric, CELL_W, CELL_H } from '../../layout/isometric'
import { COLORS } from '../../shared/colors'
import { hexToNum } from '../util'

export function createBoardBackground(
  scene: Phaser.Scene,
  boardWidth: number,
  boardHeight: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0)

  // Grid dots
  const dots = scene.add.graphics()
  const dotColor = hexToNum(COLORS.boardGrid)
  dots.fillStyle(dotColor, 1)

  const cols = Math.ceil(boardWidth / CELL_W) + 4
  const rows = Math.ceil(boardHeight / CELL_H) + 4

  for (let gx = -2; gx < cols; gx++) {
    for (let gy = -2; gy < rows; gy++) {
      const iso = toIsometric({ x: gx * CELL_W, y: gy * CELL_H, z: 0 })
      dots.fillCircle(iso.sx, iso.sy, 3)
    }
  }

  container.add(dots)

  // Board outline
  const outline = scene.add.graphics()
  const corners = [
    toIsometric({ x: -CELL_W, y: -CELL_H, z: 0 }),
    toIsometric({ x: boardWidth, y: -CELL_H, z: 0 }),
    toIsometric({ x: boardWidth, y: boardHeight, z: 0 }),
    toIsometric({ x: -CELL_W, y: boardHeight, z: 0 }),
  ]

  outline.lineStyle(3, hexToNum(COLORS.boardEdge), 1)
  outline.beginPath()
  outline.moveTo(corners[0].sx, corners[0].sy)
  for (let i = 1; i < corners.length; i++) {
    outline.lineTo(corners[i].sx, corners[i].sy)
  }
  outline.closePath()
  outline.strokePath()

  container.add(outline)

  return container
}
