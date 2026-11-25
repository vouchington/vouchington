import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  aiDraftLifecycleMetadata,
  settleRunGatedAiDraft,
} from '@services/moderator-actions/ai-draft-save'
import type { ModerationAppeal, ModerationAppealAction } from './config.mts'

export interface AiDraftInput {
  appealId: string
  /** The admitted resolution run; only the appeal's current requested run may save a draft. */
  runId: string
  recommendedAction: ModerationAppealAction
  aiPublicResponse: string
  aiInternalResponse: string
  model: string
}

/**
 * Saves the draft and completes the run in one statement. Only the run row is locked, because it
 * is written; a delayed failure marker either lands first or finds the run complete. Returns null
 * when the run no longer applies, and 404s when the appeal is gone.
 */
export async function createModerationAppealDraft(
  input: AiDraftInput,
): Promise<ModerationAppeal | null> {
  const now = new Date()
  const { rows } = await write<ModerationAppeal>(sql`/* createModerationAppealDraft */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated AS (
      UPDATE moderation_appeals
      SET recommended_action = ${input.recommendedAction},
          ai_public_response = ${input.aiPublicResponse},
          ai_internal_response = ${input.aiInternalResponse},
          model = ${input.model},
          ai_drafted_at = ${now},
          ai_draft_run_id = ${input.runId}::uuid,
          public_response = ${input.aiPublicResponse},
          drafted_at = COALESCE(drafted_at, ${now}),
          approved_at = NULL,
          approved_by_id = NULL,
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id)
      WHERE id = ${input.appealId}
        AND ai_draft_requested_run_id = ${input.runId}::uuid
        AND approved_at IS NULL
        AND sent_at IS NULL
        AND resolved_at IS NULL
        AND EXISTS (
          SELECT 1 FROM moderation_appeal_resolution_runs run
          WHERE run.id = ${input.runId}::uuid AND run.moderation_appeal_id = moderation_appeals.id
          -- lock-reason: prevents: a failure or expiry marker landing between run admission and draft completion; writer: markAppealResolutionRunsFailed and markAppealResolutionRunsExpired
          FOR UPDATE
        )
      RETURNING
        id, appellant_user_id, user_warning_id, community_ban_id, post_id, community_id, post_removal_kind,
        appeal_reason,
        CASE
          WHEN resolved_at IS NULL THEN 'pending'
          WHEN resolution_action = 'deny' THEN 'dismissed'
          ELSE 'resolved'
        END AS status,
        recommended_action, ai_public_response, ai_internal_response,
        model, ai_drafted_at, ai_draft_run_id,
        ai_draft_requested_run_id,
        public_response, internal_notes, drafted_at, edited_at, edited_by_id,
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
        updated.id,
        'ai_draft',
        NULL,
        ${aiDraftLifecycleMetadata(input)}::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    ),
    completed_run AS (
      UPDATE moderation_appeal_resolution_runs run
      SET completed_at = ${now},
          ai_drafted_at = updated.ai_drafted_at,
          latest_lifecycle_change_id = updated.latest_lifecycle_change_id
      FROM updated
      WHERE run.id = ${input.runId}::uuid
        AND run.moderation_appeal_id = updated.id
      RETURNING run.id
    )
    SELECT * FROM updated
  `)
  return settleRunGatedAiDraft(rows[0], () => findAppealId(input.appealId), 'Appeal not found')
}

async function findAppealId(appealId: string): Promise<string | undefined> {
  const { rows } = await write<{ id: string }>(sql`
    /* createModerationAppealDraft:checkAppeal */
    SELECT id FROM moderation_appeals WHERE id = ${appealId}
  `)
  return rows[0]?.id
}
