import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  applyDecisionRelationsForTest,
  persistSubjectTopicDecision,
  readSubjectTopicRelationFacts,
} from '../../test-helpers/data-stores/psql/classifier-runs/subject-topic-relations.mts'
import { createTestTopic } from '../../test-helpers/entities/create-test-entities.mts'
import { createSystemUser } from '../../test-helpers/entities/users.mts'
import { persistClassifierDecision } from './persist-classifier-decision.mts'
import { assertApplicationInput } from './topic-decision-validation.mts'

describe('assertApplicationInput', () => {
  const batchId = uuidv7()
  const sharedActorId = uuidv7()
  const binding = { topicId: uuidv7(), storedCandidateId: uuidv7() }

  it('rejects malformed identifiers, missing bindings and duplicate bindings', () => {
    expect(() =>
      assertApplicationInput({ batchId: 'not-a-uuid', sharedActorId, expectedBindings: [binding] }),
    ).toThrow('Classifier topic relation application requires UUID batch and shared actor IDs')
    expect(() =>
      assertApplicationInput({ batchId, sharedActorId: 'not-a-uuid', expectedBindings: [binding] }),
    ).toThrow('Classifier topic relation application requires UUID batch and shared actor IDs')
    expect(() => assertApplicationInput({ batchId, sharedActorId, expectedBindings: [] })).toThrow(
      'Classifier topic relation application requires expected bindings',
    )
    expect(() =>
      assertApplicationInput({
        batchId,
        sharedActorId,
        expectedBindings: [{ topicId: 'not-a-uuid', storedCandidateId: null }],
      }),
    ).toThrow('Classifier topic relation application binding IDs must be UUIDs')
    expect(() =>
      assertApplicationInput({
        batchId,
        sharedActorId,
        expectedBindings: [{ topicId: binding.topicId, storedCandidateId: 'not-a-uuid' }],
      }),
    ).toThrow('Classifier topic relation application binding IDs must be UUIDs')
    expect(() =>
      assertApplicationInput({ batchId, sharedActorId, expectedBindings: [binding, binding] }),
    ).toThrow('Classifier topic relation application cannot duplicate bindings')
  })

  it('accepts runtime and stored-candidate bindings for the same topic as distinct', () => {
    expect(() =>
      assertApplicationInput({
        batchId,
        sharedActorId,
        expectedBindings: [binding, { topicId: binding.topicId, storedCandidateId: null }],
      }),
    ).not.toThrow()
  })
})

describe('validateTopicDecision through the relation applier', () => {
  it('rejects bindings the decision was not made for, without writing a relation', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const actor = await createSystemUser(`classifier-validation-${uuidv7()}`)
    const [asked, other] = await Promise.all([createTestTopic({}), createTestTopic({})])
    const subject = { postId: fixture.postId, rssFeedItemId: null } as const
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: asked.id, probability: 0.9 },
    ])

    await expect(applyDecisionRelationsForTest(decision, actor.id, [other.id])).rejects.toThrow(
      'Classifier topic relation application decision lineage',
    )
    await expect(
      applyDecisionRelationsForTest(decision, actor.id, [asked.id, other.id]),
    ).rejects.toThrow('Classifier topic relation application requires a complete topic-only')

    expect(await readSubjectTopicRelationFacts(subject)).toEqual([])
  })

  it('rejects a story decision without writing a relation', async () => {
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const actor = await createSystemUser(`classifier-validation-${uuidv7()}`)
    const { decision } = await persistClassifierDecision({
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
      applyDecisionRelationsForTest(decision, actor.id, [fixture.topicId]),
    ).rejects.toThrow('Classifier topic relation application requires a complete topic-only')

    expect(
      await readSubjectTopicRelationFacts({ postId: null, rssFeedItemId: fixture.rssFeedItemId }),
    ).toEqual([])
  })
})
