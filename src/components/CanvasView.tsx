import { useCallback } from 'react'
import { PhaserGame } from '../phaser/PhaserGame'
import { EventBus, RESET_VIEWPORT, ANGLE_CHANGED, ROTATION_CHANGED } from '../phaser/EventBus'
import { PositionedBoard } from '../layout/layout'
import { CircuitBoard } from '../analysis/circuit-ir'

const PRESETS = [
  { label: 'Iso', tilt: 26.57, rot: 0 },
  { label: 'Top', tilt: 5, rot: 0 },
  { label: 'Front', tilt: 26.57, rot: 45 },
  { label: 'Side', tilt: 26.57, rot: -45 },
  { label: 'Steep', tilt: 50, rot: 0 },
] as const

interface CanvasViewProps {
  positioned: PositionedBoard | null
  board: CircuitBoard | null
  layers: { showData: boolean; showClock: boolean; showException: boolean }
  error: string | null
}

export function CanvasView({ positioned, board, layers, error }: CanvasViewProps) {
  const resetViewport = useCallback(() => {
    EventBus.emit(RESET_VIEWPORT)
  }, [])

  const applyPreset = useCallback((tilt: number, rot: number) => {
    EventBus.emit(ANGLE_CHANGED, tilt)
    EventBus.emit(ROTATION_CHANGED, rot)
  }, [])

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
      <PhaserGame
        positioned={positioned}
        board={board}
        layers={layers}
      />
      <div style={styles.controls}>
        {PRESETS.map(p => (
          <button key={p.label} style={styles.presetButton} onClick={() => applyPreset(p.tilt, p.rot)}>
            {p.label}
          </button>
        ))}
        <button style={styles.button} onClick={resetViewport}>
          Reset View
        </button>
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
    zIndex: 5,
  },
  controls: {
    position: 'absolute' as const,
    bottom: '8px',
    right: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 10,
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
  presetButton: {
    padding: '4px 8px',
    backgroundColor: '#1e4a2e',
    color: '#99b8a5',
    border: '1px solid #2a5a3a',
    borderRadius: '3px',
    fontSize: '10px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
}
