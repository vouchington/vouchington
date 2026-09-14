import { it, expect, describe } from 'vitest'
import { getTopicMetricsByAnyBatch } from './metrics-batch.mts'
import {
  createTestUser,
  createTestPost,
  insertTestTopic,
  insertScoredPostTopicCategoryRelation,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  archivePostForTopHashtagTest,
  suspendTestUser,
  setTestPostClearanceStatus,
  insertTestCommunity,
} from '@voucha/test-helpers'
import { createTopic } from './create.mts'
import type { PrivateUser } from '@services/users/types'

describe('metrics-batch', () => {
  it('getTopicMetricsByAnyBatch returns empty array for empty input', async () => {
    const results = await getTopicMetricsByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getTopicMetricsByAnyBatch fetches multiple topic metrics by IDs in correct order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTopic(user, {
      slug: `test-metrics-1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: `Test Metrics Topic 1 ${random}`,
    })
    const topic2 = await createTopic(user, {
      slug: `test-metrics-2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: `Test Metrics Topic 2 ${random}`,
    })
    const topic3 = await createTopic(user, {
      slug: `test-metrics-3-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: `Test Metrics Topic 3 ${random}`,
    })
    // Fetch in specific order
    const results = await getTopicMetricsByAnyBatch([topic2.id, topic1.id, topic3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic2.id)
    expect(results[0]?.__entity_type).toBe('topic_metrics')
    expect(results[1]?.id).toBe(topic1.id)
    expect(results[1]?.__entity_type).toBe('topic_metrics')
    expect(results[2]?.id).toBe(topic3.id)
    expect(results[2]?.__entity_type).toBe('topic_metrics')
  })

  it('getTopicMetricsByAnyBatch fetches multiple topic metrics by slugs in correct order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug1 = `test-metrics-slug1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug2 = `test-metrics-slug2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug3 = `test-metrics-slug3-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTopic(user, {
      slug: slug1,
      topic_type: 'card',
      name: `Test Metrics Slug 1 ${random}`,
    })
    const topic2 = await createTopic(user, {
      slug: slug2,
      topic_type: 'card',
      name: `Test Metrics Slug 2 ${random}`,
    })
    const topic3 = await createTopic(user, {
      slug: slug3,
      topic_type: 'card',
      name: `Test Metrics Slug 3 ${random}`,
    })
    // Fetch in specific order using slugs
    const results = await getTopicMetricsByAnyBatch([slug2, slug1, slug3])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic2.id)
    expect(results[1]?.id).toBe(topic1.id)
    expect(results[2]?.id).toBe(topic3.id)
  })

  it('getTopicMetricsByAnyBatch returns null for non-existent IDs while preserving order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user, {
      slug: `test-metrics-null-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: `Test Metrics Null ${random}`,
    })
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const results = await getTopicMetricsByAnyBatch([topic.id, fakeId, topic.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic.id)
    expect(results[1]).toBeNull()
    expect(results[2]?.id).toBe(topic.id)
  })

  it('getTopicMetricsByAnyBatch returns correct metrics structure', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user, {
      slug: `test-metrics-struct-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: `Test Metrics Structure ${random}`,
    })
    const results = await getTopicMetricsByAnyBatch([topic.id])

    expect(results).toHaveLength(1)
    const metrics = results[0]
    expect(metrics).toBeDefined()
    expect(metrics?.__entity_type).toBe('topic_metrics')
    expect(metrics?.id).toBe(topic.id)
    expect(metrics?.count).toBeDefined()
    expect(metrics?.count.discussions).toBeDefined()
    expect(metrics?.count.reviews).toBeDefined()
    expect(metrics?.count['data-points']).toBeDefined()
    expect(metrics?.count.news).toBeDefined()
    expect(metrics?.count.latest).toBeDefined()
    expect(metrics?.ratings).toBeDefined()
    expect(metrics?.ratings.count).toBeDefined()
    expect(metrics?.ratings.count['1']).toBeDefined()
    expect(metrics?.ratings.count['2']).toBeDefined()
    expect(metrics?.ratings.count['3']).toBeDefined()
    expect(metrics?.ratings.count['4']).toBeDefined()
    expect(metrics?.ratings.count['5']).toBeDefined()
    expect(metrics?.bookmarks).toBeDefined()
    expect(metrics?.bookmarks.follow).toBeDefined()
  })

  it('getTopicMetricsByAnyBatch throws error for invalid identifiers', async () => {
    await expect(getTopicMetricsByAnyBatch(['invalid-identifier!@#'])).rejects.toThrow(
      'Invalid topic identifier',
    )
  })

  // Regression coverage for #11028: count__discussions used to read
  // view_public_post_eligibility unfiltered via a correlated EXISTS (... UNION ALL ...), which
  // the planner could not turn into a semijoin. The rewrite candidate-binds from the topic side
  // (direct relation__post__category__topic UNION ALL alias relation) before joining posts and
  // the eligibility view, deduplicating with an outer COUNT(DISTINCT posts.id). The dual-attached
  // fixture proves that dedup: without it, a post reachable via both branches of the UNION ALL
  // would be double-counted. The alias-only fixture proves the alias branch contributes on its
  // own -- without it, a broken/deleted alias branch would be invisible to this test, since the
  // dual-attached and direct-only fixtures alone would still total 2 via the direct branch. The
  // other fixtures prove each eligibility exclusion still applies to the rewritten subquery.
  it('getTopicMetricsByAnyBatch: count__discussions dedupes dual-attached posts and excludes ineligible ones', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const author = (await createTestUser()) as PrivateUser
    const suspendedAuthor = (await createTestUser()) as PrivateUser
    const topicId = await insertTestTopic({
      name: `Test Discussions Correctness ${random}`,
      slug: `test-discussions-correctness-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      createdById: author.id,
    })

    // Eligible, attached via BOTH the direct relation and an alias relation -- must count once.
    const dualAttachedPost = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(dualAttachedPost.id, topicId, author.id)
    const aliasId = await createTopHashtagAliasForTest(topicId, `dual-alias-${random}`)
    await createTopHashtagPostSourceForTest({
      postId: dualAttachedPost.id,
      topicAliasId: aliasId,
      userId: author.id,
      authoredToken: `#dual-alias-${random}`,
    })

    // Eligible, attached via the direct relation only.
    const directOnlyPost = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(directOnlyPost.id, topicId, author.id)

    // Eligible, attached via the alias relation only -- proves the alias branch of the
    // UNION ALL contributes to the count on its own, not just as a duplicate of the direct
    // branch (a broken/deleted alias branch would otherwise be invisible to this test).
    const aliasOnlyPost = await createTestPost({ user: author, post_type: 'discussion' })
    const aliasOnlyAliasId = await createTopHashtagAliasForTest(topicId, `alias-only-${random}`)
    await createTopHashtagPostSourceForTest({
      postId: aliasOnlyPost.id,
      topicAliasId: aliasOnlyAliasId,
      userId: author.id,
      authoredToken: `#alias-only-${random}`,
    })

    // Excluded: author has an un-lifted suspension.
    const suspendedAuthorPost = await createTestPost({
      user: suspendedAuthor,
      post_type: 'discussion',
    })
    await insertScoredPostTopicCategoryRelation(suspendedAuthorPost.id, topicId, author.id)
    await suspendTestUser(suspendedAuthor.id)

    // Excluded: moderation-flagged.
    const flaggedPost = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(flaggedPost.id, topicId, author.id)
    await setTestPostClearanceStatus(flaggedPost.id, 'in_review')

    // Excluded: archived.
    const archivedPost = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(archivedPost.id, topicId, author.id)
    await archivePostForTopHashtagTest(archivedPost.id, author.id)

    // Excluded: community post with no approved community_post_reviews row.
    const community = await insertTestCommunity({ createdById: author.id })
    const unapprovedCommunityPost = await createTestPost({
      user: author,
      post_type: 'discussion',
      community_id: community.id,
    })
    await insertScoredPostTopicCategoryRelation(unapprovedCommunityPost.id, topicId, author.id)

    const results = await getTopicMetricsByAnyBatch([topicId])

    expect(results).toHaveLength(1)
    expect(results[0]?.count.discussions).toBe(3)
  })
})
