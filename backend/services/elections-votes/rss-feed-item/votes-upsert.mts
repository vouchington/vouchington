import { enqueueBulkUpdateRssFeedItemElectionVoteStats } from '@queues/elections/enqueues'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  VoteEventContext,
} from '../shared/index.mts'
import { upsertElectionVotesShared } from '../shared/vote-upsert.mts'
import { RSS_FEED_ITEM_ELECTION_CONFIG } from './config.mts'

const NULL_VOTE_CONTEXT: VoteEventContext = {
  ipAddress: null,
  deviceId: null,
  sessionId: null,
  userAgent: null,
}

export async function upsertRssFeedItemElectionVotes(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  context: VoteEventContext = NULL_VOTE_CONTEXT,
): Promise<ElectionVoteMutationResult[]> {
  const insertedVotes = await upsertElectionVotesShared(
    RSS_FEED_ITEM_ELECTION_CONFIG,
    userId,
    votes,
    context,
  )
  if (votes.length > 0) {
    void enqueueBulkUpdateRssFeedItemElectionVoteStats([
      ...new Set(votes.map(vote => vote.entityId)),
    ])
  }
  return insertedVotes
}
