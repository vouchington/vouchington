import { advisoryLockPool } from '@data-stores/psql'

/** Serializes the handler-level idempotency decision without sharing the persistence lock key. */
export function withElectionVoteRequestLock<Result>(
  entityType: string,
  userId: string,
  entityId: string,
  handler: () => Promise<Result>,
): Promise<Result> {
  return withSessionLock(`vote-request:${entityType}:${userId}:${entityId}`, handler)
}

async function withSessionLock<Result>(
  key: string,
  handler: () => Promise<Result>,
): Promise<Result> {
  const client = await advisoryLockPool.connect()
  let released = false
  let handlerError: Error | undefined
  let result: Result | undefined

  try {
    await client.query(
      '/* lockElectionVoteRequest */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [key],
    )

    try {
      result = await handler()
    } catch (error) {
      handlerError = toError(error)
    }

    let unlockError: Error | undefined
    try {
      const unlock = await client.query<{ unlocked: boolean }>(
        '/* unlockElectionVoteRequest */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
        [key],
      )
      if (!unlock.rows[0]?.unlocked)
        unlockError = new Error(`Election vote request lock was not held`)
    } catch (error) {
      unlockError = toError(error)
    }

    if (unlockError) {
      client.release(true)
      released = true
      if (handlerError) {
        handlerError.cause ??= unlockError
        throw handlerError
      }
      throw unlockError
    }

    client.release()
    released = true
    if (handlerError) throw handlerError
    return result as Result
  } catch (error) {
    if (!released) client.release(true)
    throw toError(error)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
