import {
  createVoteGetByUser,
  createVotesGetByElectionId,
  createVotesGetByUser,
  createVotesGetByUserForEntity,
} from '../shared/entity-service.mts'
import { POST_ELECTION_CONFIG } from './config.mts'

export const getPostElectionVotesByUser = createVotesGetByUser<'sentiment' | 'recommendation'>(
  POST_ELECTION_CONFIG,
)
export const getPostElectionVote = createVoteGetByUser<'sentiment' | 'recommendation'>(
  POST_ELECTION_CONFIG,
)
export const getPostElectionVotesByElectionId = createVotesGetByElectionId<
  'sentiment' | 'recommendation'
>(POST_ELECTION_CONFIG)
export const getPostElectionVotesByUserForEntity = createVotesGetByUserForEntity<
  'sentiment' | 'recommendation'
>(POST_ELECTION_CONFIG)
