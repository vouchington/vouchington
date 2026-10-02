import { followTopicAsReader } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { captureAutotaggerAgentCandidatesForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-service-calls'
import {
  createAutotaggerFeedItemFixture,
  createAutotaggerPostFixture,
  createNearbyTopic,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { createHumanTopicRelation } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { createTestTopic } from '@voucha/test-helpers/entities/create-test-entities'
import { softDeleteScoredPostTopicCategoryRelation } from '@voucha/test-helpers/entities/entity-relations-posts'
import { mergeTopicForTest, softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { describe, expect, it } from 'vitest'
import {
  AUTOTAGGER_AGENT_MAX_CANDIDATES,
  captureAutotaggerAgentCandidateTopicIds,
} from './candidates.mts'

// The paying-follower pool is global, so parallel files add followed topics of their own. Every
// assertion is about the topics a test created: present, absent or ranked, never an exact list.

type Subject = Parameters<typeof captureAutotaggerAgentCandidateTopicIds>[1]

async function capture(fixture: { subject: Subject }): Promise<readonly string[]> {
  return (await captureAutotaggerAgentCandidatesForTest(fixture.subject)) ?? []
}

/** A topic next to the subject that one reader follows, so it is a candidate unless excluded. */
async function followedTopic(
  embedding: number[],
  follower: Parameters<typeof followTopicAsReader>[1] = {},
) {
  const topic = await createNearbyTopic(embedding)
  const user = await followTopicAsReader(topic.id, follower)
  return { topic, user }
}

describe('C7 candidate capture (real PG)', () => {
  it('has no candidates, so the run has no work, when the query finds no topic', async () => {
    const query = async () => ({ rows: [] })

    expect(
      await captureAutotaggerAgentCandidateTopicIds(query as never, {
        postId: null,
        rssFeedItemId: crypto.randomUUID(),
      }),
    ).toBeNull()
  })

  it.each(['plus', 'pro'] as const)('offers a topic a %s member follows', async plan => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const { topic } = await followedTopic(fixture.embedding, { plan })

    expect(await capture(fixture)).toContain(topic.id)
  })

  it.each([
    ['a follower with no membership', { plan: null }],
    ['a follower whose membership expired', { status: 'expired' as const }],
    ['a follower whose membership was cancelled', { status: 'cancelled' as const }],
    ['a paused membership', { status: 'paused' as const }],
    ['an administrator', { roles: ['administrator'] }],
    ['a moderator', { roles: ['moderator'] }],
    ['a developer', { roles: ['developer'] }],
    ['a system account', { system: true }],
    ['a deleted account', { deletedUser: true }],
    ['a removed follow', { deletedFollow: true }],
  ])('does not offer a topic only %s follows', async (_name, follower) => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const { topic } = await followedTopic(fixture.embedding, follower)

    expect(await capture(fixture)).not.toContain(topic.id)
  })

  it('offers a topic a paying member follows even when staff follow it too', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const { topic } = await followedTopic(fixture.embedding, { roles: ['moderator'] })
    await followTopicAsReader(topic.id)

    expect(await capture(fixture)).toContain(topic.id)
  })

  it('offers a topic once however many paying members follow it', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const { topic } = await followedTopic(fixture.embedding)
    await Promise.all([
      followTopicAsReader(topic.id),
      followTopicAsReader(topic.id, { plan: 'pro' }),
    ])

    expect((await capture(fixture)).filter(id => id === topic.id)).toHaveLength(1)
  })

  it('never offers a topic nobody follows, however close it is', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 3 })
    const { topic } = await followedTopic(fixture.embedding)

    const captured = await capture(fixture)

    expect(captured).toContain(topic.id)
    expect(fixture.topics.some(unfollowed => captured.includes(unfollowed.id))).toBe(false)
  })

  it('skips a deleted topic and a topic merged away', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const [deleted, merged, live] = await Promise.all([
      followedTopic(fixture.embedding),
      followedTopic(fixture.embedding),
      followedTopic(fixture.embedding),
    ])
    const target = await createTestTopic({})
    await softDeleteTopic(deleted.topic.id, deleted.user.id)
    await mergeTopicForTest(merged.topic.id, target.id, merged.user.id)

    const captured = await capture(fixture)

    expect(captured).toContain(live.topic.id)
    expect(captured).not.toContain(deleted.topic.id)
    expect(captured).not.toContain(merged.topic.id)
  })

  it('skips a topic the subject already has a live relation for', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const [applied, open] = await Promise.all([
      followedTopic(fixture.embedding),
      followedTopic(fixture.embedding),
    ])
    await createHumanTopicRelation(fixture.user, fixture.subject, applied.topic.id)

    const captured = await capture(fixture)

    expect(captured).toContain(open.topic.id)
    expect(captured).not.toContain(applied.topic.id)
  })

  it('skips a topic whose relation was deleted, because that tag was removed on purpose', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const [removed, open] = await Promise.all([
      followedTopic(fixture.embedding),
      followedTopic(fixture.embedding),
    ])
    await createHumanTopicRelation(fixture.user, fixture.subject, removed.topic.id)
    await softDeleteScoredPostTopicCategoryRelation(
      fixture.post.id,
      removed.topic.id,
      fixture.user.id,
    )

    const captured = await capture(fixture)

    expect(captured).toContain(open.topic.id)
    expect(captured).not.toContain(removed.topic.id)
  })

  it('offers nearest topics first and ranks a topic with no embedding last', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const far = await createNearbyTopic(fixture.embedding, 0.5)
    const near = await createNearbyTopic(fixture.embedding, 0.05)
    const nearest = await createNearbyTopic(fixture.embedding, 0.001)
    const unembedded = await createTestTopic({})
    await Promise.all([far, near, nearest, unembedded].map(topic => followTopicAsReader(topic.id)))

    const captured = await capture(fixture)

    expect(captured.slice(0, 3)).toEqual([nearest.id, near.id, far.id])
    const unembeddedRank = captured.indexOf(unembedded.id)
    expect(unembeddedRank === -1 || unembeddedRank > captured.indexOf(far.id)).toBe(true)
  })

  it('still offers followed topics when the subject has no embedding yet', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0, embedded: false })
    await followedTopic(fixture.embedding)

    expect((await capture(fixture)).length).toBeGreaterThan(0)
  })

  it(`bounds the list to the ${AUTOTAGGER_AGENT_MAX_CANDIDATES} nearest followed topics`, async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 0 })
    const topics = await Promise.all(
      Array.from({ length: AUTOTAGGER_AGENT_MAX_CANDIDATES + 2 }, (_, index) =>
        createNearbyTopic(fixture.embedding, 0.002 * 1.5 ** index),
      ),
    )
    await Promise.all(topics.map(topic => followTopicAsReader(topic.id)))

    expect(await capture(fixture)).toEqual(
      topics.slice(0, AUTOTAGGER_AGENT_MAX_CANDIDATES).map(topic => topic.id),
    )
  })

  it('offers followed topics for an RSS feed item the same way', async () => {
    const fixture = await createAutotaggerFeedItemFixture({ topicCount: 2 })
    const { topic } = await followedTopic(fixture.embedding)

    const captured = await capture(fixture)

    expect(captured).toContain(topic.id)
    expect(fixture.topics.some(unfollowed => captured.includes(unfollowed.id))).toBe(false)
  })
})
