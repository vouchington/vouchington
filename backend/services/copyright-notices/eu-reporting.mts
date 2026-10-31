import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertCopyrightDsaTransparencyReportsEnabled } from './eu-reporting-gate.mts'
import { readDsaCopyrightComplaintFigures } from './eu-reporting-complaints.mts'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'
import { DSA_COPYRIGHT_NOTICE_JURISDICTIONS } from './eu-reporting-population.mts'
import {
  readExistingEuCounts,
  readStoredEuReport,
  type DsaCopyrightTransparencyFigures,
  type EuCopyrightTransparencyReport,
} from './eu-reporting-counts.mts'
import { assertReportingPeriod } from './territorial-fields.mts'

export type {
  DsaCopyrightTransparencyFigures,
  EuCopyrightTransparencyReport,
} from './eu-reporting-counts.mts'

const JURISDICTION = 'eu_dsa'
const REPORT_METHOD = {
  version: 1,
  jurisdiction: JURISDICTION,
  scope: 'all_notices',
  eu_counts_jurisdiction: JURISDICTION,
  notice_export_jurisdictions: [...DSA_COPYRIGHT_NOTICE_JURISDICTIONS],
  complaint_export_jurisdiction: JURISDICTION,
  interval: 'start_inclusive_end_exclusive',
  sources: {
    receipt_count: 'copyright_territorial_notice_receipts.received_at',
    statement_of_reasons_count: 'copyright_territorial_decisions.decided_at',
    redress_request_count: 'copyright_territorial_redress_requests.received_at',
    redress_decision_count: 'copyright_territorial_redress_decisions.decided_at',
    supervised_complaint_count: 'copyright_eu_supervised_complaints.received_at',
    escalation_count: 'copyright_territorial_escalations.escalated_at',
    notice_export: 'copyright_notices.received_at and copyright_restrictions.imposed_at',
    complaint_export: 'copyright_territorial_redress_requests.received_at and decided_at',
  },
} as const

/** Read-only, aggregate-only export across all EU approval periods. */
export async function readEuCopyrightTransparencyFigures(
  actor: PrivateUser,
  periodStartedAt: Date,
  periodEndedAt: Date,
  noticeIds?: readonly string[],
): Promise<DsaCopyrightTransparencyFigures> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  await assertCopyrightDsaTransparencyReportsEnabled()
  assertReportingPeriod(periodStartedAt, periodEndedAt)
  if (noticeIds === undefined) {
    const stored = await readStoredEuReport(periodStartedAt, periodEndedAt)
    if (stored) return stored.figures_snapshot
  }
  const [counts, noticeFigures, complaintFigures] = await Promise.all([
    readExistingEuCounts(periodStartedAt, periodEndedAt, noticeIds),
    readDsaCopyrightNoticeFigures(periodStartedAt, periodEndedAt, noticeIds),
    readDsaCopyrightComplaintFigures(periodStartedAt, periodEndedAt, noticeIds),
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

/** Store one immutable global snapshot of a closed period. */
export async function compileEuCopyrightTransparencyReport(
  actor: PrivateUser,
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<EuCopyrightTransparencyReport> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  await assertCopyrightDsaTransparencyReportsEnabled()
  assertReportingPeriod(periodStartedAt, periodEndedAt)
  assert(periodEndedAt <= new Date(), 422, 'Reporting period has not ended')
  const existing = await readStoredEuReport(periodStartedAt, periodEndedAt)
  if (existing) return existing
  await using transaction = await beginTransaction()
  // Every figure uses one snapshot, including the notice, restriction and derived inputs that
  // the count-source locks below do not themselves fence.
  await transaction(sql`/* consistentEuCopyrightTransparencySnapshot */
    SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`)
  // The global figures also read notices and restrictions. Source writers can reach these
  // tables in either order, so acquire all report locks without waiting; a busy source leaves
  // this report unpublished for a later request instead of deadlocking a legal decision.
  await transaction(sql`/* lockEuCopyrightTransparencySources */
    LOCK TABLE copyright_notices, copyright_restrictions,
      copyright_territorial_decision_identities,
      copyright_territorial_redress_decision_identities,
      copyright_territorial_notice_receipts,
      copyright_territorial_decisions, copyright_territorial_redress_requests,
      copyright_territorial_redress_decisions, copyright_eu_supervised_complaints,
      copyright_territorial_escalations IN SHARE MODE NOWAIT`)
  const counts = await readExistingEuCounts(periodStartedAt, periodEndedAt, undefined, transaction)
  const noticeFigures = await readDsaCopyrightNoticeFigures(
    periodStartedAt,
    periodEndedAt,
    undefined,
    transaction,
  )
  const complaintFigures = await readDsaCopyrightComplaintFigures(
    periodStartedAt,
    periodEndedAt,
    undefined,
    transaction,
  )
  const figures: DsaCopyrightTransparencyFigures = {
    period_start: periodStartedAt.toISOString(),
    period_end: periodEndedAt.toISOString(),
    generated_at: new Date().toISOString(),
    ...counts,
    ...noticeFigures,
    ...complaintFigures,
  }
  const { rows } = await transaction<EuCopyrightTransparencyReport>(sql`
    /* compileEuCopyrightTransparencyReport */
    INSERT INTO copyright_eu_transparency_reports (
      jurisdiction, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, figures_snapshot, method_snapshot,
      reported_at, reported_by_id
    ) VALUES (
      ${JURISDICTION}, ${periodStartedAt}, ${periodEndedAt}, ${counts.receipt_count},
      ${counts.statement_of_reasons_count}, ${counts.redress_request_count},
      ${counts.redress_decision_count}, ${counts.supervised_complaint_count},
      ${counts.escalation_count}, ${JSON.stringify(figures)}::jsonb,
      ${JSON.stringify(REPORT_METHOD)}::jsonb,
      clock_timestamp(), ${actor.id}
    ) ON CONFLICT (period_started_at, period_ended_at) DO NOTHING
    RETURNING id, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count
  `)
  const report = rows[0] ?? (await readStoredEuReport(periodStartedAt, periodEndedAt, transaction))
  assert(report, 500, 'Failed to record EU transparency report')
  await transaction.commit()
  return report
}
