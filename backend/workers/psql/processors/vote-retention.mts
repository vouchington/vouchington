import { enqueueDataRetentionContinuation } from '@queues/psql/enqueues'
import type { VoteRetentionContinuationData } from '@queues/psql/types'
import type { runVoteRetentionCleanupPage } from '@services/data-retention'

type VoteRetentionResult = Awaited<ReturnType<typeof runVoteRetentionCleanupPage>>

export async function enqueueVoteRetentionContinuationIfNeeded(
  result: VoteRetentionResult,
  jobId: string | undefined,
  enqueue: typeof enqueueDataRetentionContinuation = enqueueDataRetentionContinuation,
): Promise<void> {
  const next: VoteRetentionContinuationData = {
    voteTables: result.supersededVoteBallots.flatMap(page =>
      page.hasMore ? [page.voteTable] : [],
    ),
    userAgentStrings: result.orphanedUserAgentStrings.hasMore,
    voteIntegrityDetails: result.voteIntegrityDetails.hasMore,
  }
  if (next.voteTables.length === 0 && !next.userAgentStrings && !next.voteIntegrityDetails) return
  if (!jobId) throw new Error('vote retention job requires an id for continuation')
  await enqueue(jobId, next)
}

export function requireVoteRetentionSelection(
  data: Partial<VoteRetentionContinuationData> | undefined,
): VoteRetentionContinuationData {
  if (
    !data ||
    !Array.isArray(data.voteTables) ||
    typeof data.userAgentStrings !== 'boolean' ||
    typeof data.voteIntegrityDetails !== 'boolean'
  ) {
    throw new Error('continueVoteRetentionCleanup job requires family selection')
  }
  return data as VoteRetentionContinuationData
}
