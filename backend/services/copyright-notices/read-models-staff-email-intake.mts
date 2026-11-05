import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getCopyrightEmailThreadGraphMaxRows } from './config.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import type { CopyrightEmailSesVerdict, CopyrightEmailSesVerdicts } from './email-ses-verdicts.mts'
import {
  copyrightEmailAncestorNoticeConflictSql,
  copyrightEmailDuplicateMessageIdSql,
  copyrightEmailReplyReferenceSql,
  copyrightEmailReviewPath,
  type CopyrightEmailReviewPath,
} from './email-thread-review-path.mts'

export type CopyrightStaffEmailIntake = {
  id: string
  received_at: Date
  review_path: CopyrightEmailReviewPath
  linked_notice: {
    id: string
    targets: Array<{ id: string; placement_key: string }>
  } | null
  /** `download_url` is available only after a passing SES virus verdict. */
  raw_email: { mime_type: string; byte_size: number; sha256: string; download_url: string | null }
  ses_verdicts: CopyrightEmailSesVerdicts
  parsed_email: { sender_email: string; subject: string; body_text: string } | null
  parser_error: string | null
  recommendation: { id: string; structured_output: Record<string, unknown> } | null
}

export async function getCopyrightStaffEmailIntake(
  intakeId: string,
  currentUser: PrivateUser,
): Promise<CopyrightStaffEmailIntake | null> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser)) return null
  const maxGraphRows = await getCopyrightEmailThreadGraphMaxRows()
  const intakeQuery = sql`/* getCopyrightStaffEmailIntake */
    SELECT intake.id, intake.amazon_ses_message_id, intake.received_at, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size, intake.raw_sha256,
      intake.spf_verdict, intake.dkim_verdict, intake.dmarc_verdict, intake.spam_verdict, intake.virus_verdict,
      parse.sender_email_ciphertext, parse.subject_ciphertext, parse.body_ciphertext, parse.error_ciphertext,
      intake.current_recommendation_identity_id AS recommendation_id,
      intake.current_recommendation_output_ciphertext AS structured_output_ciphertext,
      link.link_kind, link.copyright_notice_id AS linked_notice_id, `
  intakeQuery.append(copyrightEmailDuplicateMessageIdSql())
  intakeQuery.append(sql` AS has_duplicate_message_id, `)
  intakeQuery.append(copyrightEmailAncestorNoticeConflictSql(maxGraphRows))
  intakeQuery.append(sql` AS has_ancestor_notice_conflict, `)
  intakeQuery.append(copyrightEmailReplyReferenceSql())
  intakeQuery.append(sql` AS has_reply_reference
    FROM copyright_notice_email_intakes intake
    LEFT JOIN copyright_notice_email_intake_parses parse ON parse.copyright_notice_email_intake_id = intake.id
    LEFT JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = intake.id
    WHERE intake.id = ${intakeId}
  `)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    amazon_ses_message_id: string
    received_at: Date
    raw_mime_type: string
    raw_byte_size: number
    raw_sha256: Buffer
    spf_verdict: CopyrightEmailSesVerdict
    dkim_verdict: CopyrightEmailSesVerdict
    dmarc_verdict: CopyrightEmailSesVerdict
    spam_verdict: CopyrightEmailSesVerdict
    virus_verdict: CopyrightEmailSesVerdict
    sender_email_ciphertext: string | null
    subject_ciphertext: string | null
    body_ciphertext: string | null
    error_ciphertext: string | null
    recommendation_id: string | null
    structured_output_ciphertext: string | null
    link_kind: 'initial' | 'thread' | null
    linked_notice_id: string | null
    has_duplicate_message_id: boolean
    has_ancestor_notice_conflict: boolean
    has_reply_reference: boolean
  }>(intakeQuery)
  await transaction.commit()
  const row = rows[0]
  if (!row) return null
  const purpose = copyrightEmailIntakePurpose(row.amazon_ses_message_id)
  const decryptLive = (ciphertext: string | null) =>
    ciphertext ? decryptSecret(ciphertext, purpose) : null
  const senderEmail = decryptLive(row.sender_email_ciphertext)
  const subject = decryptLive(row.subject_ciphertext)
  const bodyText = decryptLive(row.body_ciphertext)
  const parserError = decryptLive(row.error_ciphertext)
  const structuredOutput = decryptLive(row.structured_output_ciphertext)
  const reviewPath = copyrightEmailReviewPath(row)
  const linkedNotice = row.linked_notice_id
    ? await getCopyrightEmailLinkedNotice(row.linked_notice_id)
    : null
  return {
    id: row.id,
    received_at: row.received_at,
    review_path: reviewPath,
    linked_notice: linkedNotice,
    raw_email: {
      mime_type: row.raw_mime_type,
      byte_size: row.raw_byte_size,
      sha256: row.raw_sha256.toString('hex'),
      download_url:
        row.virus_verdict === 'pass' ? `/api/v1/copyright-email-intakes/${row.id}/raw` : null,
    },
    ses_verdicts: {
      spf: row.spf_verdict,
      dkim: row.dkim_verdict,
      dmarc: row.dmarc_verdict,
      spam: row.spam_verdict,
      virus: row.virus_verdict,
    },
    // An erased column reads as absent, the way a parse that never landed does.
    parsed_email:
      senderEmail !== null && subject !== null && bodyText !== null
        ? { sender_email: senderEmail, subject, body_text: bodyText }
        : null,
    parser_error: parserError,
    recommendation:
      row.recommendation_id && structuredOutput !== null
        ? {
            id: row.recommendation_id,
            structured_output: JSON.parse(structuredOutput) as Record<string, unknown>,
          }
        : null,
  }
}

async function getCopyrightEmailLinkedNotice(noticeId: string): Promise<{
  id: string
  targets: Array<{ id: string; placement_key: string }>
} | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    placement_key: string
  }>(sql`/* getCopyrightEmailLinkedNotice */
    SELECT id, concat('image-placement:', placement_id) AS placement_key FROM copyright_notice_targets
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  await transaction.commit()
  return rows.length > 0 ? { id: noticeId, targets: rows } : null
}
