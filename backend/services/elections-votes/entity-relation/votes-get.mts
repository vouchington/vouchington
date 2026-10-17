import { resolveEntityRelationElectionTargetById } from './resolve-election-target.mts'
import type { EntityRelationElectionTable } from '@queues/vote-aggregation/enqueues/types-elections'
import {
  createVoteGetByUser,
  createVotesGetByElectionId,
  createVotesGetByUserForEntity,
} from '../shared/entity-service.mts'
import { getElectionVotesByUser } from '../shared/vote-get.mts'
import type { ElectionVote } from '../shared/types.mts'
import { getEntityRelationElectionConfig } from './config.mts'

/** Viewer votes for relations of one concrete table; ids are only unique within a table. */
export function getEntityRelationElectionVotesByUser(
  userId: string,
  relationTable: EntityRelationElectionTable,
  entityIds: string[],
): Promise<ElectionVote<'relation'>[]> {
  return getElectionVotesByUser(
    getEntityRelationElectionConfig(relationTable),
    userId,
    entityIds,
  ) as Promise<ElectionVote<'relation'>[]>
}
export async function getEntityRelationElectionVote(userId: string, entityId: string) {
  const target = await resolveEntityRelationElectionTargetById(entityId)
  if (!target) return null
  return createVoteGetByUser<'relation'>(getEntityRelationElectionConfig(target.relationTable))(
    userId,
    entityId,
  )
}

export async function getEntityRelationElectionVotesByElectionId(
  entityId: string,
  pagination: { limit: number; after?: string },
) {
  const target = await resolveEntityRelationElectionTargetById(entityId)
  if (!target) return { results: [], page_info: emptyPageInfo() }
  return createVotesGetByElectionId<'relation'>(
    getEntityRelationElectionConfig(target.relationTable),
  )(entityId, pagination)
}

export async function getEntityRelationElectionVotesByUserForEntity(
  userId: string,
  entityId: string,
  pagination: { limit: number; after?: string },
) {
  const target = await resolveEntityRelationElectionTargetById(entityId)
  if (!target) return { results: [], page_info: emptyPageInfo() }
  return createVotesGetByUserForEntity<'relation'>(
    getEntityRelationElectionConfig(target.relationTable),
  )(userId, entityId, pagination)
}

function emptyPageInfo() {
  return { has_next_page: false, start_cursor: null, end_cursor: null }
}
