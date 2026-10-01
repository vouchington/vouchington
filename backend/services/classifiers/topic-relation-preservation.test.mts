import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { getTopicElectionVote, upsertTopicElectionVotes } from '@services/elections-votes/topic'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  applyDecisionRelationsForTest,
  castHumanTopicRelationVote,
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
import { mergeTopicForTest, softDeleteTopic } from '../../test-helpers/entities/topics/deletion.mts'
import { setTestUserVoteWeight } from '../../test-helpers/entities/users-lifecycle.mts'
import { createSystemUser, createTestUser } from '../../test-helpers/entities/users.mts'

async function createCase() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  const [actor, human] = await Promise.all([
    createSystemUser(`classifier-relations-${uuidv7()}`),
    createTestUser(),
  ])
  const post = await createTestPost({ user: human })
  const [first, second] = (await Promise.all([createTestTopic({}), createTestTopic({})])).map(
    topic => topic.id,
  ) as [string, string]
  return {
    fixture,
    actor,
    human,
    first,
    second,
    subject: { postId: post.id, rssFeedItemId: null } as const,
  }
}

describe('applyTopicClassifierDecisionRelations preservation', () => {
  it('keeps the relation creator and every human relation and global vote unchanged', async () => {
    const { fixture, actor, human, first, subject } = await createCase()
    const relation = await createHumanTopicRelation(human, subject, first)
    await upsertTopicElectionVotes(human.id, [{ entityId: first, score: 1 }])
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
    ])

    await expect(applyDecisionRelationsForTest(decision, actor.id, [first])).resolves.toEqual({
      addedTopicIds: [first],
    })

    const [fact, ...rest] = await readSubjectTopicRelationFacts(subject)
    expect(rest).toEqual([])
    expect(fact).toMatchObject({
      id: relation.id,
      createdById: human.id,
      deletedAt: null,
      votes: [
        { userId: human.id, score: 1 },
        { userId: actor.id, score: 1 },
      ],
    })
    await expect(getTopicElectionVote(human.id, first)).resolves.toMatchObject({ choice: 'like' })
    await expect(getTopicElectionVote(actor.id, first)).resolves.toBeNull()
  })

  it('does not report a positive result whose relation stays net negative from human votes', async () => {
    const { fixture, actor, human, first, subject } = await createCase()
    const relation = await createHumanTopicRelation(human, subject, first)
    await setTestUserVoteWeight(human.id, 50)
    await castHumanTopicRelationVote(human.id, subject, relation.id, -1)
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
    ])

    await expect(applyDecisionRelationsForTest(decision, actor.id, [first])).resolves.toEqual({
      addedTopicIds: [],
    })

    const [fact] = await readSubjectTopicRelationFacts(subject)
    expect(fact?.netScore).toBeLessThan(0)
    expect(fact?.votes).toEqual([
      { userId: human.id, score: 1 },
      { userId: human.id, score: -1 },
      { userId: actor.id, score: 1 },
    ])
  })

  it('never resurrects a soft-deleted relation, though it still tags the other topics', async () => {
    const { fixture, actor, human, first, second, subject } = await createCase()
    await createHumanTopicRelation(human, subject, first)
    await softDeleteScoredPostTopicCategoryRelation(subject.postId, first, human.id)
    const before = await readSubjectTopicRelationFacts(subject)
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.9 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, actor.id, [first, second]),
    ).resolves.toEqual({ addedTopicIds: [second] })

    const after = await readSubjectTopicRelationFacts(subject)
    expect(after.find(fact => fact.topicId === first)).toEqual(before[0])
    expect(after.find(fact => fact.topicId === first)?.deletedAt).not.toBeNull()
    expect(await readLiveSubjectTopicIds(subject)).toEqual([second])
  })

  it('writes nothing new when the same decision is applied again', async () => {
    const { fixture, actor, first, second, subject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.1 },
    ])
    await applyDecisionRelationsForTest(decision, actor.id, [first, second])
    const before = await readSubjectTopicRelationFacts(subject)

    await applyDecisionRelationsForTest(decision, actor.id, [first, second])
    await applyDecisionRelationsForTest(decision, actor.id, [first, second])

    expect(await readSubjectTopicRelationFacts(subject)).toEqual(before)
    expect(before).toHaveLength(1)
    expect(before[0]?.votes).toEqual([{ userId: actor.id, score: 1 }])
  })

  it('skips topics that were deleted or merged away after the decision, without redirecting', async () => {
    const { fixture, actor, human, first, second, subject } = await createCase()
    const third = (await createTestTopic({})).id
    const target = (await createTestTopic({})).id
    await softDeleteTopic(first, human.id)
    await mergeTopicForTest(second, target, human.id)
    const decision = await persistSubjectTopicDecision(fixture, subject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.9 },
      { topicId: third, probability: 0.9 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, actor.id, [first, second, third]),
    ).resolves.toEqual({ addedTopicIds: [third] })

    expect(await readLiveSubjectTopicIds(subject)).toEqual([third])
  })
})
