import { useState, useCallback, useRef, useEffect } from 'react'
import { CodeEditor } from './components/CodeEditor'
import { CanvasView } from './components/CanvasView'
import { LayerToggle } from './components/LayerToggle'
import { FileTree } from './components/FileTree'
import { useCircuitAnalysis, useProjectAnalysis } from './hooks/useCircuitAnalysis'
import { loadProject, ProjectFile, ProjectData } from './analysis/project-loader'
import { EventBus, TOGGLE_COLLAPSE } from './phaser/EventBus'
import { CircuitBoard, Component } from './analysis/circuit-ir'
import { saveRecentProject, getRecentProjects, removeRecentProject, RecentProject } from './storage/project-store'

type ViewMode =
  | { kind: 'single'; code: string; fileName: string }
  | { kind: 'project'; project: ProjectData; selectedFile: ProjectFile | null }

export default function App() {
  const [view, setView] = useState<ViewMode>({
    kind: 'single',
    code: CodeEditor.DEFAULT_CODE,
    fileName: 'Source Code',
  })
  const [showData, setShowData] = useState(true)
  const [showClock, setShowClock] = useState(true)
  const [showException, setShowException] = useState(true)
  const [layoutVersion, setLayoutVersion] = useState(0)

  // Single-file analysis
  const singleCode = view.kind === 'single' ? view.code
    : view.kind === 'project' && view.selectedFile ? view.selectedFile.content
    : ''
  const singleAnalysis = useCircuitAnalysis(singleCode, layoutVersion)

  // Project-level analysis
  const projectFiles = view.kind === 'project' ? view.project.files : null
  const projectName = view.kind === 'project' ? view.project.name : ''
  const projectAnalysis = useProjectAnalysis(projectFiles, projectName, layoutVersion)

  // Show project board when no file is selected, otherwise show file board
  const showProjectView = view.kind === 'project' && view.selectedFile === null

  // Handle collapse toggle from Phaser scene
  useEffect(() => {
    const onToggle = (compId: string) => {
      const board = showProjectView ? projectAnalysis.board : singleAnalysis.board
      if (!board) return
      const comp = findComponentById(board, compId)
      if (comp && comp.subCircuit) {
        comp.collapsed = !comp.collapsed
        setLayoutVersion(v => v + 1)
      }
    }
    EventBus.on(TOGGLE_COLLAPSE, onToggle)
    return () => { EventBus.off(TOGGLE_COLLAPSE, onToggle) }
  })
  const activeBoard = showProjectView ? projectAnalysis.board : singleAnalysis.board
  const activePositioned = showProjectView ? projectAnalysis.positioned : singleAnalysis.positioned
  const activeError = showProjectView ? projectAnalysis.error : singleAnalysis.error

  const toggleData = useCallback(() => setShowData((v) => !v), [])
  const toggleClock = useCallback(() => setShowClock((v) => !v), [])
  const toggleException = useCallback(() => setShowException((v) => !v), [])

  const handleCodeChange = useCallback((code: string) => {
    setView((v) => {
      if (v.kind === 'single') return { ...v, code }
      return v
    })
  }, [])

  const handleFileNameChange = useCallback((fileName: string) => {
    setView((v) => {
      if (v.kind === 'single') return { ...v, fileName }
      return v
    })
  }, [])

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [showRecents, setShowRecents] = useState(false)

  useEffect(() => {
    getRecentProjects().then(setRecentProjects).catch(() => {})
  }, [])

  const handleOpenProject = useCallback(async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker()
      const project = await loadProject(dirHandle)
      setView({ kind: 'project', project, selectedFile: null })
      await saveRecentProject(project.name, dirHandle)
      setRecentProjects(await getRecentProjects())
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to open project:', e)
      }
    }
  }, [])

  const handleOpenRecent = useCallback(async (recent: RecentProject) => {
    setShowRecents(false)
    try {
      const perm = await (recent.handle as any).requestPermission({ mode: 'read' })
      if (perm !== 'granted') {
        await removeRecentProject(recent.name)
        setRecentProjects(prev => prev.filter(p => p.name !== recent.name))
        return
      }
      const project = await loadProject(recent.handle)
      setView({ kind: 'project', project, selectedFile: null })
      await saveRecentProject(project.name, recent.handle)
      setRecentProjects(await getRecentProjects())
    } catch (e) {
      console.error('Failed to reopen project:', e)
      await removeRecentProject(recent.name)
      setRecentProjects(prev => prev.filter(p => p.name !== recent.name))
    }
  }, [])

  const handleSelectFile = useCallback((file: ProjectFile) => {
    setView((v) => {
      if (v.kind === 'project') return { ...v, selectedFile: file }
      return v
    })
  }, [])

  const handleShowProject = useCallback(() => {
    setView((v) => {
      if (v.kind === 'project') return { ...v, selectedFile: null }
      return v
    })
  }, [])

  const handleBackToSingle = useCallback(() => {
    setView({ kind: 'single', code: CodeEditor.DEFAULT_CODE, fileName: 'Source Code' })
  }, [])

  const [sidePaneWidth, setSidePaneWidth] = useState(400)
  const dragging = useRef(false)

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const w = Math.max(200, Math.min(ev.clientX, window.innerWidth - 200))
      setSidePaneWidth(w)
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div style={styles.app}>
      <div style={{ ...styles.sidePane, width: sidePaneWidth }}>
        {view.kind === 'single' ? (
          <CodeEditor
            value={view.code}
            onChange={handleCodeChange}
            fileName={view.fileName}
            onFileNameChange={handleFileNameChange}
            onOpenProject={handleOpenProject}
          />
        ) : (
          <>
            <FileTree
              files={view.project.files}
              selectedPath={view.selectedFile?.path ?? null}
              onSelectFile={handleSelectFile}
              onShowProject={handleShowProject}
              projectName={view.project.name}
            />
            {view.selectedFile && (
              <div style={styles.filePreview}>
                <div style={styles.filePreviewHeader}>
                  {view.selectedFile.path}
                </div>
                <pre style={styles.filePreviewCode}>
                  {view.selectedFile.content}
                </pre>
              </div>
            )}
          </>
        )}
        {view.kind === 'project' && (
          <button style={styles.backBtn} onClick={handleBackToSingle}>
            Back to Editor
          </button>
        )}
        {view.kind === 'single' && (
          <div style={styles.splitBtnWrap}>
            <button style={styles.projectBtn} onClick={handleOpenProject}>
              Open Project Folder
            </button>
            {recentProjects.length > 0 && (
              <div style={{ position: 'relative' as const }}>
                <button
                  style={styles.dropdownArrow}
                  onClick={() => setShowRecents(v => !v)}
                >
                  {showRecents ? '\u25BC' : '\u25B2'}
                </button>
                {showRecents && (
                  <div style={styles.recentsDropdown}>
                    <div style={styles.recentsHeader}>Recent Projects</div>
                    {recentProjects.map(rp => (
                      <div
                        key={rp.name}
                        style={styles.recentItem}
                        onClick={() => handleOpenRecent(rp)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#3a3a3a' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                      >
                        {rp.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={styles.resizeHandle} onMouseDown={onResizeStart} />
      <div style={styles.canvasPane}>
        <CanvasView
          positioned={activePositioned}
          board={activeBoard}
          layers={{ showData, showClock, showException }}
          error={activeError}
        />
        <LayerToggle
          showData={showData}
          showClock={showClock}
          showException={showException}
          onToggleData={toggleData}
          onToggleClock={toggleClock}
          onToggleException={toggleException}
        />
      </div>
    </div>
  )
}

function findComponentById(board: CircuitBoard, id: string): Component | null {
  for (const comp of board.components) {
    if (comp.id === id) return comp
    if (comp.subCircuit) {
      const found = findComponentById(comp.subCircuit, id)
      if (found) return found
    }
  }
  return null
}

const styles = {
  app: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  sidePane: {
    flexShrink: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  resizeHandle: {
    width: 5,
    cursor: 'col-resize',
    backgroundColor: '#333',
    flexShrink: 0,
    zIndex: 10,
  },
  canvasPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
  },
  filePreview: {
    flex: 1,
    overflow: 'auto',
    borderTop: '1px solid #333',
    backgroundColor: '#1e1e1e',
  },
  filePreviewHeader: {
    padding: '6px 10px',
    backgroundColor: '#252525',
    color: '#aaa',
    fontSize: '11px',
    fontFamily: 'monospace',
    borderBottom: '1px solid #333',
  },
  filePreviewCode: {
    padding: '10px',
    margin: 0,
    color: '#d4d4d4',
    fontSize: '12px',
    fontFamily: 'monospace',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap' as const,
  },
  splitBtnWrap: {
    display: 'flex',
    borderTop: '1px solid #333',
  },
  projectBtn: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#2a5a3a',
    color: '#ccc',
    border: 'none',
    fontSize: '12px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  dropdownArrow: {
    padding: '8px 10px',
    backgroundColor: '#2a5a3a',
    color: '#ccc',
    border: 'none',
    borderLeft: '1px solid #3a7a4a',
    fontSize: '10px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  recentsDropdown: {
    position: 'absolute' as const,
    bottom: '100%',
    right: 0,
    width: '220px',
    backgroundColor: '#252525',
    border: '1px solid #444',
    borderRadius: '4px',
    overflow: 'hidden',
    zIndex: 100,
  },
  recentsHeader: {
    padding: '6px 10px',
    color: '#888',
    fontSize: '10px',
    fontFamily: 'monospace',
    borderBottom: '1px solid #333',
  },
  recentItem: {
    padding: '6px 10px',
    color: '#ccc',
    fontSize: '12px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
  backBtn: {
    padding: '8px',
    backgroundColor: '#3a3a3a',
    color: '#aaa',
    border: 'none',
    borderTop: '1px solid #333',
    fontSize: '12px',
    fontFamily: 'monospace',
    cursor: 'pointer',
  },
}
