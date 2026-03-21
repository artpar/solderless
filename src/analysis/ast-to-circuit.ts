// Walks TS AST to build CircuitBoard: Components from expressions/declarations,
// Wires from def-use chains, ClockSegments from control flow.

import ts from 'typescript'
import {
  CircuitBoard,
  Component,
  Wire,
  ClockSegment,
  Pin,
  TypeShape,
  UNKNOWN_TYPE,
  makeBoard,
  makeComponent,
  makeWire,
  makePin,
  genId,
  resetIdCounter,
} from './circuit-ir'
import { parseSource, getSourceLoc, isUnreachable, type ParseResult } from './flow-adapter'
import { buildScopes, detectClosureWires } from './scope-builder'
import { markDeadCode } from './dead-code'
import { resolveTypeShape, literalTypeShape, tsTypeToShape } from './type-resolver'

// Well-known globals: object.method → return TypeShape
// Prevents "any" when the TS checker lacks lib.dom.d.ts
const WELL_KNOWN_GLOBALS: Record<string, Record<string, TypeShape>> = {
  console: {
    log:   { tag: 'void', units: 1, label: 'void' },
    warn:  { tag: 'void', units: 1, label: 'void' },
    error: { tag: 'void', units: 1, label: 'void' },
    info:  { tag: 'void', units: 1, label: 'void' },
    debug: { tag: 'void', units: 1, label: 'void' },
  },
  Math: {
    floor:  { tag: 'number', units: 8, label: 'number' },
    ceil:   { tag: 'number', units: 8, label: 'number' },
    round:  { tag: 'number', units: 8, label: 'number' },
    max:    { tag: 'number', units: 8, label: 'number' },
    min:    { tag: 'number', units: 8, label: 'number' },
    abs:    { tag: 'number', units: 8, label: 'number' },
    random: { tag: 'number', units: 8, label: 'number' },
    sqrt:   { tag: 'number', units: 8, label: 'number' },
    pow:    { tag: 'number', units: 8, label: 'number' },
  },
  JSON: {
    parse:     { tag: 'any', units: 4, label: 'any' },
    stringify: { tag: 'string', units: 8, label: 'string' },
  },
}

// Top-level well-known functions
const WELL_KNOWN_FUNCTIONS: Record<string, TypeShape> = {
  parseInt:   { tag: 'number', units: 8, label: 'number' },
  parseFloat: { tag: 'number', units: 8, label: 'number' },
  isNaN:      { tag: 'boolean', units: 1, label: 'boolean' },
  isFinite:   { tag: 'boolean', units: 1, label: 'boolean' },
}

interface BuildContext {
  board: CircuitBoard
  sourceFile: ts.SourceFile
  checker: ts.TypeChecker
  // Maps symbol id → output pin id (the wire source for a variable's current value)
  symbolToPinId: Map<number, string>
  // Maps component id to component (for quick lookup)
  componentMap: Map<string, Component>
  // Previous component in sequential flow (for clock line)
  lastClockComponent: string | null
}

export function buildCircuit(code: string): CircuitBoard {
  resetIdCounter()
  const { sourceFile, program, checker } = parseSource(code)
  const board = makeBoard('module')

  const ctx: BuildContext = {
    board,
    sourceFile,
    checker,
    symbolToPinId: new Map(),
    componentMap: new Map(),
    lastClockComponent: null,
  }

  // Process top-level statements
  for (const stmt of sourceFile.statements) {
    processStatement(stmt, ctx)
  }

  // Build scope regions
  board.scopeRegions = buildScopes(sourceFile, board, ctx.sourceFile)

  // Detect closure wires
  detectClosureWires(board)

  // Mark dead code
  markDeadCode(board)

  return board
}

// ---------- Statement Processing ----------

function processStatement(node: ts.Node, ctx: BuildContext): void {
  const reachable = !isUnreachable(node)

  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      processVariableDeclaration(
        decl,
        node.declarationList.flags,
        ctx,
        reachable,
      )
    }
  } else if (ts.isFunctionDeclaration(node)) {
    processFunctionDeclaration(node, ctx, reachable)
  } else if (ts.isClassDeclaration(node)) {
    processClassDeclaration(node, ctx, reachable)
  } else if (ts.isIfStatement(node)) {
    processIfStatement(node, ctx, reachable)
  } else if (ts.isWhileStatement(node)) {
    processWhileStatement(node, ctx, reachable)
  } else if (ts.isForStatement(node)) {
    processForStatement(node, ctx, reachable)
  } else if (ts.isReturnStatement(node)) {
    processReturnStatement(node, ctx, reachable)
  } else if (ts.isThrowStatement(node)) {
    processThrowStatement(node, ctx, reachable)
  } else if (ts.isTryStatement(node)) {
    processTryStatement(node, ctx, reachable)
  } else if (ts.isExpressionStatement(node)) {
    processExpression(node.expression, ctx, reachable)
  } else if (ts.isSwitchStatement(node)) {
    processSwitchStatement(node, ctx, reachable)
  } else if (ts.isImportDeclaration(node)) {
    processImportDeclaration(node, ctx)
  } else if (ts.isExportAssignment(node)) {
    processExportAssignment(node, ctx, reachable)
  } else if (ts.isBlock(node)) {
    for (const s of node.statements) {
      processStatement(s, ctx)
    }
  } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    processForOfInStatement(node, ctx, reachable)
  }
}

// ---------- Declarations ----------

