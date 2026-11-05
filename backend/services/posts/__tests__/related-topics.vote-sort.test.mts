import { describe, expect, it } from 'vitest'
import { createTestUser, createTestTopic, insertTestPost } from '@voucha/test-helpers'
import { insertPostRelatedTopicRankingFixture } from '../../../test-helpers/post-related-topic-ranking.mts'
import { getPostsByAnyBatch } from '../get-batch.mts'

describe('post related topic ranking', () => {
  it('orders eligible topics by Wilson score and deterministic ties at the five-topic boundary', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2)
    const postId = await insertTestPost({
      title: `Related topic ranking ${suffix}`,
      slug: `related-topic-ranking-${suffix}`,
      markdown: 'Related topic ranking fixture',
      createdById: user.id,
    })
    const topics = await Promise.all(Array.from({ length: 7 }, () => createTestTopic({ user })))
    const [wilson, net, newerTie, ...rest] = topics.map(topic => topic.id)
    const [tieA, tieB, tieC, negative] = rest
    await insertPostRelatedTopicRankingFixture(postId, [
      { topicId: wilson!, up: 5, down: 0, createdAt: '2026-01-01T00:00:00Z' },
      { topicId: net!, up: 100, down: 90, createdAt: '2026-01-01T00:00:00Z' },
      { topicId: newerTie!, up: 1, down: 0, createdAt: '2026-01-02T00:00:00Z' },
      ...[tieA!, tieB!, tieC!].map(topicId => ({
        topicId,
        up: 1,
        down: 0,
        createdAt: '2026-01-01T00:00:00Z',
      })),
      { topicId: negative!, up: 0, down: 1, createdAt: '2026-01-03T00:00:00Z' },
    ])
    const [post] = await getPostsByAnyBatch([postId])
    expect(post?.post_related_topics?.map(topic => topic.id)).toEqual([
      wilson,
      net,
      newerTie,
      ...[tieA!, tieB!, tieC!].toSorted().toReversed().slice(0, 2),
    ])
  })
})
