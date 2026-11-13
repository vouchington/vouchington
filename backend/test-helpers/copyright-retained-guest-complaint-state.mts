import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import type { createCommittedGuestComplaintEmail } from './copyright-retained-redress-fixtures.mts'

export type RetainedComplaintEmail = Awaited<ReturnType<typeof createCommittedGuestComplaintEmail>>
/** Whole case/current territorial authority plus the owned receipt, parse, link and review provenance. */
export async function readRetainedGuestComplaintState(
  noticeId: string,
  intake: RetainedComplaintEmail,
) {
  const [state, { rows: links }, { rows: reviews }, { rows: receipts }, { rows: parses }] =
    await Promise.all([
      readCopyrightApiTerritorialState(noticeId),
      write<{
        correspondence_rationale_ciphertext: string | null
        correspondence_manual_fallback_reason_ciphertext: string | null
      }>(
        sql`/* readRetainedGuestComplaint:link */ SELECT * FROM copyright_notice_email_intake_notice_links WHERE copyright_notice_email_intake_id = ${intake.id}`,
      ),
      write<{
        id: string
        rationale_ciphertext: string
        manual_fallback_reason_ciphertext: string | null
        matchesCurrent: boolean
      }>(sql`/* readRetainedGuestComplaint:review */ SELECT review.*,
      (review.action = link.correspondence_action AND review.kind = link.correspondence_kind AND review.reviewed_at = link.correspondence_reviewed_at AND review.reviewed_by_id = link.correspondence_reviewed_by_id AND review.rationale_ciphertext = link.correspondence_rationale_ciphertext AND review.manual_fallback_reason_ciphertext IS NOT DISTINCT FROM link.correspondence_manual_fallback_reason_ciphertext) AS "matchesCurrent"
      FROM copyright_notice_email_correspondence_reviews review JOIN copyright_notice_email_intake_notice_links link ON link.copyright_notice_email_intake_id = review.copyright_notice_email_intake_id WHERE review.copyright_notice_email_intake_id = ${intake.id} ORDER BY review.id`),
      write(
        sql`/* readRetainedGuestComplaint:receipt */ SELECT * FROM copyright_notice_email_intake_receipts WHERE id = ${intake.id}`,
      ),
      write(
        sql`/* readRetainedGuestComplaint:parse */ SELECT * FROM copyright_notice_email_intake_parses WHERE copyright_notice_email_intake_id = ${intake.id}`,
      ),
    ])
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  return {
    state,
    receipts,
    parses,
    links: links.map(row => ({
      ...row,
      correspondence_rationale_ciphertext: row.correspondence_rationale_ciphertext
        ? decryptSecret(row.correspondence_rationale_ciphertext, purpose)
        : null,
      correspondence_manual_fallback_reason_ciphertext:
        row.correspondence_manual_fallback_reason_ciphertext
          ? decryptSecret(row.correspondence_manual_fallback_reason_ciphertext, purpose)
          : null,
    })),
    reviews: reviews.map(row => ({
      ...row,
      rationale_ciphertext: decryptSecret(row.rationale_ciphertext, purpose),
      manual_fallback_reason_ciphertext: row.manual_fallback_reason_ciphertext
        ? decryptSecret(row.manual_fallback_reason_ciphertext, purpose)
        : null,
    })),
  }
}
