import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import onError from '@modules/on-error'
import { getUserTagRelationById } from '@services/entity-relations/user-tags'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  VoteEventContext,
} from '../shared/types.mts'
import {
  refreshEntityRelationVoteStatsById,
  refreshEntityRelationVoteStatsFromPrimaryWithFallback,
} from './refresh-stats.mts'
import { resolveEntityRelationElectionTargetById } from './resolve-election-target.mts'
import { createEntityRelationElectionTarget } from './target.mts'
import { upsertEntityRelationElectionVotes } from './votes-upsert.mts'

/**
 * Writes one vote change for a relation named by its bare id. The id resolves to the one relation
 * table it belongs to (a 409 when several hold it), so the write can only touch that relation. A
 * user-tag vote does not enqueue its stats: `refreshUserTagVoteStats` refreshes them instead.
 */
export async function upsertEntityRelationVotesById(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  context?: VoteEventContext,
): Promise<ElectionVoteMutationResult[]> {
  const target = await resolveEntityRelationElectionTargetById(votes[0]!.entityId)
  const metadata = entityRelationMetadatum.find(item => item.table_name === target?.relationTable)
  if (!metadata) return []
  const isUserTagVote =
    votes.length === 1 && Boolean(await getUserTagRelationById(votes[0]!.entityId))
  return upsertEntityRelationElectionVotes(userId, votes, context, metadata, {
    enqueueVoteStats: !isUserTagVote,
  })
}

/** Refreshes the stats of a user-tag relation from the primary after its vote changed. */
export async function refreshUserTagVoteStats(relationId: string): Promise<void> {
  if (await getUserTagRelationById(relationId)) {
    await refreshEntityRelationVoteStatsFromPrimaryWithFallback(
      createEntityRelationElectionTarget(relationId, 'relation__user__category__topic'),
    )
  }
}

/** Heals the stats after a vote request that changed nothing, without making the caller wait. */
export function refreshVoteStatsAfterNoop(relationId: string): void {
  void refreshEntityRelationVoteStatsById(relationId).catch(onError)
}
