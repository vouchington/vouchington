import { beginTransaction } from '@data-stores/psql'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import { TOPIC_ELECTION_CONFIG } from '../topic/config.mts'
import { getTopicElectionVote } from '../topic/votes-get.mts'
import { createVotesUpsert } from './entity-service.mts'
import type { ElectionVoteMutationResult } from './types.mts'

describe('createVotesUpsert', () => {
  it('publishes transaction-scoped vote side effects only after commit', async () => {
    const user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Deferred Vote Side Effects ${Math.random().toString(36).slice(2, 10)}`,
      slug: `deferred-vote-side-effects-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
    })
    const enqueueElectionStats = vi.fn<(entityIds: string[]) => void>()
    const afterUpsert = vi.fn<
      (entityIds: string[], upsertedVotes: ElectionVoteMutationResult[]) => Promise<void>
    >(async () => {})
    const upsertVotes = createVotesUpsert(TOPIC_ELECTION_CONFIG, {
      enqueueElectionStats,
      afterUpsert,
    })

    await using transaction = await beginTransaction()
    await upsertVotes(user.id, [{ entityId: topicId, score: 1 }], undefined, {
      query: transaction,
    })

    expect(enqueueElectionStats).not.toHaveBeenCalled()
    expect(afterUpsert).not.toHaveBeenCalled()
    await transaction.commit()
    expect(enqueueElectionStats).toHaveBeenCalledExactlyOnceWith([topicId])
    expect(afterUpsert).toHaveBeenCalledExactlyOnceWith(
      [topicId],
      expect.arrayContaining([expect.objectContaining({ entity_id: topicId })]),
    )
  })

  it('discards transaction-scoped vote side effects on rollback', async () => {
    const user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Rolled Back Vote Side Effects ${Math.random().toString(36).slice(2, 10)}`,
      slug: `rolled-back-vote-side-effects-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
    })
    const enqueueElectionStats = vi.fn<(entityIds: string[]) => void>()
    const afterUpsert = vi.fn<
      (entityIds: string[], upsertedVotes: ElectionVoteMutationResult[]) => Promise<void>
    >(async () => {})
    const upsertVotes = createVotesUpsert(TOPIC_ELECTION_CONFIG, {
      enqueueElectionStats,
      afterUpsert,
    })

    await using transaction = await beginTransaction()
    await upsertVotes(user.id, [{ entityId: topicId, score: 1 }], undefined, {
      query: transaction,
    })
    await transaction.rollback()

    expect(enqueueElectionStats).not.toHaveBeenCalled()
    expect(afterUpsert).not.toHaveBeenCalled()
    await expect(getTopicElectionVote(user.id, topicId)).resolves.toBeNull()
  })
})
