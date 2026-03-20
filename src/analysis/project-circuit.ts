// Builds a project-level CircuitBoard where each file is a subcircuit
// and imports between files become wires between subcircuits.

import ts from 'typescript'
import {
  CircuitBoard,
  Component,
  Wire,
  Pin,
  TypeShape,
  makeBoard,
  makeComponent,
  makeWire,
  makePin,
  genId,
  resetIdCounter,
} from './circuit-ir'
import { buildCircuit } from './ast-to-circuit'
import { ProjectFile } from './project-loader'

export function buildProjectCircuit(files: ProjectFile[], projectName: string): CircuitBoard {
  resetIdCounter()

  const board = makeBoard(projectName)

  // Map from file path (normalized) → component + its per-file board
  const fileComponents = new Map<string, { comp: Component; fileBoard: CircuitBoard }>()

  // Map from export name (filePath::exportName) → output pin
  const exportPins = new Map<string, string>()

  // 1. Create a subcircuit component for each file and build its internal circuit
  for (const file of files) {
    const shortName = file.path
    const comp = makeComponent('subcircuit', 'file', shortName, 0, 0, null)
    comp.isReachable = true

    let fileBoard: CircuitBoard
    try {
      fileBoard = buildCircuit(file.content)
      fileBoard.name = file.path
    } catch {
      // If a file fails to parse, create an empty board
      fileBoard = makeBoard(file.path)
    }

    comp.subCircuit = fileBoard

    // Create output pins for exports found in the file
    const exports = extractExports(file.content, file.path)
    for (const exp of exports) {
      const shape: TypeShape = { tag: exp.kind, units: 3, label: exp.name.slice(0, 6) }
      const pin = makePin(comp.id, exp.name, 'output', shape)
      comp.outputPins.push(pin)
      exportPins.set(`${normalizePath(file.path)}::${exp.name}`, pin.id)
    }

    // Also add a "default" output pin
    const moduleShape: TypeShape = { tag: 'object', units: 3, label: 'mod' }
    const defaultPin = makePin(comp.id, 'module', 'output', moduleShape)
    comp.outputPins.push(defaultPin)
    exportPins.set(`${normalizePath(file.path)}::*`, defaultPin.id)

    board.components.push(comp)
    board.subBoards.push(fileBoard)
    fileComponents.set(normalizePath(file.path), { comp, fileBoard })
  }

  // 2. Parse imports and create wires between file components
  for (const file of files) {
    const imports = extractImports(file.content, file.path)
    const srcEntry = fileComponents.get(normalizePath(file.path))
    if (!srcEntry) continue

    for (const imp of imports) {
      const resolvedPath = resolveImportPath(file.path, imp.moduleSpecifier, files)
      if (!resolvedPath) continue

      const tgtEntry = fileComponents.get(normalizePath(resolvedPath))
      if (!tgtEntry) continue

      // Create input pin on the importing file's component
      const importShape: TypeShape = { tag: 'function', units: 3, label: imp.name.slice(0, 6) }
      const inputPin = makePin(srcEntry.comp.id, imp.name, 'input', importShape)
      srcEntry.comp.inputPins.push(inputPin)

      // Find the matching export pin
      let exportPinId = exportPins.get(`${normalizePath(resolvedPath)}::${imp.name}`)
      if (!exportPinId) {
        exportPinId = exportPins.get(`${normalizePath(resolvedPath)}::*`)
      }

      if (exportPinId) {
        board.wires.push(makeWire(exportPinId, inputPin.id))
      }
    }
  }

  // 3. Detect entry points
  detectEntryPoints(files, fileComponents)

  // 4. Group files by directory into container subcircuits
  groupByDirectory(board, files, fileComponents)

  // 5. Build clock line based on rough dependency order
  // Uses the top-level components (may now include directory groups)
  const topCompIds = new Set(board.components.map(c => c.id))
  const ordered = topologicalSort(files, fileComponents)
  // Build clock line between top-level components only
  let prevTopComp: Component | null = null
  for (const file of ordered) {
    const entry = fileComponents.get(normalizePath(file.path))
    if (!entry) continue
    // Find top-level component that contains this file (might be a directory group)
    const topComp = board.components.find(c => {
      if (c.id === entry.comp.id && topCompIds.has(c.id)) return true
      if (c.subCircuit) {
        return c.subCircuit.components.some(sc => sc.id === entry.comp.id)
      }
      return false
    })
    if (topComp && topComp !== prevTopComp) {
      if (prevTopComp) {
        board.clockLine.push({
          from: prevTopComp.id,
          to: topComp.id,
          kind: 'sequential',
        })
      }
      prevTopComp = topComp
    }
  }

  return board
}

interface ImportInfo {
  name: string
  moduleSpecifier: string
}

interface ExportInfo {
  name: string
  kind: TypeShape['tag']
}

