import { getCopyrightRetentionWindows } from './config.mts'
import sql from 'sql-template-strings'

/** The database predicate also protects the locked recheck and root DELETE trigger. */
export function copyrightMinimalRecordPurgeEligibleSql(
  now: Date,
  cutoff: Date,
  windows = getCopyrightRetentionWindows(),
) {
  return sql`WITH purge_eligible AS (
    SELECT notice.id FROM copyright_notices notice
    WHERE EXISTS (SELECT 1 FROM copyright_notice_retention_erasures erased WHERE erased.copyright_notice_id = notice.id)
      AND fn_project_copyright_case_retention_eligible(notice.id, ${now}, ${cutoff}, ${windows.caseMonths}, ${windows.complaintMonths})
  )`
}
