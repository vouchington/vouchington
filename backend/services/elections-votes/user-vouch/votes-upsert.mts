import { beginTransaction } from '@data-stores/psql'
import type { ElectionVoteMutationResult, ElectionVoteScore } from '../shared/index.mts'
import { upsertElectionVotesShared } from '../shared/vote-upsert.mts'
import { enqueueBulkUpdateUserVouchElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { softDeleteUserFollowRelations, upsertUserMuteRelations } from '@services/entity-relations'
import { enqueueUndoFollowSideEffects } from '@services/entity-relations/enqueue-undo-follow-side-effects'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { USER_VOUCH_ELECTION_CONFIG } from './config.mts'

export async function upsertUserVouchElectionVotes(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
): Promise<ElectionVoteMutationResult[]> {
  if (votes.length === 0) return []

  await using query = await beginTransaction()

  const insertedVotesInTransaction = await upsertElectionVotesShared(
    USER_VOUCH_ELECTION_CONFIG,
    userId,
    votes,
    { query },
  )
  const disengageTargetIds = insertedVotesInTransaction.flatMap(vote =>
    vote.score === -2 ? [vote.entity_id] : [],
  )
  const deletedFollowRelationsInTransaction =
    disengageTargetIds.length > 0
      ? await softDeleteUserFollowRelations(userId, disengageTargetIds, { query })
      : []
  if (disengageTargetIds.length > 0)
    await upsertUserMuteRelations(userId, disengageTargetIds, { query })
  await query.commit()
  const insertedVotes = insertedVotesInTransaction
  const deletedFollowRelations = deletedFollowRelationsInTransaction

  enqueueUndoFollowSideEffects(
    getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'user',
    }),
    deletedFollowRelations,
  )
  if (votes.length > 0) {
    void enqueueBulkUpdateUserVouchElectionVoteStats([...new Set(votes.map(vote => vote.entityId))])
  }
  return insertedVotes
}
