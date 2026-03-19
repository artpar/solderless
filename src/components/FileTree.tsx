import { ProjectFile } from '../analysis/project-loader'

interface FileTreeProps {
  files: ProjectFile[]
  selectedPath: string | null
  onSelectFile: (file: ProjectFile) => void
  onShowProject: () => void
  projectName: string
}

export function FileTree({ files, selectedPath, onSelectFile, onShowProject, projectName }: FileTreeProps) {
  // Group files by directory
  const tree = buildTree(files)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button
          style={{
            ...styles.projectBtn,
            backgroundColor: selectedPath === null ? '#3a7a4a' : '#2a5a3a',
          }}
          onClick={onShowProject}
        >
          {projectName}
        </button>
        <span style={styles.count}>{files.length} files</span>
      </div>
      <div style={styles.list}>
        {renderNode(tree, '', selectedPath, onSelectFile, files)}
      </div>
    </div>
  )
}

interface TreeNode {
  name: string
  children: Map<string, TreeNode>
  file?: ProjectFile
}

function buildTree(files: ProjectFile[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map() }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children.has(parts[i])) {
        node.children.set(parts[i], { name: parts[i], children: new Map() })
      }
      node = node.children.get(parts[i])!
    }
    const fileName = parts[parts.length - 1]
    node.children.set(fileName, { name: fileName, children: new Map(), file })
  }
  return root
}

function renderNode(
  node: TreeNode,
  indent: string,
  selectedPath: string | null,
  onSelectFile: (file: ProjectFile) => void,
  files: ProjectFile[],
): JSX.Element[] {
  const elements: JSX.Element[] = []
  const sorted = [...node.children.entries()].sort(([a, an], [b, bn]) => {
    // Directories first, then files
    const aDir = an.children.size > 0 && !an.file
    const bDir = bn.children.size > 0 && !bn.file
    if (aDir && !bDir) return -1
    if (!aDir && bDir) return 1
    return a.localeCompare(b)
  })

  for (const [name, child] of sorted) {
    const isDir = child.children.size > 0 && !child.file
    const isSelected = child.file?.path === selectedPath

    if (isDir) {
      elements.push(
        <div key={`dir-${indent}${name}`} style={styles.dir}>
          {indent}{name}/
        </div>,
      )
      elements.push(
        ...renderNode(child, indent + '  ', selectedPath, onSelectFile, files),
      )
    } else if (child.file) {
      elements.push(
        <div
          key={child.file.path}
          style={{
            ...styles.file,
            backgroundColor: isSelected ? '#2a4a3a' : 'transparent',
            color: isSelected ? '#fff' : '#aaa',
          }}
          onClick={() => onSelectFile(child.file!)}
        >
          {indent}{name}
        </div>,
      )
    }
  }

  return elements
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: '#1e1e1e',
    borderRight: '1px solid #333',
  },
  header: {
    padding: '6px 10px',
    backgroundColor: '#252525',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  projectBtn: {
    padding: '3px 10px',
    color: '#ccc',
    border: '1px solid #3a7a4a',
    borderRadius: '3px',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    fontWeight: 'bold' as const,
  },
  count: {
    color: '#666',
    fontSize: '10px',
    fontFamily: 'monospace',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  dir: {
    padding: '2px 10px',
    color: '#7a9a8a',
    cursor: 'default',
    whiteSpace: 'pre' as const,
  },
  file: {
    padding: '2px 10px',
    cursor: 'pointer',
    whiteSpace: 'pre' as const,
  },
}
