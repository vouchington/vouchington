import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import { upsertTopicElectionVotes, getTopicElectionVote } from '@services/elections-votes/topic'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import { applyTopicClassifierDecisionVotes } from './topic-vote-actions.mts'

describe('applyTopicClassifierDecisionVotes', () => {
  it('maps persisted effective thresholds into durable semantic votes', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const [actor, human] = await Promise.all([createTestUser(), createTestUser()])
    const decision = await persistTopicDecision(fixture, uuidv7(), 0.25)
    await upsertTopicElectionVotes(human.id, [{ entityId: fixture.topicId, score: 1 }])

    await expect(
      applyTopicClassifierDecisionVotes({
        batchId: decision.decision.batchId,
        sharedActorId: actor.id,
        expectedBindings: [
          { topicId: fixture.topicId, storedCandidateId: fixture.topicCandidateId },
        ],
      }),
    ).resolves.toEqual({ appliedTopicIds: [fixture.topicId] })
    await expect(getTopicElectionVote(actor.id, fixture.topicId)).resolves.toMatchObject({
      choice: 'neutral',
    })
    await expect(getTopicElectionVote(human.id, fixture.topicId)).resolves.toMatchObject({
      choice: 'like',
    })
  })

  it('rejects incomplete bindings and story results without changing votes', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const actor = await createTestUser()
    const decision = await persistTopicDecision(fixture, uuidv7(), 0.8)

    await expect(
      applyTopicClassifierDecisionVotes({
        batchId: decision.decision.batchId,
        sharedActorId: actor.id,
        expectedBindings: [{ topicId: fixture.communityTopicId, storedCandidateId: null }],
      }),
    ).rejects.toThrow('Classifier topic vote application decision lineage')
    await expect(getTopicElectionVote(actor.id, fixture.topicId)).resolves.toBeNull()

    const story = await persistClassifierDecision({
      batchId: uuidv7(),
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
              probability: 0.8,
              rawResponse: {},
            },
          ],
        },
      ],
    })
    await expect(
      applyTopicClassifierDecisionVotes({
        batchId: story.decision.batchId,
        sharedActorId: actor.id,
        expectedBindings: [
          { topicId: fixture.topicId, storedCandidateId: fixture.topicCandidateId },
        ],
      }),
    ).rejects.toThrow('Classifier topic vote application requires a complete topic-only decision')
  })

  it('replays exactly and fences an older batch behind a newer application', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const actor = await createTestUser()
    const older = await persistTopicDecision(fixture, uuidv7({ msecs: 1_000 }), 0.1)
    const newer = await persistTopicDecision(fixture, uuidv7({ msecs: 2_000 }), 0.9)
    const input = (batchId: string) => ({
      batchId,
      sharedActorId: actor.id,
      expectedBindings: [{ topicId: fixture.topicId, storedCandidateId: fixture.topicCandidateId }],
    })

    await expect(applyTopicClassifierDecisionVotes(input(newer.decision.batchId))).resolves.toEqual(
      {
        appliedTopicIds: [fixture.topicId],
      },
    )
    await expect(applyTopicClassifierDecisionVotes(input(newer.decision.batchId))).resolves.toEqual(
      {
        appliedTopicIds: [],
      },
    )
    await expect(applyTopicClassifierDecisionVotes(input(older.decision.batchId))).resolves.toEqual(
      {
        appliedTopicIds: [],
      },
    )
    await expect(getTopicElectionVote(actor.id, fixture.topicId)).resolves.toMatchObject({
      choice: 'like',
    })
  })

  async function persistTopicDecision(
    fixture: Awaited<ReturnType<typeof createClassifierFixture>>,
    batchId: string,
    probability: number,
  ) {
    return persistClassifierDecision({
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
              probability,
              rawResponse: { probability },
            },
          ],
        },
      ],
    })
  }
})
