import {
  createVoteGetByUser,
  createVotesGetByElectionId,
  createVotesGetByUser,
  createVotesGetByUserForEntity,
} from '../shared/entity-service.mts'
import { RSS_FEED_ITEM_ELECTION_CONFIG } from './config.mts'

export const getRssFeedItemElectionVotesByUser = createVotesGetByUser<'sentiment'>(
  RSS_FEED_ITEM_ELECTION_CONFIG,
)
export const getRssFeedItemElectionVote = createVoteGetByUser<'sentiment'>(
  RSS_FEED_ITEM_ELECTION_CONFIG,
)
export const getRssFeedItemElectionVotesByElectionId = createVotesGetByElectionId<'sentiment'>(
  RSS_FEED_ITEM_ELECTION_CONFIG,
)
export const getRssFeedItemElectionVotesByUserForEntity =
  createVotesGetByUserForEntity<'sentiment'>(RSS_FEED_ITEM_ELECTION_CONFIG)
