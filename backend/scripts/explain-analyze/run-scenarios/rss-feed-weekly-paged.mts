import type { RssFeedItemFeedOptions } from '@services/feeds/types'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  rssFeedItemsWorkConfig,
  rssFeedItemsWorkMaxValues,
} from '@services/rss-feed-items/work-limits'
import { heavyFollowUser } from '../run-support.mts'
import { getRssFeedItemFeedIds } from '../run-services.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'
import {
  RSS_FEED_WEEKLY_STORY_ID,
  RSS_FEED_WEEKLY_STORY_TOKEN,
  RSS_FEED_WEEKLY_WORKLOAD_RARE_TOKEN,
} from '../seed-data/rss-feed-weekly-workload.mts'
import { captureFirstPageAndPageToEnd, pageRssFeedToEnd } from './rss-feed-page-to-end.mts'
import { registerRssFeedPageScenario } from './rss-feed-pages.mts'

/** Rare reads page to the end: a capped page may be short while later pages hold the matches. */
export async function runRssFeedWeeklyPagedScenarios(): Promise<void> {
  registerRssFeedPageScenario('rss-feed-item-feed-heavy-story-skew')
  const story = await captureFirstPageAndPageToEnd(
    'rss-feed-item-feed-heavy-story-skew',
    heavyFollowUser,
    {
      feed_type: 'all',
      limit: 25,
      time_range: '1w',
      text_search_query: RSS_FEED_WEEKLY_STORY_TOKEN,
    },
  )
  if (story.results.length !== 1 || story.results[0]?.story_id !== RSS_FEED_WEEKLY_STORY_ID)
    throw new Error('RSS story-skew scenario must return one canonical direct representative')
  registerRssFeedPageScenario('rss-feed-item-feed-weekly-selective-text')
  const selective = await captureFirstPageAndPageToEnd(
    'rss-feed-item-feed-weekly-selective-text',
    heavyFollowUser,
    {
      feed_type: 'all',
      limit: 25,
      time_range: 'all',
      text_search_query: RSS_FEED_WEEKLY_WORKLOAD_RARE_TOKEN,
    },
  )
  if (selective.results.length !== 2)
    throw new Error('Weekly selective RSS text search must find its two oldest in-window items')
  await assertCappedPagingMatchesHardMaximum()
}

/** Paging with the default cap must return the same ids in the same order as the hard maximum. */
export async function assertCappedPagingMatchesHardMaximum(): Promise<void> {
  const options: RssFeedItemFeedOptions = {
    feed_type: 'all',
    limit: 25,
    time_range: 'all',
    text_search_query: RSS_FEED_WEEKLY_WORKLOAD_RARE_TOKEN,
  }
  const read = (next: RssFeedItemFeedOptions) =>
    withSeedAnchorClock(() => getRssFeedItemFeedIds(heavyFollowUser, next))
  const capped = await pageRssFeedToEnd(await read(options), options, read)
  const restoreCap = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
    feed_candidate_inspection_cap: rssFeedItemsWorkMaxValues.feed_candidate_inspection_cap,
  })
  try {
    const wide = await pageRssFeedToEnd(await read(options), options, read)
    const cappedIds = capped.results.map(row => row.id)
    const wideIds = wide.results.map(row => row.id)
    if (JSON.stringify(cappedIds) !== JSON.stringify(wideIds))
      throw new Error(
        'Capped paging must return the same ids in the same order as the hard maximum',
      )
    if (wide.pages !== 1) throw new Error('A read at the hard maximum must end on its first page')
  } finally {
    restoreCap()
  }
}
