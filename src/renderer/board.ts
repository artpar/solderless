// PCB background + grid dots

import { COLORS } from './colors'
import { toIsometric, CELL_W, CELL_H } from '../layout/isometric'

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  boardWidth: number,
  boardHeight: number,
): void {
  // Draw grid dots in isometric
  ctx.fillStyle = COLORS.boardGrid
  const cols = Math.ceil(boardWidth / CELL_W) + 4
  const rows = Math.ceil(boardHeight / CELL_H) + 4

  for (let gx = -2; gx < cols; gx++) {
    for (let gy = -2; gy < rows; gy++) {
      const iso = toIsometric({
        x: gx * CELL_W,
        y: gy * CELL_H,
        z: 0,
      })
      ctx.beginPath()
      ctx.arc(Math.round(iso.sx), Math.round(iso.sy), 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function drawBoardOutline(
  ctx: CanvasRenderingContext2D,
  boardWidth: number,
  boardHeight: number,
): void {
  const corners = [
    toIsometric({ x: -CELL_W, y: -CELL_H, z: 0 }),
    toIsometric({ x: boardWidth, y: -CELL_H, z: 0 }),
    toIsometric({ x: boardWidth, y: boardHeight, z: 0 }),
    toIsometric({ x: -CELL_W, y: boardHeight, z: 0 }),
  ]

  ctx.strokeStyle = COLORS.boardEdge
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(corners[0].sx, corners[0].sy)
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].sx, corners[i].sy)
  }
  ctx.closePath()
  ctx.stroke()
}
