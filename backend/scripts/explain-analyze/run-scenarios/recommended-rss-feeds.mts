import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { registerScenarioContract, type ScenarioPlanContract } from '../plan-expectations.mts'
import { getRecommendedRssFeeds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import {
  cleanupRecommendedRssFeedsPopularFeed,
  pinRecommendedRssFeedsFollowsVisibility,
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
}
