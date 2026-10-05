import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { CreateModerationAppealInput } from './parse.mts'
import { getModerationAppealById } from './get.mts'
import { reopenCase, findOpenCaseForEntity } from '@services/moderation-cases'
import { resolveAppealTargetSuspension } from './create-target-suspension.mts'
import { resolveAppealTargetPost } from './create-target-post.mts'
import type { AppealTargetContext } from './create-target-types.mts'
export type { AppealTargetContext } from './create-target-types.mts'

/** Resolves the appeal target, enforcing ownership and returning all FK fields. */
export async function resolveAppealTarget(
  currentUser: PrivateUser,
  input: CreateModerationAppealInput,
): Promise<AppealTargetContext> {
  const { targetType, targetId } = input

  if (targetType === 'warning') {
    // targetId is always set for non-suspension types (validated in parse.mts)
    const { rows } = await read<{
      id: string
      user_id: string
      community_id: string | null
      case_id: string
      reason: string | null
      issued_by_id: string | null
      created_at: Date
    }>(
      sql`/* resolveAppealTarget:getWarning */
      SELECT id, user_id, community_id, case_id, reason, issued_by_id, created_at
      FROM user_warnings
      WHERE id = ${targetId!} AND revoked_at IS NULL
      LIMIT 1
    `,
    )
    const row = rows[0]
    assert(row, 404, 'Warning not found or already revoked')
    assert(row.user_id === currentUser.id, 403, 'You can only appeal your own warnings')
    // Use the warning's case unless a newer open case already exists for this user —
    // reopening the old case while a newer open case exists would violate the partial unique index.
    const warningOpenCase = await findOpenCaseForEntity({
      entityType: 'user',
      entityId: row.user_id,
    })
    let warningCaseId = row.case_id
    if (!warningOpenCase) {
      await reopenCase(row.case_id)
    } else if (warningOpenCase.id !== row.case_id) {
      warningCaseId = warningOpenCase.id
    }
    return {
      communityId: row.community_id,
      userWarningId: targetId!,
      communityBanId: null,
      postId: null,
      userSuspensionId: null,
      postRemovalKind: null,
      caseId: warningCaseId,
      originalDecisionReason: row.reason,
      originalDecisionActorId: row.issued_by_id,
      originalDecisionAt: row.created_at,
    }
  }

  if (targetType === 'ban') {
    const { rows } = await read<{
      id: string
      user_id: string
      community_id: string
      case_id: string
      reason: string | null
      banned_by_id: string | null
      created_at: Date
    }>(
      sql`/* resolveAppealTarget:getBan */
      SELECT id, user_id, community_id, case_id, reason, banned_by_id, created_at
      FROM community_bans
      WHERE id = ${targetId!} AND lifted_at IS NULL
      LIMIT 1
    `,
    )
    const row = rows[0]
    assert(row, 404, 'Ban not found or already lifted')
    assert(row.user_id === currentUser.id, 403, 'You can only appeal your own bans')
    // Same guard as warning: only reopen if no newer open case already exists for this user.
    const banOpenCase = await findOpenCaseForEntity({ entityType: 'user', entityId: row.user_id })
    let banCaseId = row.case_id
    if (!banOpenCase) {
      await reopenCase(row.case_id)
    } else if (banOpenCase.id !== row.case_id) {
      banCaseId = banOpenCase.id
    }
    const { rows: banDupRows } = await read<{ id: string }>(
      sql`/* resolveAppealTarget:checkBanDuplicate */
      SELECT id FROM moderation_appeals
      WHERE appellant_user_id = ${currentUser.id}
        AND community_ban_id = ${targetId!}
        AND resolved_at IS NULL
      LIMIT 1
      `,
    )
    const duplicate = banDupRows[0] ? await getModerationAppealById(banDupRows[0].id) : undefined
    return {
      communityId: row.community_id,
      userWarningId: null,
      communityBanId: targetId!,
      postId: null,
      userSuspensionId: null,
      postRemovalKind: null,
      caseId: banCaseId,
      originalDecisionReason: row.reason,
      originalDecisionActorId: row.banned_by_id,
      originalDecisionAt: row.created_at,
      duplicate: duplicate ?? undefined,
    }
  }

  if (targetType === 'suspension') {
    return resolveAppealTargetSuspension(currentUser)
  }

  return resolveAppealTargetPost(currentUser, input)
}
