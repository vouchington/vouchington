import { describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  addRssFeedItemSource,
  addCategoryToRssFeedItem,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestUser,
  createTopHashtagAliasForTest,
  followTopic,
  insertScoredPostTopicCategoryRelation,
  insertTestDataPoint,
  insertTestReview,
  insertTestTopic,
  mergeTopicForTest,
  refreshTestTopicBookmarkStats,
  setTopicBestSortInputs,
} from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { getTopicMetricsByAnyBatch } from '../metrics-batch.mts'

describe('getTopicMetricsByAnyBatch set-based metrics', () => {
  it('returns exact requested-topic metrics across every count source', async () => {
    const suffix = randomUUID()
    const author = (await createTestUser()) as PrivateUser
    const follower = (await createTestUser()) as PrivateUser
    const populatedTopicId = await insertTestTopic({
      name: `Batch metrics populated ${suffix}`,
      slug: `batch-metrics-populated-${suffix}`,
      createdById: author.id,
    })
    const emptyTopicId = await insertTestTopic({
      name: `Batch metrics empty ${suffix}`,
      slug: `batch-metrics-empty-${suffix}`,
      createdById: author.id,
    })
    const duplicateSourceTopicId = await insertTestTopic({
      name: `Batch metrics duplicate source ${suffix}`,
      slug: `batch-metrics-duplicate-source-${suffix}`,
      createdById: author.id,
    })

    const discussion = await createTestPost({ user: author, post_type: 'discussion' })
    await insertScoredPostTopicCategoryRelation(discussion.id, populatedTopicId, author.id)
    await insertTestReview({
      userId: author.id,
      topicRatings: [{ topicId: populatedTopicId, rating: 4 }],
    })
    await insertTestDataPoint({
      title: `Batch metrics data point ${suffix}`,
      slug: `batch-metrics-data-point-${suffix}`,
      createdById: author.id,
      topicId: populatedTopicId,
    })

    const primaryFeedId = await createTestRssFeedWithTiming(populatedTopicId)
    const duplicateSourceFeedId = await createTestRssFeedWithTiming(duplicateSourceTopicId)
    const item = await createTestRssFeedItemWithUrl(primaryFeedId)
    await addCategoryToRssFeedItem(item.id, populatedTopicId, `batch-metrics-${suffix}`)
    await addRssFeedItemSource(duplicateSourceFeedId, item.id)
    await setTopicBestSortInputs(populatedTopicId, 4)
    await followTopic(follower, { id: populatedTopicId })
    await refreshTestTopicBookmarkStats(populatedTopicId)

    const [populated, empty] = await getTopicMetricsByAnyBatch([populatedTopicId, emptyTopicId])

    expect(populated).toMatchObject({
      __entity_type: 'topic_metrics',
      id: populatedTopicId,
      count: {
        discussions: 1,
        reviews: 1,
        'data-points': 1,
        news: 1,
        latest: 1,
      },
      ratings: { count: { '1': 0, '2': 0, '3': 0, '4': 4, '5': 0 } },
      bookmarks: { follow: 1 },
    })
    expect(populated?.ratings__updated_at).toBeInstanceOf(Date)
    expect(populated?.bookmarks__updated_at).toBeInstanceOf(Date)
    expect(empty).toMatchObject({
      id: emptyTopicId,
      count: { discussions: 0, reviews: 0, 'data-points': 0, news: 0, latest: 0 },
    })
  })

  it('resolves merged aliases and scatters duplicate and missing mixed identifiers', async () => {
    const suffix = randomUUID()
    const author = (await createTestUser()) as PrivateUser
    const sourceSlug = `batch-metrics-source-${suffix}`
    const destinationSlug = `batch-metrics-destination-${suffix}`
    const alias = `batch-metrics-alias-${suffix}`
    const sourceTopicId = await insertTestTopic({
      name: `Batch metrics source ${suffix}`,
      slug: sourceSlug,
      createdById: author.id,
    })
    const destinationTopicId = await insertTestTopic({
      name: `Batch metrics destination ${suffix}`,
      slug: destinationSlug,
      createdById: author.id,
    })
    await createTopHashtagAliasForTest(sourceTopicId, alias)
    await mergeTopicForTest(sourceTopicId, destinationTopicId, author.id)

    const results = await getTopicMetricsByAnyBatch([
      sourceTopicId,
      alias,
      destinationSlug,
      randomUUID(),
      alias,
    ])

    expect(results.map(result => result?.id ?? null)).toEqual([
      destinationTopicId,
      destinationTopicId,
      destinationTopicId,
      null,
      destinationTopicId,
    ])
  })
})
