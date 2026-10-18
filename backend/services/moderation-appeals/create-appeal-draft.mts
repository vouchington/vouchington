import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ModerationAppeal, ModerationAppealAction } from './config.mts'

export interface AiDraftInput {
  appealId: string
  requestToken: string
  runId: string
  recommendedAction: ModerationAppealAction
  aiPublicResponse: string
  aiInternalResponse: string
  model: string
}

export async function createModerationAppealDraft(
  input: AiDraftInput,
): Promise<ModerationAppeal | null> {
  const now = new Date()
  const { rows } = await write(sql`/* createModerationAppealDraft */
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
          ai_draft_run_id = ${input.runId},
          public_response = ${input.aiPublicResponse},
          drafted_at = COALESCE(drafted_at, ${now}),
          approved_at = NULL,
          approved_by_id = NULL,
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id)
      WHERE id = ${input.appealId}
        AND ai_draft_request_token = ${input.requestToken}
        AND approved_at IS NULL
        AND sent_at IS NULL
        AND resolved_at IS NULL
        AND resolved_at IS NULL
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
        ('appeal_resolution_' || ai_draft_request_token::text) AS ai_draft_requested_run_id,
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
        ${JSON.stringify({ model: input.model, recommended_action: input.recommendedAction, run_id: input.runId })}::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    )
    SELECT * FROM updated
  `)
  const result = rows[0] as ModerationAppeal | undefined
  if (!result) {
    const { rows: currentRows } = await write<{
      ai_draft_request_token: string
      approved_at: Date | null
      sent_at: Date | null
      resolved_at: Date | null
    }>(sql`
      /* createModerationAppealDraft:checkRequest */
      SELECT ai_draft_request_token, approved_at, sent_at, resolved_at
      FROM moderation_appeals WHERE id = ${input.appealId}
    `)
    const current = currentRows[0]
    if (
      current &&
      (current.ai_draft_request_token !== input.requestToken ||
        current.approved_at !== null ||
        current.sent_at !== null ||
        current.resolved_at !== null)
    )
      return null
  }
  assert(result, 404, 'Appeal not found, already approved, sent, or resolved')
  return result
}

/** The row lock waits for an enqueueing transaction to commit or roll back before model IO. */
export async function isCurrentModerationAppealDraftRequest(
  appealId: string,
  requestToken: string,
): Promise<boolean> {
  const { rows } = await write<{
    ai_draft_request_token: string
    approved_at: Date | null
    sent_at: Date | null
    resolved_at: Date | null
  }>(sql`
    /* isCurrentModerationAppealDraftRequest */
    SELECT ai_draft_request_token, approved_at, sent_at, resolved_at
    FROM moderation_appeals
    WHERE id = ${appealId}
    FOR UPDATE
  `)
  const appeal = rows[0]
  return (
    appeal?.ai_draft_request_token === requestToken &&
    appeal.approved_at === null &&
    appeal.sent_at === null &&
    appeal.resolved_at === null
  )
}
