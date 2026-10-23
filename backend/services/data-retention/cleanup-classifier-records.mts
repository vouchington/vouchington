/* oxlint-disable react-doctor/async-parallel -- child rows, run payloads, calls, and batches retire in FK order. */
import type { OwnedTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { sweepClassifierChildren } from './cleanup-classifier-children.mts'
import {
  deleteOldClassifierBatches,
  deleteOldClassifierCalls,
} from './cleanup-classifier-decisions.mts'
import { sweepClassifierPages } from './cleanup-classifier-pages.mts'

type CleanupCount = { deleted: number; hasMore: boolean; scanned: number }
type ClassifierCleanupOptions = {
  retentionDays: number
  batchSize: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
}

export type ClassifierCleanupResult = {
  runCandidates: CleanupCount
  agentTopics: CleanupCount
  localOutcomes: CleanupCount
  runs: CleanupCount
  calls: CleanupCount
  batches: CleanupCount
}

/**
 * Expire terminal run payloads after bounded child sweeps. Request and run identity rows survive
 * indefinitely for recovery and exact deduplication; usage ledger links target the identity.
 * Decision calls and batches are deleted only after operator-owned result partitions are gone.
 */
export async function cleanupClassifierRecords(
  options: ClassifierCleanupOptions,
): Promise<ClassifierCleanupResult> {
  const cutoffId = getMinUUIDv7ForDate(getRetentionCutoffDate(options.retentionDays, options.now))
  const lowerBoundId = getMinUUIDv7ForDate(options.lowerBoundDate ?? new Date(0))
  const { batchSize, maxBatches } = options
  const [runCandidates, agentTopics, localOutcomes] = await Promise.all([
    sweepClassifierChildren('run_candidates', cutoffId, lowerBoundId, batchSize, maxBatches),
    sweepClassifierChildren('agent_topics', cutoffId, lowerBoundId, batchSize, maxBatches),
    sweepClassifierChildren('local_outcomes', cutoffId, lowerBoundId, batchSize, maxBatches),
  ])
  const runs = await sweepClassifierPages(
    'runs',
    cutoffId,
    lowerBoundId,
    batchSize,
    maxBatches,
    deleteOldClassifierRuns,
  )
  const calls = await sweepClassifierPages(
    'calls',
    cutoffId,
    lowerBoundId,
    batchSize,
    maxBatches,
    deleteOldClassifierCalls,
  )
  const batches = await sweepClassifierPages(
    'batches',
    cutoffId,
    lowerBoundId,
    batchSize,
    maxBatches,
    deleteOldClassifierBatches,
  )
  return { runCandidates, agentTopics, localOutcomes, runs, calls, batches }
}

async function deleteOldClassifierRuns(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rowCount } = await query(sql`/* deleteOldClassifierRuns */
    DELETE FROM classifier_runs run
    WHERE run.id = ANY(${[...ids]}::uuid[])
      AND (run.completed_at IS NOT NULL OR run.superseded_at IS NOT NULL
        OR run.terminal_failed_at IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM classifier_run_candidates candidate WHERE candidate.run_id = run.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM autotagger_agent_run_topics topic WHERE topic.run_id = run.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM post_classifier_local_outcomes outcome WHERE outcome.run_id = run.id
      )
  `)
  return rowCount ?? 0
}
