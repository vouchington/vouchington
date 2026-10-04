import { beginTransaction, read } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertCopyrightDsaTransparencyReportsEnabled } from './eu-reporting-gate.mts'
import { readDsaCopyrightComplaintFigures } from './eu-reporting-complaints.mts'
import type {
  DsaCopyrightComplaintFigures,
  DsaCopyrightNoticeFigures,
} from './eu-reporting-figure-types.mts'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'
import { assertReportingPeriod } from './territorial-fields.mts'

const JURISDICTION = 'eu_dsa'

type EuCounts = {
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

async function readExistingEuCounts(start: Date, end: Date): Promise<EuCounts> {
  const { rows } = await read<EuCounts>(sql`/* readExistingEuCopyrightCounts */
    SELECT
      (SELECT count(*)::integer FROM copyright_territorial_notice_receipts receipt
        WHERE receipt.jurisdiction = ${JURISDICTION}
          AND receipt.received_at >= ${start} AND receipt.received_at < ${end}) AS receipt_count,
      (SELECT count(*)::integer FROM copyright_territorial_decisions statement
        WHERE statement.jurisdiction = ${JURISDICTION}
          AND statement.decided_at >= ${start} AND statement.decided_at < ${end})
        AS statement_of_reasons_count,
      (SELECT count(*)::integer FROM copyright_territorial_redress_requests redress
        WHERE redress.jurisdiction = ${JURISDICTION}
          AND redress.received_at >= ${start} AND redress.received_at < ${end})
        AS redress_request_count,
      (SELECT count(*)::integer FROM copyright_territorial_redress_decisions decision
        JOIN copyright_territorial_redress_requests redress
          ON redress.id = decision.copyright_territorial_redress_request_id
        WHERE redress.jurisdiction = ${JURISDICTION}
          AND decision.decided_at >= ${start} AND decision.decided_at < ${end})
        AS redress_decision_count,
      (SELECT count(*)::integer FROM copyright_eu_supervised_complaints complaint
        WHERE complaint.jurisdiction = ${JURISDICTION}
          AND complaint.received_at >= ${start} AND complaint.received_at < ${end})
        AS supervised_complaint_count,
      (SELECT count(*)::integer FROM copyright_territorial_escalations escalation
        WHERE escalation.jurisdiction = ${JURISDICTION}
          AND escalation.escalated_at >= ${start} AND escalation.escalated_at < ${end})
        AS escalation_count
  `)
  const counts = rows[0]
  assert(counts, 500, 'Failed to count EU copyright facts')
  return counts
}

/** Read-only, aggregate-only export across all EU approval periods. */
export async function readEuCopyrightTransparencyFigures(
  actor: PrivateUser,
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<DsaCopyrightTransparencyFigures> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  await assertCopyrightDsaTransparencyReportsEnabled()
  assertReportingPeriod(periodStartedAt, periodEndedAt)
  const [counts, noticeFigures, complaintFigures] = await Promise.all([
    readExistingEuCounts(periodStartedAt, periodEndedAt),
    readDsaCopyrightNoticeFigures(periodStartedAt, periodEndedAt),
    readDsaCopyrightComplaintFigures(periodStartedAt, periodEndedAt),
  ])
  return {
    period_start: periodStartedAt.toISOString(),
    period_end: periodEndedAt.toISOString(),
    generated_at: new Date().toISOString(),
    ...counts,
    ...noticeFigures,
    ...complaintFigures,
  }
}

/** Preserve the existing durable six-count record; new figures are export-only. */
export async function compileEuCopyrightTransparencyReport(
  actor: PrivateUser,
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<EuCopyrightTransparencyReport> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  await assertCopyrightDsaTransparencyReportsEnabled()
  const figures = await readEuCopyrightTransparencyFigures(actor, periodStartedAt, periodEndedAt)
  await using transaction = await beginTransaction()
  const { rows } = await transaction<EuCopyrightTransparencyReport>(sql`
    /* compileEuCopyrightTransparencyReport */
    INSERT INTO copyright_eu_transparency_reports (
      jurisdiction, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, reported_by_id
    ) VALUES (
      ${JURISDICTION}, ${periodStartedAt}, ${periodEndedAt}, ${figures.receipt_count},
      ${figures.statement_of_reasons_count}, ${figures.redress_request_count},
      ${figures.redress_decision_count}, ${figures.supervised_complaint_count},
      ${figures.escalation_count}, ${actor.id}
    ) RETURNING id, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count
  `)
  const report = rows[0]
  assert(report, 500, 'Failed to record EU transparency report')
  await transaction.commit()
  return report
}
