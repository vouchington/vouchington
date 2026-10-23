import sql from 'sql-template-strings'
import { getMaxUUIDv7ForDate } from '@modules/utils'

/** The database predicate also protects the locked recheck and root DELETE trigger. */
export function copyrightMinimalRecordPurgeEligibleSql(now: Date, cutoff: Date) {
  return sql`WITH purge_eligible AS (
    SELECT notice.id FROM copyright_notices notice
    WHERE notice.id <= ${getMaxUUIDv7ForDate(cutoff)}::uuid
      AND fn_project_copyright_minimal_record_purge_eligible(notice.id, ${now}, ${cutoff})
  )`
}
