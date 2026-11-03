import type { QueryExecutor } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export const EU_REPORT_FACT_FAMILIES = [
  'receipts',
  'decisions',
  'redress_requests',
  'redress_decisions',
  'supervised_complaints',
  'escalations',
] as const

export type EuReportFactFamily = (typeof EU_REPORT_FACT_FAMILIES)[number]

export type EuReportCoveragePage = {
  covered: boolean
  hasMore: boolean
  nextId: string | null
  lastLegalActivityAt: Date | null
}

/** The caller keeps this transaction open while it decides whether the case can advance. */
export async function readEuCopyrightReportCoveragePage(
  query: QueryExecutor,
  noticeId: string,
  family: EuReportFactFamily,
  afterId: string | null,
  limit: number,
): Promise<EuReportCoveragePage> {
  assert(Number.isInteger(limit) && limit >= 1 && limit <= 100, 500, 'Invalid coverage page size')
  const { rows: notices } = await query<{ last_legal_activity_at: Date }>(sql`
    /* readEuCopyrightReportCoveragePage.lockNotice */
    SELECT last_legal_activity_at FROM copyright_notices
    WHERE id = ${noticeId}::uuid AND jurisdiction = 'eu_dsa' FOR UPDATE
  `)
  const notice = notices[0]
  if (!notice) return { covered: false, hasMore: false, nextId: null, lastLegalActivityAt: null }

  const cursor = afterId === null ? sql`` : sql` AND fact.id > ${afterId}::uuid`
  const source = (() => {
    switch (family) {
      case 'receipts':
        return sql`SELECT fact.id, fact.received_at AS occurred_at
          FROM copyright_territorial_notice_receipts fact
          WHERE fact.copyright_notice_id = ${noticeId}::uuid AND fact.jurisdiction = 'eu_dsa'`.append(
          cursor,
        )
      case 'decisions':
        return sql`SELECT fact.id, fact.decided_at AS occurred_at
          FROM copyright_territorial_decisions fact
          WHERE fact.copyright_notice_id = ${noticeId}::uuid AND fact.jurisdiction = 'eu_dsa'`.append(
          cursor,
        )
      case 'redress_requests':
        return sql`SELECT fact.id, fact.received_at AS occurred_at
          FROM copyright_territorial_redress_requests fact
          WHERE fact.copyright_notice_id = ${noticeId}::uuid AND fact.jurisdiction = 'eu_dsa'`.append(
          cursor,
        )
      case 'redress_decisions':
        return sql`SELECT fact.id, fact.decided_at AS occurred_at
          FROM copyright_territorial_redress_decisions fact
          JOIN copyright_territorial_redress_requests request
            ON request.id = fact.copyright_territorial_redress_request_id
          WHERE request.copyright_notice_id = ${noticeId}::uuid
            AND request.jurisdiction = 'eu_dsa'`.append(cursor)
      case 'supervised_complaints':
        return sql`SELECT fact.id, fact.received_at AS occurred_at
          FROM copyright_eu_supervised_complaints fact
          WHERE fact.copyright_notice_id = ${noticeId}::uuid`.append(cursor)
      case 'escalations':
        return sql`SELECT fact.id, fact.escalated_at AS occurred_at
          FROM copyright_territorial_escalations fact
          WHERE fact.copyright_notice_id = ${noticeId}::uuid AND fact.jurisdiction = 'eu_dsa'`.append(
          cursor,
        )
    }
  })()
  const page = sql`/* readEuCopyrightReportCoveragePage.facts */
    SELECT fact.id, EXISTS (
      SELECT 1 FROM copyright_eu_transparency_reports report
      WHERE report.period_started_at <= fact.occurred_at
        AND fact.occurred_at < report.period_ended_at
        AND report.reported_at >= uuid_extract_timestamp(fact.id)
    ) AS covered FROM (`
    .append(source)
    .append(sql` ORDER BY fact.id LIMIT ${limit + 1}) fact ORDER BY fact.id`)
  const { rows } = await query<{ id: string; covered: boolean }>(page)
  const current = rows.slice(0, limit)
  return {
    covered: current.every(row => row.covered),
    hasMore: rows.length > limit,
    nextId: current.at(-1)?.id ?? null,
    lastLegalActivityAt: notice.last_legal_activity_at,
  }
}
