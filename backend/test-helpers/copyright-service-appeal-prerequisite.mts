import { createHash } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import {
  copyrightSubmissionPurpose,
  type createCopyrightAppeal,
} from '../services/copyright-notices/submissions.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { advanceCopyrightLastLegalActivityAt } from '../services/copyright-notices/last-legal-activity.mts'
import type { CopyrightNoticeSubmissionRecord } from '../services/copyright-notices/types.mts'

/** An owned committed appeal body, scope, request receipt and event before its review subject. */
export async function seedServiceReviewAppeal(
  ...[actor, noticeId, key, input]: Parameters<typeof createCopyrightAppeal>
) {
  const id = uuidv7()
  await using transaction = await beginTransaction()
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* seedServiceReviewAppeal */
    INSERT INTO copyright_notice_submissions (id, copyright_notice_id, kind, received_at, source_kind,
      submitted_by_id, body_ciphertext) VALUES (${id}, ${noticeId}, 'appeal', CURRENT_TIMESTAMP,
      'signed_in_form', ${actor.id}, ${encryptSecret(JSON.stringify(input), copyrightSubmissionPurpose(id))})
    RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext`)
  await transaction(sql`/* seedServiceReviewAppeal:scope */
    INSERT INTO copyright_notice_submission_targets (copyright_notice_submission_id, copyright_notice_target_id)
    SELECT ${id}, unnest(${input.targetIds}::uuid[])`)
  await transaction(sql`/* seedServiceReviewAppeal:request */
    INSERT INTO copyright_notice_submission_requests (copyright_notice_submission_id, requester_user_id,
      idempotency_key_sha256, request_sha256) VALUES (${id}, ${actor.id},
      ${createHash('sha256').update(key.toLowerCase()).digest()},
      ${createHash('sha256')
        .update(JSON.stringify({ kind: 'appeal', input }))
        .digest()})`)
  await transaction(sql`/* seedServiceReviewAppeal:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_id) VALUES (${noticeId}, 'appeal_received', ${actor.id}, ${id})`)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: id,
      correspondenceId: null,
      recipientUserId: actor.id,
      recipientRole: 'poster',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `copyright-submission:${id}:poster-receipt`,
    },
    transaction,
  )
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId })
  await transaction.commit()
  const submission = rows[0]
  if (!submission) throw new Error('Owned review appeal disappeared')
  return { submission, isDuplicate: false }
}
