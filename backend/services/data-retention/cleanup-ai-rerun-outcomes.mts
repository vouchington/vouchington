import { write } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'

export type AiRerunOutcomeCleanupOptions = {
  batchSize?: number
  maxBatches: number
  retentionDays?: number
  now?: Date
  runIds?: readonly string[]
}

export function cleanupReportJudgementRuns(options: AiRerunOutcomeCleanupOptions) {
  const cutoffId = getMinUuidv7ForDate(
    getRetentionCutoffDate(normalizeRetentionDays(options.retentionDays, 90), options.now),
  )
  return runBoundedBatches(options, batchSize =>
    deleteReportJudgementRunBatch(cutoffId, batchSize, options.runIds),
  )
}

export function cleanupAppealResolutionRuns(options: AiRerunOutcomeCleanupOptions) {
  const cutoffId = getMinUuidv7ForDate(
    getRetentionCutoffDate(normalizeRetentionDays(options.retentionDays, 90), options.now),
  )
  return runBoundedBatches(options, batchSize =>
    deleteAppealResolutionRunBatch(cutoffId, batchSize, options.runIds),
  )
}

export function cleanupReviewDisputeResolutionRuns(options: AiRerunOutcomeCleanupOptions) {
  const cutoffId = getMinUuidv7ForDate(
    getRetentionCutoffDate(normalizeRetentionDays(options.retentionDays, 90), options.now),
  )
  return runBoundedBatches(options, batchSize =>
    deleteReviewDisputeResolutionRunBatch(cutoffId, batchSize, options.runIds),
  )
}

async function deleteReportJudgementRunBatch(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* deleteOldReportJudgementRunBatch */
    WITH candidates AS (
      SELECT id FROM moderation_report_judgement_runs
      WHERE id < ${cutoffId}::uuid`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql`
      ORDER BY id LIMIT ${batchSize}
    )
    DELETE FROM moderation_report_judgement_runs AS run
    WHERE run.id = ANY(ARRAY(SELECT id FROM candidates))
      AND run.id < ${cutoffId}::uuid
    RETURNING run.id`)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}

/**
 * Only terminal runs retire; an active run, the run an appeal last requested, and the run behind
 * its saved draft stay. The references are checked once, in the page query: a terminal run cannot
 * gain one (claims and draft saves need an active run), the foreign keys still refuse it, and a
 * second check in the delete would scan the appeals table.
 */
async function deleteAppealResolutionRunBatch(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* deleteOldAppealResolutionRunBatch */
    WITH candidates AS (
      SELECT id FROM moderation_appeal_resolution_runs
      WHERE id < ${cutoffId}::uuid
        AND (completed_at IS NOT NULL OR failed_at IS NOT NULL OR expired_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM moderation_appeals ma WHERE ma.ai_draft_run_id = moderation_appeal_resolution_runs.id)
        AND NOT EXISTS (SELECT 1 FROM moderation_appeals ma WHERE ma.ai_draft_requested_run_id = moderation_appeal_resolution_runs.id)`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql`
      ORDER BY id LIMIT ${batchSize}
    )
    DELETE FROM moderation_appeal_resolution_runs AS run
    WHERE run.id = ANY(ARRAY(SELECT id FROM candidates))
      AND run.id < ${cutoffId}::uuid
      AND (run.completed_at IS NOT NULL OR run.failed_at IS NOT NULL OR run.expired_at IS NOT NULL)
    RETURNING run.id`)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}

/** Only terminal runs retire; an active run, the run a dispute last requested, and the run behind its saved draft stay. */
async function deleteReviewDisputeResolutionRunBatch(
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* deleteOldReviewDisputeResolutionRunBatch */
    WITH candidates AS (
      SELECT id FROM review_dispute_resolution_runs
      WHERE id < ${cutoffId}::uuid
        AND (completed_at IS NOT NULL OR failed_at IS NOT NULL OR expired_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM review_disputes rd WHERE rd.ai_draft_run_id = review_dispute_resolution_runs.id)
        AND NOT EXISTS (SELECT 1 FROM review_disputes rd WHERE rd.ai_draft_requested_run_id = review_dispute_resolution_runs.id)`
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql`
      ORDER BY id LIMIT ${batchSize}
    )
    DELETE FROM review_dispute_resolution_runs AS run
    WHERE run.id = ANY(ARRAY(SELECT id FROM candidates))
      AND run.id < ${cutoffId}::uuid
      AND (run.completed_at IS NOT NULL OR run.failed_at IS NOT NULL OR run.expired_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM review_disputes rd WHERE rd.ai_draft_run_id = run.id)
      AND NOT EXISTS (SELECT 1 FROM review_disputes rd WHERE rd.ai_draft_requested_run_id = run.id)
    RETURNING run.id`)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}