function processVariableDeclaration(
  decl: ts.VariableDeclaration,
  flags: ts.NodeFlags,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const name = decl.name.getText(ctx.sourceFile)
  const isConst = (flags & ts.NodeFlags.Const) !== 0
  const kind = isConst ? 'named-wire' : 'register'
  const loc = getSourceLoc(decl, ctx.sourceFile)

  const comp = makeComponent(
    kind as Component['kind'],
    isConst ? 'const' : 'let',
    name,
    1,
    1,
    loc,
  )
  comp.isReachable = reachable

  // Resolve type shape for this variable
  const shape = resolveTypeShape(decl, ctx.checker)
  comp.inputPins[0].typeShape = shape
  comp.outputPins[0].typeShape = shape

  // If initializer is a function expression/arrow, skip the named-wire wrapper —
  // use the subcircuit component directly as the variable binding
  if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
    const funcPin = processArrowOrFunctionExpr(decl.initializer, ctx, reachable, name)
    if (funcPin) {
      registerSymbolPin(decl.name, funcPin, ctx)
    }
    return
  }

  addComponent(comp, ctx)

  // If there's an initializer, process it and wire to this declaration
  if (decl.initializer) {
    const initPin = processExpression(decl.initializer, ctx, reachable)
    if (initPin) {
      ctx.board.wires.push(makeWire(initPin, comp.inputPins[0].id))
    }
  }

  // Register the output pin for this symbol
  registerSymbolPin(decl.name, comp.outputPins[0].id, ctx)

  // Clock line
  addClockSegment(comp.id, ctx)
}

function processFunctionDeclaration(
  node: ts.FunctionDeclaration,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const name = node.name?.getText(ctx.sourceFile) ?? '<anonymous>'
  const loc = getSourceLoc(node, ctx.sourceFile)

  const comp = makeComponent(
    'subcircuit',
    'function',
    name,
    0,
    1,
    loc,
  )
  comp.isReachable = reachable

  // Build sub-circuit for function body
  const subBoard = makeBoard(name)

  // Add parameter input pins with resolved types
  for (const param of node.parameters) {
    const pName = param.name.getText(ctx.sourceFile)
    const paramShape = resolveTypeShape(param, ctx.checker)
    const pin = makePin(comp.id, pName, 'input', paramShape)
    comp.inputPins.push(pin)
    subBoard.inputPins.push(pin)
  }

  // Resolve return type
  const sig = ctx.checker.getSignatureFromDeclaration(node)
  if (sig) {
    const retType = ctx.checker.getReturnTypeOfSignature(sig)
    comp.outputPins[0].typeShape = tsTypeToShape(retType, ctx.checker, 0)
  }

  // Exception pin
  const excPin = makePin(comp.id, 'exception', 'exception')
  comp.outputPins.push(excPin)
  subBoard.exceptionPin = excPin

  comp.subCircuit = subBoard
  addComponent(comp, ctx)

  // Register function name symbol
  if (node.name) {
    registerSymbolPin(node.name, comp.outputPins[0].id, ctx)
  }

  // Process function body in sub-context
  if (node.body) {
    const subCtx: BuildContext = {
      board: subBoard,
      sourceFile: ctx.sourceFile,
      checker: ctx.checker,
      symbolToPinId: new Map(ctx.symbolToPinId),
      componentMap: new Map(),
      lastClockComponent: null,
    }

    // Register parameters as symbol → pin mappings (no extra component needed)
    for (let i = 0; i < node.parameters.length; i++) {
      const param = node.parameters[i]
      registerSymbolPin(param.name, subBoard.inputPins[i].id, subCtx)
    }

    for (const stmt of node.body.statements) {
      processStatement(stmt, subCtx)
    }
  }

  ctx.board.subBoards.push(subBoard)
  addClockSegment(comp.id, ctx)
}

function processClassDeclaration(
  node: ts.ClassDeclaration,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const name = node.name?.getText(ctx.sourceFile) ?? '<anonymous>'
  const loc = getSourceLoc(node, ctx.sourceFile)

  const comp = makeComponent('subcircuit', 'class', name, 0, 1, loc)
  comp.isReachable = reachable

  const subBoard = makeBoard(name)
  comp.subCircuit = subBoard

  // Process class members
  const subCtx: BuildContext = {
    board: subBoard,
    sourceFile: ctx.sourceFile,
    checker: ctx.checker,
    symbolToPinId: new Map(ctx.symbolToPinId),
    componentMap: new Map(),
    lastClockComponent: null,
  }

  for (const member of node.members) {
    if (ts.isMethodDeclaration(member)) {
      const mName = member.name.getText(ctx.sourceFile)
      const mComp = makeComponent('subcircuit', 'method', mName, 0, 1, getSourceLoc(member, ctx.sourceFile))
      mComp.isReachable = reachable

      for (const param of member.parameters) {
        const pName = param.name.getText(ctx.sourceFile)
        const paramShape = resolveTypeShape(param, ctx.checker)
        mComp.inputPins.push(makePin(mComp.id, pName, 'input', paramShape))
      }

      addComponent(mComp, subCtx)
      addClockSegment(mComp.id, subCtx)

      if (member.body) {
        const methodCtx: BuildContext = {
          board: subBoard,
          sourceFile: ctx.sourceFile,
          checker: ctx.checker,
          symbolToPinId: new Map(subCtx.symbolToPinId),
          componentMap: new Map(),
          lastClockComponent: null,
        }
        for (const stmt of member.body.statements) {
          processStatement(stmt, methodCtx)
        }
      }
    } else if (ts.isPropertyDeclaration(member)) {
      const pName = member.name.getText(ctx.sourceFile)
      const pComp = makeComponent('register', 'property', pName, 1, 1, getSourceLoc(member, ctx.sourceFile))
      pComp.isReachable = reachable
      const propShape = resolveTypeShape(member, ctx.checker)
      pComp.inputPins[0].typeShape = propShape
      pComp.outputPins[0].typeShape = propShape
      addComponent(pComp, subCtx)

      if (member.initializer) {
        const initPin = processExpression(member.initializer, subCtx, reachable)
        if (initPin) {
          subBoard.wires.push(makeWire(initPin, pComp.inputPins[0].id))
        }
      }
    } else if (ts.isConstructorDeclaration(member)) {
      const cComp = makeComponent('subcircuit', 'constructor', 'constructor', 0, 1, getSourceLoc(member, ctx.sourceFile))
      cComp.isReachable = reachable
      for (const param of member.parameters) {
        const pName = param.name.getText(ctx.sourceFile)
        const paramShape = resolveTypeShape(param, ctx.checker)
        cComp.inputPins.push(makePin(cComp.id, pName, 'input', paramShape))
      }
      addComponent(cComp, subCtx)
    }
  }

  comp.subCircuit = subBoard
  ctx.board.subBoards.push(subBoard)
  addComponent(comp, ctx)

  if (node.name) {
    registerSymbolPin(node.name, comp.outputPins[0].id, ctx)
  }

  addClockSegment(comp.id, ctx)
}

