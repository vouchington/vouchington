import createError from 'http-errors'
import { withElectionVoteRequestLock } from '../shared/request-lock.mts'
import { resolveEntityRelationElectionTargetById } from './resolve-election-target.mts'
import { getEntityRelationElectionVote } from './votes-get.mts'
import {
  refreshUserTagVoteStats,
  refreshVoteStatsAfterNoop,
  upsertEntityRelationVotesById,
} from './votes-by-relation-id.mts'

/**
 * Removes a user's vote from an entity relation: the clear branch of
 * `DELETE /api/v1/entity-relations/:id/vote`, without the HTTP request. Callers check that the user
 * may act first (the route refuses a suspended account). It throws a 404 for an unknown relation
 * and a 409 when the id is held by several relation tables. Retracting a vote that does not exist
 * changes nothing. The same per-user, per-relation lock the route takes serializes it against a
 * vote cast or cleared from the web at the same moment.
 */
export async function retractEntityRelationVote(userId: string, relationId: string): Promise<void> {
  const id = relationId.toLowerCase()
  if (!(await resolveEntityRelationElectionTargetById(id))) {
    throw createError(404, 'Entity relation not found')
  }
  const cleared = await withElectionVoteRequestLock('entity_relation', userId, id, async () => {
    if ((await getEntityRelationElectionVote(userId, id)) === null) {
      refreshVoteStatsAfterNoop(id)
      return []
    }
    return upsertEntityRelationVotesById(userId, [{ entityId: id, score: null }])
  })
  if (cleared[0]) await refreshUserTagVoteStats(id)
}
