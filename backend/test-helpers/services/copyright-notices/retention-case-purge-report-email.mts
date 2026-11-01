import { randomInt } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** An owned historical period stays outside reports published by concurrent modern cases. */
export function copyrightCaseReportPeriod() {
  const start = new Date(Date.UTC(1000, 0, 1) + randomInt(1, 10_000_000_000_000))
  return { start, end: new Date(start.getTime() + 3 * 86_400_000) }
}

/** Publication time must cover insertion time as well as the fact's historical occurrence. */
export async function publishCopyrightCaseReportPeriod(
  period: { start: Date; end: Date },
  reportedAt: Date,
): Promise<void> {
  await write(sql`/* publishCopyrightCaseReportPeriod */
    INSERT INTO copyright_eu_transparency_reports (
      jurisdiction, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, figures_snapshot, method_snapshot,
      reported_at
    ) VALUES ('eu_dsa', ${period.start}, ${period.end}, 0, 0, 0, 0, 0, 0,
      '{}'::jsonb, '{"scope":"all_notices"}'::jsonb, ${reportedAt})`)
}

export async function readCopyrightCaseThreadPurgeState(intakeId: string) {
  const { rows } = await read<{ intake: boolean; link: boolean; receipt: boolean }>(sql`
    /* readCopyrightCaseThreadPurgeState */
    SELECT
      EXISTS (SELECT 1 FROM copyright_notice_email_intakes WHERE id = ${intakeId}::uuid) AS intake,
      EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links
        WHERE copyright_notice_email_intake_id = ${intakeId}::uuid) AS link,
      EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts WHERE id = ${intakeId}::uuid) AS receipt`)
  return rows[0]!
}
