import type { DataRetentionLimits } from './config.mts'
import { cleanupSupersededVoteBallots } from './cleanup-vote-ballots.mts'
import { cleanupOrphanedUserAgentStrings } from './cleanup-user-agent-strings.mts'
import { cleanupVoteIntegrityDetails } from './cleanup-vote-integrity-details.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export type VoteRetentionSelection = {
  voteTables: readonly string[]
  userAgentStrings: boolean
  voteIntegrityDetails: boolean
}

export type VoteRetentionCleanupOptions = {
  voteIdsByTable?: Readonly<Record<string, readonly string[]>>
  userAgentStringIds?: readonly string[]
  voteIntegrityFlagIds?: readonly string[]
  batchSize?: number
  now?: Date
}

type VoteRetentionPage = Pick<
  DataRetentionCleanupResult,
  'supersededVoteBallots' | 'orphanedUserAgentStrings' | 'voteIntegrityDetails'
>

/** Continue only families that reported another page in the previous job. */
export async function runVoteRetentionCleanupPage(
  limits: DataRetentionLimits,
  selection: VoteRetentionSelection,
  options: VoteRetentionCleanupOptions = {},
): Promise<VoteRetentionPage> {
  const now = options.now ?? new Date()
  const batchSize = options.batchSize ?? limits.batchSize
  const supersededVoteBallots = await cleanupSupersededVoteBallots(
    batchSize,
    now,
    options.voteIdsByTable,
    selection.voteTables,
  )
  const orphanedUserAgentStrings = selection.userAgentStrings
    ? await cleanupOrphanedUserAgentStrings(batchSize, options.userAgentStringIds, options.now)
    : { scanned: 0, deleted: 0, hasMore: false }
  const voteIntegrityDetails = selection.voteIntegrityDetails
    ? await cleanupVoteIntegrityDetails(batchSize, now, options.voteIntegrityFlagIds)
    : { scanned: 0, redacted: 0, hasMore: false }
  return { supersededVoteBallots, orphanedUserAgentStrings, voteIntegrityDetails }
}
