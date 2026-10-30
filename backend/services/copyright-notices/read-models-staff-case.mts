import { openCopyrightCiphertextSecretBatch } from './encryption-key-batch.mts'
import { getCopyrightRetentionWindows } from './config.mts'
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
  const boundedNoticeIds = [...new Set(noticeIds)].toSorted()
  if (boundedNoticeIds.length === 0) return new Map()
  if (boundedNoticeIds.length > getCopyrightRetentionWindows().encryptionOwnerBatchSize)
    throw new RangeError('Copyright staff case page exceeds its owner-key cap')

  // Erasure owns the notice row until its marker and owner-key destruction commit. Lock the
  // bounded candidate set first, then take a fresh READ COMMITTED statement snapshot below.
  await query(sql`/* lockCopyrightStaffCaseNoticeOwners */
    SELECT notice.id FROM copyright_notices notice
    WHERE notice.id = ANY(${boundedNoticeIds}::uuid[])
    ORDER BY notice.id FOR SHARE OF notice
  `)
  const { rows } = await query<NoticeRow>(sql`/* getPendingCopyrightStaffCase:notice */
    SELECT notice.id, notice.received_at, notice.jurisdiction, notice.claimant_user_id,
      notice.claimant_display_name, notice.claimant_contact_ciphertext, notice.work_description,
      form.idempotency_key AS form_key, email.amazon_ses_message_id,
      receipt.idempotency_key AS territorial_key
    FROM copyright_notices notice
    LEFT JOIN copyright_notice_form_intakes form ON form.copyright_notice_id = notice.id
    LEFT JOIN copyright_notice_email_intake_notice_links email_link
      ON email_link.copyright_notice_id = notice.id AND email_link.link_kind = 'initial'
    LEFT JOIN copyright_notice_email_intake_receipts email ON email.id = email_link.copyright_notice_email_intake_receipt_id
    LEFT JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = notice.id AND receipt.jurisdiction = notice.jurisdiction
    WHERE notice.id = ANY(${boundedNoticeIds}::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_retention_erasures erased
        WHERE erased.copyright_notice_id = notice.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_minimal_purge_continuations work
        WHERE work.copyright_notice_identity_id = notice.id AND work.erasure_started_at IS NOT NULL
      )
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
  await using secretsBatch = await openCopyrightCiphertextSecretBatch(
    listed.map(item => ({
      owner: { kind: 'notice' as const, id: item.notice.id },
      ciphertexts: [item.notice.claimant_contact_ciphertext],
    })),
    query,
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
    selectStaffFormReview(ids, query, secretsBatch),
    selectStaffRestrictions(ids, query),
    selectStaffAppeals(ids, query, secretsBatch),
    selectStaffCounterNotices(ids, query, secretsBatch),
    selectStaffLegalHolds(ids, query, secretsBatch),
    selectStaffActionIntents(ids, query),
    selectStaffDeliveryIntents(ids, query),
    selectStaffEmailCorrespondence(ids, query),
    selectStaffStaydownMatches(ids, query),
    readClaimantMisuseSummaries(claimantIds, query),
    selectStaffTerritorialCases(territorialIds, query, secretsBatch),
  ])

  return new Map(
    listed.map(({ notice, contactPurpose }): [string, CopyrightStaffCase] => {
      const secrets = secretsBatch.forCiphertexts({ kind: 'notice', id: notice.id }, [
        notice.claimant_contact_ciphertext,
      ])
      const territorialCase = territorial.get(notice.id)
      return [
        notice.id,
        {
          id: notice.id,
          received_at: notice.received_at,
          jurisdiction: notice.jurisdiction,
          claimant: {
            display_name: notice.claimant_display_name,
            contact: decryptCopyrightText(
              notice.claimant_contact_ciphertext,
              contactPurpose,
              secrets,
            ),
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
          staydown_matches: staydownMatches.get(notice.id)?.matches ?? [],
          staydown_matches_has_more: staydownMatches.get(notice.id)?.hasMore ?? false,
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
