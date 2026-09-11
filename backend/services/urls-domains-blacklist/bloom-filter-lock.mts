import { advisoryLockPool } from '@data-stores/psql'
import onError from '@modules/on-error'

// PostgreSQL's two-int advisory keys are structurally disjoint from one-bigint keys, and
// current_database() scopes same-filter locking to one worktree database per local cluster.
export const BLOCKLIST_BLOOM_FILTER_LOCK_NAMESPACE = 0x4246

export async function withBlocklistBloomFilterLock<Result>(
  filterName: 'url-blocklist' | 'email-blocklist',
  operation: () => Promise<Result>,
): Promise<Result> {
  const client = await advisoryLockPool.connect()
  let released = false
  let operationError: Error | undefined
  let result: Result | undefined

  try {
    await client.query(
      "/* withBlocklistBloomFilterLock:lock */ SELECT pg_advisory_lock($1, hashtext(current_database() || ':' || $2))",
      [BLOCKLIST_BLOOM_FILTER_LOCK_NAMESPACE, filterName],
    )

    try {
      result = await operation()
    } catch (error) {
      operationError = toError(error)
    }

    let unlockError: Error | undefined
    try {
      const unlock = await client.query<{ unlocked: boolean }>(
        "/* withBlocklistBloomFilterLock:unlock */ SELECT pg_advisory_unlock($1, hashtext(current_database() || ':' || $2)) AS unlocked",
        [BLOCKLIST_BLOOM_FILTER_LOCK_NAMESPACE, filterName],
      )
      if (!unlock.rows[0]?.unlocked) {
        unlockError = new Error(`Blocklist Bloom filter lock was not held for ${filterName}`)
      }
    } catch (error) {
      unlockError = toError(error)
    }

    if (unlockError) {
      client.release(true)
      released = true
      if (operationError) {
        onError(unlockError)
        throwError(operationError)
      }
      throwError(unlockError)
    }

    client.release()
    released = true
    if (operationError) throwError(operationError)
    return result as Result
  } catch (error) {
    if (!released) client.release(true)
    throw toError(error)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function throwError(error: Error): never {
  throw error
}
