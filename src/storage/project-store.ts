export interface RecentProject {
  name: string
  handle: FileSystemDirectoryHandle
  openedAt: number
}

const DB_NAME = 'ast-map'
const STORE_NAME = 'recent-projects'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveRecentProject(name: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const project: RecentProject = { name, handle, openedAt: Date.now() }
  store.put(project)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getRecentProjects(): Promise<RecentProject[]> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const req = store.getAll()
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const projects = req.result as RecentProject[]
      projects.sort((a, b) => b.openedAt - a.openedAt)
      resolve(projects)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function removeRecentProject(name: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  store.delete(name)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
