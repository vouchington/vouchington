import createError from 'http-errors'
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
 * changes nothing. Votes are best effort: a vote cast or cleared from the web at the same moment
 * is resolved by latest ballot wins.
 */
export async function retractEntityRelationVote(
  userId: string,
  relationId: string,
  beforeMutation?: () => Promise<void>,
): Promise<void> {
  const id = relationId.toLowerCase()
  if (!(await resolveEntityRelationElectionTargetById(id))) {
    throw createError(404, 'Entity relation not found')
  }
  await beforeMutation?.()
  const target = await resolveEntityRelationElectionTargetById(id)
  if (!target || (await getEntityRelationElectionVote(userId, id, target)) === null) {
    refreshVoteStatsAfterNoop(id)
    return
  }
  const cleared = await upsertEntityRelationVotesById(
    userId,
    [{ entityId: id, score: null }],
    undefined,
    target,
  )
  if (cleared[0]) await refreshUserTagVoteStats(id)
}
