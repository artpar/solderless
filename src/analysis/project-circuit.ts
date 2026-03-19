// Builds a project-level CircuitBoard where each file is a subcircuit
// and imports between files become wires between subcircuits.

import ts from 'typescript'
import {
  CircuitBoard,
  Component,
  Wire,
  Pin,
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
      const pin = makePin(comp.id, exp.name, 'output')
      comp.outputPins.push(pin)
      exportPins.set(`${normalizePath(file.path)}::${exp.name}`, pin.id)
    }

    // Also add a "default" output pin
    const defaultPin = makePin(comp.id, 'module', 'output')
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
      const inputPin = makePin(srcEntry.comp.id, imp.name, 'input')
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

  // 3. Build clock line based on rough dependency order
  // Files with no imports first, then files that import from them
  const ordered = topologicalSort(files, fileComponents)
  for (let i = 1; i < ordered.length; i++) {
    const prev = fileComponents.get(normalizePath(ordered[i - 1].path))
    const curr = fileComponents.get(normalizePath(ordered[i].path))
    if (prev && curr) {
      board.clockLine.push({
        from: prev.comp.id,
        to: curr.comp.id,
        kind: 'sequential',
      })
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
        exports.push({ name: stmt.name.text })
      }
      if (ts.isClassDeclaration(stmt) && stmt.name && hasExportModifier(stmt)) {
        exports.push({ name: stmt.name.text })
      }
      if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            exports.push({ name: decl.name.text })
          }
        }
      }
      if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          exports.push({ name: el.name.text })
        }
      }
      if (ts.isExportAssignment(stmt)) {
        exports.push({ name: 'default' })
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
