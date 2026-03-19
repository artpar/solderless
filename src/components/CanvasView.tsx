import { useCallback, useEffect, useRef, useState } from 'react'
import { PhaserGame } from '../phaser/PhaserGame'
import { EventBus, RESET_VIEWPORT, ANGLE_CHANGED, ROTATION_CHANGED } from '../phaser/EventBus'
import { PositionedBoard } from '../layout/layout'
import { CircuitBoard } from '../analysis/circuit-ir'
import { getIsoRotation, getIsoAngle } from '../layout/isometric'

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

function Compass() {
  const [rot, setRot] = useState(getIsoRotation)
  const [tilt, setTilt] = useState(getIsoAngle)
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onRot = (deg: number) => setRot(deg)
    const onTilt = (deg: number) => setTilt(deg)
    const onReset = () => { setRot(0); setTilt(26.57) }
    EventBus.on(ROTATION_CHANGED, onRot)
    EventBus.on(ANGLE_CHANGED, onTilt)
    EventBus.on(RESET_VIEWPORT, onReset)
    return () => {
      EventBus.off(ROTATION_CHANGED, onRot)
      EventBus.off(ANGLE_CHANGED, onTilt)
      EventBus.off(RESET_VIEWPORT, onReset)
    }
  }, [])

  // Drag on compass: horizontal → rotation, vertical → tilt
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      if (dx !== 0) EventBus.emit(ROTATION_CHANGED, getIsoRotation() + dx * 2)
      if (dy !== 0) EventBus.emit(ANGLE_CHANGED, getIsoAngle() - dy * 0.5)
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  const snapTo = (angle: number) => {
    EventBus.emit(ROTATION_CHANGED, angle)
  }

  // Squash the Y axis based on tilt to give a 3D feel
  const scaleY = Math.max(0.3, 1 - (90 - tilt) / 90 * 0.7)
  const size = 72
  const r = 28

  const dirs = [
    { label: 'N', angle: 0, primary: true },
    { label: 'E', angle: 90, primary: false },
    { label: 'S', angle: 180, primary: false },
    { label: 'W', angle: 270, primary: false },
  ]

  return (
    <div style={compassStyles.wrapper} onPointerDown={onPointerDown}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ cursor: 'grab' }}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          {/* Hit area */}
          <circle cx={0} cy={0} r={r + 4} fill="transparent" />
          {/* Ellipse ring showing tilt */}
          <ellipse cx={0} cy={0} rx={r} ry={r * scaleY}
            fill="rgba(26,71,42,0.4)" stroke="#3a7a4a" strokeWidth={1} opacity={0.7} />
          {/* Direction labels — clickable to snap */}
          {dirs.map(d => {
            const a = (d.angle - rot - 90) * Math.PI / 180
            const x = Math.cos(a) * r
            const y = Math.sin(a) * r * scaleY
            return (
              <text key={d.label} x={x} y={y + 3.5}
                textAnchor="middle"
                fill={d.primary ? '#ff6644' : '#8ab89a'}
                fontSize={d.primary ? 12 : 10}
                fontFamily="monospace"
                fontWeight={d.primary ? 'bold' : 'normal'}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); snapTo(d.angle) }}
              >
                {d.label}
              </text>
            )
          })}
          {/* North pointer line */}
          {(() => {
            const a = (-rot - 90) * Math.PI / 180
            const x = Math.cos(a) * (r - 14)
            const y = Math.sin(a) * (r - 14) * scaleY
            return <line x1={0} y1={0} x2={x} y2={y} stroke="#ff6644" strokeWidth={1.5} opacity={0.6} />
          })()}
          {/* Center dot */}
          <circle cx={0} cy={0} r={2.5} fill="#8ab89a" />
        </g>
      </svg>
    </div>
  )
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
      <Compass />
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

const compassStyles = {
  wrapper: {
    position: 'absolute' as const,
    top: '10px',
    right: '10px',
    zIndex: 10,
    opacity: 0.85,
  },
}
