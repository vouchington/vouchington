import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { ModerationAppeal } from './config.mts'
import type { ModerationAppealResponse } from './types.mts'
import { enqueueAppealResolutionAsync } from './enqueue-appeal-resolution.mts'
import type { AppealTargetContext } from './create-target-types.mts'
import { appealConflictClause } from './create-conflict.mts'
import { getModerationAppealAfterMutation, getModerationAppealByIdFromPrimary } from './get.mts'

/**
 * Inserts the appeal in the caller's transaction. A concurrent open appeal for the same target
 * wins the partial unique index; the insert then reads as that appeal and reports a duplicate.
 * The enqueue of the resolution agent follows the commit, whoever owns it.
 */
export async function insertModerationAppeal(
  query: TransactionQuery,
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  appealReason: string,
  target: AppealTargetContext,
): Promise<{ appeal: ModerationAppealResponse; isDuplicate: boolean }> {
  const result = await insertOrFindOpenAppeal(query, currentUser, provenance, appealReason, target)
  assert(result, 500, 'Failed to create appeal')
  const { inserted, ...appeal } = result
  if (inserted) registerPostCommitAction(query, async () => enqueueAppealResolutionAsync(appeal.id))
  return {
    appeal: await getModerationAppealAfterMutation(appeal.id, { query }),
    isDuplicate: !inserted,
  }
}

async function insertOrFindOpenAppeal(
  query: TransactionQuery,
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  appealReason: string,
  target: AppealTargetContext,
): Promise<(ModerationAppeal & { inserted: boolean }) | undefined> {
  const { rows } = await query<ModerationAppeal & { inserted: boolean }>(
    insertStatement(currentUser, provenance, appealReason, target),
  )
  if (rows[0]) return rows[0]
  // Nothing was inserted, so another open appeal for this target won; read it as the duplicate.
  const existing = await findOpenAppeal(query, currentUser.id, target)
  return existing ? { ...existing, inserted: false } : undefined
}

function insertStatement(
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  appealReason: string,
  target: AppealTargetContext,
) {
  const { communityId, userWarningId, communityBanId, postId, userSuspensionId } = target
  const statement = sql`/* createModerationAppeal */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    upserted AS (
      INSERT INTO moderation_appeals (
        appellant_user_id,
        user_warning_id,
        community_ban_id,
        post_id,
        user_suspension_id,
        community_id, post_removal_kind,
        appeal_reason,
        original_decided_by_id, original_decision_reason, original_decided_at,
        case_id,
        latest_lifecycle_change_id,
        created_via,
        created_via_oauth_client_id
      )
      VALUES (
        ${currentUser.id},
        ${userWarningId},
        ${communityBanId},
        ${postId},
        ${userSuspensionId},
        ${communityId}, ${target.postRemovalKind},
        ${appealReason},
        ${target.originalDecisionActorId}, ${target.originalDecisionReason}, ${target.originalDecisionAt},
        ${target.caseId},
        (SELECT id FROM lifecycle_change_id),
        ${provenance.createdVia},
        ${provenance.oauthClientId}
      )
  `
  statement.append(appealConflictClause(target))
  statement.append(sql`
      RETURNING
        (xmax = 0) AS inserted,
        id, case_id, appellant_user_id, user_warning_id, community_ban_id, post_id, user_suspension_id, community_id, post_removal_kind,
        appeal_reason,
        CASE
          WHEN resolved_at IS NULL THEN 'pending'
          WHEN resolution_action = 'deny' THEN 'dismissed'
          ELSE 'resolved'
        END AS status,
        recommended_action, ai_public_response, ai_internal_response,
        model, ai_drafted_at, public_response, internal_notes, drafted_at, edited_at, edited_by_id,
        approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
        resolution_action, latest_lifecycle_change_id, updated_at
    ),
    inserted_change AS (
      INSERT INTO moderation_appeal_lifecycle_changes (
        id,
        moderation_appeal_id,
        change_type,
        changed_by_id,
        metadata
      )
      SELECT
        lifecycle_change_id.id,
        upserted.id,
        'create',
        ${currentUser.id},
        '{}'::jsonb
      FROM upserted
      CROSS JOIN lifecycle_change_id
      WHERE upserted.inserted
    )
    SELECT
      inserted,
      id, case_id, appellant_user_id, user_warning_id, community_ban_id, post_id, user_suspension_id, community_id, post_removal_kind,
      appeal_reason, status, recommended_action, ai_public_response, ai_internal_response,
      model, ai_drafted_at, public_response, internal_notes, drafted_at, edited_at, edited_by_id,
      approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
      resolution_action, latest_lifecycle_change_id, updated_at
    FROM upserted
  `)
  return statement
}

async function findOpenAppeal(
  query: TransactionQuery,
  appellantId: string,
  { userWarningId, communityBanId, postId, userSuspensionId, postRemovalKind }: AppealTargetContext,
): Promise<ModerationAppeal | null> {
  const duplicateQuery = sql`/* createModerationAppeal:conflict */
        SELECT id FROM moderation_appeals
        WHERE appellant_user_id = ${appellantId}
          AND resolved_at IS NULL
      `
  if (userWarningId) {
    duplicateQuery.append(sql` AND user_warning_id = ${userWarningId}`)
  } else if (communityBanId) {
    duplicateQuery.append(sql` AND community_ban_id = ${communityBanId}`)
  } else if (postId) {
    duplicateQuery.append(
      sql` AND post_id = ${postId}
            AND post_removal_kind IS NOT DISTINCT FROM ${postRemovalKind}`,
    )
  } else if (userSuspensionId) {
    duplicateQuery.append(sql` AND user_suspension_id = ${userSuspensionId}`)
  }
  duplicateQuery.append(sql` LIMIT 1`)
  const { rows } = await query<{ id: string }>(duplicateQuery)
  if (!rows[0]) return null
  return (await getModerationAppealByIdFromPrimary(rows[0].id, {
    query,
  })) as ModerationAppeal | null
}
