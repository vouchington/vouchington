import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { applyFactRelationsForTest } from '../../test-helpers/data-stores/psql/classifier-runs/fact-relations.mts'
import {
  createHumanTopicRelation,
  readLiveSubjectTopicIds,
  readSubjectTopicRelationFacts,
} from '../../test-helpers/data-stores/psql/classifier-runs/subject-topic-relations.mts'
import {
  createTestPost,
  createTestTopic,
} from '../../test-helpers/entities/create-test-entities.mts'
import { softDeleteScoredPostTopicCategoryRelation } from '../../test-helpers/entities/entity-relations-posts.mts'
import { softDeleteTopic } from '../../test-helpers/entities/topics/deletion.mts'
import { createSystemUser, createTestUser } from '../../test-helpers/entities/users.mts'

async function createCase() {
  const [agent, human] = await Promise.all([
    createSystemUser(`fact-agent-${uuidv7()}`),
    createTestUser(),
  ])
  const post = await createTestPost({ user: human })
  const [first, second, third] = (
    await Promise.all([createTestTopic({}), createTestTopic({}), createTestTopic({})])
  ).map(topic => topic.id) as [string, string, string]
  return {
    agent,
    human,
    first,
    second,
    third,
    candidates: [first, second, third],
    subject: { postId: post.id, rssFeedItemId: null } as const,
  }
}

describe('applyTopicFactRelations (real PG)', () => {
  it('adds each reported topic with only the actor’s +1 vote, and nothing for the others', async () => {
    const { agent, first, second, candidates, subject } = await createCase()

    await expect(
      applyFactRelationsForTest(agent.id, [first], candidates, subject),
    ).resolves.toEqual({ addedTopicIds: [first] })

    expect(await readSubjectTopicRelationFacts(subject)).toMatchObject([
      { topicId: first, createdById: agent.id, votes: [{ userId: agent.id, score: 1 }] },
    ])
    expect(await readLiveSubjectTopicIds(subject)).not.toContain(second)
  })

  it('writes nothing when the agent reported no topic', async () => {
    const { agent, candidates, subject } = await createCase()

    await expect(applyFactRelationsForTest(agent.id, [], candidates, subject)).resolves.toEqual({
      addedTopicIds: [],
    })

    expect(await readSubjectTopicRelationFacts(subject)).toEqual([])
  })

  it('leaves a person’s tag untouched and never brings back a deleted one', async () => {
    const { agent, human, first, second, third, candidates, subject } = await createCase()
    await createHumanTopicRelation(human, subject, first)
    await createHumanTopicRelation(human, subject, second)
    await softDeleteScoredPostTopicCategoryRelation(subject.postId, second, human.id)
    const before = await readSubjectTopicRelationFacts(subject)

    await expect(
      applyFactRelationsForTest(agent.id, [first, second, third], candidates, subject),
    ).resolves.toEqual({ addedTopicIds: [third] })

    const after = await readSubjectTopicRelationFacts(subject)
    expect(after.find(fact => fact.topicId === first)).toEqual(
      before.find(fact => fact.topicId === first),
    )
    expect(after.find(fact => fact.topicId === second)).toEqual(
      before.find(fact => fact.topicId === second),
    )
    expect(await readLiveSubjectTopicIds(subject)).toEqual([first, third].toSorted())
  })

  it('skips a topic that was deleted after the run captured it', async () => {
    const { agent, human, first, second, candidates, subject } = await createCase()
    await softDeleteTopic(first, human.id)

    await expect(
      applyFactRelationsForTest(agent.id, [first, second], candidates, subject),
    ).resolves.toEqual({ addedTopicIds: [second] })
  })

  it('writes nothing new when the same facts are applied again', async () => {
    const { agent, first, candidates, subject } = await createCase()
    await applyFactRelationsForTest(agent.id, [first], candidates, subject)
    const before = await readSubjectTopicRelationFacts(subject)

    await expect(
      applyFactRelationsForTest(agent.id, [first], candidates, subject),
    ).resolves.toEqual({ addedTopicIds: [] })

    expect(await readSubjectTopicRelationFacts(subject)).toEqual(before)
  })

  it('refuses a topic outside the run’s candidates', async () => {
    const { agent, first, second, subject } = await createCase()

    await expect(applyFactRelationsForTest(agent.id, [second], [first], subject)).rejects.toThrow(
      'outside the run candidates',
    )
  })

  it('refuses an actor that is not a system user', async () => {
    const { human, first, subject } = await createCase()

    await expect(applyFactRelationsForTest(human.id, [first], [first], subject)).rejects.toThrow(
      'require a system actor',
    )
  })
})
