import type { ModerationAppealResponse } from './types.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { createModerationAppealResolvedNotification } from '@services/notifications/create-moderation-appeal-resolved-notification'
import type { ModerationAppeal } from './config.mts'
import { getModerationAppealAfterMutation, getModerationAppealByIdFromPrimary } from './get.mts'

type SentAppeal = Pick<
  ModerationAppeal,
  | 'id'
  | 'appellant_user_id'
  | 'public_response'
  | 'drafted_at'
  | 'edited_at'
  | 'approved_at'
  | 'sent_at'
  | 'resolved_at'
  | 'resolution_action'
>

export async function sendApprovedModerationAppealResolution(
  staffUserId: string,
  appealId: string,
): Promise<ModerationAppealResponse> {
  const now = new Date()
  const { rows } = await write<SentAppeal>(sql`/* sendApprovedModerationAppealResolution */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated AS (
      UPDATE moderation_appeals
      SET sent_at = ${now},
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id)
      WHERE id = ${appealId}
        AND approved_at IS NOT NULL
        AND sent_at IS NULL
        AND public_response IS NOT NULL
        AND public_response <> ''
      RETURNING
        id, appellant_user_id, public_response, drafted_at, edited_at, approved_at, sent_at, resolved_at, resolution_action
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
        'send',
        ${staffUserId},
        '{}'::jsonb
      FROM updated
      CROSS JOIN lifecycle_change_id
    )
    SELECT * FROM updated
  `)
  const sent = rows[0]
  if (!sent) return rejectUnsendableAppeal(appealId)

  // Deliver the human-approved response to the appellant. Awaited so a delivery
  // failure surfaces to the caller instead of being silently swallowed.
  await createModerationAppealResolvedNotification(
    sent.appellant_user_id,
    appealId,
    sent.public_response ?? '',
  )

  return getModerationAppealAfterMutation(appealId)
}

/**
 * Explains a send update that matched no row. The update's predicates guard the success path, so
 * only a miss reads, and it reports the same precedence a pre-read of the appeal would.
 */
async function rejectUnsendableAppeal(appealId: string): Promise<never> {
  const appeal = await getModerationAppealByIdFromPrimary(appealId)
  assert(appeal, 404, 'Appeal not found')
  // Legally required invariant: approved_at MUST be set before sending
  assert(appeal.approved_at != null, 422, 'Appeal must be approved before sending')
  assert(appeal.sent_at == null, 422, 'Appeal resolution has already been sent')
  assert(appeal.public_response, 422, 'Appeal has no public response to send')
  // A concurrent send won between the update and this read.
  assert(false, 422, 'Appeal resolution has already been sent')
}
