import { getEntityRelationElectionVotesByUser } from '@services/elections-votes/entity-relation'
import {
  createEntityRelationElectionTarget,
  toEntityRelationElectionTable,
} from '@services/elections-votes/entity-relation/target'
import { getEntityRelationElectionByTargetCachedBatch } from '@services/entity-fetch/get'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import type { EntityRelationMetadata } from '@voucha/types/entities/entity-relations-metadata'

// A list response serves one relation table, so its relation ids are qualified by that table.
// The same UUID can exist in another relation table and must not resolve to that table's election.
type ElectionScope = Pick<EntityRelationMetadata, 'election' | 'table_name'>

export async function getElectionRecordsForRelations(
  { election, table_name }: ElectionScope,
  relationIds: string[],
) {
  if (!election || relationIds.length === 0) return {}
  const targets = relationIds.map(id => createEntityRelationElectionTarget(id, table_name))
  return indexById(await getEntityRelationElectionByTargetCachedBatch(targets))
}

export async function getViewerVoteRecordsForRelations(
  currentUserId: string,
  { election, table_name }: ElectionScope,
  relationIds: string[],
) {
  if (!election || relationIds.length === 0) return undefined
  const votes = await getEntityRelationElectionVotesByUser(
    currentUserId,
    toEntityRelationElectionTable(table_name),
    relationIds,
  )
  const electionVotes = electionVotesMapToRecord(new Map(votes.map(vote => [vote.entity_id, vote])))
  return Object.keys(electionVotes).length > 0 ? electionVotes : undefined
}
