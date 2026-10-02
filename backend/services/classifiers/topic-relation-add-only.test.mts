import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  applyDecisionRelationsForTest,
  createHumanTopicRelation,
  persistSubjectTopicDecision,
  readLiveSubjectTopicIds,
  readSubjectTopicRelationFacts,
} from '../../test-helpers/data-stores/psql/classifier-runs/subject-topic-relations.mts'
import {
  createTestPost,
  createTestTopic,
} from '../../test-helpers/entities/create-test-entities.mts'
import { softDeleteScoredPostTopicCategoryRelation } from '../../test-helpers/entities/entity-relations-posts.mts'
import { createSystemUser, createTestUser } from '../../test-helpers/entities/users.mts'

const addOnly = { addOnly: true }

async function createCase() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  const [firstStage, secondStage, human] = await Promise.all([
    createSystemUser(`first-stage-${uuidv7()}`),
    createSystemUser(`second-stage-${uuidv7()}`),
    createTestUser(),
  ])
  const post = await createTestPost({ user: human })
  const [first, second] = (await Promise.all([createTestTopic({}), createTestTopic({})])).map(
    topic => topic.id,
  ) as [string, string]
  return {
    fixture,
    firstStage,
    secondStage,
    human,
    first,
    second,
    subject: { postId: post.id, rssFeedItemId: null } as const,
  }
}

describe('applyTopicClassifierDecisionRelations in add-only mode', () => {
  it('adds a positive topic the subject has no relation for, with only the actor vote', async () => {
    const { fixture, secondStage, first, second, subject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.1 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, secondStage.id, [first, second], subject, addOnly),
    ).resolves.toEqual({ addedTopicIds: [first] })

    expect(await readSubjectTopicRelationFacts(subject)).toMatchObject([
      {
        topicId: first,
        createdById: secondStage.id,
        votes: [{ userId: secondStage.id, score: 1 }],
      },
    ])
  })

  it('writes no relation and no vote for a negative or neutral result', async () => {
    const { fixture, secondStage, first, second, subject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.1 },
      { topicId: second, probability: 0.5 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, secondStage.id, [first, second], subject, addOnly),
    ).resolves.toEqual({ addedTopicIds: [] })

    expect(await readSubjectTopicRelationFacts(subject)).toEqual([])
  })

  it('leaves a tag the first stage applied exactly as it was, whatever the second stage answers', async () => {
    const { fixture, firstStage, secondStage, first, subject } = await createCase()
    const applied = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
    ])
    await applyDecisionRelationsForTest(applied, firstStage.id, [first])
    const before = await readSubjectTopicRelationFacts(subject)

    for (const probability of [0.9, 0.5, 0.1]) {
      const decision = await persistSubjectTopicDecision(fixture, subject, [
        { topicId: first, probability },
      ])
      await expect(
        applyDecisionRelationsForTest(decision, secondStage.id, [first], subject, addOnly),
      ).resolves.toEqual({ addedTopicIds: [] })
    }

    expect(await readSubjectTopicRelationFacts(subject)).toEqual(before)
    expect(before[0]?.votes).toEqual([{ userId: firstStage.id, score: 1 }])
  })

  it('leaves a person’s tag untouched', async () => {
    const { fixture, secondStage, human, first, subject } = await createCase()
    await createHumanTopicRelation(human, subject, first)
    const before = await readSubjectTopicRelationFacts(subject)
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, secondStage.id, [first], subject, addOnly),
    ).resolves.toEqual({ addedTopicIds: [] })

    expect(await readSubjectTopicRelationFacts(subject)).toEqual(before)
  })

  it('never brings back a tag someone deleted, though it still adds the other topics', async () => {
    const { fixture, secondStage, human, first, second, subject } = await createCase()
    await createHumanTopicRelation(human, subject, first)
    await softDeleteScoredPostTopicCategoryRelation(subject.postId, first, human.id)
    const before = await readSubjectTopicRelationFacts(subject)
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.9 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, secondStage.id, [first, second], subject, addOnly),
    ).resolves.toEqual({ addedTopicIds: [second] })

    const after = await readSubjectTopicRelationFacts(subject)
    expect(after.find(fact => fact.topicId === first)).toEqual(before[0])
    expect(await readLiveSubjectTopicIds(subject)).toEqual([second])
  })

  it('writes nothing new when the same decision is applied again', async () => {
    const { fixture, secondStage, first, subject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
    ])
    await applyDecisionRelationsForTest(decision, secondStage.id, [first], subject, addOnly)
    const before = await readSubjectTopicRelationFacts(subject)

    await expect(
      applyDecisionRelationsForTest(decision, secondStage.id, [first], subject, addOnly),
    ).resolves.toEqual({ addedTopicIds: [] })

    expect(await readSubjectTopicRelationFacts(subject)).toEqual(before)
  })
})
