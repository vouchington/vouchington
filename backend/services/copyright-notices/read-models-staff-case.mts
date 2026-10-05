import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readClaimantMisuseSummary } from './claimant-misuse-summary.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import { copyrightFormSecretPurpose } from './form-intakes.mts'
import { selectStaffTerritorialCase } from './read-models-staff-territorial.mts'
import { territorialLabels } from './territorial-labels.mts'
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
import { selectStaffStaydownMatches } from './read-models-staff-staydown.mts'
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
    jurisdiction: 'us_dmca' | 'eu_dsa' | 'uk'
    claimant_user_id: string | null
    claimant_display_name: string | null
    claimant_contact_ciphertext: string
    work_description: string
    form_key: string | null
    amazon_ses_message_id: string | null
    territorial_key: string | null
  }>(sql`/* getPendingCopyrightStaffCase:notice */
    SELECT notice.id, notice.received_at, notice.jurisdiction, notice.claimant_user_id,
      notice.claimant_display_name, notice.claimant_contact_ciphertext, notice.work_description,
      form.idempotency_key AS form_key, email.amazon_ses_message_id,
      receipt.idempotency_key AS territorial_key
    FROM copyright_notices notice
    LEFT JOIN copyright_notice_form_intakes form ON form.copyright_notice_id = notice.id
    LEFT JOIN copyright_notice_email_intake_reviews email_review ON email_review.promoted_copyright_notice_id = notice.id
    LEFT JOIN copyright_notice_email_intakes email ON email.id = email_review.copyright_notice_email_intake_id
    LEFT JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = notice.id AND receipt.jurisdiction = notice.jurisdiction
    WHERE notice.id = ${noticeId}
  `)
  const notice = rows[0]
  if (!notice) return null
  const contactPurpose =
    notice.jurisdiction === 'us_dmca'
      ? notice.form_key
        ? copyrightFormSecretPurpose(notice.form_key)
        : notice.amazon_ses_message_id
          ? copyrightEmailIntakePurpose(notice.amazon_ses_message_id)
          : null
      : notice.territorial_key
        ? `${territorialLabels(notice.jurisdiction).noticePurpose}:${notice.territorial_key}:contact`
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
    staydownMatches,
    misuse,
    territorial,
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
    selectStaffStaydownMatches(noticeId, query),
    notice.claimant_user_id ? readClaimantMisuseSummary(notice.claimant_user_id, query) : null,
    notice.jurisdiction === 'us_dmca'
      ? null
      : selectStaffTerritorialCase(noticeId, notice.jurisdiction, query),
  ])
  return {
    id: notice.id,
    received_at: notice.received_at,
    jurisdiction: notice.jurisdiction,
    claimant: {
      display_name: notice.claimant_display_name,
      contact: decryptCopyrightText(notice.claimant_contact_ciphertext, contactPurpose),
      misuse,
    },
    work_description: notice.work_description,
    ...(territorial ? { territorial } : {}),
    targets,
    evidence,
    form_review: formReview,
    restrictions,
    appeals,
    counter_notices: counterNotices,
    legal_holds: legalHolds,
    action_intents: actionIntents,
    delivery_intents: deliveryIntents,
    staydown_matches: staydownMatches,
    email_correspondence: emailCorrespondence,
  }
}
