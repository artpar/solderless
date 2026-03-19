// Resolve TypeScript types into TypeShape for circuit visualization

import ts from 'typescript'
import { TypeShape, TypeTag, UNKNOWN_TYPE } from './circuit-ir'

const TYPE_UNITS: Record<TypeTag, number> = {
  boolean: 1,
  null: 1,
  undefined: 1,
  void: 1,
  symbol: 2,
  number: 4,
  any: 4,
  unknown: 4,
  enum: 4,
  string: 10,
  bigint: 8,
  never: 0,
  object: 0,    // computed from fields
  array: 0,     // computed from element type
  tuple: 0,     // computed from elements
  union: 0,     // max of constituents
  intersection: 0, // sum of constituents
  function: 0,  // signature-defined
}

export function resolveTypeShape(node: ts.Node, checker: ts.TypeChecker): TypeShape {
  try {
    const type = checker.getTypeAtLocation(node)
    return tsTypeToShape(type, checker, 0)
  } catch {
    return UNKNOWN_TYPE
  }
}

export function tsTypeToShape(type: ts.Type, checker: ts.TypeChecker, depth: number): TypeShape {
  if (depth > 5) return UNKNOWN_TYPE

  const flags = type.getFlags()

  // Primitive types
  if (flags & ts.TypeFlags.BooleanLike) return { tag: 'boolean', units: 1, label: 'bool' }
  if (flags & ts.TypeFlags.NumberLike) return { tag: 'number', units: 4, label: 'num' }
  if (flags & ts.TypeFlags.StringLike) return { tag: 'string', units: 10, label: 'str' }
  if (flags & ts.TypeFlags.BigIntLike) return { tag: 'bigint', units: 8, label: 'bigint' }
  if (flags & ts.TypeFlags.ESSymbolLike) return { tag: 'symbol', units: 2, label: 'sym' }
  if (flags & ts.TypeFlags.Null) return { tag: 'null', units: 1, label: 'null' }
  if (flags & ts.TypeFlags.Undefined) return { tag: 'undefined', units: 1, label: 'undef' }
  if (flags & ts.TypeFlags.Void) return { tag: 'void', units: 1, label: 'void' }
  if (flags & ts.TypeFlags.Never) return { tag: 'never', units: 0, label: 'never' }
  if (flags & ts.TypeFlags.Any) return { tag: 'any', units: 4, label: 'any' }
  if (flags & ts.TypeFlags.Unknown) return { tag: 'unknown', units: 4, label: '?' }

  // Enum
  if (flags & ts.TypeFlags.EnumLike) return { tag: 'enum', units: 4, label: 'enum' }

  // Union
  if (type.isUnion()) {
    const children = type.types.map(t => tsTypeToShape(t, checker, depth + 1))
    const units = Math.max(...children.map(c => c.units), 1)
    const label = children.map(c => c.label).join('|').slice(0, 20)
    return { tag: 'union', units, label, children }
  }

  // Intersection
  if (type.isIntersection()) {
    const children = type.types.map(t => tsTypeToShape(t, checker, depth + 1))
    const units = children.reduce((sum, c) => sum + c.units, 0)
    const label = children.map(c => c.label).join('&').slice(0, 20)
    return { tag: 'intersection', units, label, children }
  }

  // Function / callable
  const callSigs = type.getCallSignatures()
  if (callSigs.length > 0) {
    const sig = callSigs[0]
    const params = sig.getParameters()
    const children: TypeShape[] = []
    const childLabels: string[] = []
    for (const param of params) {
      const paramType = checker.getTypeOfSymbolAtLocation(param, param.valueDeclaration ?? ({} as ts.Node))
      children.push(tsTypeToShape(paramType, checker, depth + 1))
      childLabels.push(param.getName())
    }
    const retType = sig.getReturnType()
    const retShape = tsTypeToShape(retType, checker, depth + 1)
    children.push(retShape)
    childLabels.push('return')
    const units = children.reduce((sum, c) => sum + c.units, 0)
    return { tag: 'function', units, label: 'fn', children, childLabels }
  }

  // Tuple
  if (checker.isTupleType(type)) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference)
    const children = typeArgs.map(t => tsTypeToShape(t, checker, depth + 1))
    const units = children.reduce((sum, c) => sum + c.units, 0)
    return { tag: 'tuple', units: Math.max(units, 1), label: 'tuple', children }
  }

  // Array
  if (checker.isArrayType(type)) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference)
    const elemShape = typeArgs.length > 0
      ? tsTypeToShape(typeArgs[0], checker, depth + 1)
      : UNKNOWN_TYPE
    return { tag: 'array', units: elemShape.units, label: `${elemShape.label}[]`, children: [elemShape] }
  }

  // Object type (interfaces, classes, object literals)
  if (flags & ts.TypeFlags.Object) {
    const props = type.getProperties()
    if (props.length > 0) {
      const children: TypeShape[] = []
      const childLabels: string[] = []
      let totalUnits = 0
      for (const prop of props) {
        const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration ?? ({} as ts.Node))
        const shape = tsTypeToShape(propType, checker, depth + 1)
        children.push(shape)
        childLabels.push(prop.getName())
        totalUnits += shape.units
      }
      const label = `{${childLabels.slice(0, 3).join(',')}}`.slice(0, 20)
      return { tag: 'object', units: Math.max(totalUnits, 1), label, children, childLabels }
    }
    // Empty object or unresolvable
    return { tag: 'object', units: 4, label: '{}' }
  }

  return UNKNOWN_TYPE
}

/** Resolve the type shape for a literal node from its syntax */
export function literalTypeShape(node: ts.Node): TypeShape {
  if (ts.isNumericLiteral(node)) return { tag: 'number', units: 4, label: 'num' }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { tag: 'string', units: 10, label: 'str' }
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return { tag: 'boolean', units: 1, label: 'bool' }
  if (node.kind === ts.SyntaxKind.NullKeyword) return { tag: 'null', units: 1, label: 'null' }
  return UNKNOWN_TYPE
}
