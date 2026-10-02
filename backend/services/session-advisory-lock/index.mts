import { advisoryLockPool } from '@data-stores/psql'
import onError from '@modules/on-error'

export type SessionAdvisoryLockDualFailure = 'report-unlock-error' | 'attach-unlock-error-as-cause'

export async function withSessionAdvisoryLock<Result>(
  operation: () => Promise<Result>,
  spec: {
    readonly lockSql: string
    readonly unlockSql: string
    readonly values: readonly unknown[]
    readonly unlockNotHeldMessage: string
    readonly whenOperationAndUnlockFail: SessionAdvisoryLockDualFailure
  },
): Promise<Result> {
  const client = await advisoryLockPool.connect()
  const boundValues = [...spec.values]
  let released = false
  let operationError: Error | undefined
  let result: Result | undefined
  try {
    await client.query(spec.lockSql, boundValues)
    try {
      result = await operation()
    } catch (err) {
      operationError = toError(err)
    }

    let unlockError: Error | undefined
    try {
      const unlock = await client.query<{ unlocked: boolean }>(spec.unlockSql, boundValues)
      if (!unlock.rows[0]?.unlocked) unlockError = new Error(spec.unlockNotHeldMessage)
    } catch (err) {
      unlockError = toError(err)
    }

    if (unlockError) {
      client.release(true)
      released = true
      if (operationError) {
        associateOperationAndUnlockFailure(
          spec.whenOperationAndUnlockFail,
          operationError,
          unlockError,
        )
        throw operationError
      }
      throw unlockError
    }

    client.release()
    released = true
    if (operationError) throw operationError
    return result as Result
  } catch (err) {
    if (!released) client.release(true)
    throw toError(err)
  }
}

function associateOperationAndUnlockFailure(
  policy: SessionAdvisoryLockDualFailure,
  operationError: Error,
  unlockError: Error,
): void {
  switch (policy) {
    case 'attach-unlock-error-as-cause':
      operationError.cause ??= unlockError
      return
    case 'report-unlock-error':
      onError(unlockError)
      return
    default: {
      const unreachable: never = policy
      throw new Error(`Unknown session advisory lock failure policy: ${String(unreachable)}`)
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
