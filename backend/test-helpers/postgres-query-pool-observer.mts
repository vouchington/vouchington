import { readPool, writePool } from '@data-stores/psql'
import {
  observeTestPostgresClientQueries as observePoolsClientQueries,
  observeTestPostgresQueryPools as observePoolsQueryPools,
  type ObservedClientQuery as GenericObservedClientQuery,
} from 'vouchington-tooling/postgres-test-faults'

export type ObservedPostgresQueryPool = 'read' | 'write'
export type ObservedClientQuery = GenericObservedClientQuery<ObservedPostgresQueryPool>

export function observeTestPostgresQueryPools<Result>(
  queryMarker: string,
  operation: () => Promise<Result>,
  onQueryComplete?: () => void | Promise<void>,
): Promise<{ result: Result; pools: ObservedPostgresQueryPool[] }> {
  return observePoolsQueryPools(
    { read: readPool, write: writePool },
    queryMarker,
    operation,
    onQueryComplete,
  )
}

/** Records SQL run on a borrowed client. COPY does not go through `pool.query`. */
export function observeTestPostgresClientQueries<Result>(
  operation: () => Promise<Result>,
  onQueryComplete?: (query: ObservedClientQuery) => Promise<void>,
): Promise<{ result: Result; queries: ObservedClientQuery[] }> {
  return observePoolsClientQueries({ read: readPool, write: writePool }, operation, onQueryComplete)
}
