import { useViewport } from '../hooks/useViewport'
import { useCanvasRenderer } from '../hooks/useCanvasRenderer'
import { PositionedBoard } from '../layout/layout'
import { CircuitBoard } from '../analysis/circuit-ir'

interface CanvasViewProps {
  positioned: PositionedBoard | null
  board: CircuitBoard | null
  layers: { showData: boolean; showClock: boolean; showException: boolean }
  error: string | null
}

export function CanvasView({ positioned, board, layers, error }: CanvasViewProps) {
  const { viewport, onMouseDown, onMouseMove, onMouseUp, onWheel, resetViewport } =
    useViewport()

  const { canvasRef, onCanvasMouseMove, onCanvasClick } = useCanvasRenderer(
    positioned,
    board,
    viewport,
    layers,
  )

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    onMouseMove(e)
    onCanvasMouseMove(e)
  }

  return (
    <div style={styles.container}>
      {error && (
        <div style={styles.error}>
          <span style={styles.errorIcon}>!</span>
          {error}
        </div>
      )}
      {!positioned && !error && (
        <div style={styles.empty}>
          Enter some code to see the circuit board
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={onMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onCanvasClick}
      />
      <div style={styles.controls}>
        <button style={styles.button} onClick={resetViewport}>
          Reset View
        </button>
        <span style={styles.zoomLabel}>
          {Math.round(viewport.zoom * 100)}%
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'relative' as const,
    height: '100%',
    backgroundColor: '#1a472a',
    overflow: 'hidden',
  },
  canvas: {
    width: '100%',
    height: '100%',
    cursor: 'grab',
  },
  error: {
    position: 'absolute' as const,
    top: '8px',
    left: '8px',
    right: '8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(180, 40, 40, 0.9)',
    color: '#fff',
    fontSize: '12px',
    fontFamily: 'monospace',
    borderRadius: '4px',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  errorIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#ff5555',
    fontWeight: 'bold' as const,
    fontSize: '12px',
    flexShrink: 0,
  },
  empty: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#5a8a6a',
    fontSize: '14px',
    fontFamily: 'monospace',
  },
  controls: {
    position: 'absolute' as const,
    bottom: '8px',
    right: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  button: {
    padding: '4px 10px',
    backgroundColor: '#2a5a3a',
    color: '#ccc',
    border: '1px solid #3a7a4a',
    borderRadius: '3px',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  zoomLabel: {
    color: '#7a9a8a',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
}
