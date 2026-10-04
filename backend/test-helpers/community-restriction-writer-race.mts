import { beginTransaction } from '@data-stores/psql'
import { setTimeout } from 'node:timers/promises'
import { lockDelegatedPostCommunity } from '../services/posts/delegated-write-locks.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

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
      await setTimeout(Math.max(0, releaseAfter().getTime() - Date.now() + 1))
    }
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}
