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

export type RecordedFact = 'notice' | 'restriction' | 'redress_request' | 'redress_decision'

/** The millisecond Voucha recorded a fact, from its UUIDv7 id; `id` is the notice id for a
 * restriction and the request id otherwise. */
export async function readEuFactRecordedAt(kind: RecordedFact, id: string): Promise<Date> {
  const { rows } = await read<{ at: Date }>(sql`/* readEuFactRecordedAt */
    SELECT uuid_extract_timestamp(fact_id) AS at FROM (
      SELECT CASE ${kind}::text
        WHEN 'notice' THEN (SELECT n.id FROM copyright_notices n WHERE n.id = ${id}::uuid)
        WHEN 'restriction' THEN (SELECT r.id FROM copyright_restrictions r
          WHERE r.copyright_notice_id = ${id}::uuid LIMIT 1)
        WHEN 'redress_request' THEN (SELECT q.id FROM copyright_territorial_redress_requests q
          WHERE q.id = ${id}::uuid)
        ELSE (SELECT q.current_staff_decision_identity_id
          FROM copyright_territorial_redress_requests q WHERE q.id = ${id}::uuid)
      END AS fact_id
    ) fact`)
  const at = rows[0]?.at
  if (!at) throw new Error(`Expected a recorded ${kind}`)
  return at
}
