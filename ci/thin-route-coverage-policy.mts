const ROUTE_EXTENSION = /\.(?:tsx|ts)$/u

/** Repository path with the web/ prefix and extension removed, matching a static import. */
export function thinRouteCoverageSuffix(discovered: string): string {
  return discovered.replace(/^web\//u, '').replace(ROUTE_EXTENSION, '')
}

export function thinRouteCoverageViolations(
  discovered: readonly string[],
  coverageText: string,
): string[] {
  if (discovered.length === 0) {
    return ['thin route coverage discovered no page or layout modules']
  }
  const missing: string[] = []
  for (const path of discovered) {
    if (!coverageText.includes(`${thinRouteCoverageSuffix(path)}'`)) missing.push(path)
  }
  if (missing.length === 0) return []
  return missing
    .toSorted()
    .map(path => `thin route ${path} is not loaded by the route coverage tests`)
}
