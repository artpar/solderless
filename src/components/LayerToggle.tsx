import { COLORS } from '../renderer/colors'

interface LayerToggleProps {
  showData: boolean
  showClock: boolean
  showException: boolean
  onToggleData: () => void
  onToggleClock: () => void
  onToggleException: () => void
}

export function LayerToggle({
  showData,
  showClock,
  showException,
  onToggleData,
  onToggleClock,
  onToggleException,
}: LayerToggleProps) {
  return (
    <div style={styles.container}>
      <span style={styles.title}>Layers</span>
      <button
        style={{
          ...styles.toggle,
          backgroundColor: showData ? COLORS.dataWire : '#333',
          opacity: showData ? 1 : 0.5,
        }}
        onClick={onToggleData}
      >
        Data
      </button>
      <button
        style={{
          ...styles.toggle,
          backgroundColor: showClock ? COLORS.clockWire : '#333',
          opacity: showClock ? 1 : 0.5,
        }}
        onClick={onToggleClock}
      >
        Clock
      </button>
      <button
        style={{
          ...styles.toggle,
          backgroundColor: showException ? COLORS.exceptionWire : '#333',
          opacity: showException ? 1 : 0.5,
        }}
        onClick={onToggleException}
      >
        Exception
      </button>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    backgroundColor: '#252525',
    borderTop: '1px solid #333',
  },
  title: {
    color: '#888',
    fontSize: '11px',
    fontFamily: 'monospace',
    marginRight: '4px',
  },
  toggle: {
    padding: '3px 8px',
    border: '1px solid #555',
    borderRadius: '3px',
    color: '#fff',
    fontSize: '10px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
}
