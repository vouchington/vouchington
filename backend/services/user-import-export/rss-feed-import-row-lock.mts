import { jobSerializationPool } from '@data-stores/psql'
import onError from '@modules/on-error'

// Two-int advisory keys are disjoint from the bigint keys used by transaction locks.
const RSS_FEED_IMPORT_ROW_LOCK_NAMESPACE = 0x5252

export class RssFeedImportRowBusyError extends Error {
  constructor() {
    super('RSS feed import row is already being processed')
    this.name = 'RssFeedImportRowBusyError'
  }
}

/** Serializes the side effects of one row without holding a database transaction over feed I/O. */
export async function withRssFeedImportRowLock<Result>(
  rowId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const client = await jobSerializationPool.connect()
  const values = [RSS_FEED_IMPORT_ROW_LOCK_NAMESPACE, rowId]
  let released = false
  let operationError: Error | undefined
  let result: Result | undefined
  // pg-pool detaches its idle error listener while a client is checked out, so a dropped connection
  // would otherwise crash the process. pg emits 'error' again when the socket closes after the
  // server's FATAL message, so a dropped client keeps this listener for its remaining life. The
  // loss surfaces through the unlock query rejecting.
  const ignoreClientError = () => {}
  client.on('error', ignoreClientError)

  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      "/* withRssFeedImportRowLock:try */ SELECT pg_try_advisory_lock($1, hashtext(current_database() || ':' || $2)) AS acquired",
      values,
    )
    if (!rows[0]?.acquired) {
      client.removeListener('error', ignoreClientError)
      client.release()
      released = true
      throw new RssFeedImportRowBusyError()
    }

    try {
      result = await operation()
    } catch (err) {
      operationError = toError(err)
    }

    let unlockError: Error | undefined
    try {
      const unlock = await client.query<{ unlocked: boolean }>(
        "/* withRssFeedImportRowLock:unlock */ SELECT pg_advisory_unlock($1, hashtext(current_database() || ':' || $2)) AS unlocked",
        values,
      )
      if (!unlock.rows[0]?.unlocked)
        unlockError = new Error(`RSS feed import row lock was not held for ${rowId}`)
    } catch (err) {
      unlockError = toError(err)
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

    client.removeListener('error', ignoreClientError)
    client.release()
    released = true
    if (operationError) throw operationError
    return result as Result
  } catch (err) {
    if (!released) client.release(true)
    throw toError(err)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
