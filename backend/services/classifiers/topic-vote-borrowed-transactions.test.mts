import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  getClassifierBorrowedVoteFacts,
  runClassifierBorrowedTestTransaction,
} from '../../test-helpers/data-stores/psql/classifier-borrowed-transactions.mts'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { createSystemUser } from '../../test-helpers/entities/users.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import { applyTopicClassifierDecisionVotes } from './topic-vote-actions.mts'

describe('applyTopicClassifierDecisionVotes borrowed transaction', () => {
  it('leaves receipt and vote uncommitted and rolls both back after a later caller failure', async () => {
    const { input, actorId, topicId } = await createBorrowedVoteCase()
    await expect(
      runClassifierBorrowedTestTransaction(async transaction => {
        await expect(
          applyTopicClassifierDecisionVotes(input, { query: transaction }),
        ).resolves.toEqual({ appliedTopicIds: [topicId] })
        await expect(
          getClassifierBorrowedVoteFacts(input.batchId, actorId, topicId, transaction),
        ).resolves.toEqual({ receipts: 1, votes: 1 })
        await expect(
          getClassifierBorrowedVoteFacts(input.batchId, actorId, topicId),
        ).resolves.toEqual({ receipts: 0, votes: 0 })
        throw new Error('later caller phase failed')
      }),
    ).rejects.toThrow('later caller phase failed')
    await expect(getClassifierBorrowedVoteFacts(input.batchId, actorId, topicId)).resolves.toEqual({
      receipts: 0,
      votes: 0,
    })
  })

  it('persists receipt and vote only when the outer owner commits', async () => {
    const { input, actorId, topicId } = await createBorrowedVoteCase()
    await runClassifierBorrowedTestTransaction(
      async transaction => {
        await expect(
          applyTopicClassifierDecisionVotes(input, { query: transaction }),
        ).resolves.toEqual({ appliedTopicIds: [topicId] })
        await expect(
          getClassifierBorrowedVoteFacts(input.batchId, actorId, topicId),
        ).resolves.toEqual({ receipts: 0, votes: 0 })
      },
      { commit: true },
    )
    await expect(getClassifierBorrowedVoteFacts(input.batchId, actorId, topicId)).resolves.toEqual({
      receipts: 1,
      votes: 1,
    })
  })
})

async function createBorrowedVoteCase() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  const actor = await createSystemUser(`classifier-borrowed-${uuidv7()}`)
  const decision = await persistClassifierDecision({
    batchId: uuidv7(),
    classifierId: fixture.classifierId,
    promptVersionId: fixture.promptVersionId,
    subject: { postId: fixture.postId, rssFeedItemId: null },
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    calls: [
      {
        shardOrdinal: 0,
        results: [
          {
            candidateKind: 'topic',
            topicId: fixture.topicId,
            storedCandidateId: fixture.topicCandidateId,
            probability: 0.9,
            rawResponse: { type: 'noul', probability: 0.9 },
          },
        ],
      },
    ],
  })
  return {
    input: {
      batchId: decision.decision.batchId,
      sharedActorId: actor.id,
      expectedBindings: [{ topicId: fixture.topicId, storedCandidateId: fixture.topicCandidateId }],
    },
    actorId: actor.id,
    topicId: fixture.topicId,
  }
}
