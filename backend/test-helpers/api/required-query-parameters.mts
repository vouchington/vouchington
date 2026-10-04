import ts from 'typescript'

/** Reads required query metadata from the same typed carriers passed to apiQuery. */
export function discoverRequiredQueryParameters(
  program: ts.Program,
  routeFiles: readonly ts.SourceFile[],
  knownResponseRoutes: ReadonlySet<string>,
): Map<string, Set<string>> {
  const checker = program.getTypeChecker()
  const required = new Map<string, Set<string>>()

  for (const source of routeFiles) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'apiQuery' &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const operation = node.arguments[0].text
        if (!knownResponseRoutes.has(operation)) return
        for (const carrier of node.arguments.slice(1)) {
          const carrierType = checker.getTypeAtLocation(carrier)
          const contract = carrierType.getProperty('queryContract')
          if (!contract) continue // The canonical query harvester reports malformed carriers.
          const contractType = checker.getTypeOfSymbolAtLocation(contract, carrier)
          for (const parameter of contractType.getProperties()) {
            const descriptor = checker.getTypeOfSymbolAtLocation(parameter, carrier)
            const requiredFlag = descriptor.getProperty('required')
            if (!requiredFlag) continue
            const value = checker.getTypeOfSymbolAtLocation(requiredFlag, carrier)
            if (checker.typeToString(value) !== 'true') {
              throw new Error(
                `apiQuery ${operation} ${parameter.name} required must be literal true`,
              )
            }
            const names = required.get(operation) ?? new Set<string>()
            names.add(parameter.name)
            required.set(operation, names)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return required
}
