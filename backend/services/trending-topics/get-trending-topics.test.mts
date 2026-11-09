import { describe, it, expect } from 'vitest'
import { getTrendingTopics } from './get-trending-topics.mts'
import {
  createTrendingTopicCursorBefore,
  createTrendingTopicData,
  createTrendingTopicsDataBatch,
} from '@voucha/test-helpers/entities/trending-topics'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { getTopicByAny } from '@services/topics/get'
import { refreshMaterializedViewForTest } from '../../test-helpers/refresh-materialized-view-for-test.mts'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const base = { limit: 100, minScore: 0 }
const posts = { rssItemTagCount: 0, netVote: 1 }

async function idsFrom(topicId: string, score: number, options = {}) {
  const result = await getTrendingTopics({
    ...base,
    timeRange: 'day',
    ...options,
    after: createTrendingTopicCursorBefore(topicId, score),
  })
  return result
}

describe('getTrendingTopics', () => {
  it('scores post tags by five and RSS tags by one from the refreshed view', async () => {
    const { topicId } = await createTrendingTopicData({
      postTagCount: 1,
      rssItemTagCount: 1,
      netVote: 1,
    })
    await refreshMaterializedViewForTest('mv_trending_topics')
    const { results } = await idsFrom(topicId, 6)
    expect(results[0]).toMatchObject({
      id: topicId,
      trending_score: 6,
      post_tag_count: 1,
      rss_item_tag_count: 1,
    })
  })

  it('places a tag in every window it falls inside', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS)
    const fortyDaysAgo = new Date(Date.now() - 40 * DAY_MS)
    const [aged, stale] = await createTrendingTopicsDataBatch([
      { postTagCount: 1, ...posts, createdAt: twoDaysAgo },
      { postTagCount: 1, ...posts, createdAt: fortyDaysAgo },
    ])
    await refreshMaterializedViewForTest('mv_trending_topics')
    const week = await idsFrom(aged!.topicId, 5, { timeRange: 'week', limit: 1 })
    const month = await idsFrom(aged!.topicId, 5, { timeRange: 'month', limit: 1 })
    const day = await idsFrom(aged!.topicId, 5, { timeRange: 'day', limit: 1 })
    expect(week.results.map(row => row.id)).toEqual([aged!.topicId])
    expect(month.results.map(row => row.id)).toEqual([aged!.topicId])
    expect(day.results.map(row => row.id)).not.toContain(aged!.topicId)
    const outside = await idsFrom(stale!.topicId, 5, { timeRange: 'month', limit: 1 })
    expect(outside.results.map(row => row.id)).not.toContain(stale!.topicId)
  })

  it('counts only tags with a positive net vote', async () => {
    const [positive, zero, negative] = await createTrendingTopicsDataBatch(
      [1, 0, -1].map(netVote => ({ postTagCount: 1, rssItemTagCount: 0, netVote })),
    )
    await refreshMaterializedViewForTest('mv_trending_topics')
    const ids = (await idsFrom(positive!.topicId, 5)).results.map(row => row.id)
    expect(ids).toContain(positive!.topicId)
    const all = (await getTrendingTopics({ ...base, timeRange: 'day', limit: 100 })).results
    expect(all.map(row => row.id)).not.toContain(zero!.topicId)
    expect(all.map(row => row.id)).not.toContain(negative!.topicId)
  })

  it('filters by minimum score', async () => {
    const [high, low] = await createTrendingTopicsDataBatch(
      [3, 1].map(postTagCount => ({ postTagCount, ...posts })),
    )
    await refreshMaterializedViewForTest('mv_trending_topics')
    const ids = (await idsFrom(high!.topicId, 15, { minScore: 6 })).results.map(r => r.id)
    expect(ids).toContain(high!.topicId)
    expect(ids).not.toContain(low!.topicId)
  })

  it('clamps non-positive limits to one row', async () => {
    const { topicId } = await createTrendingTopicData({ postTagCount: 1, ...posts })
    await refreshMaterializedViewForTest('mv_trending_topics')
    for (const limit of [0, -10]) {
      const result = await idsFrom(topicId, 5, { limit })
      expect(result.results.map(row => row.id)).toEqual([topicId])
    }
  })

  it('pages with a cursor and clamps the limit to one hundred', async () => {
    const { topicId, userId } = await createTrendingTopicData({ postTagCount: 1, ...posts })
    const more = await createTrendingTopicsDataBatch(
      Array.from({ length: 100 }, () => ({ postTagCount: 1, ...posts })),
      userId,
    )
    await refreshMaterializedViewForTest('mv_trending_topics')
    const owned = [topicId, ...more.map(row => row.topicId)].toSorted().toReversed()
    const first = await idsFrom(owned[0]!, 5, { limit: 999 })
    expect(first.results).toHaveLength(100)
    expect(first.results.map(row => row.id)).toEqual(owned.slice(0, 100))
    expect(first.page_info.has_next_page).toBe(true)
    const next = await getTrendingTopics({
      ...base,
      timeRange: 'day',
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(next.results[0]?.id).toBe(owned[100])
  })

  it('applies topic deletion and merges without waiting for a refresh', async () => {
    const { topicId } = await createTrendingTopicData({ postTagCount: 2, ...posts })
    await refreshMaterializedViewForTest('mv_trending_topics')
    expect((await idsFrom(topicId, 10, { limit: 1 })).results.map(row => row.id)).toEqual([topicId])
    const admin = await createTestUser({ administrator: true })
    const destination = await createTestTopic({ user: admin })
    const source = await getTopicByAny(topicId)
    const target = await getTopicByAny(destination.id)
    if (!source || !target) throw new Error('Test topics not found')
    await mergeTopicAliases(admin, source, target)
    expect((await idsFrom(topicId, 10, { limit: 1 })).results.map(row => row.id)).not.toContain(
      topicId,
    )
  })

  it('rejects an unknown time range', async () => {
    await expect(getTrendingTopics({ ...base, timeRange: 'year' as 'day' })).rejects.toMatchObject({
      status: 400,
    })
  })
})
