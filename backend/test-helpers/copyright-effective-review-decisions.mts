import { syncCopyrightRepeatInfringerIncidents } from '../services/copyright-notices/repeat-infringer-incidents.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { createCopyrightReviewOutcomeNoticesInTransaction } from '../services/copyright-notices/review-outcome-notices.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from '../services/copyright-notices/staydown-registration.mts'
import {
  advanceCopyrightLastLegalActivityAt,
  lockCopyrightNoticeForLegalWrite,
} from '../services/copyright-notices/last-legal-activity.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from '../services/copyright-notices/restoration-reversal.mts'
import { recordCopyrightAppealReviewEffects } from '../services/copyright-notices/submission-review-appeal-effects.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Committed appeal scope and requester receipt, using the same current submission contract. */
export async function seedEffectiveReviewAppeal(
  noticeId: string,
  actorId: string,
  targetId: string,
) {
  const id = uuidv7()
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedEffectiveReviewAppeal */
    INSERT INTO copyright_notice_submissions (id, copyright_notice_id, kind, received_at, source_kind,
      submitted_by_id, body_ciphertext) VALUES (${id}, ${noticeId}, 'appeal', CURRENT_TIMESTAMP,
      'signed_in_form', ${actorId}, ${encryptSecret(JSON.stringify({ reason: 'Please review the restriction.', targetIds: [targetId] }), copyrightSubmissionPurpose(id))})`)
  await transaction(sql`/* seedEffectiveReviewAppeal:target */
    INSERT INTO copyright_notice_submission_targets (copyright_notice_submission_id, copyright_notice_target_id)
    VALUES (${id}, ${targetId})`)
  await transaction(sql`/* seedEffectiveReviewAppeal:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_id) VALUES (${noticeId}, 'appeal_received', ${actorId}, ${id})`)
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: id,
      correspondenceId: null,
      recipientUserId: actorId,
      recipientRole: 'poster',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `copyright-submission:${id}:poster-receipt`,
    },
    transaction,
  )
  await transaction.commit()
  return { submission: { id } }
}

/** Post-decision tests need the complete confirmation committed before their real subject begins. */
export async function seedEffectiveConfirmation(
  noticeId: string,
  restrictionId: string,
  moderator: PrivateUser,
  action: 'confirm' | 'reverse' = 'confirm',
) {
  await using transaction = await beginTransaction()
  const reviewedAt = new Date()
  await transaction(sql`/* seedEffectiveConfirmation */
    UPDATE copyright_restrictions SET human_reviewed_at = ${reviewedAt}, human_review_action = ${action},
      human_reviewed_by_id = ${moderator.id} WHERE id = ${restrictionId}`)
  await createCopyrightReviewOutcomeNoticesInTransaction(
    { noticeId, restrictionId, action },
    transaction,
  )
  if (action === 'reverse')
    await createCopyrightRestoreIntentForReversalInTransaction(restrictionId, transaction)
  await applyCopyrightConfirmationConsequencesInTransaction(noticeId, transaction)
  await transaction(sql`/* seedEffectiveConfirmation:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_restriction_id, review_action, review_rationale_ciphertext)
    VALUES (${noticeId}, 'mandatory_human_review_completed', ${moderator.id}, ${restrictionId}, ${action},
      ${encryptSecret('The reviewed restriction is appropriate.', `copyright-restriction-review:${restrictionId}`)})`)
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId })
  await transaction.commit()
}

export async function seedEffectiveAppealDecision(
  input: Parameters<typeof recordCopyrightAppealReviewEffects>[0],
  noticeId: string,
) {
  await using transaction = await beginTransaction()
  const locked = await lockCopyrightNoticeForLegalWrite(transaction, noticeId)
  if (!locked) throw new Error('Owned notice disappeared')
  const { rows: appeals } = await transaction<{
    submitted_by_id: string | null
  }>(sql`/* seedEffectiveAppealDecision:appeal */
    SELECT submitted_by_id FROM copyright_notice_submissions WHERE id = ${input.submissionId}`)
  const { rows: restrictions } = await transaction<{
    id: string
    human_reviewed_at: Date | null
  }>(sql`/* seedEffectiveAppealDecision:restrictions */
    SELECT id, human_reviewed_at FROM copyright_restrictions WHERE id = ANY(${input.decisions.map(row => row.restrictionId)}::uuid[])`)
  await recordCopyrightAppealReviewEffects(
    input,
    { copyright_notice_id: noticeId, submitted_by_id: appeals[0]!.submitted_by_id },
    restrictions,
    locked,
    transaction,
  )
  await transaction.commit()
}

export async function seedEffectiveDisposition(
  incidentId: string,
  noticeId: string,
  moderator: PrivateUser,
) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedEffectiveDisposition:current */
    UPDATE copyright_repeat_infringer_incidents SET is_operative = false, current_disposition = 'duplicate',
      current_disposition_recorded_at = CURRENT_TIMESTAMP, current_disposition_recorded_by_id = ${moderator.id}
    WHERE id = ${incidentId}`)
  await transaction(sql`/* seedEffectiveDisposition:record */
    INSERT INTO copyright_repeat_infringer_dispositions (copyright_repeat_infringer_incident_id,
      disposition, rationale_ciphertext, recorded_at, recorded_by_id)
    VALUES (${incidentId}, 'duplicate', ${encryptSecret('The case duplicates an earlier notice.', `copyright-repeat-infringer-disposition:${incidentId}`)}, CURRENT_TIMESTAMP, ${moderator.id})`)
  await syncCopyrightRepeatInfringerIncidents(noticeId, transaction)
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId })
  await transaction.commit()
}
