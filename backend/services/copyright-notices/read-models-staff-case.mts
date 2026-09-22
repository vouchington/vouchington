import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
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

export async function getPendingCopyrightStaffCase(
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
