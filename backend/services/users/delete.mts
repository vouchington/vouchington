import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { enqueueUserDeletion } from '@queues/user-deletions/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import { purgeCacheTags } from '@services/entity-cache/purge'
import {
  addUserDeletionExternalWork,
  completeUserDeletionExternalWork,
  createUserDeletionRequest,
  type UserDeletionAttempt,
} from '@services/user-deletions'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { currentUserCanDeleteUser } from './authorization.mts'
import { enqueueDeleteUserBookmarkBloomFilterBestEffort } from './enqueue-delete-user-bookmark-bloom-filter.mts'
import {
  revokeVerifiedIdentitiesForDeletedUser,
  softDeleteAndScrubUserProfile,
} from './delete-profile-pii.mts'
import type { PrivateUser } from './types.mts'
import { prepublishImageSurfaceDenial } from '@services/media-delivery-safety'
import { assertCopyrightEvidenceAllowsDeletion } from './delete-copyright-evidence.mts'

type UserDeletionTarget = {
  id: string
  username: string | null
}

async function lockUserDeletionLifecycle(query: TransactionQuery, userId: string): Promise<void> {
  await query(sql`/* deleteUser:lockUser */
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
  `)
  await lockAuthorPublicationLifecycle(query, userId)
}

async function getUserDeletionTarget(
  query: TransactionQuery,
  userId: string,
): Promise<UserDeletionTarget> {
  const { rows } = await query<UserDeletionTarget>(sql`/* deleteUser:lockUserRow */
    SELECT id, username FROM users
    WHERE id = ${userId}
    FOR UPDATE
  `)
  const target = rows[0]
  assert(target, 409, 'User is already deleted')
  return target
}

async function auditAndCreateUserDeletionRequest(
  query: TransactionQuery,
  target: UserDeletionTarget,
  requestedById: string,
) {
  await query(sql`/* deleteUser:audit */
    INSERT INTO user_deletion_audit_logs (user_id, requested_by_id)
    VALUES (${target.id}, ${requestedById})
  `)
  return createUserDeletionRequest(target.id, requestedById, {
    priorUsername: target.username,
    query,
  })
}

type DeleteUserDependencies = {
  purgeCacheTags: (tags: readonly string[]) => Promise<unknown>
}

async function establishUserDeletionRequest(
  query: TransactionQuery,
  user: PrivateUser,
  requestedById: string,
) {
  const target = await lockAndGetUserDeletionTarget(query, user.id)
  const request = await auditAndCreateUserDeletionRequest(query, target, requestedById)
  return { request, target }
}

async function lockAndGetUserDeletionTarget(
  query: TransactionQuery,
  userId: string,
): Promise<UserDeletionTarget> {
  await lockUserDeletionLifecycle(query, userId)
  return getUserDeletionTarget(query, userId)
}

async function scrubUserDeletionIdentities(
  query: TransactionQuery,
  userId: string,
  requestedById: string,
): Promise<void> {
  await prepublishImageSurfaceDenial({ surfaceKind: 'user-profile-image', userId }, query)
  const softDeleteRowCount = await softDeleteAndScrubUserProfile(userId, requestedById, query)
  assert(softDeleteRowCount > 0, 409, 'User is already deleted')
  await revokeVerifiedIdentitiesForDeletedUser(userId, query)
}

async function addUserDeletionCacheEvictionWork(
  query: TransactionQuery,
  requestId: string,
  target: UserDeletionTarget,
): Promise<void> {
  await Promise.all(
    getUserDeletionCacheTags(target).map(tag =>
      addUserDeletionExternalWork(requestId, 'cloudflare-cache-tag', tag, query),
    ),
  )
}

function getUserDeletionCacheTags(target: UserDeletionTarget): string[] {
  return [
    `user:${target.id}`,
    ...(target.username ? [`user:${target.username.toLowerCase()}`] : []),
  ]
}

async function attemptImmediateUserDeletionCacheEviction(
  requestId: string,
  target: UserDeletionTarget,
  purge: DeleteUserDependencies['purgeCacheTags'],
): Promise<void> {
  const tags = getUserDeletionCacheTags(target)
  try {
    await purge(tags)
    await Promise.all(
      tags.map(tag => completeUserDeletionExternalWork(requestId, 'cloudflare-cache-tag', tag)),
    )
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
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
  dependencies: Partial<DeleteUserDependencies> = {},
): Promise<UserDeletionAttempt> {
  assert(currentUserCanDeleteUser(currentUser, user), 403, 'Forbidden')
  const requestedById = currentUser?.id ?? user.id

  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- the copyright check must follow the deletion lock and precede the privacy fence
  const deletion = await establishUserDeletionRequest(query, user, requestedById)
  await assertCopyrightEvidenceAllowsDeletion(query, user.id)
  await applyUserDeletionPrivacyFence(query, deletion.request.id, deletion.target, requestedById)
  await query.commit()

  await Promise.all([
    invalidate.users(deletion.target.id, deletion.target.username),
    attemptImmediateUserDeletionCacheEviction(
      deletion.request.id,
      deletion.target,
      dependencies.purgeCacheTags ?? purgeCacheTags,
    ),
  ])
  enqueueDeleteUserBookmarkBloomFilterBestEffort(user.id)
  try {
    await enqueueUserDeletion({
      requestId: deletion.request.id,
      processingAttemptId: deletion.request.processingAttemptId,
    })
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
  return {
    requestId: deletion.request.id,
    processingAttemptId: deletion.request.processingAttemptId,
  }
}
