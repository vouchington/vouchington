import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@voucha/types/entities/user'
import { getModerationAppealByIdFromPrimary } from './get.mts'
import { openOrGetOpenCase } from '@services/moderation-cases'
import type { AppealTargetContext } from './create-target-types.mts'

/** Resolves a suspension appeal target for the current user's most recent active suspension. */
export async function resolveAppealTargetSuspension(
  currentUser: PrivateUser,
  queryOptions?: QueryOptions,
): Promise<AppealTargetContext> {
  const { rows: suspRows } = await read<{
    id: string
    reason: string | null
    suspended_by_id: string | null
    created_at: Date
  }>(
    sql`/* resolveAppealTargetSuspension:getSuspension */
    SELECT id, reason, suspended_by_id, created_at
    FROM user_suspensions
    WHERE user_id = ${currentUser.id}
      AND lifted_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `,
    queryOptions,
  )
  assert(suspRows[0], 404, 'No active suspension to appeal')
  const suspension = suspRows[0]
  const suspensionId = suspension.id
  const caseId = await openOrGetOpenCase(
    { entityType: 'user', entityId: currentUser.id },
    queryOptions,
  )
  const { rows: suspDupRows } = await read<{ id: string }>(
    sql`/* resolveAppealTargetSuspension:checkDuplicate */
    SELECT id FROM moderation_appeals
    WHERE appellant_user_id = ${currentUser.id}
      AND user_suspension_id = ${suspensionId}
      AND resolved_at IS NULL
    LIMIT 1
    `,
    queryOptions,
  )
  const duplicate = suspDupRows[0]
    ? await getModerationAppealByIdFromPrimary(suspDupRows[0].id, queryOptions)
    : undefined
  return {
    communityId: null,
    userWarningId: null,
    communityBanId: null,
    postId: null,
    userSuspensionId: suspensionId,
    postRemovalKind: null,
    caseId,
    originalDecisionReason: suspension.reason,
    originalDecisionActorId: suspension.suspended_by_id,
    originalDecisionAt: suspension.created_at,
    duplicate: duplicate ?? undefined,
  }
}
