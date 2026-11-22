import { getTestUserRaw } from './entities/index.mts'
import { observeTestUserPurgeAttempt, testPurgeSqlState } from './reciprocal-user-purge.mts'

const MAX_TICKS = 15

function isScheduledCollision(error: unknown): boolean {
  const code = testPurgeSqlState(error)
  return code === '40001' || code === '40P01'
}

/**
 * Runs scheduler ticks of a final user purge until the owned accounts are settled.
 *
 * Production aborts a purge that loses a SERIALIZABLE race and relies on the next scheduled tick.
 * Concurrent test files purge their own accounts through the same tables, and tiny shared tables
 * take relation-level predicate locks, so an unrelated file can abort an owned purge. Use this
 * only where the purge is not the race subject; a race subject asserts its documented aborts.
 * Returns every tick's result in order; throws if the accounts are still unsettled after the last tick.
 */
export async function runUserPurgeTicksForTest<T>(
  tick: () => Promise<T>,
  isSettled: (results: readonly T[]) => boolean | Promise<boolean>,
): Promise<T[]> {
  const results: T[] = []
  for (let attempt = 1; ; attempt++) {
    let collided = false
    try {
      results.push(await tick())
    } catch (err) {
      if (!isScheduledCollision(err)) throw err
      if (attempt === MAX_TICKS) throw err
      collided = true
    }
    if (!collided && (await isSettled(results))) return results
    if (attempt === MAX_TICKS) throw new Error(`Owned purge did not settle in ${MAX_TICKS} ticks`)
  }
}

/**
 * One owned purge call that reruns only when a PostgreSQL serialization or deadlock abort
 * struck one of its transactions, whether it surfaced as a rejection or the scheduler absorbed it.
 * Use it only where the call is one transaction per owned account: work an aborted attempt already
 * committed is not part of the returned result, and a rerun restarts any row allowance.
 */
export async function runUserPurgePageForTest<T>(page: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { result, failures } = await observeTestUserPurgeAttempt(page)
      if (attempt === MAX_TICKS || !failures.some(failure => isScheduledCollision(failure.error))) {
        return result
      }
    } catch (err) {
      if (attempt === MAX_TICKS || !isScheduledCollision(err)) throw err
    }
  }
}

/** True once every owned account row is gone, whether this tick or another committed the purge. */
export async function areTestUsersDeleted(userIds: readonly string[]): Promise<boolean> {
  const rows = await Promise.all(userIds.map(id => getTestUserRaw(id)))
  return rows.every(row => row === null)
}
