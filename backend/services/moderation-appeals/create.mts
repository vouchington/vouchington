import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { ModerationAppeal } from './config.mts'
import type { ModerationAppealResponse } from './types.mts'
import type { CreateModerationAppealInput } from './parse.mts'
import { enqueueAppealResolutionAsync } from './enqueue-appeal-resolution.mts'
import { resolveAppealTarget } from './create-target.mts'
import { getModerationAppealAfterMutation, getModerationAppealByIdFromPrimary } from './get.mts'

export async function createModerationAppeal(
  currentUser: PrivateUser,
  input: CreateModerationAppealInput,
): Promise<{ appeal: ModerationAppealResponse; isDuplicate: boolean }> {
  const { appealReason } = input
  const target = await resolveAppealTarget(currentUser, input)

  if (target.duplicate) {
    return {
      appeal: await getModerationAppealAfterMutation(target.duplicate.id),
      isDuplicate: true,
    }
  }

  const {
    communityId,
    userWarningId,
    communityBanId,
    postId,
    userSuspensionId,
    postRemovalKind,
    caseId,
    originalDecisionReason,
    originalDecisionActorId,
    originalDecisionAt,
  } = target

  const writeResult = await write<
    ModerationAppeal & { inserted: boolean }
  >(sql`/* createModerationAppeal */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    upserted AS (
      INSERT INTO moderation_appeals (
        appellant_id,
        user_warning_id,
        community_ban_id,
        post_id,
        user_suspension_id,
        community_id, post_removal_kind,
        appeal_reason,
        case_id,
        latest_lifecycle_change_id
      )
      VALUES (
        ${currentUser.id},
        ${userWarningId},
        ${communityBanId},
        ${postId},
        ${userSuspensionId},
        ${communityId}, ${postRemovalKind},
        ${appealReason},
        ${caseId},
        (SELECT id FROM lifecycle_change_id)
      )
      ON CONFLICT (appellant_id, user_warning_id)
      WHERE resolved_at IS NULL AND user_warning_id IS NOT NULL
      DO UPDATE SET
        appeal_reason = EXCLUDED.appeal_reason,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        (xmax = 0) AS inserted,
        id, case_id, appellant_id, user_warning_id, community_ban_id, post_id, user_suspension_id, community_id, post_removal_kind,
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
        drafted_at,
        edited_at,
        approved_at,
        sent_at,
        resolved_at,
        resolution_action,
        metadata
      )
      SELECT
        lifecycle_change_id.id,
        upserted.id,
        'create',
        ${currentUser.id},
        upserted.drafted_at,
        upserted.edited_at,
        upserted.approved_at,
        upserted.sent_at,
        upserted.resolved_at,
        upserted.resolution_action,
        jsonb_build_object(
          'original_decision',
          jsonb_build_object(
            'reason', ${originalDecisionReason}::text,
            'actor_id', ${originalDecisionActorId}::uuid,
            'decided_at', ${originalDecisionAt}::timestamptz
          )
        )
      FROM upserted
      CROSS JOIN lifecycle_change_id
      WHERE upserted.inserted
    )
    SELECT
      inserted,
      id, case_id, appellant_id, user_warning_id, community_ban_id, post_id, user_suspension_id, community_id, post_removal_kind,
      appeal_reason, status, recommended_action, ai_public_response, ai_internal_response,
      model, ai_drafted_at, public_response, internal_notes, drafted_at, edited_at, edited_by_id,
      approved_at, approved_by_id, sent_at, resolved_at, resolved_by_id,
      resolution_action, latest_lifecycle_change_id, updated_at
    FROM upserted
  `).catch(async (error: unknown) => {
    /* v8 ignore start -- concurrent appeal race; the integration regression is timing-dependent */
    const pgErr = error as { code?: string; constraint?: string }
    const duplicateConstraints = new Set([
      'idx_moderation_appeals__one_open_ban',
      'idx_moderation_appeals__one_open_post',
      'idx_moderation_appeals__one_open_suspension',
      'idx_moderation_appeals__one_open_warning',
    ])
    if (pgErr.code === '23505' && pgErr.constraint && duplicateConstraints.has(pgErr.constraint)) {
      const duplicateQuery = sql`/* createModerationAppeal:conflict */
        SELECT id FROM moderation_appeals
        WHERE appellant_id = ${currentUser.id}
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
      const { rows: dup } = await write<{ id: string }>(duplicateQuery)
      if (dup[0]) {
        const existing = await getModerationAppealByIdFromPrimary(dup[0].id)
        if (existing) return { rows: [{ ...existing, inserted: false }] }
      }
    }
    throw error
    /* v8 ignore stop */
  })

  const result = writeResult.rows[0] as (ModerationAppeal & { inserted: boolean }) | undefined
  assert(result, 500, 'Failed to create appeal')
  const { inserted, ...appeal } = result

  if (inserted) {
    enqueueAppealResolutionAsync(appeal.id)
  }

  if (!inserted) {
    return {
      appeal: await getModerationAppealAfterMutation(appeal.id),
      isDuplicate: true,
    }
  }

  return {
    appeal: await getModerationAppealAfterMutation(appeal.id),
    isDuplicate: false,
  }
}
