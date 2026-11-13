import { runSequentially } from '@modules/utils/run-sequentially'
import { invalidateRssSnapshotsForLegalRemoval } from '@services/entity-cache/rss-snapshot-generation'
import { settleUserDeletionOperations } from './settle-deletion-operations.mts'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { enqueueUserDeletion } from '@queues/account-lifecycle/enqueues/user-deletions'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import { purgeCacheTags } from '@services/entity-cache/purge'
import { LEGAL_REMOVAL_TAG } from '@services/entity-cache/legal-removal'
import {
  addUserDeletionExternalWorks,
  completeUserDeletionExternalWorks,
  createUserDeletionRequest,
  type UserDeletionAttempt,
} from '@services/user-deletions'
import { currentUserCanDeleteUser } from './authorization.mts'
import { enqueueDeleteUserBookmarkBloomFilterBestEffort } from './enqueue-delete-user-bookmark-bloom-filter.mts'
import {
  revokeVerifiedIdentitiesForDeletedUser,
  softDeleteAndScrubUserProfile,
} from './delete-profile-pii.mts'
import type { PrivateUser } from './types.mts'
import { assertCopyrightEvidenceAllowsDeletion } from './delete-copyright-evidence.mts'
import { lockUserDeletionRows, type UserDeletionTarget } from './delete-row-locks.mts'

async function lockUserDeletionLifecycle(query: TransactionQuery, userId: string): Promise<void> {
  const { rows } = await query<{ acquired: boolean }>(sql`/* deleteUser:tryLockUser */
    SELECT pg_try_advisory_xact_lock(hashtextextended(${userId}, 0)) AS acquired
  `)
  const [lock] = rows
  if (!lock) throw new Error('User lifecycle lock query returned no result')
  if (!lock.acquired) {
    await query(sql`/* deleteUser:lockUser */
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `)
  }
}

async function establishUserDeletionRequest(
  query: TransactionQuery,
  user: PrivateUser,
  requestedById: string,
) {
  const target = await lockAndGetUserDeletionTarget(query, user.id, requestedById)
  const request = await createUserDeletionRequest(target.id, requestedById, {
    priorUsername: target.username,
    query,
  })
  return { request, target }
}

async function lockAndGetUserDeletionTarget(
  query: TransactionQuery,
  userId: string,
  requestedById: string,
): Promise<UserDeletionTarget> {
  await lockUserDeletionLifecycle(query, userId)
  return lockUserDeletionRows(query, userId, requestedById)
}

async function scrubUserDeletionIdentities(
  query: TransactionQuery,
  userId: string,
  requestedById: string,
): Promise<void> {
  const softDeleteRowCount = await softDeleteAndScrubUserProfile(userId, requestedById, query)
  assert(softDeleteRowCount > 0, 409, 'User is already deleted')
  await revokeVerifiedIdentitiesForDeletedUser(userId, query)
}

async function addUserDeletionCacheEvictionWork(
  query: TransactionQuery,
  requestId: string,
  target: UserDeletionTarget,
): Promise<void> {
  await addUserDeletionExternalWorks(
    requestId,
    'cloudflare-cache-tag',
    getUserDeletionCacheTags(target),
    query,
  )
}

function getUserDeletionCacheTags(target: UserDeletionTarget): string[] {
  return [
    LEGAL_REMOVAL_TAG,
    `user:${target.id}`,
    ...(target.username ? [`user:${target.username.toLowerCase()}`] : []),
  ]
}

async function attemptImmediateUserDeletionCacheEviction(
  requestId: string,
  target: UserDeletionTarget,
): Promise<void> {
  const tags = getUserDeletionCacheTags(target)
  try {
    await runSequentially([
      () => invalidateRssSnapshotsForLegalRemoval(),
      () => purgeCacheTags(tags),
      () =>
        settleUserDeletionOperations(
          [
            completeUserDeletionExternalWorks(
              requestId,
              'cloudflare-cache-tag',
              tags.filter(tag => tag !== LEGAL_REMOVAL_TAG),
            ),
          ],
          'User deletion cache receipts failed',
        ),
    ])
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

async function applyUserDeletionPrivacyFence(
  query: TransactionQuery,
  requestId: string,
  target: UserDeletionTarget,
  requestedById: string,
): Promise<void> {
  await scrubUserDeletionIdentities(query, target.id, requestedById)
  await addUserDeletionCacheEvictionWork(query, requestId, target)
}

/**
 * Commits the public privacy fence and durable request, then accelerates background erasure.
 * PostgreSQL recovery owns correctness if either cache eviction or initial enqueue fails.
 */
export async function deleteUser(
  currentUser: PrivateUser | null,
  user: PrivateUser,
): Promise<UserDeletionAttempt> {
  assert(currentUserCanDeleteUser(currentUser, user), 403, 'Forbidden')
  const requestedById = currentUser?.id ?? user.id

  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- Deletion establishment locks the account/publication scope and returns request/target; the copyright guard must reject protected evidence before privacy-fence writes.
  const deletion = await establishUserDeletionRequest(query, user, requestedById)
  await assertCopyrightEvidenceAllowsDeletion(query, user.id)
  await applyUserDeletionPrivacyFence(query, deletion.request.id, deletion.target, requestedById)
  await query.commit()

  await settleUserDeletionOperations(
    [
      invalidate.users(deletion.target.id, deletion.target.username),
      attemptImmediateUserDeletionCacheEviction(deletion.request.id, deletion.target),
    ],
    'User deletion follow-ups failed',
  )
  await enqueueDeleteUserBookmarkBloomFilterBestEffort(user.id)
  // Delivery denial is post-commit: the scheduled reconciliation repairs a missed enqueue.
  try {
    await enqueueReconcileMediaDeliveryRegistry()
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
  try {
    await enqueueUserDeletion({
      requestId: deletion.request.id,
      processingAttemptId: deletion.request.processingAttemptId,
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
  return {
    requestId: deletion.request.id,
    processingAttemptId: deletion.request.processingAttemptId,
  }
}
