import assert from 'node:assert/strict'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { getTrendingRssFeeds } from '@services/trending-rss-feeds/get-trending-rss-feeds'
import { updateRssFeedById } from '@services/rss-feeds/update'
import { createNativeTrendingFeed } from '../../test-helpers/native-trending-rss-feeds.mts'

const refreshTrendingFeeds = () => refreshMaterializedView('mv_trending_rss_feeds')

/** Real MV refresh and production service assertions moved from backend-data-stores Vitest. */
export async function checkTrendingServiceContracts(): Promise<void> {
  const highFeedId = await createNativeTrendingFeed(20)
  const lowFeedId = await createNativeTrendingFeed(10)
  await refreshTrendingFeeds()
  const ordered = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 5 })
  const orderedIds = ordered.results.map(row => row.id)
  const highIndex = orderedIds.indexOf(highFeedId)
  const lowIndex = orderedIds.indexOf(lowFeedId)
  assert.ok(highIndex >= 0)
  assert.ok(lowIndex >= 0)
  assert.ok(highIndex < lowIndex)

  const countedFeedId = await createNativeTrendingFeed(20)
  await refreshTrendingFeeds()
  const counted = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
  const countedFeed = counted.results.find(row => row.id === countedFeedId)
  assert.ok(countedFeed)
  assert.ok(countedFeed.follow_count >= 20)
  assert.equal(typeof countedFeed.item_count, 'number')

  await Promise.all([
    createNativeTrendingFeed(3),
    createNativeTrendingFeed(2),
    createNativeTrendingFeed(1),
  ])
  await refreshTrendingFeeds()
  const first = await getTrendingRssFeeds({ timeRange: 'week', limit: 1 })
  assert.equal(first.results.length, 1)
  assert.notEqual(first.page_info.end_cursor, null)
  const second = await getTrendingRssFeeds({
    timeRange: 'week',
    limit: 1,
    after: first.page_info.end_cursor!,
  })
  assert.notEqual(second.results[0]?.id, first.results[0]?.id)
  assert.ok(second.results[0]!.trending_score <= first.results[0]!.trending_score)

  const thresholdHighId = await createNativeTrendingFeed(10)
  const thresholdLowId = await createNativeTrendingFeed(1)
  await refreshTrendingFeeds()
  const threshold = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
  const thresholdIds = threshold.results.map(row => row.id)
  assert.ok(thresholdIds.includes(thresholdHighId))
  assert.ok(!thresholdIds.includes(thresholdLowId))

  const disabledId = await createNativeTrendingFeed(10)
  const hiddenId = await createNativeTrendingFeed(10)
  await updateRssFeedById(disabledId, { is_enabled: false, discoverable: true })
  await updateRssFeedById(hiddenId, { is_enabled: true, discoverable: false })
  await refreshTrendingFeeds()
  const visible = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
  const visibleIds = visible.results.map(row => row.id)
  assert.ok(!visibleIds.includes(disabledId))
  assert.ok(!visibleIds.includes(hiddenId))
}
