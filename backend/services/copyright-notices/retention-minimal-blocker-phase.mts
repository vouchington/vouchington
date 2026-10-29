import sql, { type SQLStatement } from 'sql-template-strings'
import type { CopyrightMinimalBlockerPhase } from './retention-minimal-blocker-phase-types.mts'

/** The supplied query selects one case's indexed rows; only a capped raw page reaches its facts. */
export function copyrightRetentionBlockerPhase(
  table: string,
  rows: (noticeId: string, now: Date, complaintMonths: number) => SQLStatement,
): CopyrightMinimalBlockerPhase {
  return {
    table,
    statement: (noticeId, cursor, pageSize, now, complaintMonths) =>
      sql`/* scanCopyrightRetentionBlockerPage */
      WITH candidate AS MATERIALIZED (SELECT * FROM (`.append(rows(noticeId, now, complaintMonths))
        .append(sql`) case_row
        WHERE (${cursor}::uuid IS NULL OR case_row.id > ${cursor}::uuid)
        ORDER BY case_row.id LIMIT ${pageSize + 1}
      ), selected AS MATERIALIZED (SELECT * FROM candidate ORDER BY id LIMIT ${pageSize})
      SELECT (SELECT count(*) FROM candidate)::integer AS scanned,
        (SELECT id FROM selected ORDER BY id DESC LIMIT 1) AS last_id,
        COALESCE((SELECT bool_or(blocked) FROM selected), false) AS blocked,
        false AS valid_target, false AS unrestricted_target,
        false AS claimant_receipt, false AS notice_assessment, false AS form_assessment`),
  }
}
