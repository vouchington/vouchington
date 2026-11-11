import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CopyrightEmailCorrespondenceKind } from './email-correspondence-guards.mts'

type CopyrightEmailCorrespondenceReviewInput = {
  intakeId: string
  kind: CopyrightEmailCorrespondenceKind
  recommendationId: string | null
  currentUser: { id: string }
}

/** Keep the finite review and the link's durable final result in one transaction step. */
export async function recordAdmittedCopyrightCorrespondenceReview(
  transaction: TransactionQuery,
  result: {
    input: CopyrightEmailCorrespondenceReviewInput
    noticeId: string
    submissionId: string
    correspondenceId: string
    rationaleCiphertext: string
    manualFallbackCiphertext: string | null
  },
): Promise<void> {
  const {
    input,
    noticeId,
    submissionId,
    correspondenceId,
    rationaleCiphertext,
    manualFallbackCiphertext,
  } = result
  await transaction(sql`/* admitCopyrightEmailCorrespondence:review */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action, kind,
      copyright_notice_email_intake_recommendation_id,
      copyright_notice_submission_id, copyright_notice_correspondence_message_id,
      reviewed_at, reviewed_by_id, rationale_ciphertext, manual_fallback_reason_ciphertext
    ) VALUES (
      ${input.intakeId}, ${noticeId}, 'admitted', ${input.kind}::copyright_notice_email_correspondence_review_kinds, ${input.recommendationId}, ${submissionId},
      ${correspondenceId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      ${rationaleCiphertext},
      ${manualFallbackCiphertext}
    )
  `)
  const { rowCount } = await transaction(sql`/* admitCopyrightEmailCorrespondence:currentDecision */
    UPDATE copyright_notice_email_intake_notice_links SET
      correspondence_action = 'admitted', correspondence_kind = ${input.kind},
      correspondence_submission_id = ${submissionId},
      correspondence_message_id = ${correspondenceId},
      correspondence_reviewed_at = CURRENT_TIMESTAMP,
      correspondence_reviewed_by_id = ${input.currentUser.id},
      correspondence_rationale_ciphertext = ${rationaleCiphertext},
      correspondence_manual_fallback_reason_ciphertext = ${manualFallbackCiphertext}
    WHERE copyright_notice_email_intake_id = ${input.intakeId}
      AND correspondence_action = 'pending'`)
  assert(rowCount === 1, 409, 'Copyright email correspondence was already reviewed')
}

/** A rejected link also owns its final review result after finite review history expires. */
export async function recordRejectedCopyrightCorrespondenceReview(
  transaction: TransactionQuery,
  result: {
    input: CopyrightEmailCorrespondenceReviewInput
    noticeId: string
    rationaleCiphertext: string
    manualFallbackCiphertext: string | null
  },
): Promise<void> {
  const { input, noticeId, rationaleCiphertext, manualFallbackCiphertext } = result
  await transaction(sql`/* rejectCopyrightEmailCorrespondence */
    INSERT INTO copyright_notice_email_correspondence_reviews (
      copyright_notice_email_intake_id, copyright_notice_id, action, kind,
      copyright_notice_email_intake_recommendation_id, reviewed_at, reviewed_by_id,
      rationale_ciphertext, manual_fallback_reason_ciphertext
    ) VALUES (${input.intakeId}, ${noticeId}, 'rejected', ${input.kind}::copyright_notice_email_correspondence_review_kinds,
      ${input.recommendationId}, CURRENT_TIMESTAMP, ${input.currentUser.id},
      ${rationaleCiphertext},
      ${manualFallbackCiphertext})
  `)
  const { rowCount } =
    await transaction(sql`/* rejectCopyrightEmailCorrespondence:currentDecision */
    UPDATE copyright_notice_email_intake_notice_links SET
      correspondence_action = 'rejected', correspondence_kind = ${input.kind},
      correspondence_reviewed_at = CURRENT_TIMESTAMP,
      correspondence_reviewed_by_id = ${input.currentUser.id},
      correspondence_rationale_ciphertext = ${rationaleCiphertext},
      correspondence_manual_fallback_reason_ciphertext = ${manualFallbackCiphertext}
    WHERE copyright_notice_email_intake_id = ${input.intakeId}
      AND correspondence_action = 'pending'`)
  assert(rowCount === 1, 409, 'Copyright email correspondence was already reviewed')
}
