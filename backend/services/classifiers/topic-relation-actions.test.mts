import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { getTopicElectionVote } from '@services/elections-votes/topic'
import { createClassifierFixture } from '../../test-helpers/data-stores/psql/classifiers.mts'
import {
  applyDecisionRelationsForTest,
  persistSubjectTopicDecision,
  readLiveSubjectTopicIds,
  readSubjectTopicRelationFacts,
} from '../../test-helpers/data-stores/psql/classifier-runs/subject-topic-relations.mts'
import {
  createTestPost,
  createTestTopic,
} from '../../test-helpers/entities/create-test-entities.mts'
import { createSystemUser, createTestUser } from '../../test-helpers/entities/users.mts'

async function createCase() {
  const fixture = await createClassifierFixture()
  await fixture.activateClassifierConfigurations()
  const actor = await createSystemUser(`classifier-relations-${uuidv7()}`)
  const topics = await Promise.all([createTestTopic({}), createTestTopic({}), createTestTopic({})])
  const [first, second, third] = topics.map(topic => topic.id) as [string, string, string]
  return {
    fixture,
    actor,
    first,
    second,
    third,
    postSubject: { postId: fixture.postId, rssFeedItemId: null } as const,
    itemSubject: { postId: null, rssFeedItemId: fixture.rssFeedItemId } as const,
  }
}

describe('applyTopicClassifierDecisionRelations', () => {
  it('tags the classified post with its own relations and the shared actor votes, not global votes', async () => {
    const { fixture, actor, first, second, postSubject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, postSubject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.8 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, actor.id, [first, second]),
    ).resolves.toEqual({ addedTopicIds: [first, second].toSorted() })

    const facts = await readSubjectTopicRelationFacts(postSubject)
    expect(facts.map(fact => fact.topicId)).toEqual([first, second].toSorted())
    for (const fact of facts) {
      expect(fact).toMatchObject({
        createdById: actor.id,
        deletedAt: null,
        votes: [{ userId: actor.id, score: 1 }],
      })
      expect(fact.netScore).toBeGreaterThan(0)
    }
    await expect(getTopicElectionVote(actor.id, first)).resolves.toBeNull()
    await expect(getTopicElectionVote(actor.id, second)).resolves.toBeNull()
  })

  it('tags a classified RSS feed item the same way', async () => {
    const { fixture, actor, first, second, itemSubject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, itemSubject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.1 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, actor.id, [first, second]),
    ).resolves.toEqual({ addedTopicIds: [first] })

    const facts = await readSubjectTopicRelationFacts(itemSubject)
    expect(facts).toMatchObject([
      { topicId: first, createdById: actor.id, votes: [{ userId: actor.id, score: 1 }] },
    ])
  })

  it('applies the same topic to unrelated subjects independently, whichever result arrives first', async () => {
    const { fixture, actor, first, postSubject } = await createCase()
    const otherPost = await createTestPost()
    const otherSubject = { postId: otherPost.id, rssFeedItemId: null } as const
    const older = await persistSubjectTopicDecision(
      fixture,
      postSubject,
      [{ topicId: first, probability: 0.9 }],
      uuidv7({ msecs: 1_000 }),
    )
    const newer = await persistSubjectTopicDecision(
      fixture,
      otherSubject,
      [{ topicId: first, probability: 0.9 }],
      uuidv7({ msecs: 2_000 }),
    )

    await expect(applyDecisionRelationsForTest(newer, actor.id, [first])).resolves.toEqual({
      addedTopicIds: [first],
    })
    await expect(applyDecisionRelationsForTest(older, actor.id, [first])).resolves.toEqual({
      addedTopicIds: [first],
    })

    expect(await readLiveSubjectTopicIds(postSubject)).toEqual([first])
    expect(await readLiveSubjectTopicIds(otherSubject)).toEqual([first])
  })

  it('leaves another subject relation unchanged when a later subject result is negative', async () => {
    const { fixture, actor, first, postSubject } = await createCase()
    const otherPost = await createTestPost()
    const otherSubject = { postId: otherPost.id, rssFeedItemId: null } as const
    const positive = await persistSubjectTopicDecision(fixture, postSubject, [
      { topicId: first, probability: 0.9 },
    ])
    const negative = await persistSubjectTopicDecision(fixture, otherSubject, [
      { topicId: first, probability: 0.1 },
    ])
    await applyDecisionRelationsForTest(positive, actor.id, [first])
    const before = await readSubjectTopicRelationFacts(postSubject)

    await expect(applyDecisionRelationsForTest(negative, actor.id, [first])).resolves.toEqual({
      addedTopicIds: [],
    })

    expect(await readSubjectTopicRelationFacts(postSubject)).toEqual(before)
    expect(await readSubjectTopicRelationFacts(otherSubject)).toEqual([])
  })

  it('creates relations only for positive results and reports exactly those topics', async () => {
    const { fixture, actor, first, second, third, postSubject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, postSubject, [
      { topicId: first, probability: 0.75 },
      { topicId: second, probability: 0.7501 },
      { topicId: third, probability: 0.25 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, actor.id, [first, second, third]),
    ).resolves.toEqual({ addedTopicIds: [second] })

    expect(await readLiveSubjectTopicIds(postSubject)).toEqual([second])
  })

  it('lets a neutral or negative result vote only on an existing relation without adding a topic', async () => {
    const { fixture, actor, first, second, postSubject } = await createCase()
    const seed = await persistSubjectTopicDecision(fixture, postSubject, [
      { topicId: first, probability: 0.9 },
      { topicId: second, probability: 0.9 },
    ])
    await applyDecisionRelationsForTest(seed, actor.id, [first, second])
    const revised = await persistSubjectTopicDecision(fixture, postSubject, [
      { topicId: first, probability: 0.5 },
      { topicId: second, probability: 0.1 },
    ])

    await expect(
      applyDecisionRelationsForTest(revised, actor.id, [first, second]),
    ).resolves.toEqual({ addedTopicIds: [] })

    const facts = await readSubjectTopicRelationFacts(postSubject)
    const scoresOf = (topicId: string) =>
      facts.find(fact => fact.topicId === topicId)?.votes.map(vote => vote.score)
    expect(scoresOf(first)).toEqual([1, 0])
    expect(scoresOf(second)).toEqual([1, -1])
  })

  it('rejects a decision for a different subject and a non-system actor before writing', async () => {
    const { fixture, actor, first, postSubject, itemSubject } = await createCase()
    const decision = await persistSubjectTopicDecision(fixture, postSubject, [
      { topicId: first, probability: 0.9 },
    ])

    await expect(
      applyDecisionRelationsForTest(decision, actor.id, [first], itemSubject),
    ).rejects.toThrow('Classifier topic relation application subject does not match the decision')
    const human = await createTestUser()
    await expect(applyDecisionRelationsForTest(decision, human.id, [first])).rejects.toThrow(
      'Classifier topic votes require a system actor',
    )

    expect(await readSubjectTopicRelationFacts(postSubject)).toEqual([])
    expect(await readSubjectTopicRelationFacts(itemSubject)).toEqual([])
  })
})
