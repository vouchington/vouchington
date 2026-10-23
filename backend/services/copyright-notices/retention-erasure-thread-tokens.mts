import sql, { type SQLStatement } from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql/types'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'
import { lockCopyrightRetentionCase } from './retention-erasure-preservation.mts'

/** Token IDs used by this case before its references are cleared. */
function caseThreadTokenIdsSql(noticeId: string): SQLStatement {
  return sql`SELECT reference.token_id AS id
    FROM copyright_notice_email_thread_references reference
    JOIN copyright_notice_email_intake_notice_links owner
      ON owner.copyright_notice_email_intake_id = reference.copyright_notice_email_intake_id
    WHERE owner.copyright_notice_id = ${noticeId} AND reference.token_id IS NOT NULL
    UNION
    SELECT link.matched_token_id AS id
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_id = ${noticeId} AND link.matched_token_id IS NOT NULL`
}

/** Candidate digests are used only to take the same ordered locks as ingestion. */
export function caseThreadTokenDigestsSql(noticeId: string): SQLStatement {
  return sql`/* caseThreadTokenDigests */
    SELECT token.lookup_digest
    FROM copyright_notice_email_thread_tokens token
    WHERE token.id IN (`
    .append(caseThreadTokenIdsSql(noticeId))
    .append(sql`) ORDER BY token.lookup_digest`)
}

function caseEmailMessageIdsSql(noticeId: string): SQLStatement {
  return sql`/* caseEmailMessageIds */
    SELECT intake.amazon_ses_message_id
    FROM copyright_notice_email_intake_notice_links link
    JOIN copyright_notice_email_intakes intake
      ON intake.id = link.copyright_notice_email_intake_id
    WHERE link.copyright_notice_id = ${noticeId}
    ORDER BY intake.amazon_ses_message_id`
}

/** Keep ingestion's token-before-parent order; abort before erasure if the case grew meanwhile. */
export async function lockCopyrightRetentionCaseThreadTokens(
  transaction: TransactionQuery,
  noticeId: string,
): Promise<boolean> {
  const { rows: candidateMessages } = await transaction<{ amazon_ses_message_id: string }>(
    caseEmailMessageIdsSql(noticeId),
  )
  const lockedMessages = new Set(candidateMessages.map(row => row.amazon_ses_message_id))
  // oxlint-disable no-await-in-loop -- identical order as ingestion's single-message lock.
  for (const messageId of lockedMessages) {
    // no-mistakes-disable-next-line query-reached-per-item: bounded case message locks serialize each SES replay before erasure of that exact identity.
    await transaction(sql`/* lockCopyrightRetentionEmailIdentity */
      SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-email:${messageId}`}, 0))`)
  }
  // oxlint-enable no-await-in-loop
  const { rows: candidateTokens } = await transaction<{ lookup_digest: string }>(
    caseThreadTokenDigestsSql(noticeId),
  )
  const lockedDigests = new Set(candidateTokens.map(row => row.lookup_digest))
  await lockCopyrightEmailThreadTokens(transaction, [...lockedDigests])
  await lockCopyrightRetentionCase(transaction, noticeId)
  // A linked intake may have committed while the notice lock was still pending.
  // This separate READ COMMITTED statement sees every case reference and matched
  // notice-link token; deferral happens before any external storage deletion.
  const { rows: currentTokens } = await transaction<{ lookup_digest: string }>(
    caseThreadTokenDigestsSql(noticeId),
  )
  const { rows: currentMessages } = await transaction<{ amazon_ses_message_id: string }>(
    caseEmailMessageIdsSql(noticeId),
  )
  return (
    currentTokens.every(row => lockedDigests.has(row.lookup_digest)) &&
    currentMessages.every(row => lockedMessages.has(row.amazon_ses_message_id))
  )
}

/** Keep a shared digest while any reference or notice link outside this case still owns it. */
export function exclusiveCaseThreadTokenScopeSql(noticeId: string): SQLStatement {
  return sql`id IN (`.append(caseThreadTokenIdsSql(noticeId)).append(sql`)
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_thread_references other_reference
        WHERE other_reference.token_id = copyright_notice_email_thread_tokens.id
          AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_email_intake_notice_links owner
            WHERE owner.copyright_notice_email_intake_id = other_reference.copyright_notice_email_intake_id
              AND owner.copyright_notice_id = ${noticeId}
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_notice_links other_link
        WHERE other_link.matched_token_id = copyright_notice_email_thread_tokens.id
          AND other_link.copyright_notice_id <> ${noticeId}
      )`)
}
