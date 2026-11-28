import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { registerScenarioContract, type ScenarioPlanContract } from '../plan-expectations.mts'
import { getRecommendedRssFeeds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  cleanupRecommendedRssFeedsHeavyFriendsAndTopics,
  cleanupRecommendedRssFeedsPopularFeed,
  pinRecommendedRssFeedsFollowsVisibility,
  RECOMMENDED_RSS_FEEDS_HEAVY_VIEWER_INDEX,
  seedRecommendedRssFeedsHeavyFriendsAndTopics,
  seedRecommendedRssFeedsPopularFeed,
  vacuumRecommendedRssFeedsFollows,
} from '../seed-data/recommended-rss-feeds.mts'

const queryName = 'getRecommendedRssFeeds'
const pageSize = 25
const recommendedFeedsContract: ScenarioPlanContract = {
  expectations: [
    // 10 seed follows × 25 co-followers × 20 follows plus the viewer and friends arms.
    { kind: 'maxProcessedRows', relation: 'relation__user__follow__rss_feed', max: 5_600 },
    {
      kind: 'usesIndexes',
      indexes: [
        'idx_relation__user__follow__rss_feed__subject__newest',
        'idx_relation__user__follow__rss_feed__object__newest',
      ],
    },
  ],
}
const heavyFriendsTopicsContract: ScenarioPlanContract = {
  expectations: [
    { kind: 'maxProcessedRows', relation: 'relation__user__follow__user', max: 150 },
    // 100 followed users × 20 feeds each plus viewer's own follows and small collaborative overlap.
    { kind: 'maxProcessedRows', relation: 'relation__user__follow__rss_feed', max: 2_600 },
    { kind: 'maxProcessedRows', relation: 'relation__user__follow__topic', max: 150 },
    { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 2_600 },
    { kind: 'maxProcessedRows', relation: 'users', max: 200 },
    {
      kind: 'usesIndexes',
      indexes: [
        'idx_relation__user__follow__user__subject__newest',
        'idx_relation__user__follow__rss_feed__subject__newest',
        'idx_relation__user__follow__topic__subject__newest',
        'idx_rss_feeds__topic_id__unique',
      ],
    },
    { kind: 'noSeqScan', relation: 'relation__user__follow__user' },
    { kind: 'noSeqScan', relation: 'relation__user__follow__rss_feed' },
    { kind: 'noSeqScan', relation: 'relation__user__follow__topic' },
    { kind: 'noSeqScan', relation: 'rss_feeds' },
    { kind: 'noSeqScan', relation: 'users' },
  ],
}

export async function runRecommendedRssFeedsScenarios(): Promise<void> {
  let lowVisibilityPage: Awaited<ReturnType<typeof getRecommendedRssFeeds>> | undefined
  await seedRecommendedRssFeedsPopularFeed()
  try {
    // Capture immediately after the follow burst, before vacuum can mark its heap pages visible.
    await write('/* analyzeRecommendedRssFeedsFollows */ ANALYZE relation__user__follow__rss_feed')
    await pinRecommendedRssFeedsFollowsVisibility(false)
    registerScenarioContract('recommended-rss-feeds-low-visibility', recommendedFeedsContract)
    await runAndCapture(
      'recommended-rss-feeds-low-visibility',
      async () => {
        lowVisibilityPage = await getRecommendedRssFeeds(seedUser.id, { limit: pageSize })
        assert.equal(lowVisibilityPage.results.length, pageSize)
        assert.equal(lowVisibilityPage.page_info.has_next_page, true)
        assert.ok(lowVisibilityPage.page_info.end_cursor)
      },
      undefined,
      queryName,
      { beforeExplain: () => pinRecommendedRssFeedsFollowsVisibility(false) },
    )

    await vacuumRecommendedRssFeedsFollows()
    await pinRecommendedRssFeedsFollowsVisibility(true)
    registerScenarioContract('recommended-rss-feeds', recommendedFeedsContract)
    await runAndCapture(
      'recommended-rss-feeds',
      async () => {
        const page = await getRecommendedRssFeeds(seedUser.id, { limit: pageSize })
        assert.deepEqual(page, lowVisibilityPage)
      },
      undefined,
      queryName,
      { beforeExplain: () => pinRecommendedRssFeedsFollowsVisibility(true) },
    )
  } finally {
    await cleanupRecommendedRssFeedsPopularFeed()
  }

  const heavyViewerId = seedUuid(RECOMMENDED_RSS_FEEDS_HEAVY_VIEWER_INDEX, '01')
  await seedRecommendedRssFeedsHeavyFriendsAndTopics()
  try {
    let firstPageCursor: string | undefined
    registerScenarioContract(
      'recommended-rss-feeds-heavy-friends-topics',
      heavyFriendsTopicsContract,
    )
    await runAndCapture(
      'recommended-rss-feeds-heavy-friends-topics',
      async () => {
        const page = await getRecommendedRssFeeds(heavyViewerId, { limit: pageSize })
        assert.equal(page.results.length, pageSize)
        assert.equal(page.page_info.has_next_page, true)
        assert.ok(page.page_info.end_cursor)
        firstPageCursor = page.page_info.end_cursor
      },
      undefined,
      queryName,
    )
    assert.ok(firstPageCursor, 'Heavy friends/topics first page must return a cursor')

    registerScenarioContract(
      'recommended-rss-feeds-heavy-friends-topics-cursor',
      heavyFriendsTopicsContract,
    )
    await runAndCapture(
      'recommended-rss-feeds-heavy-friends-topics-cursor',
      async () => {
        const page = await getRecommendedRssFeeds(heavyViewerId, {
          limit: pageSize,
          after: firstPageCursor,
        })
        assert.equal(page.results.length, pageSize)
        assert.equal(page.page_info.has_next_page, true)
        assert.ok(page.page_info.end_cursor)
      },
      undefined,
      queryName,
    )
  } finally {
    await cleanupRecommendedRssFeedsHeavyFriendsAndTopics()
  }
}
