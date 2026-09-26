import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import { ClassifierDecisionReuseError } from './types.mts'

describe('persistClassifierDecision', () => {
  it('persists stored snapshots and runtime results atomically in their topic result family', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()

    const persisted = await persistClassifierDecision({
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
              topicId: fixture.topicId,
              storedCandidateId: fixture.topicCandidateId,
              probability: 0.8,
              rawResponse: { type: 'noul', probability: 0.8 },
            },
            {
              candidateKind: 'topic',
              topicId: fixture.communityTopicId,
              storedCandidateId: null,
              probability: 0.2,
              rawResponse: { type: 'noul', probability: 0.2 },
            },
          ],
        },
      ],
    })

    expect(persisted.replayed).toBe(false)
    expect(persisted.decision.calls).toHaveLength(1)
    expect(persisted.decision.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topicId: fixture.topicId,
          storedCandidateId: fixture.topicCandidateId,
          thresholdId: fixture.topicThresholdId,
          effectiveThresholds: { lower: 0.25, upper: 0.75 },
        }),
        expect.objectContaining({
          topicId: fixture.communityTopicId,
          storedCandidateId: null,
          thresholdId: null,
          effectiveThresholds: { lower: 0.25, upper: 0.75 },
        }),
      ]),
    )
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      snapshots: 1,
      topic_results: 2,
      story_results: 0,
    })
  })

  it('persists story results only in the story result family', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()

    const persisted = await persistClassifierDecision({
      batchId,
      classifierId: fixture.storyClassifierId,
      promptVersionId: fixture.storyPromptVersionId,
      subject: { postId: null, rssFeedItemId: fixture.rssFeedItemId },
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'story',
              storyId: fixture.storyId,
              storedCandidateId: fixture.storyCandidateId,
              probability: 0.9,
              rawResponse: { type: 'choice', probabilities: { story: 0.9 } },
            },
          ],
        },
      ],
    })

    expect(persisted.decision.results).toEqual([
      expect.objectContaining({
        candidateKind: 'story',
        storyId: fixture.storyId,
        storedCandidateId: fixture.storyCandidateId,
        thresholdId: fixture.storyThresholdId,
      }),
    ])
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      topic_results: 0,
      story_results: 1,
    })
  })

  it('returns an existing complete decision for an identical stable batch replay', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const input = {
      batchId: uuidv7(),
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null } as const,
      scope: { scopeCategory: 'global', scopeCommunityId: null } as const,
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'topic' as const,
              topicId: fixture.topicId,
              storedCandidateId: fixture.topicCandidateId,
              probability: 0.5,
              rawResponse: { probability: 0.5, type: 'noul' },
            },
          ],
        },
      ],
    }

    const first = await persistClassifierDecision(input)
    const replay = await persistClassifierDecision(input)

    expect(replay).toMatchObject({ replayed: true, decision: { batchId: input.batchId } })
    expect(replay.decision.calls).toEqual(first.decision.calls)
    expect(replay.decision.results).toEqual(first.decision.results)
  })

  it('serializes concurrent identical stable-batch persistence into one decision', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const input = {
      batchId: uuidv7(),
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null } as const,
      scope: { scopeCategory: 'global', scopeCommunityId: null } as const,
      calls: [
        {
          shardOrdinal: 0,
          results: [
            {
              candidateKind: 'topic' as const,
              topicId: fixture.topicId,
              storedCandidateId: fixture.topicCandidateId,
              probability: 0.5,
              rawResponse: { probability: 0.5, type: 'noul' },
            },
          ],
        },
      ],
    }

    const decisions = await Promise.all([
      persistClassifierDecision(input),
      persistClassifierDecision(input),
    ])

    expect(decisions.map(result => result.replayed).sort()).toEqual([false, true])
    expect(decisions[0].decision).toEqual(decisions[1].decision)
    await expect(fixture.getDecisionPersistenceFacts(input.batchId)).resolves.toMatchObject({
      batches: 1,
      calls: 1,
      snapshots: 1,
      topic_results: 1,
    })
  })

  it('rejects a conflicting stable batch reuse without creating another result set', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const batchId = uuidv7()
    const baseInput = {
      batchId,
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      subject: { postId: fixture.postId, rssFeedItemId: null } as const,
      scope: { scopeCategory: 'global', scopeCommunityId: null } as const,
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
    await persistClassifierDecision(baseInput)

    const conflict = persistClassifierDecision({
      ...baseInput,
      calls: [
        {
          shardOrdinal: 0,
          results: [{ ...baseInput.calls[0]!.results[0]!, probability: 0.6 }],
        },
      ],
    })
    await expect(conflict).rejects.toThrow(
      'Classifier decision batch ID was reused with different results',
    )
    await expect(conflict).rejects.toBeInstanceOf(ClassifierDecisionReuseError)
    await expect(conflict).rejects.toMatchObject({ code: 'results' })
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      topic_results: 1,
    })
  })

  it('rolls back the batch when stored-candidate threshold capture is incomplete', async () => {
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
                topicId: fixture.topicId,
                storedCandidateId: uuidv7(),
                probability: 0.5,
                rawResponse: { type: 'noul', probability: 0.5 },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(
      'Each stored classifier candidate must have exactly one active threshold revision',
    )
    await expect(fixture.getDecisionPersistenceFacts(batchId)).resolves.toMatchObject({
      batches: 0,
      calls: 0,
      snapshots: 0,
      topic_results: 0,
    })
  })
})
