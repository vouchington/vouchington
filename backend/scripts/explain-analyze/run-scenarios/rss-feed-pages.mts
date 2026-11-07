import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '@services/feeds/types'
import { getRssFeedItemFeedIds } from '@services/feeds'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { RSS_FEED_ITEM_SEED_COUNT } from '../seed-data/common.mts'
import { RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT } from '../seed-data/rss-feed-weekly-workload.mts'

const RSS_FEED_SEEDED_ITEM_ROWS = RSS_FEED_ITEM_SEED_COUNT + RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT + 1

const feedPageExpectations = [
  { kind: 'custom', name: 'rssFeedPageWorkload' },
  {
    kind: 'maxProcessedRows',
    relation: 'rss_feed_item_sources',
    max: RSS_FEED_SEEDED_ITEM_ROWS * 3,
  },
  { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: RSS_FEED_SEEDED_ITEM_ROWS * 2 },
  {
    kind: 'maxProcessedRows',
    relation: 'rss_feed_item_categories',
    max: RSS_FEED_SEEDED_ITEM_ROWS * 2,
  },
] as const

export function registerRssFeedPageScenario(scenarioId: string, allowEmptyResult = false): void {
  registerScenarioContract(scenarioId, {
    expectations: feedPageExpectations,
    allowEmptyResult,
    crossPartition: {
      rss_feed_items: 'The personalized feed ranks source and topic matches within seven days.',
    },
  })
}

export async function runRssFeedFirstAndContinuationScenarios(
  scenarioId: string,
  user: PrivateUser,
  options: RssFeedItemFeedOptions,
  suffix?: string,
): Promise<void> {
  let first: RssFeedItemFeedResponse | undefined
  registerRssFeedPageScenario(scenarioId)
  await runAndCapture(
    scenarioId,
    async () => {
      first = await getRssFeedItemFeedIds(user, options)
    },
    suffix,
  )
  const after = first?.page_info.end_cursor
  if (!first?.page_info.has_next_page || !after) {
    throw new Error(`${scenarioId} must contain a continuation page`)
  }
  const previousIds = new Set(first.results.map(row => row.id))
  const previousDirectStories = new Set(
    first.results
      .filter(row => row.delivery_type === 'direct' && row.story_id)
      .map(row => row.story_id),
  )
  registerRssFeedPageScenario(`${scenarioId}-after`)
  await runAndCapture(
    `${scenarioId}-after`,
    async () => {
      const next = await getRssFeedItemFeedIds(user, { ...options, after })
      if (
        !next.results.length ||
        next.results.some(
          row =>
            previousIds.has(row.id) ||
            (row.delivery_type === 'direct' &&
              row.story_id &&
              previousDirectStories.has(row.story_id)),
        )
      ) {
        throw new Error(`${scenarioId} continuation must contain new canonical deliveries`)
      }
    },
    suffix,
  )
}