// ---------- Control Flow ----------

function processIfStatement(
  node: ts.IfStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  // Condition → comparator/demux
  const condPin = processExpression(node.expression, ctx, reachable)

  const demux = makeComponent('demux', 'if', 'if', 1, 2, getSourceLoc(node, ctx.sourceFile))
  demux.isReachable = reachable
  // Condition input is boolean; branch outputs are control flow
  demux.inputPins[0].typeShape = resolveTypeShape(node.expression, ctx.checker)
  demux.outputPins[0].typeShape = { tag: 'boolean', units: 1, label: 'true' }
  demux.outputPins[1].typeShape = { tag: 'boolean', units: 1, label: 'false' }
  addComponent(demux, ctx)

  if (condPin) {
    ctx.board.wires.push(makeWire(condPin, demux.inputPins[0].id))
  }

  addClockSegment(demux.id, ctx)

  // True branch
  const savedLast = ctx.lastClockComponent
  ctx.lastClockComponent = demux.id
  ctx.board.clockLine.push({
    from: demux.id,
    to: '', // will fill
    kind: 'branch-true',
  })
  const trueClockIdx = ctx.board.clockLine.length - 1

  processStatement(node.thenStatement, ctx)
  const trueLast = ctx.lastClockComponent
  if (trueLast && trueLast !== demux.id) {
    ctx.board.clockLine[trueClockIdx].to = trueLast
  }

  // False branch
  let falseLast: string | null = null
  if (node.elseStatement) {
    ctx.lastClockComponent = demux.id
    ctx.board.clockLine.push({
      from: demux.id,
      to: '',
      kind: 'branch-false',
    })
    const falseClockIdx = ctx.board.clockLine.length - 1

    processStatement(node.elseStatement, ctx)
    falseLast = ctx.lastClockComponent
    if (falseLast && falseLast !== demux.id) {
      ctx.board.clockLine[falseClockIdx].to = falseLast
    }
  }

  // Merge point (MUX)
  const mux = makeComponent('mux', 'if-merge', 'merge', 2, 1, getSourceLoc(node, ctx.sourceFile))
  mux.isReachable = reachable
  // Branch inputs are control flow signals
  mux.inputPins[0].typeShape = { tag: 'boolean', units: 1, label: 'true' }
  mux.inputPins[1].typeShape = { tag: 'boolean', units: 1, label: 'false' }
  mux.outputPins[0].typeShape = { tag: 'void', units: 1, label: 'join' }
  addComponent(mux, ctx)

  // Clock from both branches to merge
  if (trueLast && trueLast !== demux.id) {
    ctx.board.clockLine.push({ from: trueLast, to: mux.id, kind: 'sequential' })
  }
  if (falseLast && falseLast !== demux.id) {
    ctx.board.clockLine.push({ from: falseLast, to: mux.id, kind: 'sequential' })
  } else if (!node.elseStatement) {
    ctx.board.clockLine.push({ from: demux.id, to: mux.id, kind: 'branch-false' })
  }

  ctx.lastClockComponent = mux.id
}

function processWhileStatement(
  node: ts.WhileStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)

  // Loop header comparator
  const condPin = processExpression(node.expression, ctx, reachable)
  const comp = makeComponent('comparator', 'while', 'while', 1, 1, loc)
  comp.isReachable = reachable
  addComponent(comp, ctx)

  if (condPin) {
    ctx.board.wires.push(makeWire(condPin, comp.inputPins[0].id))
  }

  addClockSegment(comp.id, ctx)

  // Body
  const bodyStart = ctx.lastClockComponent
  processStatement(node.statement, ctx)
  const bodyEnd = ctx.lastClockComponent

  // Feedback loop
  if (bodyEnd) {
    ctx.board.clockLine.push({
      from: bodyEnd,
      to: comp.id,
      kind: 'loop-back',
    })
  }
}

function processForStatement(
  node: ts.ForStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)

  // Init
  if (node.initializer) {
    if (ts.isVariableDeclarationList(node.initializer)) {
      for (const decl of node.initializer.declarations) {
        processVariableDeclaration(decl, node.initializer.flags, ctx, reachable)
      }
    } else {
      processExpression(node.initializer, ctx, reachable)
    }
  }

  // Condition
  let condPin: string | null = null
  if (node.condition) {
    condPin = processExpression(node.condition, ctx, reachable)
  }

  const comp = makeComponent('comparator', 'for', 'for', 1, 1, loc)
  comp.isReachable = reachable
  addComponent(comp, ctx)

  if (condPin) {
    ctx.board.wires.push(makeWire(condPin, comp.inputPins[0].id))
  }

  addClockSegment(comp.id, ctx)

  // Body
  processStatement(node.statement, ctx)

  // Incrementor
  if (node.incrementor) {
    processExpression(node.incrementor, ctx, reachable)
  }

  // Feedback
  const bodyEnd = ctx.lastClockComponent
  if (bodyEnd) {
    ctx.board.clockLine.push({
      from: bodyEnd,
      to: comp.id,
      kind: 'loop-back',
    })
  }
}

