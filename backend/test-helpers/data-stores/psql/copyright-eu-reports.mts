import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Counts the EU transparency reports one staff member compiled, so a rejected request can prove
 * it recorded nothing in the shared database. */
export async function countEuTransparencyReportsBy(reporterId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countEuTransparencyReportsBy */
    SELECT count(*)::integer AS count
    FROM copyright_eu_transparency_reports
    WHERE reported_by_id = ${reporterId}
  `)
  return rows[0]?.count ?? 0
}

export async function readEuTransparencyReportMethod(reportId: string): Promise<{
  method_snapshot: { scope: string; sources: Record<string, string> }
  figures_snapshot: { receipt_count: number; notices_received_count: number }
  reported_at: Date
  period_ended_at: Date
} | null> {
  const { rows } = await read<{
    method_snapshot: { scope: string; sources: Record<string, string> }
    figures_snapshot: { receipt_count: number; notices_received_count: number }
    reported_at: Date
    period_ended_at: Date
  }>(sql`/* readEuTransparencyReportMethod */
    SELECT method_snapshot, figures_snapshot, reported_at, period_ended_at
    FROM copyright_eu_transparency_reports WHERE id = ${reportId}::uuid`)
  return rows[0] ?? null
}
