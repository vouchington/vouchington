import type { EntityRelationElectionTable } from '@queues/elections/types'
import {
  createVoteGetByUser,
  createVotesGetByElectionId,
  createVotesGetByUserForEntity,
} from '../shared/entity-service.mts'
import { getElectionVotesByUser } from '../shared/vote-get.mts'
import type { ElectionVote } from '../shared/types.mts'
import { ENTITY_RELATION_ELECTION_CONFIG } from './config.mts'

/** Viewer votes for relations of one concrete table; ids are only unique within a table. */
export function getEntityRelationElectionVotesByUser(
  userId: string,
  relationTable: EntityRelationElectionTable,
  entityIds: string[],
): Promise<ElectionVote<'relation'>[]> {
  return getElectionVotesByUser(
    ENTITY_RELATION_ELECTION_CONFIG,
    userId,
    entityIds,
    relationTable,
  ) as Promise<ElectionVote<'relation'>[]>
}
export const getEntityRelationElectionVote = createVoteGetByUser<'relation'>(
  ENTITY_RELATION_ELECTION_CONFIG,
)
export const getEntityRelationElectionVotesByElectionId = createVotesGetByElectionId<'relation'>(
  ENTITY_RELATION_ELECTION_CONFIG,
)
export const getEntityRelationElectionVotesByUserForEntity =
  createVotesGetByUserForEntity<'relation'>(ENTITY_RELATION_ELECTION_CONFIG)
