import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { readClaimantMisuseSummaries } from './claimant-misuse-summary.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import { copyrightFormSecretPurpose } from './form-intakes.mts'
import { selectStaffTerritorialCases } from './read-models-staff-territorial.mts'
import { territorialLabels } from './territorial-labels.mts'
import { selectStaffLegalHolds } from './read-models-staff-legal-holds.mts'
import {
  selectStaffAppeals,
  selectStaffCounterNotices,
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

type NoticeRow = {
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
}

/**
 * Loads the staff case of every listed notice with one statement per section, however many
 * notices are listed. A notice that is missing, or whose claimant contact has no purpose to
 * decrypt under, has no entry.
 */
export async function getPendingCopyrightStaffCases(
  noticeIds: readonly string[],
  query: TransactionQuery,
): Promise<Map<string, CopyrightStaffCase>> {
  if (noticeIds.length === 0) return new Map()
  const { rows } = await query<NoticeRow>(sql`/* getPendingCopyrightStaffCase:notice */
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
    WHERE notice.id = ANY(${noticeIds}::uuid[])
  `)
  // Only notices with a readable claimant contact load their sections, so a dropped notice never
  // decrypts its submissions.
  const listed = rows.flatMap(notice => {
    const contactPurpose = claimantContactPurpose(notice)
    return contactPurpose ? [{ notice, contactPurpose }] : []
  })
  if (listed.length === 0) return new Map()
  const ids = listed.map(({ notice }) => notice.id)
  const claimantIds = [...new Set(listed.flatMap(({ notice }) => notice.claimant_user_id ?? []))]
  const territorialIds = listed.flatMap(({ notice }) =>
    notice.jurisdiction === 'us_dmca' ? [] : [notice.id],
  )
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
    selectStaffTargets(ids, query),
    selectStaffEvidence(ids, query),
    selectStaffFormReview(ids, query),
    selectStaffRestrictions(ids, query),
    selectStaffAppeals(ids, query),
    selectStaffCounterNotices(ids, query),
    selectStaffLegalHolds(ids, query),
    selectStaffActionIntents(ids, query),
    selectStaffDeliveryIntents(ids, query),
    selectStaffEmailCorrespondence(ids, query),
    selectStaffStaydownMatches(ids, query),
    readClaimantMisuseSummaries(claimantIds, query),
    selectStaffTerritorialCases(territorialIds, query),
  ])
  return new Map(
    listed.map(({ notice, contactPurpose }): [string, CopyrightStaffCase] => {
      const territorialCase = territorial.get(notice.id)
      return [
        notice.id,
        {
          id: notice.id,
          received_at: notice.received_at,
          jurisdiction: notice.jurisdiction,
          claimant: {
            display_name: notice.claimant_display_name,
            contact: decryptCopyrightText(notice.claimant_contact_ciphertext, contactPurpose),
            misuse: notice.claimant_user_id ? misuse.get(notice.claimant_user_id)! : null,
          },
          work_description: notice.work_description,
          ...(territorialCase ? { territorial: territorialCase } : {}),
          targets: targets.get(notice.id) ?? [],
          evidence: evidence.get(notice.id) ?? [],
          form_review: formReview.get(notice.id) ?? null,
          restrictions: restrictions.get(notice.id) ?? [],
          appeals: appeals.get(notice.id) ?? [],
          counter_notices: counterNotices.get(notice.id) ?? [],
          legal_holds: legalHolds.get(notice.id) ?? [],
          action_intents: actionIntents.get(notice.id) ?? [],
          delivery_intents: deliveryIntents.get(notice.id) ?? [],
          staydown_matches: staydownMatches.get(notice.id) ?? [],
          email_correspondence: emailCorrespondence.get(notice.id) ?? [],
        },
      ]
    }),
  )
}

function claimantContactPurpose(notice: NoticeRow): string | null {
  if (notice.jurisdiction === 'us_dmca') {
    if (notice.form_key) return copyrightFormSecretPurpose(notice.form_key)
    return notice.amazon_ses_message_id
      ? copyrightEmailIntakePurpose(notice.amazon_ses_message_id)
      : null
  }
  return notice.territorial_key
    ? `${territorialLabels(notice.jurisdiction).noticePurpose}:${notice.territorial_key}:contact`
    : null
}
