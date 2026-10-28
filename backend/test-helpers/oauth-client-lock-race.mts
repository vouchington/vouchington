import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import type { TestPostgresLockIdentity } from './postgres-client-lock-identity.mts'

export type OperationWaitingOnClient<T> = {
  clientId: string
  waiterQueryMarker: string
  start: () => Promise<T>
}

/** Starts one OAuth operation and releases its exact test-owned lock after its native wait. */
export function withTestOAuthOperationWaiting<T>(input: {
  holderProcessId: number
  lock: TestPostgresLockIdentity['lock']
  waiterQueryMarker: string
  releaseHolder: () => PromiseLike<void>
  start: () => Promise<T>
}): Promise<T> {
  return withTestOwnedPostgresWait(
    {
      holderProcessId: input.holderProcessId,
      lock: input.lock,
      pool: 'write',
      queryMarker: input.waiterQueryMarker,
      releaseHolder: input.releaseHolder,
    },
    async waitForLock => {
      const operation = input.start()
      await waitForLock(operation)
      await input.releaseHolder()
      return operation
    },
  )
}

/**
 * Applies `update` in a transaction that commits only once the operation started by `start` is
 * blocked on the client row, so that operation cannot act on the row as it was before the update.
 */
export async function updateTestOAuthClientWhileWaiting<T>(
  input: OperationWaitingOnClient<T>,
  update: (transaction: TransactionQuery) => Promise<unknown>,
): Promise<T> {
  const transaction = await beginTransaction()
  let transactionDisposed = false
  try {
    await update(transaction)
    const { rows } = await transaction<{ process_id: number }>(
      `/* updateTestOAuthClientWhileWaiting.process */ SELECT pg_backend_pid()::integer AS process_id`,
    )
    const holderProcessId = rows[0]?.process_id
    if (holderProcessId === undefined)
      throw new Error('PostgreSQL did not return a backend process ID')
    let releaseAsRollback = true
    const releaseHolder = async () => {
      if (transactionDisposed) return
      try {
        if (releaseAsRollback) await transaction[Symbol.asyncDispose]()
        else await transaction.commit()
        transactionDisposed = true
      } catch (err) {
        releaseAsRollback = true
        throw err
      }
    }
    return await withTestOwnedPostgresWait(
      {
        holderProcessId,
        lock: { kind: 'transaction' },
        pool: 'write',
        queryMarker: input.waiterQueryMarker,
        releaseHolder,
      },
      async waitForLock => {
        const operation = input.start()
        await waitForLock(operation)
        releaseAsRollback = false
        await releaseHolder()
        return operation
      },
    )
  } catch (err) {
    if (!transactionDisposed) await transaction[Symbol.asyncDispose]()
    throw err
  }
}
