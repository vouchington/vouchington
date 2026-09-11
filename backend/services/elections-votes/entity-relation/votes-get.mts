import {
  createVoteGetByUser,
  createVotesGetByElectionId,
  createVotesGetByUser,
  createVotesGetByUserForEntity,
} from '../shared/entity-service.mts'
import { ENTITY_RELATION_ELECTION_CONFIG } from './config.mts'

export const getEntityRelationElectionVotesByUser = createVotesGetByUser<'relation'>(
  ENTITY_RELATION_ELECTION_CONFIG,
)
export const getEntityRelationElectionVote = createVoteGetByUser<'relation'>(
  ENTITY_RELATION_ELECTION_CONFIG,
)
export const getEntityRelationElectionVotesByElectionId = createVotesGetByElectionId<'relation'>(
  ENTITY_RELATION_ELECTION_CONFIG,
)
export const getEntityRelationElectionVotesByUserForEntity =
  createVotesGetByUserForEntity<'relation'>(ENTITY_RELATION_ELECTION_CONFIG)
