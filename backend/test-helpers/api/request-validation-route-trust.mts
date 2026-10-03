import ts from 'typescript'

export function assertTrustedValidator(
  expression: ts.Expression,
  name: string,
  checker: ts.TypeChecker,
  operation: string,
): void {
  const symbol = ts.isIdentifier(expression) ? checker.getSymbolAtLocation(expression) : undefined
  const target =
    symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  const trusted = {
    validateRequestContract: '/backend/api/response-helpers.mts',
    parseAndValidatePaginatedRequest: '/backend/api/validate-paginated-query.mts',
    parseAndValidateCaseListQuery: '/backend/api/case-list-query-helpers.mts',
  }[name]
  if (
    !trusted ||
    !target?.declarations?.some(declaration =>
      declaration.getSourceFile().fileName.replaceAll('\\', '/').endsWith(trusted),
    )
  ) {
    throw new Error(`${name} in ${operation} is not the trusted backend validator`)
  }
}

export function assertTrustedVoteFactory(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  operation: string,
): void {
  const symbol = ts.isIdentifier(expression) ? checker.getSymbolAtLocation(expression) : undefined
  const target =
    symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  if (
    !target?.declarations?.some(declaration =>
      declaration
        .getSourceFile()
        .fileName.replaceAll('\\', '/')
        .endsWith('/backend/api/election-vote-handler.mts'),
    )
  ) {
    throw new Error(`Vote handler factory in ${operation} is not the trusted backend factory`)
  }
}
