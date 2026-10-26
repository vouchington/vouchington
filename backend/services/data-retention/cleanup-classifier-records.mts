/* oxlint-disable react-doctor/async-parallel -- child rows, run payloads, calls, and batches retire in FK order. */
import type { OwnedTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { followsCompletedClassifierRun } from '@services/classifier-run-revival'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { sweepClassifierChildren } from './cleanup-classifier-children.mts'
import {
  deleteOldClassifierBatches,
  deleteOldClassifierCalls,
} from './cleanup-classifier-decisions.mts'
import { sweepClassifierPages } from './cleanup-classifier-pages.mts'
import { sweepClassifierVersionedIdentities } from './cleanup-classifier-identity-versions.mts'

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
  identities: CleanupCount
}

/**
 * Expire terminal run payloads after bounded child sweeps. Promptless identities retire with their
 * removed run in the same transaction. Versioned cache identities retire after a newer activated
 * prompt version exists or the real subject is deleted; pending run payloads keep their identity.
 * Decision calls and batches retire only after operator-owned result partitions are gone.
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
  // ast-grep-ignore: no-three-sequential-awaits -- runs, calls, and batches retire in FK order, each bounded phase commits before its dependent phase
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
  const deletedSubjects = await sweepClassifierPages(
    'identities',
    getMinUUIDv7ForDate(options.now ?? new Date()),
    lowerBoundId,
    batchSize,
    maxBatches,
    deleteDeletedSubjectClassifierIdentities,
  )
  const oldVersions = await sweepClassifierVersionedIdentities(
    getMinUUIDv7ForDate(options.now ?? new Date()),
    lowerBoundId,
    batchSize,
    maxBatches,
  )
  const identities = {
    scanned: deletedSubjects.scanned + oldVersions.scanned,
    deleted: deletedSubjects.deleted + oldVersions.deleted,
    hasMore: deletedSubjects.hasMore || oldVersions.hasMore,
  }
  return { runCandidates, agentTopics, localOutcomes, runs, calls, batches, identities }
}

async function deleteDeletedSubjectClassifierIdentities(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rowCount } = await query(sql`/* deleteDeletedSubjectClassifierIdentities */
    DELETE FROM classifier_run_identities identity
    WHERE identity.id = ANY(${[...ids]}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM classifier_runs run WHERE run.id = identity.id)
      AND (
        (identity.post_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM posts post WHERE post.id = identity.post_id
        ))
        OR (identity.rss_feed_item_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM rss_feed_items item WHERE item.id = identity.rss_feed_item_id
        ))
      )`)
  return rowCount ?? 0
}

export async function deleteOldClassifierRuns(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rows: deletedRuns } = await query<{ id: string }>(sql`/* deleteOldClassifierRuns */
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
    RETURNING run.id
  `)
  if (deletedRuns.length > 0) {
    // The C7 request can outlive its completed C6 payload. Retire it only when no other current
    // first-stage completion proves readiness; a later new prompt/content can re-arm it.
    await query(
      sql`/* retireFollowOnRequestsWithoutFirstStage */
      WITH affected AS MATERIALIZED (
        SELECT candidate.id
        FROM classifier_run_identities identity
        JOIN classifiers first_classifier ON first_classifier.id = identity.classifier_id
        JOIN classifiers follow_classifier ON follow_classifier.slug = ${AUTOTAGGER_AGENT_SLUG}
        CROSS JOIN LATERAL (
          SELECT post_request.id FROM classifier_run_requests post_request
          WHERE identity.post_id IS NOT NULL
            AND post_request.classifier_id = follow_classifier.id
            AND post_request.post_id = identity.post_id
            AND post_request.input_sha256 = identity.input_sha256
          UNION ALL
          SELECT item_request.id FROM classifier_run_requests item_request
          WHERE identity.rss_feed_item_id IS NOT NULL
            AND item_request.classifier_id = follow_classifier.id
            AND item_request.rss_feed_item_id = identity.rss_feed_item_id
            AND item_request.input_sha256 = identity.input_sha256
        ) candidate
        WHERE identity.id = ANY(${deletedRuns.map(row => row.id)}::uuid[])
          AND first_classifier.slug = ${TAGGING_CLASSIFIER_SLUG}
      )
      UPDATE classifier_run_requests request
      SET stale_at = clock_timestamp()
      WHERE request.id IN (SELECT id FROM affected)
        AND request.run_settled_at IS NULL AND request.no_work_at IS NULL
        AND request.stale_at IS NULL
        AND NOT `.append(followsCompletedClassifierRun(TAGGING_CLASSIFIER_SLUG)),
    )
    await query(sql`/* deleteRetiredPromptlessClassifierIdentities */
      DELETE FROM classifier_run_identities identity
      WHERE identity.id = ANY(${deletedRuns.map(row => row.id)}::uuid[])
        AND identity.prompt_version_id IS NULL`)
  }
  return deletedRuns.length
}
