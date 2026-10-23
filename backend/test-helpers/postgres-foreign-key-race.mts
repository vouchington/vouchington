import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

type OperationOutcome<Result> = { value: Result } | { error: unknown }

/** Deletes a locked FK target only after the real insert is waiting on PostgreSQL's FK check. */
export async function deleteForeignKeyTargetDuringInsertForTest<Result>(input: {
  queryMarker: string
  lockTarget: (query: TransactionQuery) => Promise<void>
  deleteTarget: (query: TransactionQuery) => Promise<void>
  operation: () => Promise<Result>
}): Promise<OperationOutcome<Result>> {
  let operationOutcome: Promise<OperationOutcome<Result>> | undefined
  let setupError: unknown
  try {
    await using query = await beginTransaction()
    await input.lockTarget(query)
    const holderProcessId = await getTestPostgresBackendProcessId(query)
    operationOutcome = input.operation().then(
      value => ({ value }),
      err => ({ error: err }),
    )
    await waitForTestPostgresLockWaiter(holderProcessId, input.queryMarker)
    await input.deleteTarget(query)
    await query.commit()
  } catch (err) {
    setupError = err
  }
  const outcome = operationOutcome ? await operationOutcome : undefined
  if (setupError !== undefined)
    throw new Error('PostgreSQL FK race setup failed', { cause: setupError })
  if (outcome === undefined) throw new Error('FK race operation was not started')
  return outcome
}
