import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

type OperationOutcome<Result> = { value: Result } | { error: unknown }

/** Deletes a locked FK target only after the real insert is waiting on PostgreSQL's FK check. */
export async function deleteForeignKeyTargetDuringInsertForTest<Result>(input: {
  queryMarker: string
  lockTarget: (query: TransactionQuery) => Promise<void>
  deleteTarget: (query: TransactionQuery) => Promise<void>
  operation: () => Promise<Result>
}): Promise<OperationOutcome<Result>> {
  let setupError: unknown
  let outcome: OperationOutcome<Result> | undefined
  try {
    await using query = await beginTransaction()
    await input.lockTarget(query)
    const holderProcessId = await getTestPostgresBackendProcessId(query)
    outcome = await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: input.queryMarker,
        releaseHolder: () => query[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const operation = input.operation()
        await waitForLock(operation)
        await input.deleteTarget(query)
        await query.commit()
        return operation.then(
          value => ({ value }),
          err => ({ error: err }),
        )
      },
    )
  } catch (err) {
    setupError = err
  }
  if (setupError !== undefined)
    throw new Error('PostgreSQL FK race setup failed', { cause: setupError })
  if (outcome === undefined) throw new Error('FK race operation was not started')
  return outcome
}
