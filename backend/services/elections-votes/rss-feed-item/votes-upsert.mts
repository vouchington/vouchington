import { enqueueBulkUpdateRssFeedItemElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import type { ElectionVoteMutationResult, ElectionVoteScore } from '../shared/index.mts'
import { upsertElectionVotesShared } from '../shared/vote-upsert.mts'
import { RSS_FEED_ITEM_ELECTION_CONFIG } from './config.mts'

export async function upsertRssFeedItemElectionVotes(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
): Promise<ElectionVoteMutationResult[]> {
  const insertedVotes = await upsertElectionVotesShared(
    RSS_FEED_ITEM_ELECTION_CONFIG,
    userId,
    votes,
  )
  if (votes.length > 0) {
    void enqueueBulkUpdateRssFeedItemElectionVoteStats([
      ...new Set(votes.map(vote => vote.entityId)),
    ])
  }
  return insertedVotes
}
