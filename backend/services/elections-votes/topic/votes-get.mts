import {
  createVoteGetByUser,
  createVotesGetByElectionId,
  createVotesGetByUser,
  createVotesGetByUserForEntity,
} from '../shared/entity-service.mts'
import { TOPIC_ELECTION_CONFIG } from './config.mts'

export const getTopicElectionVotesByUser = createVotesGetByUser<'sentiment'>(TOPIC_ELECTION_CONFIG)
export const getTopicElectionVote = createVoteGetByUser<'sentiment'>(TOPIC_ELECTION_CONFIG)
export const getTopicElectionVotesByElectionId =
  createVotesGetByElectionId<'sentiment'>(TOPIC_ELECTION_CONFIG)
export const getTopicElectionVotesByUserForEntity =
  createVotesGetByUserForEntity<'sentiment'>(TOPIC_ELECTION_CONFIG)
