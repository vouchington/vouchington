import sql, { type SQLStatement } from 'sql-template-strings'
import { getCopyrightRetentionWindows } from './config.mts'

/** Both evidence erasure and legal-row deletion consume the same finite, generation-fenced proof. */
export function copyrightRetentionEligibleSql(
  now: Date,
  cutoff: Date,
  windows = getCopyrightRetentionWindows(),
): SQLStatement {
  return sql`WITH eligible AS (
    SELECT notice.id FROM copyright_notices notice
    WHERE NOT EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erased
      WHERE erased.copyright_notice_id = notice.id)
      AND fn_project_copyright_case_retention_eligible(notice.id, ${now}, ${cutoff},
        ${windows.caseMonths}, ${windows.complaintMonths})
  )`
}
