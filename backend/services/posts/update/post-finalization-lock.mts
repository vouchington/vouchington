import { advisoryLockPool } from '@data-stores/psql'

export const POST_FINALIZATION_LOCK_NAMESPACE = 0x5046

export async function withPostFinalizationLock<Result>(
  postId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const client = await advisoryLockPool.connect()
  let released = false
  let operationError: Error | undefined
  let result: Result | undefined
  try {
    await client.query(
      '/* withPostFinalizationLock.lock */ SELECT pg_advisory_lock($1, hashtext($2))',
      [POST_FINALIZATION_LOCK_NAMESPACE, postId],
    )
    try {
      result = await operation()
    } catch (error) {
      operationError = toError(error)
    }

    let unlockError: Error | undefined
    try {
      const unlock = await client.query<{ unlocked: boolean }>(
        '/* withPostFinalizationLock.unlock */ SELECT pg_advisory_unlock($1, hashtext($2)) AS unlocked',
        [POST_FINALIZATION_LOCK_NAMESPACE, postId],
      )
      if (!unlock.rows[0]?.unlocked) {
        unlockError = new Error('Post finalization advisory lock was not held at release')
      }
    } catch (error) {
      unlockError = toError(error)
    }

    if (unlockError) {
      client.release(true)
      released = true
      if (operationError) {
        operationError.cause ??= unlockError
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
