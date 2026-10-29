import sql, { type SQLStatement } from 'sql-template-strings'
import type { CopyrightMinimalPurgePhase } from './retention-minimal-purge-types.mts'

/** Static manifest entries select capped leaf rows before their parent or restrictive FK. */
function phase(
  table: string,
  scope: (noticeId: string) => SQLStatement,
): CopyrightMinimalPurgePhase {
  return {
    table,
    statement: (noticeId, pageSize) =>
      sql`/* drainCopyrightDsaRetentionPage */
      WITH candidate AS MATERIALIZED (SELECT child.tableoid, child.ctid FROM `
        .append(table)
        .append(sql` child `)
        .append(scope(noticeId))
        .append(sql` LIMIT ${pageSize + 1}),
      page AS MATERIALIZED (SELECT tableoid, ctid FROM candidate LIMIT ${pageSize}),
      deleted AS (DELETE FROM `)
        .append(table).append(sql` target USING page
        WHERE target.tableoid = page.tableoid AND target.ctid = page.ctid RETURNING 1)
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT count(*) FROM deleted)::integer AS deleted`),
  }
}

export const COPYRIGHT_MINIMAL_PURGE_PHASES_DSA = [
  phase(
    'copyright_notice_email_intake_reviews',
    noticeId => sql`WHERE child.promoted_copyright_notice_identity_id = ${noticeId}`,
  ),
  phase(
    'copyright_notice_replay_receipts',
    noticeId => sql`WHERE child.copyright_notice_id = ${noticeId}`,
  ),
  phase(
    'copyright_account_suspension_incidents',
    noticeId => sql`
    JOIN copyright_repeat_infringer_incidents incident ON incident.id = child.copyright_repeat_infringer_incident_id
    JOIN copyright_account_suspension_reliances reliance ON reliance.account_user_id = child.account_user_id
    WHERE incident.copyright_notice_id = ${noticeId} AND reliance.released_at IS NOT NULL`,
  ),
  phase(
    'copyright_notice_encryption_keys',
    noticeId => sql`WHERE child.copyright_notice_id = ${noticeId}`,
  ),
  phase(
    'copyright_territorial_escalation_closures',
    noticeId => sql`
    JOIN copyright_territorial_escalations parent ON parent.id = child.copyright_territorial_escalation_id
    WHERE parent.copyright_notice_id = ${noticeId}`,
  ),
  phase(
    'copyright_eu_supervised_complaint_resolutions',
    noticeId => sql`
    JOIN copyright_eu_supervised_complaints parent ON parent.id = child.copyright_eu_supervised_complaint_id
    WHERE parent.copyright_notice_id = ${noticeId}`,
  ),
  phase(
    'copyright_dsa_statement_submission_attempts',
    noticeId => sql`
    JOIN copyright_dsa_statement_submissions submission ON submission.id = child.copyright_dsa_statement_submission_id
    JOIN copyright_restrictions restriction ON restriction.id = submission.copyright_restriction_id
    WHERE restriction.copyright_notice_id = ${noticeId}`,
  ),
  phase(
    'copyright_dsa_statement_submissions',
    noticeId => sql`
    JOIN copyright_restrictions restriction ON restriction.id = child.copyright_restriction_id
    WHERE restriction.copyright_notice_id = ${noticeId}`,
  ),
  phase(
    'copyright_case_preservation_holds',
    noticeId => sql`WHERE child.copyright_notice_id = ${noticeId}`,
  ),
]
