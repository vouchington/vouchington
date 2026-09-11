import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  findMostRecentCaseForEntity,
  openOrGetOpenCase,
  reopenCase,
} from '@services/moderation-cases'
import type { AppealTargetContext } from './create-target.mts'
import { getModerationAppealById } from './get.mts'
import type { CreateModerationAppealInput } from './parse.mts'
import { selectPostRemovalKind } from './post-removal-kind.mts'

export async function resolveAppealTargetPost(
  currentUser: PrivateUser,
  input: CreateModerationAppealInput,
): Promise<AppealTargetContext> {
  const targetId = input.targetId!
  const { rows } = await read<{
    id: string
    created_by_id: string
    community_id: string | null
    rejected_at: Date | null
    community_unpublished_id: string | null
    community_unpublished_at: Date | null
    community_rejection_reason: string | null
    community_unpublished_by_id: string | null
    platform_rejection_reason: string | null
    platform_rejected_by_id: string | null
  }>(
    sql`/* resolveAppealTarget:getPost */
    SELECT p.id, p.created_by_id, p.community_id, p.rejected_at,
           community_removal.community_id AS community_unpublished_id,
           community_removal.unpublished_at AS community_unpublished_at,
           community_removal.rejection_reason AS community_rejection_reason,
           community_removal.unpublished_by_id AS community_unpublished_by_id,
           platform_removal.note AS platform_rejection_reason,
           platform_removal.changed_by_id AS platform_rejected_by_id
    FROM posts p
    LEFT JOIN post_clearance_changes platform_removal
      ON platform_removal.id = p.latest_clearance_change_id
    LEFT JOIN LATERAL (
      SELECT
        cpr.community_id,
        cpr.unpublished_at,
        cpr.rejection_reason,
        cpr.unpublished_by_id
      FROM community_post_reviews cpr
      WHERE cpr.post_id = p.id AND cpr.unpublished_at IS NOT NULL
      ORDER BY cpr.unpublished_at DESC, cpr.community_id
      LIMIT 1
    ) community_removal ON true
    WHERE p.id = ${targetId} AND p.deleted_at IS NULL
    LIMIT 1
  `,
  )
  const row = rows[0]
  assert(row, 404, 'Post not found')
  assert(row.created_by_id === currentUser.id, 403, 'You can only appeal removal of your own posts')
  assert(
    row.rejected_at != null || row.community_unpublished_at != null,
    422,
    'Post has not been removed',
  )
  const postRemovalKind = selectPostRemovalKind(input.postRemovalKind, row)
  // Reuse the most recent case for this post (possibly resolved) so the appeal traces back to
  // the original incident. openOrGetOpenCase would create a new case if the old one resolved.
  const mostRecentPostCase = await findMostRecentCaseForEntity({
    entityType: 'post',
    entityId: targetId,
  })
  let caseId: string
  if (mostRecentPostCase) {
    if (mostRecentPostCase.resolved_at) {
      await reopenCase(mostRecentPostCase.id)
    }
    caseId = mostRecentPostCase.id
  } else {
    caseId = await openOrGetOpenCase({ entityType: 'post', entityId: targetId })
  }
  const { rows: postDupRows } = await read<{ id: string }>(
    sql`/* resolveAppealTarget:checkPostDuplicate */
    SELECT id FROM moderation_appeals
    WHERE appellant_id = ${currentUser.id}
      AND post_id = ${targetId}
      AND post_removal_kind IS NOT DISTINCT FROM ${postRemovalKind}
      AND resolved_at IS NULL
    LIMIT 1
    `,
  )
  const duplicate = postDupRows[0] ? await getModerationAppealById(postDupRows[0].id) : undefined
  const originalDecision =
    postRemovalKind === 'community'
      ? {
          reason: row.community_rejection_reason,
          actorId: row.community_unpublished_by_id,
          decidedAt: row.community_unpublished_at,
        }
      : {
          reason: row.platform_rejection_reason,
          actorId: row.platform_rejected_by_id,
          decidedAt: row.rejected_at,
        }
  assert(originalDecision.decidedAt, 500, 'Removal decision timestamp is missing')
  return {
    communityId: postRemovalKind === 'community' ? row.community_unpublished_id : row.community_id,
    userWarningId: null,
    communityBanId: null,
    postId: targetId,
    userSuspensionId: null,
    postRemovalKind,
    caseId,
    originalDecisionReason: originalDecision.reason,
    originalDecisionActorId: originalDecision.actorId,
    originalDecisionAt: originalDecision.decidedAt,
    duplicate: duplicate ?? undefined,
  }
}
