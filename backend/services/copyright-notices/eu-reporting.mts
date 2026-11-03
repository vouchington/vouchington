import { beginTransaction, write } from '@data-stores/psql'
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
const CLOSED_PERIOD_GRACE_MS = 24 * 60 * 60 * 1000
const REPORT_METHOD = {
  version: 1,
  jurisdiction: JURISDICTION,
  scope: 'all_notices',
  eu_counts_jurisdiction: JURISDICTION,
  notice_export_jurisdictions: [...DSA_COPYRIGHT_NOTICE_JURISDICTIONS],
  complaint_export_jurisdiction: JURISDICTION,
  interval: 'start_inclusive_end_exclusive',
  counted_at: 'when Voucha recorded the fact, from its UUIDv7 id',
  sources: {
    receipt_count: 'copyright_territorial_notice_receipts.id',
    statement_of_reasons_count: 'copyright_territorial_decisions.id',
    redress_request_count: 'copyright_territorial_redress_requests.id',
    redress_decision_count: 'copyright_territorial_redress_decisions.id',
    supervised_complaint_count: 'copyright_eu_supervised_complaints.id',
    escalation_count: 'copyright_territorial_escalations.id',
    notice_export: 'copyright_notices.id and copyright_restrictions.id',
    complaint_export:
      'copyright_territorial_redress_requests.id and current_staff_decision_identity_id',
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
  assert(
    periodEndedAt.getTime() + CLOSED_PERIOD_GRACE_MS <= Date.now(),
    422,
    'Reporting period has not been closed for a full day',
  )
  const existing = await readStoredEuReport(periodStartedAt, periodEndedAt)
  if (existing) return existing
  await using transaction = await beginTransaction()
  // Every figure uses one snapshot. Facts count by when Voucha recorded them, so late rows
  // land in a later period and a closed period never changes.
  await transaction(sql`/* consistentEuCopyrightTransparencySnapshot */
    SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`)
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
    ) ON CONFLICT ON CONSTRAINT uq_copyright_eu_transparency_reports__period DO NOTHING
    RETURNING id, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count
  `)
    ).rows
  } catch (err) {
    if (typeof err !== 'object' || err === null || !('code' in err) || err.code !== '40001')
      throw err
    // Repeatable Read raises this when the winner committed after our snapshot.
    rows = []
  }
  const inserted = rows[0]
  if (inserted) {
    await transaction.commit()
    return inserted
  }
  // A concurrent compiler won; the snapshot cannot see its row, so read it in a new one.
  await transaction.rollback()
  const published = await readStoredEuReport(periodStartedAt, periodEndedAt, write)
  assert(published, 500, 'Failed to record EU transparency report')
  return published
}
