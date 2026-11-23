import type { PrivateUser } from '@services/users/types'
import { captureFirstPageAndPageToEnd } from './rss-feed-page-to-end.mts'
import {
  RSS_FEED_WEEKLY_PROXY_RARE_MATCH_COUNT,
  RSS_FEED_WEEKLY_PROXY_VIEWER_ID,
} from '../seed-data/rss-feed-weekly-proxy.mts'
import { RSS_FEED_WEEKLY_WORKLOAD_RARE_TOKEN } from '../seed-data/rss-feed-weekly-workload.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

const SCENARIO_ID = 'rss-feed-item-feed-proxy-community-list-workload'

const proxyViewer = {
  __entity_type: 'user' as const,
  id: RSS_FEED_WEEKLY_PROXY_VIEWER_ID,
  username: 'seeduser19999',
  roles: [] as readonly string[],
} as PrivateUser

export async function runRssFeedWeeklyProxyScenario(): Promise<void> {
  registerScenarioContract(SCENARIO_ID, {
    expectations: [
      { kind: 'custom', name: 'rssFeedPageWorkload' },
      {
        kind: 'maxProcessedRows',
        relation: 'community_list_topics',
        max: RSS_FEED_WEEKLY_PROXY_RARE_MATCH_COUNT * 2,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'community_list_rss_feeds',
        max: RSS_FEED_WEEKLY_PROXY_RARE_MATCH_COUNT * 2,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'relation__user__proxy_follow__community',
        max: RSS_FEED_WEEKLY_PROXY_RARE_MATCH_COUNT * 4,
      },
    ],
    crossPartition: {
      rss_feed_items:
        'The proxy-list viewer reaches rare recent items through followed list topics.',
    },
  })
  const paged = await captureFirstPageAndPageToEnd(SCENARIO_ID, proxyViewer, {
    feed_type: 'any',
    time_range: 'all',
    text_search_query: RSS_FEED_WEEKLY_WORKLOAD_RARE_TOKEN,
    limit: 25,
  })
  if (paged.results.length !== RSS_FEED_WEEKLY_PROXY_RARE_MATCH_COUNT)
    throw new Error('Proxy-list RSS query must return its two topic-matched rare weekly items')
}
