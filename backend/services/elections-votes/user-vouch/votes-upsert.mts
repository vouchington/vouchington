import { beginTransaction } from '@data-stores/psql'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
  VoteEventContext,
} from '../shared/index.mts'
import { upsertElectionVotesShared } from '../shared/vote-upsert.mts'
import { enqueueBulkUpdateUserVouchElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import { softDeleteUserFollowRelations, upsertUserMuteRelations } from '@services/entity-relations'
import { enqueueUndoFollowSideEffects } from '@services/entity-relations/enqueue-undo-follow-side-effects'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { USER_VOUCH_ELECTION_CONFIG } from './config.mts'

const NULL_VOTE_CONTEXT: VoteEventContext = {
  ipAddress: null,
  deviceId: null,
  sessionId: null,
  userAgent: null,
}

export async function upsertUserVouchElectionVotes(
  userId: string,
  votes: Array<{ entityId: string; score: ElectionVoteScore }>,
  context: VoteEventContext = NULL_VOTE_CONTEXT,
): Promise<ElectionVoteMutationResult[]> {
  if (votes.length === 0) return []

  // SERIALIZABLE: concurrent identical requests would otherwise both append a ballot.
  await using query = await beginTransaction({ serializable: true })

  const insertedVotesInTransaction = await upsertElectionVotesShared(
    USER_VOUCH_ELECTION_CONFIG,
    userId,
    votes,
    context,
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

  const undoAdmission = enqueueUndoFollowSideEffects(
    getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      predicate: 'follow',
      objectType: 'user',
    }),
    deletedFollowRelationsInTransaction,
  )
  const statsAdmission = awaitReportedEnqueueAdmission(() =>
    enqueueBulkUpdateUserVouchElectionVoteStats([...new Set(votes.map(vote => vote.entityId))]),
  )
  await Promise.all([undoAdmission, statsAdmission])
  return insertedVotesInTransaction
}
