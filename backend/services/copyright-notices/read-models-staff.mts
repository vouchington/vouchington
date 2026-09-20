import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { copyrightFormSecretPurpose } from './form-intakes.mts'
import {
  selectStaffAppeals,
  selectStaffCounterNotices,
  selectStaffLegalHolds,
  selectStaffRestrictions,
} from './read-models-staff-submissions.mts'
import {
  selectStaffActionIntents,
  selectStaffDeliveryIntents,
  selectStaffEmailCorrespondence,
} from './read-models-staff-intents.mts'
import {
  selectStaffEvidence,
  selectStaffFormReview,
  selectStaffTargets,
} from './read-models-staff-notice.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

export type { CopyrightStaffCase } from './read-models-staff-types.mts'

export async function listCopyrightStaffQueue(
  currentUser: PrivateUser,
): Promise<CopyrightStaffCase[]> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser)) return []
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`/* listPendingCopyrightStaffCases */
    SELECT notice.id
    FROM copyright_notices notice
    WHERE EXISTS (
      SELECT 1 FROM copyright_notice_form_intakes intake
      JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
      LEFT JOIN copyright_notice_form_intake_reviews review ON review.copyright_notice_form_intake_id = intake.id
      WHERE intake.copyright_notice_id = notice.id AND review.id IS NULL
        AND (submission.source_kind = 'guest_form' OR NOT EXISTS (
          SELECT 1 FROM copyright_notice_form_screenings screening
          WHERE screening.copyright_notice_form_intake_id = intake.id
            AND screening.recommendation = 'not_obviously_invalid'
        ))
    ) OR EXISTS (
      SELECT 1 FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = notice.id
        AND restriction.lifted_at IS NULL AND restriction.human_reviewed_at IS NULL
    ) OR EXISTS (
      SELECT 1 FROM copyright_notice_submissions submission
      WHERE submission.copyright_notice_id = notice.id AND submission.kind = 'appeal'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_appeal_reviews review
          WHERE review.copyright_notice_submission_id = submission.id
        )
    ) OR EXISTS (
      SELECT 1 FROM copyright_notice_submissions submission
      WHERE submission.copyright_notice_id = notice.id AND submission.kind = 'counter_notice'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_counter_notice_reviews review
          WHERE review.copyright_notice_submission_id = submission.id
        )
    ) OR EXISTS (
      SELECT 1 FROM copyright_notice_submissions submission
      LEFT JOIN copyright_notice_legal_hold_assessments assessment
        ON assessment.copyright_notice_submission_id = submission.id
      LEFT JOIN copyright_notice_legal_hold_resolutions resolution
        ON resolution.copyright_notice_legal_hold_assessment_id = assessment.id
      WHERE submission.copyright_notice_id = notice.id
        AND submission.kind = 'court_or_ccb_hold'
        AND (assessment.id IS NULL OR (
          resolution.id IS NULL
          AND assessment.from_original_claimant
          AND assessment.proceeding_kind IS NOT NULL
          AND assessment.commenced_at IS NOT NULL
          AND assessment.received_by_designated_agent_at IS NOT NULL
          AND assessment.same_material
        ))
    ) OR EXISTS (
      SELECT 1 FROM copyright_notice_action_intents intent
      JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = notice.id AND intent.state = 'failed'
    ) OR EXISTS (
      SELECT 1 FROM copyright_notice_enforcement_requests request
      WHERE request.copyright_notice_id = notice.id AND request.state <> 'completed'
    ) OR EXISTS (
      SELECT 1 FROM copyright_notice_delivery_intents intent
      WHERE intent.copyright_notice_id = notice.id AND intent.state IN ('failed', 'bounced')
    )
    ORDER BY notice.received_at, notice.id
    LIMIT 100
  `)
  const cases = await Promise.all(
    rows.map(row => getPendingCopyrightStaffCase(row.id, transaction)),
  )
  await transaction.commit()
  return cases.filter((item): item is CopyrightStaffCase => item !== null)
}

async function getPendingCopyrightStaffCase(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightStaffCase | null> {
  const { rows } = await query<{
    id: string
    received_at: Date
    jurisdiction: 'us_dmca'
    claimant_display_name: string | null
    claimant_contact_ciphertext: string
    work_description: string
    form_key: string | null
    ses_message_id: string | null
  }>(sql`/* getPendingCopyrightStaffCase:notice */
    SELECT notice.id, notice.received_at, notice.jurisdiction, notice.claimant_display_name,
      notice.claimant_contact_ciphertext, notice.work_description, form.idempotency_key AS form_key,
      email.ses_message_id
    FROM copyright_notices notice
    LEFT JOIN copyright_notice_form_intakes form ON form.copyright_notice_id = notice.id
    LEFT JOIN copyright_notice_email_intake_reviews email_review ON email_review.promoted_copyright_notice_id = notice.id
    LEFT JOIN copyright_notice_email_intakes email ON email.id = email_review.copyright_notice_email_intake_id
    WHERE notice.id = ${noticeId}
  `)
  const notice = rows[0]
  if (!notice) return null
  const contactPurpose = notice.form_key
    ? copyrightFormSecretPurpose(notice.form_key)
    : notice.ses_message_id
      ? copyrightEmailIntakePurpose(notice.ses_message_id)
      : null
  if (!contactPurpose) return null
  const [
    targets,
    evidence,
    formReview,
    restrictions,
    appeals,
    counterNotices,
    legalHolds,
    actionIntents,
    deliveryIntents,
    emailCorrespondence,
  ] = await Promise.all([
    selectStaffTargets(noticeId, query),
    selectStaffEvidence(noticeId, query),
    selectStaffFormReview(noticeId, query),
    selectStaffRestrictions(noticeId, query),
    selectStaffAppeals(noticeId, query),
    selectStaffCounterNotices(noticeId, query),
    selectStaffLegalHolds(noticeId, query),
    selectStaffActionIntents(noticeId, query),
    selectStaffDeliveryIntents(noticeId, query),
    selectStaffEmailCorrespondence(noticeId, query),
  ])
  return {
    id: notice.id,
    received_at: notice.received_at,
    jurisdiction: notice.jurisdiction,
    claimant: {
      display_name: notice.claimant_display_name,
      contact: decryptSecret(notice.claimant_contact_ciphertext, contactPurpose),
    },
    work_description: notice.work_description,
    targets,
    evidence,
    form_review: formReview,
    restrictions,
    appeals,
    counter_notices: counterNotices,
    legal_holds: legalHolds,
    action_intents: actionIntents,
    delivery_intents: deliveryIntents,
    email_correspondence: emailCorrespondence,
  }
}
