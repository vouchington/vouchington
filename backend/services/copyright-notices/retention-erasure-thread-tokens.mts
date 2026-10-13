import sql, { type SQLStatement } from 'sql-template-strings'

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
