import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertReportingPeriod } from './territorial-fields.mts'
import { lockCurrentCopyrightTerritorialPolicy } from './territorial-policy.mts'

const JURISDICTION = 'eu_dsa'

export type EuCopyrightTransparencyReport = {
  id: string
  period_started_at: Date
  period_ended_at: Date
  receipt_count: number
  statement_of_reasons_count: number
  redress_request_count: number
  redress_decision_count: number
  supervised_complaint_count: number
  escalation_count: number
}

export async function compileEuCopyrightTransparencyReport(
  actor: PrivateUser,
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<EuCopyrightTransparencyReport> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  assertReportingPeriod(periodStartedAt, periodEndedAt)
  await using transaction = await beginTransaction()
  const approval = await lockCurrentCopyrightTerritorialPolicy(JURISDICTION, transaction)
  const { rows: counts } = await transaction<
    Omit<EuCopyrightTransparencyReport, 'id' | 'period_started_at' | 'period_ended_at'>
  >(sql`/* compileEuCopyrightTransparencyReport:counts */
    SELECT
      (SELECT count(*)::integer FROM copyright_territorial_notice_receipts receipt
        WHERE receipt.jurisdiction = ${JURISDICTION}
          AND receipt.copyright_territorial_policy_approval_id = ${approval.id}
          AND receipt.received_at >= ${periodStartedAt}
          AND receipt.received_at < ${periodEndedAt}) AS receipt_count,
      (SELECT count(*)::integer FROM copyright_territorial_decisions statement
        JOIN copyright_territorial_notice_receipts receipt
          ON receipt.copyright_notice_id = statement.copyright_notice_id
          AND receipt.jurisdiction = statement.jurisdiction
        WHERE statement.jurisdiction = ${JURISDICTION}
          AND receipt.copyright_territorial_policy_approval_id = ${approval.id}
          AND statement.decided_at >= ${periodStartedAt}
          AND statement.decided_at < ${periodEndedAt}) AS statement_of_reasons_count,
      (SELECT count(*)::integer FROM copyright_territorial_redress_requests redress
        JOIN copyright_territorial_notice_receipts receipt
          ON receipt.copyright_notice_id = redress.copyright_notice_id
          AND receipt.jurisdiction = redress.jurisdiction
        WHERE redress.jurisdiction = ${JURISDICTION}
          AND receipt.copyright_territorial_policy_approval_id = ${approval.id}
          AND redress.received_at >= ${periodStartedAt}
          AND redress.received_at < ${periodEndedAt}) AS redress_request_count,
      (SELECT count(*)::integer FROM copyright_territorial_redress_decisions decision
        JOIN copyright_territorial_redress_requests redress
          ON redress.id = decision.copyright_territorial_redress_request_id
        JOIN copyright_territorial_notice_receipts receipt
          ON receipt.copyright_notice_id = redress.copyright_notice_id
          AND receipt.jurisdiction = redress.jurisdiction
        WHERE redress.jurisdiction = ${JURISDICTION}
          AND receipt.copyright_territorial_policy_approval_id = ${approval.id}
          AND decision.decided_at >= ${periodStartedAt}
          AND decision.decided_at < ${periodEndedAt}) AS redress_decision_count,
      (SELECT count(*)::integer FROM copyright_eu_supervised_complaints complaint
        JOIN copyright_territorial_notice_receipts receipt
          ON receipt.copyright_notice_id = complaint.copyright_notice_id
          AND receipt.jurisdiction = complaint.jurisdiction
        WHERE complaint.jurisdiction = ${JURISDICTION}
          AND receipt.copyright_territorial_policy_approval_id = ${approval.id}
          AND complaint.received_at >= ${periodStartedAt}
          AND complaint.received_at < ${periodEndedAt}) AS supervised_complaint_count,
      (SELECT count(*)::integer FROM copyright_territorial_escalations escalation
        JOIN copyright_territorial_notice_receipts receipt
          ON receipt.copyright_notice_id = escalation.copyright_notice_id
          AND receipt.jurisdiction = escalation.jurisdiction
        WHERE escalation.jurisdiction = ${JURISDICTION}
          AND receipt.copyright_territorial_policy_approval_id = ${approval.id}
          AND escalation.escalated_at >= ${periodStartedAt}
          AND escalation.escalated_at < ${periodEndedAt}) AS escalation_count
  `)
  const count = counts[0]
  assert(count, 500, 'Failed to count EU copyright facts')
  const { rows } = await transaction<EuCopyrightTransparencyReport>(
    sql`/* compileEuCopyrightTransparencyReport */
    INSERT INTO copyright_eu_transparency_reports (
      jurisdiction, copyright_territorial_policy_approval_id, period_started_at, period_ended_at,
      receipt_count, statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, reported_by_id
    ) VALUES (
      ${JURISDICTION}, ${approval.id}, ${periodStartedAt}, ${periodEndedAt}, ${count.receipt_count},
      ${count.statement_of_reasons_count}, ${count.redress_request_count},
      ${count.redress_decision_count}, ${count.supervised_complaint_count},
      ${count.escalation_count}, ${actor.id}
    )
    RETURNING id, period_started_at, period_ended_at, receipt_count, statement_of_reasons_count,
      redress_request_count, redress_decision_count, supervised_complaint_count, escalation_count
  `,
  )
  const report = rows[0]
  assert(report, 500, 'Failed to record EU transparency report')
  await transaction.commit()
  return report
}
