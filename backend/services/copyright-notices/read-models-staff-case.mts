import { decryptSecret } from '@modules/token-secrets'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { readClaimantMisuseSummaries } from './claimant-misuse-summary.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import { copyrightFormSecretPurpose } from './form-intakes.mts'
import { selectStaffTerritorialCases } from './read-models-staff-territorial.mts'
import { territorialLabels } from './territorial-labels.mts'
import { selectStaffLegalHolds } from './read-models-staff-legal-holds.mts'
import {
  selectStaffRestrictions,
  selectStaffSubmissions,
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
    LEFT JOIN copyright_notice_email_intake_notice_links email_link
      ON email_link.copyright_notice_id = notice.id AND email_link.link_kind = 'initial'
    LEFT JOIN copyright_notice_email_intakes email ON email.id = email_link.copyright_notice_email_intake_id
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
  // Cursors share query.client's single PostgreSQL connection and cannot open unnamed portals concurrently.
  const sections = {
    targets: await selectStaffTargets(ids, query),
    evidence: await selectStaffEvidence(ids, query),
    formReview: await selectStaffFormReview(ids, query),
    restrictions: await selectStaffRestrictions(ids, query),
    submissions: await selectStaffSubmissions(ids, query),
    legalHolds: await selectStaffLegalHolds(ids, query),
    actionIntents: await selectStaffActionIntents(ids, query),
    deliveryIntents: await selectStaffDeliveryIntents(ids, query),
    emailCorrespondence: await selectStaffEmailCorrespondence(ids, query),
    staydownMatches: await selectStaffStaydownMatches(ids, query),
    misuse: await readClaimantMisuseSummaries(claimantIds, query),
    territorial: await selectStaffTerritorialCases(territorialIds, query),
  }
  return new Map(
    listed.map(({ notice, contactPurpose }): [string, CopyrightStaffCase] => {
      const territorialCase = sections.territorial.get(notice.id)
      return [
        notice.id,
        {
          id: notice.id,
          received_at: notice.received_at,
          jurisdiction: notice.jurisdiction,
          claimant: {
            user_id: notice.claimant_user_id,
            display_name: notice.claimant_display_name,
            contact: decryptSecret(notice.claimant_contact_ciphertext, contactPurpose),
            misuse: notice.claimant_user_id ? sections.misuse.get(notice.claimant_user_id)! : null,
          },
          work_description: notice.work_description,
          ...(territorialCase ? { territorial: territorialCase } : {}),
          targets: sections.targets.get(notice.id) ?? [],
          evidence: sections.evidence.get(notice.id) ?? [],
          form_review: sections.formReview.get(notice.id) ?? null,
          restrictions: sections.restrictions.get(notice.id) ?? [],
          appeals: sections.submissions.appeals.get(notice.id) ?? [],
          counter_notices: sections.submissions.counterNotices.get(notice.id) ?? [],
          legal_holds: sections.legalHolds.get(notice.id) ?? [],
          action_intents: sections.actionIntents.get(notice.id) ?? [],
          delivery_intents: sections.deliveryIntents.get(notice.id) ?? [],
          staydown_matches: sections.staydownMatches.get(notice.id)?.matches ?? [],
          staydown_matches_has_more: sections.staydownMatches.get(notice.id)?.hasMore ?? false,
          email_correspondence: sections.emailCorrespondence.get(notice.id) ?? [],
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
