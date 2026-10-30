import { beginBoundedTransaction } from '@data-stores/psql'
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

import { EU_REPORT_FACTS, readEuCopyrightCounts, type EuCounts } from './eu-reporting-counts.mts'

const JURISDICTION = 'eu_dsa'

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
  const [counts, noticeFigures, complaintFigures] = await Promise.all([
    readEuCopyrightCounts(periodStartedAt, periodEndedAt, noticeIds),
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

/** Cumulative immutable snapshots retain reported counts after source cases are purged. */
export async function compileEuCopyrightTransparencyReport(
  actor: PrivateUser,
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<EuCopyrightTransparencyReport> {
  assert(currentUserCanReviewCopyrightNotices(actor), 403, 'Forbidden')
  await assertCopyrightDsaTransparencyReportsEnabled()
  assertReportingPeriod(periodStartedAt, periodEndedAt)
  // Necessary six-count global aggregate: the existing synchronous protocol publishes only
  // complete snapshots. Database deadlines bound both admission and every aggregate statement.
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  const { rows: generations } = await transaction<{ transparency_generation: string }>(sql`
    /* compileEuCopyrightTransparencyReportGeneration */
    SELECT transparency_generation FROM copyright_legal_mutation_sequence_states
    WHERE is_singleton FOR UPDATE`)
  const generation = generations[0]?.transparency_generation
  assert(generation !== undefined, 500, 'Missing copyright report generation')
  const { rows: previous } = await transaction<
    EuCounts & { id: string; source_generation: string }
  >(sql`
    /* compileEuCopyrightTransparencyReportPrevious */
    SELECT id, source_generation, receipt_count, statement_of_reasons_count,
      redress_request_count, redress_decision_count, supervised_complaint_count, escalation_count
    FROM copyright_eu_transparency_reports
    WHERE period_started_at = ${periodStartedAt} AND period_ended_at = ${periodEndedAt}
    ORDER BY source_generation DESC, id DESC LIMIT 1`)
  const prior = previous[0]
  // A different covering report can authorize retirement without making this exact-period
  // baseline complete. Extend it only when it already contains every retired generation.
  const { rows: erased } = await transaction(sql`
    /* compileEuCopyrightTransparencyReportErasedSource */
    SELECT 1 FROM copyright_transparency_erased_source_ranges
    WHERE is_singleton AND earliest_at < ${periodEndedAt} AND latest_at >= ${periodStartedAt}
      AND (${prior?.source_generation ?? null}::bigint IS NULL
        OR retired_source_generation > ${prior?.source_generation ?? null}::bigint) LIMIT 1`)
  assert(
    !erased.length,
    409,
    'Source history for this period has expired; use a previously reported exact period containing all retired facts',
  )
  const counts = await readEuCopyrightCounts(
    periodStartedAt,
    periodEndedAt,
    undefined,
    transaction,
    {
      after: prior?.source_generation ?? null,
      through: generation,
    },
  )
  for (const fact of EU_REPORT_FACTS) counts[fact.count] += prior?.[fact.count] ?? 0
  const method = {
    version: 2,
    jurisdiction: JURISDICTION,
    interval: 'start-inclusive-end-exclusive-UTC',
    population:
      'immutable admission facts, cumulative exact-period baseline plus later committed generations',
    facts: EU_REPORT_FACTS,
    sourceGeneration: generation,
    previousGeneration: prior?.source_generation ?? null,
  }
  const { rows } = await transaction<EuCopyrightTransparencyReport>(sql`
    /* compileEuCopyrightTransparencyReport */
    INSERT INTO copyright_eu_transparency_reports (
      jurisdiction, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count, method_snapshot,
      previous_report_id, source_generation
    ) VALUES (
      ${JURISDICTION}, ${periodStartedAt}, ${periodEndedAt}, ${counts.receipt_count},
      ${counts.statement_of_reasons_count}, ${counts.redress_request_count},
      ${counts.redress_decision_count}, ${counts.supervised_complaint_count},
      ${counts.escalation_count}, ${JSON.stringify(method)}::jsonb,
      ${prior?.id ?? null}, ${generation}
    ) RETURNING id, period_started_at, period_ended_at, receipt_count,
      statement_of_reasons_count, redress_request_count, redress_decision_count,
      supervised_complaint_count, escalation_count
  `)
  const report = rows[0]
  assert(report, 500, 'Failed to record EU transparency report')
  await transaction.commit()
  return report
}
