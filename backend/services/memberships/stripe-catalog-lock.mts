import { advisoryLockPool, type PoolClient } from '@data-stores/psql'
import onError from '@modules/on-error'
import type { StripeCatalogContext } from './get-catalog.mts'

export async function withStripeCatalogReconciliationLock<Result>(
  context: StripeCatalogContext,
  operation: () => Promise<Result>,
  connect: () => Promise<Pick<PoolClient, 'query' | 'release'>> = () => advisoryLockPool.connect(),
  reportUnlockError: (error: Error) => void = onError,
): Promise<Result> {
  const client = await connect()
  const lockKey = `stripe-membership-catalog:${context.environment}:${context.applicationId}`
  let released = false
  let operationError: Error | undefined
  let result: Result | undefined
  try {
    await client.query(
      '/* withStripeCatalogReconciliationLock:lock */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [lockKey],
    )
    try {
      result = await operation()
    } catch (error) {
      operationError = toError(error)
    }

    let unlockError: Error | undefined
    try {
      const unlock = await client.query<{ unlocked: boolean }>(
        '/* withStripeCatalogReconciliationLock:unlock */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
        [lockKey],
      )
      if (!unlock.rows[0]?.unlocked)
        unlockError = new Error('Stripe catalog reconciliation lock was not held at release')
    } catch (error) {
      unlockError = toError(error)
    }

    if (unlockError) {
      client.release(true)
      released = true
      if (operationError) {
        reportUnlockError(unlockError)
        throw operationError
      }
      throw unlockError
    }
    client.release()
    released = true
    if (operationError) throw operationError
    return result as Result
  } catch (error) {
    if (!released) client.release(true)
    throw toError(error)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
