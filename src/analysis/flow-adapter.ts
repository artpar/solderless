// Wraps TypeScript Compiler API to extract AST + FlowNode graph + Symbol table

import ts from 'typescript'

export interface ParseResult {
  sourceFile: ts.SourceFile
  program: ts.Program
  checker: ts.TypeChecker
}

export function parseSource(code: string, fileName = 'input.tsx'): ParseResult {
  const compilerHost = createInMemoryHost(code, fileName)
  const program = ts.createProgram(
    [fileName],
    {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.React,
      strict: false,
      noEmit: true,
      allowJs: true,
      esModuleInterop: true,
    },
    compilerHost,
  )
  const sourceFile = program.getSourceFile(fileName)!
  const checker = program.getTypeChecker()
  return { sourceFile, program, checker }
}

function createInMemoryHost(
  code: string,
  fileName: string,
): ts.CompilerHost {
  const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true)

  return {
    getSourceFile(name) {
      if (name === fileName) return sourceFile
      // Return empty source for lib files — we don't need them for analysis
      return ts.createSourceFile(name, '', ts.ScriptTarget.ESNext, true)
    },
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => name === fileName,
    readFile: (name) => (name === fileName ? code : ''),
  }
}

/** Get the FlowNode from any AST node (if present). */
export function getFlowNode(node: ts.Node): ts.FlowNode | undefined {
  // The TS compiler attaches flowNode to nodes during binding
  return (node as any).flowNode as ts.FlowNode | undefined
}

/** Get source location for a node */
export function getSourceLoc(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): { start: number; end: number; line: number } {
  const start = node.getStart(sourceFile)
  const end = node.getEnd()
  const { line } = sourceFile.getLineAndCharacterOfPosition(start)
  return { start, end, line: line + 1 }
}

/** Resolve what symbol a name refers to */
export function resolveSymbol(
  node: ts.Node,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  return checker.getSymbolAtLocation(node)
}

/** Get all references to a symbol's declarations */
export function getDeclarations(symbol: ts.Symbol): ts.Declaration[] {
  return symbol.declarations ?? []
}

/** Check if a node is in unreachable code (after return/throw) */
export function isUnreachable(node: ts.Node): boolean {
  const flow = getFlowNode(node)
  if (!flow) return false
  // FlowFlags.Unreachable = 1
  return (flow.flags & 1) !== 0
}
