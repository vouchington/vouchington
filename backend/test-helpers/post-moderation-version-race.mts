import { beginTransaction } from '@data-stores/psql'
import { ensureCurrentPostModerationVersion } from '../services/post-clearance/moderation-ledger.mts'
import type { PostModerationVersion } from '../services/post-clearance/moderation-ledger-types.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

/**
 * Commits the post's first moderation version in another transaction only after `operation` is
 * blocked on that post's row lock, so its statement snapshot predates the commit.
 */
export async function withConcurrentPostModerationVersionCommitForTest<T>(
  postId: string,
  operation: () => Promise<T>,
  queryMarker = 'ensureCurrentPostModerationVersion',
): Promise<{ result: T; committed: PostModerationVersion }> {
  await using holder = await beginTransaction()
  const committed = await ensureCurrentPostModerationVersion(postId, { query: holder })
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  const result = await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = operation()
      await waitForLock(pending)
      await holder.commit()
      return pending
    },
  )
  return { result, committed }
}
