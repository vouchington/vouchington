import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@voucha/types/entities/user'
import { getModerationAppealById } from './get.mts'
import { openOrGetOpenCase } from '@services/moderation-cases'
import type { AppealTargetContext } from './create-target.mts'

/** Resolves a suspension appeal target for the current user's most recent active suspension. */
export async function resolveAppealTargetSuspension(
  currentUser: PrivateUser,
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
  )
  assert(suspRows[0], 404, 'No active suspension to appeal')
  const suspension = suspRows[0]
  const suspensionId = suspension.id
  const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: currentUser.id })
  const { rows: suspDupRows } = await read<{ id: string }>(
    sql`/* resolveAppealTargetSuspension:checkDuplicate */
    SELECT id FROM moderation_appeals
    WHERE appellant_id = ${currentUser.id}
      AND user_suspension_id = ${suspensionId}
      AND resolved_at IS NULL
    LIMIT 1
    `,
  )
  const duplicate = suspDupRows[0] ? await getModerationAppealById(suspDupRows[0].id) : undefined
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
