import { advisoryLockPool } from '@data-stores/psql'
import onError from '@modules/on-error'

// PostgreSQL's two-int advisory keys are structurally disjoint from the one-bigint keys used by
// Bluesky's user/DID transaction locks. This session lock spans provider I/O performed on other
// pooled connections, so sharing their key space could self-deadlock.
export const BLUESKY_DISCONNECT_LOCK_NAMESPACE = 0x4253

export async function withBlueskyDisconnectLock<Result>(
  userId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const client = await advisoryLockPool.connect()
  let released = false
  let operationError: Error | undefined
  let result: Result | undefined
  try {
    await client.query(
      '/* withBlueskyDisconnectLock:lock */ SELECT pg_advisory_lock($1, hashtext($2))',
      [BLUESKY_DISCONNECT_LOCK_NAMESPACE, userId],
    )
    try {
      result = await operation()
    } catch (error) {
      operationError = toError(error)
    }

    let unlockError: Error | undefined
    try {
      const unlock = await client.query<{ unlocked: boolean }>(
        '/* withBlueskyDisconnectLock:unlock */ SELECT pg_advisory_unlock($1, hashtext($2)) AS unlocked',
        [BLUESKY_DISCONNECT_LOCK_NAMESPACE, userId],
      )
      if (!unlock.rows[0]?.unlocked) {
        unlockError = new Error('Bluesky disconnect advisory lock was not held at release')
      }
    } catch (error) {
      unlockError = toError(error)
    }

    if (unlockError) {
      client.release(true)
      released = true
      if (operationError) {
        onError(unlockError)
        throw operationError
      }
      throw unlockError
    }
    client.release()
    released = true
    if (operationError) {
      throw operationError
    }
    return result as Result
  } catch (error) {
    if (!released) client.release(true)
    throw toError(error)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