function extractImports(code: string, filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = []
  try {
    const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.ESNext, true)
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier) {
        const modSpec = (stmt.moduleSpecifier as ts.StringLiteral).text
        if (stmt.importClause) {
          if (stmt.importClause.name) {
            imports.push({ name: stmt.importClause.name.text, moduleSpecifier: modSpec })
          }
          const bindings = stmt.importClause.namedBindings
          if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
              imports.push({ name: el.name.text, moduleSpecifier: modSpec })
            }
          }
          if (bindings && ts.isNamespaceImport(bindings)) {
            imports.push({ name: bindings.name.text, moduleSpecifier: modSpec })
          }
        }
      }
      // Re-export declarations: export { foo } from './bar' — these are also dependencies
      if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
        const modSpec = (stmt.moduleSpecifier as ts.StringLiteral).text
        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            imports.push({ name: el.name.text, moduleSpecifier: modSpec })
          }
        } else if (!stmt.exportClause) {
          // export * from './bar'
          imports.push({ name: '*', moduleSpecifier: modSpec })
        }
      }
    }
  } catch {}
  return imports
}

function extractExports(code: string, filePath: string): ExportInfo[] {
  const exports: ExportInfo[] = []
  try {
    const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.ESNext, true)
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && hasExportModifier(stmt)) {
        exports.push({ name: stmt.name.text, kind: 'function' })
      }
      if (ts.isClassDeclaration(stmt) && stmt.name && hasExportModifier(stmt)) {
        exports.push({ name: stmt.name.text, kind: 'object' })
      }
      if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            exports.push({ name: decl.name.text, kind: 'any' })
          }
        }
      }
      if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          exports.push({ name: el.name.text, kind: 'any' })
        }
      }
      if (ts.isExportAssignment(stmt)) {
        exports.push({ name: 'default', kind: 'any' })
      }
    }
  } catch {}
  return exports
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword)
}

function resolveImportPath(
  importerPath: string,
  moduleSpecifier: string,
  files: ProjectFile[],
): string | null {
  // Only resolve relative imports (./  ../)
  if (!moduleSpecifier.startsWith('.')) return null

  // Resolve relative to importer's directory
  const importerDir = importerPath.includes('/')
    ? importerPath.slice(0, importerPath.lastIndexOf('/'))
    : ''

  let resolved = joinPath(importerDir, moduleSpecifier)

  // Try exact match, then with extensions, then /index
  const candidates = [
    resolved,
    resolved + '.ts',
    resolved + '.tsx',
    resolved + '.js',
    resolved + '.jsx',
    resolved + '/index.ts',
    resolved + '/index.tsx',
    resolved + '/index.js',
  ]

  const fileSet = new Set(files.map(f => normalizePath(f.path)))
  for (const c of candidates) {
    if (fileSet.has(normalizePath(c))) return c
  }

  return null
}

