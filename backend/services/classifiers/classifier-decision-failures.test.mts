import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  getClassifierBorrowedDecisionFacts,
  runClassifierBorrowedTestTransaction,
} from '../../test-helpers/data-stores/psql/classifier-borrowed-transactions.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'

describe('persistClassifierDecision failures', () => {
  it('keeps borrowed lineage uncommitted and rolls every row back after a later caller failure', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const input = makeBorrowedTopicDecisionInput(fixture)

    await expect(
      runClassifierBorrowedTestTransaction(async transaction => {
        const result = await persistClassifierDecision(input, { query: transaction })
        expect(result.replayed).toBe(false)
        await expect(
          getClassifierBorrowedDecisionFacts(input.batchId, transaction),
        ).resolves.toEqual({ batches: 1, calls: 1, snapshots: 1, topicResults: 1, storyResults: 0 })
        await expect(getClassifierBorrowedDecisionFacts(input.batchId)).resolves.toEqual({
          batches: 0,
          calls: 0,
          snapshots: 0,
          topicResults: 0,
          storyResults: 0,
        })
        throw new Error('later caller phase failed')
      }),
    ).rejects.toThrow('later caller phase failed')
    await expect(getClassifierBorrowedDecisionFacts(input.batchId)).resolves.toEqual({
      batches: 0,
      calls: 0,
      snapshots: 0,
      topicResults: 0,
      storyResults: 0,
    })
  })

  it('commits borrowed lineage only with the outer owner and replays within that owner', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const input = makeBorrowedTopicDecisionInput(fixture)
    await runClassifierBorrowedTestTransaction(
      async transaction => {
        const first = await persistClassifierDecision(input, { query: transaction })
        const replay = await persistClassifierDecision(input, { query: transaction })
        expect(first.replayed).toBe(false)
        expect(replay.replayed).toBe(true)
        await expect(getClassifierBorrowedDecisionFacts(input.batchId)).resolves.toMatchObject({
          batches: 0,
          calls: 0,
          snapshots: 0,
          topicResults: 0,
        })
      },
      { commit: true },
    )
    await expect(getClassifierBorrowedDecisionFacts(input.batchId)).resolves.toEqual({
      batches: 1,
      calls: 1,
      snapshots: 1,
      topicResults: 1,
      storyResults: 0,
    })
  })

  it('rolls back batch and call rows when result insertion fails', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()

    await expect(
      persistClassifierDecision({
        batchId,
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
                topicId: uuidv7(),
                storedCandidateId: null,
                probability: 0.5,
                rawResponse: { type: 'noul', probability: 0.5 },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/topic_classifier_results_topic_id_fkey/)
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 0,
      calls: 0,
      snapshots: 0,
      topic_results: 0,
    })
  })

  it('rejects a story classifier candidate kind on a post subject', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()

    await expect(
      persistClassifierDecision({
        batchId,
        classifierId: fixture.storyClassifierId,
        promptVersionId: fixture.storyPromptVersionId,
        subject: { postId: fixture.postId, rssFeedItemId: null },
        scope: { scopeCategory: 'global', scopeCommunityId: null },
        calls: [
          {
            shardOrdinal: 0,
            results: [
              {
                candidateKind: 'story',
                storyId: fixture.storyId,
                storedCandidateId: null,
                probability: 0.5,
                rawResponse: { type: 'choice', probabilities: { story: 0.5 } },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow('does not match its decision subject')
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 0,
      calls: 0,
      story_results: 0,
    })
  })
})

function makeBorrowedTopicDecisionInput(
  fixture: Awaited<ReturnType<typeof createClassifierFixture>>,
) {
  return {
    batchId: uuidv7(),
    classifierId: fixture.classifierId,
    promptVersionId: fixture.promptVersionId,
    subject: { postId: fixture.postId, rssFeedItemId: null },
    scope: { scopeCategory: 'global' as const, scopeCommunityId: null },
    calls: [
      {
        shardOrdinal: 0,
        results: [
          {
            candidateKind: 'topic' as const,
            topicId: fixture.topicId,
            storedCandidateId: fixture.topicCandidateId,
            probability: 0.5,
            rawResponse: { type: 'noul', probability: 0.5 },
          },
        ],
      },
    ],
  }
}