function processForOfInStatement(
  node: ts.ForOfStatement | ts.ForInStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const kind = ts.isForOfStatement(node) ? 'for-of' : 'for-in'

  const exprPin = processExpression(node.expression, ctx, reachable)
  const comp = makeComponent('comparator', kind, kind, 1, 1, loc)
  comp.isReachable = reachable
  addComponent(comp, ctx)

  if (exprPin) {
    ctx.board.wires.push(makeWire(exprPin, comp.inputPins[0].id))
  }

  // Declare iterator variable
  if (ts.isVariableDeclarationList(node.initializer)) {
    for (const decl of node.initializer.declarations) {
      processVariableDeclaration(decl, node.initializer.flags, ctx, reachable)
    }
  }

  addClockSegment(comp.id, ctx)
  processStatement(node.statement, ctx)

  const bodyEnd = ctx.lastClockComponent
  if (bodyEnd) {
    ctx.board.clockLine.push({ from: bodyEnd, to: comp.id, kind: 'loop-back' })
  }
}

function processSwitchStatement(
  node: ts.SwitchStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const exprPin = processExpression(node.expression, ctx, reachable)

  const demux = makeComponent(
    'demux',
    'switch',
    'switch',
    1,
    node.caseBlock.clauses.length,
    loc,
  )
  demux.isReachable = reachable
  // Resolve switch expression type for input pin
  demux.inputPins[0].typeShape = resolveTypeShape(node.expression, ctx.checker)
  // Label each output with case clause text
  for (let i = 0; i < node.caseBlock.clauses.length; i++) {
    if (demux.outputPins[i]) {
      const clause = node.caseBlock.clauses[i]
      demux.outputPins[i].typeShape = { tag: 'void', units: 1, label: ts.isDefaultClause(clause) ? 'default' : `case` }
    }
  }
  addComponent(demux, ctx)

  if (exprPin) {
    ctx.board.wires.push(makeWire(exprPin, demux.inputPins[0].id))
  }

  addClockSegment(demux.id, ctx)

  const branchEnds: string[] = []
  for (const clause of node.caseBlock.clauses) {
    ctx.lastClockComponent = demux.id
    for (const stmt of clause.statements) {
      processStatement(stmt, ctx)
    }
    if (ctx.lastClockComponent) branchEnds.push(ctx.lastClockComponent)
  }

  // Merge
  const mux = makeComponent('mux', 'switch-merge', 'merge', branchEnds.length, 1, loc)
  mux.isReachable = reachable
  for (const pin of mux.inputPins) pin.typeShape = { tag: 'void', units: 1, label: 'branch' }
  mux.outputPins[0].typeShape = { tag: 'void', units: 1, label: 'join' }
  addComponent(mux, ctx)

  for (const end of branchEnds) {
    if (end !== demux.id) {
      ctx.board.clockLine.push({ from: end, to: mux.id, kind: 'sequential' })
    }
  }

  ctx.lastClockComponent = mux.id
}

function processReturnStatement(
  node: ts.ReturnStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const comp = makeComponent('connector', 'return', 'return', 1, 0, loc)
  comp.isReachable = reachable
  addComponent(comp, ctx)

  if (node.expression) {
    const exprPin = processExpression(node.expression, ctx, reachable)
    if (exprPin) {
      ctx.board.wires.push(makeWire(exprPin, comp.inputPins[0].id))
    }
  }

  // Connect to board output
  if (ctx.board.outputPins.length > 0) {
    ctx.board.wires.push(
      makeWire(comp.inputPins[0].id, ctx.board.outputPins[0].id),
    )
  }

  addClockSegment(comp.id, ctx)
  ctx.lastClockComponent = null // Clock terminates
}

function processThrowStatement(
  node: ts.ThrowStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const comp = makeComponent('connector', 'throw', 'throw', 1, 0, loc)
  comp.isReachable = reachable
  addComponent(comp, ctx)

  const exprPin = processExpression(node.expression, ctx, reachable)
  if (exprPin) {
    ctx.board.wires.push(makeWire(exprPin, comp.inputPins[0].id, 'exception'))
  }

  if (ctx.board.exceptionPin) {
    ctx.board.wires.push(
      makeWire(comp.inputPins[0].id, ctx.board.exceptionPin.id, 'exception'),
    )
  }

  addClockSegment(comp.id, ctx)
  ctx.lastClockComponent = null
}

function processTryStatement(
  node: ts.TryStatement,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)

  // Try block
  for (const stmt of node.tryBlock.statements) {
    processStatement(stmt, ctx)
  }
  const tryEnd = ctx.lastClockComponent

  // Catch clause
  if (node.catchClause) {
    const catchComp = makeComponent('connector', 'catch', 'catch', 1, 1, getSourceLoc(node.catchClause, ctx.sourceFile))
    catchComp.isReachable = reachable
    addComponent(catchComp, ctx)

    if (node.catchClause.variableDeclaration) {
      registerSymbolPin(
        node.catchClause.variableDeclaration.name,
        catchComp.outputPins[0].id,
        ctx,
      )
    }

    ctx.lastClockComponent = catchComp.id
    for (const stmt of node.catchClause.block.statements) {
      processStatement(stmt, ctx)
    }
  }

  // Finally
  if (node.finallyBlock) {
    for (const stmt of node.finallyBlock.statements) {
      processStatement(stmt, ctx)
    }
  }
}

