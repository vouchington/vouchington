import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '@services/feeds/types'
import { getRssFeedItemFeedIds } from '@services/feeds'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  HOSTNAME_COUNT,
  RSS_FEED_ITEM_SEED_COUNT,
  RSS_FEED_SEED_COUNT,
} from '../seed-data/common.mts'

const feedCandidateExpectations = [
  { kind: 'custom', name: 'rssFeedCandidates' },
  {
    kind: 'maxProcessedRows',
    relation: 'rss_feed_item_sources',
    max: RSS_FEED_ITEM_SEED_COUNT * Math.ceil(RSS_FEED_SEED_COUNT / HOSTNAME_COUNT) * 3,
  },
  { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: RSS_FEED_ITEM_SEED_COUNT * 2 },
] as const

export function registerRssFeedCandidateScenario(scenarioId: string): void {
  registerScenarioContract(scenarioId, {
    expectations: feedCandidateExpectations,
    crossPartition: {
      rss_feed_items: 'The feed ranks recent matching items across the time window.',
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
  registerRssFeedCandidateScenario(scenarioId)
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
  registerRssFeedCandidateScenario(`${scenarioId}-after`)
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
