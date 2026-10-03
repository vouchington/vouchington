import { clearCapturedQueries, disableQueryCapture, getCapturedQueries } from '@data-stores/psql'

export { enableQueryCapture } from '@data-stores/psql'

export type CapturedTestQuery = {
  text: string
  values: readonly unknown[]
  timestamp: number
}

export function stopTestQueryCapture(): CapturedTestQuery[] {
  const capturedQueries = getCapturedQueries()
  disableQueryCapture()
  clearCapturedQueries()
  return capturedQueries.map(query => ({
    ...query,
    values: [...query.values],
  }))
}

export function countCapturedQueriesByAnnotation(
  queries: CapturedTestQuery[],
  annotation: string,
): number {
  return queries.filter(query => query.text.includes(`/* ${annotation} */`)).length
}

function bindsAnyId(value: unknown, ids: ReadonlySet<unknown>): boolean {
  return Array.isArray(value) ? value.some(item => ids.has(item)) : ids.has(value)
}

/**
 * Keeps the captured queries that bind one of `ids`, either directly or inside an array value.
 *
 * Query capture is process-global: queries issued by background work that happens to run in the
 * capture window (a debounced election recompute, a worker, another file sharing the fork) land
 * in the same list as the code under test. Scope assertions about a fixture's own queries to the
 * fixture's ids with this instead of counting everything the window saw.
 */
export function filterCapturedQueriesByBoundIds(
  queries: CapturedTestQuery[],
  ids: readonly string[],
): CapturedTestQuery[] {
  const idSet = new Set<unknown>(ids)
  return queries.filter(query => query.values.some(value => bindsAnyId(value, idSet)))
}
