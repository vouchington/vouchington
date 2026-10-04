import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

/** Hold the canonical writer fence while a delegated mutation passes its old public preflight. */
export function withConcurrentPostPrivacyChangeForTest<T>(
  postId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockPostPublicationCaptures',
    async query => {
      await query(sql`/* withConcurrentPostPrivacyChangeForTest.fence */
        SELECT pg_advisory_xact_lock(hashtextextended(${`post:${postId.toLowerCase()}`}, 0))`)
      await query(sql`/* withConcurrentPostPrivacyChangeForTest */
        UPDATE posts SET privacy = 'private', broadcast = 'users' WHERE id = ${postId}`)
    },
  )
}

/** Commit a disabled community type only after creation reaches its settings row fence. */
export function withConcurrentCommunityReviewDisableForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockDelegatedPostCommunity',
    async query => {
      await query(sql`/* withConcurrentCommunityReviewDisableForTest */
        UPDATE communities SET allow_review_posts = false WHERE id = ${communityId}`)
    },
  )
}

/** Delete a community only after a delegated thread write waits on its live row. */
export function withConcurrentCommunityDeletionForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockDelegatedPostCommunity',
    async query => {
      await query(sql`/* withConcurrentCommunityDeletionForTest */
        UPDATE communities SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${communityId}`)
    },
  )
}

/** Archive a community only after a delegated reply waits on its live row. */
export function withConcurrentCommunityArchiveForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
  queryMarker = 'lockDelegatedPostCommunity',
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(operation, queryMarker, async query => {
    await query(sql`/* withConcurrentCommunityArchiveForTest */
        UPDATE communities SET archived_at = CURRENT_TIMESTAMP WHERE id = ${communityId}`)
  })
}

/** Commit suspension after a delegated write reaches the canonical author lifecycle fence. */
export function withConcurrentActorSuspensionForTest<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockPostPublicationScope',
    async query => {
      await query(sql`/* withConcurrentActorSuspensionForTest.fence */
        SELECT pg_advisory_xact_lock(hashtextextended(${`author:${userId.toLowerCase()}`}, 0))`)
      await query(sql`/* withConcurrentActorSuspensionForTest */
        INSERT INTO user_suspensions (user_id, suspended_by_id) VALUES (${userId}, ${userId})`)
    },
  )
}

/** Commit deletion only after a delegated create waits on the active-user mutation fence. */
export function withConcurrentActorDeletionForTest<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(
    operation,
    'lockActiveUserSubjectsForMutation',
    async query => {
      await query(sql`/* withConcurrentActorDeletionForTest.fence */
        SELECT pg_advisory_xact_lock(hashtextextended(${userId.toLowerCase()}, 0))`)
      await query(sql`/* withConcurrentActorDeletionForTest */
        UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${userId}`)
    },
  )
}

/** Revoke membership only after the write waits on its active membership row. */
export function withConcurrentCommunityMembershipRemovalForTest<T>(
  communityId: string,
  userId: string,
  operation: () => Promise<T>,
  queryMarker = 'lockDelegatedPostCommunity.membership',
): Promise<T> {
  return withConcurrentDelegatedWriteChangeForTest(operation, queryMarker, async query => {
    await query(sql`/* withConcurrentCommunityMembershipRemovalForTest */
        UPDATE community_members SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${userId}
        WHERE community_id = ${communityId} AND user_id = ${userId} AND removed_at IS NULL`)
  })
}

/** Commit the staged change only after the mutation is blocked on the exact writer fence. */
async function withConcurrentDelegatedWriteChangeForTest<T>(
  operation: () => Promise<T>,
  queryMarker: string,
  stageChange: (query: QueryExecutor) => Promise<void>,
): Promise<T> {
  await using query = await beginTransaction()
  const processId = await getTestPostgresBackendProcessId(query)
  await stageChange(query)
  const pending = operation()
  void pending.catch(() => undefined)
  try {
    await waitForTestPostgresLockWaiter(processId, queryMarker)
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}
