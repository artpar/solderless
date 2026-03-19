import { useState, useCallback } from 'react'
import { CodeEditor } from './components/CodeEditor'
import { CanvasView } from './components/CanvasView'
import { LayerToggle } from './components/LayerToggle'
import { FileTree } from './components/FileTree'
import { useCircuitAnalysis, useProjectAnalysis } from './hooks/useCircuitAnalysis'
import { loadProject, ProjectFile, ProjectData } from './analysis/project-loader'

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

  // Single-file analysis
  const singleCode = view.kind === 'single' ? view.code
    : view.kind === 'project' && view.selectedFile ? view.selectedFile.content
    : ''
  const singleAnalysis = useCircuitAnalysis(singleCode)

  // Project-level analysis
  const projectFiles = view.kind === 'project' ? view.project.files : null
  const projectName = view.kind === 'project' ? view.project.name : ''
  const projectAnalysis = useProjectAnalysis(projectFiles, projectName)

  // Show project board when no file is selected, otherwise show file board
  const showProjectView = view.kind === 'project' && view.selectedFile === null
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

  const handleOpenProject = useCallback(async () => {
    try {
      const dirHandle = await (window as any).showDirectoryPicker()
      const project = await loadProject(dirHandle)
      setView({ kind: 'project', project, selectedFile: null })
    } catch (e) {
      // User cancelled or API not available
      if ((e as Error).name !== 'AbortError') {
        console.error('Failed to open project:', e)
      }
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

  return (
    <div style={styles.app}>
      <div style={styles.sidePane}>
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
          <button style={styles.projectBtn} onClick={handleOpenProject}>
            Open Project Folder
          </button>
        )}
      </div>
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

const styles = {
  app: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  sidePane: {
    width: '35%',
    minWidth: '300px',
    maxWidth: '500px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
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
  projectBtn: {
    padding: '8px',
    backgroundColor: '#2a5a3a',
    color: '#ccc',
    border: 'none',
    borderTop: '1px solid #333',
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
