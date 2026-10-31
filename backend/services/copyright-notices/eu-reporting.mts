import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import createHttpError from 'http-errors'
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
import { lockEuCopyrightTransparencySources } from './eu-reporting-lock.mts'

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
  // Writers may take these tables in inverse order. A failed partial attempt releases every
  // acquired lock before waiting for one source, then retries the whole fence.
  await lockEuCopyrightTransparencySources(transaction)
  const [counts, noticeFigures, complaintFigures] = await Promise.all([
    readExistingEuCounts(periodStartedAt, periodEndedAt, undefined, transaction),
    readDsaCopyrightNoticeFigures(periodStartedAt, periodEndedAt, undefined, transaction),
    readDsaCopyrightComplaintFigures(periodStartedAt, periodEndedAt, undefined, transaction),
  ])
  const figures: DsaCopyrightTransparencyFigures = {
    period_start: periodStartedAt.toISOString(),
    period_end: periodEndedAt.toISOString(),
    generated_at: new Date().toISOString(),
    ...counts,
    ...noticeFigures,
    ...complaintFigures,
  }
  let rows: EuCopyrightTransparencyReport[]
  try {
    rows = (
      await transaction<EuCopyrightTransparencyReport>(sql`
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
    ).rows
  } catch (err) {
    if (typeof err !== 'object' || err === null || !('code' in err) || err.code !== '40001')
      throw err
    // Repeatable Read cannot see the winner after an ON CONFLICT serialization failure.
    // Leave this owned transaction before reading the immutable report in a new snapshot.
    await transaction.rollback()
    const published = await readStoredEuReport(periodStartedAt, periodEndedAt)
    if (published) return published
    throw createHttpError(503, 'EU report publication is busy', { cause: err })
  }
  const report = rows[0] ?? (await readStoredEuReport(periodStartedAt, periodEndedAt, transaction))
  assert(report, 500, 'Failed to record EU transparency report')
  await transaction.commit()
  return report
}
