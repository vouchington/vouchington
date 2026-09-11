import {
  createVoteGetByUser,
  createVotesGetByElectionId,
  createVotesGetByUser,
  createVotesGetByUserForEntity,
} from '../shared/entity-service.mts'
import { HOSTNAME_ELECTION_CONFIG } from './config.mts'

export const getHostnameElectionVotesByUser =
  createVotesGetByUser<'sentiment'>(HOSTNAME_ELECTION_CONFIG)
export const getHostnameElectionVote = createVoteGetByUser<'sentiment'>(HOSTNAME_ELECTION_CONFIG)
export const getHostnameElectionVotesByElectionId =
  createVotesGetByElectionId<'sentiment'>(HOSTNAME_ELECTION_CONFIG)
export const getHostnameElectionVotesByUserForEntity =
  createVotesGetByUserForEntity<'sentiment'>(HOSTNAME_ELECTION_CONFIG)
