import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  postgresLockQuery,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-observers.mts'

export type OperationWaitingOnClient<T> = {
  clientId: string
  waiterQueryMarker: string
  start: () => Promise<T>
}

/**
 * Applies `update` in a transaction that commits only once the operation started by `start` is
 * blocked on the client row, so that operation cannot act on the row as it was before the update.
 */
export async function updateTestOAuthClientWhileWaiting<T>(
  input: OperationWaitingOnClient<T>,
  update: (transaction: TransactionQuery) => Promise<unknown>,
): Promise<T> {
  let operationOutcome: Promise<PromiseSettledResult<T>> | undefined
  let outcome: PromiseSettledResult<T> | undefined
  let observerFailure: { error: unknown } | undefined
  try {
    await using transaction = await beginTransaction()
    await update(transaction)
    const holderProcessId = await getTestPostgresBackendProcessId(postgresLockQuery(transaction))
    const observation = new AbortController()
    operationOutcome = Promise.allSettled([input.start()] as const).then(([outcome]) => {
      observation.abort(
        outcome.status === 'rejected'
          ? outcome.reason
          : new Error('Operation completed before the test lock was observed'),
      )
      return outcome
    })
    try {
      // Await cancellation too: an in-flight observation must drain before rollback releases
      // the holder. The observer keeps its full positive window while the operation is live.
      await waitForTestPostgresLockWaiter(
        holderProcessId,
        input.waiterQueryMarker,
        'advisoryLock',
        undefined,
        observation.signal,
      )
      await transaction.commit()
    } catch (err) {
      observerFailure = { error: err }
    }
  } finally {
    // Always observe started work after holder disposal is attempted, including rollback errors.
    if (operationOutcome) outcome = await operationOutcome
  }
  if (!outcome) throw new Error('OAuth operation did not start')
  if (observerFailure) {
    const cause = observerFailure.error instanceof Error ? observerFailure.error.cause : undefined
    if (
      outcome.status === 'rejected' &&
      cause !== outcome.reason &&
      !(cause instanceof SuppressedError && cause.suppressed === outcome.reason)
    ) {
      throw new SuppressedError(
        observerFailure.error,
        outcome.reason,
        'Lock observation and OAuth operation both failed',
      )
    }
    throw observerFailure.error
  }
  if (outcome.status === 'rejected') throw outcome.reason
  return outcome.value
}
