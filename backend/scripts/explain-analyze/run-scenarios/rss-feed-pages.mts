import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '@services/feeds/types'
import { getRssFeedItemFeedIds } from '@services/feeds'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

// Fixed-corpus ceilings include both prepared plan modes and cursor pages. They
// deliberately catch a return to full item materialization instead of multiplying
// every independent production hard maximum into a vacuous global allowance.
const MAX_FEED_FOLLOW_ROWS = 1_000
// Generic plans may hash the capped topic follows for both stable-match sites.
const MAX_TOPIC_FOLLOW_ROWS = 31_000
const MAX_PROXY_COMMUNITY_ROWS = 512
const MAX_COMMUNITY_LIST_ROWS = 512
const MAX_PAGE_ITEM_LIMIT = 100
const MAX_SOURCE_TABLE_ROWS = 4_000
const MAX_TOPIC_CANDIDATE_ROWS = 4_000
const MAX_RSS_FEED_ROWS = 1_500
const MAX_RSS_FEED_ITEM_ROWS = 1_200
const MAX_STORY_PROBE_ROWS = 512
const MAX_PUBLISHER_TYPE_ROWS = 3_000

function feedCandidateExpectations(feedType?: RssFeedItemFeedOptions['feed_type']) {
  return [
    { kind: 'custom', name: 'rssFeedCandidates' },
    ...(feedType === 'follow_topics'
      ? []
      : [
          { kind: 'usesIndexes' as const, indexes: ['idx_rss_feed_item_sources__item_sort'] },
          {
            kind: 'maxProcessedRows' as const,
            relation: 'relation__user__follow__rss_feed',
            max: MAX_FEED_FOLLOW_ROWS,
          },
          {
            kind: 'maxProcessedRows' as const,
            relation: 'community_list_rss_feeds',
            max: MAX_COMMUNITY_LIST_ROWS,
          },
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
            max: MAX_TOPIC_FOLLOW_ROWS,
          },
          {
            kind: 'maxProcessedRows' as const,
            relation: 'community_list_topics',
            max: MAX_COMMUNITY_LIST_ROWS,
          },
        ]),
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feed_item_sources',
      max: MAX_SOURCE_TABLE_ROWS,
    },
    {
      kind: 'maxProcessedRows',
      relation: 'relation__user__proxy_follow__community',
      max: MAX_PROXY_COMMUNITY_ROWS,
    },
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feeds',
      max: MAX_RSS_FEED_ROWS,
    },
    { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: MAX_RSS_FEED_ITEM_ROWS },
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feed_item_topic_candidates',
      max: MAX_TOPIC_CANDIDATE_ROWS,
    },
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feed_item_feed_candidates',
      max: MAX_STORY_PROBE_ROWS,
    },
    {
      kind: 'usesIndexes',
      indexes: ['idx_rss_feed_item_feed_candidates__story_order'],
    },
    {
      kind: 'maxProcessedRows',
      relation: 'rss_feed_item_feed_shares',
      max: MAX_PAGE_ITEM_LIMIT + 1,
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
  allowEmptyResult = false,
): void {
  registerScenarioContract(scenarioId, {
    allowEmptyResult,
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
  validateContinuation?: (page: RssFeedItemFeedResponse) => void,
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
      validateContinuation?.(next)
    },
    suffix,
  )
}
