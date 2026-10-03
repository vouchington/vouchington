import {
  clearCapturedQueries,
  disableQueryCapture,
  getCapturedQueries,
  runWithCapturedQueries,
} from '@data-stores/psql'

export { enableQueryCapture } from '@data-stores/psql'

export async function captureScopedTestQueries(
  run: () => Promise<unknown>,
): Promise<CapturedTestQuery[]> {
  const { queries } = await runWithCapturedQueries(run)
  return queries.map(query => ({
    text: query.text,
    values: [...query.values],
    timestamp: query.timestamp,
  }))
}

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
