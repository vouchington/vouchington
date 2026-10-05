export function hasCompleteOperationCoverage(
  contracts: Readonly<Record<string, unknown>>,
  knownRoutes: ReadonlySet<string>,
): boolean {
  const operations = new Set([...knownRoutes].map(key => key.split('#')[0]))
  return Object.keys(contracts).every(key => operations.has(key))
}