// ---------- Imports / Exports ----------

function processImportDeclaration(
  node: ts.ImportDeclaration,
  ctx: BuildContext,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const moduleSpec = node.moduleSpecifier.getText(ctx.sourceFile).replace(/['"]/g, '')

  if (node.importClause) {
    // Default import
    if (node.importClause.name) {
      const name = node.importClause.name.getText(ctx.sourceFile)
      const comp = makeComponent('connector', 'import-default', name, 0, 1, loc)
      comp.label = `${name} from ${moduleSpec}`
      addComponent(comp, ctx)
      registerSymbolPin(node.importClause.name, comp.outputPins[0].id, ctx)
      ctx.board.inputPins.push(comp.outputPins[0])
    }

    // Named imports
    const bindings = node.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const spec of bindings.elements) {
        const name = spec.name.getText(ctx.sourceFile)
        const comp = makeComponent('connector', 'import', name, 0, 1, loc)
        comp.label = `${name} from ${moduleSpec}`
        addComponent(comp, ctx)
        registerSymbolPin(spec.name, comp.outputPins[0].id, ctx)
        ctx.board.inputPins.push(comp.outputPins[0])
      }
    }

    // Namespace import
    if (bindings && ts.isNamespaceImport(bindings)) {
      const name = bindings.name.getText(ctx.sourceFile)
      const comp = makeComponent('connector', 'import-namespace', name, 0, 1, loc)
      comp.label = `* as ${name} from ${moduleSpec}`
      addComponent(comp, ctx)
      registerSymbolPin(bindings.name, comp.outputPins[0].id, ctx)
      ctx.board.inputPins.push(comp.outputPins[0])
    }
  }
}

function processExportAssignment(
  node: ts.ExportAssignment,
  ctx: BuildContext,
  reachable: boolean,
): void {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const comp = makeComponent('connector', 'export-default', 'export default', 1, 0, loc)
  comp.isReachable = reachable
  addComponent(comp, ctx)

  const exprPin = processExpression(node.expression, ctx, reachable)
  if (exprPin) {
    ctx.board.wires.push(makeWire(exprPin, comp.inputPins[0].id))
  }

  ctx.board.outputPins.push(comp.inputPins[0])
  addClockSegment(comp.id, ctx)
}

// ---------- Expression Processing ----------
// Returns the output pin id of the expression result, or null

function processExpression(
  node: ts.Expression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  if (ts.isBinaryExpression(node)) {
    return processBinaryExpression(node, ctx, reachable)
  }
  if (ts.isPrefixUnaryExpression(node)) {
    return processPrefixUnary(node, ctx, reachable)
  }
  if (ts.isConditionalExpression(node)) {
    return processConditional(node, ctx, reachable)
  }
  if (ts.isCallExpression(node)) {
    return processCallExpression(node, ctx, reachable)
  }
  if (ts.isNewExpression(node)) {
    return processNewExpression(node, ctx, reachable)
  }
  if (ts.isPropertyAccessExpression(node)) {
    return processPropertyAccess(node, ctx, reachable)
  }
  if (ts.isElementAccessExpression(node)) {
    return processElementAccess(node, ctx, reachable)
  }
  if (ts.isIdentifier(node)) {
    return resolveIdentifier(node, ctx)
  }
  if (ts.isAwaitExpression(node)) {
    return processAwait(node, ctx, reachable)
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return processArrowOrFunctionExpr(node, ctx, reachable)
  }
  if (ts.isTemplateExpression(node)) {
    return processTemplateExpression(node, ctx, reachable)
  }
  if (ts.isParenthesizedExpression(node)) {
    return processExpression(node.expression, ctx, reachable)
  }
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return processExpression(node.expression, ctx, reachable)
  }
  if (ts.isPostfixUnaryExpression(node)) {
    return processExpression(node.operand, ctx, reachable)
  }
  if (ts.isArrayLiteralExpression(node)) {
    return processArrayLiteral(node, ctx, reachable)
  }
  if (ts.isObjectLiteralExpression(node)) {
    return processObjectLiteral(node, ctx, reachable)
  }
  if (ts.isSpreadElement(node)) {
    return processExpression(node.expression, ctx, reachable)
  }

  // Literals
  if (
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return processLiteral(node, ctx, reachable)
  }

  // Fallback: unknown expression → generic gate
  const loc = getSourceLoc(node, ctx.sourceFile)
  const comp = makeComponent('gate', 'expr', node.getText(ctx.sourceFile).slice(0, 30), 0, 1, loc)
  comp.isReachable = reachable
  if (comp.outputPins[0]) {
    comp.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  }
  addComponent(comp, ctx)
  return comp.outputPins[0]?.id ?? null
}

