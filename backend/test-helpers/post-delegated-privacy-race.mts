import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from './postgres-lock-wait.mts'

/** Hold the canonical writer fence while a delegated mutation passes its old public preflight. */
export async function withConcurrentPostPrivacyChangeForTest<T>(
  postId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  await query(sql`/* withConcurrentPostPrivacyChangeForTest.fence */
    SELECT pg_advisory_xact_lock(hashtextextended(${`post:${postId.toLowerCase()}`}, 0))`)
  const processId = await getTestPostgresBackendProcessId(query)
  await query(sql`/* withConcurrentPostPrivacyChangeForTest */
    UPDATE posts SET privacy = 'private', broadcast = 'users' WHERE id = ${postId}`)
  const pending = operation()
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockPostPublicationCaptures')
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}

/** Commit a disabled community type only after creation reaches its settings row fence. */
export async function withConcurrentCommunityReviewDisableForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  const processId = await getTestPostgresBackendProcessId(query)
  await query(sql`/* withConcurrentCommunityReviewDisableForTest */
    UPDATE communities SET allow_review_posts = false WHERE id = ${communityId}`)
  const pending = operation()
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockDelegatedPostCommunity')
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}

/** Delete a community only after a delegated thread write waits on its live row. */
export async function withConcurrentCommunityDeletionForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  const processId = await getTestPostgresBackendProcessId(query)
  await query(sql`/* withConcurrentCommunityDeletionForTest */
    UPDATE communities SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${communityId}`)
  const pending = operation()
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockDelegatedPostCommunity')
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}

/** Archive a community only after a delegated reply waits on its live row. */
export async function withConcurrentCommunityArchiveForTest<T>(
  communityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  const processId = await getTestPostgresBackendProcessId(query)
  await query(sql`/* withConcurrentCommunityArchiveForTest */
    UPDATE communities SET archived_at = CURRENT_TIMESTAMP WHERE id = ${communityId}`)
  const pending = operation()
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockDelegatedPostCommunity')
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}

/** Commit suspension after a delegated write reaches the canonical author lifecycle fence. */
export async function withConcurrentActorSuspensionForTest<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  await query(sql`/* withConcurrentActorSuspensionForTest.fence */
    SELECT pg_advisory_xact_lock(hashtextextended(${`author:${userId.toLowerCase()}`}, 0))`)
  const processId = await getTestPostgresBackendProcessId(query)
  await query(sql`/* withConcurrentActorSuspensionForTest */
    INSERT INTO user_suspensions (user_id, suspended_by_id) VALUES (${userId}, ${userId})`)
  const pending = operation()
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockPostPublicationScope')
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}

/** Revoke membership only after the write waits on its active membership row. */
export async function withConcurrentCommunityMembershipRemovalForTest<T>(
  communityId: string,
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  const processId = await getTestPostgresBackendProcessId(query)
  await query(sql`/* withConcurrentCommunityMembershipRemovalForTest */
    UPDATE community_members SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${userId}
    WHERE community_id = ${communityId} AND user_id = ${userId} AND removed_at IS NULL`)
  const pending = operation()
  try {
    await waitForTestPostgresLockWaiter(processId, 'lockDelegatedPostCommunity.membership')
    await query.commit()
  } catch (err) {
    await query.rollback()
    await pending.catch(() => undefined)
    throw err
  }
  return await pending
}
