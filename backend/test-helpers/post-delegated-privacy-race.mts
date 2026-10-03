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