function processBinaryExpression(
  node: ts.BinaryExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const op = node.operatorToken.getText(ctx.sourceFile)

  // Assignment operators
  if (
    op === '=' || op === '+=' || op === '-=' || op === '*=' || op === '/=' ||
    op === '&&=' || op === '||=' || op === '??='
  ) {
    const rhsPin = processExpression(node.right, ctx, reachable)

    // Find the target register
    if (ts.isIdentifier(node.left)) {
      const sym = ctx.checker.getSymbolAtLocation(node.left)
      if (sym && rhsPin) {
        // Update the symbol's pin to the new value
        const symId = (sym as any).id ?? sym.escapedName
        ctx.symbolToPinId.set(symId as number, rhsPin)
      }
    }
    return rhsPin
  }

  // Regular binary operators
  const leftPin = processExpression(node.left, ctx, reachable)
  const rightPin = processExpression(node.right, ctx, reachable)
  const loc = getSourceLoc(node, ctx.sourceFile)

  let kind: Component['kind'] = 'gate'
  if (op === '&&' || op === '||' || op === '??') kind = 'gate'
  if (op === '===' || op === '!==' || op === '==' || op === '!=' ||
      op === '<' || op === '>' || op === '<=' || op === '>=') kind = 'comparator'

  const comp = makeComponent(kind, op, op, 2, 1, loc)
  comp.isReachable = reachable
  comp.inputPins[0].typeShape = resolveTypeShape(node.left, ctx.checker)
  comp.inputPins[1].typeShape = resolveTypeShape(node.right, ctx.checker)
  comp.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  addComponent(comp, ctx)

  if (leftPin) ctx.board.wires.push(makeWire(leftPin, comp.inputPins[0].id))
  if (rightPin) ctx.board.wires.push(makeWire(rightPin, comp.inputPins[1].id))

  return comp.outputPins[0].id
}

function processPrefixUnary(
  node: ts.PrefixUnaryExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const operandPin = processExpression(node.operand, ctx, reachable)
  const loc = getSourceLoc(node, ctx.sourceFile)
  const op = node.operator === ts.SyntaxKind.ExclamationToken ? '!' :
             node.operator === ts.SyntaxKind.MinusToken ? '-' :
             node.operator === ts.SyntaxKind.PlusToken ? '+' :
             node.operator === ts.SyntaxKind.TildeToken ? '~' : 'prefix'

  const comp = makeComponent('gate', op, op, 1, 1, loc)
  comp.isReachable = reachable
  comp.inputPins[0].typeShape = resolveTypeShape(node.operand, ctx.checker)
  comp.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  addComponent(comp, ctx)

  if (operandPin) ctx.board.wires.push(makeWire(operandPin, comp.inputPins[0].id))

  return comp.outputPins[0].id
}

function processConditional(
  node: ts.ConditionalExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const condPin = processExpression(node.condition, ctx, reachable)
  const truePin = processExpression(node.whenTrue, ctx, reachable)
  const falsePin = processExpression(node.whenFalse, ctx, reachable)
  const loc = getSourceLoc(node, ctx.sourceFile)

  const mux = makeComponent('mux', '?:', '?:', 3, 1, loc)
  mux.isReachable = reachable
  // Resolve types: condition is boolean, branches carry their expression types
  mux.inputPins[0].typeShape = resolveTypeShape(node.condition, ctx.checker)
  mux.inputPins[0].label = 'cond'
  mux.inputPins[1].typeShape = resolveTypeShape(node.whenTrue, ctx.checker)
  mux.inputPins[1].label = 'true'
  mux.inputPins[2].typeShape = resolveTypeShape(node.whenFalse, ctx.checker)
  mux.inputPins[2].label = 'false'
  mux.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  addComponent(mux, ctx)

  if (condPin) ctx.board.wires.push(makeWire(condPin, mux.inputPins[0].id))
  if (truePin) ctx.board.wires.push(makeWire(truePin, mux.inputPins[1].id))
  if (falsePin) ctx.board.wires.push(makeWire(falsePin, mux.inputPins[2].id))

  return mux.outputPins[0].id
}

function findComponentByOutputPin(pinId: string, ctx: BuildContext): Component | null {
  for (const comp of ctx.board.components) {
    if (comp.outputPins.some(p => p.id === pinId)) return comp
  }
  return null
}

function processCallExpression(
  node: ts.CallExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const calleeName = node.expression.getText(ctx.sourceFile).slice(0, 40)

  // Check if this is a direct call to a local function definition
  if (ts.isIdentifier(node.expression)) {
    const resolvedPin = resolveIdentifier(node.expression, ctx)
    if (resolvedPin) {
      const fnComp = findComponentByOutputPin(resolvedPin, ctx)
      if (fnComp && fnComp.operation === 'function' && fnComp.inputPins.length === node.arguments.length) {
        // Wire arguments directly to the function component's input pins
        for (let i = 0; i < node.arguments.length; i++) {
          const argPin = processExpression(node.arguments[i], ctx, reachable)
          if (argPin && fnComp.inputPins[i]) {
            ctx.board.wires.push(makeWire(argPin, fnComp.inputPins[i].id))
          }
        }
        addClockSegment(fnComp.id, ctx)
        return fnComp.outputPins[0].id
      }
    }
  }

  const comp = makeComponent(
    'subcircuit',
    'call',
    `${calleeName}()`,
    node.arguments.length,
    2, // return + exception
    loc,
  )
  comp.isReachable = reachable

  // Label the extra output as exception
  if (comp.outputPins.length > 1) {
    comp.outputPins[1].kind = 'exception'
    comp.outputPins[1].label = 'exception'
  }

  // Resolve argument types and labels
  for (let i = 0; i < node.arguments.length; i++) {
    if (comp.inputPins[i]) {
      comp.inputPins[i].typeShape = resolveTypeShape(node.arguments[i], ctx.checker)
      comp.inputPins[i].label = node.arguments[i].getText(ctx.sourceFile).slice(0, 12)
    }
  }
  // Resolve return type — use well-known globals/functions when checker returns any
  const resolvedReturn = resolveTypeShape(node, ctx.checker)
  if (resolvedReturn.tag === 'any') {
    // Check for well-known top-level functions (parseInt, isNaN, etc.)
    const fnShape = ts.isIdentifier(node.expression)
      ? WELL_KNOWN_FUNCTIONS[node.expression.getText(ctx.sourceFile)]
      : null
    // Check for well-known method calls (console.log, Math.floor, etc.)
    const methodShape = ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      ? WELL_KNOWN_GLOBALS[node.expression.expression.getText(ctx.sourceFile)]
        ?.[node.expression.name.getText(ctx.sourceFile)]
      : null
    comp.outputPins[0].typeShape = fnShape ?? methodShape ?? resolvedReturn
  } else {
    comp.outputPins[0].typeShape = resolvedReturn
  }

  addComponent(comp, ctx)

  // Wire callee — control dependency, not a visible argument pin
  // For method calls (a.b()), skip creating the `.b` gate — the call chip already
  // carries the full name. Only process the object expression for wiring.
  const calleeTargetPin = makePin(comp.id, calleeName, 'input')
  const calleeExprPin = ts.isPropertyAccessExpression(node.expression)
    ? processExpression(node.expression.expression, ctx, reachable)
    : processExpression(node.expression, ctx, reachable)
  if (calleeExprPin) {
    ctx.board.wires.push(makeWire(calleeExprPin, calleeTargetPin.id, 'control'))
  }

  // Wire arguments
  for (let i = 0; i < node.arguments.length; i++) {
    const argPin = processExpression(node.arguments[i], ctx, reachable)
    if (argPin && comp.inputPins[i]) {
      ctx.board.wires.push(makeWire(argPin, comp.inputPins[i].id))
    }
  }

  addClockSegment(comp.id, ctx)

  return comp.outputPins[0].id
}

