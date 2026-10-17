import { searchRssFeeds } from '../run-services.mts'
import { runAndCapture, seedParentTopicId, seedTopicId, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runRssFeedSearchScenarios(): Promise<void> {
  // Captured in both plan modes on the 2026-10-17 seed; caps allow 20% over the larger count.
  registerScenarioContract('rss-feed-search', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 90 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 30 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 60 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 36 },
    ],
  })
  const excludedFeedId = seedUuid(2499, '08')
  await runAndCapture('rss-feed-search', async () => {
    const feeds = await searchRssFeeds({ limit: 25 })
    if (feeds.some(feed => feed.id === excludedFeedId))
      throw new Error('Enabled RSS search returned the disabled seed feed')
  })

  registerScenarioContract('rss-feed-search-disabled', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 26 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 9 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 16 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 9 },
    ],
  })
  await runAndCapture('rss-feed-search-disabled', async () => {
    const feeds = await searchRssFeeds({ is_enabled: false, limit: 25 })
    if (!feeds.some(feed => feed.id === excludedFeedId))
      throw new Error('Disabled RSS search omitted the disabled seed feed')
  })

  registerScenarioContract('rss-feed-search-all-enable-states', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 90 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 30 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 60 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 36 },
    ],
  })
  await runAndCapture('rss-feed-search-all-enable-states', () =>
    searchRssFeeds({ is_enabled: null, limit: 25 }),
  )

  registerScenarioContract('rss-feed-text-search', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'custom', name: 'rssTextCandidates' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 194 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 30 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 30 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 30 },
    ],
  })
  await runAndCapture('rss-feed-text-search', async () => {
    const feeds = await searchRssFeeds({ text_search_query: 'Seed Feed 12', limit: 25 })
    if (!feeds.some(feed => feed.id === seedUuid(12, '08')))
      throw new Error('Text RSS search omitted a matching seed feed')
    if (feeds.some(feed => feed.id === seedUuid(13, '08')))
      throw new Error('Text RSS search returned a nonmatching seed feed')
  })

  registerScenarioContract('rss-feed-text-search-broad', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'custom', name: 'rssTextCandidates' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 3060 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 30 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 30 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 30 },
    ],
  })
  await runAndCapture('rss-feed-text-search-broad', () =>
    searchRssFeeds({ text_search_query: 'seed', limit: 25 }),
  )
}

export async function runRssFeedSearchScopeScenarios(): Promise<void> {
  registerScenarioContract('rss-feed-search-by-topic', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 4 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 2 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 2 },
    ],
  })
  await runAndCapture('rss-feed-search-by-topic', () =>
    searchRssFeeds({ topic_ids: [seedTopicId], limit: 25 }),
  )

  registerScenarioContract('rss-feed-search-by-topic-descendants', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 8 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 3 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 3 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 5 },
    ],
  })
  await runAndCapture('rss-feed-search-by-topic-descendants', () =>
    searchRssFeeds({ topic_ids: [seedParentTopicId], include_descendants: true, limit: 25 }),
  )

  registerScenarioContract('rss-feed-search-by-publisher-type', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 4 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 2 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 2 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 9 },
    ],
  })
  await runAndCapture('rss-feed-search-by-publisher-type', () =>
    searchRssFeeds({ publisher_type_ids: [seedTopicId], limit: 25 }),
  )

  registerScenarioContract('rss-feed-search-current-user', {
    expectations: [
      { kind: 'custom', name: 'rssStateProjection' },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 90 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 30 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 60 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 42 },
    ],
  })
  await runAndCapture('rss-feed-search-current-user', () =>
    searchRssFeeds({ current_user_id: seedUser.id, limit: 25 }),
  )
}
