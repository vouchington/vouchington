import { beginTransaction, read } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { ACCOUNT_SUSPENDED, CONFLICT } from '@modules/on-error/error-codes'
import { isAdminUser } from './authorization.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { getPrivateUserByAny } from './get.mts'
import type { PrivateUser } from './types.mts'
import sql from 'sql-template-strings'
import { recordModeratorAction } from '@services/moderator-actions'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import {
  lockAuthorPublicationLifecycle,
  recordPostPublicationChange,
} from '@services/post-publication'

export async function suspendUser(
  currentUser: PrivateUser | null,
  userId: string,
  reason?: string,
): Promise<PrivateUser> {
  if (!isAdminUser(currentUser)) throw createHttpError(403, 'Forbidden')

  const user = await getPrivateUserByAny(userId)
  if (!user) throw createHttpError(404, 'User not found')
  if (user.suspended_at) throw createCodedError(409, 'User is already suspended', CONFLICT)

  await using query = await beginTransaction()
  await lockAuthorPublicationLifecycle(query, userId)

  // Re-check user existence and active suspension under the lock to handle concurrent operations.
  const { rows } = await query(sql`/* suspendUser:checkLocked */
      SELECT
        NOT EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND deleted_at IS NULL) AS user_gone,
        EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = ${userId} AND lifted_at IS NULL) AS already_suspended
    `)
  const { user_gone, already_suspended } = rows[0] as {
    user_gone: boolean
    already_suspended: boolean
  }
  if (user_gone) throw createHttpError(404, 'User not found')
  if (already_suspended) throw createCodedError(409, 'User is already suspended', CONFLICT)

  await query(sql`/* suspendUser:insert */
      INSERT INTO user_suspensions (user_id, suspended_by_id, reason)
      VALUES (${userId}, ${currentUser!.id}, ${reason ?? null})
    `)
  await recordPostPublicationChange(query, {
    scope: { type: 'author', authorUserId: userId },
    reason: 'author_suspension_changed',
    footprint: { priorAuthorUserId: userId },
  })
  await query.commit()

  await Promise.all([
    invalidate.users(userId),
    recordModeratorAction(currentUser?.id ?? null, {
      actionType: 'suspend',
      targetUserId: userId,
      reason,
    }),
  ])
  void enqueueRefreshTopHashtags()

  const updated = await getPrivateUserByAny(userId)
  if (!updated) throw createHttpError(404, 'User not found')
  return updated
}

export async function unsuspendUser(
  currentUser: PrivateUser | null,
  userId: string,
): Promise<PrivateUser> {
  if (!isAdminUser(currentUser)) throw createHttpError(403, 'Forbidden')

  const user = await getPrivateUserByAny(userId)
  if (!user) throw createHttpError(404, 'User not found')
  if (!user.suspended_at) throw createCodedError(409, 'User is not suspended', CONFLICT)

  await using query = await beginTransaction()
  await lockAuthorPublicationLifecycle(query, userId)

  const { rows: check } = await query(sql`/* unsuspendUser:checkLocked */
      SELECT EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND deleted_at IS NULL) AS user_exists
    `)
  if (!(check[0] as { user_exists: boolean }).user_exists) {
    throw createHttpError(404, 'User not found')
  }
  const { rows: termination } = await query<{ blocked: boolean }>(sql`
    /* unsuspendUser:copyrightTermination */
    SELECT EXISTS (
      SELECT 1 FROM copyright_repeat_infringer_reviews terminated
      WHERE terminated.account_user_id = ${userId}
        AND terminated.outcome = 'terminate'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_repeat_infringer_reviews reinstated
          WHERE reinstated.account_user_id = terminated.account_user_id
            AND reinstated.outcome = 'reinstatement'
            AND reinstated.outcome_at > terminated.outcome_at
        )
    ) AS blocked
  `)
  if (termination[0]?.blocked) {
    throw createCodedError(
      409,
      'Copyright termination remains in effect until reinstatement is recorded',
      CONFLICT,
    )
  }

  const { rowCount } = await query(sql`/* unsuspendUser */
      UPDATE user_suspensions
      SET lifted_at = CURRENT_TIMESTAMP,
          lifted_by_id = ${currentUser!.id}
      WHERE user_id = ${userId}
        AND lifted_at IS NULL
    `)
  if (!rowCount) throw createCodedError(409, 'User is not suspended', CONFLICT)
  await recordPostPublicationChange(query, {
    scope: { type: 'author', authorUserId: userId },
    reason: 'author_suspension_changed',
    footprint: { priorAuthorUserId: userId },
  })
  await query.commit()

  await Promise.all([
    invalidate.users(userId),
    recordModeratorAction(currentUser?.id ?? null, {
      actionType: 'unsuspend',
      targetUserId: userId,
    }),
  ])
  void enqueueRefreshTopHashtags()

  const updated = await getPrivateUserByAny(userId)
  if (!updated) throw createHttpError(404, 'User not found')
  return updated
}

export function assertNotSuspended(currentUser: PrivateUser | null | undefined): void {
  if (currentUser?.suspended_at) {
    throw createCodedError(403, 'Your account has been suspended', ACCOUNT_SUSPENDED)
  }
}

export async function getUserSuspensionById(suspensionId: string): Promise<
  | {
      id: string
      user_id: string
      reason: string | null
      lifted_at: Date | null
    }
  | undefined
> {
  const { rows } = await read<{
    id: string
    user_id: string
    reason: string | null
    lifted_at: Date | null
  }>(
    sql`/* getUserSuspensionById */
    SELECT id, user_id, reason, lifted_at FROM user_suspensions
    WHERE id = ${suspensionId}
    LIMIT 1
  `,
  )
  return rows[0]
}
