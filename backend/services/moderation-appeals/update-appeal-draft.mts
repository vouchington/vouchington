import type { ModerationAppealResponse } from './types.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ModerationAppeal } from './config.mts'
import { getModerationAppealAfterMutation } from './get.mts'

export interface UpdateAppealDraftInput {
  publicResponse?: string
  internalNotes?: string
}

export async function updateModerationAppealDraft(
  staffUserId: string,
  appealId: string,
  input: UpdateAppealDraftInput,
): Promise<ModerationAppealResponse> {
  assert(
    input.publicResponse !== undefined || input.internalNotes !== undefined,
    422,
    'At least one of public_response or internal_notes is required',
  )
  const now = new Date()
  await using query = await beginTransaction()
  // Leave the text unchanged in this write so RETURNING reports the values the edit will replace.
  const { rows } = await query<Pick<ModerationAppeal, 'public_response' | 'internal_notes'>>(sql`
    /* updateModerationAppealDraft */
    UPDATE moderation_appeals
    SET edited_at = ${now},
        edited_by_id = ${staffUserId},
        approved_at = NULL,
        approved_by_id = NULL
    WHERE id = ${appealId} AND sent_at IS NULL AND resolved_at IS NULL
    RETURNING public_response, internal_notes
  `)
  const before = rows[0]
  assert(before, 404, 'Appeal not found or already sent')
  const after = {
    public_response: input.publicResponse ?? before.public_response,
    internal_notes: input.internalNotes ?? before.internal_notes,
  }

  const { rowCount } = await query(sql`/* updateModerationAppealDraft.applyText */
    WITH inserted_change AS (
      INSERT INTO moderation_appeal_lifecycle_changes (
        moderation_appeal_id,
        change_type,
        changed_by_id,
        metadata
      )
      VALUES (${appealId}, 'edit', ${staffUserId}, ${JSON.stringify({ before, after })}::jsonb)
      RETURNING id
    )
    UPDATE moderation_appeals
    SET public_response = ${after.public_response},
        internal_notes = ${after.internal_notes},
        latest_lifecycle_change_id = (SELECT id FROM inserted_change)
    WHERE id = ${appealId} AND sent_at IS NULL AND resolved_at IS NULL
  `)
  assert(rowCount === 1, 404, 'Appeal not found or already sent')
  await query.commit()
  return await getModerationAppealAfterMutation(appealId)
}
