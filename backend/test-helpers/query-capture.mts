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

/**
 * Queries issued by `operation`. `backend-data-stores` shares one fork across files, and the
 * elections worker in that fork runs other tests' jobs while capture is on. Those jobs are a
 * different async context, so they stay out of this snapshot. A descendant still running from an
 * earlier capture writes into that capture's own buffer.
 */
export async function withCapturedTestQueries<Result>(
  operation: () => Promise<Result>,
): Promise<{ result: Result; queries: CapturedTestQuery[] }> {
  const { result, queries } = await runWithCapturedQueries(operation)
  return {
    result,
    queries: queries.map(query => ({
      text: query.text,
      values: [...query.values],
      timestamp: query.timestamp,
    })),
  }
}

export function countCapturedQueriesByAnnotation(
  queries: CapturedTestQuery[],
  annotation: string,
): number {
  return queries.filter(query => query.text.includes(`/* ${annotation} */`)).length
}
