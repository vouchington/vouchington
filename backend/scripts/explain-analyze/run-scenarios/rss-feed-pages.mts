import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '@services/feeds/types'
import { getRssFeedItemFeedIds } from '@services/feeds'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { rssFeedItemPageMaxima } from '@services/feeds/rss-feed-items/feed-page-config'

const MAX_SOURCE_ITEM_ROWS =
  rssFeedItemPageMaxima.source_limit * rssFeedItemPageMaxima.items_per_source
const MAX_TOPIC_SOURCE_PROBES = 10_000
const MAX_ELIGIBILITY_CHILD_ROWS = rssFeedItemPageMaxima.eligibility_child_limit
const MAX_SOURCE_CHILD_READS =
  MAX_SOURCE_ITEM_ROWS + MAX_SOURCE_ITEM_ROWS * (2 * MAX_ELIGIBILITY_CHILD_ROWS + 1)
const MAX_TOPIC_CANDIDATE_ROWS =
  MAX_SOURCE_ITEM_ROWS +
  MAX_TOPIC_SOURCE_PROBES +
  MAX_SOURCE_ITEM_ROWS * (2 * MAX_ELIGIBILITY_CHILD_ROWS + 1)
const MAX_STORY_PRIORITY_ROWS = MAX_SOURCE_ITEM_ROWS * rssFeedItemPageMaxima.story_item_limit
const MAX_PUBLISHER_TYPE_ROWS =
  MAX_SOURCE_ITEM_ROWS * MAX_ELIGIBILITY_CHILD_ROWS * (2 * MAX_ELIGIBILITY_CHILD_ROWS + 1)

function feedCandidateExpectations(feedType?: RssFeedItemFeedOptions['feed_type']) {
  return [
    { kind: 'custom', name: 'rssFeedCandidates' },
    ...(feedType === 'follow_topics'
      ? []
      : [
          { kind: 'usesIndexes' as const, indexes: ['idx_rss_feeds__live_activity_lookup'] },
          { kind: 'usesIndexes' as const, indexes: ['idx_rss_feed_item_sources__item_sort'] },
          {
            kind: 'maxProcessedRows' as const,
            relation: 'relation__user__follow__rss_feed',
            max: 10_000,
          },
          { kind: 'maxProcessedRows' as const, relation: 'rss_feeds', max: 10_000 },
        ]),
    ...(feedType === 'follow_rss_feeds'
      ? []
      : [
          {
            kind: 'usesIndexes' as const,
            indexes: ['idx_rss_feed_item_topic_candidates__topic_order'],
          },
          {
            kind: 'maxProcessedRows' as const,
            relation: 'relation__user__follow__topic',
            max: 10_000,
          },
        ]),
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feed_item_sources',
      max: MAX_SOURCE_CHILD_READS,
    },
    { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: MAX_SOURCE_ITEM_ROWS },
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feed_item_topic_candidates',
      max: MAX_TOPIC_CANDIDATE_ROWS,
    },
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feed_item_feed_candidates',
      max: MAX_STORY_PRIORITY_ROWS,
    },
    {
      kind: 'maxProcessedRows',
      relation: 'relation__topic__publisher_type__topic',
      max: MAX_PUBLISHER_TYPE_ROWS,
    },
  ] as const
}

export function registerRssFeedCandidateScenario(
  scenarioId: string,
  feedType?: RssFeedItemFeedOptions['feed_type'],
): void {
  registerScenarioContract(scenarioId, {
    expectations: feedCandidateExpectations(feedType),
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
  registerRssFeedCandidateScenario(scenarioId, options.feed_type)
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
  registerRssFeedCandidateScenario(`${scenarioId}-after`, options.feed_type)
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
