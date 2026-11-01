import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const COPYRIGHT_CASE_GLOBAL_REPORT_FAMILIES = ['notices', 'restrictions'] as const
export type CopyrightCaseGlobalReportFamily = (typeof COPYRIGHT_CASE_GLOBAL_REPORT_FAMILIES)[number]

/** The immutable FULL snapshot includes all three copyright jurisdictions in these figures. */
export async function readCopyrightCaseGlobalReportCoveragePage(
  query: QueryExecutor,
  noticeId: string,
  family: CopyrightCaseGlobalReportFamily,
  afterId: string | null,
  limit: number,
): Promise<{ covered: boolean; hasMore: boolean; nextId: string | null }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid copyright report coverage page size')
  const cursor = afterId === null ? sql`` : sql` AND fact.id > ${afterId}::uuid`
  const source =
    family === 'notices'
      ? sql`SELECT fact.id, fact.received_at AS occurred_at FROM copyright_notices fact
          WHERE fact.id = ${noticeId}::uuid`.append(cursor)
      : sql`SELECT fact.id, fact.imposed_at AS occurred_at FROM copyright_restrictions fact
          WHERE fact.copyright_notice_id = ${noticeId}::uuid`.append(cursor)
  const statement = sql`/* readCopyrightCaseGlobalReportCoveragePage */
    SELECT fact.id, EXISTS (
      SELECT 1 FROM copyright_eu_transparency_reports report
      WHERE report.period_started_at <= fact.occurred_at
        AND fact.occurred_at < report.period_ended_at
        AND report.reported_at >= uuid_extract_timestamp(fact.id)
        AND report.method_snapshot ->> 'scope' = 'all_notices'
    ) AS covered FROM (`
    .append(source)
    .append(sql` ORDER BY fact.id LIMIT ${limit + 1}) fact ORDER BY fact.id`)
  const { rows } = await query<{ id: string; covered: boolean }>(statement)
  const page = rows.slice(0, limit)
  return {
    covered: page.every(row => row.covered),
    hasMore: rows.length > limit,
    nextId: page.at(-1)?.id ?? null,
  }
}
