import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ModerationAppeal } from './config.mts'
import { getModerationAppealAfterMutation } from './get.mts'

export interface UpdateAppealDraftInput {
  publicResponse?: string
  internalNotes?: string
}

type UpdatedAppealDraft = Pick<
  ModerationAppeal,
  | 'id'
  | 'drafted_at'
  | 'edited_at'
  | 'approved_at'
  | 'sent_at'
  | 'resolved_at'
  | 'resolution_action'
>

export async function updateModerationAppealDraft(
  staffUserId: string,
  appealId: string,
  input: UpdateAppealDraftInput,
): Promise<ModerationAppeal> {
  assert(
    input.publicResponse !== undefined || input.internalNotes !== undefined,
    422,
    'At least one of public_response or internal_notes is required',
  )
  const now = new Date()
  const { rows } = await write<UpdatedAppealDraft>(sql`/* updateModerationAppealDraft */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated AS (
      UPDATE moderation_appeals
      SET public_response = COALESCE(${input.publicResponse ?? null}, public_response),
          internal_notes = COALESCE(${input.internalNotes ?? null}, internal_notes),
          edited_at = ${now},
          edited_by_id = ${staffUserId},
          approved_at = NULL,
          approved_by_id = NULL,
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${appealId}
        AND sent_at IS NULL
        AND resolved_at IS NULL
      RETURNING
        id, drafted_at, edited_at, approved_at, sent_at, resolved_at, resolution_action
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
        updated.id,
        'edit',
        ${staffUserId},
        updated.drafted_at,
        updated.edited_at,
        updated.approved_at,
        updated.sent_at,
        updated.resolved_at,
        updated.resolution_action,
        '{}'::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    )
    SELECT * FROM updated
  `)
  assert(rows[0], 404, 'Appeal not found or already sent')
  return getModerationAppealAfterMutation(appealId)
}
