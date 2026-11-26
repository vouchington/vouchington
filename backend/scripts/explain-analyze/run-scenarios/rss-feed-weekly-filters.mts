import { seedUuid } from '../seed-data/common.mts'
import {
  RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT,
  RSS_FEED_WEEKLY_WORKLOAD_OUTSIDE_TOKEN,
} from '../seed-data/rss-feed-weekly-workload.mts'
import { heavyFollowUser, runAndCapture } from '../run-support.mts'
import { getRssFeedItemFeedIds } from '../run-services.mts'
import {
  registerRssFeedPageScenario,
  runRssFeedFirstAndContinuationScenarios,
} from './rss-feed-pages.mts'

export async function runRssFeedWeeklyFilterScenarios(): Promise<void> {
  await runRssFeedFirstAndContinuationScenarios(
    'rss-feed-item-feed-hashtag-topic-filter',
    heavyFollowUser,
    {
      feed_type: 'follow_rss_feeds',
      limit: 25,
      time_range: '1w',
      hashtag_topic_ids: [seedUuid(RSS_FEED_WEEKLY_WORKLOAD_SOURCE_COUNT - 1, '04')],
    },
  )
  for (const [scenarioId, time_range] of [
    ['rss-feed-item-feed-1m', '1m'],
    ['rss-feed-item-feed-1y', '1y'],
    ['rss-feed-item-feed-all-time', 'all'],
  ] as const) {
    await runRssFeedFirstAndContinuationScenarios(scenarioId, heavyFollowUser, {
      feed_type: 'all',
      limit: 25,
      time_range,
    })
    const outsideScenarioId = `${scenarioId}-outside-window`
    registerRssFeedPageScenario(outsideScenarioId, true)
    await runAndCapture(outsideScenarioId, async () => {
      const page = await getRssFeedItemFeedIds(heavyFollowUser, {
        feed_type: 'all',
        limit: 25,
        time_range,
        text_search_query: RSS_FEED_WEEKLY_WORKLOAD_OUTSIDE_TOKEN,
      })
      if (page.results.length !== 0 || page.page_info.has_next_page)
        throw new Error(
          `${time_range} RSS feed query included an item older than the seven-day horizon`,
        )
    })
  }
}
