// Load all source files from a project directory using File System Access API

export interface ProjectFile {
  path: string        // relative path from project root
  name: string        // file name
  content: string
}

export interface ProjectData {
  name: string
  files: ProjectFile[]
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '.cache', 'coverage', '.claude']

export async function loadProject(dirHandle: FileSystemDirectoryHandle): Promise<ProjectData> {
  const files: ProjectFile[] = []
  await walkDirectory(dirHandle, '', files)
  // Sort by path for deterministic ordering
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { name: dirHandle.name, files }
}

async function walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  files: ProjectFile[],
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.kind === 'directory') {
      if (SKIP_DIRS.includes(entry.name)) continue
      const subDir = await dirHandle.getDirectoryHandle(entry.name)
      await walkDirectory(subDir, path, files)
    } else if (entry.kind === 'file') {
      const ext = getExtension(entry.name)
      if (!SOURCE_EXTENSIONS.includes(ext)) continue
      const fileHandle = await dirHandle.getFileHandle(entry.name)
      const file = await fileHandle.getFile()
      const content = await file.text()
      files.push({ path, name: entry.name, content })
    }
  }
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx) : ''
}
