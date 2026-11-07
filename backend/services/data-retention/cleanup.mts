/* oxlint-disable react-doctor/async-parallel -- retention phases stay in dependent cleanup order. */
import {
  cleanupObsoleteAgentModerations,
  type AgentModerationCleanupContinuation,
  type AgentModerationCleanupResult,
  type AgentModerationRetentionOptions,
} from './cleanup-agent-moderations.mts'
import { applyRetentionLimits } from './cleanup-options.mts'
import { getTopicImportAttemptDeletionBatchSize, type DataRetentionLimits } from './config.mts'
import type { DataRetentionCleanupOptions } from './cleanup-run-options.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'
import { cleanupExpiredAccountFamilies } from './cleanup-expired-account-families.mts'
import { cleanupMembershipAuthFamilies } from './cleanup-membership-auth-families.mts'
import { cleanupModerationEmbeddingFamilies } from './cleanup-moderation-embedding-families.mts'
import { cleanupClassifierVoteFamilies } from './cleanup-classifier-vote-families.mts'
import { cleanupTerminalRetentionFamilies } from './cleanup-terminal-retention-families.mts'
import { cleanupHackerNewsReferences } from './cleanup-hacker-news.mts'

export { cleanupObsoleteAgentModerations }
export type { AgentModerationRetentionOptions }

export function runAgentModerationRetentionCleanupPage(
  limits: DataRetentionLimits,
  continuation: AgentModerationCleanupContinuation,
  options: AgentModerationRetentionOptions = {},
): Promise<AgentModerationCleanupResult> {
  const overrides = { ...options, continuation }
  return cleanupObsoleteAgentModerations(applyRetentionLimits(limits, overrides))
}

export async function runDataRetentionCleanup(
  limits: DataRetentionLimits,
  options: DataRetentionCleanupOptions = {},
): Promise<DataRetentionCleanupResult> {
  // Topic-import attempts keep their own small batch (each row can retain a 4 MiB response), so the
  // shared batch size can only lower it.
  const topicImportLimits = {
    ...limits,
    batchSize: Math.min(limits.batchSize, getTopicImportAttemptDeletionBatchSize()),
  }
  const retainedPageSize = Math.min(limits.batchSize, 1_000)
  const hackerNewsActive =
    options.families === undefined || options.families.includes('hackerNewsReferences')
  const hackerNewsReferences = hackerNewsActive
    ? await cleanupHackerNewsReferences()
    : { deleted: 0, hasMore: false }
  // ast-grep-ignore: no-three-sequential-awaits -- retention phases stay in dependent cleanup order
  const account = await cleanupExpiredAccountFamilies(limits, options, topicImportLimits)
  const membership = await cleanupMembershipAuthFamilies(limits, options)
  const moderation = await cleanupModerationEmbeddingFamilies(limits, options)
  const classifier = await cleanupClassifierVoteFamilies(limits, options)
  const terminal = await cleanupTerminalRetentionFamilies(limits, options, retainedPageSize)
  return {
    hackerNewsReferences,
    ...terminal,
    ...account,
    ...membership,
    ...moderation,
    ...classifier,
  }
}