function processNewExpression(
  node: ts.NewExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const className = node.expression.getText(ctx.sourceFile)
  const args = node.arguments ?? []

  const comp = makeComponent('subcircuit', 'new', `new ${className}`, args.length, 1, loc)
  comp.isReachable = reachable
  addComponent(comp, ctx)

  // Wire class reference as control dependency (not a visible argument pin)
  const classTargetPin = makePin(comp.id, className, 'input')
  const classPin = processExpression(node.expression, ctx, reachable)
  if (classPin) {
    ctx.board.wires.push(makeWire(classPin, classTargetPin.id, 'control'))
  }

  for (let i = 0; i < args.length; i++) {
    const argPin = processExpression(args[i], ctx, reachable)
    if (argPin && comp.inputPins[i]) {
      ctx.board.wires.push(makeWire(argPin, comp.inputPins[i].id))
    }
  }

  addClockSegment(comp.id, ctx)
  return comp.outputPins[0].id
}

function processPropertyAccess(
  node: ts.PropertyAccessExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const objPin = processExpression(node.expression, ctx, reachable)
  const propName = node.name.getText(ctx.sourceFile)

  const comp = makeComponent('gate', '.', `.${propName}`, 1, 1, loc)
  comp.isReachable = reachable
  comp.inputPins[0].typeShape = resolveTypeShape(node.expression, ctx.checker)

  // Override output type for well-known globals (checker lacks lib.dom.d.ts)
  const objName = ts.isIdentifier(node.expression) ? node.expression.getText(ctx.sourceFile) : null
  const knownType = objName && WELL_KNOWN_GLOBALS[objName]?.[propName]
  comp.outputPins[0].typeShape = knownType ?? resolveTypeShape(node, ctx.checker)

  addComponent(comp, ctx)

  if (objPin) ctx.board.wires.push(makeWire(objPin, comp.inputPins[0].id))

  return comp.outputPins[0].id
}

function processElementAccess(
  node: ts.ElementAccessExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const objPin = processExpression(node.expression, ctx, reachable)
  const idxPin = processExpression(node.argumentExpression, ctx, reachable)

  const comp = makeComponent('gate', '[]', '[]', 2, 1, loc)
  comp.isReachable = reachable
  comp.inputPins[0].typeShape = resolveTypeShape(node.expression, ctx.checker)
  comp.inputPins[1].typeShape = resolveTypeShape(node.argumentExpression, ctx.checker)
  comp.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  addComponent(comp, ctx)

  if (objPin) ctx.board.wires.push(makeWire(objPin, comp.inputPins[0].id))
  if (idxPin) ctx.board.wires.push(makeWire(idxPin, comp.inputPins[1].id))

  return comp.outputPins[0].id
}

function processAwait(
  node: ts.AwaitExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const exprPin = processExpression(node.expression, ctx, reachable)

  const comp = makeComponent('latch', 'await', 'await', 1, 1, loc)
  comp.isReachable = reachable
  comp.inputPins[0].typeShape = resolveTypeShape(node.expression, ctx.checker)
  comp.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  addComponent(comp, ctx)

  if (exprPin) ctx.board.wires.push(makeWire(exprPin, comp.inputPins[0].id))

  addClockSegment(comp.id, ctx)
  return comp.outputPins[0].id
}

