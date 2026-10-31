import { read, type QueryExecutor } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type {
  DsaCopyrightComplaintFigures,
  DsaCopyrightNoticeFigures,
} from './eu-reporting-figure-types.mts'

const JURISDICTION = 'eu_dsa'

export type EuCounts = {
  receipt_count: number
  statement_of_reasons_count: number
  redress_request_count: number
  redress_decision_count: number
  supervised_complaint_count: number
  escalation_count: number
}

export type EuCopyrightTransparencyReport = EuCounts & {
  id: string
  period_started_at: Date
  period_ended_at: Date
}

export type DsaCopyrightTransparencyFigures = EuCounts &
  DsaCopyrightNoticeFigures &
  DsaCopyrightComplaintFigures & {
    period_start: string
    period_end: string
    generated_at: string
  }

type StoredEuReport = EuCopyrightTransparencyReport & {
  figures_snapshot: DsaCopyrightTransparencyFigures
}

export async function readStoredEuReport(
  start: Date,
  end: Date,
  queryExecutor: QueryExecutor = read,
): Promise<StoredEuReport | null> {
  const { rows } = await queryExecutor<StoredEuReport>(sql`/* readStoredEuReport */
    SELECT id, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, figures_snapshot
    FROM copyright_eu_transparency_reports
    WHERE period_started_at = ${start} AND period_ended_at = ${end}`)
  return rows[0] ?? null
}

export async function readExistingEuCounts(
  start: Date,
  end: Date,
  noticeIds?: readonly string[],
  queryExecutor: QueryExecutor = read,
): Promise<EuCounts> {
  if (noticeIds?.length === 0) return emptyEuCounts()
  const query = sql`/* readExistingEuCopyrightCounts */
    SELECT
      (SELECT count(*)::integer FROM copyright_territorial_notice_receipts receipt
        WHERE receipt.jurisdiction = ${JURISDICTION}
          AND receipt.received_at >= ${start} AND receipt.received_at < ${end}`
  appendEuNoticeIds(query, noticeIds, 'receipt.copyright_notice_id')
  query.append(sql`) AS receipt_count,
      (SELECT count(*)::integer FROM copyright_territorial_decisions statement
        WHERE statement.jurisdiction = ${JURISDICTION}
          AND statement.decided_at >= ${start} AND statement.decided_at < ${end}`)
  appendEuNoticeIds(query, noticeIds, 'statement.copyright_notice_id')
  query.append(sql`)
        AS statement_of_reasons_count,
      (SELECT count(*)::integer FROM copyright_territorial_redress_requests redress
        WHERE redress.jurisdiction = ${JURISDICTION}
          AND redress.received_at >= ${start} AND redress.received_at < ${end}`)
  appendEuNoticeIds(query, noticeIds, 'redress.copyright_notice_id')
  query.append(sql`)
        AS redress_request_count,
      (SELECT count(*)::integer FROM copyright_territorial_redress_decisions decision
        JOIN copyright_territorial_redress_requests redress
          ON redress.id = decision.copyright_territorial_redress_request_id
        WHERE redress.jurisdiction = ${JURISDICTION}
          AND decision.decided_at >= ${start} AND decision.decided_at < ${end}`)
  appendEuNoticeIds(query, noticeIds, 'redress.copyright_notice_id')
  query.append(sql`)
        AS redress_decision_count,
      (SELECT count(*)::integer FROM copyright_eu_supervised_complaints complaint
        WHERE complaint.jurisdiction = ${JURISDICTION}
          AND complaint.received_at >= ${start} AND complaint.received_at < ${end}`)
  appendEuNoticeIds(query, noticeIds, 'complaint.copyright_notice_id')
  query.append(sql`)
        AS supervised_complaint_count,
      (SELECT count(*)::integer FROM copyright_territorial_escalations escalation
        WHERE escalation.jurisdiction = ${JURISDICTION}
          AND escalation.escalated_at >= ${start} AND escalation.escalated_at < ${end}`)
  appendEuNoticeIds(query, noticeIds, 'escalation.copyright_notice_id')
  query.append(sql`)
        AS escalation_count
  `)
  const { rows } = await queryExecutor<EuCounts>(query)
  const counts = rows[0]
  assert(counts, 500, 'Failed to count EU copyright facts')
  return counts
}

function appendEuNoticeIds(
  query: ReturnType<typeof sql>,
  noticeIds: readonly string[] | undefined,
  column: string,
): void {
  if (noticeIds) query.append(sql` AND `.append(column).append(sql` = ANY(${noticeIds}::uuid[])`))
}

function emptyEuCounts(): EuCounts {
  return {
    receipt_count: 0,
    statement_of_reasons_count: 0,
    redress_request_count: 0,
    redress_decision_count: 0,
    supervised_complaint_count: 0,
    escalation_count: 0,
  }
}
