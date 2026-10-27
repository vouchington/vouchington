import type { OwnedTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { sweepClassifierChildren } from './cleanup-classifier-children.mts'
import { cleanupClassifierDecisionRecords } from './cleanup-classifier-decision-records.mts'
import { deleteOldClassifierRuns } from './cleanup-classifier-runs.mts'
import { deleteDeletedSubjectClassifierRequests } from './cleanup-classifier-requests.mts'
import { sweepClassifierPages } from './cleanup-classifier-pages.mts'
import { sweepClassifierVersionedIdentities } from './cleanup-classifier-identity-versions.mts'

type CleanupCount = { deleted: number; hasMore: boolean; scanned: number }
type ClassifierCleanupOptions = {
  retentionDays: number
  batchSize: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  activeSweeps?: readonly string[]
}

export type ClassifierCleanupResult = {
  runCandidates: CleanupCount
  agentTopics: CleanupCount
  localOutcomes: CleanupCount
  runs: CleanupCount
  topicResults: CleanupCount
  storyResults: CleanupCount
  communityPromptResults: CleanupCount
  decisionCandidates: CleanupCount
  calls: CleanupCount
  batches: CleanupCount
  requests: CleanupCount
  deletedSubjectIdentities: CleanupCount
  versionedIdentities: CleanupCount
  identities: CleanupCount
}

/**
 * Expire terminal run payloads after bounded child sweeps. Promptless identities retire with their
 * removed run in the same transaction. Versioned cache identities retire when a newer prompt version is
 * currently active, a newer identity exists for the same subject, the real subject is deleted, or
 * their payload was superseded before completing; pending run payloads keep their identity.
 * Attached result ranges retire by operator action; expired DEFAULT rows retire in bounded pages
 * before their candidate snapshots, calls, and batches. Deleted-subject requests retire before
 * their retained identity roots.
 */
export async function cleanupClassifierRecords(
  options: ClassifierCleanupOptions,
): Promise<ClassifierCleanupResult> {
  const cutoffId = getMinUUIDv7ForDate(getRetentionCutoffDate(options.retentionDays, options.now))
  const lowerBoundId = getMinUUIDv7ForDate(options.lowerBoundDate ?? new Date(0))
  const { batchSize, maxBatches } = options
  const active = (sweep: keyof ClassifierCleanupResult) =>
    options.activeSweeps === undefined || options.activeSweeps.includes(sweep)
  const skip = { scanned: 0, deleted: 0, hasMore: false }
  const [runCandidates, agentTopics, localOutcomes] = await Promise.all([
    active('runCandidates')
      ? sweepClassifierChildren('run_candidates', cutoffId, lowerBoundId, batchSize, maxBatches)
      : skip,
    active('agentTopics')
      ? sweepClassifierChildren('agent_topics', cutoffId, lowerBoundId, batchSize, maxBatches)
      : skip,
    active('localOutcomes')
      ? sweepClassifierChildren('local_outcomes', cutoffId, lowerBoundId, batchSize, maxBatches)
      : skip,
  ])
  // ast-grep-ignore: no-three-sequential-awaits -- runs, calls, and batches retire in FK order, each bounded phase commits before its dependent phase
  const runs = active('runs')
    ? await sweepClassifierPages(
        'runs',
        cutoffId,
        lowerBoundId,
        batchSize,
        maxBatches,
        deleteOldClassifierRuns,
      )
    : skip
  const decisions = await cleanupClassifierDecisionRecords(
    cutoffId,
    lowerBoundId,
    batchSize,
    maxBatches,
    options.activeSweeps,
  )
  const requests = active('requests')
    ? await sweepClassifierPages(
        'requests',
        getMinUUIDv7ForDate(options.now ?? new Date()),
        lowerBoundId,
        batchSize,
        maxBatches,
        deleteDeletedSubjectClassifierRequests,
      )
    : skip
  const deletedSubjects = active('deletedSubjectIdentities')
    ? await sweepClassifierPages(
        'identities',
        getMinUUIDv7ForDate(options.now ?? new Date()),
        lowerBoundId,
        batchSize,
        maxBatches,
        deleteDeletedSubjectClassifierIdentities,
      )
    : skip
  const oldVersions = active('versionedIdentities')
    ? await sweepClassifierVersionedIdentities(
        getMinUUIDv7ForDate(options.now ?? new Date()),
        lowerBoundId,
        batchSize,
        maxBatches,
      )
    : skip
  const identities = {
    scanned: deletedSubjects.scanned + oldVersions.scanned,
    deleted: deletedSubjects.deleted + oldVersions.deleted,
    hasMore: deletedSubjects.hasMore || oldVersions.hasMore,
  }
  return {
    runCandidates,
    agentTopics,
    localOutcomes,
    runs,
    ...decisions,
    requests,
    deletedSubjectIdentities: deletedSubjects,
    versionedIdentities: oldVersions,
    identities,
  }
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