function processArrowOrFunctionExpr(
  node: ts.ArrowFunction | ts.FunctionExpression,
  ctx: BuildContext,
  reachable: boolean,
  nameOverride?: string,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const name = nameOverride
    ?? (ts.isFunctionExpression(node) && node.name
      ? node.name.getText(ctx.sourceFile)
      : '<arrow>')

  const comp = makeComponent('subcircuit', 'function', name, 0, 1, loc)
  comp.isReachable = reachable

  const subBoard = makeBoard(name)

  for (const param of node.parameters) {
    const pName = param.name.getText(ctx.sourceFile)
    const paramShape = resolveTypeShape(param, ctx.checker)
    const pin = makePin(comp.id, pName, 'input', paramShape)
    comp.inputPins.push(pin)
    subBoard.inputPins.push(pin)
  }

  // Resolve return type
  const fnSig = ctx.checker.getSignatureFromDeclaration(node)
  if (fnSig) {
    const retType = ctx.checker.getReturnTypeOfSignature(fnSig)
    comp.outputPins[0].typeShape = tsTypeToShape(retType, ctx.checker, 0)
  }

  const excPin = makePin(comp.id, 'exception', 'exception')
  comp.outputPins.push(excPin)
  subBoard.exceptionPin = excPin

  comp.subCircuit = subBoard
  addComponent(comp, ctx)

  // Process body
  const subCtx: BuildContext = {
    board: subBoard,
    sourceFile: ctx.sourceFile,
    checker: ctx.checker,
    symbolToPinId: new Map(ctx.symbolToPinId),
    componentMap: new Map(),
    lastClockComponent: null,
  }

  // Register parameters as symbol → pin mappings (no extra component needed)
  for (let i = 0; i < node.parameters.length; i++) {
    const param = node.parameters[i]
    registerSymbolPin(param.name, subBoard.inputPins[i].id, subCtx)
  }

  if (ts.isBlock(node.body)) {
    for (const stmt of node.body.statements) {
      processStatement(stmt, subCtx)
    }
  } else {
    // Concise arrow: body is expression
    const resultPin = processExpression(node.body, subCtx, reachable)
    if (resultPin && subBoard.outputPins.length > 0) {
      subBoard.wires.push(makeWire(resultPin, subBoard.outputPins[0].id))
    }
  }

  ctx.board.subBoards.push(subBoard)
  return comp.outputPins[0].id
}

function processTemplateExpression(
  node: ts.TemplateExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const inputPins: string[] = []

  for (const span of node.templateSpans) {
    const pin = processExpression(span.expression, ctx, reachable)
    if (pin) inputPins.push(pin)
  }

  const comp = makeComponent('gate', 'template', '`...`', inputPins.length, 1, loc)
  comp.isReachable = reachable
  comp.outputPins[0].typeShape = { tag: 'string', units: 10, label: 'str' }
  addComponent(comp, ctx)

  for (let i = 0; i < inputPins.length; i++) {
    if (comp.inputPins[i]) {
      ctx.board.wires.push(makeWire(inputPins[i], comp.inputPins[i].id))
    }
  }

  return comp.outputPins[0].id
}

function processArrayLiteral(
  node: ts.ArrayLiteralExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const comp = makeComponent('gate', '[]', '[...]', node.elements.length, 1, loc)
  comp.isReachable = reachable
  comp.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  addComponent(comp, ctx)

  for (let i = 0; i < node.elements.length; i++) {
    const pin = processExpression(node.elements[i] as ts.Expression, ctx, reachable)
    if (pin && comp.inputPins[i]) {
      ctx.board.wires.push(makeWire(pin, comp.inputPins[i].id))
    }
  }

  return comp.outputPins[0].id
}

function processObjectLiteral(
  node: ts.ObjectLiteralExpression,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const comp = makeComponent('gate', '{}', '{...}', node.properties.length, 1, loc)
  comp.isReachable = reachable
  comp.outputPins[0].typeShape = resolveTypeShape(node, ctx.checker)
  addComponent(comp, ctx)

  for (let i = 0; i < node.properties.length; i++) {
    const prop = node.properties[i]
    if (ts.isPropertyAssignment(prop)) {
      const pin = processExpression(prop.initializer, ctx, reachable)
      if (pin && comp.inputPins[i]) {
        ctx.board.wires.push(makeWire(pin, comp.inputPins[i].id))
      }
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      const pin = resolveIdentifier(prop.name, ctx)
      if (pin && comp.inputPins[i]) {
        ctx.board.wires.push(makeWire(pin, comp.inputPins[i].id))
      }
    } else if (ts.isSpreadAssignment(prop)) {
      const pin = processExpression(prop.expression, ctx, reachable)
      if (pin && comp.inputPins[i]) {
        ctx.board.wires.push(makeWire(pin, comp.inputPins[i].id))
      }
    }
  }

  return comp.outputPins[0].id
}

function processLiteral(
  node: ts.Node,
  ctx: BuildContext,
  reachable: boolean,
): string | null {
  const loc = getSourceLoc(node, ctx.sourceFile)
  const text = node.getText(ctx.sourceFile)
  const comp = makeComponent('constant', 'literal', text.slice(0, 20), 0, 1, loc)
  comp.isReachable = reachable
  comp.outputPins[0].typeShape = literalTypeShape(node)
  addComponent(comp, ctx)
  return comp.outputPins[0].id
}

// ---------- Helpers ----------

function resolveIdentifier(
  node: ts.Node,
  ctx: BuildContext,
): string | null {
  if (!ts.isIdentifier(node)) return null
  const sym = ctx.checker.getSymbolAtLocation(node)
  if (!sym) return null
  const symId = (sym as any).id ?? sym.escapedName
  return ctx.symbolToPinId.get(symId as number) ?? null
}

function registerSymbolPin(
  nameNode: ts.Node,
  pinId: string,
  ctx: BuildContext,
): void {
  if (!ts.isIdentifier(nameNode) && !ts.isBindingName(nameNode)) return
  const sym = ctx.checker.getSymbolAtLocation(nameNode)
  if (!sym) return
  const symId = (sym as any).id ?? sym.escapedName
  ctx.symbolToPinId.set(symId as number, pinId)
}


function addComponent(comp: Component, ctx: BuildContext): void {
  ctx.board.components.push(comp)
  ctx.componentMap.set(comp.id, comp)
}

function addClockSegment(componentId: string, ctx: BuildContext): void {
  if (ctx.lastClockComponent) {
    ctx.board.clockLine.push({
      from: ctx.lastClockComponent,
      to: componentId,
      kind: 'sequential',
    })
  }
  ctx.lastClockComponent = componentId
}
