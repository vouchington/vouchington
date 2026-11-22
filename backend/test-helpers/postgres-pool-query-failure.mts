import { readPool, writePool } from '@data-stores/psql'
import {
  withPostgresPoolQueryFailureForTest as withPoolsPoolQueryFailureForTest,
  type FaultCommand,
} from 'vouchington-tooling/postgres-test-faults'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { getActivityPubInboxTestRequestId } from './api/request-query-profile.mts'

/** Let the unchanged pg.Pool.query core execute its original SQL on an actual aborted Voucha client. */
export async function withPostgresPoolQueryFailureForTest<Result>(
  queryMarker: string,
  operation: () => Promise<Result>,
  options: {
    command?: FaultCommand
    requestId?: string
    matchesValues?: (values: readonly unknown[]) => boolean
  } = {},
): Promise<{ result: Result; error: Error }> {
  return withPoolsPoolQueryFailureForTest(queryMarker, operation, {
    pools: [readPool, writePool],
    command: options.command,
    matchesValues: options.matchesValues,
    requestId: options.requestId,
    isOwnedRequest: requestId =>
      (getOptionalRequestClientInfo()?.requestId ?? getActivityPubInboxTestRequestId()) ===
      requestId,
  })
}
