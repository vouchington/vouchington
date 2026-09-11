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
