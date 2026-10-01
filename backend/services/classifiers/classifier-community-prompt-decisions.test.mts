import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierCommunityPromptFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { insertTestCommunity } from '../../test-helpers/entities/communities.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import { readCompleteClassifierDecisionIfExistsFromPrimary } from './read-complete-decision.mts'
import { ClassifierDecisionReuseError } from './types.mts'

type Fixture = Awaited<ReturnType<typeof createClassifierCommunityPromptFixture>>

async function activatedFixture() {
  const fixture = await createClassifierCommunityPromptFixture()
  await fixture.activateCommunityPromptConfiguration()
  return fixture
}

const promptResult = (communityPromptId: string, probability: number) =>
  ({
    candidateKind: 'community_prompt',
    communityPromptId,
    storedCandidateId: null,
    probability,
    rawResponse: { type: 'noul', probability },
  }) as const

function inputFor(fixture: Fixture, results: ReturnType<typeof promptResult>[]) {
  return {
    batchId: uuidv7(),
    classifierId: fixture.communityPromptClassifierId,
    promptVersionId: fixture.communityPromptVersionId,
    subject: { postId: fixture.postId, rssFeedItemId: null },
    scope: { scopeCategory: 'community_ai', scopeCommunityId: fixture.communityId },
    calls: [{ shardOrdinal: 0, results }],
  } as const
}

describe('persistClassifierDecision for community moderation prompts', () => {
  it('persists one result per prompt with the prompt revision thresholds and no stored candidate', async () => {
    const fixture = await activatedFixture()
    const secondPromptId = await fixture.createCommunityPrompt()
    const input = inputFor(fixture, [
      promptResult(fixture.communityPromptId, 0.9),
      promptResult(secondPromptId, 0.1),
    ])

    const persisted = await persistClassifierDecision(input)

    expect(persisted.replayed).toBe(false)
    expect(persisted.decision.results).toHaveLength(2)
    expect(persisted.decision.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateKind: 'community_prompt',
          communityPromptId: fixture.communityPromptId,
          storedCandidateId: null,
          thresholdId: null,
          probability: 0.9,
          effectiveThresholds: { lower: 0.25, upper: 0.75 },
          scope: { scopeCategory: 'community_ai', scopeCommunityId: fixture.communityId },
        }),
        expect.objectContaining({ communityPromptId: secondPromptId, probability: 0.1 }),
      ]),
    )
    await expect(fixture.getDecisionPersistenceFacts(input.batchId)).resolves.toMatchObject({
      snapshots: 0,
      topic_results: 0,
      story_results: 0,
      community_prompt_results: 2,
    })
    await expect(
      readCompleteClassifierDecisionIfExistsFromPrimary(input.batchId, 'community_prompt'),
    ).resolves.toMatchObject({ batchId: input.batchId, results: persisted.decision.results })
  })

  it('replays an identical batch and rejects a conflicting reuse of its batch id', async () => {
    const fixture = await activatedFixture()
    const input = inputFor(fixture, [promptResult(fixture.communityPromptId, 0.9)])
    const first = await persistClassifierDecision(input)

    const replay = await persistClassifierDecision(input)
    expect(replay).toMatchObject({ replayed: true })
    expect(replay.decision.results).toEqual(first.decision.results)

    const conflict = persistClassifierDecision({
      ...input,
      calls: [{ shardOrdinal: 0, results: [promptResult(fixture.communityPromptId, 0.2)] }],
    })
    await expect(conflict).rejects.toBeInstanceOf(ClassifierDecisionReuseError)
    await expect(conflict).rejects.toMatchObject({ code: 'results' })
    await expect(fixture.countCommunityPromptResults(input.batchId)).resolves.toBe(1)
  })

  it('refuses a global scope, an RSS subject and a topic result for a community prompt classifier', async () => {
    const fixture = await activatedFixture()
    const input = inputFor(fixture, [promptResult(fixture.communityPromptId, 0.9)])

    await expect(
      persistClassifierDecision({
        ...input,
        scope: { scopeCategory: 'global', scopeCommunityId: null },
      }),
    ).rejects.toThrow('Classifier candidate kind does not match its decision subject')
    await expect(
      persistClassifierDecision({
        ...input,
        subject: { postId: null, rssFeedItemId: fixture.rssFeedItemId },
      }),
    ).rejects.toThrow('Classifier candidate kind does not match its decision subject')
    await expect(
      persistClassifierDecision({
        ...input,
        calls: [
          {
            shardOrdinal: 0,
            results: [
              {
                candidateKind: 'topic',
                topicId: fixture.topicId,
                storedCandidateId: null,
                probability: 0.5,
                rawResponse: { type: 'noul', probability: 0.5 },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow('Classifier candidate kind does not match its decision subject and results')
    await expect(fixture.getDecisionPersistenceFacts(input.batchId)).resolves.toMatchObject({
      batches: 0,
      community_prompt_results: 0,
    })
  })

  it('rolls the whole batch back when a prompt belongs to another community', async () => {
    const fixture = await activatedFixture()
    const other = await insertTestCommunity({ createdById: fixture.auditUserId })
    const foreignPromptId = await fixture.createCommunityPrompt({ communityId: other.id })
    const input = inputFor(fixture, [
      promptResult(fixture.communityPromptId, 0.9),
      promptResult(foreignPromptId, 0.9),
    ])

    await expect(persistClassifierDecision(input)).rejects.toMatchObject({ code: '23503' })
    await expect(fixture.getDecisionPersistenceFacts(input.batchId)).resolves.toMatchObject({
      batches: 0,
      calls: 0,
      community_prompt_results: 0,
    })
  })
})
