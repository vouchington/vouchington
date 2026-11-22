import { readPool, writePool } from '@data-stores/psql'
import {
  withPostgresQueryFailureForTest as withPoolsQueryFailureForTest,
  type FaultCommand,
} from 'vouchington-tooling/postgres-test-faults'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { getActivityPubInboxTestRequestId } from './api/request-query-profile.mts'

/** Fail one actual SQL statement on a Voucha pool after its owner has begun a real transaction. */
export async function withPostgresQueryFailureForTest<Result>(
  queryMarker: string,
  operation: () => Promise<Result>,
  options: { command?: FaultCommand; requestId?: string } = {},
): Promise<{ result: Result; error: Error }> {
  return withPoolsQueryFailureForTest(queryMarker, operation, {
    pools: [readPool, writePool],
    command: options.command,
    requestId: options.requestId,
    isOwnedRequest: requestId =>
      (getOptionalRequestClientInfo()?.requestId ?? getActivityPubInboxTestRequestId()) ===
      requestId,
  })
}
