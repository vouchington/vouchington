import { expect } from 'vitest'
import {
  observeTestPostgresClientQueries,
  type ObservedClientQuery,
} from './postgres-query-pool-observer.mts'

/** Observe native failures only on the borrowed connection which queried this owned case. */
export async function observeCopyrightOwnedHttp<Result>(
  noticeId: string,
  operation: () => Promise<Result>,
) {
  const owned = new Set<object>()
  const failures: Array<{ query: ObservedClientQuery; code: unknown }> = []
  const observation = await observeTestPostgresClientQueries(
    operation,
    async query => {
      if (query.connection && query.values.includes(noticeId)) owned.add(query.connection)
    },
    (query, err) => {
      failures.push({ query, code: (err as { code?: unknown } | null)?.code })
    },
  )
  expect(observation.observerErrors).toEqual([])
  const nativeCodes = failures.flatMap(({ query, code }) =>
    query.values.includes(noticeId) || (query.connection && owned.has(query.connection))
      ? [code]
      : [],
  )
  return { response: observation.result, nativeCodes }
}

export const copyrightHttpSerializationAbort = {
  status: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright case change',
  value: undefined,
  nativeCodes: ['40001'],
}
