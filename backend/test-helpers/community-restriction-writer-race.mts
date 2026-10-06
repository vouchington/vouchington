import { beginTransaction } from '@data-stores/psql'
import { setTimeout } from 'node:timers/promises'
import { vi } from 'vitest'
import { lockDelegatedPostCommunity } from '../services/posts/delegated-write-locks.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

/**
 * How far ahead of "now" a restriction expiry sits when a case needs it to pass while the writer is
 * held at the fence. `withHeldDelegatedCommunityFenceForTest` really sleeps until that instant, so
 * keep it just long enough for the writer to reach the fence (a handful of queries).
 */
export const FENCE_HELD_EXPIRY_OFFSET_MS = 2_000

/** Keep the delegated community fence until the real restriction writer is blocked on it. */
export async function withHeldDelegatedCommunityFenceForTest<T>(
  communityId: string,
  actorId: string,
  operation: () => Promise<T>,
  releaseAfter?: () => Date,
): Promise<T> {
  await using query = await beginTransaction()
  await lockDelegatedPostCommunity(query, communityId, actorId)
  const processId = await getTestPostgresBackendProcessId(query)
  const pending = operation()
  void pending.catch(() => undefined)
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockCommunityRestrictionWrites')
    if (releaseAfter) {
      const releaseAt = releaseAfter().getTime()
      // The writer must be blocked before the expiry; otherwise this case would pass without ever
      // testing an expiry that lapses while the writer waits on the fence.
      if (releaseAt <= Date.now()) {
        throw new Error('The writer reached the fence only after the expiry had already passed')
      }
      await setTimeout(releaseAt - Date.now() + 1)
    }
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}

/** Simulate application clock skew without changing PostgreSQL or real lock-wait timers. */
export async function withCommunityRestrictionApplicationClockForTest<T>(
  at: Date,
  operation: () => Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at)
  try {
    return await operation()
  } finally {
    vi.useRealTimers()
  }
}
