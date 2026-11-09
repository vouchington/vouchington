import {
  cleanupOldModerationMediaReveals,
  cleanupOldModerationQueueClaims,
} from './cleanup-moderation-operations.mts'
import { cleanupPostModerationLedger } from './cleanup-post-moderation-ledger.mts'
import {
  cleanupAppealResolutionRuns,
  cleanupReportJudgementRuns,
} from './cleanup-ai-rerun-outcomes.mts'
import { cleanupObsoleteAgentModerations } from './cleanup-agent-moderations.mts'
import { cleanupTextEmbeddingCache } from './cleanup-text-embeddings.mts'
import { cleanupTerminalEmbeddingBatches } from './cleanup-embedding-batches.mts'
import { cleanupCompletedImportBatches } from './cleanup-import-batches.mts'
import { applyRetentionLimits } from './cleanup-options.mts'
import {
  getPostModerationRetentionDays,
  readDataRetentionField,
  type DataRetentionLimits,
} from './config.mts'
import type { DataRetentionCleanupFamily } from './cleanup-run-family.mts'
import type { DataRetentionCleanupOptions } from './cleanup-run-options.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export async function cleanupModerationEmbeddingFamilies(
  limits: DataRetentionLimits,
  options: DataRetentionCleanupOptions,
): Promise<
  Pick<
    DataRetentionCleanupResult,
    | 'oldModerationQueueClaims'
    | 'reportJudgementRuns'
    | 'appealResolutionRuns'
    | 'oldModerationMediaReveals'
    | 'postModerationLedger'
    | 'agentModerations'
    | 'textEmbeddingCache'
    | 'terminalEmbeddingBatches'
    | 'completedAdminImportBatches'
    | 'completedRssImportBatches'
  >
> {
  const active = (family: DataRetentionCleanupFamily) =>
    options.families === undefined || options.families.includes(family)
  const withLimits = (overrides: { batchSize?: number; maxBatches?: number } | undefined) =>
    applyRetentionLimits(limits, overrides)

  const [
    reportJudgementRuns,
    appealResolutionRuns,
    oldModerationQueueClaims,
    oldModerationMediaReveals,
    postModerationLedger,
    agentModerations,
  ] = await Promise.all([
    active('reportJudgementRuns')
      ? cleanupReportJudgementRuns({
          ...options.reportJudgementRuns,
          ...withLimits(options.reportJudgementRuns),
          retentionDays:
            options.reportJudgementRuns?.retentionDays ??
            readDataRetentionField('ai_rerun_retention_days'),
        })
      : { deleted: 0, hasMore: false },
    active('appealResolutionRuns')
      ? cleanupAppealResolutionRuns({
          ...options.appealResolutionRuns,
          ...withLimits(options.appealResolutionRuns),
          retentionDays:
            options.appealResolutionRuns?.retentionDays ??
            readDataRetentionField('ai_rerun_retention_days'),
        })
      : { deleted: 0, hasMore: false },
    active('oldModerationQueueClaims')
      ? cleanupOldModerationQueueClaims(withLimits(options.oldModerationQueueClaims))
      : { deleted: 0, hasMore: false, cursorId: null },
    active('oldModerationMediaReveals')
      ? cleanupOldModerationMediaReveals(withLimits(options.oldModerationMediaReveals))
      : { deleted: 0, hasMore: false, cursorId: null },
    active('postModerationLedger')
      ? cleanupPostModerationLedger({
          ...withLimits(options.postModerationLedger),
          retentionDays: getPostModerationRetentionDays(),
        })
      : { deletedVersions: 0, clearedPassEvidence: 0, hasMore: false, remainingKinds: [] },
    !active('agentModerations') || options.includeAgentModerations === false
      ? { scanned: 0, deleted: 0, hasMore: false, continuation: null }
      : cleanupObsoleteAgentModerations(withLimits(options.agentModerations)),
  ])
  // Embedding-cache and import-batch cleanups touch separate tables and feed nothing else.
  const [
    textEmbeddingCache,
    terminalEmbeddingBatches,
    completedAdminImportBatches,
    completedRssImportBatches,
  ] = await Promise.all([
    active('textEmbeddingCache')
      ? cleanupTextEmbeddingCache(withLimits(options.textEmbeddingCache))
      : { deleted: 0, hasMore: false, continuation: null },
    active('terminalEmbeddingBatches')
      ? cleanupTerminalEmbeddingBatches(withLimits(options.terminalEmbeddingBatches))
      : { deleted: 0, hasMore: false, continuation: null },
    active('completedAdminImportBatches')
      ? cleanupCompletedImportBatches('admin', withLimits(options.completedAdminImportBatches))
      : { deleted: 0, hasMore: false, continuation: null },
    active('completedRssImportBatches')
      ? cleanupCompletedImportBatches('rss', withLimits(options.completedRssImportBatches))
      : { deleted: 0, hasMore: false, continuation: null },
  ])
  return {
    reportJudgementRuns,
    appealResolutionRuns,
    oldModerationQueueClaims,
    oldModerationMediaReveals,
    postModerationLedger,
    agentModerations,
    textEmbeddingCache,
    terminalEmbeddingBatches,
    completedAdminImportBatches,
    completedRssImportBatches,
  }
}
