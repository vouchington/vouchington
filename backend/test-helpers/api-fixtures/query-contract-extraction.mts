import type { QueryParameterContract } from '@modules/pagination'
import ts from 'typescript'

import { contractError } from './response-contract-registration.mts'

export function extractQueryParameterDescriptor(
  type: ts.Type,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  parameterName: string,
): QueryParameterContract {
  const fail = (detail: string): never => {
    throw contractError(sourceFile, node, `Malformed query parameter "${parameterName}": ${detail}`)
  }
  const kind = requiredStringLiteral(type, 'kind', checker, fail)
  const description = optionalStringLiteral(type, 'description', checker, node, fail)
  const options = description === undefined ? {} : { description }

  if (kind === 'string') {
    const format = optionalStringLiteral(type, 'format', checker, node, fail)
    if (format === 'uuid') return { kind, format, ...options }
    if (format === 'uri') return { kind, format, ...options }
    if (format !== undefined) fail('unsupported format')
    return { kind, ...options }
  }
  if (
    kind === 'uuid-or-uri' ||
    kind === 'boolean' ||
    kind === 'nullable-boolean' ||
    kind === 'number'
  ) {
    return { kind, ...options }
  }
  if (kind === 'integer') {
    const minimum = requiredNumberLiteral(type, 'minimum', checker, fail)
    const maximum = requiredNumberLiteral(type, 'maximum', checker, fail)
    const defaultValue = optionalNumberLiteral(type, 'default', checker, node, fail)
    return {
      kind,
      minimum,
      maximum,
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...options,
    }
  }
  if (kind === 'enum') {
    const values = stringTuple(type, 'values', checker, fail)
    const defaultValue = optionalStringLiteral(type, 'default', checker, node, fail)
    if (defaultValue !== undefined && !values.includes(defaultValue)) {
      fail('default must be one of values')
    }
    return {
      kind,
      values,
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...options,
    }
  }
  if (kind === 'csv-array') {
    if (requiredStringLiteral(type, 'style', checker, fail) !== 'form') fail('style must be form')
    if (requiredBooleanLiteral(type, 'explode', checker, fail) !== false)
      fail('explode must be false')
    const itemType = requiredPropertyType(type, 'items', checker, fail)
    const items = extractQueryParameterDescriptor(
      itemType,
      checker,
      sourceFile,
      node,
      `${parameterName}[]`,
    )
    if (items.kind === 'string' || items.kind === 'enum') {
      return { kind, items, style: 'form', explode: false, ...options }
    }
    return fail('array items must be string or enum')
  }
  return fail(`unsupported kind "${kind}"`)
}

function requiredPropertyType(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
  fail: (detail: string) => never,
): ts.Type {
  const property = type.getProperty(name)
  if (!property || property.flags & ts.SymbolFlags.Optional) return fail(`requires literal ${name}`)
  const location = property.valueDeclaration ?? property.declarations?.[0]
  if (!location) return fail(`requires declared ${name}`)
  return checker.getTypeOfSymbolAtLocation(property, location)
}

function requiredStringLiteral(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
  fail: (detail: string) => never,
): string {
  const value = requiredPropertyType(type, name, checker, fail)
  return value.isStringLiteral() ? value.value : fail(`requires literal ${name}`)
}

function requiredNumberLiteral(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
  fail: (detail: string) => never,
): number {
  const value = requiredPropertyType(type, name, checker, fail)
  return value.isNumberLiteral() ? value.value : fail(`requires literal ${name}`)
}

function requiredBooleanLiteral(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
  fail: (detail: string) => never,
): boolean {
  const value = requiredPropertyType(type, name, checker, fail)
  if (value.flags & ts.TypeFlags.BooleanLiteral) return checker.typeToString(value) === 'true'
  return fail(`requires literal ${name}`)
}

function optionalStringLiteral(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
  node: ts.Node,
  fail: (detail: string) => never,
): string | undefined {
  const property = type.getProperty(name)
  if (!property) return undefined
  if (property.flags & ts.SymbolFlags.Optional) return fail(`${name} must be literal when present`)
  const location = property.valueDeclaration ?? property.declarations?.[0] ?? node
  const value = checker.getTypeOfSymbolAtLocation(property, location)
  return value.isStringLiteral() ? value.value : fail(`requires literal ${name}`)
}

function optionalNumberLiteral(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
  node: ts.Node,
  fail: (detail: string) => never,
): number | undefined {
  const property = type.getProperty(name)
  if (!property) return undefined
  if (property.flags & ts.SymbolFlags.Optional) return fail(`${name} must be literal when present`)
  const location = property.valueDeclaration ?? property.declarations?.[0] ?? node
  const value = checker.getTypeOfSymbolAtLocation(property, location)
  return value.isNumberLiteral() ? value.value : fail(`requires literal ${name}`)
}

function stringTuple(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
  fail: (detail: string) => never,
): readonly string[] {
  const value = requiredPropertyType(type, name, checker, fail)
  if (!checker.isTupleType(value)) return fail(`${name} must be a literal tuple`)
  const values = checker.getTypeArguments(value as ts.TypeReference)
  if (values.length === 0 || values.some(item => !item.isStringLiteral())) {
    return fail(`${name} must contain string literals`)
  }
  return values.map(item => (item as ts.StringLiteralType).value)
}
