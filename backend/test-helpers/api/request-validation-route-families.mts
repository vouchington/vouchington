import ts from 'typescript'

import {
  requestCarrierOrigins,
  type CarrierBindings,
} from './request-validation-route-carrier-origin.mts'
import { resolveExpression } from './request-validation-route-ast.mts'

export function recordValidatorCarrierFamilies(
  name: string,
  call: ts.CallExpression,
  operation: string,
  checker: ts.TypeChecker,
  carrierBindings: CarrierBindings,
  carrierFamilies?: Map<string, Set<string>>,
): void {
  const families = carrierFamilies?.get(operation) ?? new Set<string>()
  if (name === 'validateRequestContract') {
    const optionsArgument = call.arguments[2]
    const options = optionsArgument && resolveExpression(optionsArgument, checker)
    if (options && ts.isObjectLiteralExpression(options)) {
      for (const property of options.properties) {
        const family =
          ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
            ? ts.isIdentifier(property.name)
              ? property.name.text
              : undefined
            : undefined
        if (family) families.add(family)
        const value = ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isShorthandPropertyAssignment(property)
            ? property.name
            : undefined
        if (family && value) {
          const origins = requestCarrierOrigins(value, checker, carrierBindings)
          if (['query', 'path', 'body', 'header'].includes(family) && !origins.has(family)) {
            throw new Error(`${operation} ${family} option lacks handler ${family} input lineage`)
          }
        }
      }
    }
  } else if (name === 'parseAndValidatePaginatedRequest') {
    families.add('query')
    const optionsArgument = call.arguments[3]
    const options = optionsArgument && resolveExpression(optionsArgument, checker)
    if (
      options &&
      ts.isObjectLiteralExpression(options) &&
      options.properties.some(
        property =>
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === 'path' &&
          property.initializer.kind === ts.SyntaxKind.TrueKeyword,
      )
    ) {
      families.add('path')
    }
  } else {
    families.add('query')
  }
  carrierFamilies?.set(operation, families)
}

export function recordVoteFactoryCarrierFamilies(
  name: string,
  operation: string,
  carrierFamilies?: Map<string, Set<string>>,
): void {
  const families = carrierFamilies?.get(operation) ?? new Set<string>()
  families.add('path')
  if (name === 'createVoteHandler') families.add('body')
  carrierFamilies?.set(operation, families)
}