function joinPath(base: string, relative: string): string {
  const parts = base ? base.split('/') : []
  for (const seg of relative.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/')
}

const ENTRY_POINT_PATTERNS = [
  /^index\.[jt]sx?$/,
  /^main\.[jt]sx?$/,
  /^app\.[jt]sx?$/,
  /^background\.[jt]sx?$/,
  /^popup\.[jt]sx?$/,
  /^content\.[jt]sx?$/,
  /^sidepanel\.[jt]sx?$/,
  /^manifest\.json$/,
  /\/index\.[jt]sx?$/,
  /\/main\.[jt]sx?$/,
]

function detectEntryPoints(
  files: ProjectFile[],
  fileComponents: Map<string, { comp: Component; fileBoard: CircuitBoard }>,
): void {
  // Collect all files that are imported by other files
  const importedPaths = new Set<string>()
  for (const file of files) {
    const imports = extractImports(file.content, file.path)
    for (const imp of imports) {
      const resolved = resolveImportPath(file.path, imp.moduleSpecifier, files)
      if (resolved) importedPaths.add(normalizePath(resolved))
    }
  }

  for (const file of files) {
    const norm = normalizePath(file.path)
    const entry = fileComponents.get(norm)
    if (!entry) continue

    const basename = norm.includes('/') ? norm.slice(norm.lastIndexOf('/') + 1) : norm

    // Heuristic 1: matches entry point filename patterns
    const matchesPattern = ENTRY_POINT_PATTERNS.some(p => p.test(norm) || p.test(basename))

    // Heuristic 2: not imported by any other internal file (root of dependency tree)
    const notImported = !importedPaths.has(norm)

    if (matchesPattern || notImported) {
      entry.comp.isEntryPoint = true
    }
  }
}

function groupByDirectory(
  board: CircuitBoard,
  files: ProjectFile[],
  fileComponents: Map<string, { comp: Component; fileBoard: CircuitBoard }>,
): void {
  // Group files by directory path
  const dirMap = new Map<string, { file: ProjectFile; comp: Component }[]>()
  for (const file of files) {
    const norm = normalizePath(file.path)
    const entry = fileComponents.get(norm)
    if (!entry) continue
    const dir = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : ''
    if (!dirMap.has(dir)) dirMap.set(dir, [])
    dirMap.get(dir)!.push({ file, comp: entry.comp })
  }

  // Collapse single-child directory chains: if all files share a common prefix, strip it
  // e.g., if everything is under "src/", don't create a "src" group
  const dirs = [...dirMap.keys()].filter(d => d !== '')
  if (dirs.length > 0) {
    const commonPrefix = findCommonPrefix(dirs)
    if (commonPrefix) {
      const newDirMap = new Map<string, { file: ProjectFile; comp: Component }[]>()
      for (const [dir, entries] of dirMap) {
        const newDir = dir === '' ? '' : dir.slice(commonPrefix.length).replace(/^\//, '')
        if (!newDirMap.has(newDir)) newDirMap.set(newDir, [])
        newDirMap.get(newDir)!.push(...entries)
      }
      dirMap.clear()
      for (const [k, v] of newDirMap) dirMap.set(k, v)
    }
  }

  // Only create directory groups for dirs with 2+ files
  const dirsToGroup = [...dirMap.entries()].filter(([dir, entries]) => dir !== '' && entries.length >= 2)
  if (dirsToGroup.length === 0) return

  for (const [dir, entries] of dirsToGroup) {
    const dirComp = makeComponent('subcircuit', 'directory', dir, 0, 0, null)
    dirComp.isReachable = true
    const dirBoard = makeBoard(dir)
    dirComp.subCircuit = dirBoard

    // Move file components from project board into directory board
    for (const { comp } of entries) {
      const idx = board.components.indexOf(comp)
      if (idx >= 0) board.components.splice(idx, 1)
      dirBoard.components.push(comp)
    }

    // Move wires: wires between files in the same directory become internal
    const dirCompIds = new Set(entries.map(e => e.comp.id))
    const dirPinIds = new Set<string>()
    for (const { comp } of entries) {
      for (const pin of [...comp.inputPins, ...comp.outputPins]) {
        dirPinIds.add(pin.id)
      }
    }

    const wiresToMove: Wire[] = []
    const wiresToKeep: Wire[] = []
    for (const wire of board.wires) {
      const srcInDir = dirPinIds.has(wire.sourcePin)
      const tgtInDir = dirPinIds.has(wire.targetPin)
      if (srcInDir && tgtInDir) {
        // Both ends in this directory — move to directory board
        wiresToMove.push(wire)
      } else if (srcInDir || tgtInDir) {
        // Cross-directory wire: keep on project board but add proxy pins on dir component
        if (srcInDir) {
          // Source is in dir, target is outside — add output pin to dir component
          const proxyOut = makePin(dirComp.id, wire.sourcePin, 'output')
          dirComp.outputPins.push(proxyOut)
          // Internal wire from original source to proxy
          dirBoard.wires.push(makeWire(wire.sourcePin, proxyOut.id))
          // Update project wire to use proxy
          wire.sourcePin = proxyOut.id
        }
        if (tgtInDir) {
          // Target is in dir, source is outside — add input pin to dir component
          const proxyIn = makePin(dirComp.id, wire.targetPin, 'input')
          dirComp.inputPins.push(proxyIn)
          // Internal wire from proxy to original target
          dirBoard.wires.push(makeWire(proxyIn.id, wire.targetPin))
          // Update project wire to use proxy
          wire.targetPin = proxyIn.id
        }
        wiresToKeep.push(wire)
      } else {
        wiresToKeep.push(wire)
      }
    }

    dirBoard.wires.push(...wiresToMove)
    board.wires = wiresToKeep
    board.components.push(dirComp)
  }
}

function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return ''
  const parts = paths[0].split('/')
  let prefix = ''
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(0, i + 1).join('/')
    if (paths.every(p => p === candidate || p.startsWith(candidate + '/'))) {
      prefix = candidate
    } else {
      break
    }
  }
  return prefix
}

function topologicalSort(
  files: ProjectFile[],
  fileComponents: Map<string, { comp: Component; fileBoard: CircuitBoard }>,
): ProjectFile[] {
  const fileMap = new Map(files.map(f => [normalizePath(f.path), f]))
  const inDegree = new Map<string, number>()
  const deps = new Map<string, Set<string>>()

  for (const file of files) {
    const key = normalizePath(file.path)
    inDegree.set(key, 0)
    deps.set(key, new Set())
  }

  for (const file of files) {
    const key = normalizePath(file.path)
    const imports = extractImports(file.content, file.path)
    for (const imp of imports) {
      const resolved = resolveImportPath(file.path, imp.moduleSpecifier, files)
      if (resolved) {
        const depKey = normalizePath(resolved)
        deps.get(key)?.add(depKey)
        inDegree.set(key, (inDegree.get(key) ?? 0) + 1)
      }
    }
  }

  const result: ProjectFile[] = []
  const queue: string[] = []
  for (const [key, deg] of inDegree) {
    if (deg === 0) queue.push(key)
  }

  while (queue.length > 0) {
    const key = queue.shift()!
    const file = fileMap.get(key)
    if (file) result.push(file)

    for (const [other, otherDeps] of deps) {
      if (otherDeps.has(key)) {
        otherDeps.delete(key)
        const newDeg = (inDegree.get(other) ?? 1) - 1
        inDegree.set(other, newDeg)
        if (newDeg === 0) queue.push(other)
      }
    }
  }

  // Append any remaining files (cycles)
  for (const file of files) {
    if (!result.includes(file)) result.push(file)
  }

  return result
}
