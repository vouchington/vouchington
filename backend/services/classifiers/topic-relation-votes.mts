import { registerPostCommitAction, type OwnedTransaction } from '@data-stores/psql'
import {
  publishEntityRelationElectionVoteStats,
  updateEntityRelationElectionVoteStatsFromPrimaryBatch,
} from '@services/elections-votes/entity-relation/vote-stats-batch'
import { createEntityRelationElectionTarget } from '@services/elections-votes/entity-relation/target'
import { upsertEntityRelationElectionVotes } from '@services/elections-votes/entity-relation/votes-upsert'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import type { ElectionVoteScore } from '@voucha/types/entities/election'

export type SubjectTopicRelationVote = { relationId: string; score: ElectionVoteScore }

/**
 * Casts the shared actor's explicit relation votes, refreshes the touched relations' vote
 * statistics in the same transaction, and publishes the changed targets (cache invalidation) once
 * the outer owner commits. Votes are append-only: a score equal to the actor's latest is a no-op.
 */
export async function castSubjectTopicRelationVotes(
  query: OwnedTransaction,
  relation: EntityRelationMetadata,
  actorId: string,
  votes: readonly SubjectTopicRelationVote[],
): Promise<void> {
  if (votes.length === 0) return
  await upsertEntityRelationElectionVotes(
    actorId,
    votes.map(vote => ({ entityId: vote.relationId, score: vote.score })),
    undefined,
    relation,
    { query, enqueueVoteStats: false },
  )
  const changedTargets = await updateEntityRelationElectionVoteStatsFromPrimaryBatch(
    votes.map(vote => createEntityRelationElectionTarget(vote.relationId, relation.table_name)),
    { query, invalidateCache: false, enqueueTopHashtagRefresh: false },
  )
  if (changedTargets.length > 0) {
    registerPostCommitAction(query, () =>
      publishEntityRelationElectionVoteStats(changedTargets, { enqueueTopHashtagRefresh: false }),
    )
  }
}
